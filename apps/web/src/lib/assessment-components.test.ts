// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import LessonAssessment from "../components/lesson-assessment";
import type { AssessmentView } from "./assessment-contract";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn() }),
}));
let root: Root | undefined;
let host: HTMLDivElement;
const blank: AssessmentView = {
  id: 7,
  type: "quiz",
  title: "Quiz cuối bài",
  instructions: null,
  maxScore: 100,
  passingScore: 70,
  submissionFormat: null,
  maxFileSizeMb: 20,
  rubric: null,
  dueDays: null,
  questions: [
    {
      id: 1,
      text: "Chọn kiểu chuỗi",
      codeSnippet: null,
      options: [
        { id: 10, text: "string" },
        { id: 11, text: "number" },
      ],
    },
  ],
  previousScore: null,
  submission: null,
};
const sub = (
  overrides: Partial<NonNullable<AssessmentView["submission"]>> = {},
): NonNullable<AssessmentView["submission"]> => ({
  id: 1,
  attempt: 1,
  status: "draft",
  score: null,
  quizPercent: null,
  isPassed: null,
  submittedAt: null,
  gradedAt: null,
  feedback: null,
  fileName: null,
  fileUrl: null,
  linkUrl: null,
  answerText: null,
  draft: null,
  answers: [],
  review: [],
  ...overrides,
});
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function mount(fetcher: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      createElement(LessonAssessment, {
        endpoint: "/api/assessment",
        onChanged: async () => {},
      }),
    );
  });
}
const button = (text: string) =>
  Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  )!;
