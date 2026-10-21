import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  chromium,
  expect,
  type Browser,
  type Page,
  type Response,
} from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { createDb, type Database } from "@codi-1/db";
import { hashPassword } from "@codi-1/auth";
import { account, session, user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { courses } from "@codi-1/db/schema/courses";
import {
  studentActivities,
  studentEnrollments,
} from "@codi-1/db/schema/student-profile";
import { lessonProgress } from "@codi-1/db/schema/learning";
import {
  studentStudyClocks,
  studentStudyDays,
} from "@codi-1/db/schema/study-activity";
import { createOnboardingService } from "../src/lib/onboarding-service";
import { seedAssessmentFixture } from "./assessment-fixture";

// Focused follow-up for PR144. No goal regeneration, AI client, fake timers,
// synthesized focus events, or backdated accounting rows are used.
async function main() {
  assert.ok(
    process.argv.includes("--allow-dev-db"),
    "Pass --allow-dev-db for isolated QA data.",
  );
  assert.ok(process.env.DATABASE_URL && process.env.NODE_ENV !== "production");
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  const origin = process.env.QA_ORIGIN ?? "http://localhost:3144";
  const out = resolve(
    process.env.QA_OUTPUT_DIR ??
      "../../docs/ui-review/issue-102/pr144-current-review",
  );
  await mkdir(out, { recursive: true });
  const userId = `study-qa-${randomUUID()}`;
  const email = `${userId}@example.invalid`,
    password = randomUUID();
  const courseId = `study-qa-course-${randomUUID()}`;
  const errors: string[] = [];
  const accounting: unknown[] = [],
    visual: unknown[] = [];
  const visualOnly = process.argv.includes("--visual-only");
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    origin,
    scope: visualOnly ? "header/mobile only" : "heartbeats and header/mobile",
  };
  let browser: Browser | undefined;
  let stage = "fixture";
  try {
    const fixture = await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        email,
        name: "QA Học viên",
        emailVerified: true,
      });
      await tx.insert(account).values({
        id: randomUUID(),
        userId,
        accountId: userId,
        providerId: "credential",
        password: await hashPassword(password),
      });
      await tx.insert(userRoles).values({ userId, roleId: "LEARNER" });
      const fixture = await seedAssessmentFixture(tx, courseId, [userId]);
      // These commands build the existing default order locally; neither generates AI.
      const onboarding = createOnboardingService(tx as unknown as Database);
      await onboarding.execute(userId, courseId, { type: "goal-skip" });
      await onboarding.execute(userId, courseId, { type: "fork-default" });
      const [enrollment] = await tx
        .select()
        .from(studentEnrollments)
        .where(eq(studentEnrollments.userId, userId));
      await tx.insert(lessonProgress).values({
        enrollmentId: enrollment!.id,
        lessonId: fixture.lessonId,
        status: "completed",
        completedAt: new Date(),
        studiedAt: new Date(),
      });
      return fixture;
    });
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH ?? chromium.executablePath(),
      headless: true,
    });
    report.browserVersion = browser.version();
    const context = await browser.newContext({
      baseURL: origin,
      viewport: { width: 1280, height: 800 },
      locale: "vi-VN",
    });
    context.on("page", (page) => {
      page.on("pageerror", (error) =>
        errors.push(`${stage}: ${error.stack ?? error.message}`),
      );
      page.on("response", (response) => {
        if (
          new URL(response.url()).origin === origin &&
          response.status() >= 400
        )
          errors.push(
            `${stage}: HTTP ${response.status()} ${new URL(response.url()).pathname}`,
          );
      });
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          /\/onboarding$|\/api\/ai(?:\/|$)|\/api\/github-profile/.test(
            new URL(request.url()).pathname,
          )
        )
          errors.push(`${stage}: unexpected generation/onboarding request`);
      });
    });
    const page = await context.newPage();
    stage = "real login";
    await page.goto("/login");
    await page.getByLabel("Địa chỉ Email").fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    const readClock = async () =>
      (
        await db
          .select()
          .from(studentStudyClocks)
          .where(eq(studentStudyClocks.userId, userId))
      )[0]!;
    const readSeconds = async () => {
      const [row] = await db
        .select({
          seconds: sql<number>`coalesce(sum(${studentStudyDays.seconds}), 0)::int`,
        })
        .from(studentStudyDays)
        .where(eq(studentStudyDays.userId, userId));
      return row!.seconds;
    };
    const activity = (response: Response, action: string) =>
      new URL(response.url()).pathname.endsWith("/activity") &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action === action;

    for (const sameLesson of visualOnly ? [] : [true, false]) {
      stage = `two tabs / delayed initial start / ${sameLesson ? "same" : "different"} lesson`;
      const tabA = await context.newPage(),
        tabB = await context.newPage();
      for (const tab of [tabA, tabB]) {
        // Playwright otherwise emulates focus for every tab. Real Chromium focus
        // must drive the application's existing blur/focus/visibility handlers.
        const cdp = await context.newCDPSession(tab);
        await cdp.send("Emulation.setFocusEmulationEnabled", {
          enabled: false,
        });
      }
      let release!: () => void, held!: () => void;
      const releasePromise = new Promise<void>((resolve) => {
        release = resolve;
      });
      const heldPromise = new Promise<void>((resolve) => {
        held = resolve;
      });
      const endpoint = `${origin}/api/learn/${courseId}/lessons/${fixture.lessonIds[1]}/activity`;
      await tabA.route(endpoint, async (route) => {
        if (route.request().postDataJSON()?.action === "start") {
          held();
          await releasePromise;
        }
        await route.continue();
      });
      try {
        const staleStart = tabA.waitForResponse((r) => activity(r, "start"), {
          timeout: 30_000,
        });
        const staleStop = tabA.waitForResponse((r) => activity(r, "stop"), {
          timeout: 30_000,
        });
        void staleStart.catch(() => {});
        void staleStop.catch(() => {});
        await tabA.bringToFront();
        await tabA.goto(`/learn/${courseId}/${fixture.lessonIds[1]}`);
        // Bound the wait without leaving a timer running after the route is held.
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            heldPromise,
            new Promise((_, reject) => {
              timeout = setTimeout(
                () => reject(new Error("A initial start was not held")),
                20_000,
              );
            }),
          ]);
        } finally {
          clearTimeout(timeout);
        }
        // Disable Playwright's emulation on the loaded documents as well.
        await (
          await context.newCDPSession(tabA)
        ).send("Emulation.setFocusEmulationEnabled", { enabled: false });
        const accepted = tabB.waitForResponse((r) => activity(r, "start"));
        void accepted.catch(() => {});
        await tabB.bringToFront();
        const lessonB = sameLesson ? fixture.lessonIds[1]! : fixture.lessonId;
        await tabB.goto(`/learn/${courseId}/${lessonB}`);
        await (
          await context.newCDPSession(tabB)
        ).send("Emulation.setFocusEmulationEnabled", { enabled: false });
        await tabB.bringToFront();
        const start = await accepted;
        assert.equal(start.status(), 200);
        assert.equal((await start.json()).recorded, true);
        assert.equal(
          await tabA.evaluate(() => document.hasFocus()),
          false,
          "A must actually lose focus",
        );
        assert.equal(
          await tabB.evaluate(() => document.hasFocus()),
          true,
          "B must actually gain focus",
        );
        const owner = await readClock(),
          baseline = await readSeconds();
        assert.equal(owner.lessonId, lessonB);
        assert.equal(owner.trackerId, start.request().postDataJSON().trackerId);
        release();
        assert.equal(
          (await (await staleStart).json()).recorded,
          false,
          "Stale initial start must be rejected",
        );
        assert.equal(
          (await (await staleStop).json()).recorded,
          false,
          "Stale queued stop must be rejected",
        );
        assert.deepEqual(await readClock(), owner);
        console.log(
          `Study QA: stale A start/stop rejected (${sameLesson ? "same" : "different"} lesson); waiting for two real 30s heartbeats.`,
        );
        const ticks = [];
        let previous = owner,
          previousSeconds = baseline;
        for (let tick = 1; tick <= 2; tick++) {
          const beat = await tabB.waitForResponse(
            (r) => activity(r, "heartbeat"),
            { timeout: 40_000 },
          );
          assert.equal(beat.status(), 200);
          assert.equal((await beat.json()).recorded, true);
          const current = await readClock(),
            seconds = await readSeconds();
          assert.equal(current.trackerId, owner.trackerId);
          assert.equal(current.lessonId, owner.lessonId);
          assert.ok(
            current.lastSeenAt && previous.lastSeenAt && owner.lastSeenAt,
          );
          const interval =
            current.lastSeenAt.getTime() - previous.lastSeenAt.getTime();
          assert.ok(
            interval >= 20_000 && interval <= 45_000,
            `real heartbeat interval: ${interval}ms`,
          );
          const expected =
            Math.floor(current.lastSeenAt.getTime() / 1000) -
            Math.floor(owner.lastSeenAt.getTime() / 1000);
          assert.equal(
            seconds - baseline,
            expected,
            "PostgreSQL credits the entire focused interval exactly once",
          );
          assert.ok(seconds > previousSeconds);
          assert.equal(await tabB.evaluate(() => document.hasFocus()), true);
          ticks.push({
            tick,
            intervalMs: interval,
            addedSeconds: seconds - previousSeconds,
            totalSinceStart: seconds - baseline,
            ownerPreserved: true,
            recorded: true,
          });
          console.log(
            `Study QA: ${sameLesson ? "same" : "different"} lesson heartbeat ${tick} credited ${seconds - previousSeconds}s; total ${seconds - baseline}s.`,
          );
          previous = current;
          previousSeconds = seconds;
        }
        const stopped = tabB.waitForResponse((r) => activity(r, "stop"));
        await tabB
          .getByRole("link", { name: "Về lộ trình", exact: true })
          .click();
        assert.equal((await (await stopped).json()).recorded, true);
        const stoppedClock = await readClock();
        assert.equal(stoppedClock.lastSeenAt, null);
        assert.equal(stoppedClock.trackerId, owner.trackerId);
        accounting.push({
          sameLesson,
          staleStartRecorded: false,
          staleStopRecorded: false,
          ticks,
          ownerStopRecorded: true,
        });
      } finally {
        release();
        await tabA.close();
        await tabB.close();
        await page.bringToFront();
      }
    }

    const screenshot = async (page: Page, name: string, fullPage = true) => {
      await page.evaluate(async () => {
        await document.fonts.ready;
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      });
      await page.screenshot({
        path: resolve(out, `${name}.png`),
        fullPage,
        animations: "disabled",
      });
    };
    for (const mobile of [false, true]) {
      for (const theme of ["light", "dark"]) {
        const variant = `${mobile ? "mobile" : "desktop"}-${theme}`;
        stage = `header and learner UI / ${variant}`;
        await page.setViewportSize(
          mobile ? { width: 375, height: 844 } : { width: 1280, height: 800 },
        );
        await page.evaluate(
          (value) => localStorage.setItem("theme", value),
          theme,
        );
        for (const route of ["dashboard", "progress", "profile"]) {
          await page.goto(`/${route}`);
          await expect(page.locator("html")).toHaveClass(
            new RegExp(`\\b${theme}\\b`),
          );
          if (route === "dashboard")
            await expect(
              page.getByRole("heading", { name: "Mục tiêu hàng tuần" }),
            ).toBeVisible();
          if (route === "progress")
            await expect(
              page.getByRole("tab", { name: /^Đang học/ }),
            ).toBeVisible();
          if (route === "profile") {
            await expect(
              page.getByText("QA Học viên", { exact: true }).first(),
            ).toBeVisible();
            await expect(
              page.getByRole("region", { name: /^Contribution heatmap for / }),
            ).toBeVisible();
            await expect(
              page.getByText(/^\d+ contributions in \d{4}$/),
            ).toBeVisible();
          }
          await expect(page.locator("[data-codi-intro-nav]")).toHaveAttribute(
            "aria-busy",
            "false",
          );
          await expect(
            page.getByRole("button", {
              name: "Mở menu tài khoản của QA Học viên",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.locator(
              "header [data-codi-intro-account] [data-slot='skeleton']",
            ),
          ).toHaveCount(0);
          await expect(
            page.getByRole("button", { name: /^Thông báo, \d+ chưa đọc$/ }),
          ).toBeVisible();
          await expect
            .poll(() =>
              page.evaluate(
                () => document.documentElement.scrollWidth - innerWidth,
              ),
            )
            .toBeLessThanOrEqual(0);
          const header = await page.getByRole("banner").boundingBox();
          assert.ok(header && header.width <= page.viewportSize()!.width);
          await screenshot(page, `${route}-${variant}`);
          visual.push({
            route,
            variant,
            overflow: false,
            headerWithinViewport: true,
            roleMenuReady: true,
          });
        }
        if (mobile) {
          await page
            .getByRole("button", { name: "Mở menu", exact: true })
            .click();
          const menu = page.getByRole("dialog", {
            name: "Menu Codi",
            exact: true,
          });
          await expect(
            menu.getByRole("link", { name: "Học tập của tôi", exact: true }),
          ).toBeVisible();
          await screenshot(page, `header-menu-${variant}`, false);
          await menu
            .getByRole("link", { name: "Học tập của tôi", exact: true })
            .click();
          await expect(menu).toHaveCount(0);
          await expect(page).toHaveURL(`${origin}/dashboard`);
        }
      }
    }
    assert.deepEqual(
      errors,
      [],
      "No page errors, failed application responses, or generation requests",
    );
    report.passed = true;
    console.log(
      `PR144 browser follow-up passed: ${visualOnly ? "settled header/mobile matrix" : "two real heartbeat renewals in both tab cases; header/mobile matrix"}; no AI requests.`,
    );
  } catch (error) {
    report.passed = false;
    report.failure = {
      stage,
      stack: error instanceof Error ? error.stack : undefined,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected verification failure",
    };
    process.exitCode = 1;
    console.error(
      `PR144 browser verification failed at ${stage}:`,
      error instanceof Error ? error.message : "Unexpected failure",
    );
  } finally {
    await browser?.close();
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(studentActivities)
          .where(eq(studentActivities.userId, userId));
        await tx.delete(courses).where(eq(courses.id, courseId));
        await tx
          .delete(user)
          .where(and(eq(user.id, userId), eq(user.email, email)));
        const remaining = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(session)
          .where(eq(session.userId, userId));
        assert.equal(remaining[0]!.count, 0);
        for (const table of [studentStudyClocks, studentStudyDays]) {
          const rows = await tx
            .select()
            .from(table)
            .where(eq(table.userId, userId));
          assert.equal(rows.length, 0);
        }
      });
      report.cleanup =
        "Owned QA user/course/activity removed; zero sessions or study clocks/days remain.";
      console.log(report.cleanup);
    } finally {
      await writeFile(
        resolve(out, "browser-report.json"),
        JSON.stringify(
          {
            ...report,
            accounting,
            visual,
            errors,
            finishedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      await db.$client.end();
    }
  }
}
void main().catch((error) => {
  console.error("QA setup/cleanup failed:", error.code ?? error.name);
  process.exitCode = 1;
});
