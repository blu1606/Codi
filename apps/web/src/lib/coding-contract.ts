import { z } from "zod";
import type { RunnerResult } from "@codi-1/coding-runner";
import { LearningPathError } from "./learning-path-contract";

const code = z.string().max(65536);
export const codingCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("draft"), code }).strict(),
  z.object({ type: z.literal("run"), code }).strict(),
  z.object({ type: z.literal("submit"), code }).strict(),
  z.object({ type: z.literal("reset"), confirmed: z.literal(true) }).strict(),
  z
    .object({ type: z.literal("solution"), confirmed: z.literal(true) })
    .strict(),
]);
export type CodingCommand = z.infer<typeof codingCommand>;
export type CodingTest = {
  id: number;
  name: string;
  input: string | null;
  expectedOutput: string;
  isSample: boolean;
};
export type CodingView = {
  id: number;
  title: string;
  instructions: string | null;
  language: string;
  available: boolean;
  starterCode: string;
  code: string;
  hints: string[];
  lockedHints: number;
  solution: string | null;
  solutionAvailable: boolean;
  solutionViewed: boolean;
  runs: number;
  submits: number;
  failedSubmits: number;
  passed: boolean;
  score: number | null;
  tests: Omit<CodingTest, "isSample">[];
  lastRun: null | {
    mode: "run" | "submit";
    phase: RunnerResult["phase"];
    durationMs: number;
    logs: string[];
    passed: number;
    total: number;
    hiddenPassed: number;
    hiddenTotal: number;
    outcomes: {
      id: number;
      passed: boolean;
      actual: string | null;
      error: string | null;
      line: number | null;
    }[];
  };
};

export function canonical(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v !== null && typeof v === "object")
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, normalize((v as Record<string, unknown>)[k])]),
      );
    return v;
  };
  return JSON.stringify(normalize(value));
}
export function requireCodingTests(tests: CodingTest[]) {
  if (
    !tests.length ||
    tests.length > 100 ||
    !tests.some((t) => t.isSample) ||
    tests.some(
      (t) => (t.input?.length ?? 0) > 10000 || t.expectedOutput.length > 4096,
    )
  )
    throw new LearningPathError(
      "Bài tập chưa có bộ kiểm thử hợp lệ. Vui lòng liên hệ giảng viên.",
      503,
    );
  for (const t of tests) {
    try {
      JSON.parse(t.expectedOutput);
    } catch {
      throw new LearningPathError(
        "Kết quả kiểm thử chưa hợp lệ. Vui lòng liên hệ giảng viên.",
        503,
      );
    }
  }
}
export function gradeCoding(
  tests: CodingTest[],
  result: RunnerResult,
  maxScore: number,
) {
  const outcomes = tests.map((t) => {
    const o = result.outcomes.find((o) => o.id === t.id);
    return {
      testCaseId: t.id,
      isPassed:
        o?.phase === "done" &&
        o.actual === canonical(JSON.parse(t.expectedOutput)),
      actualOutput: o?.actual ?? null,
      phase: o?.phase ?? result.phase,
      errorMessage: o?.error ?? null,
      durationMs: o?.durationMs ?? 0,
    };
  });
  const percent = Math.round(
    (100 * outcomes.filter((o) => o.isPassed).length) / tests.length,
  );
  return {
    outcomes,
    percent,
    score: Math.round(maxScore * percent) / 100,
    isPassed: outcomes.every((o) => o.isPassed),
  };
}
export function requireSolution(
  passed: boolean,
  failedSubmits: number,
  verified: boolean,
) {
  if (!verified || (!passed && failedSubmits < 3))
    throw new LearningPathError(
      "Lời giải mở khi đạt tất cả test hoặc sau 3 lần nộp chạy xong nhưng chưa đạt.",
      409,
    );
}

// Minimal server context: no submission source/history is needed to render a view.
export type CodingContext = {
  assessment: {
    id: number;
    title: string;
    instructions: string | null;
    maxScore: number;
  };
  exercise: {
    language: string;
    starterCode: string;
    hints: string[];
    solutionCode: string | null;
    solutionVerifiedAt: Date | null;
  };
  tests: CodingTest[];
  workspace:
    | { draft: string; solutionViewed: boolean; lastRunId: number | null }
    | undefined;
  summary: {
    runs: number;
    submits: number;
    failedSubmits: number;
    solutionFailedSubmits: number;
    attempt: number;
  };
  latest: { isPassed: boolean | null; score: number | null } | undefined;
  last:
    | {
        mode: "run" | "submit" | null;
        codingRun: {
          phase: RunnerResult["phase"];
          durationMs: number;
          logs: string[];
          line: number | null;
          sampleDurationMs?: number;
        } | null;
      }
    | undefined;
};
export type CodingResultRow = {
  testCaseId: number;
  isPassed: boolean;
  actualOutput: string | null;
  errorMessage: string | null;
  phase: RunnerResult["phase"];
  durationMs: number | null;
};

