import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect, type Browser } from "@playwright/test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createDb, type Database } from "@codi-1/db";
import { hashPassword } from "@codi-1/auth";
import { account, session, user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { courses } from "@codi-1/db/schema/courses";
import { lessonProgress } from "@codi-1/db/schema/learning";
import {
  studentActivities,
  studentEnrollments,
} from "@codi-1/db/schema/student-profile";
import {
  studentStudyClocks,
  studentStudyDays,
} from "@codi-1/db/schema/study-activity";
import type { LearnerOverview } from "../src/lib/learner-overview-contract";
import { studyDate } from "../src/lib/learner-overview-contract";
import { createOnboardingService } from "../src/lib/onboarding-service";
import { seedOnboardingFixture } from "./onboarding-fixture";

// Issue #176: real enrollment/progress survives reload; a separate learner stays empty.
// Only this run's random QA identities and hidden course are created/deleted.
async function main() {
  assert.ok(process.argv.includes("--allow-dev-db"));
  assert.ok(process.env.DATABASE_URL && process.env.NODE_ENV !== "production");
  const origin = process.env.QA_ORIGIN ?? "http://localhost:3144";
  const out = resolve(
    process.env.QA_OUTPUT_DIR ?? "../../docs/ui-review/issue-176",
  );
  await mkdir(out, { recursive: true });
  const root = resolve("../..");
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, ...args],
      { cwd: root, encoding: "utf8" },
    ).trim();
  assert.equal(git("diff", "HEAD", "--", "apps/web/src", "packages"), "");
  const sources = [];
  for (const path of [
    "apps/web/scripts/verify-dashboard-enrollment-browser.ts",
    "apps/web/scripts/onboarding-fixture.ts",
    "apps/web/src/app/dashboard/page.tsx",
    "apps/web/src/app/dashboard/learner/page.tsx",
    "apps/web/src/components/learner-workspace.tsx",
    "apps/web/src/lib/learner-overview-service.ts",
  ]) {
    sources.push({
      path,
      sha256: createHash("sha256")
        .update(await readFile(resolve(root, path)))
        .digest("hex"),
    });
  }
  const report: Record<string, unknown> = {
    capturedBeforeFixtureAt: new Date().toISOString(),
    sourceHead: git("rev-parse", "HEAD"),
    buildId: (await readFile(".next/BUILD_ID", "utf8")).trim(),
    node: process.version,
    origin,
    sources,
    fixture: { lessons: 3, completed: 1, percent: 33, studySeconds: 5400 },
    passed: false,
  };
  await writeFile(
    resolve(out, "browser-report.json"),
    JSON.stringify(report, null, 2),
  );
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  const learners = ["enrolled", "empty"].map((kind) => {
    const id = `dashboard176-${randomUUID()}`;
    return { kind, id, email: `${id}@example.invalid`, password: randomUUID() };
  });
  const courseId = `dashboard176-course-${randomUUID()}`;
  const title = "TypeScript — QA issue 176";
  const checks: unknown[] = [];
  const posts: unknown[] = [];
  const errors: string[] = [];
  const aliases = (value: string) => {
    let text = value.replaceAll(courseId, "qa-course");
    for (const learner of learners)
      text = text.replaceAll(learner.id, `qa-${learner.kind}`);
    return text;
  };
  let browser: Browser | undefined;
  let stage = "fixture";
  try {
    const fixture = await db.transaction(async (tx) => {
      for (const learner of learners) {
        await tx.insert(user).values({
          id: learner.id,
          name: "QA Học viên",
          email: learner.email,
          emailVerified: true,
        });
        await tx.insert(account).values({
          id: randomUUID(),
          userId: learner.id,
          accountId: learner.id,
          providerId: "credential",
          password: await hashPassword(learner.password),
        });
        await tx
          .insert(userRoles)
          .values({ userId: learner.id, roleId: "LEARNER" });
      }
      const learner = learners[0]!;
      const fixture = await seedOnboardingFixture(tx, courseId, [learner.id]);
      await tx.update(courses).set({ title }).where(eq(courses.id, courseId));
      const onboarding = createOnboardingService(tx as unknown as Database);
      await onboarding.execute(learner.id, courseId, { type: "goal-skip" });
      await onboarding.execute(learner.id, courseId, { type: "fork-default" });
      const [enrollment] = await tx
        .update(studentEnrollments)
        .set({ progress: 33, lastActiveAt: new Date(), weeklyGoalMinutes: 300 })
        .where(
          and(
            eq(studentEnrollments.userId, learner.id),
            eq(studentEnrollments.courseId, courseId),
          ),
        )
        .returning();
      await tx.insert(lessonProgress).values({
        enrollmentId: enrollment!.id,
        lessonId: fixture.lessonIds[0]!,
        status: "completed",
        studiedAt: new Date(),
        completedAt: new Date(),
      });
      await tx.insert(studentStudyDays).values({
        userId: learner.id,
        date: studyDate(new Date()),
        seconds: 5400,
      });
      return fixture;
    });
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
    });
    for (const learner of learners) {
      stage = `login ${learner.kind}`;
      const context = await browser.newContext();
      context.on("page", (page) => {
        page.on("pageerror", (error) =>
          errors.push(aliases(`${stage}: ${error.message}`)),
        );
        page.on("response", (response) => {
          if (response.url().startsWith(origin) && response.status() >= 400)
            errors.push(
              aliases(
                `${stage}: HTTP ${response.status()} ${new URL(response.url()).pathname}`,
              ),
            );
        });
        page.on("request", (request) => {
          if (!request.url().startsWith(origin) || request.method() !== "POST")
            return;
          const path = new URL(request.url()).pathname;
          const body = request.postDataJSON();
          const lessonPath = `/api/learn/${courseId}/lessons/${fixture.lessonIds[1]}`;
          const allowed =
            (path === `/api/learn/${courseId}/path` && body?.type === "sync") ||
            (path === lessonPath && body?.type === "open") ||
            (path === `${lessonPath}/activity` &&
              ["prepare", "start", "heartbeat", "stop"].includes(body?.action));
          posts.push({
            stage,
            path: aliases(path).replace(
              fixture.lessonIds[1]!,
              "qa-next-lesson",
            ),
            command: body?.type ?? body?.action,
            allowed,
          });
          if (!allowed)
            errors.push(
              aliases(
                `${stage}: unexpected POST ${new URL(request.url()).pathname}`,
              ),
            );
        });
      });
      const login = await context.request.post(
        `${origin}/api/auth/sign-in/email`,
        {
          headers: { origin },
          data: { email: learner.email, password: learner.password },
        },
      );
      assert.equal(login.status(), 200);
      const page = await context.newPage();
      const snapshot = async (name: string) => {
        await page.evaluate(() => document.fonts.ready);
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
        await page.screenshot({
          path: resolve(out, `${name}.png`),
          fullPage: true,
          animations: "disabled",
        });
      };
      if (learner.kind === "enrolled") {
        stage = "profile and course-home comparison";
        await page.goto(`${origin}/profile`);
        await expect(
          page.getByRole("heading", { name: title, exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText("33% hoàn thành", { exact: true }),
        ).toBeVisible();
        await snapshot("profile-enrolled");
        await page.goto(`${origin}/learn/${courseId}`);
        await expect(
          page.getByRole("heading", { name: title, exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("progressbar", {
            name: "Tiến độ khoá học",
            exact: true,
          }),
        ).toHaveAttribute("value", "33");
        await snapshot("course-home-enrolled");
        checks.push({ stage, profilePercent: 33, courseHomePercent: 33 });
      }
      // Give the empty learner an origin before setting localStorage. Each next
      // navigation reads the persisted theme; avoid accumulating init scripts.
      if (learner.kind === "empty") await page.goto(`${origin}/dashboard`);
      for (const width of [1280, 375]) {
        await page.setViewportSize({
          width,
          height: width === 375 ? 844 : 800,
        });
        for (const theme of ["light", "dark"] as const) {
          await page.evaluate(
            (theme) => localStorage.setItem("theme", theme),
            theme,
          );
          for (const reload of [false, true]) {
            stage = `${learner.kind} ${width} ${theme} ${reload ? "reload" : "initial"}`;
            const loaded = page.waitForResponse(
              (r) =>
                r.url() === `${origin}/api/learner/overview` &&
                r.request().method() === "GET",
            );
            if (reload) await page.reload();
            else await page.goto(`${origin}/dashboard`);
            const response = await loaded;
            assert.equal(response.status(), 200);
            assert.match(response.headers()["cache-control"] ?? "", /no-store/);
            const overview: LearnerOverview = await response.json();
            await expect(
              page.getByRole("status", {
                name: "Đang tải dữ liệu học tập",
                exact: true,
              }),
            ).toHaveCount(0);
            await expect(page.locator("html")).toHaveClass(
              theme === "dark" ? /dark/ : /light/,
            );
            if (learner.kind === "enrolled") {
              assert.equal(overview.courses.length, 1);
              const course = overview.courses[0]!;
              assert.equal(course.id, courseId);
              assert.equal(course.percent, 33);
              assert.equal(overview.stats.active, 1);
              assert.equal(overview.stats.lessons, 1);
              assert.equal(overview.weekly.minutes, 90);
              assert.equal(overview.continueCourseId, courseId);
              assert.equal(course.nextLessonId, fixture.lessonIds[1]);
              await expect(
                page.getByRole("heading", { name: title, exact: true }),
              ).toBeVisible();
              await expect(
                page.getByRole("progressbar", {
                  name: `Tiến độ ${title}`,
                  exact: true,
                }),
              ).toHaveAttribute("aria-valuenow", "33");
              await expect(
                page.getByText("90 phút / 300 phút", { exact: false }),
              ).toBeVisible();
              const stats = page.getByRole("region", {
                name: "Tổng quan học tập",
                exact: true,
              });
              await expect(
                stats.getByRole("link").filter({ hasText: "Khoá đang học" }),
              ).toHaveText("1Khoá đang học");
              await expect(
                page.getByRole("link", { name: "Học tiếp", exact: true }),
              ).toHaveAttribute(
                "href",
                `/learn/${courseId}/${fixture.lessonIds[1]}`,
              );
              await expect(
                page.getByRole("heading", {
                  name: "Bàn làm việc của bạn đang trống",
                }),
              ).toHaveCount(0);
            } else {
              assert.equal(overview.courses.length, 0);
              assert.equal(overview.continueCourseId, null);
              assert.equal(overview.stats.active, 0);
              await expect(
                page.getByRole("heading", {
                  name: "Bàn làm việc của bạn đang trống",
                }),
              ).toBeVisible();
              await expect(
                page.getByRole("link", { name: "Học tiếp", exact: true }),
              ).toHaveCount(0);
              await expect(
                page.getByRole("link", {
                  name: "Khám phá khoá học",
                  exact: true,
                }),
              ).toBeVisible();
            }
            checks.push({
              stage,
              courses: overview.courses.length,
              active: overview.stats.active,
              lessons: overview.stats.lessons,
              weeklyMinutes: overview.weekly.minutes,
              percent: overview.courses[0]?.percent ?? null,
              continueLessonCorrect:
                learner.kind === "enrolled"
                  ? overview.courses[0]!.nextLessonId === fixture.lessonIds[1]
                  : overview.continueCourseId === null,
            });
            if (reload)
              await snapshot(`dashboard-${learner.kind}-${width}-${theme}`);
          }
        }
      }
      if (learner.kind === "enrolled") {
        stage = "continue learning navigation";
        await page.getByRole("link", { name: "Học tiếp", exact: true }).click();
        await expect(page).toHaveURL(
          `${origin}/learn/${courseId}/${fixture.lessonIds[1]}`,
        );
        await expect(
          page.getByRole("heading", { name: "Boolean", exact: true }),
        ).toBeVisible();
        checks.push({ stage, openedExpectedLesson: true });
        await page
          .getByRole("link", { name: "Về lộ trình", exact: true })
          .first()
          .click();
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    report.passed = true;
    console.log(
      "Issue176 passed: profile/course home/dashboard agree at 33%; real 1-course/90-minute data and next-lesson CTA survive reload; separate empty learner stays empty (desktop/375px, light/dark). No page errors, failing app HTTP or unexpected POSTs.",
    );
  } catch (error) {
    report.failure = {
      stage,
      message: aliases(
        error instanceof Error ? error.message : "Unknown error",
      ),
    };
    console.error(
      `Issue176 failed at ${stage}: ${aliases(error instanceof Error ? error.message : "Unknown error")}`,
    );
    process.exitCode = 1;
  } finally {
    await browser?.close();
    try {
      const ids = learners.map((learner) => learner.id);
      await db.transaction(async (tx) => {
        await tx
          .delete(studentActivities)
          .where(inArray(studentActivities.userId, ids));
        await tx.delete(user).where(inArray(user.id, ids));
        await tx.delete(courses).where(eq(courses.id, courseId));
      });
      const remaining: Record<string, number> = {};
      for (const [name, table, predicate] of [
        ["users", user, inArray(user.id, ids)],
        ["accounts", account, inArray(account.userId, ids)],
        ["sessions", session, inArray(session.userId, ids)],
        [
          "enrollments",
          studentEnrollments,
          inArray(studentEnrollments.userId, ids),
        ],
        [
          "activities",
          studentActivities,
          inArray(studentActivities.userId, ids),
        ],
        ["clocks", studentStudyClocks, inArray(studentStudyClocks.userId, ids)],
        ["days", studentStudyDays, inArray(studentStudyDays.userId, ids)],
        ["courses", courses, eq(courses.id, courseId)],
      ] as const) {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(table)
          .where(predicate);
        remaining[name] = row!.count;
        assert.equal(row!.count, 0, `${name} cleanup`);
      }
      report.cleanup = remaining;
      console.log(
        "Cleanup verified: zero QA users/accounts/sessions/enrollments/activities/clocks/days/courses remain.",
      );
    } catch (error) {
      report.passed = false;
      report.cleanupError =
        error instanceof Error ? error.name : "Unknown error";
      process.exitCode = 1;
    } finally {
      await db.$client.end();
      await writeFile(
        resolve(out, "browser-report.json"),
        JSON.stringify(
          {
            ...report,
            checks,
            posts,
            errors,
            finishedAt: new Date().toISOString(),
          },
          null,
          2,
        ) + "\n",
      );
    }
  }
}

void main().catch((error) => {
  console.error("Issue176 setup failed:", error.code || error.name);
  process.exitCode = 1;
});
