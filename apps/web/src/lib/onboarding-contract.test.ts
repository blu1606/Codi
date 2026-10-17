import { describe, expect, it } from "vitest";
import {
  assertOnboardingAccess,
  diagnosticPolicy,
  goalTransition,
  onboardingCommand,
  requireDiagnosticState,
  showDiagnosticResult,
  updateBkt,
  type DiagnosticContext,
  type Enrollment,
  type OnboardingCommand,
  type OnboardingView,
} from "./onboarding-contract";

function enrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    id: 1,
    userId: "learner",
    courseId: "course",
    progress: 40,
    enrolledAt: new Date(),
    orderItemId: null,
    status: "active",
    completedAt: null,
    learningGoal: null,
    targetSkillId: null,
    weeklyGoalMinutes: null,
    goalSetAt: null,
    selfAssessedLevel: null,
    goalDraft: {},
    goalStep: 0,
    goalEditing: false,
    diagnosticQuestionIndex: 0,
    diagnosticCardDismissedAt: null,
    diagnosticStatus: "none",
    pathStatus: "none",
    pathSource: null,
    lastLessonId: null,
    lastActiveAt: null,
    ...overrides,
  };
}
const setup = (e: Enrollment, command: OnboardingCommand) => ({
  ...e,
  ...goalTransition(e, command),
});

describe("onboarding goal transitions and guards", () => {
  it("persists each choice and advances exactly one acknowledged step to the fork", () => {
    let e = enrollment();
    for (const [step, value] of [
      [0, "project"],
      [1, "basic"],
      [2, 2],
    ] as const) {
      e = setup(e, { type: "goal-pick", step, value });
      e = setup(e, { type: "goal-next", step });
    }
    expect(e).toMatchObject({
      learningGoal: "project",
      selfAssessedLevel: "basic",
      weeklyGoalMinutes: 120,
      diagnosticStatus: "fork",
      goalDraft: {},
      goalStep: 0,
      progress: 40,
    });
    expect(e.goalSetAt).toBeInstanceOf(Date);
  });
  it("rejects advancing before choosing, mismatched choice types, and stale repeated steps", () => {
    expect(() => setup(enrollment(), { type: "goal-next", step: 0 })).toThrow(
      "Vui lòng chọn",
    );
    expect(() =>
      setup(enrollment(), { type: "goal-pick", step: 0, value: "solid" }),
    ).toThrow();
    expect(() =>
      setup(enrollment({ goalStep: 1 }), { type: "goal-next", step: 0 }),
    ).toThrow("Bước thiết lập");
    expect(() => setup(enrollment(), { type: "goal-back", step: 0 })).toThrow();
  });
  it("retains draft choices when going back", () => {
    expect(
      setup(enrollment({ goalStep: 1, goalDraft: { goal: "interview" } }), {
        type: "goal-back",
        step: 1,
      }),
    ).toMatchObject({ goalStep: 0, goalDraft: { goal: "interview" } });
  });
  it("skip uses the contract's finish/new/5 defaults", () => {
    expect(
      setup(enrollment({ goalDraft: { goal: "project" } }), {
        type: "goal-skip",
      }),
    ).toMatchObject({
      learningGoal: "finish",
      selfAssessedLevel: "new",
      weeklyGoalMinutes: 300,
      diagnosticStatus: "fork",
    });
  });
  it("forbids silently overwriting an existing goal", () => {
    expect(() =>
      setup(enrollment({ goalSetAt: new Date() }), { type: "goal-skip" }),
    ).toThrow("Chỉnh mục tiêu");
    expect(() => setup(enrollment(), { type: "goal-edit" })).toThrow();
  });
  it("editing preserves diagnostic, completion and existing path source, then requests a re-plan", () => {
    let e = setup(
      enrollment({
        goalSetAt: new Date(),
        learningGoal: "finish",
        selfAssessedLevel: "solid",
        weeklyGoalMinutes: 600,
        diagnosticStatus: "done",
        pathStatus: "ready",
        pathSource: "ai",
      }),
      { type: "goal-edit" },
    );
    expect(e.goalDraft).toEqual({ goal: "finish", level: "solid", hours: 10 });
    for (const step of [0, 1, 2]) e = setup(e, { type: "goal-next", step });
    expect(e).toMatchObject({
      diagnosticStatus: "done",
      pathStatus: "generating",
      pathSource: "ai",
      progress: 40,
      goalEditing: false,
    });
  });
  it("skipping during goal edit also preserves diagnostic progress", () => {
    expect(
      setup(
        enrollment({
          goalSetAt: new Date(),
          goalEditing: true,
          diagnosticStatus: "done",
        }),
        { type: "goal-skip" },
      ),
    ).toMatchObject({ diagnosticStatus: "done", pathStatus: "generating" });
  });
  it("cancels an edited draft without changing the saved goal, diagnostic, path or progress", () => {
    const saved = enrollment({
      goalSetAt: new Date(),
      learningGoal: "project",
      weeklyGoalMinutes: 600,
      selfAssessedLevel: "solid",
      diagnosticStatus: "done",
      pathStatus: "ready",
      pathSource: "ai",
    });
    let editing = setup(saved, { type: "goal-edit" });
    editing = setup(editing, {
      type: "goal-pick",
      step: 0,
      value: "interview",
    });
    editing = setup(editing, { type: "goal-next", step: 0 });
    expect(setup(editing, { type: "goal-cancel" })).toEqual(saved);
    expect(() => setup(saved, { type: "goal-cancel" })).toThrow(
      "chưa chỉnh sửa",
    );
    expect(() =>
      setup(enrollment({ goalEditing: true }), { type: "goal-cancel" }),
    ).toThrow("chưa chỉnh sửa");
  });
  it("rejects non-enrollment and suspended enrollment; accepts completed ownership", () => {
    expect(() => assertOnboardingAccess(undefined)).toThrow("chưa đăng ký");
    expect(() =>
      assertOnboardingAccess(enrollment({ status: "suspended" })),
    ).toThrow("tạm ngưng");
    expect(
      assertOnboardingAccess(
        enrollment({ status: "completed", completedAt: new Date() }),
      ).status,
    ).toBe("completed");
  });
  it.each(["none", "fork", "intro", "in-progress", "done", "skipped"] as const)(
    "permits only the allowed diagnostic transition from %s",
    (diagnosticStatus) => {
      const e = enrollment({ goalSetAt: new Date(), diagnosticStatus });
      expect(() => requireDiagnosticState(e, diagnosticStatus)).not.toThrow();
      expect(() =>
        requireDiagnosticState(
          e,
          ...(diagnosticStatus === "done"
            ? ["intro" as const]
            : ["done" as const]),
        ),
      ).toThrow();
      expect(() =>
        requireDiagnosticState({ ...e, goalEditing: true }, diagnosticStatus),
      ).toThrow();
      expect(() =>
        requireDiagnosticState({ ...e, goalSetAt: null }, diagnosticStatus),
      ).toThrow();
    },
  );
});

