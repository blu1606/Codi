export const LESSON_KIND_LABELS = {
  reading: "Bài đọc",
  video: "Video",
  pdf: "PDF",
  coding: "Bài code",
  quiz: "Quiz",
  tutorial: "Hướng dẫn code",
} as const;
export type LessonKind = keyof typeof LESSON_KIND_LABELS;
