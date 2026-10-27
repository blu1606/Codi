import { NextResponse, type NextRequest } from "next/server";
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import { auth, db } from "@/services";
import { getLlmProvider } from "@/lib/ai";
import { LearningPathError } from "@/lib/learning-path-contract";
import {
  learningFailure,
  learningViewer,
  privateHeaders,
} from "@/lib/learning-path-http";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  AI_CHAT_QUESTION_MAX,
  aiChatRequest,
  messageText,
  type AiChatMessage,
  type AiChatSummary,
} from "@/lib/ai-chat-contract";
import {
  GENERAL_SYSTEM,
  generalTools,
  lessonTools,
} from "@/lib/ai-chat-service";
import {
  TUTOR_STOPPED_TEXT,
  tutorSystemPrompt,
  type TutorContext,
} from "@/lib/ai-tutor-contract";
import { logAdvisorInteraction } from "@/lib/ai-advisor-service";
import { chatService, tutorService } from "@/lib/ai-tutor-runtime";
import type { TutorScope } from "@/lib/ai-tutor-service";

export const runtime = "nodejs";
export const maxDuration = 60;

// Per learner (or per IP for guests) across every chat; a burst beyond this is the "rate limited" state.
const RATE = { windowMs: 60_000, max: 8 };
const UNAVAILABLE = "Tutor đang tạm nghỉ. Câu hỏi của bạn vẫn còn ở đây.";
const nextId = createIdGenerator({ prefix: "msg", size: 16 });

