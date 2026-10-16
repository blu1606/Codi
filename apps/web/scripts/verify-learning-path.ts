import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { createDb, type Database } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { courses } from "@codi-1/db/schema/courses";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { enrollmentSkillMastery, lessonProgress, pathItems, personalizedLearningPaths } from "@codi-1/db/schema/learning";
import { learningPathJobs } from "@codi-1/db/schema/learning-path-runtime";
import { assessments, assessmentAnswers, assessmentSubmissions, quizQuestions } from "@codi-1/db/schema/assessments";
import { skills, skillPrerequisites } from "@codi-1/db/schema/knowledge-map";
import { aiInteractionLogs } from "@codi-1/db/schema/ai-interaction-logs";
import { createLearningPathService, type PathGenerator } from "../src/lib/learning-path-service";
import { createOnboardingService } from "../src/lib/onboarding-service";
import { seedOnboardingFixture } from "./onboarding-fixture";

async function main() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production") throw new Error("Development DATABASE_URL required");
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  const rollback = new Error("ROLLBACK_LEARNING_PATH_VERIFICATION");
  try {
    await db.transaction(async (tx) => {
      const suffix = randomUUID(); const learner = `path-qa-${suffix}`; const other = `path-other-${suffix}`;
      await tx.insert(user).values([learner, other].map((id) => ({ id, name: "Path transaction verification", email: `${id}@example.invalid`, banned: false })));
      await tx.insert(userRoles).values([learner, other].map((userId) => ({ userId, roleId: "LEARNER" })));
      const fixture = await seedOnboardingFixture(tx, `path-qa-${suffix}`, [learner]);
      const [e] = await tx.select().from(studentEnrollments).where(eq(studentEnrollments.userId, learner)); assert.ok(e);
      const concepts = await tx.select().from(skills).where(eq(skills.courseId, fixture.courseId)).orderBy(asc(skills.id));
      await tx.insert(skillPrerequisites).values([{ skillId: concepts[1]!.id, prerequisiteSkillId: concepts[0]!.id, source: "lecturer", review: "accepted" }, { skillId: concepts[2]!.id, prerequisiteSkillId: concepts[1]!.id, source: "lecturer", review: "accepted" }]);
      let calls = 0;
      const generator: PathGenerator = async (input) => { calls++; return { model: "verification-only", proposal: { rationale: "Kết quả kiểm tra có kiểm soát", lessons: [...input.lessons].reverse().map((l) => ({ lessonId: l.id, reason: "Lý do tiếng Việt", isSkippable: true })) } }; };
      const service = createLearningPathService(tx as unknown as Database, generator);
      const onboarding = createOnboardingService(tx as unknown as Database);
      const get = () => service.get(learner, fixture.courseId);
      const execute = (command: Parameters<typeof service.execute>[2]) => service.execute(learner, fixture.courseId, command);
      const run = () => service.runPending(learner, fixture.courseId);
      assert.equal((await get()).status, "none");
      await assert.rejects(() => service.get(other, fixture.courseId), /chưa có quyền/);
      await assert.rejects(() => service.get("missing-user", fixture.courseId), /đang hoạt động/);
      await assert.rejects(() => service.assertLessonAccess(learner, fixture.courseId, fixture.lessonIds[0]!), /thiết lập/);
      await onboarding.execute(learner, fixture.courseId, { type: "goal-skip" });
      await onboarding.execute(learner, fixture.courseId, { type: "fork-default" });
      let home = await execute({ type: "sync" });
      assert.equal(home.source, "default"); assert.equal(home.showDiagnosticCard, true);
      assert.deepEqual(home.rows.map((r) => r.status), ["next", "locked", "locked"]);
      await assert.rejects(() => service.assertLessonAccess(learner, fixture.courseId, fixture.lessonIds[1]!), /Cần học trước/);
      await assert.rejects(() => execute({ type: "retry" }), /Chỉ có thể/);
      await execute({ type: "dismiss-diagnostic" }); assert.equal((await get()).showDiagnosticCard, false);
      await execute({ type: "review", rating: 4, text: "Hữu ích" }); assert.equal((await get()).review?.rating, 4);
      const map = await service.getKnowledgeMap(learner, fixture.courseId);
      assert.equal(map.confirmed, true); assert.ok(map.nodes.every((n) => n.level === 0)); assert.equal(map.nodes[1]!.locked, true);
      await assert.rejects(() => service.getKnowledgeMap(other, fixture.courseId), /chưa có quyền/);
      await tx.update(courses).set({ knowledgeMapStatus: "stale" }).where(eq(courses.id, fixture.courseId));
      assert.equal((await service.getKnowledgeMap(learner, fixture.courseId)).nodes.length, 0);
      await tx.update(courses).set({ knowledgeMapStatus: "confirmed" }).where(eq(courses.id, fixture.courseId));
      await tx.update(studentEnrollments).set({ pathStatus: "generating", diagnosticStatus: "done" }).where(eq(studentEnrollments.id, e.id));
      await run(); home = await get();
      assert.equal(home.status, "ready"); assert.equal(home.source, "ai"); assert.equal(calls, 1);
      assert.deepEqual(home.rows.map((r) => r.id), fixture.lessonIds); assert.ok(home.rows.every((r) => !r.isSkippable));
      await run(); assert.equal(calls, 1, "Idempotent sync must not call the provider again");
      assert.equal((await tx.select().from(personalizedLearningPaths).where(and(eq(personalizedLearningPaths.enrollmentId, e.id), eq(personalizedLearningPaths.status, "active")))).length, 1);

      const [quiz] = await tx.insert(assessments).values({ courseId: fixture.courseId, lessonId: fixture.lessonIds[0], type: "quiz", title: "Quiz thực", passingScore: 70, status: "published" }).returning(); assert.ok(quiz);
      const questions = await tx.insert(quizQuestions).values([0, 1, 2].map((position) => ({ assessmentId: quiz.id, text: `Câu ${position}`, position }))).returning();
      const [submission] = await tx.insert(assessmentSubmissions).values({ assessmentId: quiz.id, enrollmentId: e.id, attempt: 1, status: "graded", submittedAt: new Date(), score: 0, isPassed: false }).returning(); assert.ok(submission);
      await tx.insert(assessmentAnswers).values(questions.map((q, i) => ({ submissionId: submission.id, questionId: q.id, isUnknown: i === 2, isCorrect: i === 2 ? null : false })));
      const [code] = await tx.insert(assessments).values({ courseId: fixture.courseId, lessonId: fixture.lessonIds[0], type: "coding", title: "Code thực", status: "published" }).returning(); assert.ok(code);
      await tx.insert(assessmentSubmissions).values([{ assessmentId: code.id, enrollmentId: e.id, attempt: 1, mode: "run", status: "graded", submittedAt: new Date(), score: 100, isPassed: true }, { assessmentId: code.id, enrollmentId: e.id, attempt: 2, mode: "submit", status: "graded", submittedAt: new Date(), score: 0, isPassed: false }]);
      // The player owns checklist validation; this fixture represents its committed completion.
      await tx.insert(lessonProgress).values({ enrollmentId: e.id, lessonId: fixture.lessonIds[0]!, status: "completed", studiedAt: new Date(), completedAt: new Date() });
      home = await execute({ type: "sync" }); assert.equal(home.updating, true);
      const [mastery] = await tx.select().from(enrollmentSkillMastery).where(and(eq(enrollmentSkillMastery.enrollmentId, e.id), eq(enrollmentSkillMastery.skillId, concepts[0]!.id)));
      assert.equal(mastery?.evidenceCount, 3, "2 graded answers + 1 code submit; unknown/run do not count");
      await run(); home = await get(); assert.equal(home.rows[0]!.status, "done"); assert.equal(home.rows[1]!.status, "next");
      assert.ok(home.update?.changes.some((c) => c.type === "unlocked")); assert.ok(home.highlights.includes(fixture.lessonIds[1]!));
      const version = home.pathId!; await execute({ type: "ack-highlights", pathId: version }); assert.deepEqual((await get()).highlights, []);
      await assert.rejects(() => execute({ type: "dismiss-update", pathId: version - 1 }), /đã thay đổi/);
      await execute({ type: "dismiss-update", pathId: version }); assert.equal((await get()).update, null);
      await execute({ type: "sync" });
      assert.equal((await tx.select().from(enrollmentSkillMastery).where(and(eq(enrollmentSkillMastery.enrollmentId, e.id), eq(enrollmentSkillMastery.skillId, concepts[0]!.id))))[0]?.evidenceCount, 3);

      // Provider errors and malformed answers both yield a real system fallback version.
      const failing = createLearningPathService(tx as unknown as Database, async () => { throw new Error("provider secret must not reach client/log"); });
      await tx.update(studentEnrollments).set({ pathStatus: "generating" }).where(eq(studentEnrollments.id, e.id));
      await failing.runPending(learner, fixture.courseId); home = await get();
      assert.equal(home.status, "failed"); assert.equal(home.source, "default"); assert.ok(home.rows.every((r) => !r.isSkippable)); assert.equal(home.rows[0]!.status, "done");
      assert.equal((await tx.select().from(assessmentSubmissions).where(eq(assessmentSubmissions.id, submission.id)))[0]?.score, 0);
      home = await execute({ type: "retry" }); assert.equal(home.status, "generating");
      await execute({ type: "sync" });
      const [job] = await tx.select().from(learningPathJobs).where(and(eq(learningPathJobs.enrollmentId, e.id), isNull(learningPathJobs.finishedAt))); assert.ok(job);
      await tx.update(learningPathJobs).set({ leaseToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + 60_000) }).where(eq(learningPathJobs.id, job.id));
      const beforeLease = calls; await run(); assert.equal(calls, beforeLease, "Live worker lease prevents duplicate provider calls");
      await tx.update(learningPathJobs).set({ leaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(learningPathJobs.id, job.id));
      await run(); assert.equal((await get()).status, "ready"); assert.equal(calls, beforeLease + 1);

      await tx.update(studentEnrollments).set({ pathStatus: "generating" }).where(eq(studentEnrollments.id, e.id));
      const stale = createLearningPathService(tx as unknown as Database, async (input, signal) => {
        await tx.update(studentEnrollments).set({ learningGoal: "interview" }).where(eq(studentEnrollments.id, e.id));
        return generator(input, signal);
      });
      const oldPath = (await get()).pathId;
      await stale.runPending(learner, fixture.courseId); assert.equal((await get()).pathId, oldPath, "Old goal output cannot publish");
      await run(); assert.equal((await get()).goal, "interview"); assert.equal((await get()).status, "ready");
      const malformed = createLearningPathService(tx as unknown as Database, async () => ({ model: "verification", proposal: { rationale: "Foreign row", lessons: [{ lessonId: randomUUID(), reason: "bad", isSkippable: true }] } }));
      await tx.update(studentEnrollments).set({ pathStatus: "generating" }).where(eq(studentEnrollments.id, e.id));
      await malformed.runPending(learner, fixture.courseId); assert.equal((await get()).status, "failed");

      await tx.insert(lessonProgress).values(fixture.lessonIds.slice(1).map((lessonId) => ({ enrollmentId: e.id, lessonId, status: "completed" as const, completedAt: new Date() })));
      await execute({ type: "sync" }); home = await get(); assert.equal(home.complete, true); assert.equal(home.percent, 100);
      assert.equal((await tx.select().from(studentEnrollments).where(eq(studentEnrollments.id, e.id)))[0]?.status, "completed");
      const logs = await tx.select().from(aiInteractionLogs).where(eq(aiInteractionLogs.enrollmentId, e.id));
      assert.ok(logs.some((l) => l.requestType === "generate_path")); assert.ok(logs.some((l) => l.requestType === "update_path"));
      assert.ok(!JSON.stringify(logs).includes("provider secret"));
      await tx.update(studentEnrollments).set({ status: "suspended" }).where(eq(studentEnrollments.id, e.id));
      await assert.rejects(get, /chưa có quyền/);
      await tx.update(studentEnrollments).set({ status: "completed" }).where(eq(studentEnrollments.id, e.id));
      await tx.update(user).set({ banned: true }).where(eq(user.id, learner)); await assert.rejects(get, /đang hoạt động/);
      console.log("Learning-path DB verification passed: owner/role/state guards, prerequisite locks, AI scheduling, system fallback/retry, one active version, BKT idempotency, completion update/highlight acknowledgement, stale output/lease recovery, confirmed-only map, review and completed lessons/scores retained. All fixtures roll back.");
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) { console.error("Learning-path DB verification failed:", error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[redacted]") : "unexpected failure"); process.exitCode = 1; }
  } finally { await db.$client.end(); }
}
void main().catch(() => { console.error("Could not initialize learning-path verification."); process.exitCode = 1; });
