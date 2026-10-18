import { describe, expect, it } from "vitest";
import {
  codingView,
  codingTransition,
  codingSubmission,
  type CodingContext,
  type CodingResultRow,
} from "./coding-contract";
import type { RunnerResult } from "@codi-1/coding-runner";

const secret = "HIDDEN_SENTINEL_7c145";
function context(): CodingContext {
  return {
    assessment: { id: 1, title: "Exercise", instructions: null, maxScore: 100 },
    exercise: {
      language: "javascript",
      starterCode: "function solve() {}",
      hints: ["one", "two", "three", "four"],
      solutionCode: "VERIFIED_SOLUTION",
      solutionVerifiedAt: new Date(),
    },
    tests: [
      {
        id: 10,
        name: "Sample",
        input: "solve(1)",
        expectedOutput: "2",
        isSample: true,
      },
      {
        id: 20,
        name: secret,
        input: secret,
        expectedOutput: JSON.stringify(secret),
        isSample: false,
      },
    ],
    workspace: { draft: "draft", solutionViewed: false, lastRunId: null },
    summary: {
      runs: 0,
      submits: 0,
      failedSubmits: 0,
      solutionFailedSubmits: 0,
      attempt: 0,
    },
    latest: undefined,
    last: undefined,
  };
}
function result(passed = true): RunnerResult {
  return {
    phase: "done",
    durationMs: 987,
    logs: ["sample log"],
    outcomes: [
      {
        id: 10,
        phase: "done",
        actual: "2",
        error: null,
        line: null,
        durationMs: 24,
      },
      {
        id: 20,
        phase: passed ? "done" : "runtime",
        actual: passed ? JSON.stringify(secret) : null,
        error: passed ? null : secret,
        line: null,
        durationMs: 963,
      },
    ],
  };
}
function apply(ctx: CodingContext, mode: "run" | "submit", r: RunnerResult) {
  const next = codingSubmission(ctx, mode, r);
  ctx.summary.runs++;
  ctx.summary.attempt = next.attempt;
  if (mode === "submit") {
    ctx.summary.submits++;
    if (!next.isPassed) {
      ctx.summary.failedSubmits++;
      if (next.codingRun.solutionEligible) ctx.summary.solutionFailedSubmits++;
    }
    ctx.latest = { isPassed: next.isPassed, score: next.grade.score };
  }
  ctx.last = { mode, codingRun: next.codingRun };
  ctx.workspace!.lastRunId = next.attempt;
  return next.grade.outcomes;
}
describe("coding server transitions (§12 / D7)", () => {
  it("starts idle with one hint and a locked solution", () => {
    expect(codingView(context(), [])).toMatchObject({
      passed: false,
      score: null,
      hints: ["one"],
      lockedHints: 3,
      solutionAvailable: false,
      solution: null,
      lastRun: null,
    });
  });
  it("saves only the draft and resets only draft/lastRun, keeping the grade", () => {
    const ctx = context();
    apply(ctx, "submit", result());
    const draft = codingTransition(ctx, { type: "draft", code: "new draft" });
    Object.assign(ctx.workspace!, draft.workspace);
    expect(codingView(ctx, [])).toMatchObject({
      code: "new draft",
      passed: true,
      score: 100,
    });
    Object.assign(
      ctx.workspace!,
      codingTransition(ctx, { type: "reset", confirmed: true }).workspace,
    );
    // Persistence follows lastRunId; the cleared pointer means no last result is selected.
    ctx.last = undefined;
    expect(codingView(ctx, [])).toMatchObject({
      code: ctx.exercise.starterCode,
      lastRun: null,
      passed: true,
      score: 100,
      submits: 1,
    });
  });
  it("runs samples only and never changes passed/score or unlocks hints", () => {
    const ctx = context();
    const transition = codingTransition(ctx, { type: "run", code: "" });
    expect(transition.tests?.map((t) => t.id)).toEqual([10]);
    apply(ctx, "submit", result());
    const r = result(false);
    r.outcomes = [
      {
        ...r.outcomes[0]!,
        phase: "runtime",
        error: "sample error",
        actual: null,
      },
    ];
    const rows = apply(ctx, "run", r);
    expect(codingView(ctx, rows)).toMatchObject({
      passed: true,
      score: 100,
      submits: 1,
      failedSubmits: 0,
      hints: ["one"],
      lastRun: { phase: "runtime", total: 1 },
    });
  });
  it("submits all tests and a later failing submit replaces the passing grade", () => {
    const ctx = context();
    expect(
      codingTransition(ctx, { type: "submit", code: "" }).tests,
    ).toHaveLength(2);
    apply(ctx, "submit", result());
    const rows = apply(ctx, "submit", result(false));
    expect(codingView(ctx, rows)).toMatchObject({
      passed: false,
      score: 50,
      submits: 2,
      failedSubmits: 1,
      hints: ["one", "two"],
      lockedHints: 2,
    });
  });
  it.each(["syntax", "runtime", "timeout"] as const)(
    "counts a guest %s as a failed submit",
    (phase) => {
      const ctx = context();
      const r = result();
      r.phase = phase;
      r.outcomes = r.outcomes.map((o) => ({
        ...o,
        phase,
        actual: null,
        error: "guest error",
      }));
      const rows = apply(ctx, "submit", r);
      expect(codingView(ctx, rows)).toMatchObject({
        passed: false,
        score: 0,
        failedSubmits: 1,
        lastRun: { phase },
      });
    },
  );
  it("opens verified solutions after passing or three failed submits, with explicit viewing before passing", () => {
    const ctx = context();
    for (let i = 0; i < 3; i++) {
      const r = result();
      r.outcomes[1]!.actual = "0";
      apply(ctx, "submit", r);
    }
    expect(codingView(ctx, [])).toMatchObject({
      solutionAvailable: true,
      solution: null,
      hints: ctx.exercise.hints,
      lockedHints: 0,
    });
    Object.assign(
      ctx.workspace!,
      codingTransition(ctx, { type: "solution", confirmed: true }).workspace,
    );
    expect(codingView(ctx, [])).toMatchObject({
      solutionViewed: true,
      solution: "VERIFIED_SOLUTION",
    });
    const passed = context();
    apply(passed, "submit", result());
    expect(codingView(passed, []).solution).toBe("VERIFIED_SOLUTION");
  });
  it.each([0, 1, 2])(
    "rejects solution viewing after %i failures",
    (failedSubmits) => {
      const ctx = context();
      ctx.summary.failedSubmits = 10;
      ctx.summary.solutionFailedSubmits = failedSubmits;
      expect(() =>
        codingTransition(ctx, { type: "solution", confirmed: true }),
      ).toThrow(/Lời giải mở/);
    },
  );
  it("never exposes an unverified solution even after passing or viewing", () => {
    const ctx = context();
    ctx.exercise.solutionVerifiedAt = null;
    ctx.workspace!.solutionViewed = true;
    apply(ctx, "submit", result());
    expect(() =>
      codingTransition(ctx, { type: "solution", confirmed: true }),
    ).toThrow();
    expect(codingView(ctx, []).solution).toBeNull();
  });
  it("three runtime/syntax/timeout failures never unlock the solution, including hidden-only failures", () => {
    const ctx = context();
    for (const phase of ["syntax", "runtime", "timeout"] as const) {
      const r = result();
      r.outcomes[1]!.phase = phase;
      r.outcomes[1]!.actual = null;
      apply(ctx, "submit", r);
    }
    expect(ctx.summary.solutionFailedSubmits).toBe(0);
    expect(codingView(ctx, [])).toMatchObject({
      failedSubmits: 3,
      solutionAvailable: false,
    });
    expect(() =>
      codingTransition(ctx, { type: "solution", confirmed: true }),
    ).toThrow();
  });
  it.each(["run", "submit"] as const)(
    "rejects unavailable language and invalid tests for %s",
    (type) => {
      const ctx = context();
      ctx.exercise.language = "python";
      expect(() => codingTransition(ctx, { type, code: "" })).toThrow(/Python/);
      ctx.exercise.language = "javascript";
      ctx.tests = [];
      expect(() => codingTransition(ctx, { type, code: "" })).toThrow(
        /kiểm thử/,
      );
    },
  );
  it("rejects missing confirmations, oversized code and client grades at the transition boundary", () => {
    for (const raw of [
      { type: "reset" },
      { type: "solution", confirmed: false },
      { type: "submit", code: "", score: 100 },
      { type: "run", code: "x".repeat(65537) },
    ]) {
      expect(() => codingTransition(context(), raw as never)).toThrow();
    }
  });
});
describe("coding public projection", () => {
  it("omits hidden names, inputs, expected/actual output, errors, ids and phase/timing", () => {
    const ctx = context();
    const submission = codingSubmission(ctx, "submit", result(false));
    ctx.last = {
      mode: "submit",
      codingRun: {
        ...submission.codingRun,
        phase: "timeout",
        durationMs: 3000,
      },
    };
    const rows: CodingResultRow[] = submission.grade.outcomes;
    const view = codingView(ctx, rows);
    expect(JSON.stringify(view)).not.toContain(secret);
    expect(view.tests.map((t) => t.id)).toEqual([10]);
    expect(view.lastRun).toMatchObject({
      phase: "done",
      durationMs: 0,
      hiddenPassed: 0,
      hiddenTotal: 1,
      total: 2,
    });
    const otherHidden = rows.map((r) =>
      r.testCaseId === 20
        ? {
            ...r,
            phase: "timeout" as const,
            durationMs: 9999,
            errorMessage: "another hidden error",
          }
        : r,
    );
    expect(codingView(ctx, otherHidden)).toEqual(view);
  });
  it("rounds only sample timing and uses an allowlist for both metadata and outcomes", () => {
    const ctx = context();
    const r = result();
    r.outcomes[0]!.durationMs = 156;
    const rows = apply(ctx, "submit", r);
    Object.assign(ctx.last!.codingRun!, { private: secret });
    Object.assign(rows[0]!, { private: secret });
    const view = codingView(ctx, rows);
    expect(view.lastRun?.durationMs).toBe(200);
    expect(JSON.stringify(view)).not.toContain(secret);
  });
  it("hides legacy duration values that included hidden tests", () => {
    const ctx = context();
    const rows = apply(ctx, "submit", result());
    delete ctx.last!.codingRun!.sampleDurationMs;
    ctx.last!.codingRun!.durationMs = 2999;
    rows[0]!.durationMs = 2999;
    expect(codingView(ctx, rows).lastRun?.durationMs).toBe(0);
  });
});
