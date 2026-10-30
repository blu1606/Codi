// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import LessonTutorial from "../components/lesson-tutorial";
import {
  TutorBridgeContext,
  type TutorCodeBridge,
} from "../components/ai-tutor/tutor-bridge";
import {
  tutorialTransition,
  tutorialView,
  type TutorialCommand,
} from "./tutorial-contract";
import type {
  TutorialProgress,
  TutorialStep,
} from "@codi-1/db/schema/coding-tutorial";
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const steps: TutorialStep[] = [
  {
    title: "Chào mừng",
    body: "Viết và chạy JavaScript ngay trên trình duyệt.",
    starter: 'console.log("Codi");',
  },
  {
    title: "Không gian làm việc",
    body: "Sửa code của mình.",
    starter: "const n = 1;",
  },
  {
    title: "Lời giải",
    body: "Nội dung lời giải",
    starter: "SECRET_SOLUTION",
    isSolution: true,
  },
];
let root: Root | undefined;
function server() {
  let progress: TutorialProgress | null = null,
    viewed = false;
  const view = () =>
    tutorialView(steps, progress, viewed, "javascript", "main.js");
  const fetcher = vi
    .fn()
    .mockImplementation(async (_url: string, options?: RequestInit) => {
      if (!options?.body) return Response.json(view());
      const command = JSON.parse(options.body as string) as TutorialCommand;
      const next = tutorialTransition(steps, progress, viewed, command);
      progress = next.progress;
      viewed = next.solutionViewed;
      return Response.json(
        command.type === "draft" ? { saved: true, code: command.code } : view(),
      );
    });
  return { fetcher, view };
}
async function mount(fetcher: ReturnType<typeof vi.fn>, onChanged = vi.fn()) {
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      createElement(LessonTutorial, { endpoint: "/api/tutorial", onChanged }),
    ),
  );
}
const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (b) =>
      b.textContent?.trim() === label || b.getAttribute("aria-label") === label,
  )!;
