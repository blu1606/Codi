import { z } from "zod";
import type {
  TutorialProgress,
  TutorialRun,
  TutorialStep,
} from "@codi-1/db/schema/coding-tutorial";
import type { RunnerResult } from "@codi-1/coding-runner";
import { LearningPathError } from "./learning-path-contract";

const step = z.number().int().min(0).max(99);
const code = z.string().max(65536);
export const tutorialCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step"), step }).strict(),
  z.object({ type: z.literal("draft"), step, code }).strict(),
  z.object({ type: z.literal("run"), step, code }).strict(),
  z
    .object({ type: z.literal("reset"), step, confirmed: z.literal(true) })
    .strict(),
  z
    .object({ type: z.literal("solution"), step, confirmed: z.literal(true) })
    .strict(),
]);
export type TutorialCommand = z.infer<typeof tutorialCommand>;
export type TutorialView = {
  fileName: string;
  language: string;
  available: boolean;
  current: number;
  visited: number[];
  done: boolean;
  steps: { title: string; isSolution: boolean }[];
  title: string;
  body: string | null;
  gated: boolean;
  code: string;
  lastRun: TutorialRun | null;
};
export const initialTutorialProgress = (): TutorialProgress => ({
  current: 0,
  visited: [0],
  drafts: {},
  runs: {},
});

export function tutorialView(
  steps: TutorialStep[],
  progress: TutorialProgress | null,
  solutionViewed: boolean,
  language: string,
  fileName: string | null,
): TutorialView {
  const p = progress ?? initialTutorialProgress();
  const current = Math.min(Math.max(0, p.current), steps.length - 1);
  const s = steps[current];
  if (!s) throw new LearningPathError("Hướng dẫn chưa có nội dung.", 503);
  const gated = !!s.isSolution && !solutionViewed;
  return {
    fileName: fileName ?? (language === "python" ? "main.py" : "main.js"),
    language,
    available: language === "javascript",
    current,
    visited: p.visited.filter((n) => n >= 0 && n < steps.length),
    done: p.visited.includes(steps.length - 1),
    steps: steps.map((s) => ({ title: s.title, isSolution: !!s.isSolution })),
    title: s.title,
    body: gated ? null : s.body,
    gated,
    code: gated ? "" : (p.drafts[String(current)] ?? s.starter),
    lastRun: gated ? null : (p.runs[String(current)] ?? null),
  };
}

export function tutorialTransition(
  steps: TutorialStep[],
  progress: TutorialProgress | null,
  solutionViewed: boolean,
  raw: TutorialCommand,
) {
  const command = tutorialCommand.parse(raw);
  const s = steps[command.step];
  if (!s) throw new LearningPathError("Bước hướng dẫn không hợp lệ.", 400);
  const p = structuredClone(progress ?? initialTutorialProgress());
  if (command.type === "step") {
    p.current = command.step;
    if (!p.visited.includes(command.step)) p.visited.push(command.step);
  } else if (command.type === "solution") {
    if (!s.isSolution)
      throw new LearningPathError("Bước này không phải lời giải.", 400);
    solutionViewed = true;
  } else {
    if (s.isSolution && !solutionViewed)
      throw new LearningPathError("Hãy xác nhận trước khi xem lời giải.", 403);
    if (command.type === "reset") {
      delete p.drafts[String(command.step)];
      delete p.runs[String(command.step)];
    } else p.drafts[String(command.step)] = command.code;
  }
  return { progress: p, solutionViewed };
}

export function tutorialRun(
  step: TutorialStep,
  result: RunnerResult,
): TutorialRun {
  const error = result.outcomes.find((o) => o.error);
  return {
    phase: result.phase,
    logs: result.logs,
    error: error?.error ?? null,
    line: error?.line ?? null,
    outcomes: (step.tests ?? []).map((t, i) => {
      const o = result.outcomes.find((o) => o.id === i + 1);
      return {
        name: t.name,
        passed: o?.phase === "done" && o.actual === t.expectedOutput,
        actual: o?.actual ?? null,
        expected: t.expectedOutput,
      };
    }),
  };
}
