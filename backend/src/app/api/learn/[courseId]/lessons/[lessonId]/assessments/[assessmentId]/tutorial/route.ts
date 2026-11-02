import { NextRequest, NextResponse } from "next/server";
import {
  assessmentFailure,
  assessmentScope,
  readUpload,
  type AssessmentContext,
} from "@/lib/assessment-http";
import { privateHeaders } from "@/lib/learning-path-http";
import { LearningPathError } from "@/lib/learning-path-contract";
import { tutorialCommand } from "@/lib/tutorial-contract";
import { tutorialService } from "@/lib/tutorial-runtime";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: AssessmentContext) {
  try {
    return NextResponse.json(
      await tutorialService.get(await assessmentScope(request, context)),
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
    return NextResponse.json(
      await tutorialService.execute(
        scope,
        tutorialCommand.parse(JSON.parse(body.toString("utf8"))),
      ),
      { headers: privateHeaders },
    );
  } catch (error) {
    return assessmentFailure(error);
  }
}
