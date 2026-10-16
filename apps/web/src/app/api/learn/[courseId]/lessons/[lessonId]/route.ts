import { NextResponse, type NextRequest } from "next/server";
import { lessonPlayerCommand } from "@/lib/lesson-player-contract";
import { lessonPlayerService } from "@/lib/lesson-player-runtime";
import { LearningPathError } from "@/lib/learning-path-contract";
import { learningFailure, learningViewer, privateHeaders } from "@/lib/learning-path-http";
import { scheduleLearningPath } from "@/lib/learning-path-runtime";

export const maxDuration = 60;
type Context = { params: Promise<{ courseId: string; lessonId: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const userId = await learningViewer(request);
    const { courseId, lessonId } = await context.params;
    return NextResponse.json(await lessonPlayerService.get(userId, courseId, lessonId), { headers: privateHeaders });
  } catch (error) { return learningFailure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new LearningPathError("Yêu cầu không hợp lệ.", 403);
    const userId = await learningViewer(request);
    const { courseId, lessonId } = await context.params;
    const command = lessonPlayerCommand.parse(await request.json().catch(() => null));
    const data = await lessonPlayerService.execute(userId, courseId, lessonId, command);
    if (data.path.updating) scheduleLearningPath(userId, courseId);
    return NextResponse.json(data, { headers: privateHeaders });
  } catch (error) { return learningFailure(error); }
}
