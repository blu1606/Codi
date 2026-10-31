import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { lessonMaterials } from "@codi-1/db";
import { ENV } from "@/env";
import { getR2Client, R2_BUCKET } from "@/lib/storage";
import { lessonPlayerService } from "@/lib/lesson-player-runtime";
import { learningFailure, learningViewer, privateHeaders } from "@/lib/learning-path-http";
import { db } from "@/services";

type Context = { params: Promise<{ courseId: string; lessonId: string; materialId: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const userId = await learningViewer(request);
    const { courseId, lessonId, materialId } = await context.params;
    await lessonPlayerService.get(userId, courseId, lessonId);
    const [material] = await db.select().from(lessonMaterials).where(and(eq(lessonMaterials.id, Number(materialId)), eq(lessonMaterials.lessonId, lessonId)));
    const key = material?.url.startsWith("r2-private://") ? material.url.slice("r2-private://".length) : null;
    const client = getR2Client();
    const bucket = ENV.R2_ASSIGNMENT_BUCKET;
    if (!key || !client || !bucket || bucket === R2_BUCKET) return NextResponse.json({ error: "Không tìm thấy tài liệu." }, { status: 404, headers: privateHeaders });
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(material.title)}` }), { expiresIn: 60 });
    return NextResponse.redirect(url, { status: 307, headers: privateHeaders });
  } catch (error) {
    return learningFailure(error);
  }
}
