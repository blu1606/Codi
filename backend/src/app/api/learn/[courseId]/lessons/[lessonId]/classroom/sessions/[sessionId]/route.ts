import { NextResponse, type NextRequest } from "next/server";
import { learningViewer, privateHeaders } from "@/lib/learning-path-http";
import { actOnSession } from "@/lib/classroom-service";
import { sessionActionRequest } from "@/lib/classroom-contract";
import { assertSameOrigin, learnerClassroomFailure, limitLearner, readBody } from "@/lib/classroom-http";

type Context = { params: Promise<{ courseId: string; lessonId: string; sessionId: string }> };

/**
 * Body: { action: "answer", optionIndex? | answer?, version } | { action: "rebut", text, version } | { action: "skip", version }.
 * Answers { session, added[] }; 409 when another tab already advanced the debate.
 */
export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const userId = await learningViewer(request);
    const { courseId, lessonId, sessionId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return NextResponse.json({ error: "Không tìm thấy phiên tranh luận." }, { status: 404, headers: privateHeaders });
    const body = sessionActionRequest.parse(await readBody(request));
    if (body.action !== "skip") limitLearner(userId);
    return NextResponse.json(await actOnSession(userId, courseId, lessonId, sessionId, body), { headers: privateHeaders });
  } catch (error) {
    return learnerClassroomFailure(error);
  }
}
