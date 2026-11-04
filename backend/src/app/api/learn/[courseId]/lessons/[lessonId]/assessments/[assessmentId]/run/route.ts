import { NextResponse, type NextRequest } from "next/server";
import {
  assessmentFailure,
  assessmentScope,
  readUpload,
  type AssessmentContext,
} from "@/lib/assessment-http";
import { assignmentRunService } from "@/lib/assignment-run-runtime";
import { privateHeaders } from "@/lib/learning-path-http";
import { LearningPathError } from "@/lib/learning-path-contract";

export const runtime = "nodejs";

/** Runs a code assignment's draft in the server sandbox (POST { code }) → AssignmentRunView. */
export async function POST(request: NextRequest, context: AssessmentContext) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new LearningPathError("Yêu cầu không hợp lệ.", 403);
    const scope = await assessmentScope(request, context);
    const body = await readUpload(request, 400000);
    let value: unknown;
    try {
      value = JSON.parse(body.toString("utf8"));
    } catch {
      value = null;
    }
    return NextResponse.json(await assignmentRunService.run(scope, value), {
      headers: privateHeaders,
    });
  } catch (error) {
    return assessmentFailure(error);
  }
}
