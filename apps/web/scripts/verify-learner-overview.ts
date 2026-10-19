import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { createDb, type Database } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { assessmentSubmissions } from "@codi-1/db/schema/assessments";
import {
  enrollmentSkillMastery,
  lessonProgress,
} from "@codi-1/db/schema/learning";
import { skills } from "@codi-1/db/schema/knowledge-map";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { studentStudyDays } from "@codi-1/db/schema/study-activity";
import { createOnboardingService } from "../src/lib/onboarding-service";
import { createLearnerOverviewService } from "../src/lib/learner-overview-service";
import { createStudyActivityService } from "../src/lib/study-activity-service";
import { createLearningPathService } from "../src/lib/learning-path-service";
import { seedAssessmentFixture } from "./assessment-fixture";
import { seedCodingFixture } from "./coding-fixture";

async function main() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production")
    throw new Error("Development DATABASE_URL required");
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  const rollback = new Error("ROLLBACK_LEARNER_OVERVIEW");
  let step = "setup";
  try {
    await db.transaction(async (tx) => {
      // Verify the new schema before deployment without changing shared tables/history.
      await tx.execute(
        sql`create temporary table student_study_days (like public.student_study_days including all) on commit drop`,
      );
      await tx.execute(
        sql`create temporary table student_study_clocks (like public.student_study_clocks including all) on commit drop`,
      );
      const suffix = randomUUID(),
        learner = `overview-${suffix}`,
        other = `overview-other-${suffix}`,
        empty = `overview-empty-${suffix}`;
      await tx
        .insert(user)
        .values(
          [learner, other, empty].map((id) => ({
            id,
            name: "Overview QA",
            email: `${id}@example.invalid`,
          })),
        );
      await tx
        .insert(userRoles)
        .values(
          [learner, other, empty].map((userId) => ({
            userId,
            roleId: "LEARNER",
          })),
        );
      const f = await seedAssessmentFixture(tx, `overview-course-${suffix}`, [
        learner,
        other,
      ]);
      const coding = await seedCodingFixture(tx, f.courseId, []);
      const complete = await seedAssessmentFixture(
        tx,
        `overview-complete-${suffix}`,
        [learner],
      );
      const suspended = await seedAssessmentFixture(
        tx,
        `overview-suspended-${suffix}`,
        [learner],
      );
      const database = tx as unknown as Database;
      const onboarding = createOnboardingService(database);
      for (const id of [f.courseId, complete.courseId]) {
        await onboarding.execute(learner, id, { type: "goal-skip" });
        await onboarding.execute(learner, id, { type: "fork-default" });
      }
      const enrollments = await tx
        .select()
        .from(studentEnrollments)
        .where(eq(studentEnrollments.userId, learner));
      const enrollment = enrollments.find((e) => e.courseId === f.courseId)!;
      const completed = enrollments.find(
        (e) => e.courseId === complete.courseId,
      )!;
      await tx
        .update(studentEnrollments)
        .set({ status: "suspended" })
        .where(eq(studentEnrollments.courseId, suspended.courseId));
      const otherEnrollment = (
        await tx
          .select()
          .from(studentEnrollments)
          .where(
            and(
              eq(studentEnrollments.userId, other),
              eq(studentEnrollments.courseId, f.courseId),
            ),
          )
      )[0]!;
      let now = new Date("2026-10-19T03:00:00Z");
      const service = createLearnerOverviewService(database, () => now);
      const clock = createStudyActivityService(database, () => now);
      step = "access, empty and ownership";
      assert.deepEqual((await service.get(empty)).courses, []);
      assert.equal((await service.get(learner)).courses.length, 2);
      await assert.rejects(
        () => clock.heartbeat(empty, f.courseId, f.lessonId, true),
        /chưa có quyền/,
      );
      await assert.rejects(
        () => clock.heartbeat(other, f.courseId, f.lessonId, true),
        /thiết lập/,
      );
      await tx.update(user).set({ banned: true }).where(eq(user.id, learner));
      await assert.rejects(() => service.get(learner), /đang hoạt động/);
      await assert.rejects(
        () =>
          service.execute(learner, {
            type: "dismiss-diagnostic",
            courseId: f.courseId,
          }),
        /đang hoạt động/,
      );
      await tx.update(user).set({ banned: false }).where(eq(user.id, learner));
      step =
        "completion, latest attempt, submit-only coding and scoped grading";
      await tx
        .insert(lessonProgress)
        .values([
          {
            enrollmentId: enrollment.id,
            lessonId: f.lessonId,
            status: "completed",
            completedAt: now,
            studiedAt: new Date("2026-10-18T03:00:00Z"),
          },
          ...complete.lessonIds.map((lessonId) => ({
            enrollmentId: completed.id,
            lessonId,
            status: "completed" as const,
            completedAt: now,
            studiedAt: now,
          })),
        ]);
      const concepts = await tx
        .select()
        .from(skills)
        .where(eq(skills.courseId, f.courseId));
      await tx
        .insert(enrollmentSkillMastery)
        .values(
          concepts.map((s, i) => ({
            enrollmentId: enrollment.id,
            skillId: s.id,
            pMastery: i ? 0.7 : 0.99,
            evidenceCount: i ? 0 : 1,
            correctCount: i ? 0 : 1,
          })),
        );
      const submitted = {
        enrollmentId: enrollment.id,
        status: "graded" as const,
        submittedAt: now,
        gradedAt: now,
      };
      await tx.insert(assessmentSubmissions).values([
        {
          ...submitted,
          assessmentId: f.quizId,
          attempt: 1,
          score: 100,
          quizPercent: 100,
          isPassed: true,
        },
        {
          ...submitted,
          assessmentId: f.quizId,
          attempt: 2,
          score: 33,
          quizPercent: 33,
          isPassed: false,
        },
        {
          ...submitted,
          assessmentId: coding.codingId,
          attempt: 1,
          mode: "submit",
          score: 40,
          isPassed: false,
        },
        {
          ...submitted,
          assessmentId: coding.codingId,
          attempt: 2,
          mode: "run",
          score: 100,
          isPassed: true,
        },
        {
          ...submitted,
          assessmentId: f.assignmentId,
          attempt: 1,
          score: null,
          status: "pending",
        },
        {
          ...submitted,
          assessmentId: f.assignmentId,
          enrollmentId: otherEnrollment.id,
          attempt: 1,
          score: 10,
          feedback: "OTHER LEARNER PRIVATE FEEDBACK",
        },
      ]);
      await tx.insert(studentStudyDays).values([
        { userId: learner, date: "2026-10-19", seconds: 3600 },
        { userId: other, date: "2026-10-19", seconds: 8000 },
        { userId: learner, date: "2026-10-20", seconds: 3000 },
      ]);
      let view = await service.get(learner);
      assert.equal(view.stats.completed, 1);
      assert.equal(view.stats.active, 1);
      assert.equal(view.stats.lessons, 4);
      assert.equal(view.stats.pending, 1);
      assert.equal(view.continueCourseId, f.courseId);
      assert.equal(view.weekly.minutes, 60);
      assert.equal(view.weekly.streak, 2);
      const c = view.courses.find((c) => c.id === f.courseId)!;
      assert.equal(c.hidden, true);
      assert.equal(c.nextLessonId, f.lessonIds[1]);
      assert.equal(c.showDiagnostic, true);
      assert.equal(c.skills.find((s) => s.id === concepts[0]!.id)!.level, 4);
      assert.equal(c.skills.find((s) => s.id === concepts[1]!.id)!.level, 0);
      const results = c.lessons.find((l) => l.id === f.lessonId)!.results;
      assert.equal(results.find((r) => r.type === "quiz")!.percent, 33);
      assert.equal(results.find((r) => r.type === "coding")!.percent, 40);
      assert.equal(JSON.stringify(view).includes("OTHER LEARNER"), false);
      await tx
        .update(assessmentSubmissions)
        .set({ status: "graded", score: 8, feedback: "Giải thích rõ ràng." })
        .where(
          and(
            eq(assessmentSubmissions.enrollmentId, enrollment.id),
            eq(assessmentSubmissions.assessmentId, f.assignmentId),
          ),
        );
      view = await service.get(learner);
      assert.equal(view.stats.pending, 0);
      assert.equal(view.stats.feedback, 1);
      assert.equal(view.latestFeedback?.score, 8);
      step =
        "durable diagnostic dismiss, compare-and-swap undo, shared path projection";
      const before = await tx
        .select()
        .from(lessonProgress)
        .where(eq(lessonProgress.enrollmentId, enrollment.id));
      const token = await service.execute(learner, {
        type: "dismiss-diagnostic",
        courseId: f.courseId,
      });
      assert.equal(
        (await service.get(learner)).courses.find((c) => c.id === f.courseId)!
          .showDiagnostic,
        false,
      );
      assert.equal(
        (await createLearningPathService(database).get(learner, f.courseId))
          .showDiagnosticCard,
        false,
      );
      await assert.rejects(
        () =>
          service.execute(other, {
            type: "restore-diagnostic",
            courseId: f.courseId,
            dismissedAt: token.dismissedAt,
          }),
        /không còn áp dụng/,
      );
      await assert.rejects(
        () =>
          service.execute(learner, {
            type: "restore-diagnostic",
            courseId: f.courseId,
            dismissedAt: new Date(0).toISOString(),
          }),
        /đã thay đổi/,
      );
      await service.execute(learner, {
        type: "restore-diagnostic",
        courseId: f.courseId,
        dismissedAt: token.dismissedAt,
      });
      assert.equal(
        (await service.get(learner)).courses.find((c) => c.id === f.courseId)!
          .showDiagnostic,
        true,
      );
      assert.deepEqual(
        await tx
          .select()
          .from(lessonProgress)
          .where(eq(lessonProgress.enrollmentId, enrollment.id)),
        before,
      );
      step = "server clock, overlapping tabs, stop, timeout and day split";
      await clock.heartbeat(learner, f.courseId, f.lessonId, true);
      now = new Date(now.getTime() + 30000);
      await clock.heartbeat(learner, f.courseId, f.lessonId, true);
      await clock.heartbeat(learner, f.courseId, f.lessonId, true);
      let [day] = await tx
        .select()
        .from(studentStudyDays)
        .where(
          and(
            eq(studentStudyDays.userId, learner),
            eq(studentStudyDays.date, "2026-10-19"),
          ),
        );
      assert.equal(day!.seconds, 3630);
      now = new Date(now.getTime() + 10000);
      await clock.heartbeat(learner, f.courseId, f.lessonId, false);
      now = new Date(now.getTime() + 30000);
      await clock.heartbeat(learner, f.courseId, f.lessonId, true);
      now = new Date(now.getTime() + 60000);
      await clock.heartbeat(learner, f.courseId, f.lessonId, true);
      [day] = await tx
        .select()
        .from(studentStudyDays)
        .where(
          and(
            eq(studentStudyDays.userId, learner),
            eq(studentStudyDays.date, "2026-10-19"),
          ),
        );
      assert.equal(day!.seconds, 3640);
      console.log(
        "Learner overview DB checks passed: ownership/roles, empty/hidden/suspended courses, completion, latest grades, run exclusion, scoped feedback/mastery, durable dismiss/undo, no progress mutation, weekly/streak and deduplicated active study time. All fixture rows roll back.",
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) {
      console.error(
        `Learner overview verification failed at ${step}:`,
        error instanceof Error
          ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[redacted]")
          : "unexpected failure",
      );
      process.exitCode = 1;
    }
  } finally {
    await db.$client.end();
  }
}
void main().catch(() => {
  console.error("Could not initialize development verification.");
  process.exitCode = 1;
});
