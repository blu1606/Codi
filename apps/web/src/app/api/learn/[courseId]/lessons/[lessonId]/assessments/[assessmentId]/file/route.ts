import { NextResponse, type NextRequest } from "next/server";
import { assessmentService } from "@/lib/assessment-runtime";
import {
  assessmentFailure,
  assessmentScope,
  type AssessmentContext,
} from "@/lib/assessment-http";
import { privateHeaders } from "@/lib/learning-path-http";
import { LearningPathError } from "@/lib/learning-path-contract";
import { uploadRequest } from "@/lib/assessment-contract";
import { readUpload } from "@/lib/assessment-http";

export const maxDuration = 60;
export async function POST(request: NextRequest, context: AssessmentContext) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new LearningPathError("Yêu cầu không hợp lệ.", 403);
    const scope = await assessmentScope(request, context);
    // This endpoint accepts metadata only. File bytes go directly to private R2.
    const input = uploadRequest.parse(
      JSON.parse((await readUpload(request, 12000)).toString("utf8")),
    );
    return NextResponse.json(
      input.type === "prepare"
        ? await assessmentService.prepareUpload(scope, input.name, input.size)
        : await assessmentService.confirmUpload(scope, input.token),
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
