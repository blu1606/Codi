export interface PublicCourse {
  id: string;
  slug: string;
  title: string;
  category: string;
  level: string;
  duration: string;
  description: string;
  price: number;
  instructorId: string | null;
  rating: number;
  reviewCount: number;
  status: string;
  hiddenReason?: string | null;
  createdAt: string;
  publishedAt: Date | null;
  updatedAt: Date;
  enrollmentCount: number;
  coverImageUrl?: string | null;
  instructorName?: string | null;
}

export interface CourseLesson {
  id: string;
  title: string;
  description: string | null;
  durationSeconds: number;
  isFreePreview?: boolean;
}

export interface CourseChapter {
  id: string;
  title: string;
  lessons: CourseLesson[];
}

export interface CourseReview {
  id: string;
  userName: string;
  userAvatar?: string | null;
  stars: number;
  createdAt: string;
  text?: string | null;
  reply?: {
    text: string;
    createdAt?: string;
  } | null;
}

export interface CourseDetail {
  course: PublicCourse;
  instructor: { name: string; title: string | null; avatar: string | null; bio: string | null } | null;
  rating: number;
  reviewCount: number;
  ratingBreakdown?: number[];
  reviews?: CourseReview[];
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

export type LessonContentType =
  | "video"
  | "pdf"
  | "reading"
  | "tutorial"
  | "code"
  | "quiz"
  | "assignment";

export interface LessonTypeMeta {
  type: LessonContentType;
  label: string;
}

export const LESSON_TYPE_LABELS: Record<LessonContentType, string> = {
  video: "Video",
  pdf: "Slide/PDF",
  reading: "Bài đọc",
  tutorial: "Hướng dẫn code",
  code: "Bài code",
  quiz: "Quiz",
  assignment: "Bài tập",
};

export function getLessonTypeMeta(title: string): LessonTypeMeta {
  const lower = title.toLowerCase();
  if (lower.includes("quiz") || lower.includes("trắc nghiệm")) {
    return { type: "quiz", label: LESSON_TYPE_LABELS.quiz };
  }
  if (lower.includes("bài tập") || lower.includes("assignment")) {
    return { type: "assignment", label: LESSON_TYPE_LABELS.assignment };
  }
  if (
    lower.includes("thử thách") ||
    lower.includes("luyện tập") ||
    lower.includes("code") ||
    lower.includes("dự án") ||
    lower.includes("reducer")
  ) {
    return { type: "code", label: LESSON_TYPE_LABELS.code };
  }
  if (lower.includes("hướng dẫn") || lower.includes("tutorial")) {
    return { type: "tutorial", label: LESSON_TYPE_LABELS.tutorial };
  }
  if (lower.includes("pdf") || lower.includes("slide")) {
    return { type: "pdf", label: LESSON_TYPE_LABELS.pdf };
  }
  if (
    lower.includes("đọc") ||
    lower.includes("tài liệu") ||
    lower.includes("lý thuyết") ||
    lower.includes("tổng quan")
  ) {
    return { type: "reading", label: LESSON_TYPE_LABELS.reading };
  }
  return { type: "video", label: LESSON_TYPE_LABELS.video };
}
