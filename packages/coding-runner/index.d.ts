export type RunPhase = "done" | "syntax" | "runtime" | "timeout";
export type RunnerInput = {
  code: string;
  tests: { id: number; input: string | null; isSample: boolean }[];
  timeoutMs?: number;
};
export type RunnerResult = {
  phase: RunPhase;
  durationMs: number;
  logs: string[];
  outcomes: {
    id: number;
    actual: string | null;
    phase: RunPhase;
    error: string | null;
    line: number | null;
    durationMs?: number;
  }[];
};
export function runJavaScript(input: RunnerInput): Promise<RunnerResult>;
