import { http, HttpResponse } from "msw";
import { tutorialAtStep } from "@/demo-fixtures/learner/s11-tutorial";
import { tutorAnswered } from "@/demo-fixtures/learner/s11-tutor";

// What a tutor turn streams back in the lab: a fixed short reply, never a model answer.
const TUTOR_STREAM_ANSWER = "Mình gợi ý bạn xem lại điều kiện dừng và giá trị của biến trước vòng lặp. Hãy tự tính tay một lượt trước khi chạy lại.";

/**
 * Lab-only answers for interactive writes that just move the UI along
 * (they have no demo fallback in the app: writes never fake success there).
 */
export const labWriteHandlers = [
  // Tutorial commands: step / draft / run / reset / solution.
  http.post(/\/api\/learn\/[^/]+\/lessons\/[^/]+\/assessments\/\d+\/tutorial$/, async ({ request }) => {
    const command = (await request.json().catch(() => ({}))) as { type?: string; step?: number; code?: string };
    if (command.type === "draft") return HttpResponse.json({ saved: true, code: command.code ?? "" });
    const view = tutorialAtStep(command.step ?? 0);
    if (command.type === "solution") return HttpResponse.json({ ...view, gated: false, body: "Lời giải mẫu cho bước này.", code: "function chao(ten) {\n  return `Xin chào, ${ten}!`;\n}\n" });
    return HttpResponse.json(view);
  }),
  // Tutor turns: ask / hint stream the answer as plain text; other commands return the thread.
  http.post(/\/api\/learn\/[^/]+\/lessons\/[^/]+\/tutor$/, async ({ request }) => {
    const command = (await request.json().catch(() => ({}))) as { type?: string };
    if (command.type === "ask" || command.type === "hint")
      return new HttpResponse(TUTOR_STREAM_ANSWER, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    return HttpResponse.json(tutorAnswered);
  }),
];