const click = async (text: string) => {
  await act(async () => {
    button(text).click();
  });
};
async function input(selector: string, value: string) {
  const element = document.querySelector(selector) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("quiz player", () => {
  it("loads the real assessment and starts a persisted attempt", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(blank))
      .mockResolvedValueOnce(response({ ...blank, submission: sub() }));
    await mount(fetcher);
    await click("Làm quiz");
    expect(document.body.textContent).toContain("Chọn kiểu chuỗi");
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({
      type: "quiz-open",
    });
  });
  it("warns before unanswered submission, can cancel, then shows result and explanations", async () => {
    const data = { ...blank, submission: sub() };
    const result = {
      ...blank,
      submission: sub({
        status: "graded",
        score: 0,
        quizPercent: 0,
        isPassed: false,
        answers: [{ questionId: 1, optionId: null }],
        review: [
          {
            questionId: 1,
            correctOptionId: 10,
            isCorrect: false,
            explanation: "string biểu diễn chuỗi.",
          },
        ],
      }),
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValueOnce(response(result));
    await mount(fetcher);
    await click("Nộp bài");
    expect(document.body.textContent).toContain("Còn 1 câu chưa trả lời");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await click("Quay lại làm tiếp");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await click("Nộp bài");
    await click("Vẫn nộp bài");
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({
      type: "quiz-submit",
      submissionId: 1,
      confirmUnanswered: true,
    });
    expect(document.body.textContent).toContain("Chưa đạt");
    expect(document.body.textContent).toContain("string biểu diễn chuỗi.");
  });
  it("renders a passing result and retakes with the current attempt id", async () => {
    const data = {
      ...blank,
      submission: sub({
        status: "graded",
        score: 100,
        quizPercent: 100,
        isPassed: true,
      }),
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValueOnce(
        response({
          ...blank,
          previousScore: 100,
          submission: sub({ id: 2, attempt: 2 }),
        }),
      );
    await mount(fetcher);
    expect(document.body.textContent).toContain("Đạt");
    await click("Làm lại");
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({
      type: "quiz-retake",
      submissionId: 1,
    });
    expect(document.body.textContent).toContain("Kết quả lần trước: 100%");
    expect(document.querySelector('input[type="radio"]:checked')).toBeNull();
  });
  it("keeps the form disabled during submission and prevents duplicate requests", async () => {
    let resolve!: (value: Response) => void;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          ...blank,
          submission: sub({ answers: [{ questionId: 1, optionId: 10 }] }),
        }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      );
    await mount(fetcher);
    await click("Nộp bài");
    expect(button("Đang gửi…").disabled).toBe(true);
    await click("Đang gửi…");
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () =>
      resolve(
        response({
          ...blank,
          submission: sub({
            status: "graded",
            score: 100,
            quizPercent: 100,
            isPassed: true,
          }),
        }),
      ),
    );
  });
});
describe("assignment player", () => {
  const assignment = {
    ...blank,
    type: "assignment" as const,
    title: "Bài tập",
    questions: [],
    submissionFormat: "file_or_link" as const,
    maxScore: 10,
    passingScore: 50,
  };
  it("restores a draft from the server and allows submission", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          ...assignment,
          submission: sub({
            draft: {
              linkUrl: "https://example.com/draft",
              answerText: "Nháp đã lưu",
              fileName: null,
              fileUrl: null,
            },
          }),
        }),
      )
      .mockResolvedValueOnce(
        response({
          ...assignment,
          submission: sub({
            status: "pending",
            linkUrl: "https://example.com/draft",
            answerText: "Nháp đã lưu",
            submittedAt: "2026-10-17T00:00:00Z",
          }),
        }),
      );
    await mount(fetcher);
    expect(document.body.textContent).toContain("Đã khôi phục bản nháp");
    expect(
      (document.querySelector("textarea") as HTMLTextAreaElement).value,
    ).toBe("Nháp đã lưu");
    await click("Nộp bài tập");
    expect(document.body.textContent).toContain("Đã nộp — chờ chấm");
  });
  it("saves a pending replacement and cancels without submitting it", async () => {
    const data = {
      ...assignment,
      submission: sub({
        status: "pending",
        linkUrl: "https://example.com/original",
        answerText: "Bài gốc",
      }),
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValueOnce(response(data));
    await mount(fetcher);
    await click("Nộp lại (trước khi được chấm)");
    await input("textarea", "Bài sửa chưa nộp");
    await click("Huỷ nộp lại");
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({
      type: "assignment-cancel",
    });
    expect(document.body.textContent).toContain("Bài gốc");
      await act(async () => root!.unmount());
      root = undefined;
      expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("shows grades and feedback without an editable form or resubmit", async () => {
    await mount(
      vi
        .fn()
        .mockResolvedValue(
          response({
            ...assignment,
            submission: sub({
              status: "graded",
              score: 8.5,
              isPassed: true,
              feedback: "Giải thích tốt",
              gradedAt: "2026-10-17T00:00:00Z",
            }),
          }),
        ),
    );
    expect(document.body.textContent).toContain("Đã chấm: 8,5/10");
    expect(document.body.textContent).toContain("Giải thích tốt");
    expect(document.body.textContent).toContain("không thể nộp lại");
    expect(document.querySelector("textarea")).toBeNull();
  });
  it("flushes unsaved keystrokes when leaving before the autosave debounce", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(assignment));
    await mount(fetcher);
    await input("textarea", "Nháp cuối cùng");
    await act(async () => root!.unmount());
    root = undefined;
    expect(
      fetcher.mock.calls.some(
        (call) =>
          call[1]?.body &&
          JSON.parse(call[1].body).answerText === "Nháp cuối cùng",
      ),
    ).toBe(true);
  });
  it("renders an upload failure with retry and no browser parser errors", async () => {
    await mount(vi.fn().mockResolvedValueOnce(response(assignment)));
    const element = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    Object.defineProperty(element, "files", {
      value: [new File([new Uint8Array(20 * 1024 * 1024 + 1)], "large.zip")],
    });
    await act(async () =>
      element.dispatchEvent(new Event("change", { bubbles: true })),
    );
    expect(document.body.textContent).toContain("Tệp vượt quá 20MB");
    expect(button("Thử lại")).toBeDefined();
    expect(button("Nộp bài tập").disabled).toBe(true);
  });
});
