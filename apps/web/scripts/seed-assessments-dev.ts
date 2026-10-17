import { and, eq, isNull, like } from "drizzle-orm";
import { createDb } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { assessmentSubmissions } from "@codi-1/db/schema/assessments";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { createOnboardingService } from "../src/lib/onboarding-service";
import { createAssessmentService } from "../src/lib/assessment-service";
import { seedAssessmentFixture } from "./assessment-fixture";

async function main() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production")
    throw new Error("Development DATABASE_URL required");
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  try {
    const accounts = await db
      .select({ id: user.id })
      .from(user)
      .innerJoin(userRoles, eq(userRoles.userId, user.id))
      .where(
        and(
          like(user.email, "%+student@%"),
          like(user.name, "%(Student)"),
          eq(user.banned, false),
          eq(userRoles.roleId, "LEARNER"),
          isNull(userRoles.revokedAt),
        ),
      );
    const userIds = [...new Set(accounts.map((a) => a.id))];
    if (!userIds.length) throw new Error("Seeded learners required");
    for (const state of [
      "initial",
      "answering",
      "pass",
      "fail",
      "draft",
      "pending",
      "graded",
    ] as const) {
      const f = await db.transaction((tx) =>
        seedAssessmentFixture(tx, `dev-assessment-${state}`, userIds),
      );
      for (const userId of userIds) {
        const [e] = await db
          .select()
          .from(studentEnrollments)
          .where(
            and(
              eq(studentEnrollments.userId, userId),
              eq(studentEnrollments.courseId, f.courseId),
            ),
          );
        if (e?.goalSetAt) continue; // Re-running this seed never overwrites a learner's existing work.
        const onboarding = createOnboardingService(db);
        await onboarding.execute(userId, f.courseId, { type: "goal-skip" });
        await onboarding.execute(userId, f.courseId, { type: "fork-default" });
        const service = createAssessmentService(db);
        const quiz = {
          userId,
          courseId: f.courseId,
          lessonId: f.lessonId,
          assessmentId: f.quizId,
        };
        const assignment = { ...quiz, assessmentId: f.assignmentId };
        if (["answering", "pass", "fail"].includes(state)) {
          const view = await service.execute(quiz, { type: "quiz-open" });
          if (state !== "fail")
            for (const q of state === "answering"
              ? f.questions.slice(0, 1)
              : f.questions)
              await service.execute(quiz, {
                type: "quiz-answer",
                submissionId: view.submission!.id,
                questionId: q.id,
                optionId: q.options.find((o) => o.isCorrect)!.id,
              });
          if (state !== "answering")
            await service.execute(quiz, {
              type: "quiz-submit",
              submissionId: view.submission!.id,
              confirmUnanswered: true,
            });
        }
        if (["draft", "pending", "graded"].includes(state)) {
          const view = await service.execute(assignment, {
            type: state === "draft" ? "assignment-draft" : "assignment-submit",
            linkUrl: "https://example.com/development-assignment",
            answerText:
              state === "draft"
                ? "Bản nháp được khôi phục từ database."
                : "Bài nộp dùng để kiểm tra giao diện dev.",
          });
          if (state === "graded")
            await db
              .update(assessmentSubmissions)
              .set({
                status: "graded",
                score: 8.5,
                isPassed: true,
                feedback:
                  "Bài làm rõ ràng. Hãy bổ sung kiểm thử cho chuỗi rỗng.",
                gradedAt: new Date(),
              })
              .where(eq(assessmentSubmissions.id, view.submission!.id));
        }
      }
      console.log(`${state}: /learn/${f.courseId}/${f.lessonId}`);
    }
    console.log(
      "Hidden assessment fixtures ready; existing learner work preserved.",
    );
  } catch {
    console.error("Assessment seed failed; database details suppressed.");
    process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}
void main().catch(() => {
  console.error("Could not initialize assessment seed.");
  process.exitCode = 1;
});
