import { useEffect, type ReactNode } from "react";
import { QuizBuilderClient } from "@/app/dashboard/lecturer/courses/[courseId]/quiz/[lessonId]/quiz-builder-client";
import {
  lecturerAiQuizQuestions,
  lecturerQuizBuilder,
  lecturerQuizEmpty,
  lecturerQuizEntry,
  lecturerQuizImportSample,
  lecturerQuizLocked,
} from "@/demo-fixtures/lecturer/quiz-builder";
import type { Screen } from "../screen-types";

const lessonRoute = { pathname: "/dashboard/lecturer/courses/course-react-001/quiz/22222222-2222-4222-8222-222222222202" };
const entryRoute = { pathname: "/dashboard/lecturer/courses/course-react-001/quiz/entry" };

type LabStep = { click: string } | { paste: string };

/**
 * Lab-only driver: performs the same clicks and typing a lecturer would, so a
 * state can open a dialog or fill a field without changing the production client.
 */
function LabScript({ steps, children }: { steps: LabStep[]; children: ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const findButton = (label: string) =>
      [...document.querySelectorAll("button")].find((button) => !button.disabled && button.textContent?.trim() === label) ?? null;
    const waitFor = async <T,>(find: () => T | null): Promise<T | null> => {
      for (let i = 0; i < 40 && !cancelled; i++) {
        const found = find();
        if (found) return found;
        await sleep(100);
      }
      return null;
    };

    (async () => {
      await sleep(300);
      for (const step of steps) {
        if (cancelled) return;
        if ("click" in step) {
          const button = await waitFor(() => findButton(step.click));
          button?.click();
        } else {
          const textarea = await waitFor(() => document.querySelector<HTMLTextAreaElement>("textarea[aria-label='Nội dung câu hỏi cần nhập']"));
          if (textarea) {
            const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
            setValue.call(textarea, step.paste);
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
        await sleep(150);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
  return <>{children}</>;
}

const editor = (initialData: typeof lecturerQuizBuilder) => (
  <QuizBuilderClient courseId="course-react-001" lessonId="22222222-2222-4222-8222-222222222202" initialData={initialData} />
);

const openAi: LabStep = { click: "Tạo bằng AI" };
const generate: LabStep = { click: "Tạo câu hỏi" };

// Simulate only the server-action protocol; no real queue or provider is contacted.
function workerQuizActions(outcome: "running" | "completed" | "failed") {
  let submitted = false;
  return {
    startQuizGeneration: () => { submitted = true; return { ok: { mode: "queued", id: "lab-quiz-job" } }; },
    readQuizGeneration: () => ({ ok: !submitted ? { status: "none" } : outcome === "completed"
      ? { status: "completed", jobId: "lab-quiz-job", questions: lecturerAiQuizQuestions }
      : { status: outcome } }),
  };
}

export const lecturerQuizScreen: Screen = {
  id: "S23",
  title: "Trình tạo quiz",
  group: "Giảng viên",
  role: "lecturer",
  layout: "lecturer",
  mockupHash: "#/teach/courses/course-react-001/quiz/22222222-2222-4222-8222-222222222202",
  states: {
    editing: {
      label: "Có câu hỏi",
      route: lessonRoute,
      render: () => editor(lecturerQuizBuilder),
    },
    empty: {
      label: "Chưa có câu hỏi",
      route: lessonRoute,
      render: () => editor(lecturerQuizEmpty),
    },
    locked: {
      label: "Chờ duyệt (chỉ đọc)",
      route: lessonRoute,
      render: () => editor(lecturerQuizLocked),
    },
    "save-error": {
      label: "Lưu lỗi",
      route: lessonRoute,
      actions: { saveQuizData: { error: "Không thể lưu bài quiz. Vui lòng thử lại." } },
      render: () => editor(lecturerQuizBuilder),
    },
    entry: {
      label: "Bài kiểm tra đầu vào",
      route: entryRoute,
      render: () => <QuizBuilderClient courseId="course-react-001" lessonId="entry" initialData={lecturerQuizEntry} />,
    },
    "import-dialog": {
      label: "Nhập hàng loạt (có câu lỗi)",
      route: lessonRoute,
      render: () => (
        <LabScript steps={[{ click: "Nhập hàng loạt" }, { paste: lecturerQuizImportSample }]}>
          {editor(lecturerQuizBuilder)}
        </LabScript>
      ),
    },
    "ai-panel": {
      label: "AI: mở bảng tạo câu hỏi",
      route: lessonRoute,
      actions: workerQuizActions("running"),
      render: () => <LabScript steps={[openAi]}>{editor(lecturerQuizBuilder)}</LabScript>,
    },
    "ai-running": {
      label: "AI: đang xử lý nền",
      route: lessonRoute,
      actions: workerQuizActions("running"),
      render: () => <LabScript steps={[openAi, generate]}>{editor(lecturerQuizBuilder)}</LabScript>,
    },
    "ai-results": {
      label: "AI: kết quả chờ duyệt",
      route: lessonRoute,
      actions: workerQuizActions("completed"),
      render: () => <LabScript steps={[openAi, generate]}>{editor(lecturerQuizBuilder)}</LabScript>,
    },
    "ai-error": {
      label: "AI: lỗi có thể thử lại",
      route: lessonRoute,
      actions: workerQuizActions("failed"),
      render: () => <LabScript steps={[openAi, generate]}>{editor(lecturerQuizBuilder)}</LabScript>,
    },
  },
};