/**
 * One turn of the shared Tutor (H3 copilot): streams text, reasoning and tool steps as UI message parts.
 * Signed-in turns are stored per chat; a lesson chat re-checks lesson access on every turn.
 */
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new LearningPathError("Yêu cầu không hợp lệ.", 403);
    const body = aiChatRequest.parse(await request.json().catch(() => null));
    const question = messageText(body.message);
    if (!question || question.length > AI_CHAT_QUESTION_MAX)
      throw new LearningPathError("Câu hỏi không hợp lệ.", 400);
    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id ?? null;

    const limit = checkRateLimit(
      userId ? `ai-chat:${userId}` : `ai-chat:ip:${getClientIp(request)}`,
      RATE,
    );
    if (!limit.success) {
      const retryAfter = Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Bạn đã hỏi quá nhiều trong thời gian ngắn", retryAfter },
        {
          status: 429,
          headers: { ...privateHeaders, "Retry-After": String(retryAfter) },
        },
      );
    }

    // The chat keeps the context it started in; reopening an old lesson chat elsewhere still reads that lesson.
    let chat: AiChatSummary | null = null;
    let scope: TutorScope | null = null;
    if (userId) {
      const existing = await chatService.owned(userId, body.id);
      const lesson =
        existing?.kind === "lesson"
          ? existing.courseId && existing.lessonId
            ? { courseId: existing.courseId, lessonId: existing.lessonId }
            : null
          : !existing && body.context.kind === "lesson"
            ? body.context
            : undefined;
      if (lesson === null)
        throw new LearningPathError("Bài học của đoạn chat này không còn nữa.", 410);
      if (lesson)
        scope = await tutorService.scope(
          await learningViewer(request),
          lesson.courseId,
          lesson.lessonId,
        );
      chat = await chatService.open({
        userId,
        chatId: body.id,
        context: body.context,
        lesson: scope,
        question,
      });
    } else if (body.context.kind === "lesson")
      throw new LearningPathError("Đăng nhập để hỏi Tutor về bài học.", 401);

    const hint =
      body.message.metadata?.hint && scope
        ? await tutorService.beginHint(scope, question)
        : null;
    if (body.message.metadata?.hint && !scope)
      throw new LearningPathError("Gợi ý từng bước chỉ có trong bài học.", 400);

    const asked: AiChatMessage = {
      id: body.message.id,
      role: "user",
      parts: [{ type: "text", text: question }],
      metadata: hint ? { hint: hint.level } : {},
    };
    let history: AiChatMessage[];
    if (chat) {
      await chatService.saveQuestion(chat.id, asked);
      history = await chatService.history(chat.id);
    } else
      history = [
        ...(body.history ?? []).map(
          (m): AiChatMessage => ({
            id: m.id,
            role: m.role,
            parts: [{ type: "text", text: messageText(m as AiChatMessage) }],
          }),
        ),
        asked,
      ].filter((m) => messageText(m));

    // Chips (code, test, selection) belong to the screen the learner is on, so they only go with that lesson's chat.
    const attached: TutorContext =
      scope &&
      body.context.kind === "lesson" &&
      body.context.lessonId === scope.lessonId
        ? (body.lesson?.context ?? {})
        : {};
    const tools = scope
      ? lessonTools(db, scope, {
          code: attached.code ?? "",
          hintLevel: hint?.level ?? null,
        })
      : generalTools(db, userId);
    const system = scope
      ? tutorSystemPrompt({
          turn: hint
            ? { type: "hint", level: hint.level }
            : { type: "ask", mode: body.lesson?.mode ?? "simple" },
          lesson: scope.lesson,
          context: attached,
        })
      : `${GENERAL_SYSTEM}${session?.user ? `\nHọc viên: ${session.user.name}` : ""}\nĐang hỏi về: ${body.context.kind === "general" ? body.context.label : "Codi"}`;

    const started = Date.now();
    const model = getLlmProvider().getModel();
    const result = streamText({
      model,
      system,
      messages: await convertToModelMessages(history, {
        tools,
        ignoreIncompleteToolCalls: true,
      }),
      tools,
      stopWhen: isStepCount(5),
      abortSignal: request.signal,
      maxRetries: 0,
      maxOutputTokens: 2000,
      // Reasoning summaries stream as their own parts ("Tutor đang suy nghĩ") where the model supports them.
      providerOptions: {
        google: { thinkingConfig: { includeThoughts: true } },
      },
    });
    // Keep reading after the client goes away so the turn still ends in exactly one saved outcome.
    void result.consumeStream();

    const stream = toUIMessageStream<typeof tools, AiChatMessage>({
      stream: result.stream,
      tools,
      originalMessages: history,
      generateMessageId: nextId,
      messageMetadata: ({ part }) =>
        part.type === "start"
          ? {
              createdAt: new Date().toISOString(),
              ...(hint ? { hint: hint.level } : {}),
            }
          : undefined,
      onError: () => UNAVAILABLE,
      onEnd: async ({ responseMessage, isAborted, outcome }) => {
        const failed = outcome.status === "failed";
        const answer = messageText(responseMessage);
        if (chat && !failed)
          await chatService
            .saveAnswer(chat.id, {
              ...responseMessage,
              parts:
                isAborted && !answer
                  ? [{ type: "text", text: TUTOR_STOPPED_TEXT }]
                  : responseMessage.parts,
              metadata: {
                ...responseMessage.metadata,
                ...(isAborted ? { stopped: true } : {}),
              },
            })
            .catch((error) => console.error("Failed to save Tutor answer", error));
        const usage = await Promise.resolve(result.totalUsage).catch(() => null);
        const log = {
          model: model.modelId,
          question,
          answer: failed ? null : answer,
          promptTokens: usage?.inputTokens ?? null,
          completionTokens: usage?.outputTokens ?? null,
          latencyMs: Date.now() - started,
          error: failed
            ? String((outcome as { error?: unknown }).error ?? "failed").slice(0, 500)
            : isAborted
              ? "stopped by learner"
              : null,
        };
        await (scope
          ? tutorService.logTurn(scope, hint?.logId ?? null, log)
          : logAdvisorInteraction(db, {
              userId,
              userPrompt: question,
              aiResponse: log.answer ?? "",
              latencyMs: log.latencyMs,
              isSuccess: !failed,
              errorMessage: log.error,
              model: log.model,
              promptTokens: log.promptTokens,
              completionTokens: log.completionTokens,
            })
        ).catch((error) => console.error("Failed to log Tutor turn", error));
      },
    });
    return createUIMessageStreamResponse({ stream, headers: privateHeaders });
  } catch (error) {
    return learningFailure(error);
  }
}
