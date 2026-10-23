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
const trackerId = "19a88269-9c03-4c26-921d-bcecd007906b";
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
  goalSetAt: "2026-10-18T03:00:00Z",
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
async function click(label: string, scope: ParentNode = document) {
  await act(async () => {
    const button = [...scope.querySelectorAll("button")].find(
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
  it.each([false, true])(
    "routes an unfinalized goal to initial setup without an edit request (draft: %s)",
    async (hasDraft) => {
      const data = structuredClone(overview);
      Object.assign(data.courses[0]!, {
        goalSetAt: null,
        goal: hasDraft ? "project" : null,
        weeklyGoalMinutes: hasDraft ? 120 : null,
        pathStatus: "none",
        showDiagnostic: false,
      });
      Object.assign(data.weekly, {
        assumed: !hasDraft,
        goalMinutes: hasDraft ? 120 : 300,
      });
      const fetcher = vi.fn(async (_url, options) =>
        options.method === "GET"
          ? response(data)
          : response({ error: "Chưa thể chỉnh mục tiêu." }, 409),
      );
      vi.stubGlobal("fetch", fetcher);
      await mount(createElement(LearnerWorkspace));
      await click("Chỉnh mục tiêu");
      expect(mocks.push).toHaveBeenCalledWith("/learn/owned/onboarding");
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.body.textContent).not.toContain("Chưa thể chỉnh mục tiêu");
    },
  );
  it.each(["none", "ready"])(
    "confirms a finalized goal edit and opens onboarding after server success (path: %s)",
    async (pathStatus) => {
      const data = structuredClone(overview);
      data.courses[0]!.pathStatus = pathStatus;
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(response(data))
        .mockResolvedValueOnce(response({ ok: true }));
      vi.stubGlobal("fetch", fetcher);
      await mount(createElement(LearnerWorkspace));
      await click("Chỉnh mục tiêu");
      expect(mocks.push).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledTimes(1);
      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog).toBeTruthy();
      await click("Chỉnh mục tiêu", dialog!);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[1]![0]).toBe("/api/learn/owned/onboarding");
      expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({
        type: "goal-edit",
      });
      expect(mocks.push).toHaveBeenCalledWith("/learn/owned/onboarding");
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    },
  );
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
  it.each(["blur", "unmount"])(
    "does not acquire after %s while preparation is delayed",
    async (event) => {
      vi.spyOn(document, "hasFocus").mockReturnValue(true);
      let finish!: (value: Response) => void;
      const fetcher = vi.fn(
        (_url: string, _options: { body: string }) =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      );
      vi.stubGlobal("fetch", fetcher);
      await mount(
        createElement(StudyActivityTracker, {
          courseId: "owned",
          lessonId: "lesson",
        }),
      );
      await act(async () => {
        if (event === "unmount") {
          root!.unmount();
          root = undefined;
        } else {
          vi.mocked(document.hasFocus).mockReturnValue(false);
          window.dispatchEvent(new Event("blur"));
        }
        // A late snapshot may already describe B's owner. A must not use it.
        finish(response({ recorded: false, owner: trackerId }));
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetcher.mock.calls[0]![1].body).action).toBe("prepare");
    },
  );
  it("reconciles a new focus immediately after an obsolete preparation finishes", async () => {
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
      .mockImplementation(async () =>
        response({ recorded: true, owner: trackerId }),
      );
    vi.stubGlobal("fetch", fetcher);
    await mount(
      createElement(StudyActivityTracker, {
        courseId: "owned",
        lessonId: "lesson",
      }),
    );
    await act(async () => {
      vi.mocked(document.hasFocus).mockReturnValue(false);
      window.dispatchEvent(new Event("blur"));
      vi.mocked(document.hasFocus).mockReturnValue(true);
      window.dispatchEvent(new Event("focus"));
      finish(response({ recorded: false, owner: trackerId }));
    });
    const bodies = fetcher.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies.map((body) => body.action)).toEqual([
      "prepare",
      "prepare",
      "start",
    ]);
    expect(bodies[2]).toMatchObject({
      trackerId: bodies[1].trackerId,
      expectedOwner: trackerId,
    });
    expect(bodies[1].trackerId).not.toBe(bodies[0].trackerId);
  });
  it("retries a rejected initial acquisition on the next tick without a retry loop", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    let starts = 0;
    const fetcher = vi.fn(async (_url, options) => {
      const { action } = JSON.parse(options.body);
      return response({
        owner: trackerId,
        recorded: action !== "start" || ++starts > 1,
      });
    });
    vi.stubGlobal("fetch", fetcher);
    await mount(
      createElement(StudyActivityTracker, {
        courseId: "owned",
        lessonId: "lesson",
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(
      fetcher.mock.calls.map((call) => JSON.parse(call[1].body).action),
    ).toEqual(["prepare", "start", "prepare", "start", "heartbeat"]);
  });
  it("only reacquires after a focus transition, even when renewals are ignored", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const fetcher = vi.fn(async (_url, options) =>
      response({
        owner: null,
        recorded: JSON.parse(options.body).action !== "heartbeat",
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    await mount(
      createElement(StudyActivityTracker, {
        courseId: "owned",
        lessonId: "lesson",
      }),
    );
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(30000);
    });
    const before = fetcher.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(before.map((body) => body.action)).toEqual([
      "prepare",
      "start",
      "heartbeat",
      "heartbeat",
    ]);
    expect(new Set(before.map((body) => body.trackerId)).size).toBe(1);
    vi.mocked(document.hasFocus).mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    vi.mocked(document.hasFocus).mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    const resumed = JSON.parse(fetcher.mock.calls.at(-1)![1].body);
    expect(resumed.action).toBe("start");
    expect(resumed.trackerId).not.toBe(before[0].trackerId);
  });
  it("starts a new focus session after blur/refocus while a heartbeat is pending", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    let finish!: (value: Response) => void;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ owner: null }))
      .mockResolvedValueOnce(response({ recorded: true }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementation(async () =>
        response({ recorded: true, owner: null }),
      );
    vi.stubGlobal("fetch", fetcher);
    await mount(
      createElement(StudyActivityTracker, {
        courseId: "owned",
        lessonId: "lesson",
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    vi.mocked(document.hasFocus).mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    vi.mocked(document.hasFocus).mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    await act(async () => {
      finish(response({ recorded: false }));
    });
    const bodies = fetcher.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies.map((body) => body.action)).toEqual([
      "prepare",
      "start",
      "heartbeat",
      "prepare",
      "start",
    ]);
    expect(bodies[2].trackerId).toBe(bodies[0].trackerId);
    expect(bodies[4].trackerId).not.toBe(bodies[0].trackerId);
  });
  it("immediately resumes focus after a pending stop succeeds", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    let finishStop!: (value: Response) => void;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ owner: null }))
      .mockResolvedValueOnce(response({ recorded: true }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishStop = resolve;
          }),
      )
      .mockImplementation(async () =>
        response({ recorded: true, owner: null }),
      );
    vi.stubGlobal("fetch", fetcher);
    await mount(
      createElement(StudyActivityTracker, {
        courseId: "owned",
        lessonId: "lesson",
      }),
    );
    vi.mocked(document.hasFocus).mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    vi.mocked(document.hasFocus).mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    await act(async () => {
      finishStop(response({ recorded: true }));
    });
    // No interval advance: the focused clock resumes in the stop's finally block.
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(
      fetcher.mock.calls.map((call) => JSON.parse(call[1].body).action),
    ).toEqual(["prepare", "start", "stop", "prepare", "start"]);
    const ids = fetcher.mock.calls.map(
      (call) => JSON.parse(call[1].body).trackerId,
    );
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).toBe(ids[0]);
    expect(ids[4]).not.toBe(ids[0]);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("serializes an in-flight start with blur and never submits browser durations", async () => {
    vi.useFakeTimers();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(trackerId);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    let finish!: (value: Response) => void;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ owner: null }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementation(async () => response({ recorded: true }));
    vi.stubGlobal("fetch", fetcher);
    await mount(
      createElement(StudyActivityTracker, {
        courseId: "owned",
        lessonId: "lesson",
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.mocked(document.hasFocus).mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      finish(response({ recorded: true }));
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.map((call) => JSON.parse(call[1].body))).toEqual([
      { action: "prepare", trackerId },
      { action: "start", trackerId, expectedOwner: null },
      { action: "stop", trackerId },
    ]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90000);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("stops after unmount while a start is pending, without retry loops on a failed stop", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(trackerId);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    let finish!: (value: Response) => void;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ owner: null }))
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
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({
      action: "stop",
      trackerId,
    });
  });
  it.each(["blur", "unmount"])(
    "never restarts after %s during a pending stop",
    async (event) => {
      vi.spyOn(document, "hasFocus").mockReturnValue(true);
      let finishStop!: (value: Response) => void;
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(response({ owner: null }))
        .mockResolvedValueOnce(response({ recorded: true }))
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              finishStop = resolve;
            }),
        )
        .mockImplementation(async () =>
          response({ recorded: true, owner: null }),
        );
      vi.stubGlobal("fetch", fetcher);
      await mount(
        createElement(StudyActivityTracker, {
          courseId: "owned",
          lessonId: "lesson",
        }),
      );
      vi.mocked(document.hasFocus).mockReturnValue(false);
      await act(async () => {
        window.dispatchEvent(new Event("blur"));
      });
      vi.mocked(document.hasFocus).mockReturnValue(true);
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      await act(async () => {
        if (event === "unmount") {
          root!.unmount();
          root = undefined;
        } else {
          vi.mocked(document.hasFocus).mockReturnValue(false);
          window.dispatchEvent(new Event("blur"));
        }
        finishStop(response({ recorded: true }));
      });
      expect(fetcher).toHaveBeenCalledTimes(3);
    },
  );
});
