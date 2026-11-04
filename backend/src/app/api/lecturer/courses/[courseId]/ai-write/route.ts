import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { courses } from "@codi-1/db";
import { db } from "@/services";
import { courseContentForWriting, WRITE_FIELDS, writeCourseField, type WriteField } from "@/lib/course-ai-write";
import { readJson } from "@/lib/lecturer-authoring";
import { editableCourse, limitPerHour, mediaErrorResponse, type MediaCtx } from "@/lib/lesson-media-http";

/**
 * AI help for the course information form.
 * Body: { field: "summary" | "outcomes" | "requirements", mode: "suggest" | "rewrite", text?, title?, level? }
 * (title/level: the unsaved values in the form). Answers { text } — nothing is saved.
 */
export async function POST(request: Request, ctx: MediaCtx) {
  try {
    const { courseId, userId } = await editableCourse(ctx);
    const body = (await readJson(request)) as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400 });
    const field = body.field as WriteField;
    if (!(field in WRITE_FIELDS)) return NextResponse.json({ error: "Trường không hỗ trợ." }, { status: 400 });
    const mode = body.mode === "rewrite" ? "rewrite" : "suggest";
    const text = typeof body.text === "string" ? body.text.slice(0, 4000) : "";
    if (mode === "rewrite" && !text.trim()) return NextResponse.json({ error: "Nhập nội dung trước khi nhờ AI viết lại." }, { status: 400 });
    limitPerHour(userId, "course-ai-write", 60);
    const [c] = await db.select({ title: courses.title, level: courses.level, category: courses.category, description: courses.description }).from(courses).where(eq(courses.id, courseId));
    const result = await writeCourseField({
      field, mode, text, content: await courseContentForWriting(courseId),
      course: { title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : c!.title,
        level: typeof body.level === "string" ? body.level : c!.level, category: c!.category, description: field === "summary" ? "" : c!.description },
    });
    if (!("text" in result)) {
      if (result.success) throw new Error("AI write without text");
      return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "rate_limited" ? 429 : result.code === "not_configured" ? 503 : 502 });
    }
    return NextResponse.json({ text: result.text });
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
