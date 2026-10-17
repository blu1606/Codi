import { z } from "zod";
import { LearningPathError } from "./learning-path-contract";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const assignmentFields = z
  .object({
    linkUrl: z.string().trim().max(2000),
    answerText: z.string().max(10000),
  })
  .strict();
export const assessmentCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("quiz-open") }).strict(),
  z.object({ type: z.literal("quiz-retake"), submissionId: id }).strict(),
  z
    .object({
      type: z.literal("quiz-answer"),
      submissionId: id,
      questionId: id,
      optionId: id,
    })
    .strict(),
  z
    .object({
      type: z.literal("quiz-submit"),
      submissionId: id,
      confirmUnanswered: z.boolean(),
    })
    .strict(),
  z
    .object({ type: z.literal("assignment-draft"), ...assignmentFields.shape })
    .strict(),
  z
    .object({ type: z.literal("assignment-submit"), ...assignmentFields.shape })
    .strict(),
  z.object({ type: z.literal("assignment-cancel") }).strict(),
]);
export type AssessmentCommand = z.infer<typeof assessmentCommand>;
export type AssignmentDraft = z.infer<typeof assignmentFields> & {
  fileKey: string | null;
  fileName: string | null;
};
export type QuizQuestion = {
  id: number;
  text: string;
  codeSnippet: string | null;
  points: number;
  type: string;
  explanation: string | null;
  options: {
    id: number;
    text: string;
    isCorrect: boolean;
    explanation: string | null;
  }[];
};
export type AssessmentView = {
  id: number;
  type: "quiz" | "assignment";
  title: string;
  instructions: string | null;
  maxScore: number;
  passingScore: number;
  submissionFormat: "text" | "file" | "link" | "file_or_link" | null;
  maxFileSizeMb: number;
  rubric: string | null;
  dueDays: number | null;
  questions: {
    id: number;
    text: string;
    codeSnippet: string | null;
    options: { id: number; text: string }[];
  }[];
  submission: null | {
    id: number;
    attempt: number;
    status: "draft" | "pending" | "graded";
    score: number | null;
    quizPercent: number | null;
    isPassed: boolean | null;
    submittedAt: string | null;
    gradedAt: string | null;
    feedback: string | null;
    fileName: string | null;
    fileUrl: string | null;
    linkUrl: string | null;
    answerText: string | null;
    draft:
      (Omit<AssignmentDraft, "fileKey"> & { fileUrl: string | null }) | null;
    answers: { questionId: number; optionId: number | null }[];
    review: {
      questionId: number;
      correctOptionId: number;
      isCorrect: boolean;
      explanation: string | null;
    }[];
  };
  previousScore: number | null;
};

export function requireQuizQuestions(questions: QuizQuestion[]) {
  if (
    !questions.length ||
    questions.some(
      (q) =>
        !["single_choice", "predict_output"].includes(q.type) ||
        q.options.length < 2 ||
        q.options.filter((o) => o.isCorrect).length !== 1,
    )
  )
    throw new LearningPathError(
      "Quiz chưa có bộ câu hỏi hợp lệ. Vui lòng liên hệ giảng viên.",
    );
}
export function gradeQuiz(
  questions: QuizQuestion[],
  answers: { questionId: number; selectedOptionId: number | null }[],
  maxScore: number,
  passingScore: number,
) {
  requireQuizQuestions(questions);
  const review = questions.map((q) => {
    const selected = answers.find(
      (a) => a.questionId === q.id,
    )?.selectedOptionId;
    if (selected != null && !q.options.some((o) => o.id === selected))
      throw new LearningPathError("Đáp án không thuộc câu hỏi.", 400);
    return {
      questionId: q.id,
      correctOptionId: q.options.find((o) => o.isCorrect)!.id,
      isCorrect: q.options.some((o) => o.id === selected && o.isCorrect),
      explanation: q.explanation,
    };
  });
  // The mockup grades by number of correct questions, independent of authoring points.
  const percent = Math.round(
    (review.filter((r) => r.isCorrect).length / questions.length) * 100,
  );
  return {
    review,
    percent,
    score: Math.round((percent / 100) * maxScore * 100) / 100,
    isPassed: percent >= passingScore,
  };
}
export function requireEditableAssignment(status: string | undefined) {
  if (status === "graded")
    throw new LearningPathError("Bài đã chấm không thể nộp lại.", 409);
}
export function requireAssignment(
  format: AssessmentView["submissionFormat"],
  draft: AssignmentDraft,
) {
  const link = draft.linkUrl.trim();
  if (link) {
    try {
      const url = new URL(link);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw new LearningPathError(
        "Đường dẫn chưa hợp lệ. Hãy bắt đầu bằng https://",
        400,
      );
    }
  }
  if (
    (format === "file" && !draft.fileKey) ||
    (format === "link" && !link) ||
    (format === "text" && !draft.answerText.trim()) ||
    (format === "file_or_link" && !draft.fileKey && !link) ||
    !format
  )
    throw new LearningPathError(
      "Cần bổ sung bài làm theo yêu cầu trước khi nộp.",
      400,
    );
}
export function assignmentFileLimit(configured: number | null) {
  return Math.min(20, Math.max(1, configured ?? 20)) * 1024 * 1024;
}
export function requireUpload(size: number, name: string, limit: number) {
  if (!Number.isSafeInteger(size) || size <= 0)
    throw new LearningPathError("Tệp bài làm trống hoặc không hợp lệ.", 400);
  if (size > limit)
    throw new LearningPathError(
      `Tệp vượt quá ${limit / 1024 / 1024}MB. Hãy nén lại hoặc nộp đường dẫn.`,
      413,
    );
  if (
    !name.trim() ||
    name.length > 255 ||
    /[\u0000-\u001f\u007f/\\]/.test(name)
  )
    throw new LearningPathError("Tên tệp không hợp lệ.", 400);
}
