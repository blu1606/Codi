import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  chromium,
  expect,
  type Browser,
  type Page,
  type Request,
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
  const aliases = new Map<string, string>([
    [userId, "qa-user"],
    [courseId, "qa-course"],
    [email, "qa-email"],
  ]);
  const redact = (value: unknown): unknown => {
    if (typeof value === "string") {
      let text = value;
      for (const [raw, alias] of aliases) text = text.replaceAll(raw, alias);
      return text.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        (id) => {
          if (!aliases.has(id)) aliases.set(id, `token-${aliases.size}`);
          return aliases.get(id)!;
        },
      );
    }
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, redact(entry)]),
      );
    return value;
  };
  let sequence = 0;
  const traceFile = resolve(out, "runtime-events.ndjson");
  await writeFile(traceFile, "");
  const record = (event: string, data: unknown = {}) =>
    appendFileSync(
      traceFile,
      JSON.stringify({
        sequence: ++sequence,
        at: new Date().toISOString(),
        stage,
        event,
        data: redact(data),
      }) + "\n",
    );
  const errors: string[] = [];
  const accounting: unknown[] = [],
    visual: unknown[] = [];
  const skipTwoTabs = process.argv.includes("--skip-two-tabs");
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    origin,
    scope: skipTwoTabs
      ? "reload/tracking and header/mobile; two-tab cases excluded"
      : "two-tab heartbeats, reload/tracking and header/mobile",
  };
  let browser: Browser | undefined;
  let stage = "fixture";
  const pendingEvents = new Set<Promise<void>>();
  try {
    // Freeze exact bytes before creating data or executing the browser. A later
    // UI-only edit cannot silently change which runner produced these events.
    const root = resolve("../..");
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, ...args],
        { cwd: root, encoding: "utf8" },
      ).trim();
    assert.equal(
      git("diff", "HEAD", "--", "apps/web/src", "packages"),
      "",
      "Product source must match the pinned commit",
    );
    const sourcePaths = [
      "apps/web/scripts/verify-study-activity-browser.ts",
      "apps/web/scripts/assessment-fixture.ts",
      "apps/web/scripts/onboarding-fixture.ts",
      "apps/web/src/components/header.tsx",
      "apps/web/src/components/study-activity-tracker.tsx",
      "apps/web/src/lib/study-activity-service.ts",
      "apps/web/src/lib/learner-overview-contract.ts",
      "apps/web/src/app/learn/[courseId]/[lessonId]/lesson-player.tsx",
    ];
    const sources = [];
    for (const relative of sourcePaths) {
      const bytes = await readFile(resolve(root, relative));
      const snapshot = resolve(out, "source", relative);
      await mkdir(resolve(snapshot, ".."), { recursive: true });
      await copyFile(resolve(root, relative), snapshot);
      sources.push({
        path: relative,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
    await writeFile(
      resolve(out, "execution-manifest.json"),
      JSON.stringify(
        {
          capturedBeforeFixtureAt: new Date().toISOString(),
          head: git("rev-parse", "HEAD"),
          tree: git("rev-parse", "HEAD^{tree}"),
          base: git("rev-parse", "origin/develop"),
          buildId: (await readFile(".next/BUILD_ID", "utf8")).trim(),
          node: process.version,
          args: process.argv.slice(2),
          sources,
        },
        null,
        2,
      ) + "\n",
    );
    record("source-frozen", { sources });
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
    fixture.lessonIds.forEach((id, index) =>
      aliases.set(id, `qa-lesson-${index + 1}`),
    );
    record("fixture-created", {
      isolated: true,
      goalCommands: ["goal-skip", "fork-default"],
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
    const pageNames = new WeakMap<Page, string>();
    const requestIds = new WeakMap<Request, number>();
    let requestCount = 0;
    let pageCount = 0;
    await context.exposeBinding("qaObserveFocus", ({ page }, data: unknown) =>
      record("browser-focus", { page: pageNames.get(page), observation: data }),
    );
    // A string avoids TSX injecting its Node-only __name helper into a serialized
    // nested browser callback. These listeners observe native events only.
    await context.addInitScript(`(() => {
      const observed = (event) => {
        void window.qaObserveFocus({ type: event.type, focused: document.hasFocus(), visibility: document.visibilityState }).catch(() => {});
      };
      for (const type of ["focus", "blur", "pageshow", "pagehide"]) window.addEventListener(type, observed);
      document.addEventListener("visibilitychange", observed);
    })()`);
    context.on("page", (page) => {
      pageNames.set(page, `page-${++pageCount}`);
      page.on("pageerror", (error) => {
        errors.push(`${stage}: ${error.stack ?? error.message}`);
        record("pageerror", {
          page: pageNames.get(page),
          stack: error.stack ?? error.message,
        });
      });
      page.on("response", (response) => {
        if (
          new URL(response.url()).pathname.endsWith("/activity") &&
          response.request().method() === "POST"
        ) {
          const pending = (async () => {
            record("activity-response", {
              requestId: requestIds.get(response.request()),
              page: pageNames.get(page),
              request: response.request().postDataJSON(),
              status: response.status(),
              body: await response.json(),
            });
          })()
            .catch((error: Error) => {
              errors.push(
                `${stage}: activity response capture: ${error.message}`,
              );
            })
            .finally(() => pendingEvents.delete(pending));
          pendingEvents.add(pending);
        }
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
          new URL(request.url()).pathname.endsWith("/activity") &&
          request.method() === "POST"
        )
          record("activity-request", {
            requestId: (() => {
              const id = ++requestCount;
              requestIds.set(request, id);
              return id;
            })(),
            page: pageNames.get(page),
            path: new URL(request.url()).pathname,
            body: request.postDataJSON(),
          });
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
    const readClock = async () => {
      const clock = (
        await db
          .select()
          .from(studentStudyClocks)
          .where(eq(studentStudyClocks.userId, userId))
      )[0]!;
      record("database-clock", clock ?? null);
      return clock;
    };
    const readSeconds = async () => {
      const [row] = await db
        .select({
          seconds: sql<number>`coalesce(sum(${studentStudyDays.seconds}), 0)::int`,
        })
        .from(studentStudyDays)
        .where(eq(studentStudyDays.userId, userId));
      record("database-seconds", { seconds: row!.seconds });
      return row!.seconds;
    };
    const activity = (response: Response, action: string) =>
      new URL(response.url()).pathname.endsWith("/activity") &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action === action;

    for (const sameLesson of skipTwoTabs ? [] : [true, false]) {
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
        record("focus-assertion", {
          aFocused: await tabA.evaluate(() => document.hasFocus()),
          bFocused: await tabB.evaluate(() => document.hasFocus()),
        });
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
        record("stale-acquisition-rejected", { sameLesson });
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
          record("heartbeat-assertion", ticks.at(-1));
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
        stage = `lesson player / reload / ${variant}`;
        await page.bringToFront();
        const initialStart = page.waitForResponse((r) => activity(r, "start"));
        await page.goto(`/learn/${courseId}/${fixture.lessonIds[1]}`);
        assert.equal((await (await initialStart).json()).recorded, true);
        const beforeReload = await readClock();
        const acceptedAfterReload = page.waitForResponse((r) =>
          activity(r, "start"),
        );
        record("reload-requested", {
          variant,
          oldOwner: beforeReload.trackerId,
        });
        await page.reload();
        const reacquired = await acceptedAfterReload;
        assert.equal(reacquired.status(), 200);
        assert.equal((await reacquired.json()).recorded, true);
        const reloadOwner = await readClock(),
          reloadBaseline = await readSeconds();
        assert.notEqual(reloadOwner.trackerId, beforeReload.trackerId);
        assert.equal(
          reloadOwner.trackerId,
          reacquired.request().postDataJSON().trackerId,
        );
        assert.equal(reloadOwner.lessonId, fixture.lessonIds[1]);
        await expect(page.locator("main h1")).toBeVisible();
        await expect(
          page.getByRole("navigation", {
            name: "Điều hướng bài học",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", {
            name: "Mở menu tài khoản của QA Học viên",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: /^Thông báo, \d+ chưa đọc$/ }),
        ).toBeVisible();
        await expect(page.locator("[data-codi-intro-nav]")).toHaveAttribute(
          "aria-busy",
          "false",
        );
        await expect(page.locator("html")).toHaveClass(
          new RegExp(`\\b${theme}\\b`),
        );
        assert.equal(await page.evaluate(() => document.hasFocus()), true);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        const banner = await page.getByRole("banner").boundingBox();
        assert.ok(
          banner &&
            banner.x >= 0 &&
            banner.x + banner.width <= page.viewportSize()!.width,
        );
        await screenshot(page, `lesson-reloaded-${variant}`);
        const renewal = await page.waitForResponse(
          (r) => activity(r, "heartbeat"),
          { timeout: 40_000 },
        );
        assert.equal(renewal.status(), 200);
        assert.equal((await renewal.json()).recorded, true);
        const afterReloadBeat = await readClock(),
          afterReloadSeconds = await readSeconds();
        assert.equal(afterReloadBeat.trackerId, reloadOwner.trackerId);
        assert.ok(afterReloadBeat.lastSeenAt && reloadOwner.lastSeenAt);
        const reloadInterval =
          afterReloadBeat.lastSeenAt.getTime() -
          reloadOwner.lastSeenAt.getTime();
        assert.ok(reloadInterval >= 20_000 && reloadInterval <= 45_000);
        assert.equal(
          afterReloadSeconds - reloadBaseline,
          Math.floor(afterReloadBeat.lastSeenAt.getTime() / 1000) -
            Math.floor(reloadOwner.lastSeenAt.getTime() / 1000),
        );
        assert.ok(afterReloadSeconds > reloadBaseline);
        record("reload-heartbeat-assertion", {
          variant,
          newOwner: reloadOwner.trackerId,
          intervalMs: reloadInterval,
          addedSeconds: afterReloadSeconds - reloadBaseline,
          headerWithinViewport: true,
        });
        visual.push({
          route: "lesson",
          variant,
          reloaded: true,
          newOwnerAcquired: true,
          heartbeatRecorded: true,
          addedSeconds: afterReloadSeconds - reloadBaseline,
          headerWithinViewport: true,
          overflow: false,
        });
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
          await screenshot(page, `lesson-header-menu-${variant}`, false);
          await menu
            .getByRole("link", { name: "Học tập của tôi", exact: true })
            .click();
          await expect(menu).toHaveCount(0);
          await expect(page).toHaveURL(`${origin}/dashboard`);
        } else {
          await page
            .getByRole("link", { name: "Về lộ trình", exact: true })
            .click();
        }
        await expect
          .poll(async () => (await readClock()).lastSeenAt)
          .toBe(null);
        console.log(
          `Study QA: ${variant} reload acquired a new owner, credited ${afterReloadSeconds - reloadBaseline}s on a real heartbeat, and stopped on navigation.`,
        );
      }
    }
    assert.deepEqual(
      errors,
      [],
      "No page errors, failed application responses, or generation requests",
    );
    report.passed = true;
    console.log(
      `PR144 browser follow-up passed: ${skipTwoTabs ? "two-tab cases excluded; " : "two real heartbeat renewals in both tab cases; "}reload/tracking and header/mobile matrix; no AI requests.`,
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
    await Promise.allSettled([...pendingEvents]);
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
        for (const [table, condition] of [
          [user, eq(user.id, userId)],
          [account, eq(account.userId, userId)],
          [courses, eq(courses.id, courseId)],
          [studentEnrollments, eq(studentEnrollments.userId, userId)],
          [studentActivities, eq(studentActivities.userId, userId)],
        ] as const) {
          const rows = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(table)
            .where(condition);
          assert.equal(rows[0]!.count, 0);
        }
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
      record("cleanup-verified", {
        userRemoved: true,
        courseRemoved: true,
        activitiesRemoved: true,
        remainingSessions: 0,
        remainingStudyClocks: 0,
        remainingStudyDays: 0,
      });
    } finally {
      await writeFile(
        resolve(out, "browser-report.json"),
        JSON.stringify(
          redact({
            ...report,
            accounting,
            visual,
            errors,
            finishedAt: new Date().toISOString(),
          }),
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
