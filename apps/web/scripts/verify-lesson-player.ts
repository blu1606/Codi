import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { createDb, type Database } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import {
  courseLessons,
  lessonMaterials,
} from "@codi-1/db/schema/course-content";
import { courses } from "@codi-1/db/schema/courses";
import {
  assessments,
  assessmentSubmissions,
} from "@codi-1/db/schema/assessments";
import {
  lessonProgress,
  personalizedLearningPaths,
} from "@codi-1/db/schema/learning";
import { notifications, courseReviews } from "@codi-1/db/schema/interaction";
import { skills, skillPrerequisites } from "@codi-1/db/schema/knowledge-map";
import {
  studentEnrollments,
  studentActivities,
} from "@codi-1/db/schema/student-profile";
import { createLessonPlayerService } from "../src/lib/lesson-player-service";
import { createLearningPathService } from "../src/lib/learning-path-service";
import { createOnboardingService } from "../src/lib/onboarding-service";
import { seedOnboardingFixture } from "./onboarding-fixture";
import type { LessonPlayerCommand } from "../src/lib/lesson-player-contract";
import {
  listPublicCourseReviews,
  setCourseReviewVisibility,
} from "../src/lib/course-review-service";

async function main() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production")
    throw new Error("Development DATABASE_URL required");
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  const rollback = new Error("ROLLBACK_LESSON_PLAYER_VERIFICATION");
  try {
    await db.transaction(async (tx) => {
      const suffix = randomUUID();
      const learner = `player-qa-${suffix}`;
      const other = `player-other-${suffix}`;
      await tx
        .insert(user)
        .values(
          [learner, other].map((id) => ({
            id,
            name: "Lesson player verification",
            email: `${id}@example.invalid`,
            banned: false,
          })),
        );
      await tx
        .insert(userRoles)
        .values(
          [learner, other].map((userId) => ({ userId, roleId: "LEARNER" })),
        );
      const fixture = await seedOnboardingFixture(tx, `player-qa-${suffix}`, [
        learner,
      ]);
      const [e] = await tx
        .select()
        .from(studentEnrollments)
        .where(eq(studentEnrollments.userId, learner));
      assert.ok(e);
      const dbTx = tx as unknown as Database;
      const player = createLessonPlayerService(dbTx);
      const path = createLearningPathService(dbTx);
      const onboarding = createOnboardingService(dbTx);
      const first = fixture.lessonIds[0]!;
      const second = fixture.lessonIds[1]!;
      const third = fixture.lessonIds[2]!;
      const run = <C extends LessonPlayerCommand>(
        command: C,
        lessonId = first,
      ) => player.execute(learner, fixture.courseId, lessonId, command);
      await assert.rejects(
        () => player.get(learner, fixture.courseId, first),
        /thiết lập/,
      );
      await onboarding.execute(learner, fixture.courseId, {
        type: "goal-skip",
      });
      await onboarding.execute(learner, fixture.courseId, {
        type: "fork-default",
      });
      const concepts = await tx
        .select()
        .from(skills)
        .where(eq(skills.courseId, fixture.courseId))
        .orderBy(asc(skills.id));
      await tx.insert(skillPrerequisites).values([
        {
          skillId: concepts[1]!.id,
          prerequisiteSkillId: concepts[0]!.id,
          source: "lecturer",
          review: "accepted",
        },
        {
          skillId: concepts[2]!.id,
          prerequisiteSkillId: concepts[1]!.id,
          source: "lecturer",
          review: "accepted",
        },
      ]);
      await assert.rejects(
        () => player.get(other, fixture.courseId, first),
        /chưa có quyền/,
      );
      await assert.rejects(
        () => player.execute(other, fixture.courseId, first, { type: "study" }),
        /chưa có quyền/,
      );
      await assert.rejects(
        () => run({ type: "open" }, second),
        /Cần học trước/,
      );
      await assert.rejects(
        () => run({ type: "study" }, randomUUID()),
        /Không tìm thấy/,
      );
      await tx
        .update(studentEnrollments)
        .set({ status: "suspended" })
        .where(eq(studentEnrollments.id, e.id));
      await assert.rejects(() => run({ type: "open" }), /chưa có quyền/);
      await tx
        .update(studentEnrollments)
        .set({ status: "active" })
        .where(eq(studentEnrollments.id, e.id));
      await tx.update(user).set({ banned: true }).where(eq(user.id, learner));
      await assert.rejects(() => run({ type: "open" }), /đang hoạt động/);
      await tx.update(user).set({ banned: false }).where(eq(user.id, learner));
      await tx
        .update(courseLessons)
        .set({ isPublished: false })
        .where(eq(courseLessons.id, first));
      await assert.rejects(() => run({ type: "open" }), /Không tìm thấy/);
      await tx
        .update(courseLessons)
        .set({ isPublished: true })
        .where(eq(courseLessons.id, first));
      let state = await run({ type: "open" });
      assert.equal(state.completed, false);
      const [opened] = await tx
        .select()
        .from(studentEnrollments)
        .where(eq(studentEnrollments.id, e.id));
      assert.equal(opened?.lastLessonId, first);
      await assert.rejects(() => run({ type: "complete" }), /Còn thiếu/);
      const materials = await tx
        .insert(lessonMaterials)
        .values([
          {
            lessonId: first,
            type: "video",
            title: "Video",
            url: "/dev/lesson-player/flower.mp4",
            durationSeconds: 5,
            position: 0,
          },
          {
            lessonId: first,
            type: "pdf",
            title: "PDF",
            url: "/dev/lesson-player/slides.pdf",
            position: 1,
          },
        ])
        .returning();
      const video = materials[0]!;
      const pdf = materials[1]!;
      await assert.rejects(
        () =>
          run({ type: "video", materialId: pdf.id, seconds: 2, ended: false }),
        /không phải video/,
      );
      await assert.rejects(
        () =>
          run({
            type: "video",
            materialId: Number.MAX_SAFE_INTEGER,
            seconds: 2,
            ended: false,
          }),
        /Không tìm thấy tài liệu/,
      );
      const clamped = await run({
        type: "video",
        materialId: video.id,
        seconds: 999,
        ended: false,
      });
      assert.equal(clamped.positionSeconds, 5);
      assert.ok(!("path" in clamped));
      await assert.rejects(
        () =>
          run({ type: "video", materialId: video.id, seconds: 1, ended: true }),
        /chưa được xem hết/,
      );
      let media = await run({
        type: "video",
        materialId: video.id,
        seconds: 2,
        ended: false,
      });
      assert.equal(media.positionSeconds, 2);
      assert.equal(media.studied, false);
      state = await player.get(learner, fixture.courseId, first);
      assert.equal(state.media[String(video.id)]?.seconds, 2);
      media = await run({
        type: "pdf-page",
        materialId: pdf.id,
        page: 3,
        pages: 3,
      });
      assert.equal(media.studied, false);
      await run({ type: "pdf-page", materialId: pdf.id, page: 1, pages: 3 });
      media = await run({
        type: "pdf-page",
        materialId: pdf.id,
        page: 2,
        pages: 3,
      });
      assert.equal(media.studied, true);
      assert.equal(media.media[String(pdf.id)]?.lastPage, 2);
      media = await run({
        type: "video",
        materialId: video.id,
        seconds: 5,
        ended: true,
      });
      assert.equal(media.studied, true);
      await tx
        .update(lessonMaterials)
        .set({ durationSeconds: null })
        .where(eq(lessonMaterials.id, video.id));
      await tx
        .update(courseLessons)
        .set({ durationSeconds: 600 })
        .where(eq(courseLessons.id, first));
      media = await run({
        type: "video",
        materialId: video.id,
        seconds: 5,
        ended: true,
      });
      assert.equal(media.positionSeconds, 5);
      assert.equal(media.studied, true);
      const [quiz] = await tx
        .insert(assessments)
        .values({
          courseId: fixture.courseId,
          lessonId: first,
          type: "quiz",
          title: "Quiz",
          status: "published",
          maxScore: 20,
          passingScore: 70,
        })
        .returning();
      assert.ok(quiz);
      const [assignment] = await tx
        .insert(assessments)
        .values({
          courseId: fixture.courseId,
          lessonId: first,
          type: "assignment",
          title: "Assignment",
          status: "published",
          submissionFormat: "link",
        })
        .returning();
      assert.ok(assignment);
      await assert.rejects(() => run({ type: "complete" }), /Đạt quiz/);
      await tx
        .insert(assessmentSubmissions)
        .values({
          assessmentId: quiz.id,
          enrollmentId: e.id,
          attempt: 1,
          status: "graded",
          score: 20,
          isPassed: true,
          submittedAt: new Date(),
        });
      await assert.rejects(() => run({ type: "complete" }), /Nộp bài tập/);
      await tx
        .insert(assessmentSubmissions)
        .values({
          assessmentId: assignment.id,
          enrollmentId: e.id,
          attempt: 1,
          status: "pending",
          submittedAt: new Date(),
        });
      const [retake] = await tx
        .insert(assessmentSubmissions)
        .values({
          assessmentId: quiz.id,
          enrollmentId: e.id,
          attempt: 2,
          status: "draft",
        })
        .returning();
      assert.ok(retake);
      await assert.rejects(() => run({ type: "complete" }), /Đạt quiz/);
      await tx
        .update(assessmentSubmissions)
        .set({
          status: "graded",
          score: 10,
          isPassed: false,
          submittedAt: new Date(),
        })
        .where(eq(assessmentSubmissions.id, retake.id));
      await assert.rejects(() => run({ type: "complete" }), /Đạt quiz/);
      await tx
        .update(assessmentSubmissions)
        .set({ score: 13.9, isPassed: true })
        .where(eq(assessmentSubmissions.id, retake.id));
      await assert.rejects(() => run({ type: "complete" }), /Đạt quiz/);
      await tx
        .update(assessmentSubmissions)
        .set({ score: 14, isPassed: true })
        .where(eq(assessmentSubmissions.id, retake.id));
      const [code] = await tx
        .insert(assessments)
        .values({
          courseId: fixture.courseId,
          lessonId: first,
          type: "coding",
          title: "Code",
          status: "published",
        })
        .returning();
      assert.ok(code);
      await tx
        .insert(assessmentSubmissions)
        .values({
          assessmentId: code.id,
          enrollmentId: e.id,
          attempt: 1,
          mode: "run",
          status: "graded",
          score: 100,
          isPassed: true,
          submittedAt: new Date(),
        });
      await assert.rejects(() => run({ type: "study" }), /Bài code/);
      await assert.rejects(() => run({ type: "complete" }), /bài code/);
      await tx
        .insert(assessmentSubmissions)
        .values({
          assessmentId: code.id,
          enrollmentId: e.id,
          attempt: 2,
          mode: "submit",
          status: "graded",
          score: 100,
          isPassed: true,
          submittedAt: new Date(),
        });
      const [latestCode] = await tx
        .insert(assessmentSubmissions)
        .values({
          assessmentId: code.id,
          enrollmentId: e.id,
          attempt: 3,
          mode: "submit",
          status: "graded",
          score: 0,
          isPassed: false,
          submittedAt: new Date(),
        })
        .returning();
      assert.ok(latestCode);
      await assert.rejects(() => run({ type: "complete" }), /bài code/);
      await tx
        .update(assessmentSubmissions)
        .set({ score: 100, isPassed: true })
        .where(eq(assessmentSubmissions.id, latestCode.id));
      state = await run({ type: "complete" });
      assert.equal(state.completed, true);
      assert.equal(state.path.done, 1);
      assert.equal(state.path.rows[1]?.status, "next");
      assert.equal(state.path.update?.afterLessonId, first);
      assert.equal(
        (
          await tx
            .select()
            .from(notifications)
            .where(eq(notifications.userId, learner))
        ).length,
        1,
      );
      assert.equal(
        (
          await tx
            .select()
            .from(studentActivities)
            .where(eq(studentActivities.userId, learner))
        ).length,
        1,
      );
      const versions = (
        await tx
          .select()
          .from(personalizedLearningPaths)
          .where(eq(personalizedLearningPaths.enrollmentId, e.id))
      ).length;
      await run({ type: "complete" });
      await run({ type: "open" });
      assert.equal(
        (
          await tx
            .select()
            .from(notifications)
            .where(eq(notifications.userId, learner))
        ).length,
        1,
      );
      assert.equal(
        (
          await tx
            .select()
            .from(personalizedLearningPaths)
            .where(eq(personalizedLearningPaths.enrollmentId, e.id))
        ).length,
        versions,
      );
      await run({ type: "study" }, second);
      await run({ type: "complete" }, second);
      await run({ type: "study" }, third);
      state = await run({ type: "complete" }, third);
      assert.equal(state.path.complete, true);
      const [finished] = await tx
        .select()
        .from(studentEnrollments)
        .where(eq(studentEnrollments.id, e.id));
      assert.equal(finished?.status, "completed");
      assert.equal(finished?.progress, 100);
      assert.ok(finished?.completedAt);
      await path.execute(learner, fixture.courseId, {
        type: "review",
        rating: 4,
        text: "Hữu ích",
      });
      await path.execute(learner, fixture.courseId, {
        type: "review",
        rating: 5,
        text: "Đã sửa đánh giá",
      });
      const reviews = await tx
        .select()
        .from(courseReviews)
        .where(eq(courseReviews.enrollmentId, e.id));
      assert.equal(reviews.length, 1);
      assert.equal(reviews[0]?.rating, 5);
      let publicReviews = await listPublicCourseReviews(tx, fixture.courseId);
      assert.equal(publicReviews.length, 1);
      assert.equal(publicReviews[0]?.text, "Đã sửa đánh giá");
      assert.ok(!("email" in publicReviews[0]!));
      await setCourseReviewVisibility(
        tx,
        fixture.courseId,
        reviews[0]!.id,
        false,
      );
      const [hiddenCourse] = await tx
        .select()
        .from(courses)
        .where(eq(courses.id, fixture.courseId));
      assert.equal(hiddenCourse?.rating, 0);
      assert.equal(hiddenCourse?.reviewCount, 0);
      publicReviews = await listPublicCourseReviews(tx, fixture.courseId);
      assert.equal(publicReviews.length, 0);
      await setCourseReviewVisibility(
        tx,
        fixture.courseId,
        reviews[0]!.id,
        true,
      );
      const [course] = await tx
        .select()
        .from(courses)
        .where(eq(courses.id, fixture.courseId));
      assert.equal(course?.rating, 5);
      assert.equal(course?.reviewCount, 1);
      const [retained] = await tx
        .select()
        .from(assessmentSubmissions)
        .where(eq(assessmentSubmissions.id, retake.id));
      assert.equal(retained?.score, 14);
      const progress = await tx
        .select()
        .from(lessonProgress)
        .where(
          and(
            eq(lessonProgress.enrollmentId, e.id),
            eq(lessonProgress.lessonId, first),
          ),
        );
      assert.equal(progress[0]?.status, "completed");
      console.log(
        "PASS lesson player DB: roles/ownership/suspension/publication/locks; resume; PDF every page; latest quiz/code submit; assignment pending; atomic idempotent completion/notification/path; course completion; review upsert/aggregate; retained grades. Fixture transaction rolled back.",
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await db.$client.end();
  }
}
void main().catch((error: unknown) => {
  if (error instanceof assert.AssertionError) console.error(error.message);
  else if (error instanceof Error && error.name === "LearningPathError")
    console.error(error.message);
  else {
    const cause = (
      error as {
        cause?: { code?: string; constraint?: string; column?: string };
      }
    )?.cause;
    console.error(
      "Lesson player verification failed; query/parameters suppressed.",
      {
        name: error instanceof Error ? error.name : "Unknown",
        code: cause?.code,
        constraint: cause?.constraint,
        column: cause?.column,
      },
    );
    if (error instanceof Error)
      console.error(
        error.stack
          ?.split("\n")
          .filter((line) => /^\s+at /.test(line))
          .slice(0, 5)
          .join("\n"),
      );
  }
  process.exitCode = 1;
});
