import { NextResponse, type NextRequest } from "next/server";
import { learningFailure, learningViewer, privateHeaders } from "@/lib/learning-path-http";
import { learningPathService } from "@/lib/learning-path-runtime";

export async function GET(request: NextRequest, context: { params: Promise<{ courseId: string; lessonId: string }> }) {
  try {
    const userId = await learningViewer(request);
    const { courseId, lessonId } = await context.params;
    const lesson = await learningPathService.assertLessonAccess(userId, courseId, lessonId);
    return NextResponse.json({ lessonId: lesson.id, allowed: true }, { headers: privateHeaders });
  } catch (error) { return learningFailure(error); }
}
