import { type NextRequest, NextResponse } from "next/server";
import { learningViewer, privateHeaders } from "@/lib/learning-path-http";
import {
  LearnerOverviewError,
  studyHeartbeat,
} from "@/lib/learner-overview-contract";
import { overviewFailure } from "@/lib/learner-overview-http";
import { studyActivityService } from "@/lib/learner-overview-runtime";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ courseId: string; lessonId: string }> },
) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new LearnerOverviewError("Yêu cầu không hợp lệ.", 403);
    const userId = await learningViewer(request);
    const { courseId, lessonId } = await context.params;
    const command = studyHeartbeat.parse(
      await request.json().catch(() => null),
    );
    return NextResponse.json(
      await studyActivityService.heartbeat(
        userId,
        courseId,
        lessonId,
        command.action,
        command.trackerId,
        command.action === "start" ? command.expectedOwner : undefined,
      ),
      { headers: privateHeaders },
    );
  } catch (error) {
    return overviewFailure(error);
  }
}
