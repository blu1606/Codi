import assert from "node:assert/strict";
import type { StudyActivityAction } from "../src/lib/learner-overview-contract";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { and, eq, inArray } from "drizzle-orm";
import { createDb, type Database } from "@codi-1/db";
import { hashPassword } from "@codi-1/auth";
import { account, user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import {
  studentActivities,
  studentEnrollments,
} from "@codi-1/db/schema/student-profile";
import {
  studentStudyDays,
  studentStudyClocks,
} from "@codi-1/db/schema/study-activity";
import { courses } from "@codi-1/db/schema/courses";
import {
  assessments,
  assessmentSubmissions,
} from "@codi-1/db/schema/assessments";
import {
  enrollmentSkillMastery,
  lessonProgress,
} from "@codi-1/db/schema/learning";
import { skills } from "@codi-1/db/schema/knowledge-map";
import { createOnboardingService } from "../src/lib/onboarding-service";
import { studyDate } from "../src/lib/learner-overview-contract";
import { seedAssessmentFixture } from "./assessment-fixture";
import { seedCodingFixture } from "./coding-fixture";

// Explicit opt-in QA: uses isolated users/courses and cleans up only those IDs.
// Set PLAYWRIGHT_CORE_PATH and CHROMIUM_PATH to installed local QA tooling.
async function main() {
  assert.ok(process.env.DATABASE_URL && process.env.NODE_ENV !== "production");
  assert.ok(process.env.PLAYWRIGHT_CORE_PATH && process.env.CHROMIUM_PATH);
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  const origin = process.env.QA_ORIGIN ?? "http://localhost:3002";
  const userId = `overview-qa-${randomUUID()}`,
    email = `${userId}@example.invalid`,
    password = randomUUID();
  const ownedId = `overview-qa-course-${randomUUID()}`,
    doneId = `overview-qa-done-${randomUUID()}`;
  const out = resolve("../../docs/ui-review/issue-102");
  await mkdir(out, { recursive: true });
  let browser: any;
  let stage = "account";
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(user)
        .values({ id: userId, name: "Minh Anh", email, emailVerified: true });
      await tx.insert(account).values({
        id: randomUUID(),
        userId,
        accountId: userId,
        providerId: "credential",
        password: await hashPassword(password),
      });
      await tx.insert(userRoles).values({ userId, roleId: "LEARNER" });
    });
    const signed = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(120000),
    });
    assert.equal(signed.status, 200);
    const cookies = signed.headers.getSetCookie().map((c) => {
      const first = c.split(";")[0]!,
        i = first.indexOf("=");
      return {
        name: first.slice(0, i),
        value: first.slice(i + 1),
        url: origin,
      };
    });
    const { chromium } = await import(
      pathToFileURL(resolve(process.env.PLAYWRIGHT_CORE_PATH!)).href
    );
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH,
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: "light",
    });
    await context.addCookies(cookies);
    const page = await context.newPage(),
      errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    const screenshot = async (name: string) => {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: resolve(out, `${name}.png`),
        fullPage: true,
        animations: "disabled",
      });
    };
    const overflow = async () => {
      const overflowing = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      if (overflowing) {
        await screenshot("overflow-debug");
        console.log(
          JSON.stringify(
            await page.evaluate(() =>
              [...document.querySelectorAll("body *")]
                .map((el) => ({
                  tag: el.tagName,
                  cls: el.className,
                  width: el.getBoundingClientRect().width,
                  right: el.getBoundingClientRect().right,
                }))
                .filter((el) => el.right > innerWidth + 1)
                .slice(0, 18),
            ),
          ),
        );
      }
      assert.equal(overflowing, false, "No page horizontal overflow");
    };
    const loading = async (route: string) => {
      const held: any[] = [];
      await page.route("**/api/learner/overview", (request: any) => {
        held.push(request);
      });
      await page.goto(`${origin}/${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });
      await page
        .getByRole("status", { name: "Đang tải dữ liệu học tập", exact: true })
        .waitFor();
      await screenshot(`${route}-loading`);
      await page.unroute("**/api/learner/overview");
      await Promise.all(
        held.map((request) => request.continue().catch(() => {})),
      );
    };
    stage = "loading and empty states";
    await loading("dashboard");
    await page
      .getByRole("heading", { name: "Bàn làm việc của bạn đang trống" })
      .waitFor({ timeout: 120000 });
    await screenshot("dashboard-empty");
    await loading("progress");
    await page
      .getByRole("heading", { name: "Chưa có khoá học đang học" })
      .waitFor();
    await screenshot("progress-empty");
    stage = "learning fixture";
    const f = await db.transaction(async (tx) => {
      const f = await seedAssessmentFixture(tx, ownedId, [userId]);
      const coding = await seedCodingFixture(tx, ownedId, []);
      const done = await seedAssessmentFixture(tx, doneId, [userId]);
      await tx
        .update(courses)
        .set({ title: "JavaScript nền tảng" })
        .where(eq(courses.id, ownedId));
      await tx
        .update(courses)
        .set({ title: "TypeScript: Kiểu dữ liệu cơ bản" })
        .where(eq(courses.id, doneId));
      const onboarding = createOnboardingService(tx as unknown as Database);
      for (const id of [ownedId, doneId]) {
        await onboarding.execute(userId, id, { type: "goal-skip" });
        await onboarding.execute(userId, id, { type: "fork-default" });
      }
      const enrollments = await tx
        .select()
        .from(studentEnrollments)
        .where(eq(studentEnrollments.userId, userId));
      const enrollment = enrollments.find((e) => e.courseId === ownedId)!,
        completed = enrollments.find((e) => e.courseId === doneId)!;
      const now = new Date();
      await tx
        .update(studentEnrollments)
        .set({
          lastActiveAt: now,
          weeklyGoalMinutes: 300,
          learningGoal: "project",
        })
        .where(eq(studentEnrollments.id, enrollment.id));
      await tx.insert(lessonProgress).values([
        {
          enrollmentId: enrollment.id,
          lessonId: f.lessonId,
          status: "completed",
          studiedAt: now,
          completedAt: now,
        },
        ...done.lessonIds.map((lessonId) => ({
          enrollmentId: completed.id,
          lessonId,
          status: "completed" as const,
          studiedAt: now,
          completedAt: now,
        })),
      ]);
      const concepts = await tx
        .select()
        .from(skills)
        .where(eq(skills.courseId, ownedId));
      await tx.insert(enrollmentSkillMastery).values(
        concepts.map((s, i) => ({
          enrollmentId: enrollment.id,
          skillId: s.id,
          pMastery: i === 0 ? 0.9 : 0.5,
          evidenceCount: 1,
          correctCount: i === 0 ? 1 : 0,
        })),
      );
      const common = {
        enrollmentId: enrollment.id,
        status: "graded" as const,
        submittedAt: now,
        gradedAt: now,
        attempt: 1,
      };
      await tx.insert(assessmentSubmissions).values([
        {
          ...common,
          assessmentId: f.quizId,
          score: 67,
          quizPercent: 67,
          isPassed: false,
        },
        {
          ...common,
          assessmentId: f.assignmentId,
          score: 8,
          feedback:
            "Bài làm rõ ràng, xử lý đúng chuỗi rỗng. Hãy thêm kiểm thử cho đầu vào có khoảng trắng.",
        },
        {
          ...common,
          assessmentId: coding.codingId,
          mode: "submit",
          score: 100,
          isPassed: true,
        },
      ]);
      const [pending] = await tx
        .insert(assessments)
        .values({
          courseId: ownedId,
          lessonId: f.lessonIds[1],
          type: "assignment",
          title: "Bài tập: Điều kiện Boolean",
          maxScore: 10,
          submissionFormat: "text",
          status: "published",
        })
        .returning();
      await tx.insert(assessmentSubmissions).values({
        ...common,
        assessmentId: pending!.id,
        status: "pending",
        score: null,
      });
      await tx
        .insert(studentStudyDays)
        .values({ userId, date: studyDate(now), seconds: 5400 });
      return f;
    });
    stage = "parallel study heartbeats";
    const trackerA = randomUUID();
    await db.insert(studentStudyClocks).values({
      userId,
      courseId: ownedId,
      lessonId: f.lessonIds[1]!,
      lastSeenAt: new Date(Date.now() - 30000),
      trackerId: trackerA,
    });
    const endpoint = `${origin}/api/learn/${ownedId}/lessons/${f.lessonIds[1]}/activity`;
    const heartbeats = await Promise.all(
      ["heartbeat", "heartbeat"].map((action) =>
        page.request.post(endpoint, {
          headers: { origin },
          data: { action, trackerId: trackerA },
        }),
      ),
    );
    assert.ok(heartbeats.every((r: any) => r.status() === 200));
    const [study] = await db
      .select()
      .from(studentStudyDays)
      .where(
        and(
          eq(studentStudyDays.userId, userId),
          eq(studentStudyDays.date, studyDate(new Date())),
        ),
      );
    assert.ok(
      study!.seconds >= 5430 && study!.seconds <= 5445,
      `Parallel tabs count one interval (received ${study!.seconds - 5400}s)`,
    );
    await page.request.post(endpoint, {
      headers: { origin },
      data: { action: "stop", trackerId: trackerA },
    });
    stage = "dashboard populated and durable dismissal";
    await page.goto(`${origin}/dashboard`);
    await page
      .getByRole("heading", { name: "JavaScript nền tảng", exact: true })
      .waitFor();
    await page.getByText("90 phút / 300 phút", { exact: false }).waitFor();
    await overflow();
    await screenshot("dashboard-light");
    await page.getByRole("button", { name: /^Ẩn/ }).first().click();
    await page.reload();
    await page
      .getByRole("heading", { name: "JavaScript nền tảng", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Làm bài kiểm tra đầu vào", exact: true })
        .count(),
      0,
    );
    // Undo durability is tested separately at the HTTP/DB boundary; restore only this QA enrollment for CTA smoke.
    await db
      .update(studentEnrollments)
      .set({ diagnosticCardDismissedAt: null })
      .where(
        and(
          eq(studentEnrollments.userId, userId),
          eq(studentEnrollments.courseId, ownedId),
        ),
      );
    await page.reload();
    await page
      .getByRole("button", { name: "Làm bài kiểm tra đầu vào", exact: true })
      .click();
    await page.waitForURL(`**/learn/${ownedId}/onboarding?view=intro`);
    await page
      .getByRole("button", { name: "Bắt đầu làm bài", exact: true })
      .waitFor();
    stage = "progress active/completed and feedback";
    await page.goto(`${origin}/progress`);
    await page.getByText("67% · Chưa đạt", { exact: true }).waitFor();
    await page.getByText("100% · Đạt", { exact: true }).waitFor();
    await page.getByText("Chờ chấm", { exact: true }).waitFor();
    assert.ok(await page.getByText(/Bài làm rõ ràng/).count());
    await overflow();
    await screenshot("progress-light");
    await page.getByRole("tab", { name: /^Đã hoàn thành/ }).click();
    await page
      .getByText("TypeScript: Kiểu dữ liệu cơ bản", { exact: true })
      .waitFor();
    await screenshot("progress-completed");
    stage = "dark/mobile";
    for (const route of ["dashboard", "progress"]) {
      await page.goto(`${origin}/${route}`);
      await page
        .getByText(
          route === "dashboard" ? "90 phút / 300 phút" : "67% · Chưa đạt",
          { exact: false },
        )
        .waitFor();
      await page.evaluate(() => {
        localStorage.setItem("theme", "dark");
        document.documentElement.classList.add("dark");
      });
      await screenshot(`${route}-dark`);
      await page.evaluate(() => {
        localStorage.setItem("theme", "light");
        document.documentElement.classList.remove("dark");
      });
      await page.setViewportSize({ width: 375, height: 812 });
      await overflow();
      await screenshot(`${route}-mobile`);
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    stage = "error and retry";
    await page.route("**/api/learner/overview", (route: any) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Tạm thời chưa thể tải dữ liệu. Vui lòng thử lại.",
        }),
      }),
    );
    await page.goto(`${origin}/dashboard`);
    await page.getByRole("button", { name: "Thử lại", exact: true }).waitFor();
    await screenshot("dashboard-error");
    await page.unroute("**/api/learner/overview");
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await page.getByText("90 phút / 300 phút", { exact: false }).waitFor();
    stage = "delayed obsolete stops through authenticated HTTP";
    for (const lessonB of [f.lessonIds[1]!, f.lessonId]) {
      const trackerB = randomUUID();
      const endpointB = `${origin}/api/learn/${ownedId}/lessons/${lessonB}/activity`;
      const send = async (
        url: string,
        trackerId: string,
        action: StudyActivityAction,
      ) => {
        let expectedOwner: string | null | undefined;
        if (action === "start") {
          const prepared = await page.request.post(url, {
            headers: { origin },
            data: { action: "prepare", trackerId },
          });
          assert.equal(prepared.status(), 200);
          expectedOwner = (await prepared.json()).owner;
        }
        const r = await page.request.post(url, {
          headers: { origin },
          data: {
            trackerId,
            action,
            ...(action === "start" ? { expectedOwner } : {}),
          },
        });
        assert.equal(r.status(), 200);
        return r.json();
      };
      await send(endpoint, trackerA, "start");
      await send(endpointB, trackerB, "start");
      // Move only this QA clock back, so the real HTTP service must retain and
      // credit B's interval after A's obsolete stop, without a 30-second sleep.
      await db
        .update(studentStudyClocks)
        .set({ lastSeenAt: new Date(Date.now() - 30000) })
        .where(eq(studentStudyClocks.userId, userId));
      const [owned] = await db
        .select()
        .from(studentStudyClocks)
        .where(eq(studentStudyClocks.userId, userId));
      assert.deepEqual(await send(endpoint, trackerA, "stop"), {
        recorded: false,
      });
      const [afterStop] = await db
        .select()
        .from(studentStudyClocks)
        .where(eq(studentStudyClocks.userId, userId));
      assert.deepEqual(afterStop, owned);
      await send(endpointB, trackerB, "heartbeat");
      await send(endpointB, trackerB, "stop");
    }
    stage = "real lesson tracker focus while stop response is held";
    const isActivity = (r: any, action: StudyActivityAction) =>
      r.url() === endpoint &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.action === action;
    const initialStart = page.waitForResponse((r: any) =>
      isActivity(r, "start"),
    );
    void initialStart.catch(() => {});
    await page.goto(`${origin}/learn/${ownedId}/${f.lessonIds[1]}`);
    await page.bringToFront();
    assert.equal((await initialStart).status(), 200);
    console.log("Study QA: actual lesson start accepted.");
    let releaseStop!: () => void, stopProcessed!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    const held = new Promise<void>((resolve) => {
      stopProcessed = resolve;
    });
    let heldOnce = false;
    const holdStop = async (route: any) => {
      if (route.request().postDataJSON().action !== "stop" || heldOnce)
        return route.continue();
      heldOnce = true;
      const result = await route.fetch();
      assert.equal(result.status(), 200);
      stopProcessed();
      await release;
      await route.fulfill({ response: result });
    };
    await page.route(endpoint, holdStop);
    // Playwright enables always-focused emulation by default. Disable it so
    // Chromium emits real focus/blur events when switching between these tabs.
    const lessonCdp = await context.newCDPSession(page);
    await lessonCdp.send("Emulation.setFocusEmulationEnabled", {
      enabled: false,
    });
    const background = await context.newPage();
    await (
      await context.newCDPSession(background)
    ).send("Emulation.setFocusEmulationEnabled", { enabled: false });
    try {
      await background.bringToFront();
      await Promise.race([
        held,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Lesson did not stop on blur")),
            10000,
          ),
        ),
      ]);
      await page.bringToFront();
      assert.equal(await page.evaluate(() => document.hasFocus()), true);
      const resumed = page.waitForResponse((r: any) => isActivity(r, "start"), {
        timeout: 5000,
      });
      releaseStop();
      const resumedResponse = await resumed;
      assert.equal(resumedResponse.status(), 200);
      const [resumedClock] = await db
        .select()
        .from(studentStudyClocks)
        .where(eq(studentStudyClocks.userId, userId));
      assert.equal(
        resumedClock!.trackerId,
        resumedResponse.request().postDataJSON().trackerId,
      );
      assert.ok(
        resumedClock!.lastSeenAt,
        "Focus resumes immediately, before the next heartbeat tick",
      );
      console.log(
        "Study QA: held stop completed, focused lesson immediately resumed.",
      );
    } finally {
      releaseStop();
      await page.unroute(endpoint, holdStop);
      await background.close();
      await lessonCdp.detach();
    }
    stage = "lesson tracker unmount";
    const lessonStop = page.waitForResponse((r: any) => isActivity(r, "stop"));
    void lessonStop.catch(() => {});
    // Use client navigation so React actually unmounts the tracker.
    await page
      .getByRole("link", { name: "Về lộ trình", exact: true })
      .first()
      .click();
    assert.equal((await lessonStop).status(), 200);
    console.log("Study QA: lesson unmount stopped the owning tracker.");
    await page.goto(`${origin}/dashboard`);
    // Restore only this QA account's fixture duration for the goal UI assertions.
    await db
      .update(studentStudyDays)
      .set({ seconds: 5400 })
      .where(eq(studentStudyDays.userId, userId));
    await page.reload();
    await page.getByText("90 phút / 300 phút", { exact: false }).waitFor();
    stage = "goal editing and continue link";
    const continueLink = page.getByRole("link", {
      name: "Học tiếp",
      exact: true,
    });
    assert.ok(
      (await continueLink.getAttribute("href"))?.includes(f.lessonIds[1]!),
    );
    await page
      .getByRole("button", { name: "Chỉnh mục tiêu", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    await screenshot("dashboard-edit-goal");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Chỉnh mục tiêu", exact: true })
      .click();
    await page.waitForURL(`**/learn/${ownedId}/onboarding`);
    // These controlled radios update after the server saves the choice.
    // check() requires a synchronous change, so click and await persisted UI state.
    const chooseGoal = async (label: string) => {
      await page.getByRole("radio", { name: label, exact: true }).click();
      await page.waitForFunction(
        (label: string) =>
          [...document.querySelectorAll("label")].some(
            (el) =>
              el.textContent?.trim() === label &&
              el.querySelector("input")?.checked,
          ),
        label,
      );
    };
    await chooseGoal("Hoàn thành khóa học");
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await chooseGoal("Đã biết cơ bản");
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    await chooseGoal("10 giờ mỗi tuần");
    await page
      .getByRole("button", { name: "Lưu và xếp lại lộ trình", exact: true })
      .click();
    await page
      .getByText("Đã lưu mục tiêu. Codi đang xếp lại lộ trình.", {
        exact: true,
      })
      .waitFor();
    await page.goto(`${origin}/dashboard`);
    await page.getByText("90 phút / 600 phút", { exact: false }).waitFor();
    await screenshot("dashboard-goal-saved");
    await page
      .getByRole("button", { name: "Chỉnh mục tiêu", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Chỉnh mục tiêu", exact: true })
      .click();
    await page.waitForURL(`**/learn/${ownedId}/onboarding`);
    assert.equal(
      await page
        .getByRole("radio", { name: "Hoàn thành khóa học", exact: true })
        .isChecked(),
      true,
    );
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    assert.equal(
      await page
        .getByRole("radio", { name: "Đã biết cơ bản", exact: true })
        .isChecked(),
      true,
    );
    await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
    assert.equal(
      await page
        .getByRole("radio", { name: "10 giờ mỗi tuần", exact: true })
        .isChecked(),
      true,
    );
    await screenshot("onboarding-goal-reopened");
    await page
      .getByRole("button", { name: "Huỷ chỉnh sửa", exact: true })
      .click();
    stage = "authenticated profile heatmap light/dark";
    await page.goto(`${origin}/profile`);
    const heatmap = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByText(/contributions in \d{4}/) });
    await heatmap.waitFor();
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme: string) => {
        localStorage.setItem("theme", theme);
        document.documentElement.classList.toggle("dark", theme === "dark");
      }, theme);
      const colors = await heatmap.evaluate((el: HTMLElement) => {
        const empty = [
          ...el.querySelectorAll<HTMLElement>("span[title]"),
        ].filter((cell) => cell.classList.contains("bg-muted"));
        return {
          count: empty.length,
          visible: empty.every(
            (cell) =>
              cell.getBoundingClientRect().width > 0 &&
              cell.getBoundingClientRect().height > 0,
          ),
          fill: getComputedStyle(empty[0]!).backgroundColor,
          background: getComputedStyle(el).backgroundColor,
          legend: getComputedStyle(el.querySelector("i")!).backgroundColor,
        };
      });
      assert.ok(colors.count > 300 && colors.visible);
      assert.notEqual(colors.fill, colors.background);
      assert.equal(colors.fill, colors.legend);
      await heatmap.screenshot({
        path: resolve(out, `profile-heatmap-${theme}.png`),
        animations: "disabled",
      });
    }
    assert.equal(errors.length, 0, errors.join("; "));
    console.log(
      "Browser QA passed: delayed stop/focus resumes immediately, obsolete stops preserve same/different-lesson clocks via real HTTP, authenticated dashboard/progress/results, goal save/reopen, heatmap light/dark, empty/loading/retry, diagnostic CTA/durable dismiss and 375px layouts without browser errors or page overflow.",
    );
  } catch (error) {
    console.error(
      `Browser verification failed at ${stage}:`,
      error instanceof Error
        ? error.message.slice(0, 1000)
        : "unexpected failure",
    );
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await db.transaction(async (tx) => {
      await tx
        .delete(studentActivities)
        .where(eq(studentActivities.userId, userId));
      await tx
        .delete(user)
        .where(and(eq(user.id, userId), eq(user.email, email)));
      await tx.delete(courses).where(inArray(courses.id, [ownedId, doneId]));
    });
    await db.$client.end();
    console.log("Only this run's QA users/courses/data cleaned up.");
  }
}
void main().catch((error) => {
  console.error("Browser QA setup/cleanup failed:", error.code || error.name);
  process.exitCode = 1;
});
