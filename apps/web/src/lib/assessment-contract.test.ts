import { describe, expect, it } from "vitest";
import {
  assessmentCommand,
  assignmentFileLimit,
  gradeQuiz,
  requireAssignment,
  requireEditableAssignment,
  requireQuizQuestions,
  requireUpload,
  type AssignmentDraft,
  type QuizQuestion,
  quizTransition,
  assignmentTransition,
} from "./assessment-contract";
import { lessonChecklist } from "./lesson-player-contract";

const questions: QuizQuestion[] = [1, 2, 3].map((id) => ({
  id,
  text: `Câu ${id}`,
  type: "single_choice",
  points: id,
  explanation: "Giải thích",
  codeSnippet: null,
  options: [
    { id: id * 10, text: "Đúng", isCorrect: true, explanation: null },
    { id: id * 10 + 1, text: "Sai", isCorrect: false, explanation: null },
  ],
}));
const draft: AssignmentDraft = {
  answerText: "",
  linkUrl: "",
  fileKey: null,
  fileName: null,
};
describe("server quiz transitions", () => {
  const state = {
    type: "quiz",
    submission: { id: 2, attempt: 3, status: "draft" as const },
    questions,
    answers: [
      { questionId: 1, selectedOptionId: 10 },
      { questionId: 2, selectedOptionId: 20 },
      { questionId: 3, selectedOptionId: 30 },
    ],
    maxScore: 100,
    passingScore: 70,
  };
  it("opens the first attempt", () =>
    expect(
      quizTransition({ ...state, submission: null }, { type: "quiz-open" }),
    ).toEqual({ type: "create", attempt: 1 }));
  it.each(["draft", "graded"] as const)(
    "open preserves existing %s attempt",
    (status) =>
      expect(
        quizTransition(
          { ...state, submission: { ...state.submission, status } },
          { type: "quiz-open" },
        ).type,
      ).toBe("unchanged"),
  );
  it("retake creates the next attempt only from the latest graded submission", () =>
    expect(
      quizTransition(
        { ...state, submission: { ...state.submission, status: "graded" } },
        { type: "quiz-retake", submissionId: 2 },
      ),
    ).toEqual({ type: "create", attempt: 4 }));
  it.each([
    null,
    { id: 1, attempt: 2, status: "graded" as const },
    { id: 2, attempt: 3, status: "draft" as const },
  ])("rejects a missing, stale or unsubmitted retake: %j", (submission) =>
    expect(() =>
      quizTransition(
        { ...state, submission },
        { type: "quiz-retake", submissionId: 2 },
      ),
    ).toThrow("đã thay đổi"),
  );
  it("saves an answer only on its own question", () =>
    expect(
      quizTransition(state, {
        type: "quiz-answer",
        submissionId: 2,
        questionId: 1,
        optionId: 11,
      }),
    ).toMatchObject({ type: "answer", questionId: 1, optionId: 11 }));
  it.each([
    { questionId: 99, optionId: 10 },
    { questionId: 1, optionId: 20 },
  ])("rejects a foreign question or option %j", (answer) =>
    expect(() =>
      quizTransition(state, {
        type: "quiz-answer",
        submissionId: 2,
        ...answer,
      }),
    ).toThrow("không thuộc"),
  );
  for (const command of [
    { type: "quiz-answer", submissionId: 2, questionId: 1, optionId: 10 },
    { type: "quiz-submit", submissionId: 2, confirmUnanswered: true },
  ] as const) {
    it.each([
      null,
      { id: 1, attempt: 2, status: "draft" as const },
      { id: 2, attempt: 3, status: "pending" as const },
    ])(
      `rejects ${command.type} for missing/stale/non-draft attempt %j`,
      (submission) =>
        expect(() => quizTransition({ ...state, submission }, command)).toThrow(
          "đã nộp hoặc đã thay đổi",
        ),
    );
  }
  it("submits and grades a fully answered draft", () =>
    expect(
      quizTransition(state, {
        type: "quiz-submit",
        submissionId: 2,
        confirmUnanswered: false,
      }),
    ).toMatchObject({
      type: "grade",
      result: { percent: 100, isPassed: true },
    }));
  it("requires explicit confirmation for unanswered questions", () =>
    expect(() =>
      quizTransition(
        { ...state, answers: [] },
        { type: "quiz-submit", submissionId: 2, confirmUnanswered: false },
      ),
    ).toThrow("3 câu chưa trả lời"));
  it("treats confirmed unanswered questions as wrong", () =>
    expect(
      quizTransition(
        { ...state, answers: [] },
        { type: "quiz-submit", submissionId: 2, confirmUnanswered: true },
      ),
    ).toMatchObject({
      type: "grade",
      result: { percent: 0, isPassed: false },
    }));
  it("rejects quiz commands on an assignment", () =>
    expect(() =>
      quizTransition({ ...state, type: "assignment" }, { type: "quiz-open" }),
    ).toThrow("không phải quiz"));
  it("rejects unsupported question types before starting", () =>
    expect(() =>
      quizTransition(
        { ...state, questions: [{ ...questions[0]!, type: "fill_in_blank" }] },
        { type: "quiz-open" },
      ),
    ).toThrow("chưa có bộ câu hỏi hợp lệ"));
});

