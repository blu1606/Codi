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
} from "@codi-1/db/schema/coding-exercises";
import { runJavaScript, type RunnerResult } from "@codi-1/coding-runner";
import { loadLearningLessonAccess } from "./learning-path-service";
import { LearningPathError } from "./learning-path-contract";
import {
  codingCommand,
  gradeCoding,
  requireCodingTests,
  requireSolution,
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
  const submissions = await store
    .select()
    .from(assessmentSubmissions)
    .where(
      and(
        eq(assessmentSubmissions.assessmentId, assessment.id),
        eq(assessmentSubmissions.enrollmentId, enrollment.id),
      ),
    )
    .orderBy(desc(assessmentSubmissions.attempt));
  const counted = submissions.filter(
    (s) => s.mode === "submit" && s.status === "graded",
  );
  const failedSubmits = counted.filter((s) => !s.isPassed).length;
  return {
    enrollment,
    assessment,
    exercise,
    tests,
    workspace,
    submissions,
    counted,
    failedSubmits,
  };
}
type Context = Awaited<ReturnType<typeof context>>;
async function project(store: Store, ctx: Context): Promise<CodingView> {
  const {
    assessment: a,
    exercise: e,
    workspace: w,
    tests,
    submissions,
    counted,
  } = ctx;
  const last = submissions.find((s) => s.id === w?.lastRunId);
  const results = last
    ? await store
        .select()
        .from(codingTestResults)
        .where(eq(codingTestResults.submissionId, last.id))
    : [];
  const passed = counted[0]?.isPassed === true;
  const solutionAvailable =
    !!e.solutionCode &&
    !!e.solutionVerifiedAt &&
    (passed || ctx.failedSubmits >= 3);
  const sampleIds = new Set(tests.filter((t) => t.isSample).map((t) => t.id));
  return {
    id: a.id,
    title: a.title,
    instructions: a.instructions,
    language: e.language,
    available: e.language === "javascript",
    starterCode: e.starterCode,
    code: w?.draft ?? e.starterCode,
    hints: e.hints.slice(0, 1 + ctx.failedSubmits),
    lockedHints: Math.max(0, e.hints.length - 1 - ctx.failedSubmits),
    solution:
      solutionAvailable && (passed || w?.solutionViewed)
        ? e.solutionCode
        : null,
    solutionAvailable,
    solutionViewed: w?.solutionViewed ?? false,
    runs: submissions.filter((s) => s.mode !== null).length,
    submits: counted.length,
    failedSubmits: ctx.failedSubmits,
    passed,
    score: counted[0]?.score ?? null,
    // Explicit allowlist: no hidden names, inputs, expected/actual values, errors or console.
    tests: tests
      .filter((t) => t.isSample)
      .map((t) => ({
        id: t.id,
        name: t.name,
        input: t.input,
        expectedOutput: t.expectedOutput,
      })),
    lastRun: last?.codingRun
      ? {
          mode: last.mode!,
          ...last.codingRun,
          passed: results.filter((r) => r.isPassed).length,
          total: results.length,
          hiddenPassed: results.filter(
            (r) => !sampleIds.has(r.testCaseId) && r.isPassed,
          ).length,
          hiddenTotal: results.filter((r) => !sampleIds.has(r.testCaseId))
            .length,
          outcomes: results
            .filter((r) => sampleIds.has(r.testCaseId))
            .map((r) => ({
              id: r.testCaseId,
              passed: r.isPassed,
              actual: r.actualOutput,
              error: r.errorMessage,
              line: last.codingRun!.line,
            })),
        }
      : null,
  };
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
export function createCodingService(
  db: Database,
  runner: Runner = runJavaScript,
) {
  return {
    get: (scope: Scope) =>
      db.transaction(async (tx) => project(tx, await context(tx, scope)), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      }),
    async execute(scope: Scope, raw: CodingCommand): Promise<CodingView> {
      const command = codingCommand.parse(raw);
      return db.transaction(async (tx) => {
        // Shared across server instances: reject a second run instead of queuing unlimited jobs.
        const claim = await tx.execute(
          sql`select pg_try_advisory_xact_lock(hashtextextended(${`coding:${scope.userId}`}, 0)) as acquired`,
        );
        if (!claim.rows[0]?.acquired)
          throw new LearningPathError(
            "Bài tập đang chạy. Vui lòng chờ kết quả.",
            409,
          );
        const ctx = await context(tx, scope, true);
        if (command.type === "draft")
          await workspace(tx, ctx, { draft: command.code });
        else if (command.type === "reset")
          await workspace(tx, ctx, {
            draft: ctx.exercise.starterCode,
            lastRunId: null,
          });
        else if (command.type === "solution") {
          requireSolution(
            ctx.counted[0]?.isPassed === true,
            ctx.failedSubmits,
            !!ctx.exercise.solutionCode && !!ctx.exercise.solutionVerifiedAt,
          );
          await workspace(tx, ctx, { solutionViewed: true });
        } else {
          if (ctx.exercise.language !== "javascript")
            throw new LearningPathError(
              "Dịch vụ chạy Python chưa sẵn sàng. Vui lòng thử lại sau.",
              503,
            );
          const selected = ctx.tests.filter(
            (t) => command.type === "submit" || t.isSample,
          );
          let result: RunnerResult;
          try {
            result = await runner({
              code: command.code,
              tests: selected.map((t) => ({
                id: t.id,
                input: t.input,
                isSample: t.isSample,
              })),
            });
          } catch {
            throw new LearningPathError(
              "Sandbox chưa sẵn sàng. Code của bạn vẫn được giữ; hãy thử lại.",
              503,
            );
          }
          const grade = gradeCoding(selected, result, ctx.assessment.maxScore);
          const now = new Date();
          const [submission] = await tx
            .insert(assessmentSubmissions)
            .values({
              assessmentId: ctx.assessment.id,
              enrollmentId: ctx.enrollment.id,
              attempt: (ctx.submissions[0]?.attempt ?? 0) + 1,
              mode: command.type,
              answerText: command.code,
              status: "graded",
              submittedAt: now,
              gradedAt: now,
              score: grade.score,
              isPassed: command.type === "submit" ? grade.isPassed : null,
              codingRun: {
                solutionViewed: ctx.workspace?.solutionViewed ?? false,
                phase: result.phase,
                durationMs: result.durationMs,
                logs: result.logs,
                line:
                  result.outcomes.find(
                    (o) =>
                      ctx.tests.some((t) => t.id === o.id && t.isSample) &&
                      o.line,
                  )?.line ?? null,
              },
            })
            .returning();
          await tx.insert(codingTestResults).values(
            grade.outcomes.map((o) => ({
              ...o,
              submissionId: submission!.id,
            })),
          );
          await workspace(tx, ctx, {
            draft: command.code,
            lastRunId: submission!.id,
          });
        }
        return project(tx, await context(tx, scope));
      });
    },
  };
}
