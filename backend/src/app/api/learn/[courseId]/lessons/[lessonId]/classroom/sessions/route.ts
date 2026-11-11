import { NextResponse, type NextRequest } from "next/server";
import { learningViewer, privateHeaders } from "@/lib/learning-path-http";
import { startSession } from "@/lib/classroom-service";
import { startSessionRequest } from "@/lib/classroom-contract";
import { assertSameOrigin, learnerClassroomFailure, limitLearner, readBody } from "@/lib/classroom-http";

type Context = { params: Promise<{ courseId: string; lessonId: string }> };

/** Body: { checkpointId }. Opens a checkpoint debate; Cô Lam asks the question. */
export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const userId = await learningViewer(request);
    const { courseId, lessonId } = await context.params;
    const body = startSessionRequest.parse(await readBody(request));
    limitLearner(userId);
    return NextResponse.json(await startSession(userId, courseId, lessonId, body.checkpointId), { headers: privateHeaders });
  } catch (error) {
    return learnerClassroomFailure(error);
  }
}
