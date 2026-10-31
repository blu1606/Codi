import type { QuizQuestionInput } from "@/app/dashboard/lecturer/courses/[courseId]/actions";

export const DEFAULT_MAX_QUIZ_OPTIONS = 6;

export function validateQuestionDraft(
  draft: Pick<QuizQuestionInput, "text" | "options" | "correctIndex">,
  maxOptions = DEFAULT_MAX_QUIZ_OPTIONS,
): string[] {
  const errors: string[] = [];
  if (!draft.text.trim()) errors.push("Thiếu nội dung câu hỏi.");

  const filled = draft.options.filter((option) => option.trim().length > 0);
  if (draft.options.length < 2 || filled.length < 2) {
    errors.push("Cần ít nhất 2 phương án.");
  }
  if (draft.options.length > maxOptions) {
    errors.push(`Tối đa ${maxOptions} phương án mỗi câu.`);
  }
  if (draft.options.some((option) => option.trim().length === 0)) {
    errors.push("Có phương án còn trống.");
  }

  const correct = draft.options[draft.correctIndex];
  if (draft.correctIndex < 0 || correct === undefined || !correct.trim()) {
    errors.push("Chưa có đáp án đúng.");
  }
  return errors;
}