async function click(label: string) {
  await act(async () => {
    expect(button(label), label).toBeTruthy();
    button(label).click();
  });
}
async function typeCode(value: string) {
  await act(async () => {
    const textarea = document.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("tutorial workspace", () => {
  it.each(["before autosave", "while autosave is pending"])(
    "retries a failed Run with the latest editor code %s",
    async (timing) => {
      vi.useFakeTimers();
      const s = server();
      const oldCode = 'console.log("old");';
      const newCode = 'console.log("new draft");';
      let failRun = true;
      let holdDraft = timing === "while autosave is pending";
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const fetcher = vi.fn(async (url, options?: RequestInit) => {
        const command = options?.body
          ? (JSON.parse(options.body as string) as TutorialCommand)
          : null;
        if (command?.type === "run" && failRun) {
          failRun = false;
          return Response.json(
            { error: "Run transport failed" },
            { status: 503 },
          );
        }
        if (
          command?.type === "draft" &&
          command.code === newCode &&
          holdDraft
        ) {
          holdDraft = false;
          await held;
        }
        return s.fetcher(url, options);
      });
      const commands = () =>
        fetcher.mock.calls
          .filter((call) => call[1]?.body)
          .map(
            (call) => JSON.parse(call[1]!.body as string) as TutorialCommand,
          );
      try {
        await mount(fetcher);
        await typeCode(oldCode);
        await act(async () =>
          document
            .querySelector("textarea")!
            .dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "Enter",
                ctrlKey: true,
                bubbles: true,
              }),
            ),
        );
        expect(document.body.textContent).toContain("Run transport failed");
        expect(commands().at(-1)).toEqual({
          type: "run",
          step: 0,
          code: oldCode,
        });
        const retryStart = commands().length;
        await typeCode(newCode);
        if (timing === "while autosave is pending") {
          await act(async () => {
            await vi.advanceTimersByTimeAsync(650);
          });
          expect(commands().at(-1)).toEqual({
            type: "draft",
            step: 0,
            code: newCode,
          });
        }
        await click("Thử lại");
        await act(async () => release());
        const retried = commands().slice(retryStart);
        expect(retried.filter((command) => command.type === "run")).toEqual([
          { type: "run", step: 0, code: newCode },
        ]);
        expect(
          retried.filter((command) => command.type === "draft"),
        ).toContainEqual({ type: "draft", step: 0, code: newCode });
        expect(s.view().code).toBe(newCode);
        expect(document.querySelector("textarea")?.value).toBe(newCode);
        // The cancelled debounce must not write an older snapshot afterward.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });
        expect(s.view().code).toBe(newCode);
        await act(async () => {
          root!.unmount();
          root = undefined;
        });
        await mount(fetcher);
        expect(document.querySelector("textarea")?.value).toBe(newCode);
      } finally {
        release();
      }
    },
  );
  it("renders the guide, filename, line numbers and Console; disables the first Previous action", async () => {
    await mount(server().fetcher);
    expect(document.body.textContent).toContain("Bước 1/3");
    expect(document.body.textContent).toContain("main.js");
    expect(document.body.textContent).toContain("JavaScript");
    expect(button("Bước trước").disabled).toBe(true);
    expect(document.querySelector('[aria-label="Console"]')).toBeTruthy();
    expect(document.body.textContent).not.toContain("SECRET_SOLUTION");
  });
  it("opens the table of contents with aria-current, changes step and refreshes the checklist", async () => {
    const onChanged = vi.fn();
    await mount(server().fetcher, onChanged);
    await click("Mục lục");
    expect(button("Mục lục").getAttribute("aria-expanded")).toBe("true");
    expect(
      document.querySelector('[aria-current="step"]')?.textContent,
    ).toContain("Chào mừng");
    await click("2Không gian làm việc");
    expect(button("Mục lục").getAttribute("aria-expanded")).toBe("false");
    expect(document.body.textContent).toContain("Bước 2/3");
    expect(document.querySelector("textarea")?.value).toBe("const n = 1;");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
  it("saves the current draft before navigation and restores it when returning", async () => {
    const s = server();
    await mount(s.fetcher);
    await typeCode('console.log("edited");');
    await click("Tiếp: Không gian làm việc");
    const commands = s.fetcher.mock.calls
      .filter((c) => c[1]?.body)
      .map((c) => JSON.parse(c[1].body));
    expect(commands.slice(0, 2)).toEqual([
      { type: "draft", step: 0, code: 'console.log("edited");' },
      { type: "step", step: 1 },
    ]);
    await click("Bước trước");
    expect(document.querySelector("textarea")?.value).toBe(
      'console.log("edited");',
    );
  });
  it("keeps unsaved code and the current step when autosave fails; retry saves before moving", async () => {
    const s = server();
    let fail = true;
    const fetcher = vi.fn().mockImplementation(async (url, options) => {
      if (options?.body && JSON.parse(options.body).type === "draft" && fail)
        return Response.json(
          { error: "Mất kết nối khi lưu nháp" },
          { status: 503 },
        );
      return s.fetcher(url, options);
    });
    await mount(fetcher);
    await typeCode("const keep = 42;");
    await click("Tiếp: Không gian làm việc");
    expect(document.body.textContent).toContain("Mất kết nối khi lưu nháp");
    expect(document.body.textContent).toContain("Bước 1/3");
    expect(document.querySelector("textarea")?.value).toBe("const keep = 42;");
    fail = false;
    await click("Thử lại");
    expect(document.body.textContent).toContain("Bước 2/3");
    await click("Bước trước");
    expect(document.querySelector("textarea")?.value).toBe("const keep = 42;");
  });
  it("hides the editor on a solution step until the reveal action is confirmed", async () => {
    await mount(server().fetcher);
    await click("Tiếp: Không gian làm việc");
    await click("Tiếp: Lời giải");
    expect(document.body.textContent).toContain("Đã đi hết hướng dẫn");
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.body.textContent).not.toContain("SECRET_SOLUTION");
    await click("Hiện lời giải");
    expect(document.querySelector("textarea")?.value).toBe("SECRET_SOLUTION");
  });
  it("supports reset cancellation and confirms the affected step", async () => {
    const s = server();
    await mount(s.fetcher);
    await click("Khôi phục code ban đầu");
    await click("Huỷ");
    expect(s.fetcher).toHaveBeenCalledTimes(1);
    await click("Khôi phục code ban đầu");
    await click("Khôi phục");
    expect(
      s.fetcher.mock.calls.some(
        (c) =>
          c[1]?.body &&
          JSON.parse(c[1].body).type === "reset" &&
          JSON.parse(c[1].body).step === 0,
      ),
    ).toBe(true);
  });
  it("does not trap keyboard focus after Esc then Tab and sends Ctrl+Enter to the runner", async () => {
    const s = server();
    await mount(s.fetcher);
    const textarea = document.querySelector("textarea")!;
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => textarea.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(true);
    await act(async () =>
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    const leave = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => textarea.dispatchEvent(leave));
    expect(leave.defaultPrevented).toBe(false);
    await act(async () =>
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(
      s.fetcher.mock.calls.some(
        (c) => c[1]?.body && JSON.parse(c[1].body).type === "run",
      ),
    ).toBe(true);
  });
  it("retries a non-JSON load failure and preserves instructions when sandbox is unavailable", async () => {
    const s = server();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }))
      .mockResolvedValueOnce(
        Response.json({ ...s.view(), available: false, language: "python" }),
      );
    await mount(fetcher);
    expect(document.body.textContent).toContain("Không thể tải hướng dẫn code");
    await click("Thử lại");
    expect(document.body.textContent).toContain("Sandbox chưa sẵn sàng");
    expect(document.querySelector("textarea")?.disabled).toBe(false);
    expect(
      [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.startsWith("Chạy"),
      )?.disabled,
    ).toBe(true);
  });
});
describe("tutorial run errors and the AI tutor", () => {
  it("offers 'Hỏi AI trợ lý' on a run error and lends the step, code and error as context", async () => {
    const view = {
      ...tutorialView(steps, null, false, "javascript", "main.js"),
      code: '// Bấm "Chạy"\nconsole.lg("Xin chào Codi!");',
      lastRun: {
        phase: "runtime" as const,
        logs: [],
        error: '"not a function"',
        line: 2,
        outcomes: [],
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(view)));
    let lent: TutorCodeBridge | null = null;
    const tutor = {
      open: vi.fn(),
      registerCode: vi.fn((code: TutorCodeBridge | null) => (lent = code)),
    };
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root!.render(
        createElement(
          TutorBridgeContext.Provider,
          { value: tutor },
          createElement(LessonTutorial, {
            endpoint: "/api/tutorial",
            onChanged: vi.fn(),
          }),
        ),
      ),
    );
    await click("Hỏi AI trợ lý: Giải thích lỗi này");
    expect(tutor.open).toHaveBeenCalledWith({
      ask: 'Code của mình báo lỗi “Dòng 2: "not a function"”. Lỗi này nghĩa là gì và mình nên xem chỗ nào?',
    });
    const code = lent as TutorCodeBridge | null;
    expect(code?.task()).toEqual({
      label: "Bước 1/3: Chào mừng",
      text: "Bước 1/3: Chào mừng\nViết và chạy JavaScript ngay trên trình duyệt.",
    });
    expect(code?.getCode()).toContain('console.lg("Xin chào Codi!");');
    expect(code?.runError()).toBe('Dòng 2: "not a function"');
  });
});
