// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiAdvisorView } from "./ai-advisor-view";

const mockRouter = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("AiAdvisorView component - pending guest action replay", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockRouter.push.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
  });

  const oldIntake = { goal: "Làm được dự án", level: "Mới bắt đầu", hoursPerWeek: "< 5 giờ", skipped: [] };
  const currentIntake = { goal: "Chuẩn bị phỏng vấn", level: "Trung cấp", hoursPerWeek: "> 10 giờ", skipped: [] };

  async function click(label: string) {
    const button = Array.from(container.querySelectorAll("button")).find(b => b.textContent?.trim().startsWith(label));
    expect(button, `button ${label}`).toBeDefined();
    await act(async () => { button!.click(); });
  }

  function mockConversation(savedIntake: typeof currentIntake | null, user: { id: string } | null = { id: "learner-b" }) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      if (init?.method === "POST") return Response.json({ text: "Kết quả danh mục", courses: [], order: [], followups: [] });
      return Response.json({ user, currentCourse: null, savedIntake });
    });
  }

  it("restores only the resolved learner's answers and sends them in the initial prompt", async () => {
    localStorage.setItem("codi_advisor_intake", JSON.stringify(oldIntake));
    localStorage.setItem("unrelated-setting", "keep");
    const fetchMock = mockConversation(currentIntake);
    await act(async () => { root.render(createElement(AiAdvisorView, { initialPrompt: "So sánh khoá học" })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(container.textContent).not.toContain(oldIntake.goal);
    expect(container.textContent).not.toContain(oldIntake.hoursPerWeek);
    expect(container.textContent).toContain(currentIntake.goal);
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1]!.body as string).intake).toEqual(currentIntake);
    expect(localStorage.getItem("unrelated-setting")).toBe("keep");
  });

  it("starts empty for a learner without saved answers instead of promoting legacy intake", async () => {
    localStorage.setItem("codi_advisor_intake", JSON.stringify(oldIntake));
    const fetchMock = mockConversation(null);
    await act(async () => { root.render(createElement(AiAdvisorView, { initialPrompt: "So sánh khoá học" })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(container.querySelector('[aria-label="Codi đang hiểu về bạn"]')).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    await click(currentIntake.goal);
    await click(currentIntake.level);
    await click(currentIntake.hoursPerWeek);
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1]!.body as string).intake).toEqual(currentIntake);
  });

  it("blocks manual and initial-prompt submission until context resolves", async () => {
    localStorage.setItem("codi_advisor_intake", JSON.stringify(oldIntake));
    let resolveContext!: (response: Response) => void;
    const context = new Promise<Response>(resolve => { resolveContext = resolve; });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      if (init?.method === "POST") return Response.json({ text: "Kết quả", courses: [] });
      return context;
    });
    await act(async () => { root.render(createElement(AiAdvisorView, { initialPrompt: "So sánh khoá học", initialTopic: "React" })); });
    expect(container.querySelector<HTMLInputElement>("#advisor-q")?.disabled).toBe(true);
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    expect(container.querySelector('[role="log"]')).toBeNull();
    await act(async () => { resolveContext(Response.json({ user: { id: "learner-b" }, savedIntake: currentIntake })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1]!.body as string)).toEqual({ prompt: "So sánh khoá học", intake: currentIntake, history: [] });
  });

  it("keeps submission blocked if context fails rather than treating the error as a guest", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 500 }));
    await act(async () => { root.render(createElement(AiAdvisorView, { initialTopic: "React", initialPrompt: "So sánh" })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(container.querySelector<HTMLInputElement>("#advisor-q")?.disabled).toBe(true);
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("keeps guest answers in component memory, reuses them there, and forgets them on remount", async () => {
    const fetchMock = mockConversation(null, null);
    await act(async () => { root.render(createElement(AiAdvisorView, { initialPrompt: "So sánh khoá học" })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    await click(currentIntake.goal);
    await click(currentIntake.level);
    await click(currentIntake.hoursPerWeek);
    await act(async () => { root.render(createElement(AiAdvisorView, { initialTopic: "React" })); });
    await click("Cuộc trò chuyện mới");
    await click("Mới bắt đầu học lập trình");
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(2);
    expect(JSON.parse(posts[1][1]!.body as string).intake).toEqual(currentIntake);
    expect(localStorage.getItem("codi_advisor_intake")).toBeNull();
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await act(async () => { root.render(createElement(AiAdvisorView)); });
    expect(container.querySelector('[aria-label="Codi đang hiểu về bạn"]')).toBeNull();
  });

  it("discloses catalog rules near the header and each response without claiming model analysis", async () => {
    let finishAnswer!: (value: Response) => void;
    const answer = new Promise<Response>((resolve) => { finishAnswer = resolve; });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      if (init?.method === "POST") return answer;
      return Response.json({ user: null, currentCourse: null, catalog: [], savedIntake: null });
    });
    await act(async () => { root.render(createElement(AiAdvisorView, { initialPrompt: "So sánh khoá học" })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    // Skip through the real guest intake UI; no persistent-cache shortcut.
    for (let i = 0; i < 3; i++) await click("Bỏ qua");
    expect(container.querySelector("header")?.textContent).toContain("quy tắc đối chiếu danh mục khoá học đã xuất bản");
    expect(container.querySelector("header")?.textContent).toContain("không dùng mô hình AI để phân tích");
    expect(container.textContent).toContain("Đang đối chiếu danh mục");
    expect(container.textContent).not.toContain("Codi đang suy nghĩ");
    await act(async () => {
      finishAnswer(Response.json({ text: "So sánh từ danh mục", courses: [], order: [], followups: [] }));
    });
    const thread = container.querySelector('[role="log"]');
    expect(thread?.textContent).toContain("Gợi ý theo quy tắc danh mục · Không phải phân tích từ mô hình AI.");
    expect(thread?.textContent).toContain("So sánh từ danh mục");
  });

  it("replays add-cart action when authenticated user lands from login callback without redirecting again", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/ai") && (!init || init.method === "GET" || !init.method)) {
        return {
          ok: true,
          json: async () => ({
            user: { id: "user-123", name: "Learner Test" },
            currentCourse: null,
            catalog: [],
            savedIntake: null,
          }),
        };
      }

      if (urlStr.includes("/api/student/cart")) {
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }

      return {
        ok: true,
        json: async () => ({}),
      };
    });

    globalThis.fetch = fetchMock as any;

    await act(async () => {
      root.render(
        createElement(AiAdvisorView, {
          initialAction: "add-cart",
          initialCourseId: "course-react-001",
        })
      );
    });

    // Wait a tick for context fetch & effect resolution
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Should NOT redirect to /login
    expect(mockRouter.push).not.toHaveBeenCalledWith(expect.stringContaining("/login"));

    // Should have called /api/student/cart with courseId
    const cartCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/student/cart"));
    expect(cartCall).toBeDefined();
    expect(JSON.parse((cartCall![1] as RequestInit).body as string)).toEqual({
      courseId: "course-react-001",
    });
  });

  it("replays enroll-free action when authenticated user lands without redirecting again", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/ai") && (!init || init.method === "GET" || !init.method)) {
        return {
          ok: true,
          json: async () => ({
            user: { id: "user-123", name: "Learner Test" },
            currentCourse: null,
            catalog: [],
            savedIntake: null,
          }),
        };
      }

      if (urlStr.includes("/api/courses/enroll-free")) {
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }

      return {
        ok: true,
        json: async () => ({}),
      };
    });

    globalThis.fetch = fetchMock as any;

    await act(async () => {
      root.render(
        createElement(AiAdvisorView, {
          initialAction: "enroll-free",
          initialCourseId: "course-free-002",
        })
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Should NOT redirect to /login
    expect(mockRouter.push).not.toHaveBeenCalledWith(expect.stringContaining("/login"));

    // Should have called /api/courses/enroll-free
    const enrollCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/courses/enroll-free")
    );
    expect(enrollCall).toBeDefined();
    expect(JSON.parse((enrollCall![1] as RequestInit).body as string)).toEqual({
      courseId: "course-free-002",
    });
  });
});
