import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { LearningPathError } from "./learning-path-contract";
import {
  learningFailure,
  learningViewer,
  privateHeaders,
} from "./learning-path-http";

export function assessmentFailure(error: unknown) {
  if (error instanceof LearningPathError || error instanceof ZodError)
    return learningFailure(error);
  return NextResponse.json(
    { error: "Không thể tải hoặc lưu bài làm. Vui lòng thử lại." },
    { status: 500, headers: privateHeaders },
  );
}

export type AssessmentContext = {
  params: Promise<{ courseId: string; lessonId: string; assessmentId: string }>;
};
export async function assessmentScope(
  request: NextRequest,
  context: AssessmentContext,
) {
  const userId = await learningViewer(request);
  const { courseId, lessonId, assessmentId: value } = await context.params;
  const assessmentId = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(assessmentId) || assessmentId <= 0)
    throw new LearningPathError("Không tìm thấy bài tập.", 404);
  return { userId, courseId, lessonId, assessmentId };
}
export async function readUpload(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new LearningPathError("Tệp vượt quá giới hạn tải lên.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new LearningPathError("Thiếu tệp bài làm.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new LearningPathError("Tệp vượt quá giới hạn tải lên.", 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}
