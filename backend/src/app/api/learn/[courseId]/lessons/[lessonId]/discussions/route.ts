import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/services";
import {
  learningFailure,
  learningViewer,
  privateHeaders,
} from "@/lib/learning-path-http";
import { LearningPathError } from "@/lib/learning-path-contract";
import {
  listLessonQuestions,
  postLessonQuestion,
} from "@/lib/lesson-qa-service";
import { tutorService } from "@/lib/ai-tutor-runtime";

type Context = { params: Promise<{ courseId: string; lessonId: string }> };

const postQuestionSchema = z.object({
  text: z.string().min(10, "Câu hỏi cần ít nhất 10 ký tự để giảng viên hiểu rõ.").max(5000),
}).strict();

export async function GET(request: NextRequest, context: Context) {
  try {
    const userId = await learningViewer(request);
    const { courseId, lessonId } = await context.params;
    await tutorService.scope(userId, courseId, lessonId);
    const questions = await listLessonQuestions(db, userId, courseId, lessonId);
    return NextResponse.json({ questions }, { headers: privateHeaders });
  } catch (error) {
    return learningFailure(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new LearningPathError("Yêu cầu không hợp lệ.", 403);
    const userId = await learningViewer(request);
    const { courseId, lessonId } = await context.params;
    await tutorService.scope(userId, courseId, lessonId);
    const json = await request.json().catch(() => ({}));
    const { text } = postQuestionSchema.parse(json);

    const question = await postLessonQuestion(
      db,
      userId,
      courseId,
      lessonId,
      text,
    );
    return NextResponse.json(question, { headers: privateHeaders });
  } catch (error) {
    return learningFailure(error);
  }
}