function diagnosticContext(
  status: Enrollment["diagnosticStatus"] = "in-progress",
  overrides: Partial<DiagnosticContext> = {},
): DiagnosticContext {
  return {
    enrollment: enrollment({
      goalSetAt: new Date(),
      diagnosticStatus: status,
      diagnosticQuestionIndex: 1,
    }),
    hasDiagnostic: true,
    questions: [1, 2, 3].map((id) => ({ id, type: "single_choice" })),
    options: [1, 2, 3].flatMap((questionId) => [
      { id: questionId * 10, questionId, isCorrect: true },
      { id: questionId * 10 + 1, questionId, isCorrect: false },
    ]),
    answers: [1, 2, 3].map((questionId) => ({
      questionId,
      selectedOptionId: questionId * 10,
      isUnknown: false,
    })),
    attempt: {
      id: 9,
      status: status === "done" ? "graded" : "draft",
      gradedAt: status === "done" ? new Date("2026-10-16T12:00:00Z") : null,
    },
    activePath: undefined,
    ...overrides,
  };
}

describe("diagnostic command transitions and state guards", () => {
  const transitions: {
    command: OnboardingCommand;
    allowed: Enrollment["diagnosticStatus"][];
    patch: Partial<Enrollment>;
    effect?: string;
  }[] = [
    {
      command: { type: "fork-default" },
      allowed: ["fork"],
      patch: { diagnosticStatus: "skipped" },
      effect: "default-path",
    },
    {
      command: { type: "fork-diagnostic" },
      allowed: ["fork"],
      patch: { diagnosticStatus: "intro", diagnosticQuestionIndex: 0 },
    },
    {
      command: { type: "diagnostic-retake" },
      allowed: ["done", "skipped"],
      patch: { diagnosticStatus: "intro", diagnosticQuestionIndex: 0 },
    },
    {
      command: { type: "diagnostic-postpone" },
      allowed: ["intro"],
      patch: { diagnosticStatus: "skipped" },
      effect: "preserve-path",
    },
    {
      command: { type: "diagnostic-start" },
      allowed: ["intro", "in-progress"],
      patch: { diagnosticStatus: "in-progress" },
      effect: "create-attempt",
    },
    {
      command: {
        type: "answer",
        attemptId: 9,
        questionId: 2,
        optionId: 20,
        unknown: false,
      },
      allowed: ["in-progress"],
      patch: {},
      effect: "save-answer",
    },
    {
      command: { type: "next", attemptId: 9, questionId: 2 },
      allowed: ["in-progress"],
      patch: { diagnosticQuestionIndex: 2 },
    },
    {
      command: { type: "previous", attemptId: 9, questionId: 2 },
      allowed: ["in-progress"],
      patch: { diagnosticQuestionIndex: 0 },
    },
    {
      command: { type: "submit", attemptId: 9 },
      allowed: ["in-progress", "done"],
      patch: { diagnosticStatus: "done" },
      effect: "grade",
    },
    {
      command: { type: "request-path" },
      allowed: ["done"],
      patch: { pathStatus: "generating" },
    },
  ];
  for (const { command, allowed, patch, effect } of transitions) {
    for (const status of [
      "none",
      "fork",
      "intro",
      "in-progress",
      "done",
      "skipped",
    ] as const) {
      it(`${command.type} ${allowed.includes(status) ? "accepts" : "rejects"} ${status}`, () => {
        const ctx = diagnosticContext(status);
        if (command.type === "submit")
          ctx.enrollment.diagnosticQuestionIndex = 2;
        if (!allowed.includes(status)) {
          expect(() => diagnosticPolicy(ctx, command)).toThrow("Trạng thái");
          return;
        }
        const before = structuredClone(ctx);
        const decision = diagnosticPolicy(ctx, command);
        if (command.type === "submit" && status === "done")
          expect(decision).toEqual({ patch: {}, repeatedSubmit: true });
        else if (
          command.type === "diagnostic-start" &&
          status === "in-progress"
        )
          expect(decision).toEqual({ patch: {} });
        else expect(decision).toEqual({ patch, ...(effect ? { effect } : {}) });
        expect(ctx).toEqual(before);
      });
    }
    it(`${command.type} rejects unset goals and goals being edited`, () => {
      const ctx = diagnosticContext(allowed[0]!);
      ctx.enrollment.goalEditing = true;
      expect(() => diagnosticPolicy(ctx, command)).toThrow("Trạng thái");
      ctx.enrollment.goalEditing = false;
      ctx.enrollment.goalSetAt = null;
      expect(() => diagnosticPolicy(ctx, command)).toThrow("Trạng thái");
    });
  }

  it("refuses missing, empty and malformed diagnostics", () => {
    for (const overrides of [
      { hasDiagnostic: false },
      { questions: [] },
      { questions: [{ id: 1, type: "multi_choice" }] },
      { options: [] },
      { options: [{ id: 10, questionId: 1, isCorrect: true }] },
    ]) {
      expect(() =>
        diagnosticPolicy(diagnosticContext("intro", overrides), {
          type: "diagnostic-start",
        }),
      ).toThrow();
    }
    const ctx = diagnosticContext("intro");
    ctx.options[1]!.isCorrect = true;
    expect(() => diagnosticPolicy(ctx, { type: "diagnostic-start" })).toThrow(
      "đang được cập nhật",
    );
  });
  it("accepts predict-output diagnostics and resumes the existing attempt and cursor", () => {
    const ctx = diagnosticContext();
    ctx.questions[0]!.type = "predict_output";
    expect(diagnosticPolicy(ctx, { type: "diagnostic-start" })).toEqual({
      patch: {},
    });
    expect(ctx.enrollment.diagnosticQuestionIndex).toBe(1);
    expect(ctx.answers).toHaveLength(3);
  });
  it.each(["answer", "next", "previous", "submit"] as const)(
    "rejects stale/missing/closed attempts for %s",
    (type) => {
      const command =
        type === "answer"
          ? { type, attemptId: 9, questionId: 2, optionId: 20, unknown: false }
          : { type, attemptId: 9, questionId: 2 };
      for (const attempt of [
        undefined,
        { id: 8, status: "draft", gradedAt: null },
        { id: 9, status: "graded", gradedAt: new Date() },
      ]) {
        expect(() =>
          diagnosticPolicy(
            diagnosticContext("in-progress", { attempt }),
            command,
          ),
        ).toThrow("Lần làm bài");
      }
    },
  );
  it("refuses resuming a missing or closed attempt", () => {
    for (const attempt of [
      undefined,
      { id: 9, status: "graded", gradedAt: new Date() },
    ]) {
      expect(() =>
        diagnosticPolicy(diagnosticContext("in-progress", { attempt }), {
          type: "diagnostic-start",
        }),
      ).toThrow("Lần làm bài");
    }
  });
  it.each(["answer", "next", "previous"] as const)(
    "rejects stale questions for %s",
    (type) => {
      const command =
        type === "answer"
          ? { type, attemptId: 9, questionId: 1, optionId: 10, unknown: false }
          : { type, attemptId: 9, questionId: 1 };
      expect(() => diagnosticPolicy(diagnosticContext(), command)).toThrow(
        "Câu hỏi đã thay đổi",
      );
      const ctx = diagnosticContext();
      ctx.enrollment.diagnosticQuestionIndex = 99;
      expect(() => diagnosticPolicy(ctx, command)).toThrow(
        "Câu hỏi đã thay đổi",
      );
    },
  );
  it("accepts unknown distinctly and refuses options from other questions", () => {
    expect(
      diagnosticPolicy(diagnosticContext(), {
        type: "answer",
        attemptId: 9,
        questionId: 2,
        optionId: null,
        unknown: true,
      }).effect,
    ).toBe("save-answer");
    for (const optionId of [10, 999, null])
      expect(() =>
        diagnosticPolicy(diagnosticContext(), {
          type: "answer",
          attemptId: 9,
          questionId: 2,
          optionId,
          unknown: false,
        }),
      ).toThrow("không thuộc");
  });
  it("guards navigation boundaries and requires an answer before next", () => {
    const ctx = diagnosticContext("in-progress", { answers: [] });
    expect(() =>
      diagnosticPolicy(ctx, { type: "next", attemptId: 9, questionId: 2 }),
    ).toThrow("Vui lòng chọn");
    expect(
      diagnosticPolicy(ctx, { type: "previous", attemptId: 9, questionId: 2 })
        .patch.diagnosticQuestionIndex,
    ).toBe(0);
    ctx.enrollment.diagnosticQuestionIndex = 0;
    expect(() =>
      diagnosticPolicy(ctx, { type: "previous", attemptId: 9, questionId: 1 }),
    ).toThrow("Không thể chuyển");
    ctx.enrollment.diagnosticQuestionIndex = 2;
    expect(() =>
      diagnosticPolicy(ctx, { type: "next", attemptId: 9, questionId: 3 }),
    ).toThrow("Không thể chuyển");
  });
  it("grades only on the last question with all answers still valid", () => {
    const ctx = diagnosticContext();
    expect(() =>
      diagnosticPolicy(ctx, { type: "submit", attemptId: 9 }),
    ).toThrow("hoàn thành");
    ctx.enrollment.diagnosticQuestionIndex = 2;
    ctx.answers.pop();
    expect(() =>
      diagnosticPolicy(ctx, { type: "submit", attemptId: 9 }),
    ).toThrow("mọi câu");
    ctx.answers.push({
      questionId: 3,
      selectedOptionId: 999,
      isUnknown: false,
    });
    expect(() =>
      diagnosticPolicy(ctx, { type: "submit", attemptId: 9 }),
    ).toThrow("Nội dung");
    ctx.answers[2] = { questionId: 3, selectedOptionId: null, isUnknown: true };
    expect(diagnosticPolicy(ctx, { type: "submit", attemptId: 9 }).effect).toBe(
      "grade",
    );
  });
  it("returns the same graded submission without grading again, rejecting a different attempt", () => {
    const ctx = diagnosticContext("done");
    expect(diagnosticPolicy(ctx, { type: "submit", attemptId: 9 })).toEqual({
      patch: {},
      repeatedSubmit: true,
    });
    expect(() =>
      diagnosticPolicy(ctx, { type: "submit", attemptId: 8 }),
    ).toThrow("Lần làm bài");
    ctx.attempt = undefined;
    expect(() =>
      diagnosticPolicy(ctx, { type: "submit", attemptId: 9 }),
    ).toThrow("Lần làm bài");
  });
});

