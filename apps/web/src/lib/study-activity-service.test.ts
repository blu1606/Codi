// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudyActivityTracker from "../components/study-activity-tracker";
import type { Database } from "@codi-1/db";
import {
  studentStudyClocks,
  studentStudyDays,
} from "@codi-1/db/schema/study-activity";
import type { StudyActivityAction } from "./learner-overview-contract";
import { createStudyActivityService } from "./study-activity-service";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { access } = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("./learning-path-service", () => ({
  loadLearningLessonAccess: access,
}));
beforeEach(() => {
  vi.resetAllMocks();
});

// Persist the real service's clock writes across requests. Time/credits are
// calculated by the service, rather than mocking its accounting transitions.
function fixture() {
  let row: typeof studentStudyClocks.$inferSelect | undefined;
  let seconds = 0;
  let now = new Date("2026-10-19T03:00:00Z");
  const tx = {
    execute: vi.fn(),
    select: () => ({
      from: () => ({ where: async () => (row ? [{ ...row }] : []) }),
    }),
    insert: (table: unknown) => ({
      values: (values: any) => ({
        onConflictDoUpdate: async () => {
          if (table === studentStudyClocks) row = { ...values };
          else if (table === studentStudyDays) seconds += values.seconds;
          else throw new Error("Unexpected table");
        },
      }),
    }),
  };
  const db = {
    transaction: async (run: (tx: unknown) => unknown) => run(tx),
  } as unknown as Database;
  const service = createStudyActivityService(db, () => now);
  return {
    heartbeat: (
      tracker: string,
      action: StudyActivityAction,
      lesson = "lesson-a",
      course = "course",
    ) => service.heartbeat("learner", course, lesson, action, tracker),
    at: (second: number) => {
      now = new Date(Date.parse("2026-10-19T03:00:00Z") + second * 1000);
    },
    row: () => row,
    seconds: () => seconds,
  };
}
describe("study clock ownership", () => {
  it.each(["lesson-a", "lesson-b"])(
    "keeps B's %s interval when A's active request is held before server processing",
    async (lessonB) => {
      vi.useFakeTimers();
      vi.spyOn(document, "hasFocus").mockReturnValue(true);
      const f = fixture();
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let activeRequests = 0;
      const fetcher = vi.fn(async (_url, options) => {
        const body = JSON.parse(options.body);
        if (body.action === "heartbeat" && ++activeRequests === 1) await held;
        if (body.action === "stop") f.at(33);
        const result = await f.heartbeat(body.trackerId, body.action);
        return new Response(JSON.stringify(result));
      });
      vi.stubGlobal("fetch", fetcher);
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      try {
        await act(async () =>
          root.render(
            createElement(StudyActivityTracker, {
              courseId: "course",
              lessonId: "lesson-a",
            }),
          ),
        );
        f.at(30);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(30000);
        });
        expect(fetcher).toHaveBeenCalledTimes(2);
        vi.mocked(document.hasFocus).mockReturnValue(false);
        await act(async () => {
          window.dispatchEvent(new Event("blur"));
        });
        f.at(31);
        await f.heartbeat("tracker-b", "start", lessonB);
        const owned = { ...f.row() };
        f.at(32);
        await act(async () => release());
        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(f.row()).toEqual(owned);
        f.at(61);
        await f.heartbeat("tracker-b", "heartbeat", lessonB);
        expect(f.seconds()).toBe(61);
        expect(f.row()?.trackerId).toBe("tracker-b");
      } finally {
        release();
        await act(async () => root.unmount());
        host.remove();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.useRealTimers();
      }
    },
  );
  it.each(["lesson-a", "lesson-b"])(
    "rejects A's delayed stop after B starts %s and preserves B's next interval",
    async (lessonB) => {
      const f = fixture();
      await f.heartbeat("tracker-a", "start");
      f.at(10);
      await f.heartbeat("tracker-b", "start", lessonB);
      const owned = { ...f.row() };
      expect(f.seconds()).toBe(10);
      f.at(11);
      expect(await f.heartbeat("tracker-a", "stop")).toEqual({
        recorded: false,
      });
      expect(f.row()).toEqual(owned);
      expect(f.seconds()).toBe(10);
      f.at(40);
      await f.heartbeat("tracker-b", "heartbeat", lessonB);
      expect(f.seconds()).toBe(40);
      expect(f.row()?.trackerId).toBe("tracker-b");
      f.at(45);
      await f.heartbeat("tracker-b", "stop", lessonB);
      expect(f.seconds()).toBe(45);
      expect(f.row()).toMatchObject({ lastSeenAt: null, trackerId: null });
      f.at(46);
      expect(await f.heartbeat("tracker-b", "stop", lessonB)).toEqual({
        recorded: false,
      });
      expect(f.seconds()).toBe(45);
    },
  );
  it.each(["heartbeat", "stop"] as const)(
    "does not create a clock for an obsolete %s",
    async (action) => {
      const f = fixture();
      expect(await f.heartbeat("tracker-a", action)).toEqual({
        recorded: false,
      });
      expect(f.row()).toBeUndefined();
      expect(f.seconds()).toBe(0);
    },
  );
  it("does not resurrect a stopped session with a delayed heartbeat", async () => {
    const f = fixture();
    await f.heartbeat("tracker-a", "start");
    f.at(10);
    await f.heartbeat("tracker-a", "stop");
    f.at(20);
    expect(await f.heartbeat("tracker-a", "heartbeat")).toEqual({
      recorded: false,
    });
    expect(f.row()).toMatchObject({ lastSeenAt: null, trackerId: null });
    expect(f.seconds()).toBe(10);
  });
  it.each([
    ["lesson-b", "course"],
    ["lesson-a", "other-course"],
  ])(
    "keeps ownership scoped to lesson %s and course %s",
    async (lesson, course) => {
      const f = fixture();
      await f.heartbeat("tracker-a", "start");
      f.at(10);
      for (const action of ["heartbeat", "stop"] as const) {
        expect(await f.heartbeat("tracker-a", action, lesson, course)).toEqual({
          recorded: false,
        });
      }
      expect(f.row()?.lastSeenAt?.toISOString()).toBe(
        "2026-10-19T03:00:00.000Z",
      );
      expect(f.seconds()).toBe(0);
    },
  );
  it("checks lesson access even for a stale stop", async () => {
    const f = fixture();
    access.mockRejectedValueOnce(new Error("access denied"));
    await expect(f.heartbeat("tracker-a", "stop")).rejects.toThrow(
      "access denied",
    );
    expect(f.row()).toBeUndefined();
  });
});
