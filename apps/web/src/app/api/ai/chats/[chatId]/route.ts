import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/services";
import { LearningPathError } from "@/lib/learning-path-contract";
import { learningFailure, privateHeaders } from "@/lib/learning-path-http";
import { aiChatPatch } from "@/lib/ai-chat-contract";
import { chatService, tutorService } from "@/lib/ai-tutor-runtime";

type Context = { params: Promise<{ chatId: string }> };

async function viewer(request: NextRequest, context: Context) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw new LearningPathError("Vui lòng đăng nhập.", 401);
  const { chatId } = await context.params;
  return { userId: session.user.id, chatId: z.uuid().parse(chatId) };
}

/** One chat with its messages; a lesson chat also carries the lesson meta while the learner can still open it. */
export async function GET(request: NextRequest, context: Context) {
  try {
    const { userId, chatId } = await viewer(request, context);
    const { chat, messages } = await chatService.load(userId, chatId);
    const lesson =
      chat.kind === "lesson" && chat.courseId && chat.lessonId
        ? await tutorService
            .scope(userId, chat.courseId, chat.lessonId)
            .then((scope) => tutorService.meta(scope))
            .catch(() => null)
        : null;
    return NextResponse.json(
      { chat, messages, lesson },
      { headers: privateHeaders },
    );
  } catch (error) {
    return learningFailure(error);
  }
}

/** Vote on an answer, or record a suggested change as applied / skipped / undone. */
export async function PATCH(request: NextRequest, context: Context) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new LearningPathError("Yêu cầu không hợp lệ.", 403);
    const { userId, chatId } = await viewer(request, context);
    await chatService.patch(
      userId,
      chatId,
      aiChatPatch.parse(await request.json().catch(() => null)),
    );
    return NextResponse.json({ ok: true }, { headers: privateHeaders });
  } catch (error) {
    return learningFailure(error);
  }
}

/** Deleting a chat is the learner's own, irreversible action (confirmed in the UI). Hint usage stays logged. */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new LearningPathError("Yêu cầu không hợp lệ.", 403);
    const { userId, chatId } = await viewer(request, context);
    await chatService.remove(userId, chatId);
    return NextResponse.json({ ok: true }, { headers: privateHeaders });
  } catch (error) {
    return learningFailure(error);
  }
}
