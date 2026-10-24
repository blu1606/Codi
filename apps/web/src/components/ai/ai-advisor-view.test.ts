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

  it("discloses catalog rules near the header and each response without claiming model analysis", async () => {
    localStorage.setItem("codi_advisor_intake", JSON.stringify({ skipped: ["goal", "level", "hours"] }));
    let finishAnswer!: (value: Response) => void;
    const answer = new Promise<Response>((resolve) => { finishAnswer = resolve; });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      if (init?.method === "POST") return answer;
      return Response.json({ user: null, currentCourse: null, catalog: [], savedIntake: null });
    });
    await act(async () => { root.render(createElement(AiAdvisorView, { initialPrompt: "So sánh khoá học" })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
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
