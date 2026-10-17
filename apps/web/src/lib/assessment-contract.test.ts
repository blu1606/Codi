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
  it.each([undefined, "draft", "pending"])("allows editing %s", (status) =>
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