export function codingView(
  ctx: CodingContext,
  results: CodingResultRow[],
): CodingView {
  const {
    assessment: a,
    exercise: e,
    workspace: w,
    summary,
    latest,
    last,
  } = ctx;
  const passed = latest?.isPassed === true;
  const solutionAvailable =
    !!e.solutionCode &&
    !!e.solutionVerifiedAt &&
    (passed || summary.solutionFailedSubmits >= 3);
  const samples = ctx.tests.filter((t) => t.isSample);
  const sampleIds = new Set(samples.map((t) => t.id));
  const visible = results.filter((r) => sampleIds.has(r.testCaseId));
  const phase = visible.find((r) => r.phase !== "done")?.phase ?? "done";
  return {
    id: a.id,
    title: a.title,
    instructions: a.instructions,
    language: e.language,
    available: e.language === "javascript",
    starterCode: e.starterCode,
    code: w?.draft ?? e.starterCode,
    hints: e.hints.slice(0, 1 + summary.failedSubmits),
    lockedHints: Math.max(0, e.hints.length - 1 - summary.failedSubmits),
    solution:
      solutionAvailable && (passed || w?.solutionViewed)
        ? e.solutionCode
        : null,
    solutionAvailable,
    solutionViewed: w?.solutionViewed ?? false,
    runs: summary.runs,
    submits: summary.submits,
    failedSubmits: summary.failedSubmits,
    passed,
    score: latest?.score ?? null,
    tests: samples.map((t) => ({
      id: t.id,
      name: t.name,
      input: t.input,
      expectedOutput: t.expectedOutput,
    })),
    lastRun:
      last?.codingRun && last.mode
        ? {
            mode: last.mode,
            phase,
            // Only sample execution time is public, rounded to 100ms. Never use total run time.
            // Legacy rows stored total (including hidden) duration per result. Hide it.
            durationMs:
              Math.round((last.codingRun.sampleDurationMs ?? 0) / 100) * 100,
            logs: [...last.codingRun.logs],
            passed: results.filter((r) => r.isPassed).length,
            total: results.length,
            hiddenPassed: results.filter(
              (r) => !sampleIds.has(r.testCaseId) && r.isPassed,
            ).length,
            hiddenTotal: results.filter((r) => !sampleIds.has(r.testCaseId))
              .length,
            outcomes: visible.map((r) => ({
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

export function codingTransition(ctx: CodingContext, raw: CodingCommand) {
  const command = codingCommand.parse(raw);
  if (command.type === "draft")
    return { type: command.type, workspace: { draft: command.code } };
  if (command.type === "reset")
    return {
      type: command.type,
      workspace: { draft: ctx.exercise.starterCode, lastRunId: null },
    };
  if (command.type === "solution") {
    requireSolution(
      ctx.latest?.isPassed === true,
      ctx.summary.solutionFailedSubmits,
      !!ctx.exercise.solutionCode && !!ctx.exercise.solutionVerifiedAt,
    );
    return { type: command.type, workspace: { solutionViewed: true } };
  }
  if (ctx.exercise.language !== "javascript")
    throw new LearningPathError(
      "Dịch vụ chạy Python chưa sẵn sàng. Vui lòng thử lại sau.",
      503,
    );
  requireCodingTests(ctx.tests);
  return {
    type: command.type,
    workspace: { draft: command.code },
    tests: ctx.tests.filter((t) => command.type === "submit" || t.isSample),
  };
}

export function codingSubmission(
  ctx: CodingContext,
  mode: "run" | "submit",
  result: RunnerResult,
) {
  const selected = ctx.tests.filter((t) => mode === "submit" || t.isSample);
  const grade = gradeCoding(selected, result, ctx.assessment.maxScore);
  const sampleIds = new Set(
    ctx.tests.filter((t) => t.isSample).map((t) => t.id),
  );
  const sampleDurationMs =
    Math.round(
      result.outcomes
        .filter((o) => sampleIds.has(o.id))
        .reduce((n, o) => n + (o.durationMs ?? 0), 0) / 100,
    ) * 100;
  return {
    grade,
    isPassed: mode === "submit" ? grade.isPassed : null,
    attempt: ctx.summary.attempt + 1,
    codingRun: {
      solutionViewed: ctx.workspace?.solutionViewed ?? false,
      solutionEligible:
        result.outcomes.length === selected.length &&
        result.outcomes.every((o) => o.phase === "done"),
      phase:
        result.outcomes.find((o) => sampleIds.has(o.id) && o.phase !== "done")
          ?.phase ?? "done",
      durationMs: sampleDurationMs,
      sampleDurationMs,
      logs: result.logs,
      line:
        result.outcomes.find((o) => sampleIds.has(o.id) && o.line)?.line ??
        null,
    },
  };
}