describe("diagnostic result and path revisits", () => {
  it.each(["none", "generating", "ready", "failed"] as const)(
    "shows result implicitly only with no path: %s",
    (pathStatus) => {
      const data = {
        enrollment: { diagnosticStatus: "done", pathStatus },
        result: { right: 1, wrong: 1, unknown: 1, concepts: [] },
      } as unknown as OnboardingView;
      expect(showDiagnosticResult(data)).toBe(pathStatus === "none");
      expect(showDiagnosticResult(data, true)).toBe(true);
      expect(showDiagnosticResult({ ...data, result: null }, true)).toBe(false);
      expect(
        showDiagnosticResult(
          {
            ...data,
            enrollment: { ...data.enrollment, diagnosticStatus: "in-progress" },
          },
          true,
        ),
      ).toBe(false);
    },
  );
  it("rejects done + ready until there is diagnostic evidence newer than the path", () => {
    const ctx = diagnosticContext("done");
    ctx.enrollment.pathStatus = "ready";
    expect(() => diagnosticPolicy(ctx, { type: "request-path" })).toThrow(
      "đã sẵn sàng",
    );
    ctx.activePath = {
      createdAt: new Date("2026-10-16T12:01:00Z"),
      sourceSubmissionId: null,
    };
    expect(() => diagnosticPolicy(ctx, { type: "request-path" })).toThrow(
      "đã sẵn sàng",
    );
    ctx.activePath.createdAt = ctx.attempt!.gradedAt!;
    expect(() => diagnosticPolicy(ctx, { type: "request-path" })).toThrow(
      "đã sẵn sàng",
    );
    ctx.activePath.createdAt = new Date("2026-10-16T11:59:00Z");
    expect(diagnosticPolicy(ctx, { type: "request-path" }).patch).toEqual({
      pathStatus: "generating",
    });
    ctx.activePath.sourceSubmissionId = ctx.attempt!.id;
    expect(() => diagnosticPolicy(ctx, { type: "request-path" })).toThrow(
      "đã sẵn sàng",
    );
  });
  it.each(["none", "failed", "generating"] as const)(
    "requests/retries once from %s",
    (pathStatus) => {
      const ctx = diagnosticContext("done");
      ctx.enrollment.pathStatus = pathStatus;
      expect(diagnosticPolicy(ctx, { type: "request-path" }).patch).toEqual(
        pathStatus === "generating" ? {} : { pathStatus: "generating" },
      );
      ctx.attempt = undefined;
      expect(() => diagnosticPolicy(ctx, { type: "request-path" })).toThrow(
        "chưa có kết quả mới",
      );
    },
  );
});

