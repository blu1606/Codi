import { NextResponse } from "next/server";
import { describeSource, rememberSource } from "@/lib/lesson-ai-draft";
import { fetchStoredMaterial, findUpload, LessonMediaError } from "@/lib/lesson-media";
import { editableCourse, limitPerHour, mediaErrorResponse, type MediaCtx } from "@/lib/lesson-media-http";
import { extractSource } from "@/lib/lesson-source-extraction";
import { readJson } from "@/lib/lecturer-authoring";

/**
 * Reads a lecture file for the AI import: PDF text (+ OCR), PPTX/DOCX text, or video transcript + key frames.
 * Body: { uploadId } (a file just uploaded to …/media) or { materialUrl, fileName? } (a material already stored).
 */
export async function POST(request: Request, ctx: MediaCtx) {
  try {
    const { courseId, userId } = await editableCourse(ctx);
    const body = (await readJson(request)) as { uploadId?: unknown; materialUrl?: unknown; fileName?: unknown } | undefined;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400 });
    let upload;
    if (typeof body.uploadId === "string" && body.uploadId) {
      upload = await findUpload(body.uploadId, userId, courseId);
      if (!upload) throw new LessonMediaError("Tệp tải lên đã hết hạn (sau 1 giờ). Hãy chọn lại tệp.", 410);
    } else if (typeof body.materialUrl === "string" && body.materialUrl) {
      upload = await fetchStoredMaterial(body.materialUrl, { userId, courseId, fileName: typeof body.fileName === "string" ? body.fileName : undefined });
    } else {
      return NextResponse.json({ error: "Chọn tệp để AI đọc." }, { status: 400 });
    }
    limitPerHour(userId, "lesson-ai-source", 20);
    const source = await extractSource(upload);
    return NextResponse.json(describeSource(rememberSource(userId, courseId, source), source));
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
