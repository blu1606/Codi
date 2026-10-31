import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { lessonMaterials } from "@codi-1/db";
import { ENV } from "@/env";
import { getR2Client, R2_BUCKET } from "@/lib/storage";
import { getOwnedCourse, requireCourseLesson } from "@/app/dashboard/lecturer/courses/[courseId]/course-queries";
import { db } from "@/services";

type Context = { params: Promise<{ courseId: string; lessonId: string; materialId: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try {
    const { courseId, lessonId, materialId } = await context.params;
    await getOwnedCourse(courseId);
    await requireCourseLesson(courseId, lessonId);
    const [material] = await db.select().from(lessonMaterials).where(and(eq(lessonMaterials.id, Number(materialId)), eq(lessonMaterials.lessonId, lessonId)));
    const key = material?.url.startsWith("r2-private://") ? material.url.slice("r2-private://".length) : null;
    const client = getR2Client();
    const bucket = ENV.R2_ASSIGNMENT_BUCKET;
    if (!key || !client || !bucket || bucket === R2_BUCKET) return NextResponse.json({ error: "Không tìm thấy tài liệu." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const disposition = material.type === "video" || material.type === "pdf" || material.type === "slide" ? "inline" : "attachment";
    const safeName = encodeURIComponent(material.title).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: `${disposition}; filename*=UTF-8''${safeName}` }), { expiresIn: 60 });
    return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "Unauthorized" ? "Cần đăng nhập." : "Không thể mở tài liệu." }, { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 404, headers: { "Cache-Control": "private, no-store" } });
  }
}
