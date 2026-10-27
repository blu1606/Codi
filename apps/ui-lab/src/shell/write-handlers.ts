import { http, HttpResponse } from "msw";
import { tutorialAtStep } from "@/demo-fixtures/learner/s11-tutorial";
import { tutorWriteHandlers } from "./tutor-handlers";

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
  ...tutorWriteHandlers,
];
