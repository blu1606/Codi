// Shared request plumbing of the lecture-media routes (upload, AI source, AI draft).
import { NextResponse } from "next/server";
import { getEditableCourse } from "@/app/dashboard/lecturer/courses/[courseId]/course-queries";
import { authoringErrorResponse } from "@/lib/lecturer-authoring";
import { LessonMediaError } from "@/lib/lesson-media";
import { checkRateLimit } from "@/lib/rate-limit";

export type MediaCtx = { params: Promise<{ courseId: string }> };

export function mediaErrorResponse(error: unknown) {
  if (error instanceof LessonMediaError) return NextResponse.json({ error: error.message }, { status: error.status });
  return authoringErrorResponse(error);
}

/** Owner of an editable (not pending) course; throws for anyone else. */
export async function editableCourse(ctx: MediaCtx) {
  const { courseId } = await ctx.params;
  const { course, user } = await getEditableCourse(courseId);
  return { courseId: course.id, courseTitle: course.title, userId: user.id };
}

/** Hourly cap per lecturer and action; AI calls (Whisper, vision) cost money. */
export function limitPerHour(userId: string, action: string, max: number) {
  if (!checkRateLimit(`${action}:${userId}`, { windowMs: 60 * 60 * 1000, max }).success) {
    throw new LessonMediaError("Đã dùng hết lượt tạo bằng AI trong giờ này. Thử lại sau ít phút.", 429);
  }
}
