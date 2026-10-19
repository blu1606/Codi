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
  it("shows unavailable questions without offering a quiz that will fail to open", async () => {
    await mount(
      vi.fn().mockResolvedValue(
        response({
          ...blank,
          unavailableReason:
            "Quiz chưa có bộ câu hỏi hợp lệ. Vui lòng liên hệ giảng viên.",
        }),
      ),
    );
    expect(document.body.textContent).toContain("liên hệ giảng viên");
    expect(button("Làm quiz")).toBeUndefined();
  });
  it("queues rapid answer changes while keeping the options usable", async () => {
    let acknowledge!: (response: Response) => void;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ ...blank, submission: sub() }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            acknowledge = resolve;
          }),
      )
      .mockResolvedValueOnce(
        response({
          ...blank,
          submission: sub({ answers: [{ questionId: 1, optionId: 11 }] }),
        }),
      );
    await mount(fetcher);
    const options = document.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    );
    await act(async () => options[0]!.click());
    expect(document.querySelector("fieldset")!.disabled).toBe(false);
    await act(async () => options[1]!.click());
    expect(options[1]!.checked).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () =>
      acknowledge(
        response({
          ...blank,
          submission: sub({ answers: [{ questionId: 1, optionId: 10 }] }),
        }),
      ),
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(options[1]!.checked).toBe(true);
    expect(JSON.parse(fetcher.mock.calls[2]![1].body).optionId).toBe(11);
  });
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
    fetcher.mockResolvedValueOnce(response(data));
    await input("textarea", "Bài sửa chưa nộp");
    await click("Huỷ nộp lại");
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toEqual({
      type: "assignment-cancel",
    });
    expect(document.body.textContent).toContain("Bài gốc");
    await act(async () => root!.unmount());
    root = undefined;
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("shows grades and feedback without an editable form or resubmit", async () => {
    await mount(
      vi.fn().mockResolvedValue(
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
  it("flushes the latest draft with keepalive on pagehide", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() => Promise.resolve(response(assignment)));
    await mount(fetcher);
    await input("textarea", "Nháp khi đóng tab");
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(fetcher.mock.calls[1]![1]).toMatchObject({
      keepalive: true,
      method: "POST",
    });
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).answerText).toBe(
      "Nháp khi đóng tab",
    );
  });
  it("uploads an 8 MB file directly to R2 and confirms only metadata via the app", async () => {
    const uploaded = {
      ...assignment,
      submission: sub({
        draft: {
          fileName: "work.zip",
          fileUrl: "/api/file?draft=1",
          linkUrl: "",
          answerText: "",
        },
      }),
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(assignment))
      .mockResolvedValueOnce(response(assignment))
      .mockResolvedValueOnce(
        response({
          url: "https://private.r2.test/signed",
          token: "signed-ticket",
          expiresIn: 300,
        }),
      )
      .mockResolvedValueOnce(response(uploaded));
    const requests: { method: string; url: string; body?: unknown }[] = [];
    class UploadXHR {
      upload = { onprogress: (_event: unknown) => {} };
      onload = () => {};
      status = 200;
      open(method: string, url: string) {
        requests.push({ method, url });
      }
      setRequestHeader() {}
      send(body: unknown) {
        requests.at(-1)!.body = body;
        this.onload();
      }
      abort() {}
    }
    vi.stubGlobal("XMLHttpRequest", UploadXHR);
    await mount(fetcher);
    const selected = new File([new Uint8Array(8 * 1024 * 1024)], "work.zip");
    const element =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(element, "files", { value: [selected] });
    await act(async () =>
      element.dispatchEvent(new Event("change", { bubbles: true })),
    );
    expect(requests).toEqual([
      { method: "PUT", url: "https://private.r2.test/signed", body: selected },
    ]);
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toEqual({
      type: "prepare",
      name: "work.zip",
      size: selected.size,
    });
    expect(JSON.parse(fetcher.mock.calls[3]![1].body)).toEqual({
      type: "confirm",
      token: "signed-ticket",
    });
    expect(document.body.textContent).toContain("Tệp đã lưu: work.zip");
  });
  it("removes the draft file without falling back to the submitted file", async () => {
    const data = {
      ...assignment,
      submission: sub({
        status: "pending",
        fileName: "old.zip",
        draft: {
          fileName: "new.zip",
          fileUrl: "/api/file?draft=1",
          linkUrl: "https://example.com",
          answerText: "",
        },
      }),
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValueOnce(response(data))
      .mockResolvedValueOnce(
        response({
          ...data,
          submission: {
            ...data.submission,
            draft: { ...data.submission.draft, fileName: null, fileUrl: null },
          },
        }),
      );
    await mount(fetcher);
    await click("Gỡ tệp");
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toEqual({
      type: "assignment-remove-file",
    });
    expect(document.body.textContent).not.toContain("Tệp đã lưu:");
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
