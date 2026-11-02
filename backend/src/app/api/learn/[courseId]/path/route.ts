import { NextResponse, type NextRequest } from "next/server";
import { learningPathCommand, LearningPathError } from "@/lib/learning-path-contract";
import { learningFailure, learningViewer, privateHeaders } from "@/lib/learning-path-http";
import { learningPathService, scheduleLearningPath } from "@/lib/learning-path-runtime";

export const maxDuration = 60;
type Context = { params: Promise<{ courseId: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const userId = await learningViewer(request);
    return NextResponse.json(await learningPathService.get(userId, (await context.params).courseId), { headers: privateHeaders });
  } catch (error) { return learningFailure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new LearningPathError("Yêu cầu không hợp lệ.", 403);
    const userId = await learningViewer(request);
    const { courseId } = await context.params;
    const command = learningPathCommand.parse(await request.json().catch(() => null));
    const data = await learningPathService.execute(userId, courseId, command);
    if (command.type === "sync" || command.type === "retry") scheduleLearningPath(userId, courseId);
    return NextResponse.json(data, { headers: privateHeaders });
  } catch (error) { return learningFailure(error); }
}
