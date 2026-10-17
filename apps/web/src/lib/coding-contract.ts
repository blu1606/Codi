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
      durationMs: result.durationMs,
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
      "Lời giải mở khi đạt tất cả test hoặc sau 3 lần nộp chưa đạt.",
      409,
    );
}
