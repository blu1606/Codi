import { NextResponse, type NextRequest } from "next/server";
import {
  learningFailure,
  learningViewer,
  privateHeaders,
} from "@/lib/learning-path-http";
import { tutorService } from "@/lib/ai-tutor-runtime";

type Context = { params: Promise<{ courseId: string }> };

// The learner's tutor threads in this course (one per lesson), for the Tutor page history.
export async function GET(request: NextRequest, context: Context) {
  try {
    const userId = await learningViewer(request);
    const { courseId } = await context.params;
    return NextResponse.json(
      { threads: await tutorService.listThreads(userId, courseId) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return learningFailure(error);
  }
}
