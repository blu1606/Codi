import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { LearningPathError } from "@/lib/learning-path-contract";
import {
  learningFailure,
  learningViewer,
  privateHeaders,
} from "@/lib/learning-path-http";
import { messageText } from "@/lib/ai-chat-contract";
import { escalationSummary, tutorEscalation } from "@/lib/ai-tutor-contract";
import { chatService, tutorService } from "@/lib/ai-tutor-runtime";

const lesson = z.object({ courseId: z.string().min(1).max(200), lessonId: z.uuid() });

/** Lesson meta for the panel: code lesson, hint ladder, lecturer and the private conversation status. */
export async function GET(request: NextRequest) {
  try {
    const userId = await learningViewer(request);
    const { courseId, lessonId } = lesson.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    return NextResponse.json(
      await tutorService.meta(await tutorService.scope(userId, courseId, lessonId)),
      { headers: privateHeaders },
    );
  } catch (error) {
    return learningFailure(error);
  }
}

/**
 * "Hỏi giảng viên" (Flow L6d), available any time in a lesson: a private conversation with the AI context
 * the learner ticked. The summary is the learner's last questions in the chat they were looking at.
 */
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new LearningPathError("Yêu cầu không hợp lệ.", 403);
    const userId = await learningViewer(request);
    const body = lesson
      .extend({ chatId: z.uuid().nullable(), escalation: tutorEscalation })
      .strict()
      .parse(await request.json().catch(() => null));
    const scope = await tutorService.scope(userId, body.courseId, body.lessonId);
    const chat = body.chatId ? await chatService.owned(userId, body.chatId) : null;
    const questions =
      chat?.lessonId === body.lessonId
        ? (await chatService.load(userId, chat.id)).messages
            .filter((m) => m.role === "user")
            .map((m) => messageText(m))
        : [];
    return NextResponse.json(
      await tutorService.escalate(scope, body.escalation, escalationSummary(questions)),
      { headers: privateHeaders },
    );
  } catch (error) {
    return learningFailure(error);
  }
}
