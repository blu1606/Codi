import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { createDb, type Database } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { assessments } from "@codi-1/db/schema/assessments";
import {
  codingExercises,
  codingRunLeases,
} from "@codi-1/db/schema/coding-exercises";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { createTutorialService } from "../src/lib/tutorial-service";
import { createCodingService } from "../src/lib/coding-service";
import { createLessonPlayerService } from "../src/lib/lesson-player-service";
import { createOnboardingService } from "../src/lib/onboarding-service";
import type {
  TutorialCommand,
  TutorialView,
} from "../src/lib/tutorial-contract";
import { seedCodingFixture, codingSolution } from "./coding-fixture";
import {
  codingExerciseFromMockup,
  mockupSnapshot,
} from "./seed-mockup-mapping";

// No migration or seed is applied to the shared database. Coding tables are temporary,
// and all fixture users/courses/activity live in one transaction that always rolls back.
async function main() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production")
    throw new Error("Development DATABASE_URL required");
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  const rollback = new Error("ROLLBACK_TUTORIAL");
  let stage = "connect";
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = '20s'`);
      await tx.execute(sql`set local lock_timeout = '3s'`);
      for (const table of [
        "coding_exercises",
        "coding_workspaces",
        "coding_test_cases",
        "coding_test_results",
        "coding_run_leases",
      ]) {
        await tx.execute(
          sql.raw(
            `create temp table ${table} (like public.${table} including all) on commit drop`,
          ),
        );
      }
      await tx.execute(
        sql`alter table coding_exercises add column if not exists file_name text`,
      );
      await tx.execute(
        sql`alter table coding_exercises add column if not exists tutorial_steps jsonb not null default '[]'`,
      );
      await tx.execute(
        sql`alter table coding_workspaces add column if not exists tutorial_progress jsonb`,
      );
      const suffix = randomUUID();
      const learner = `tutorial-qa-${suffix}`,
        other = `tutorial-other-${suffix}`;
      await tx
        .insert(user)
        .values(
          [learner, other].map((id) => ({
            id,
            name: "Tutorial verification",
            email: `${id}@example.invalid`,
            banned: false,
          })),
        );
      await tx
        .insert(userRoles)
        .values(
          [learner, other].map((userId) => ({ userId, roleId: "LEARNER" })),
        );
      const f = await seedCodingFixture(tx, `tutorial-qa-${suffix}`, [learner]);
      const database = tx as unknown as Database;
      const onboarding = createOnboardingService(database);
      const service = createTutorialService(database);
      const coding = createCodingService(database);
      const player = createLessonPlayerService(database);
      const scope = {
        userId: learner,
        courseId: f.courseId,
        lessonId: f.lessonId,
        assessmentId: f.codingId,
      };
      stage = "onboarding guards";
      await assert.rejects(() => service.get(scope), /thiết lập/);
      await onboarding.execute(learner, f.courseId, { type: "goal-skip" });
      await onboarding.execute(learner, f.courseId, { type: "fork-default" });
      stage = "challenge regression with real runner";
      const challengeRun = await coding.execute(scope, {
        type: "submit",
        code: codingSolution,
      });
      assert.equal(challengeRun.passed, true);
      const allowRun = () =>
        tx
          .update(codingRunLeases)
          .set({ lastStartedAt: new Date(0) })
          .where(eq(codingRunLeases.userId, learner));
      const execute = async (command: TutorialCommand) => {
        if (command.type === "run") await allowRun();
        return service.execute(scope, command);
      };
      const viewAfter = async (command: TutorialCommand) =>
        (await execute(command)) as TutorialView;
      stage = "preserve seven mockup steps";
      const snapshot = mockupSnapshot.parse(
        JSON.parse(
          readFileSync(
            new URL("./data/mockup-seed.json", import.meta.url),
            "utf8",
          ),
        ),
      );
      const tutorial = snapshot.courses
        .flatMap((c) => c.chapters.flatMap((ch) => ch.lessons))
        .find((l) => l.code?.kind === "tutorial")!;
      assert(tutorial?.code);
      const content = codingExerciseFromMockup(tutorial.title, tutorial.code);
      assert.equal(content.tutorialSteps.length, 7);
      await tx
        .update(codingExercises)
        .set({
          fileName: content.fileName,
          tutorialSteps: content.tutorialSteps,
          starterCode: content.starterCode,
        })
        .where(eq(codingExercises.id, f.exerciseId));
      stage = "read projection, checklist, sidebar and access guards";
      const initial = await service.get(scope);
      assert.equal(initial.current, 0);
      assert.equal(initial.steps.length, 7);
      assert.equal(initial.done, false);
      assert.equal(initial.fileName, "main.js");
      assert(initial.code.includes("console.log"));
      await assert.rejects(() => service.get({ ...scope, userId: other }));
      await assert.rejects(() =>
        service.execute({ ...scope, userId: other }, { type: "step", step: 6 }),
      );
      await assert.rejects(() =>
        service.get({ ...scope, lessonId: f.lessonIds[1]! }),
      );
      await assert.rejects(() => coding.get(scope), /hướng dẫn theo bước/);
      const before = await player.get(learner, f.courseId, f.lessonId);
      assert.equal(
        before.path.rows.find((r) => r.id === f.lessonId)?.kind,
        "tutorial",
      );
      assert.equal(before.checklist.find((c) => c.tutorial)?.done, false);
      await assert.rejects(() =>
        player.execute(learner, f.courseId, f.lessonId, { type: "complete" }),
      );
      stage = "drafts survive navigation and reload; reset is per-step";
      const draft = 'console.log("QA draft");';
      await execute({ type: "draft", step: 0, code: draft });
      await execute({ type: "step", step: 1 });
      await execute({ type: "draft", step: 1, code: "const n = 42;" });
      assert.equal((await viewAfter({ type: "step", step: 0 })).code, draft);
      const reloaded = createTutorialService(database);
      assert.equal((await reloaded.get(scope)).code, draft);
      await execute({ type: "reset", step: 0, confirmed: true });
      assert.equal((await service.get(scope)).code, initial.code);
      assert.equal(
        (await viewAfter({ type: "step", step: 1 })).code,
        "const n = 42;",
      );
      stage = "real Console, syntax/runtime/timeout and saved results";
      const successful = await viewAfter({
        type: "run",
        step: 1,
        code: 'console.log("QA Console");',
      });
      assert(
        successful.lastRun?.logs.some((line) => line.includes("QA Console")),
      );
      for (const [code, phase] of [
        ["const = ;", "syntax"],
        ['throw new Error("QA runtime")', "runtime"],
        ["while(true) {}", "timeout"],
      ] as const) {
        const result = await viewAfter({ type: "run", step: 1, code });
        assert.equal(result.lastRun?.phase, phase);
        assert(result.lastRun?.error);
      }
      stage = "solution gate, server guard, completion and sticky visits";
      const last = initial.steps.length - 1;
      const gated = await viewAfter({ type: "step", step: last });
      assert.equal(gated.gated, true);
      assert.equal(gated.code, "");
      assert.equal(gated.body, null);
      await assert.rejects(
        () => execute({ type: "run", step: last, code: "null" }),
        /xác nhận/,
      );
      const revealed = await viewAfter({
        type: "solution",
        step: last,
        confirmed: true,
      });
      assert.equal(revealed.gated, false);
      assert.equal(revealed.code, content.tutorialSteps[last]!.starter);
      await execute({ type: "step", step: 0 });
      assert.equal((await service.get(scope)).done, true);
      assert.equal(
        (await player.get(learner, f.courseId, f.lessonId)).checklist.find(
          (c) => c.tutorial,
        )?.done,
        true,
      );
      const complete = await player.execute(learner, f.courseId, f.lessonId, {
        type: "complete",
      });
      assert.equal(complete.completed, true);
      stage = "unavailable sandbox keeps the last saved draft";
      await allowRun();
      const unavailable = createTutorialService(database, async () => {
        throw new Error("offline");
      });
      await assert.rejects(
        () =>
          unavailable.execute(scope, {
            type: "run",
            step: 0,
            code: "const saved = 1;",
          }),
        /Sandbox chưa sẵn sàng/,
      );
      assert.equal((await service.get(scope)).code, "const saved = 1;");
      stage = "publication and suspended enrollment guards";
      await tx
        .update(assessments)
        .set({ status: "draft" })
        .where(eq(assessments.id, f.codingId));
      await assert.rejects(() =>
        service.execute(scope, { type: "step", step: 0 }),
      );
      await tx
        .update(assessments)
        .set({ status: "published" })
        .where(eq(assessments.id, f.codingId));
      await tx
        .update(studentEnrollments)
        .set({ status: "suspended" })
        .where(
          and(
            eq(studentEnrollments.courseId, f.courseId),
            eq(studentEnrollments.userId, learner),
          ),
        );
      await assert.rejects(() => service.get(scope));
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) {
      console.error(`Tutorial verification failed at: ${stage}`);
      if (e instanceof assert.AssertionError) console.error(e.message);
      // Avoid dumping SQL parameters or connection strings from database errors.
      let cause: unknown = e;
      for (let i = 0; i < 4 && cause instanceof Error; i++) {
        const details = cause as Error & { code?: string; cause?: unknown };
        if (details.code) console.error(`Database error code: ${details.code}`);
        if (details.code === "42702" || details.code === "42703")
          console.error(details.message);
        cause = details.cause;
      }
      process.exitCode = 1;
    } else
      console.log(
        "Tutorial DB/real WASM runner checks passed; all fixtures and temporary tables rolled back.",
      );
  } finally {
    await db.$client.end();
  }
}
void main().catch(() => {
  console.error("Could not initialize tutorial verification.");
  process.exitCode = 1;
});