describe("server assignment transitions", () => {
  const state = {
    type: "assignment",
    submission: null as {
      status: string;
      assignmentDraft: AssignmentDraft | null;
    } | null,
    draft,
    format: "link" as const,
  };
  const fields = { linkUrl: "https://example.com/work", answerText: "Bài làm" };
  it.each([{ status: "draft", assignmentDraft: draft }])(
    "saves a separate draft in %j",
    (submission) =>
    expect(
      assignmentTransition(
        { ...state, submission },
        { type: "assignment-draft", ...fields },
      ),
    ).toEqual({ type: "draft", draft: { ...draft, ...fields } }),
  );
  it.each([{ status: "pending", assignmentDraft: draft }])(
    "submits or replaces the same pending row in %j",
    (submission) =>
    expect(
      assignmentTransition(
        { ...state, submission },
        { type: "assignment-submit", ...fields },
      ),
    ).toEqual({ type: "submit", draft: { ...draft, ...fields } }),
  );
  it("cancels an existing draft without changing submitted content", () =>
    expect(
      assignmentTransition(
        { ...state, submission: { status: "pending", assignmentDraft: draft } },
        { type: "assignment-cancel" },
      ),
    ).toEqual({ type: "cancel" }));
  it.each([null, { status: "pending", assignmentDraft: null }])(
    "rejects cancel without a draft %j",
    (submission) =>
      expect(() =>
        assignmentTransition(
          { ...state, submission },
          { type: "assignment-cancel" },
        ),
      ).toThrow("Không có bản nháp"),
  );
  it.each([
    "assignment-draft",
    "assignment-submit",
    "assignment-cancel",
    "assignment-remove-file",
  ] as const)("rejects %s once graded (D8)", (type) =>
    expect(() =>
      assignmentTransition(
        { ...state, submission: { status: "graded", assignmentDraft: draft } },
        { type, ...fields },
      ),
    ).toThrow("không thể nộp lại"),
  );
  it("removes the draft file and keeps the other fields", () =>
    expect(
      assignmentTransition(
        {
          ...state,
          draft: {
            ...draft,
            ...fields,
            fileKey: "assignments/file",
            fileName: "work.zip",
          },
        },
        { type: "assignment-remove-file" },
      ),
    ).toEqual({ type: "draft", draft: { ...draft, ...fields } }));
  it("rejects removal without a file", () =>
    expect(() =>
      assignmentTransition(state, { type: "assignment-remove-file" }),
    ).toThrow("Không có tệp"));
  it("rejects empty required work", () =>
    expect(() =>
      assignmentTransition(state, {
        type: "assignment-submit",
        linkUrl: "",
        answerText: "",
      }),
    ).toThrow("Cần bổ sung"));
  it("rejects unsafe links", () =>
    expect(() =>
      assignmentTransition(state, {
        type: "assignment-submit",
        linkUrl: "javascript:alert(1)",
        answerText: "",
      }),
    ).toThrow("Đường dẫn"));
  it("rejects assignment commands on a quiz", () =>
    expect(() =>
      assignmentTransition(
        { ...state, type: "quiz" },
        { type: "assignment-draft", ...fields },
      ),
    ).toThrow("không phải bài tập"));
});
describe("quiz grading and commands", () => {
  it("grades by correct questions and rounds to an integer before checking the threshold", () => {
    const result = gradeQuiz(
      questions,
      [
        { questionId: 1, selectedOptionId: 10 },
        { questionId: 2, selectedOptionId: 20 },
      ],
      20,
      67,
    );
    expect(result).toMatchObject({ percent: 67, score: 13.4, isPassed: true });
    expect(result.review[2]?.isCorrect).toBe(false);
    expect(gradeQuiz(questions, [], 100, 70)).toMatchObject({
      percent: 0,
      isPassed: false,
    });
  });
  it("does not allow options from another question", () =>
    expect(() =>
      gradeQuiz(questions, [{ questionId: 1, selectedOptionId: 20 }], 100, 70),
    ).toThrow("không thuộc"));
  it.each(
    [
      [],
      [{ ...questions[0]!, type: "multiple_choice" }],
      [{ ...questions[0]!, options: [] }],
      [
        {
          ...questions[0]!,
          options: questions[0]!.options.map((o) => ({
            ...o,
            isCorrect: true,
          })),
        },
      ],
    ].map((q) => ({ questions: q })),
  )(
    "rejects invalid question sets before a learner starts",
    ({ questions: q }) =>
      expect(() => requireQuizQuestions(q)).toThrow("hợp lệ"),
  );
  it("cannot accept client grades or malformed attempt identifiers", () => {
    expect(
      assessmentCommand.safeParse({
        type: "quiz-submit",
        submissionId: 1,
        confirmUnanswered: true,
        score: 100,
      }).success,
    ).toBe(false);
    expect(
      assessmentCommand.safeParse({
        type: "quiz-answer",
        submissionId: -1,
        questionId: 1,
        optionId: 2,
      }).success,
    ).toBe(false);
  });
  it("preserves the integer percentage at a fractional maxScore boundary without changing legacy scores", () => {
    const a = [
      {
        id: 1,
        type: "quiz" as const,
        title: "quiz",
        passingScore: 70,
        maxScore: 3.33,
      },
    ];
    expect(
      lessonChecklist(true, a, [
        {
          assessmentId: 1,
          attempt: 1,
          mode: null,
          status: "graded",
          score: 2.33,
          quizPercent: 70,
          isPassed: true,
          submittedAt: new Date(),
        },
      ])[1]?.done,
    ).toBe(true);
  });
});
describe("assignment gates (D8)", () => {
  it.each(["draft"])("allows editing %s", (status) =>
    expect(() => requireEditableAssignment(status)).not.toThrow(),
  );
  it("rejects grading-to-resubmission", () =>
    expect(() => requireEditableAssignment("graded")).toThrow(
      "không thể nộp lại",
    ));
  it.each(["file", "link", "text", "file_or_link"] as const)(
    "rejects an empty %s submission",
    (format) =>
      expect(() => requireAssignment(format, draft)).toThrow("bổ sung"),
  );
  it("enforces each configured submission format", () => {
    expect(() =>
      requireAssignment("file", { ...draft, linkUrl: "https://example.com" }),
    ).toThrow();
    expect(() =>
      requireAssignment("link", { ...draft, fileKey: "key" }),
    ).toThrow();
    expect(() =>
      requireAssignment("file", { ...draft, fileKey: "key" }),
    ).not.toThrow();
    expect(() =>
      requireAssignment("link", {
        ...draft,
        linkUrl: "https://example.com/work",
      }),
    ).not.toThrow();
    expect(() =>
      requireAssignment("text", { ...draft, answerText: "Bài làm" }),
    ).not.toThrow();
    expect(() =>
      requireAssignment("file_or_link", { ...draft, fileKey: "key" }),
    ).not.toThrow();
  });
  it.each([
    "javascript:alert(1)",
    "//evil.example",
    "https://user:pass@example.com",
    "invalid",
  ])("rejects unsafe link %s even with a file", (linkUrl) =>
    expect(() =>
      requireAssignment("file_or_link", { ...draft, fileKey: "key", linkUrl }),
    ).toThrow("Đường dẫn"),
  );
  it("clamps uploads to 20MB and respects smaller limits", () => {
    expect(assignmentFileLimit(null)).toBe(20 * 1024 * 1024);
    expect(assignmentFileLimit(50)).toBe(20 * 1024 * 1024);
    expect(assignmentFileLimit(2)).toBe(2 * 1024 * 1024);
    expect(() => requireUpload(1024, "bài làm.zip", 1024)).not.toThrow();
    expect(() => requireUpload(1025, "work.zip", 1024)).toThrow("vượt quá");
    expect(() => requireUpload(0, "work.zip", 1024)).toThrow("trống");
    expect(() => requireUpload(1, "../work.zip", 1024)).toThrow("Tên tệp");
  });
});
