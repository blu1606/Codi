import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createDb, type Database } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { quizOptions } from "@codi-1/db/schema/assessments";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { enrollmentSkillMastery, lessonProgress, personalizedLearningPaths, pathItems } from "@codi-1/db/schema/learning";
import { createOnboardingService } from "../src/lib/onboarding-service";
import { seedOnboardingFixture } from "./onboarding-fixture";

async function main() {
if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production") throw new Error("Development DATABASE_URL required");
const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
const rollback = new Error("ROLLBACK_ONBOARDING_VERIFICATION");
try {
  await db.transaction(async (tx) => {
    const suffix = randomUUID();
    const userId = `onboarding-qa-${suffix}`;
    const second = `onboarding-qa-second-${suffix}`;
    await tx.insert(user).values([userId, second].map((id) => ({ id, name: "Onboarding transaction verification", email: `${id}@example.invalid` })));
    const fixture = await seedOnboardingFixture(tx, `onboarding-qa-${suffix}`, [userId, second]);
    const service = createOnboardingService(tx as unknown as Database);
    const run = (command: Parameters<typeof service.execute>[2]) => service.execute(userId, fixture.courseId, command);
    await assert.rejects(() => service.get("unrelated-owner", fixture.courseId), /chưa đăng ký/);
    await assert.rejects(() => run({ type: "diagnostic-start" }), /Trạng thái/);
    await assert.rejects(() => run({ type: "goal-next", step: 0 }), /Vui lòng chọn/);
    for (const [step, value] of [[0, "project"], [1, "basic"], [2, 5]] as const) {
      await run({ type: "goal-pick", step, value });
      assert.equal((await service.get(userId, fixture.courseId)).enrollment.goalStep, step);
      await run({ type: "goal-next", step });
    }
    await run({ type: "fork-diagnostic" });
    const started = await run({ type: "diagnostic-start" });
    assert.ok(started.attemptId);
    assert.ok(!JSON.stringify(started).includes("isCorrect"), "Answer key must not reach the learner");
    const attemptId = started.attemptId;
    const options = await tx.select().from(quizOptions);
    const q = fixture.questions;
    const correct = options.find((o) => o.questionId === q[0]!.id && o.isCorrect)!;
    const wrong = options.find((o) => o.questionId === q[1]!.id && !o.isCorrect)!;
    await assert.rejects(() => run({ type: "answer", attemptId, questionId: q[0]!.id, optionId: wrong.id, unknown: false }), /không thuộc/);
    await assert.rejects(() => run({ type: "next", attemptId, questionId: q[0]!.id }), /Vui lòng chọn/);
    await run({ type: "answer", attemptId, questionId: q[0]!.id, optionId: correct.id, unknown: false });
    await run({ type: "next", attemptId, questionId: q[0]!.id });
    await assert.rejects(() => run({ type: "next", attemptId, questionId: q[0]!.id }), /Câu hỏi đã thay đổi/);
    await run({ type: "answer", attemptId, questionId: q[1]!.id, optionId: wrong.id, unknown: false });
    await run({ type: "next", attemptId, questionId: q[1]!.id });
    await assert.rejects(() => run({ type: "submit", attemptId }), /mọi câu/);
    await run({ type: "answer", attemptId, questionId: q[2]!.id, optionId: null, unknown: true });
    const resumed = await service.get(userId, fixture.courseId);
    assert.equal(resumed.enrollment.diagnosticQuestionIndex, 2);
    assert.equal(resumed.answers.length, 3);
    const result = await run({ type: "submit", attemptId });
    assert.deepEqual({ ...result.result, concepts: undefined }, { right: 1, wrong: 1, unknown: 1, concepts: undefined });
    const firstMastery = await tx.select().from(enrollmentSkillMastery);
    const repeat = await run({ type: "submit", attemptId });
    assert.deepEqual(repeat.result, result.result);
    assert.deepEqual(await tx.select().from(enrollmentSkillMastery), firstMastery, "Repeat submit must not apply BKT twice");
    assert.deepEqual(result.result?.concepts.map((c) => c.evidenceCount), [1, 1, 0]);
    await run({ type: "request-path" });
    const [enrollment] = await tx.select().from(studentEnrollments).where(and(eq(studentEnrollments.userId, userId), eq(studentEnrollments.courseId, fixture.courseId)));
    assert.ok(enrollment);
    await tx.insert(lessonProgress).values({ enrollmentId: enrollment.id, lessonId: fixture.lessonIds[0]!, status: "completed", studiedAt: new Date(), completedAt: new Date() });
    const [ai] = await tx.insert(personalizedLearningPaths).values({ enrollmentId: enrollment.id, version: 1, generatedBy: "ai", trigger: "diagnostic_completed" }).returning();
    assert.ok(ai);
    await tx.insert(pathItems).values({ pathId: ai.id, lessonId: fixture.lessonIds[0]!, position: 1, isSkippable: true });
    await tx.update(studentEnrollments).set({ pathStatus: "ready", pathSource: "ai" }).where(eq(studentEnrollments.id, enrollment.id));
    const beforeProgress = await tx.select().from(lessonProgress).where(eq(lessonProgress.enrollmentId, enrollment.id));
    await run({ type: "diagnostic-retake" });
    const postponed = await run({ type: "diagnostic-postpone" });
    assert.equal(postponed.enrollment.pathSource, "ai");
    assert.equal(postponed.enrollment.pathStatus, "ready");
    assert.equal((await tx.select().from(personalizedLearningPaths).where(eq(personalizedLearningPaths.enrollmentId, enrollment.id))).length, 1);
    assert.deepEqual(await tx.select().from(lessonProgress).where(eq(lessonProgress.enrollmentId, enrollment.id)), beforeProgress);
    await run({ type: "diagnostic-retake" });
    const retake = await run({ type: "diagnostic-start" });
    assert.notEqual(retake.attemptId, attemptId);
    assert.equal(retake.answers.length, 0);
    await assert.rejects(() => run({ type: "answer", attemptId, questionId: q[0]!.id, optionId: correct.id, unknown: false }), /Lần làm bài/);
    await run({ type: "diagnostic-postpone" });
    await run({ type: "goal-edit" });
    const edited = await run({ type: "goal-skip" });
    assert.equal(edited.enrollment.pathStatus, "generating");
    assert.equal(edited.enrollment.pathSource, "ai");
    assert.deepEqual(await tx.select().from(lessonProgress).where(eq(lessonProgress.enrollmentId, enrollment.id)), beforeProgress);
    await service.execute(second, fixture.courseId, { type: "goal-skip" });
    const defaulted = await service.execute(second, fixture.courseId, { type: "fork-default" });
    assert.equal(defaulted.enrollment.pathSource, "default");
    const [secondEnrollment] = await tx.select().from(studentEnrollments).where(eq(studentEnrollments.userId, second));
    assert.ok(secondEnrollment);
    const [defaultVersion] = await tx.select().from(personalizedLearningPaths).where(eq(personalizedLearningPaths.enrollmentId, secondEnrollment.id));
    assert.ok(defaultVersion);
    assert.equal((await tx.select().from(pathItems).where(eq(pathItems.pathId, defaultVersion.id))).length, 3);
    await tx.update(studentEnrollments).set({ status: "suspended" }).where(eq(studentEnrollments.id, secondEnrollment.id));
    await assert.rejects(() => service.get(second, fixture.courseId), /tạm ngưng/);
    console.log("Onboarding database verification passed: goals, owner guards, resume, answer validation, grading/BKT, idempotency, late retake, D11 AI path preservation, default path and completion preservation. All fixture rows will roll back.");
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) { console.error("Onboarding database verification failed:", error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[redacted]") : "unexpected failure"); process.exitCode = 1; }
} finally { await db.$client.end(); }
}
void main().catch(() => { console.error("Could not initialize development verification."); process.exitCode = 1; });
