// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import LessonTutorial from "../components/lesson-tutorial";
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
