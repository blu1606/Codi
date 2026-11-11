import { NextResponse, type NextRequest } from "next/server";
import { learningViewer, privateHeaders } from "@/lib/learning-path-http";
import { getClassroom } from "@/lib/classroom-service";
import { learnerClassroomFailure } from "@/lib/classroom-http";

type Context = { params: Promise<{ courseId: string; lessonId: string }> };

/** AI classroom of a lesson: checkpoints (no answer keys), the six classmates and the learner's latest debates. */
export async function GET(request: NextRequest, context: Context) {
  try {
    const userId = await learningViewer(request);
    const { courseId, lessonId } = await context.params;
    return NextResponse.json(await getClassroom(userId, courseId, lessonId), { headers: privateHeaders });
  } catch (error) {
    return learnerClassroomFailure(error);
  }
}
