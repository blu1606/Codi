import { NextResponse, type NextRequest } from "next/server";
import { assessmentCommand } from "@/lib/assessment-contract";
import { assessmentService } from "@/lib/assessment-runtime";
import {
  assessmentFailure,
  assessmentScope,
  type AssessmentContext,
} from "@/lib/assessment-http";
import { privateHeaders } from "@/lib/learning-path-http";
import { LearningPathError } from "@/lib/learning-path-contract";

export async function GET(request: NextRequest, context: AssessmentContext) {
  try {
    return NextResponse.json(
      await assessmentService.get(await assessmentScope(request, context)),
      { headers: privateHeaders },
    );
  } catch (error) {
    return assessmentFailure(error);
  }
}
export async function POST(request: NextRequest, context: AssessmentContext) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new LearningPathError("Yêu cầu không hợp lệ.", 403);
    const scope = await assessmentScope(request, context);
    const command = assessmentCommand.parse(
      await request.json().catch(() => null),
    );
    return NextResponse.json(await assessmentService.execute(scope, command), {
      headers: privateHeaders,
    });
  } catch (error) {
    return assessmentFailure(error);
  }
}
