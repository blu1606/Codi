import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { courses } from "@codi-1/db";
import { db } from "@/services";
import { courseContentForWriting, LESSON_FIELDS, lessonContentForWriting, WRITE_FIELDS, writeCourseField, type WriteField } from "@/lib/course-ai-write";
import { getCourseLesson } from "@/app/dashboard/lecturer/courses/[courseId]/course-queries";
import { courseChapters } from "@codi-1/db";
import { readJson } from "@/lib/lecturer-authoring";
import { editableCourse, limitPerHour, mediaErrorResponse, type MediaCtx } from "@/lib/lesson-media-http";

/**
 * AI help for the course information form.
 * Body: { field: "summary" | "outcomes" | "requirements" | "lesson-description", mode: "suggest" | "rewrite", text?, title?, level? }
 * (title/level: the unsaved values in the form). "lesson-description" also needs lessonId and may send the unsaved
 * lesson title and body; it reads that lesson only. Answers { text } — nothing is saved.
 */
export async function POST(request: Request, ctx: MediaCtx) {
  try {
    const { courseId, userId } = await editableCourse(ctx);
    const body = (await readJson(request)) as Record<string, unknown> | undefined;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400 });
    const field = body.field as WriteField;
    if (typeof field !== "string" || !Object.hasOwn(WRITE_FIELDS, field)) return NextResponse.json({ error: "Trường không hỗ trợ." }, { status: 400 });
    const mode = body.mode === "rewrite" ? "rewrite" : "suggest";
    const text = typeof body.text === "string" ? body.text.slice(0, 4000) : "";
    if (mode === "rewrite" && !text.trim()) return NextResponse.json({ error: "Nhập nội dung trước khi nhờ AI viết lại." }, { status: 400 });
    const forLesson = LESSON_FIELDS.includes(field);
    let lessonContent = "";
    if (forLesson) {
      const lessonId = typeof body.lessonId === "string" ? body.lessonId : "";
      const lesson = lessonId ? await getCourseLesson(courseId, lessonId) : undefined;
      if (!lesson) return NextResponse.json({ error: "Không tìm thấy bài học trong khoá học này." }, { status: 404 });
      const [chapter] = await db.select({ title: courseChapters.title }).from(courseChapters).where(eq(courseChapters.id, lesson.chapterId));
      // Unsaved edits in the editor count, so the lecturer does not have to save before asking.
      const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : lesson.title;
      const lessonBody = typeof body.body === "string" ? body.body.slice(0, 20_000) : lesson.body ?? "";
      if (mode === "suggest" && !lessonBody.trim()) {
        return NextResponse.json({ error: "Bài học chưa có nội dung bài đọc để AI dựa vào. Hãy soạn nội dung trước hoặc tự viết mô tả." }, { status: 400 });
      }
      lessonContent = lessonContentForWriting({ title, chapter: chapter?.title, body: lessonBody });
    }
    limitPerHour(userId, "course-ai-write", 60);
    const [c] = await db.select({ title: courses.title, level: courses.level, category: courses.category, description: courses.description }).from(courses).where(eq(courses.id, courseId));
    const result = await writeCourseField({
      field, mode, text, content: forLesson ? lessonContent : await courseContentForWriting(courseId),
      course: { title: !forLesson && typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : c!.title,
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
