import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import {
  assessments,
  assessmentSubmissions,
} from "@codi-1/db/schema/assessments";
import {
  codingExercises,
  codingTestCases,
  codingTestResults,
  codingWorkspaces,
  codingRunLeases,
} from "@codi-1/db/schema/coding-exercises";
import { runJavaScript } from "@codi-1/coding-runner";
import { loadLearningLessonAccess } from "./learning-path-service";
import { LearningPathError } from "./learning-path-contract";
import {
  codingCommand,
  codingView,
  codingTransition,
  codingSubmission,
  requireCodingTests,
  type CodingCommand,
  type CodingView,
} from "./coding-contract";

type Store = Pick<Database, "select" | "insert" | "update">;
type Scope = {
  userId: string;
  courseId: string;
  lessonId: string;
  assessmentId: number;
};
type Runner = typeof runJavaScript;

async function context(store: Store, scope: Scope, lock = false) {
  const { enrollment } = await loadLearningLessonAccess(
    store,
    scope.userId,
    scope.courseId,
    scope.lessonId,
    lock,
  );
  const [assessment] = await store
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.id, scope.assessmentId),
        eq(assessments.courseId, scope.courseId),
        eq(assessments.lessonId, scope.lessonId),
        eq(assessments.type, "coding"),
        eq(assessments.status, "published"),
        eq(assessments.isDiagnostic, false),
      ),
    );
  if (!assessment)
    throw new LearningPathError("Không tìm thấy bài tập code.", 404);
  const [exercise] = await store
    .select()
    .from(codingExercises)
    .where(eq(codingExercises.assessmentId, assessment.id));
  if (!exercise)
    throw new LearningPathError("Bài tập code chưa sẵn sàng.", 503);
  if (exercise.tutorialSteps?.length)
    throw new LearningPathError(
      "Hãy mở workspace hướng dẫn theo bước của bài này.",
      409,
    );
  const tests = await store
    .select()
    .from(codingTestCases)
    .where(eq(codingTestCases.exerciseId, exercise.id))
    .orderBy(asc(codingTestCases.position));
  requireCodingTests(tests);
  const [workspace] = await store
    .select()
    .from(codingWorkspaces)
    .where(
      and(
        eq(codingWorkspaces.exerciseId, exercise.id),
        eq(codingWorkspaces.enrollmentId, enrollment.id),
      ),
    );
  const scopeFilter = and(
    eq(assessmentSubmissions.assessmentId, assessment.id),
    eq(assessmentSubmissions.enrollmentId, enrollment.id),
  );
  const [summary] = await store
    .select({
      runs: sql<number>`count(*) filter (where ${assessmentSubmissions.mode} is not null)::int`,
      submits: sql<number>`count(*) filter (where ${assessmentSubmissions.mode} = 'submit' and ${assessmentSubmissions.status} = 'graded')::int`,
      failedSubmits: sql<number>`count(*) filter (where ${assessmentSubmissions.mode} = 'submit' and ${assessmentSubmissions.status} = 'graded' and ${assessmentSubmissions.isPassed} is not true)::int`,
      solutionFailedSubmits: sql<number>`count(*) filter (where ${assessmentSubmissions.mode} = 'submit' and ${assessmentSubmissions.status} = 'graded' and ${assessmentSubmissions.isPassed} is not true and coalesce((${assessmentSubmissions.codingRun}->>'solutionEligible')::boolean, ${assessmentSubmissions.codingRun}->>'phase' = 'done'))::int`,
      attempt: sql<number>`coalesce(max(${assessmentSubmissions.attempt}), 0)::int`,
    })
    .from(assessmentSubmissions)
    .where(scopeFilter);
  const [latest] = await store
    .select({
      isPassed: assessmentSubmissions.isPassed,
      score: assessmentSubmissions.score,
    })
    .from(assessmentSubmissions)
    .where(
      and(
        scopeFilter,
        eq(assessmentSubmissions.mode, "submit"),
        eq(assessmentSubmissions.status, "graded"),
      ),
    )
    .orderBy(desc(assessmentSubmissions.attempt))
    .limit(1);
  const [last] = workspace?.lastRunId
    ? await store
        .select({
          mode: assessmentSubmissions.mode,
          codingRun: assessmentSubmissions.codingRun,
        })
        .from(assessmentSubmissions)
        .where(
          and(scopeFilter, eq(assessmentSubmissions.id, workspace.lastRunId)),
        )
        .limit(1)
    : [];
  return {
    enrollment,
    assessment,
    exercise,
    tests,
    workspace,
    summary: summary!,
    latest,
    last,
  };
}
type Context = Awaited<ReturnType<typeof context>>;
async function project(store: Store, ctx: Context): Promise<CodingView> {
  const results =
    ctx.last && ctx.workspace?.lastRunId
      ? await store
          .select({
            testCaseId: codingTestResults.testCaseId,
            isPassed: codingTestResults.isPassed,
            actualOutput: codingTestResults.actualOutput,
            errorMessage: codingTestResults.errorMessage,
            phase: codingTestResults.phase,
            durationMs: codingTestResults.durationMs,
          })
          .from(codingTestResults)
          .where(eq(codingTestResults.submissionId, ctx.workspace.lastRunId))
      : [];
  return codingView(ctx, results);
}
async function workspace(
  store: Store,
  ctx: Context,
  values: Partial<typeof codingWorkspaces.$inferInsert>,
) {
  await store
    .insert(codingWorkspaces)
    .values({
      exerciseId: ctx.exercise.id,
      enrollmentId: ctx.enrollment.id,
      draft: ctx.workspace?.draft ?? ctx.exercise.starterCode,
      ...values,
    })
    .onConflictDoUpdate({
      target: [codingWorkspaces.exerciseId, codingWorkspaces.enrollmentId],
      set: { ...values, updatedAt: new Date() },
    });
}
// Reject a result if the lecturer changed the grading contract while it ran.
function revision(ctx: Context) {
  return JSON.stringify({
    assessment: ctx.assessment,
    exercise: ctx.exercise,
    tests: ctx.tests,
  });
}
export function createCodingService(
  db: Database,
  runner: Runner = runJavaScript,
) {
  const get = (scope: Scope) =>
    db.transaction(async (tx) => project(tx, await context(tx, scope)), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  function execute(
    scope: Scope,
    raw: Extract<CodingCommand, { type: "draft" }>,
  ): Promise<{ saved: true; code: string }>;
  function execute(
    scope: Scope,
    raw: Exclude<CodingCommand, { type: "draft" }>,
  ): Promise<CodingView>;
  function execute(
    scope: Scope,
    raw: CodingCommand,
  ): Promise<CodingView | { saved: true; code: string }>;
  async function execute(
    scope: Scope,
    raw: CodingCommand,
  ): Promise<CodingView | { saved: true; code: string }> {
    const command = codingCommand.parse(raw);
    if (command.type !== "run" && command.type !== "submit") {
      await db.transaction(async (tx) => {
        const ctx = await context(tx, scope, true);
        if (command.type !== "draft") {
          const [lease] = await tx
            .select()
            .from(codingRunLeases)
            .where(eq(codingRunLeases.userId, scope.userId))
            .for("update");
          if (lease && lease.runningUntil > new Date())
            throw new LearningPathError(
              "Bài tập đang chạy. Vui lòng chờ kết quả.",
              409,
            );
        }
        await workspace(tx, ctx, codingTransition(ctx, command).workspace);
      });
      // One bounded snapshot outside the write lock; never reread submission sources.
      return command.type === "draft"
        ? { saved: true, code: command.code }
        : get(scope);
    }
    const token = randomUUID();
    const ctx = await db.transaction(async (tx) => {
      const ctx = await context(tx, scope, true);
      const transition = codingTransition(ctx, command);
      const [lease] = await tx
        .insert(codingRunLeases)
        .values({
          userId: scope.userId,
          token,
          runningUntil: sql`clock_timestamp() + interval '20 seconds'`,
          lastStartedAt: sql`clock_timestamp()`,
        })
        .onConflictDoUpdate({
          target: codingRunLeases.userId,
          set: {
            token,
            runningUntil: sql`clock_timestamp() + interval '20 seconds'`,
            lastStartedAt: sql`clock_timestamp()`,
          },
          setWhere: sql`${codingRunLeases.runningUntil} <= clock_timestamp() and ${codingRunLeases.lastStartedAt} <= clock_timestamp() - interval '2 seconds'`,
        })
        .returning();
      if (!lease) {
        const [existing] = await tx
          .select()
          .from(codingRunLeases)
          .where(eq(codingRunLeases.userId, scope.userId));
        if (existing && existing.runningUntil > new Date())
          throw new LearningPathError(
            "Bài tập đang chạy. Vui lòng chờ kết quả.",
            409,
          );
        throw new LearningPathError(
          "Bạn chạy code quá nhanh. Vui lòng chờ 2 giây rồi thử lại.",
          429,
        );
      }
      // Persist the submitted draft even when the sandbox later becomes unavailable.
      await workspace(tx, ctx, transition.workspace);
      return ctx;
    });
    try {
      let result;
      try {
        result = await runner({
          code: command.code,
          tests: ctx.tests
            .filter((t) => command.type === "submit" || t.isSample)
            .map((t) => ({ id: t.id, input: t.input, isSample: t.isSample })),
        });
      } catch {
        throw new LearningPathError(
          "Sandbox chưa sẵn sàng hoặc đang bận. Code của bạn vẫn được giữ; hãy thử lại.",
          503,
        );
      }
      await db.transaction(async (tx) => {
        const fresh = await context(tx, scope, true);
        const [lease] = await tx
          .select()
          .from(codingRunLeases)
          .where(eq(codingRunLeases.userId, scope.userId))
          .for("update");
        if (!lease || lease.token !== token || lease.runningUntil <= new Date())
          throw new LearningPathError(
            "Lượt chạy đã hết hạn. Vui lòng chạy lại.",
            409,
          );
        if (revision(fresh) !== revision(ctx))
          throw new LearningPathError(
            "Bài tập vừa được cập nhật. Vui lòng chạy lại.",
            409,
          );
        const submission = codingSubmission(ctx, command.type, result);
        const now = new Date();
        const [saved] = await tx
          .insert(assessmentSubmissions)
          .values({
            assessmentId: fresh.assessment.id,
            enrollmentId: fresh.enrollment.id,
            attempt: fresh.summary.attempt + 1,
            mode: command.type,
            answerText: command.code,
            status: "graded",
            submittedAt: now,
            gradedAt: now,
            score: submission.grade.score,
            isPassed: submission.isPassed,
            codingRun: submission.codingRun,
          })
          .returning({ id: assessmentSubmissions.id });
        await tx.insert(codingTestResults).values(
          submission.grade.outcomes.map((o) => ({
            ...o,
            submissionId: saved!.id,
          })),
        );
        // Preserve edits autosaved while the worker was running.
        await workspace(tx, fresh, { lastRunId: saved!.id });
        await tx
          .update(codingRunLeases)
          .set({ runningUntil: sql`clock_timestamp()` })
          .where(
            and(
              eq(codingRunLeases.userId, scope.userId),
              eq(codingRunLeases.token, token),
            ),
          );
      });
    } finally {
      // An old request must never release a newer request's lease.
      await db
        .update(codingRunLeases)
        .set({ runningUntil: sql`clock_timestamp()` })
        .where(
          and(
            eq(codingRunLeases.userId, scope.userId),
            eq(codingRunLeases.token, token),
          ),
        );
    }
    return get(scope);
  }
  return { get, execute };
}
