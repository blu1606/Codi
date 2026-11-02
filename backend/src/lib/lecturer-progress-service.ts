/** Read-only lecturer projections. Unknown evidence is never a zero score. */
export interface LearnerProgressLessonItem {
  id: string;
  title: string;
  isCompleted: boolean;
  quizScore: number | null;
  assignmentSubmission: {
    status: "draft" | "pending" | "graded";
    score: number | null;
    maxScore: number;
  } | null;
}
export interface LearnerProgressDto {
  userId: string;
  name: string;
  avatar: string | null;
  progressPercent: number;
  completedLessonsCount: number;
  totalLessonsCount: number;
  averageQuizScore: number | null;
  hintUsageCount: null;
  lastActive: string | null;
  lessons: LearnerProgressLessonItem[];
}
export interface QuizQuestionStatDto {
  lessonId: string | null;
  lessonTitle: string;
  questionId: number;
  questionText: string;
  totalAnswers: number;
  correctAnswers: number;
  correctPercent: number | null;
  needsReview: boolean;
}
export interface CourseProgressSummaryDto {
  courseId: string;
  title: string;
  status: string;
  learnersCount: number;
  averageCompletionRate: number;
}
export interface CourseProgressDetailDto {
  courseId: string;
  courseTitle: string;
  totalLessons: number;
  learnersCount: number;
  averageCompletionRate: number;
  averageQuizScore: number | null;
  learners: LearnerProgressDto[];
  quizQuestions: QuizQuestionStatDto[];
}
export const HINT_USAGE_UNAVAILABLE =
  "Chưa có dữ liệu gợi ý AI được ghi nhận đáng tin cậy; chưa thể thống kê mức sử dụng. Gợi ý không trừ điểm.";
export const PROGRESS_CHARTS_UNAVAILABLE =
  "Biểu đồ mức thành thạo và xu hướng điểm chưa khả dụng trong bản prototype. Tiến độ hoàn thành không phải mức thành thạo.";

type CompletedAttempt = {
  id: number;
  assessmentId: number;
  enrollmentId: number;
  lessonId?: string | null;
  attempt: number;
  status: string;
  submittedAt: Date | null;
};
/** Drafts never displace a submitted graded result; no fallback to older marks. */
export function selectLatestCompletedAttempts<T extends CompletedAttempt>(
  rows: readonly T[],
): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    if (row.status !== "graded" || !row.submittedAt) continue;
    const key = row.enrollmentId + ":" + (row.lessonId ?? row.assessmentId);
    const previous = latest.get(key);
    if (
      !previous ||
      row.attempt > previous.attempt ||
      (row.attempt === previous.attempt && row.id > previous.id)
    )
      latest.set(key, row);
  }
  return [...latest.values()];
}
export function calculateLearnerCompletionRate(
  completed: number,
  total: number,
): number {
  return total > 0
    ? Math.min(100, Math.max(0, Math.round((completed / total) * 100)))
    : 0;
}
export function calculateAverageQuizScore(
  scores: Array<number | null | undefined>,
): number | null {
  const known = scores.filter(
    (value): value is number =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100,
  );
  return known.length
    ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length)
    : null;
}
export function calculateAveragePercentage(values: number[]): number {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
}
export function calculateQuestionAccuracy(
  correct: number,
  total: number,
): { correctPercent: number | null; needsReview: boolean } {
  if (total <= 0) return { correctPercent: null, needsReview: false };
  const correctPercent = Math.round((correct / total) * 100);
  return { correctPercent, needsReview: correctPercent < 60 };
}
