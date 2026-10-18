// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CourseHome from "../app/learn/[courseId]/course-home";
import KnowledgeMap from "../components/knowledge-map";
import {
  constrainPath,
  selectPath,
  type CoursePathView,
  type PathInput,
} from "./learning-path-contract";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
async function render(element: Parameters<Root["render"]>[0]) {
  if (root) {
    await act(async () => root!.unmount());
    document.body.innerHTML = "";
  }
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(element);
  });
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (el) => el.textContent === label,
  )!;
function home(): CoursePathView {
  const input: PathInput = {
    goal: "project",
    hours: 5,
    level: "new",
    concepts: [
      { id: 1, name: "Chuỗi", probability: null, evidenceCount: 0 },
      { id: 2, name: "Mảng", probability: null, evidenceCount: 0 },
    ],
    edges: [{ from: 1, to: 2 }],
    previous: [],
    lessons: ["first", "locked"].map((id, index) => ({
      id,
      title: index ? "Mảng" : "Chuỗi",
      chapterId: "chapter",
      chapterTitle: "Cơ bản",
      durationSeconds: 600,
      skillIds: [index + 1],
      progress: "not_started",
      studied: false,
    })),
  };
  return {
    ...selectPath(input, constrainPath(input), "default"),
    course: { id: "owned", title: "TypeScript", slug: "typescript" },
    status: "ready",
    source: "default",
    goal: "project",
    hours: 5,
    goalEditing: false,
    diagnosticStatus: "skipped",
    showDiagnosticCard: true,
    pathId: 5,
    rationale: null,
    highlights: [],
    updating: false,
    update: null,
    review: null,
    recommendation: null,
  };
}
describe("learner course-home interactions", () => {
  it("renders prerequisite explanation and prevents a locked lesson from becoming a link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(home())));
    await render(
      createElement(CourseHome, {
        courseId: "owned",
        dismissalScope: "test-session",
      }),
    );
    expect(
      document.querySelector('a[href="/learn/owned/first"]'),
    ).not.toBeNull();
    expect(document.querySelector('a[href="/learn/owned/locked"]')).toBeNull();
    expect(document.body.textContent).toContain("Cần học trước: Chuỗi");
    expect(document.body.textContent).toContain("Làm bài kiểm tra đầu vào");
    expect(document.body.textContent).toContain("Chưa học");
  });
  it("dismisses the diagnostic prompt for this tab/session and shows it in a new session", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () => Response.json(home()));
    vi.stubGlobal("fetch", fetcher);
    const prompt = () =>
      document.querySelector<HTMLButtonElement>(
        'button[aria-label="Ẩn thông báo cá nhân hoá lộ trình"]',
      );
    await render(
      createElement(CourseHome, {
        courseId: "owned",
        dismissalScope: "session-a",
      }),
    );
    expect(prompt()).not.toBeNull();
    await act(async () => prompt()!.click());
    expect(prompt()).toBeNull();
    expect(fetcher.mock.calls).toHaveLength(1);
    await render(
      createElement(CourseHome, {
        courseId: "owned",
        dismissalScope: "session-a",
      }),
    );
    expect(prompt()).toBeNull();
    await render(
      createElement(CourseHome, {
        courseId: "owned",
        dismissalScope: "session-b",
      }),
    );
    expect(prompt()).not.toBeNull();
  });
  it("shows a usable AI failure with a retry action, while retaining open lessons", async () => {
    const data = home();
    data.status = "failed";
    data.showDiagnosticCard = false;
    const fetcher = vi.fn().mockImplementation(async () => Response.json(data));
    vi.stubGlobal("fetch", fetcher);
    await render(
      createElement(CourseHome, {
        courseId: "owned",
        dismissalScope: "test-session",
      }),
    );
    expect(document.body.textContent).toContain(
      "Lộ trình cá nhân hoá chưa sẵn sàng",
    );
    expect(
      document.querySelector('a[href="/learn/owned/first"]'),
    ).not.toBeNull();
    await act(async () => button(" Thử lại").click());
    expect(
      fetcher.mock.calls.some(
        (call) => JSON.parse(call[1].body).type === "retry",
      ),
    ).toBe(true);
  });
  it("acknowledges changed rows once without erasing the visible highlight on the same page", async () => {
    const data = home();
    data.highlights = ["first"];
    const fetcher = vi
      .fn()
      .mockImplementation(async (_url, options) =>
        Response.json(
          JSON.parse(options.body).type === "ack-highlights"
            ? { ...data, highlights: [] }
            : data,
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    await render(
      createElement(CourseHome, {
        courseId: "owned",
        dismissalScope: "test-session",
      }),
    );
    expect(document.body.textContent).toContain("Mới cập nhật");
    expect(
      fetcher.mock.calls.filter(
        (call) => JSON.parse(call[1].body).type === "ack-highlights",
      ),
    ).toHaveLength(1);
  });
});

describe("read-only learner knowledge map", () => {
  it("renders hidden/unconfirmed maps without leaking concepts or edit controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          courses: [{ id: "owned", title: "TypeScript" }],
          courseId: "owned",
          title: "TypeScript",
          confirmed: false,
          nodes: [],
          edges: [],
        }),
      ),
    );
    await render(createElement(KnowledgeMap, { initialCourseId: "owned" }));
    expect(document.body.textContent).toContain("Chưa có bản đồ kiến thức");
    expect(document.body.textContent).toContain("giảng viên xác nhận");
    expect(document.querySelector('svg[aria-hidden="true"]')).not.toBeNull(); // Lucide empty-state icon.
    expect(document.querySelector('button[aria-label="Phóng to"]')).toBeNull();
  });
  it("offers an accessible list and related lessons when selecting a concept", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          courses: [{ id: "owned", title: "TypeScript" }],
          courseId: "owned",
          title: "TypeScript",
          confirmed: true,
          nodes: [
            {
              id: 1,
              name: "Chuỗi",
              recommended: true,
              probability: null,
              evidenceCount: 0,
              level: 0,
              locked: false,
              lessons: [{ id: "first", title: "Bài Chuỗi", locked: false }],
            },
            {
              id: 2,
              name: "Mảng",
              probability: null,
              evidenceCount: 0,
              level: 0,
              locked: true,
              lessons: [{ id: "locked", title: "Bài Mảng", locked: true }],
            },
          ],
          edges: [{ from: 1, to: 2 }],
        }),
      ),
    );
    await render(createElement(KnowledgeMap, { initialCourseId: "owned" }));
    expect(document.body.textContent).toContain("Bài học được gợi ý");
    await act(async () => button("Xem dạng danh sách").click());
    expect(document.querySelector("tbody")?.textContent).toContain(
      "Bài học được gợi ý",
    );
    expect(document.querySelector("table")).not.toBeNull();
    expect(document.querySelectorAll("tbody tr")).toHaveLength(2);
    await act(async () => button("Mảng").click());
    expect(document.body.textContent).toContain("Bài Mảng · Bị khoá");
    expect(document.querySelector('a[href="/learn/owned/locked"]')).toBeNull();
    await act(async () => button("Chuỗi").click());
    expect(
      document.querySelector('a[href="/learn/owned/first"]'),
    ).not.toBeNull();
  });
});
