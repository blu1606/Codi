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
  escalateToLecturer,
  getLearnerLessonConversation,
  postLearnerConversationReply,
} from "@/lib/lesson-qa-service";
import { tutorService } from "@/lib/ai-tutor-runtime";

type Context = { params: Promise<{ courseId: string; lessonId: string }> };

const escalateSchema = z.object({
  text: z.string().min(10, "Câu hỏi cần ít nhất 10 ký tự để giảng viên hiểu rõ.").max(5000),
  withCode: z.boolean().optional(),
  withTest: z.boolean().optional(),
  withAi: z.boolean().optional(),
  code: z.string().optional(),
  failingTest: z.string().nullable().optional(),
  aiSummary: z.string().optional(),
  conversationId: z.number().int().positive().optional(),
}).strict();

export async function GET(request: NextRequest, context: Context) {
  try {
    const userId = await learningViewer(request);
    const { courseId, lessonId } = await context.params;
    await tutorService.scope(userId, courseId, lessonId);
    const conv = await getLearnerLessonConversation(
      db,
      userId,
      courseId,
      lessonId,
    );
    return NextResponse.json({ conversation: conv }, { headers: privateHeaders });
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
    const data = escalateSchema.parse(json);

    // If conversationId is supplied, this is a reply to existing conversation
    if (data.conversationId) {
      const reply = await postLearnerConversationReply(
        db,
        userId,
        data.conversationId,
        courseId,
        lessonId,
        data.text,
      );
      return NextResponse.json({ reply }, { headers: privateHeaders });
    }

    const conv = await escalateToLecturer(
      db,
      userId,
      courseId,
      lessonId,
      data,
    );
    return NextResponse.json({ conversation: conv }, { headers: privateHeaders });
  } catch (error) {
    return learningFailure(error);
  }
}
