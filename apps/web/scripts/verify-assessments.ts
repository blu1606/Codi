import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { createDb, type Database } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import {
  assessments,
  assessmentSubmissions,
} from "@codi-1/db/schema/assessments";
import { courseLessons } from "@codi-1/db/schema/course-content";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { skills, skillPrerequisites } from "@codi-1/db/schema/knowledge-map";
import { createOnboardingService } from "../src/lib/onboarding-service";
import { createLessonPlayerService } from "../src/lib/lesson-player-service";
import { createAssessmentService } from "../src/lib/assessment-service";
import { seedAssessmentFixture } from "./assessment-fixture";

async function main() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production")
    throw new Error("Development DATABASE_URL required");
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  const rollback = new Error("ROLLBACK_ASSESSMENTS");
  let step = "initialize";
  try {
    await db.transaction(async (tx) => {
      const suffix = randomUUID();
      const learner = `assessment-qa-${suffix}`,
        other = `assessment-other-${suffix}`;
      await tx
        .insert(user)
        .values(
          [learner, other].map((id) => ({
            id,
            name: "Assessment verification",
            email: `${id}@example.invalid`,
            banned: false,
          })),
        );
      await tx
        .insert(userRoles)
        .values(
          [learner, other].map((userId) => ({ userId, roleId: "LEARNER" })),
        );
      const f = await seedAssessmentFixture(tx, `assessment-qa-${suffix}`, [
        learner,
      ]);
      const database = tx as unknown as Database;
      const storage = new Map<string, Buffer>();
      let storageFails = false;
      const service = createAssessmentService(database, {
        put: async (key, buffer) => {
          if (storageFails) throw new Error("simulated storage outage");
          storage.set(key, buffer);
        },
        get: async (key) => ({
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(storage.get(key)!));
              controller.close();
            },
          }),
          size: storage.get(key)!.length,
        }),
      });
      const quiz = {
        userId: learner,
        courseId: f.courseId,
        lessonId: f.lessonId,
        assessmentId: f.quizId,
      };
      const assignment = { ...quiz, assessmentId: f.assignmentId };
      const player = createLessonPlayerService(database);
      step = "onboarding and access guards";
      await assert.rejects(() => service.get(quiz), /thiết lập/);
      const onboarding = createOnboardingService(database);
      await onboarding.execute(learner, f.courseId, { type: "goal-skip" });
      await onboarding.execute(learner, f.courseId, { type: "fork-default" });
      await assert.rejects(
        () => service.get({ ...quiz, userId: other }),
        /chưa có quyền/,
      );
      await assert.rejects(
        () =>
          service.execute({ ...quiz, userId: other }, { type: "quiz-open" }),
        /chưa có quyền/,
      );
      await assert.rejects(
        () =>
          service.upload(
            { ...assignment, userId: other },
            "work.txt",
            Buffer.from("work"),
          ),
        /chưa có quyền/,
      );
      await tx.update(user).set({ banned: true }).where(eq(user.id, learner));
      await assert.rejects(() => service.get(quiz), /đang hoạt động/);
      await tx.update(user).set({ banned: false }).where(eq(user.id, learner));
      await tx
        .update(userRoles)
        .set({ revokedAt: new Date() })
        .where(eq(userRoles.userId, learner));
      await assert.rejects(
        () => service.execute(quiz, { type: "quiz-open" }),
        /đang hoạt động/,
      );
      await tx
        .update(userRoles)
        .set({ revokedAt: null })
        .where(eq(userRoles.userId, learner));
      await tx
        .update(studentEnrollments)
        .set({ status: "suspended" })
        .where(eq(studentEnrollments.userId, learner));
      await assert.rejects(() => service.get(quiz), /chưa có quyền/);
      await tx
        .update(studentEnrollments)
        .set({ status: "active" })
        .where(eq(studentEnrollments.userId, learner));
      await tx
        .update(courseLessons)
        .set({ isPublished: false })
        .where(eq(courseLessons.id, f.lessonId));
      await assert.rejects(() => service.get(quiz), /Không tìm thấy/);
      await tx
        .update(courseLessons)
        .set({ isPublished: true })
        .where(eq(courseLessons.id, f.lessonId));
      await tx
        .update(assessments)
        .set({ status: "disabled" })
        .where(eq(assessments.id, f.quizId));
      await assert.rejects(() => service.get(quiz), /Không tìm thấy/);
      await tx
        .update(assessments)
        .set({ status: "published" })
        .where(eq(assessments.id, f.quizId));
      await assert.rejects(
        () => service.get({ ...quiz, assessmentId: f.assessmentId }),
        /Không tìm thấy/,
      );
      await assert.rejects(
        () => service.get({ ...quiz, lessonId: f.lessonIds[1]! }),
        /Không tìm thấy/,
      );
      const concepts = await tx
        .select()
        .from(skills)
        .where(eq(skills.courseId, f.courseId))
        .orderBy(asc(skills.id));
      await tx
        .insert(skillPrerequisites)
        .values({
          skillId: concepts[0]!.id,
          prerequisiteSkillId: concepts[1]!.id,
          source: "lecturer",
          review: "accepted",
        });
      await assert.rejects(() => service.get(quiz), /Cần học trước/);
      await tx
        .delete(skillPrerequisites)
        .where(eq(skillPrerequisites.skillId, concepts[0]!.id));

      step = "quiz draft, grading, review, latest attempt";
      assert.equal((await service.get(quiz)).submission, null);
      let view = await service.execute(quiz, { type: "quiz-open" });
      const first = view.submission!.id;
      assert.equal(
        (await service.execute(quiz, { type: "quiz-open" })).submission!.id,
        first,
      );
      assert.equal(view.submission!.review.length, 0);
      assert.ok(!JSON.stringify(view.questions).includes("isCorrect"));
      await assert.rejects(
        () =>
          service.execute(quiz, {
            type: "quiz-answer",
            submissionId: first,
            questionId: f.questions[0]!.id,
            optionId: f.questions[1]!.options[0]!.id,
          }),
        /không thuộc/,
      );
      await assert.rejects(
        () =>
          service.execute(quiz, {
            type: "quiz-submit",
            submissionId: first,
            confirmUnanswered: false,
          }),
        /chưa trả lời/,
      );
      view = await service.execute(quiz, {
        type: "quiz-submit",
        submissionId: first,
        confirmUnanswered: true,
      });
      assert.equal(view.submission!.quizPercent, 0);
      assert.equal(view.submission!.isPassed, false);
      assert.equal(view.submission!.review.length, 3);
      await assert.rejects(
        () =>
          service.execute(quiz, {
            type: "quiz-submit",
            submissionId: first,
            confirmUnanswered: true,
          }),
        /đã nộp/,
      );
      view = await service.execute(quiz, {
        type: "quiz-retake",
        submissionId: first,
      });
      const second = view.submission!.id;
      assert.equal(view.submission!.answers.length, 0);
      assert.equal(view.previousScore, 0);
      await assert.rejects(
        () =>
          service.execute(quiz, {
            type: "quiz-answer",
            submissionId: first,
            questionId: f.questions[0]!.id,
            optionId: f.questions[0]!.options[0]!.id,
          }),
        /đã thay đổi/,
      );
      for (const q of f.questions)
        await service.execute(quiz, {
          type: "quiz-answer",
          submissionId: second,
          questionId: q.id,
          optionId: q.options.find((o) => o.isCorrect)!.id,
        });
      assert.equal((await service.get(quiz)).submission!.answers.length, 3);
      view = await service.execute(quiz, {
        type: "quiz-submit",
        submissionId: second,
        confirmUnanswered: false,
      });
      assert.equal(view.submission!.quizPercent, 100);
      assert.equal(view.submission!.isPassed, true);
      assert.ok(
        view.submission!.review.every((r) => r.isCorrect && r.explanation),
      );
      assert.equal(
        (await player.get(learner, f.courseId, f.lessonId)).checklist.find(
          (i) => i.key === "quiz",
        )!.done,
        true,
      );
      view = await service.execute(quiz, {
        type: "quiz-retake",
        submissionId: second,
      });
      assert.equal(view.previousScore, 100);
      assert.equal(view.submission!.review.length, 0);
      assert.equal(
        (await player.get(learner, f.courseId, f.lessonId)).checklist.find(
          (i) => i.key === "quiz",
        )!.done,
        false,
      );
      view = await service.execute(quiz, {
        type: "quiz-submit",
        submissionId: view.submission!.id,
        confirmUnanswered: true,
      });
      assert.equal(view.submission!.isPassed, false);

      step = "assignment draft, file, submit and resubmit";
      await assert.rejects(
        () =>
          service.execute(assignment, {
            type: "assignment-submit",
            linkUrl: "",
            answerText: "",
          }),
        /bổ sung/,
      );
      await service.execute(assignment, {
        type: "assignment-draft",
        linkUrl: "invalid draft",
        answerText: "Bản nháp",
      });
      view = await service.get(assignment);
      assert.equal(view.submission!.draft!.answerText, "Bản nháp");
      assert.equal(
        (await player.get(learner, f.courseId, f.lessonId)).checklist.find(
          (i) => i.key === "assignment",
        )!.done,
        false,
      );
      await assert.rejects(
        () =>
          service.execute(assignment, {
            type: "assignment-submit",
            linkUrl: "javascript:alert(1)",
            answerText: "",
          }),
        /Đường dẫn/,
      );
      await assert.rejects(
        () =>
          service.upload(
            assignment,
            "too-big.txt",
            Buffer.alloc(20 * 1024 * 1024 + 1),
          ),
        /vượt quá/,
      );
      storageFails = true;
      await assert.rejects(
        () => service.upload(assignment, "work.txt", Buffer.from("work")),
        /storage outage/,
      );
      storageFails = false;
      view = await service.upload(
        assignment,
        "bài làm.txt",
        Buffer.from("assignment contents"),
      );
      assert.equal(view.submission!.draft!.fileName, "bài làm.txt");
      assert.ok(!JSON.stringify(view).includes("assignments/"));
      assert.equal(
        await new Response(
          (await service.download(assignment, true)).body,
        ).text(),
        "assignment contents",
      );
      await assert.rejects(
        () => service.download({ ...assignment, userId: other }, true),
        /chưa có quyền/,
      );
      view = await service.execute(assignment, {
        type: "assignment-submit",
        linkUrl: "https://example.com/work",
        answerText: "Bài nộp gốc",
      });
      const assignmentId = view.submission!.id;
      assert.equal(view.submission!.status, "pending");
      assert.equal(view.submission!.draft, null);
      assert.equal(
        (await player.get(learner, f.courseId, f.lessonId)).checklist.find(
          (i) => i.key === "assignment",
        )!.done,
        true,
      );
      await service.execute(assignment, {
        type: "assignment-draft",
        linkUrl: "https://example.com/replacement",
        answerText: "Nháp nộp lại",
      });
      view = await service.get(assignment);
      assert.equal(view.submission!.answerText, "Bài nộp gốc");
      assert.equal(view.submission!.draft!.answerText, "Nháp nộp lại");
      await service.execute(assignment, { type: "assignment-cancel" });
      assert.equal((await service.get(assignment)).submission!.draft, null);
      view = await service.execute(assignment, {
        type: "assignment-submit",
        linkUrl: "https://example.com/replacement",
        answerText: "Bài nộp mới",
      });
      assert.equal(view.submission!.id, assignmentId);
      assert.equal(view.submission!.attempt, 1);
      assert.equal(view.submission!.answerText, "Bài nộp mới");

      step = "graded assignment is immutable for learners";
      await tx
        .update(assessmentSubmissions)
        .set({
          status: "graded",
          score: 8.5,
          isPassed: true,
          feedback: "Làm tốt",
          gradedAt: new Date(),
        })
        .where(eq(assessmentSubmissions.id, assignmentId));
      view = await service.get(assignment);
      assert.equal(view.submission!.feedback, "Làm tốt");
      for (const type of ["assignment-draft", "assignment-submit"] as const)
        await assert.rejects(
          () =>
            service.execute(assignment, {
              type,
              linkUrl: "https://example.com/changed",
              answerText: "Changed",
            }),
          /không thể nộp lại/,
        );
      await assert.rejects(
        () => service.execute(assignment, { type: "assignment-cancel" }),
        /không thể nộp lại/,
      );
      await assert.rejects(
        () => service.upload(assignment, "changed.txt", Buffer.from("changed")),
        /không thể nộp lại/,
      );
      const rows = await tx
        .select()
        .from(assessmentSubmissions)
        .where(
          and(
            eq(assessmentSubmissions.assessmentId, f.assignmentId),
            eq(assessmentSubmissions.id, assignmentId),
          ),
        );
      assert.equal(rows[0]!.answerText, "Bài nộp mới");
      throw rollback;
    });
  } catch (error) {
    if (error === rollback)
      console.log(
        "PASS: assessment DB transitions, access/attempt guards, answer secrecy, grading, private file adapter, pending replacement and D6/D8. All verification data rolled back.",
      );
    else {
      console.error(
        `FAIL: assessment verification at ${step}; database details suppressed.`,
      );
      if (error instanceof assert.AssertionError)
        console.error(
          error.message,
          error.stack
            ?.split("\n")
            .filter((line) => line.includes("verify-assessments.ts"))
            .join("\n"),
        );
      else if (error instanceof Error)
        console.error(
          error.name,
          error.stack?.split("\n").slice(1, 3).join("\n"),
        );
      process.exitCode = 1;
    }
  } finally {
    await db.$client.end();
  }
}
void main().catch(() => {
  console.error("Assessment verification could not initialize.");
  process.exitCode = 1;
});
