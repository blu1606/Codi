export const LESSON_KIND_LABELS = {
  reading: "Bài đọc",
  video: "Video",
  pdf: "PDF",
  coding: "Lập trình",
  tutorial: "Hướng dẫn",
} as const;

export type LessonKind = keyof typeof LESSON_KIND_LABELS;

export function reorderLessonIds(ids: string[], lessonId: string, destinationIndex: number): string[] | null {
  const sourceIndex = ids.indexOf(lessonId);
  if (sourceIndex < 0 || !Number.isInteger(destinationIndex) || destinationIndex < 0 || destinationIndex >= ids.length || destinationIndex === sourceIndex) return null;
  const next = [...ids];
  next.splice(sourceIndex, 1);
  next.splice(destinationIndex, 0, lessonId);
  return next;
}
