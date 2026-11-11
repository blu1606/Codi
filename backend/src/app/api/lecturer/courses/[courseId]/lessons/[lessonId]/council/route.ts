import { NextResponse, type NextRequest } from "next/server";
import { beginCouncil, clearCheckpoints, councilOverview, runCouncil } from "@/lib/lesson-council";
import { COUNCIL_MAX_CHECKPOINTS } from "@/lib/classroom-contract";
import { assertSameOrigin, lecturerClassroomFailure, readBody } from "@/lib/classroom-http";

type Ctx = { params: Promise<{ courseId: string; lessonId: string }> };
const HEARTBEAT_MS = 15_000;

/** War Room data: lesson source, applied checkpoints (with answer keys) and the latest runs. Owner only. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const { courseId, lessonId } = await params;
    return NextResponse.json(await councilOverview(courseId, lessonId));
  } catch (error) {
    return lecturerClassroomFailure(error);
  }
}

/**
 * Body: { count?: 1–4 }. Starts a council run and streams it as server-sent events, one JSON object per `data:` line:
 * { type: "run", runId, source } → { type: "event", event } … → { type: "draft", runId, draft } | { type: "error", error, code },
 * then `data: [DONE]`. Errors before the stream starts are plain JSON. The run keeps going (and is saved) if the client leaves.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    assertSameOrigin(request);
    const { courseId, lessonId } = await params;
    const body = (await readBody(request)) as { count?: unknown } | null;
    const count = Math.max(1, Math.min(COUNCIL_MAX_CHECKPOINTS, Math.round(Number(body?.count) || 2)));
    const run = await beginCouncil(courseId, lessonId, count);

    const encoder = new TextEncoder();
    let open = true;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (chunk: string) => {
          if (!open) return;
          try { controller.enqueue(encoder.encode(chunk)); } catch { open = false; }
        };
        const send = (payload: unknown) => write(`data: ${JSON.stringify(payload)}\n\n`);
        heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
        send({ type: "run", runId: run.runId, source: run.info, count: run.count });
        runCouncil(run.runId, run.source, run.count, (event) => send({ type: "event", event }))
          .then((draft) => send({ type: "draft", runId: run.runId, draft }))
          .catch((error: unknown) => {
            const e = error as { message?: string; code?: string };
            send({ type: "error", runId: run.runId, error: e?.message || "Hội đồng gặp lỗi. Vui lòng thử lại.", code: e?.code ?? "error" });
          })
          .finally(() => {
            clearInterval(heartbeat);
            write("data: [DONE]\n\n");
            if (open) { open = false; try { controller.close(); } catch { /* already closed by the client */ } }
          });
      },
      cancel() { open = false; clearInterval(heartbeat); },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "private, no-cache, no-transform", "X-Accel-Buffering": "no" },
    });
  } catch (error) {
    return lecturerClassroomFailure(error);
  }
}

/** Removes every checkpoint of the lesson. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    assertSameOrigin(request);
    const { courseId, lessonId } = await params;
    return NextResponse.json(await clearCheckpoints(courseId, lessonId));
  } catch (error) {
    return lecturerClassroomFailure(error);
  }
}
