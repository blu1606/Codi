import { NextResponse, type NextRequest } from "next/server";
import { LearningPathError } from "@/lib/learning-path-contract";
import {
  learningFailure,
  learningViewer,
  privateHeaders,
} from "@/lib/learning-path-http";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  lineRefs,
  sanitizeDiff,
  tutorCommand,
  tutorSystemPrompt,
  tutorUserPrompt,
  type TutorTurnCommand,
} from "@/lib/ai-tutor-contract";
import { generateTutorHint, streamTutorAnswer } from "@/lib/ai-tutor-ai";
import { tutorService } from "@/lib/ai-tutor-runtime";
import type { TurnOutcome, TutorScope } from "@/lib/ai-tutor-service";

export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ courseId: string; lessonId: string }> };

// Per learner across lessons; a burst beyond this is the "rate limited" state, not an error.
const TUTOR_RATE = { windowMs: 60_000, max: 8 };
const UNAVAILABLE = "AI trợ lý tạm thời không khả dụng";

async function scopeOf(request: NextRequest, context: Context) {
  const userId = await learningViewer(request);
  const { courseId, lessonId } = await context.params;
  return tutorService.scope(userId, courseId, lessonId);
}

export async function GET(request: NextRequest, context: Context) {
  try {
    return NextResponse.json(
      await tutorService.get(await scopeOf(request, context)),
      { headers: privateHeaders },
    );
  } catch (error) {
    return learningFailure(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new LearningPathError("Yêu cầu không hợp lệ.", 403);
    const command = tutorCommand.parse(await request.json().catch(() => null));
    const scope = await scopeOf(request, context);
    if (command.type !== "ask" && command.type !== "hint")
      return NextResponse.json(await tutorService.execute(scope, command), {
        headers: privateHeaders,
      });
    const limit = checkRateLimit(`ai-tutor:${scope.userId}`, TUTOR_RATE);
    if (!limit.success) {
      const view = await tutorService.recordLimit(
        scope,
        command.type === "ask" ? command.question : "Cho mình gợi ý tiếp theo",
      );
      const retryAfter = Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Bạn đã hỏi quá nhiều trong thời gian ngắn", retryAfter, view },
        {
          status: 429,
          headers: { ...privateHeaders, "Retry-After": String(retryAfter) },
        },
      );
    }
    return await turn(request, scope, command);
  } catch (error) {
    return learningFailure(error);
  }
}

async function turn(
  request: NextRequest,
  scope: TutorScope,
  command: TutorTurnCommand,
) {
  const started = Date.now();
  const begun = await tutorService.beginTurn(scope, command);
  const code = command.context.code ?? "";
  const lineCount = code ? code.split("\n").length : 0;
  const prompt = tutorUserPrompt({
    lesson: scope.lesson,
    context: command.context,
    history: begun.history,
    question: begun.question,
  });
  const failed = (cause: unknown, text = ""): TurnOutcome =>
    request.signal.aborted
      ? { kind: "stopped", text }
      : {
          kind: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        };
  const unavailable = (view: unknown) =>
    NextResponse.json(
      { error: UNAVAILABLE, view },
      { status: 503, headers: privateHeaders },
    );

  if (command.type === "hint") {
    const level = begun.level!;
    try {
      const { model, hint, usage } = await generateTutorHint({
        system: tutorSystemPrompt({ type: "hint", level }),
        prompt,
        signal: request.signal,
      });
      const view = await tutorService.finishTurn(
        scope,
        begun,
        {
          kind: "answer",
          text: hint.text,
          lines: hint.lines.filter((n) => n >= 1 && n <= lineCount).slice(0, 5),
          diff: level === 3 ? sanitizeDiff(hint.diff, code) : null,
        },
        { model, ...usage, latencyMs: Date.now() - started },
      );
      return NextResponse.json(view, { headers: privateHeaders });
    } catch (cause) {
      const outcome = failed(cause);
      const view = await tutorService.finishTurn(scope, begun, outcome, {
        model: null,
        promptTokens: null,
        completionTokens: null,
        latencyMs: Date.now() - started,
      });
      return outcome.kind === "error"
        ? unavailable(view)
        : NextResponse.json(view, { headers: privateHeaders });
    }
  }

  const stream = streamTutorAnswer({
    system: tutorSystemPrompt({ type: "ask", mode: command.mode }),
    prompt,
    signal: request.signal,
  });
  const chunks = stream.chunks[Symbol.asyncIterator]();
  let text = "";
  let settled = false;
  // Exactly one terminal outcome per turn, whichever of finish / stop / failure comes first.
  const settle = async (outcome: TurnOutcome) => {
    if (settled) return;
    settled = true;
    const final: TurnOutcome =
      outcome.kind === "answer" && !outcome.text.trim()
        ? { kind: "error", message: "empty answer" }
        : outcome;
    const usage = await stream.usage();
    await tutorService
      .finishTurn(scope, begun, final, {
        model: stream.model,
        ...usage,
        latencyMs: Date.now() - started,
      })
      .catch((error) => console.error("Failed to save tutor turn", error));
  };

  // Wait for the first chunk so a provider failure is still a plain JSON error, not a broken stream.
  try {
    const first = await chunks.next();
    if (first.done) {
      await settle({ kind: "answer", text: "", lines: [], diff: null });
      return unavailable(await tutorService.get(scope));
    }
    text = first.value;
  } catch (cause) {
    const outcome = failed(cause);
    await settle(outcome);
    const view = await tutorService.get(scope);
    return outcome.kind === "error"
      ? unavailable(view)
      : NextResponse.json(view, { headers: privateHeaders });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
    },
    async pull(controller) {
      try {
        const next = await chunks.next();
        if (next.done) {
          await settle({
            kind: "answer",
            text,
            lines: lineRefs(text, lineCount),
            diff: null,
          });
          controller.close();
          return;
        }
        text += next.value;
        controller.enqueue(encoder.encode(next.value));
      } catch (cause) {
        await settle(failed(cause, text));
        controller.close();
      }
    },
    async cancel() {
      // Save the stop now: closing the iterator waits for the in-flight chunk, which may never come.
      void chunks.return?.(undefined)?.catch(() => {});
      await settle({ kind: "stopped", text });
    },
  });
  return new Response(body, {
    headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}
