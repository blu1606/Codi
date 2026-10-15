import { describe, expect, it } from "vitest";
import { assertOnboardingAccess, goalTransition, onboardingCommand, requireDiagnosticState, updateBkt, type Enrollment, type OnboardingCommand } from "./onboarding-contract";

function enrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return { id: 1, userId: "learner", courseId: "course", progress: 40, enrolledAt: new Date(), orderItemId: null, status: "active", completedAt: null,
    learningGoal: null, targetSkillId: null, weeklyGoalMinutes: null, goalSetAt: null, selfAssessedLevel: null, goalDraft: {}, goalStep: 0, goalEditing: false,
    diagnosticQuestionIndex: 0, diagnosticStatus: "none", pathStatus: "none", pathSource: null, lastLessonId: null, lastActiveAt: null, ...overrides };
}
const setup = (e: Enrollment, command: OnboardingCommand) => ({ ...e, ...goalTransition(e, command) });

describe("onboarding goal transitions and guards", () => {
  it("persists each choice and advances exactly one acknowledged step to the fork", () => {
    let e = enrollment();
    for (const [step, value] of [[0, "project"], [1, "basic"], [2, 2]] as const) {
      e = setup(e, { type: "goal-pick", step, value });
      e = setup(e, { type: "goal-next", step });
    }
    expect(e).toMatchObject({ learningGoal: "project", selfAssessedLevel: "basic", weeklyGoalMinutes: 120, diagnosticStatus: "fork", goalDraft: {}, goalStep: 0, progress: 40 });
    expect(e.goalSetAt).toBeInstanceOf(Date);
  });
  it("rejects advancing before choosing, mismatched choice types, and stale repeated steps", () => {
    expect(() => setup(enrollment(), { type: "goal-next", step: 0 })).toThrow("Vui lòng chọn");
    expect(() => setup(enrollment(), { type: "goal-pick", step: 0, value: "solid" })).toThrow();
    expect(() => setup(enrollment({ goalStep: 1 }), { type: "goal-next", step: 0 })).toThrow("Bước thiết lập");
    expect(() => setup(enrollment(), { type: "goal-back", step: 0 })).toThrow();
  });
  it("retains draft choices when going back", () => {
    expect(setup(enrollment({ goalStep: 1, goalDraft: { goal: "interview" } }), { type: "goal-back", step: 1 })).toMatchObject({ goalStep: 0, goalDraft: { goal: "interview" } });
  });
  it("skip uses the contract's finish/new/5 defaults", () => {
    expect(setup(enrollment({ goalDraft: { goal: "project" } }), { type: "goal-skip" })).toMatchObject({ learningGoal: "finish", selfAssessedLevel: "new", weeklyGoalMinutes: 300, diagnosticStatus: "fork" });
  });
  it("forbids silently overwriting an existing goal", () => {
    expect(() => setup(enrollment({ goalSetAt: new Date() }), { type: "goal-skip" })).toThrow("Chỉnh mục tiêu");
    expect(() => setup(enrollment(), { type: "goal-edit" })).toThrow();
  });
  it("editing preserves diagnostic, completion and existing path source, then requests a re-plan", () => {
    let e = setup(enrollment({ goalSetAt: new Date(), learningGoal: "finish", selfAssessedLevel: "solid", weeklyGoalMinutes: 600, diagnosticStatus: "done", pathStatus: "ready", pathSource: "ai" }), { type: "goal-edit" });
    expect(e.goalDraft).toEqual({ goal: "finish", level: "solid", hours: 10 });
    for (const step of [0, 1, 2]) e = setup(e, { type: "goal-next", step });
    expect(e).toMatchObject({ diagnosticStatus: "done", pathStatus: "generating", pathSource: "ai", progress: 40, goalEditing: false });
  });
  it("skipping during goal edit also preserves diagnostic progress", () => {
    expect(setup(enrollment({ goalSetAt: new Date(), goalEditing: true, diagnosticStatus: "done" }), { type: "goal-skip" })).toMatchObject({ diagnosticStatus: "done", pathStatus: "generating" });
  });
  it("rejects non-enrollment and suspended enrollment; accepts completed ownership", () => {
    expect(() => assertOnboardingAccess(undefined)).toThrow("chưa đăng ký");
    expect(() => assertOnboardingAccess(enrollment({ status: "suspended" }))).toThrow("tạm ngưng");
    expect(assertOnboardingAccess(enrollment({ status: "completed", completedAt: new Date() })).status).toBe("completed");
  });
  it.each(["none", "fork", "intro", "in-progress", "done", "skipped"] as const)("permits only the allowed diagnostic transition from %s", (diagnosticStatus) => {
    const e = enrollment({ goalSetAt: new Date(), diagnosticStatus });
    expect(() => requireDiagnosticState(e, diagnosticStatus)).not.toThrow();
    expect(() => requireDiagnosticState(e, ...(diagnosticStatus === "done" ? ["intro" as const] : ["done" as const]))).toThrow();
    expect(() => requireDiagnosticState({ ...e, goalEditing: true }, diagnosticStatus)).toThrow();
    expect(() => requireDiagnosticState({ ...e, goalSetAt: null }, diagnosticStatus)).toThrow();
  });
});

describe("diagnostic command boundary", () => {
  it.each([
    { type: "answer", attemptId: 1, questionId: 1, optionId: 4, unknown: true },
    { type: "answer", attemptId: 1, questionId: 1, optionId: null, unknown: false },
    { type: "answer", attemptId: 0, questionId: 1, optionId: 4, unknown: false },
    { type: "submit", attemptId: 1, userId: "victim" },
    { type: "goal-next", step: 3 }, { type: "goal-pick", step: 2, value: 3 },
  ])("rejects contradictory, forged or invalid input %j", (value) => expect(onboardingCommand.safeParse(value).success).toBe(false));
  it("records unknown as an explicit answer without a selected option", () => {
    expect(onboardingCommand.parse({ type: "answer", attemptId: 1, questionId: 2, optionId: null, unknown: true })).toMatchObject({ unknown: true, optionId: null });
  });
});

describe("deterministic BKT mastery", () => {
  const params = { bktPInit: 0.1, bktPLearn: 0.2, bktPGuess: 0.2, bktPSlip: 0.1 };
  it("uses Bayesian evidence followed by the learning transition", () => {
    expect(updateBkt(0.1, true, params)).toBeCloseTo(0.4666666667, 8);
    expect(updateBkt(0.1, false, params)).toBeCloseTo(0.2109589041, 8);
  });
  it("incorporates prior evidence and per-skill parameters", () => {
    expect(updateBkt(0.8, true, params)).toBeGreaterThan(updateBkt(0.1, true, params));
    expect(updateBkt(0.1, true, { ...params, bktPLearn: 0 })).toBeCloseTo(1 / 3);
  });
  it.each([NaN, -0.1, 1.1])("rejects invalid probability %s", (prior) => expect(() => updateBkt(prior, true, params)).toThrow());
  it("rejects non-identifiable guess/slip and handles zero-likelihood observations", () => {
    expect(() => updateBkt(0.5, true, { ...params, bktPGuess: 0.9 })).toThrow();
    expect(updateBkt(0, true, { ...params, bktPGuess: 0 })).toBe(0.2);
  });
});
