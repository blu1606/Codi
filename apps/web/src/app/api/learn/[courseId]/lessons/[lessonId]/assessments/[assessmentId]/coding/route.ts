import { NextRequest, NextResponse } from "next/server";
import {
  assessmentFailure,
  assessmentScope,
  readUpload,
  type AssessmentContext,
} from "@/lib/assessment-http";
import { privateHeaders } from "@/lib/learning-path-http";
import { codingCommand } from "@/lib/coding-contract";
import { codingService } from "@/lib/coding-runtime";
import { LearningPathError } from "@/lib/learning-path-contract";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: AssessmentContext) {
  try {
    return NextResponse.json(
      await codingService.get(await assessmentScope(request, context)),
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
    const body = await readUpload(request, 400000);
    let value: unknown;
    try {
      value = JSON.parse(body.toString("utf8"));
    } catch {
      value = null;
    }
    return NextResponse.json(
      await codingService.execute(scope, codingCommand.parse(value)),
      { headers: privateHeaders },
    );
  } catch (error) {
    return assessmentFailure(error);
  }
}
