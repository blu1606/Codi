/**
 * Pure domain logic and calculation helpers for Lecturer Progress (Screen S29).
 * Adheres to STATE-MACHINES.md §9, §10, §13, and Mockup js/lecturer.js (lines 1363-1424).
 */

export interface LearnerProgressLessonItem {
  id: string;
  title: string;
  isCompleted: boolean;
  quizScore?: number | null;
  assignmentSubmission?: {
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
  hintUsageCount: number;
  maxHintLevel: number;
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
  hasCodingExercise: boolean;
  learners: LearnerProgressDto[];
  quizQuestions: QuizQuestionStatDto[];
}

/**
 * Tính tỉ lệ hoàn thành bài học của học viên (0..100%).
 */
export function calculateLearnerCompletionRate(
  completedCount: number,
  totalCount: number
): number {
  if (!totalCount || totalCount <= 0 || completedCount <= 0) return 0;
  return Math.min(100, Math.round((completedCount / totalCount) * 100));
}

/**
 * Tính điểm quiz trung bình từ mảng điểm (%).
 * Trả về null nếu mảng rỗng.
 */
export function calculateAverageQuizScore(
  scores: Array<number | null | undefined>
): number | null {
  const validScores = scores.filter(
    (s): s is number => typeof s === "number" && !isNaN(s)
  );
  if (validScores.length === 0) return null;
  const sum = validScores.reduce((acc, score) => acc + score, 0);
  return Math.round(sum / validScores.length);
}

/**
 * Tính trung bình cộng của một danh sách phần trăm, trả về 0 nếu rỗng.
 */
export function calculateAveragePercentage(values: number[]): number {
  if (!values.length) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / values.length);
}

/**
 * Thống kê tỉ lệ đúng của một câu hỏi quiz.
 * Theo mockup: câu có tỉ lệ đúng dưới 60% được đánh dấu "Cần xem lại".
 */
export function calculateQuestionAccuracy(
  correctCount: number,
  totalCount: number
): { correctPercent: number | null; needsReview: boolean } {
  if (totalCount <= 0) {
    return { correctPercent: null, needsReview: false };
  }
  const correctPercent = Math.round((correctCount / totalCount) * 100);
  return {
    correctPercent,
    needsReview: correctPercent < 60,
  };
}

/**
 * Định dạng số lần sử dụng gợi ý AI (VD: "2 (L2)" hoặc "0").
 * Nhắc nhở: Dùng gợi ý AI không trừ điểm học viên.
 */
export function formatHintUsage(count: number, maxLevel: number): string {
  if (!count || count <= 0) return "0";
  return `${count} (L${Math.max(1, maxLevel || 1)})`;
}
