import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createDb, type Database } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import {
  assessments,
  assessmentSubmissions,
} from "@codi-1/db/schema/assessments";
import {
  codingExercises,
  codingTestCases,
} from "@codi-1/db/schema/coding-exercises";
import { lessonProgress } from "@codi-1/db/schema/learning";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { courseLessons } from "@codi-1/db/schema/course-content";
import { createCodingService } from "../src/lib/coding-service";
import { createLessonPlayerService } from "../src/lib/lesson-player-service";
import { createOnboardingService } from "../src/lib/onboarding-service";
import { seedCodingFixture, codingSolution } from "./coding-fixture";

async function main() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production")
    throw new Error("Development DATABASE_URL required");
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  const rollback = new Error("ROLLBACK_CODING");
  let step = "initialize";
  try {
    await db.transaction(async (tx) => {
      const suffix = randomUUID(),
        learner = `coding-${suffix}`,
        other = `coding-other-${suffix}`;
      await tx
        .insert(user)
        .values(
          [learner, other].map((id) => ({
            id,
            name: "Coding verification",
            email: `${id}@example.invalid`,
            banned: false,
          })),
        );
      await tx
        .insert(userRoles)
        .values(
          [learner, other].map((userId) => ({ userId, roleId: "LEARNER" })),
        );
      const f = await seedCodingFixture(tx, `coding-qa-${suffix}`, [learner]);
      const database = tx as unknown as Database;
      const service = createCodingService(database);
      const player = createLessonPlayerService(database);
      const scope = {
        userId: learner,
        courseId: f.courseId,
        lessonId: f.lessonId,
        assessmentId: f.codingId,
      };
      step = "ownership, onboarding, role, publication and scope guards";
      await assert.rejects(() => service.get(scope), /thiết lập/);
      const onboarding = createOnboardingService(database);
      await onboarding.execute(learner, f.courseId, { type: "goal-skip" });
      await onboarding.execute(learner, f.courseId, { type: "fork-default" });
      await assert.rejects(
        () => service.get({ ...scope, userId: other }),
        /chưa có quyền/,
      );
      await assert.rejects(
        () =>
          service.execute(
            { ...scope, userId: other },
            { type: "run", code: codingSolution },
          ),
        /chưa có quyền/,
      );
      await assert.rejects(
        () => service.get({ ...scope, assessmentId: f.assessmentId }),
        /Không tìm thấy/,
      );
      await tx.update(user).set({ banned: true }).where(eq(user.id, learner));
      await assert.rejects(() => service.get(scope), /đang hoạt động/);
      await tx.update(user).set({ banned: false }).where(eq(user.id, learner));
      await tx
        .update(courseLessons)
        .set({ isPublished: false })
        .where(eq(courseLessons.id, f.lessonId));
      await assert.rejects(() => service.get(scope), /Không tìm thấy/);
      await tx
        .update(courseLessons)
        .set({ isPublished: true })
        .where(eq(courseLessons.id, f.lessonId));
      await tx
        .update(assessments)
        .set({ status: "disabled" })
        .where(eq(assessments.id, f.codingId));
      await assert.rejects(() => service.get(scope), /Không tìm thấy/);
      await tx
        .update(assessments)
        .set({ status: "published" })
        .where(eq(assessments.id, f.codingId));
      step = "initial projection, solution lock and saved draft";
      const initial = await service.get(scope);
      assert.equal(initial.tests.length, 3);
      assert.equal(initial.solution, null);
      assert.equal(initial.hints.length, 1);
      await assert.rejects(
        () => service.execute(scope, { type: "solution", confirmed: true }),
        /Lời giải mở/,
      );
      await service.execute(scope, { type: "draft", code: codingSolution });
      assert.equal((await service.get(scope)).code, codingSolution);
      await assert.rejects(
        () =>
          player.execute(learner, f.courseId, f.lessonId, { type: "complete" }),
        /code|hoàn thành/i,
      );
      step = "sample run never counts; submit includes hidden tests";
      const run = await service.execute(scope, {
        type: "run",
        code: codingSolution,
      });
      assert.equal(run.lastRun?.total, 3);
      assert.equal(run.lastRun?.hiddenTotal, 0);
      assert.equal(run.passed, false);
      assert.equal(run.submits, 0);
      const passed = await service.execute(scope, {
        type: "submit",
        code: codingSolution,
      });
      assert.equal(passed.passed, true);
      assert.equal(passed.score, 100);
      assert.equal(passed.lastRun?.total, 5);
      assert.equal(passed.lastRun?.hiddenPassed, 2);
      assert.equal(passed.lastRun?.outcomes.length, 3);
      const hidden = await tx
        .select()
        .from(codingTestCases)
        .where(
          and(
            eq(codingTestCases.exerciseId, f.exerciseId),
            eq(codingTestCases.isSample, false),
          ),
        );
      for (const t of hidden) {
        assert.ok(!JSON.stringify(passed).includes(t.name));
        assert.ok(!JSON.stringify(passed).includes(t.input!));
      }
      step =
        "D7 latest submit counts; later run and reset preserve the counted result";
      const runtime = await service.execute(scope, {
        type: "run",
        code: "throw new Error('sample failure')",
      });
      assert.equal(runtime.passed, true);
      assert.equal(runtime.score, 100);
      assert.equal(runtime.lastRun?.phase, "runtime");
      const reset = await service.execute(scope, {
        type: "reset",
        confirmed: true,
      });
      assert.equal(reset.passed, true);
      assert.equal(reset.lastRun, null);
      assert.equal(reset.code, initial.starterCode);
      const fail = await service.execute(scope, {
        type: "submit",
        code: "function sumEven() { return 0; }",
      });
      assert.equal(fail.passed, false);
      assert.equal(fail.score, 40);
      assert.equal(fail.submits, 2);
      assert.equal(
        (await player.get(learner, f.courseId, f.lessonId)).checklist.find(
          (i) => i.key === "code",
        )?.done,
        false,
      );
      step =
        "three failures unlock solution; hidden runtime errors/logs stay private";
      await service.execute(scope, {
        type: "submit",
        code: "function sumEven() { return 0; }",
      });
      await service.execute(scope, {
        type: "submit",
        code: "function sumEven() { return 0; }",
      });
      const viewed = await service.execute(scope, {
        type: "solution",
        confirmed: true,
      });
      assert.equal(viewed.solutionViewed, true);
      assert.equal(viewed.solution, codingSolution);
      const privateError = await service.execute(scope, {
        type: "submit",
        code: "function sumEven(a) { if (a.some(x=>x<0)) { console.log(a); throw new Error(JSON.stringify(a)); } return 0; }",
      });
      assert.ok(!JSON.stringify(privateError).includes("[-4,-3,-2,0]"));
      step =
        "timeout and unavailable runner are distinct and keep earlier work";
      const timeout = await createCodingService(database, async (input) => ({
        phase: "timeout",
        durationMs: 3000,
        logs: [],
        outcomes: input.tests.map((t) => ({
          id: t.id,
          actual: null,
          phase: "timeout",
          error: "timeout",
          line: null,
        })),
      })).execute(scope, { type: "run", code: "while(true){}" });
      assert.equal(timeout.lastRun?.phase, "timeout");
      const before = await tx
        .select()
        .from(assessmentSubmissions)
        .where(eq(assessmentSubmissions.assessmentId, f.codingId));
      await assert.rejects(
        () =>
          createCodingService(database, async () => {
            throw Error("unavailable");
          }).execute(scope, { type: "submit", code: codingSolution }),
        /Sandbox chưa sẵn sàng/,
      );
      assert.equal(
        (
          await tx
            .select()
            .from(assessmentSubmissions)
            .where(eq(assessmentSubmissions.assessmentId, f.codingId))
        ).length,
        before.length,
      );
      await tx
        .update(codingExercises)
        .set({ language: "python" })
        .where(eq(codingExercises.id, f.exerciseId));
      assert.equal((await service.get(scope)).available, false);
      await assert.rejects(
        () => service.execute(scope, { type: "run", code: "pass" }),
        /Python chưa sẵn sàng/,
      );
      await tx
        .update(codingExercises)
        .set({ language: "javascript" })
        .where(eq(codingExercises.id, f.exerciseId));
      step = "completion sticks after a later failed submission";
      await service.execute(scope, { type: "submit", code: codingSolution });
      await player.execute(learner, f.courseId, f.lessonId, {
        type: "complete",
      });
      await service.execute(scope, {
        type: "submit",
        code: "function sumEven(){return 0}",
      });
      const [enrollment] = await tx
        .select()
        .from(studentEnrollments)
        .where(
          and(
            eq(studentEnrollments.courseId, f.courseId),
            eq(studentEnrollments.userId, learner),
          ),
        );
      const [progress] = await tx
        .select()
        .from(lessonProgress)
        .where(
          and(
            eq(lessonProgress.enrollmentId, enrollment!.id),
            eq(lessonProgress.lessonId, f.lessonId),
          ),
        );
      assert.equal(progress?.status, "completed");
      console.log(
        "Coding DB checks passed (real WASM runner); all verification data rolled back.",
      );
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) {
      console.error(`Coding verification failed at: ${step}`);
      if (e instanceof assert.AssertionError) console.error(e.message);
      process.exitCode = 1;
    }
  } finally {
    await db.$client.end();
  }
}
void main().catch(() => {
  console.error("Could not initialize coding verification.");
  process.exitCode = 1;
});
