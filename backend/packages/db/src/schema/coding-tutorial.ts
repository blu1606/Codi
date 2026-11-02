// Persisted tutorial content and per-enrollment progress (STATE-MACHINES.md §12).
export type TutorialStep = {
  title: string;
  body: string;
  starter: string;
  isSolution?: boolean;
  tests?: { name: string; input: string; expectedOutput: string }[];
};
export type TutorialRun = {
  phase: "done" | "syntax" | "runtime" | "timeout";
  logs: string[];
  error: string | null;
  line: number | null;
  outcomes: {
    name: string;
    passed: boolean;
    actual: string | null;
    expected: string;
  }[];
};
export type TutorialProgress = {
  current: number;
  visited: number[];
  drafts: Record<string, string>;
  runs: Record<string, TutorialRun>;
};
