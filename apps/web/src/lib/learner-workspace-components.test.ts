// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import LearnerWorkspace, {
  ProgressResults,
} from "../components/learner-workspace";
import StudyActivityTracker from "../components/study-activity-tracker";
import type {
  LearnerCourse,
  LearnerOverview,
} from "./learner-overview-contract";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mocks = vi.hoisted(() => ({ push: vi.fn(), toast: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
let root: Root | undefined;
const course: LearnerCourse = {
  id: "owned",
  title: "JavaScript nền tảng",
  slug: "javascript",
  cover: null,
  hidden: false,
  goal: null,
  weeklyGoalMinutes: 300,
  lastActiveAt: "2026-10-19T03:00:00Z",
  pathStatus: "ready",
  showDiagnostic: true,
  complete: false,
  done: 0,
  total: 1,
  percent: 0,
  nextLessonId: "lesson",
  skills: [{ id: 1, name: "Biến", level: 3 }],
  lessons: [
    {
      id: "lesson",
      title: "Viết JavaScript",
      status: "active",
      lock: null,
      results: [
        {
          id: 1,
          title: "Quiz 1",
          type: "quiz",
          maxScore: 100,
          passingScore: 70,
          status: "graded",
          score: 40,
          percent: 40,
          passed: false,
          feedback: null,
          gradedAt: null,
        },
        {
          id: 2,
          title: "Bài tập 1",
          type: "assignment",
          maxScore: 10,
          passingScore: 50,
          status: "pending",
          score: null,
          percent: null,
          passed: null,
          feedback: null,
          gradedAt: null,
        },
      ],
    },
  ],
};
const overview: LearnerOverview = {
  name: "Học viên",
  courses: [course],
  continueCourseId: course.id,
  weekly: {
    minutes: 90,
    goalMinutes: 300,
    assumed: false,
    courseId: course.id,
    streak: 2,
    days: [],
  },
  stats: {
    active: 1,
    completed: 0,
    lessons: 0,
    pending: 1,
    answered: 0,
    feedback: 0,
  },
  latestFeedback: null,
  recommendations: [],
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
async function mount(element: ReturnType<typeof createElement>) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(element);
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
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("learner workspace states", () => {
  it("provides retry after an initial failure and loads real continue/goal links", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ error: "Tải thất bại" }, 500))
      .mockResolvedValue(response(overview));
    vi.stubGlobal("fetch", fetcher);
    await mount(createElement(LearnerWorkspace));
    expect(document.body.textContent).toContain("Tải thất bại");
    await click("Thử lại");
    expect(document.body.textContent).toContain("90 phút / 300 phút");
    expect(
      document.querySelector('a[href="/learn/owned/lesson"]'),
    ).toBeTruthy();
    expect(document.querySelector('a[href="/progress"]')).toBeTruthy();
  });
  it("renders the enrollment empty state without fabricated recommendations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ ...overview, courses: [] })),
    );
    await mount(createElement(LearnerWorkspace));
    expect(document.body.textContent).toContain(
      "Bàn làm việc của bạn đang trống",
    );
    expect(document.body.textContent).not.toContain("JavaScript nền tảng");
    expect(document.querySelector('a[href="/courses"]')).toBeTruthy();
  });
  it("dismisses a diagnostic card only after server success and undo sends its version", async () => {
    const at = "2026-10-19T03:00:00.000Z";
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(overview))
      .mockResolvedValueOnce(response({ dismissedAt: at }))
      .mockResolvedValueOnce(response({ dismissedAt: null }))
      .mockResolvedValue(response(overview));
    vi.stubGlobal("fetch", fetcher);
    await mount(createElement(LearnerWorkspace));
    const close = document.querySelector(
      'button[aria-label^="Ẩn"]',
    ) as HTMLButtonElement;
    expect(close).toBeTruthy();
    await act(async () => close.click());
    expect(document.body.textContent).not.toContain("Làm bài kiểm tra đầu vào");
    const options = mocks.toast.mock.calls[0][1];
    await act(async () => {
      options.action.onClick();
    });
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({
      type: "restore-diagnostic",
      courseId: "owned",
      dismissedAt: at,
    });
    expect(document.body.textContent).toContain("Làm bài kiểm tra đầu vào");
  });
  it("shows pass/fail, pending and escaped feedback with a course-scoped knowledge map", async () => {
    const data = structuredClone(overview);
    data.courses[0]!.lessons[0]!.results[1] = {
      ...data.courses[0]!.lessons[0]!.results[1]!,
      status: "graded",
      score: 8,
      feedback: '<script>alert("x")</script>',
    };
    await mount(createElement(ProgressResults, { data, tab: "active" }));
    expect(document.body.textContent).toContain("40% · Chưa đạt");
    expect(document.body.textContent).toContain("8/10");
    expect(document.body.textContent).toContain('<script>alert("x")</script>');
    expect(document.querySelector("script")).toBeNull();
    expect(
      document.querySelector('a[href="/insights/knowledge-map?course=owned"]'),
    ).toBeTruthy();
  });
  it("does not provide a lesson bypass for locked rows and filters completed courses", async () => {
    const data = structuredClone(overview);
    data.courses[0]!.complete = true;
    data.courses[0]!.lessons[0]!.status = "locked";
    data.courses[0]!.lessons[0]!.lock = "Biến";
    await mount(createElement(ProgressResults, { data, tab: "done" }));
    expect(document.body.textContent).toContain("Cần học trước: Biến");
    expect(document.querySelector('a[href="/learn/owned/lesson"]')).toBeNull();
  });
});
describe("study tracker", () => {
  it("serializes an in-flight start with blur and never submits browser durations", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    let finish!: (value: Response) => void;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(response({ recorded: true }));
    vi.stubGlobal("fetch", fetcher);
    await mount(
      createElement(StudyActivityTracker, {
        courseId: "owned",
        lessonId: "lesson",
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.mocked(document.hasFocus).mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      finish(response({ recorded: true }));
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map((call) => JSON.parse(call[1].body))).toEqual([
      { active: true },
      { active: false },
    ]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("stops after unmount while a start is pending, without retry loops on a failed stop", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    let finish!: (value: Response) => void;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    await mount(
      createElement(StudyActivityTracker, {
        courseId: "owned",
        lessonId: "lesson",
      }),
    );
    await act(async () => {
      root!.unmount();
      root = undefined;
      finish(response({ recorded: true }));
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      active: false,
    });
  });
});
