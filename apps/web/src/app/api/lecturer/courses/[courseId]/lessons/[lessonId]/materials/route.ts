import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse, type NextRequest } from "next/server";
import { lessonMaterials } from "@codi-1/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ENV } from "@/env";
import { getR2Client, R2_BUCKET } from "@/lib/storage";
import { createLessonUploadTicket, readLessonUploadTicket, validateLessonUpload } from "@/lib/lesson-material-upload";
import { getEditableCourse, requireCourseLesson, withCourseContentWrite } from "@/app/dashboard/lecturer/courses/[courseId]/course-queries";

type Context = { params: Promise<{ courseId: string; lessonId: string }> };
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), type: z.string(), name: z.string(), size: z.number().int(), contentType: z.string() }),
  z.object({ action: z.literal("confirm"), ticket: z.string() }),
]);
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: NextRequest, context: Context) {
  let uploadedKey: string | undefined;
  let permanentKey: string | undefined;
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 403, headers: privateHeaders });
    const { courseId, lessonId } = await context.params;
    const { user } = await getEditableCourse(courseId);
    await requireCourseLesson(courseId, lessonId);
    const input = bodySchema.parse(await request.json());
    const bucket = ENV.R2_ASSIGNMENT_BUCKET;
    const client = getR2Client();
    if (!client || !bucket || bucket === R2_BUCKET) return NextResponse.json({ error: "Kho tài liệu riêng chưa được cấu hình." }, { status: 503, headers: privateHeaders });

    if (input.action === "prepare") {
      if (!validateLessonUpload(input.type, input.name, input.size, input.contentType)) return NextResponse.json({ error: "Định dạng hoặc dung lượng tệp không hợp lệ (tối đa 200 MB)." }, { status: 400, headers: privateHeaders });
      const key = `lesson-material-uploads/${crypto.randomUUID()}`;
      const ticket = createLessonUploadTicket({ userId: user.id, courseId, lessonId, key, name: input.name, type: input.type, size: input.size, contentType: input.contentType });
      const uploadUrl = await import("@aws-sdk/s3-request-presigner").then(({ getSignedUrl }) => getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentLength: input.size, ContentType: input.contentType }), { expiresIn: 900 }));
      return NextResponse.json({ uploadUrl, ticket }, { headers: privateHeaders });
    }

    const ticket = readLessonUploadTicket(input.ticket);
    if (!ticket || ticket.userId !== user.id || ticket.courseId !== courseId || ticket.lessonId !== lessonId) return NextResponse.json({ error: "Phiên tải tệp không hợp lệ hoặc đã hết hạn." }, { status: 403, headers: privateHeaders });
    uploadedKey = ticket.key;
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: ticket.key }));
    if (head.ContentLength !== ticket.size || head.ContentType?.toLowerCase() !== ticket.contentType.toLowerCase()) throw new Error("Tệp tải lên không khớp thông tin đã chọn.");
    permanentKey = `lesson-materials/${crypto.randomUUID()}`;
    await client.send(new CopyObjectCommand({ Bucket: bucket, Key: permanentKey, CopySource: `${bucket}/${ticket.key}`, CopySourceIfMatch: head.ETag }));
    const created = await withCourseContentWrite(courseId, async (tx) => {
      await requireCourseLesson(courseId, lessonId, tx);
      const [{ position }] = await tx.select({ position: sql<number>`coalesce(max(${lessonMaterials.position}), -1) + 1` }).from(lessonMaterials).where(eq(lessonMaterials.lessonId, lessonId));
      const [material] = await tx.insert(lessonMaterials).values({ lessonId, type: ticket.type as "video" | "pdf" | "slide" | "document", title: ticket.name, url: `r2-private://${permanentKey}`, fileSizeKb: Math.ceil(ticket.size / 1024), durationSeconds: null, position }).returning({ id: lessonMaterials.id });
      return material;
    });
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: ticket.key })).catch(() => undefined);
    uploadedKey = undefined;
    permanentKey = undefined;
    return NextResponse.json({ id: created.id, type: ticket.type, title: ticket.name, url: `/api/learn/${courseId}/lessons/${lessonId}/materials/${created.id}`, fileSizeKb: Math.ceil(ticket.size / 1024), durationSeconds: null }, { headers: privateHeaders });
  } catch (error) {
    if (uploadedKey) {
      const client = getR2Client();
      const bucket = ENV.R2_ASSIGNMENT_BUCKET;
      if (client && bucket) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: uploadedKey })).catch(() => undefined);
    }
    if (permanentKey) {
      const client = getR2Client();
      const bucket = ENV.R2_ASSIGNMENT_BUCKET;
      if (client && bucket) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: permanentKey })).catch(() => undefined);
    }
    const status = error instanceof z.ZodError ? 400 : error instanceof Error && error.message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tải tài liệu." }, { status, headers: privateHeaders });
  }
}
