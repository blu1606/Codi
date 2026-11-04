import { z } from "zod";
import { LearningPathError } from "./learning-path-contract";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** Same bound as the sandbox runner's code limit. */
export const ASSIGNMENT_CODE_LIMIT = 65536;
export const assignmentFields = z
  .object({
    linkUrl: z.string().trim().max(2000),
    answerText: z.string().max(10000),
    // Code written in the lesson's editor (code assignments only); omitted = keep the saved code.
    code: z.string().max(ASSIGNMENT_CODE_LIMIT).optional(),
  })
  .strict();
export const assignmentRunCommand = z
  .object({ code: z.string().max(ASSIGNMENT_CODE_LIMIT) })
  .strict();
export type CodeLanguage = "javascript" | "typescript";
export type AssignmentRunView = {
  phase: "done" | "syntax" | "runtime" | "timeout";
  durationMs: number;
  logs: string[];
  error: string | null;
  line: number | null;
};
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
  z.object({ type: z.literal("assignment-remove-file") }).strict(),
]);
export type AssessmentCommand = z.infer<typeof assessmentCommand>;
export type AssignmentDraft = z.infer<typeof assignmentFields> & {
  fileKey: string | null;
  fileName: string | null;
};

// Statements that build a page, a component or a project are not runnable as one script, even when they name a .js
// file, so they keep link/file submission.
// `\b` only knows ASCII letters, so Vietnamese words use Unicode letter boundaries.
const word = (body: string) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${body})(?![\\p{L}\\p{N}_])`, "iu");
const NOT_A_SCRIPT = word(
  "react|component|jsx|tsx|next\\.js|server component|html|css|dom|codesandbox|github|dự án|trang|giao diện|ứng dụng",
);
const WRITES_CODE = word("viết\\s+(?:một\\s+)?hàm|write\\s+a\\s+function|[a-z_$][\\w$]*\\([^)]*\\)\\s*(?:trả về|returns?)");
const SCRIPT_FILE = /\.(?:m?js|ts)(?![\p{L}\p{N}_])/iu;
const TYPESCRIPT = /typescript|\.ts(?![\p{L}\p{N}_])/iu;
const ACCEPTED_FILES_LINE = /^\s*Định dạng tệp chấp nhận:.*$/gimu;

/**
 * Whether an assignment is a piece of code the learner can write and run in the lesson's editor, and in which
 * language. Assignments have no language field, so this reads the statement: "Viết hàm formatPrice(n) trả về …" or
 * "Nộp tệp .js" asks for a script; a page, component or project (React, trang, dự án, GitHub) does not.
 */
export function assignmentCodeLanguage(a: {
  title: string;
  instructions: string | null;
}): CodeLanguage | null {
  const text = `${a.title}\n${(a.instructions ?? "").replace(ACCEPTED_FILES_LINE, "")}`;
  if (NOT_A_SCRIPT.test(text)) return null;
  if (!WRITES_CODE.test(text) && !SCRIPT_FILE.test(text)) return null;
  return TYPESCRIPT.test(text) ? "typescript" : "javascript";
}
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
  /** Set when the assignment is code the learner writes and runs in the lesson (assignmentCodeLanguage). */
  codeLanguage: CodeLanguage | null;
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
    rubricScores: Record<string, number> | null;
    fileName: string | null;
    fileUrl: string | null;
    linkUrl: string | null;
    answerText: string | null;
    code: string | null;
    codeLanguage: CodeLanguage | null;
    draft:
      (Omit<AssignmentDraft, "fileKey" | "code"> & {
        code: string;
        fileUrl: string | null;
      }) | null;
    answers: { questionId: number; optionId: number | null }[];
    review: {
      questionId: number;
      correctOptionId: number;
      isCorrect: boolean;
      explanation: string | null;
    }[];
  };
  previousScore: number | null;
  previousQuizPercent?: number | null;
  unavailableReason?: string | null;
};

export const uploadRequest = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("prepare"),
      name: z.string().max(255),
      size: z.number().int().positive(),
    })
    .strict(),
  z
    .object({ type: z.literal("confirm"), token: z.string().max(8000) })
    .strict(),
]);
export type PreparedUpload = { url: string; token: string; expiresIn: number };

type QuizCommand = Extract<AssessmentCommand, { type: `quiz-${string}` }>;
type AssignmentCommand = Extract<
  AssessmentCommand,
  { type: `assignment-${string}` }
>;
type Attempt = {
  id: number;
  attempt: number;
  status: "draft" | "pending" | "graded";
};
export function quizTransition(
  state: {
    type: string;
    submission: Attempt | null | undefined;
    questions: QuizQuestion[];
    answers: { questionId: number; selectedOptionId: number | null }[];
    maxScore: number;
    passingScore: number;
  },
  command: QuizCommand,
) {
  if (state.type !== "quiz")
    throw new LearningPathError("Đây không phải quiz.", 400);
  requireQuizQuestions(state.questions);
  const s = state.submission;
  if (command.type === "quiz-open")
    return {
      type: s ? ("unchanged" as const) : ("create" as const),
      attempt: 1,
    };
  if (command.type === "quiz-retake") {
    if (!s || s.id !== command.submissionId || s.status !== "graded")
      throw new LearningPathError("Lần làm đã thay đổi. Hãy tải lại.", 409);
    return { type: "create" as const, attempt: s.attempt + 1 };
  }
  if (!s || s.id !== command.submissionId || s.status !== "draft")
    throw new LearningPathError(
      "Lần làm đã nộp hoặc đã thay đổi. Hãy tải lại.",
      409,
    );
  if (command.type === "quiz-answer") {
    const q = state.questions.find((q) => q.id === command.questionId);
    if (!q?.options.some((o) => o.id === command.optionId))
      throw new LearningPathError("Đáp án không thuộc câu hỏi.", 400);
    return {
      type: "answer" as const,
      submissionId: s.id,
      questionId: q.id,
      optionId: command.optionId,
    };
  }
  const missing = state.questions.filter(
    (q) =>
      !state.answers.some(
        (a) => a.questionId === q.id && a.selectedOptionId !== null,
      ),
  ).length;
  if (missing && !command.confirmUnanswered)
    throw new LearningPathError(
      `Còn ${missing} câu chưa trả lời. Câu chưa trả lời sẽ được tính là sai.`,
      409,
    );
  return {
    type: "grade" as const,
    submissionId: s.id,
    result: gradeQuiz(
      state.questions,
      state.answers,
      state.maxScore,
      state.passingScore,
    ),
  };
}

export function assignmentTransition(
  state: {
    type: string;
    submission:
      | { status: string; assignmentDraft: AssignmentDraft | null }
      | null
      | undefined;
    draft: AssignmentDraft;
    format: AssessmentView["submissionFormat"];
    codeLanguage: CodeLanguage | null;
  },
  command: AssignmentCommand,
) {
  if (state.type !== "assignment")
    throw new LearningPathError("Đây không phải bài tập.", 400);
  requireEditableAssignment(state.submission?.status);
  if (command.type === "assignment-cancel") {
    if (!state.submission?.assignmentDraft)
      throw new LearningPathError("Không có bản nháp để huỷ.", 409);
    return { type: "cancel" as const };
  }
  if (command.type === "assignment-remove-file") {
    if (!state.draft.fileKey)
      throw new LearningPathError("Không có tệp để gỡ.", 409);
    return {
      type: "draft" as const,
      draft: { ...state.draft, fileKey: null, fileName: null },
    };
  }
  if (command.code !== undefined && !state.codeLanguage)
    throw new LearningPathError("Bài tập này không nhận bài làm dạng code.", 400);
  const draft: AssignmentDraft = {
    ...state.draft,
    linkUrl: command.linkUrl,
    answerText: command.answerText,
    ...(command.code !== undefined ? { code: command.code } : {}),
  };
  if (command.type === "assignment-submit") {
    requireAssignment(state.format, draft, state.codeLanguage);
    return { type: "submit" as const, draft };
  }
  return { type: "draft" as const, draft };
}

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
  codeLanguage: CodeLanguage | null = null,
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
  // A code assignment is complete with its code; the lecturer's link/file format stays as an alternative.
  if (codeLanguage && draft.code?.trim()) return;
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
