import { NextResponse, type NextRequest } from "next/server";
import { assessmentService } from "@/lib/assessment-runtime";
import {
  assessmentFailure,
  assessmentScope,
  readUpload,
  type AssessmentContext,
} from "@/lib/assessment-http";
import { privateHeaders } from "@/lib/learning-path-http";
import { LearningPathError } from "@/lib/learning-path-contract";

export const maxDuration = 60;
export async function POST(request: NextRequest, context: AssessmentContext) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new LearningPathError("Yêu cầu không hợp lệ.", 403);
    const scope = await assessmentScope(request, context);
    const limit = await assessmentService.uploadLimit(scope);
    let name: string;
    try {
      name = decodeURIComponent(request.headers.get("x-file-name") ?? "");
    } catch {
      throw new LearningPathError("Tên tệp không hợp lệ.", 400);
    }
    const buffer = await readUpload(request, limit);
    return NextResponse.json(
      await assessmentService.upload(scope, name, buffer),
      { headers: privateHeaders },
    );
  } catch (error) {
    return assessmentFailure(error);
  }
}
export async function GET(request: NextRequest, context: AssessmentContext) {
  try {
    const file = await assessmentService.download(
      await assessmentScope(request, context),
      request.nextUrl.searchParams.get("draft") === "1",
    );
    return new Response(file.body, {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
        "X-Content-Type-Options": "nosniff",
        ...(file.size == null ? {} : { "Content-Length": String(file.size) }),
      },
    });
  } catch (error) {
    return assessmentFailure(error);
  }
}