describe("diagnostic command boundary", () => {
  it.each([
    { type: "answer", attemptId: 1, questionId: 1, optionId: 4, unknown: true },
    {
      type: "answer",
      attemptId: 1,
      questionId: 1,
      optionId: null,
      unknown: false,
    },
    {
      type: "answer",
      attemptId: 0,
      questionId: 1,
      optionId: 4,
      unknown: false,
    },
    { type: "submit", attemptId: 1, userId: "victim" },
    { type: "goal-next", step: 3 },
    { type: "goal-pick", step: 2, value: 3 },
  ])("rejects contradictory, forged or invalid input %j", (value) =>
    expect(onboardingCommand.safeParse(value).success).toBe(false),
  );
  it("records unknown as an explicit answer without a selected option", () => {
    expect(
      onboardingCommand.parse({
        type: "answer",
        attemptId: 1,
        questionId: 2,
        optionId: null,
        unknown: true,
      }),
    ).toMatchObject({ unknown: true, optionId: null });
  });
});

describe("deterministic BKT mastery", () => {
  const params = {
    bktPInit: 0.1,
    bktPLearn: 0.2,
    bktPGuess: 0.2,
    bktPSlip: 0.1,
  };
  it("uses Bayesian evidence followed by the learning transition", () => {
    expect(updateBkt(0.1, true, params)).toBeCloseTo(0.4666666667, 8);
    expect(updateBkt(0.1, false, params)).toBeCloseTo(0.2109589041, 8);
  });
  it("incorporates prior evidence and per-skill parameters", () => {
    expect(updateBkt(0.8, true, params)).toBeGreaterThan(
      updateBkt(0.1, true, params),
    );
    expect(updateBkt(0.1, true, { ...params, bktPLearn: 0 })).toBeCloseTo(
      1 / 3,
    );
  });
  it.each([NaN, -0.1, 1.1])("rejects invalid probability %s", (prior) =>
    expect(() => updateBkt(prior, true, params)).toThrow(),
  );
  it("rejects non-identifiable guess/slip and handles zero-likelihood observations", () => {
    expect(() => updateBkt(0.5, true, { ...params, bktPGuess: 0.9 })).toThrow();
    expect(updateBkt(0, true, { ...params, bktPGuess: 0 })).toBe(0.2);
  });
});
