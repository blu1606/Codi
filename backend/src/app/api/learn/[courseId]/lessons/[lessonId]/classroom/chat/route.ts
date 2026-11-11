import { NextResponse, type NextRequest } from "next/server";
import { learningViewer, privateHeaders } from "@/lib/learning-path-http";
import { classroomChat } from "@/lib/classroom-service";
import { chatRequest } from "@/lib/classroom-contract";
import { assertSameOrigin, learnerClassroomFailure, limitLearner, readBody } from "@/lib/classroom-http";

type Context = { params: Promise<{ courseId: string; lessonId: string }> };

/** Body: { message, recipient: "all" | "colam" | "bo" | "tri" | "linhchi" | "minhkhang" | "an", currentTime?, history[] }. */
export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const userId = await learningViewer(request);
    const { courseId, lessonId } = await context.params;
    const body = chatRequest.parse(await readBody(request));
    limitLearner(userId);
    return NextResponse.json(await classroomChat(userId, courseId, lessonId, body), { headers: privateHeaders });
  } catch (error) {
    return learnerClassroomFailure(error);
  }
}
