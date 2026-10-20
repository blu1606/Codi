import { describe, expect, it } from "vitest";
import type { TutorialStep } from "@codi-1/db/schema/coding-tutorial";
import {
  initialTutorialProgress,
  tutorialCommand,
  tutorialRun,
  tutorialTransition,
  tutorialView,
} from "./tutorial-contract";
import {
  lessonChecklist,
  requireLessonChecklist,
} from "./lesson-player-contract";

const steps: TutorialStep[] = [
  { title: "Chào mừng", body: "Bấm Chạy.", starter: 'console.log("Codi");' },
  {
    title: "Thực hành",
    body: "Viết inc.",
    starter: "function inc(n) {}",
    tests: [{ name: "inc(1)", input: "inc(1)", expectedOutput: "2" }],
  },
  {
    title: "Lời giải",
    body: "SECRET_BODY",
    starter: "SECRET_CODE",
    isSolution: true,
  },
];
describe("tutorial contract", () => {
  it("projects the first step without leaking other starters, tests or solutions", () => {
    const view = tutorialView(steps, null, false, "javascript", null);
    expect(view).toMatchObject({
      current: 0,
      visited: [0],
      done: false,
      code: steps[0]!.starter,
      fileName: "main.js",
      available: true,
    });
    expect(JSON.stringify(view)).not.toContain("SECRET");
    expect(JSON.stringify(view)).not.toContain("function inc");
  });
  it("allows the mockup's direct step navigation and records completion only at the last step", () => {
    const middle = tutorialTransition(steps, null, false, {
      type: "step",
      step: 1,
    });
    expect(
      tutorialView(steps, middle.progress, false, "javascript", null).done,
    ).toBe(false);
    const last = tutorialTransition(steps, middle.progress, false, {
      type: "step",
      step: 2,
    });
    expect(last.progress.visited).toEqual([0, 1, 2]);
    expect(
      tutorialView(steps, last.progress, false, "javascript", null),
    ).toMatchObject({
      done: true,
      gated: true,
      body: null,
      code: "",
      lastRun: null,
    });
    const back = tutorialTransition(steps, last.progress, false, {
      type: "step",
      step: 0,
    });
    expect(
      tutorialView(steps, back.progress, false, "javascript", null).done,
    ).toBe(true);
    expect(
      JSON.stringify(
        tutorialView(steps, last.progress, false, "javascript", null),
      ),
    ).not.toContain("SECRET");
  });
  it("keeps per-step drafts and results across navigation and only resets the chosen step", () => {
    const p = initialTutorialProgress();
    p.drafts = { "0": "draft zero", "1": "draft one" };
    p.runs = {
      "0": {
        phase: "done",
        logs: ["zero"],
        error: null,
        line: null,
        outcomes: [],
      },
    };
    const reset = tutorialTransition(steps, p, false, {
      type: "reset",
      step: 0,
      confirmed: true,
    });
    expect(reset.progress.drafts).toEqual({ "1": "draft one" });
    expect(reset.progress.runs).toEqual({});
    expect(p.drafts["0"]).toBe("draft zero");
    const next = tutorialTransition(steps, reset.progress, false, {
      type: "step",
      step: 1,
    });
    expect(
      tutorialView(steps, next.progress, false, "javascript", "example.js"),
    ).toMatchObject({ code: "draft one", fileName: "example.js" });
  });
  it.each(["draft", "run", "reset"] as const)(
    "rejects %s against a solution before confirmation",
    (type) => {
      const command =
        type === "reset"
          ? { type, step: 2, confirmed: true as const }
          : { type, step: 2, code: "bypass" };
      expect(() => tutorialTransition(steps, null, false, command)).toThrow(
        "xác nhận",
      );
    },
  );
  it("reveals a solution only after explicit confirmation; rejects invalid step and false confirmation", () => {
    const next = tutorialTransition(steps, null, false, {
      type: "solution",
      step: 2,
      confirmed: true,
    });
    const last = tutorialTransition(steps, next.progress, next.solutionViewed, {
      type: "step",
      step: 2,
    });
    expect(
      tutorialView(steps, last.progress, true, "javascript", null).code,
    ).toBe("SECRET_CODE");
    expect(() =>
      tutorialTransition(steps, null, false, {
        type: "solution",
        step: 0,
        confirmed: true,
      }),
    ).toThrow("không phải lời giải");
    expect(() =>
      tutorialTransition(steps, null, false, { type: "step", step: 3 }),
    ).toThrow("không hợp lệ");
    expect(
      tutorialCommand.safeParse({ type: "solution", step: 2, confirmed: false })
        .success,
    ).toBe(false);
    expect(
      tutorialCommand.safeParse({ type: "step", step: 2, done: true }).success,
    ).toBe(false);
    expect(
      tutorialCommand.safeParse({
        type: "draft",
        step: 1,
        code: "x".repeat(65537),
      }).success,
    ).toBe(false);
  });
  it("projects console errors, line numbers and actual test outcomes from the runner", () => {
    const result = tutorialRun(steps[1]!, {
      phase: "runtime",
      durationMs: 1,
      logs: ["hello"],
      outcomes: [
        {
          id: 1,
          phase: "runtime",
          error: "inc is not defined",
          actual: null,
          line: 2,
        },
      ],
    });
    expect(result).toMatchObject({
      phase: "runtime",
      logs: ["hello"],
      error: "inc is not defined",
      line: 2,
      outcomes: [{ passed: false, actual: null, expected: "2" }],
    });
    expect(
      tutorialRun(steps[1]!, {
        phase: "done",
        durationMs: 1,
        logs: [],
        outcomes: [
          { id: 1, phase: "done", actual: "2", error: null, line: null },
        ],
      }).outcomes[0]!.passed,
    ).toBe(true);
  });
  it("handles unavailable languages and a single-step tutorial", () => {
    expect(tutorialView(steps, null, false, "python", null)).toMatchObject({
      available: false,
      fileName: "main.py",
    });
    expect(
      tutorialView(steps.slice(0, 1), null, false, "javascript", null).done,
    ).toBe(true);
    expect(() => tutorialView([], null, false, "javascript", null)).toThrow(
      "chưa có nội dung",
    );
  });
  it("completion checks tutorial visits on the server while challenges still require a passing submission", () => {
    const assessment = {
      id: 1,
      type: "coding" as const,
      title: "Tutorial",
      passingScore: null,
      maxScore: 100,
    };
    const pending = lessonChecklist(
      false,
      [{ ...assessment, isTutorial: true, tutorialDone: false }],
      [],
    );
    expect(() => requireLessonChecklist(pending)).toThrow();
    expect(
      lessonChecklist(
        false,
        [{ ...assessment, isTutorial: true, tutorialDone: true }],
        [],
      )[0],
    ).toMatchObject({ done: true, tutorial: true });
    expect(lessonChecklist(true, [assessment], [])[0]!.done).toBe(false);
  });
});
