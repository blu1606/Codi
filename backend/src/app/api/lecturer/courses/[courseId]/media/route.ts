import { NextResponse } from "next/server";
import { receiveLessonUpload } from "@/lib/lesson-media";
import { editableCourse, limitPerHour, mediaErrorResponse, type MediaCtx } from "@/lib/lesson-media-http";

/**
 * Upload one lecture file (video, PDF, PPTX, DOCX). The body is the raw file; the name travels in X-File-Name
 * (URI-encoded). Answers { upload: {id, fileName, kind, sizeKb, durationSeconds}, material | null, storageError }.
 */
export async function POST(request: Request, ctx: MediaCtx) {
  try {
    const { courseId, userId } = await editableCourse(ctx);
    limitPerHour(userId, "lesson-media-upload", 60);
    let fileName = "";
    try { fileName = decodeURIComponent(request.headers.get("x-file-name") || ""); } catch { /* malformed name */ }
    return NextResponse.json(await receiveLessonUpload(request, { userId, courseId, fileName }));
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
