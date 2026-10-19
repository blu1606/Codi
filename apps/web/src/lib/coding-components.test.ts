// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import LessonCoding from "../components/lesson-coding";
import type { CodingView } from "./coding-contract";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn() }),
}));
let root: Root | undefined;
const blank: CodingView = {
  id: 7,
  title: "Bài tập code",
  instructions: "Viết hàm inc.",
  language: "javascript",
  available: true,
  starterCode: "function inc(n) { return 0; }",
  code: "function inc(n) { return 0; }",
  hints: ["Dùng phép cộng."],
  lockedHints: 2,
  solution: null,
  solutionAvailable: false,
  solutionViewed: false,
  runs: 0,
  submits: 0,
  failedSubmits: 0,
  passed: false,
  score: null,
  tests: [{ id: 1, name: "Mẫu 1", input: "inc(1)", expectedOutput: "2" }],
  lastRun: null,
};
const result = (
  phase: NonNullable<CodingView["lastRun"]>["phase"] = "done",
): NonNullable<CodingView["lastRun"]> => ({
  mode: "run",
  phase,
  durationMs: 10,
  logs: ["console mẫu"],
  passed: 0,
  total: 1,
  hiddenPassed: 0,
  hiddenTotal: 0,
  outcomes: [
    {
      id: 1,
      passed: false,
      actual: "0",
      error: phase === "runtime" ? "n is not defined" : null,
      line: phase === "runtime" ? 2 : null,
    },
  ],
});
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function mount(
  fetcher: ReturnType<typeof vi.fn>,
  onChanged = vi.fn(),
  strict = false,
) {
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    const component = createElement(LessonCoding, {
      endpoint: "/api/code",
      onChanged,
    });
    root!.render(
      strict ? createElement(StrictMode, null, component) : component,
    );
  });
}
async function click(label: string) {
  await act(async () => {
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === label,
    );
    expect(button, label).toBeTruthy();
    button!.click();
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
describe("coding workspace", () => {
  it("ignores a stale initial load after the learner starts editing", async () => {
    const stale = Promise.withResolvers<Response>();
    const current = Promise.withResolvers<Response>();
    const fetcher = vi
      .fn()
      .mockResolvedValue(response(blank))
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(current.promise);
    await mount(fetcher, vi.fn(), true);
    await act(async () => {
      current.resolve(response(blank));
    });

    const editor = document.querySelector("textarea")!;
    const edited = "function inc(n) { return n + 1; }";
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(editor, edited);
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("Đang lưu nháp");

    await act(async () => {
      stale.resolve(response(blank));
    });
    expect(editor.value).toBe(edited);
  });
  it("restores the server draft, instructions and sample tests", async () => {
    await mount(
      vi.fn().mockResolvedValue(response({ ...blank, code: "saved draft" })),
    );
    expect(document.querySelector("textarea")?.value).toBe("saved draft");
    expect(document.body.textContent).toContain("Viết hàm inc.");
    expect(document.body.textContent).toContain("Mẫu 1");
    expect(document.body.textContent).toContain("Ctrl/⌘");
  });
  it("runs via Ctrl+Enter, flushes draft first and does not mark completion", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(blank))
      .mockResolvedValueOnce(response(blank))
      .mockResolvedValueOnce(response({ ...blank, lastRun: result() }));
    const changed = vi.fn();
    await mount(fetcher, changed);
    await act(async () => {
      document
        .querySelector("textarea")!
        .dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            ctrlKey: true,
            bubbles: true,
          }),
        );
    });
    expect(
      fetcher.mock.calls.slice(1).map((c) => JSON.parse(c[1].body).type),
    ).toEqual(["draft", "run"]);
    expect(changed).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("0/1 bài kiểm thử đạt");
  });
  it("submits all tests and refreshes the lesson checklist", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(blank))
      .mockResolvedValueOnce(response(blank))
      .mockResolvedValueOnce(
        response({
          ...blank,
          passed: true,
          score: 100,
          submits: 1,
          lastRun: {
            ...result(),
            mode: "submit",
            passed: 3,
            total: 3,
            hiddenPassed: 2,
            hiddenTotal: 2,
            outcomes: [
              { id: 1, passed: true, actual: "2", error: null, line: null },
            ],
          },
        }),
      );
    const changed = vi.fn();
    await mount(fetcher, changed);
    await click("Nộp bài");
    expect(changed).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Test ẩn: 2/2 đạt");
    expect(document.body.textContent).toContain(
      "Giờ có thể hoàn thành bài học.",
    );
    expect(JSON.parse(fetcher.mock.calls[2]![1].body).type).toBe("submit");
  });
  it("shows input/expected/received, text differences and filters", async () => {
    await mount(
      vi.fn().mockResolvedValue(response({ ...blank, lastRun: result() })),
    );
    expect(document.body.textContent).toContain("Đầu vào");
    expect(document.body.textContent).toContain("Kết quả mong đợi");
    expect(document.body.textContent).toContain("Khác kết quả mong đợi.");
    await click("Đạt");
    expect(document.body.textContent).not.toContain("Mẫu 1");
    await click("Chưa đạt");
    expect(document.body.textContent).toContain("Mẫu 1");
    await click("Giải thích lỗi này");
    expect(
      document.querySelector('textarea[aria-label="Ngữ cảnh hỏi AI"]')
        ?.textContent,
    ).toContain("inc(1)");
  });
  it.each(["runtime", "syntax", "timeout"] as const)(
    "shows %s console and error help",
    async (phase) => {
      await mount(
        vi
          .fn()
          .mockResolvedValue(response({ ...blank, lastRun: result(phase) })),
      );
      await click("Console");
      expect(document.body.textContent).toContain(
        phase === "timeout"
          ? "Quá thời gian"
          : phase === "syntax"
            ? "Lỗi cú pháp"
            : "Dòng 2",
      );
      expect(
        [...document.querySelectorAll("button")].some((b) =>
          b.textContent?.includes("Hỏi AI về lỗi này"),
        ),
      ).toBe(true);
    },
  );
  it("keeps instructions readable when Python is unavailable", async () => {
    await mount(
      vi
        .fn()
        .mockResolvedValue(
          response({ ...blank, language: "python", available: false }),
        ),
    );
    expect(document.body.textContent).toContain("Sandbox chưa sẵn sàng");
    expect(document.body.textContent).toContain("Viết hàm inc.");
    expect(
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Nộp bài",
      )?.disabled,
    ).toBe(true);
  });
  it("confirms reset and supports cancelling without changing code", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(blank));
    await mount(fetcher);
    await click("Đặt lại");
    expect(document.body.textContent).toContain(
      "Code bạn đang viết sẽ được thay bằng code khởi đầu.",
    );
    await click("Huỷ");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await click("Đặt lại");
    await click("Khôi phục");
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({
      type: "reset",
      confirmed: true,
    });
  });
  it("keeps the editor draft after sandbox failure", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(blank))
      .mockResolvedValueOnce(response(blank))
      .mockResolvedValueOnce(response({ error: "Sandbox chưa sẵn sàng" }, 503));
    await mount(fetcher);
    await click("Nộp bài");
    expect(document.querySelector("textarea")?.value).toBe(blank.code);
    expect(document.body.textContent).toContain("Sandbox chưa sẵn sàng");
    expect(document.body.textContent).toContain("Thử lại");
  });
});
