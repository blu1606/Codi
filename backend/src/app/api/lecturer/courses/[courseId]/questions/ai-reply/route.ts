import { NextResponse } from "next/server";
import { getOwnedCourse } from "@/app/dashboard/lecturer/courses/[courseId]/course-queries";
import { readJson } from "@/lib/lecturer-authoring";
import { limitPerHour, mediaErrorResponse, type MediaCtx } from "@/lib/lesson-media-http";
import { generateQuestionReply, loadReplyThread, replyFailureStatus } from "@/lib/question-ai-reply";
import { db } from "@/services";

/**
 * AI draft for a reply in the lecturer Q&A inbox. Body: { kind: "question" | "conversation", id }.
 * 200 { status: "ok", text, sources: [{ title, href }] } or { status: "no_match", message }. Nothing is saved or sent.
 */
export async function POST(request: Request, ctx: MediaCtx) {
  try {
    const { courseId } = await ctx.params;
    // Owned courses only (pending included: questions stay on the course while it is re-reviewed).
    const { course, user } = await getOwnedCourse(courseId);
    const body = (await readJson(request)) as Record<string, unknown> | undefined;
    const kind = body?.kind;
    const id = Number(body?.id);
    if ((kind !== "question" && kind !== "conversation") || !Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 400 });
    }
    const thread = await loadReplyThread(db, course.id, kind, id);
    if (!thread) return NextResponse.json({ error: "Không tìm thấy câu hỏi trong khoá học này." }, { status: 404 });
    if (!thread.question) return NextResponse.json({ status: "no_match", message: "Chưa có câu hỏi của học viên để AI dựa vào." });
    limitPerHour(user.id, "question-ai-reply", 30);
    const result = await generateQuestionReply(db, { courseId: course.id, courseTitle: course.title, thread });
    if (result.status === "failed") {
      return NextResponse.json({ error: result.message, code: result.code }, { status: replyFailureStatus(result.code) });
    }
    return NextResponse.json(result);
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
