import { NextResponse } from "next/server";
import { generateLessonDraft, recallSource } from "@/lib/lesson-ai-draft";
import { LessonMediaError } from "@/lib/lesson-media";
import { editableCourse, limitPerHour, mediaErrorResponse, type MediaCtx } from "@/lib/lesson-media-http";
import { readJson } from "@/lib/lecturer-authoring";

const DIFFICULTIES = ["easy", "medium", "hard"] as const;

/**
 * Body: { sourceId, quizCount (0–10), difficulty, lessonTitle?, focus? } — a draft from an uploaded file — or
 * { topic, goal?, minutes?, quizCount, difficulty } — a new lecture written from a topic.
 * Answers { draft: {title, summary, outline[], questions[]} } or { error, code, retryable } with 4xx/5xx.
 */
export async function POST(request: Request, ctx: MediaCtx) {
  try {
    const { courseId, courseTitle, userId } = await editableCourse(ctx);
    const body = (await readJson(request)) as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400 });
    // Topic mode ("Bài giảng bằng AI"): { topic, goal?, minutes? } instead of a sourceId.
    const topicText = typeof body.topic === "string" ? body.topic.trim().slice(0, 200) : "";
    const topic = topicText ? { topic: topicText, goal: typeof body.goal === "string" ? body.goal.trim().slice(0, 500) : "",
      minutes: Math.max(3, Math.min(60, Math.round(Number(body.minutes) || 10))) } : undefined;
    const source = !topic && typeof body.sourceId === "string" ? recallSource(body.sourceId, userId, courseId) : null;
    if (!topic && !source) throw new LessonMediaError("Tài liệu đã đọc đã hết hạn (sau 1 giờ). Hãy tải lại tệp.", 410);
    const quizCount = Math.max(0, Math.min(10, Math.round(Number(body.quizCount) || 0)));
    const difficulty = DIFFICULTIES.includes(body.difficulty as never) ? (body.difficulty as (typeof DIFFICULTIES)[number]) : "medium";
    limitPerHour(userId, "lesson-ai-draft", 30);
    const result = await generateLessonDraft({
      courseTitle, source, topic, quizCount, difficulty,
      lessonTitle: typeof body.lessonTitle === "string" ? body.lessonTitle.slice(0, 200) : null,
      focus: typeof body.focus === "string" ? body.focus.slice(0, 500) : undefined,
    });
    if (!("draft" in result)) {
      if (result.success) throw new Error("AI draft without content");
      const status = result.code === "rate_limited" ? 429 : result.code === "not_configured" ? 503 : 502;
      return NextResponse.json({ error: result.message, code: result.code, retryable: result.retryable }, { status });
    }
    return NextResponse.json({ draft: result.draft });
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
