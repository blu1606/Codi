import { delay, http, HttpResponse } from "msw";
import { tutorLessonMeta, tutorStreamChunks } from "@/demo-fixtures/learner/s11-tutor";

/**
 * Plays UI message stream chunks as the real /api/ai/chat route sends them (SSE), one every `stepMs`,
 * so reasoning, tool steps and token streaming show live. `hangAfter` stops mid-answer for the "Dừng" state.
 */
export function tutorStream(chunks: object[] = tutorStreamChunks, { stepMs = 350, hangAfter }: { stepMs?: number; hangAfter?: number } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const [i, chunk] of chunks.entries()) {
        if (hangAfter !== undefined && i >= hangAfter) return;
        await delay(stepMs);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new HttpResponse(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}

export const tutorAsk = (respond: () => Response | Promise<Response>) => http.post("/api/ai/chat", respond);
export const tutorAskFails = (status: number, error: string) =>
  tutorAsk(() => HttpResponse.json({ error }, { status }));

/** Default lab answers for the Tutor's writes; a screen state overrides them with its own handlers. */
export const tutorWriteHandlers = [
  tutorAsk(() => tutorStream()),
  http.patch(/\/api\/ai\/chats\/[^/]+$/, () => HttpResponse.json({ ok: true })),
  http.delete(/\/api\/ai\/chats\/[^/]+$/, () => HttpResponse.json({ ok: true })),
  http.post("/api/ai/lesson", () =>
    HttpResponse.json(tutorLessonMeta({ conversation: { id: 8, replied: false, resolved: false, lastReply: null } })),
  ),
];

/** Opens the panel at load and picks the chat shown for a context ("general" or "lesson:<id>"). */
export function seedTutor({ open = true, chats = {} }: { open?: boolean; chats?: Record<string, string> } = {}) {
  sessionStorage.removeItem("codi:tutor-open");
  sessionStorage.setItem("codi:tutor-chats", JSON.stringify(chats));
  if (open) sessionStorage.setItem("codi:tutor-open", "true");
}
