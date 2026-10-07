import type { CatalogCourse } from "./course-catalog";

export interface CourseLesson {
  id: string;
  title: string;
  description: string | null;
  durationSeconds: number;
}

export interface CourseChapter {
  id: string;
  title: string;
  lessons: CourseLesson[];
}

export interface CourseDetail {
  course: CatalogCourse;
  learningOutcomes: string[];
  requirements: string[];
  targetAudience: string | null;
  coverImageUrl: string | null;
  introVideoUrl: string | null;
  introVideoCaptionsUrl: string | null;
  chapters: CourseChapter[];
  summary: { chapterCount: number; lessonCount: number; durationSeconds: number };
}

export class CourseDetailError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "CourseDetailError";
  }
}

export async function fetchCourseDetail(slug: string, signal: AbortSignal): Promise<CourseDetail> {
  const response = await fetch(`/api/courses/${encodeURIComponent(slug)}`, { signal });
  if (!response.ok) {
    throw new CourseDetailError(response.status, response.status === 404
      ? "Khóa học không tồn tại hoặc đã được gỡ bỏ."
      : "Không thể tải thông tin khóa học. Vui lòng thử lại.");
  }
  const body = await response.json();
  if (!body.course || !Array.isArray(body.chapters) || !body.summary) {
    throw new Error("Dữ liệu khóa học không hợp lệ.");
  }
  return body;
}

export function formatLessonDuration(seconds: number): string {
  if (seconds <= 0) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
