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
    rawHeartbeat: service.heartbeat,
    heartbeat: (
      tracker: string,
      action: StudyActivityAction,
      lesson = "lesson-a",
      course = "course",
      expectedOwner: string | null | undefined = row?.trackerId ?? null,
    ) =>
      service.heartbeat(
        "learner",
        course,
        lesson,
        action,
        tracker,
        expectedOwner,
      ),
    at: (second: number) => {
      now = new Date(Date.parse("2026-10-19T03:00:00Z") + second * 1000);
    },
    row: () => row,
    seconds: () => seconds,
  };
}
describe("study clock ownership", () => {
  it.each(["lesson-a", "lesson-b"])(
    "keeps the focused %s tracker crediting over multiple ticks after A's initial start and queued stop arrive late",
    async (lessonB) => {
      vi.useFakeTimers();
      const focus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
      const f = fixture();
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let trackerA: string | undefined;
      const results: {
        trackerId: string;
        action: string;
        recorded: boolean;
      }[] = [];
      const fetcher = vi.fn(async (url: string, options) => {
        const body = JSON.parse(options.body);
        trackerA ??= body.trackerId;
        if (body.action === "start" && body.trackerId === trackerA) await held;
        const lesson =
          url.includes(`/lessons/${lessonB}/`) && body.trackerId !== trackerA
            ? lessonB
            : "lesson-a";
        const result = await f.heartbeat(
          body.trackerId,
          body.action,
          lesson,
          "course",
          body.expectedOwner,
        );
        results.push({
          trackerId: body.trackerId,
          action: body.action,
          recorded: result.recorded,
        });
        return new Response(JSON.stringify(result));
      });
      vi.stubGlobal("fetch", fetcher);
      const hosts = [
        document.createElement("div"),
        document.createElement("div"),
      ];
      hosts.forEach((host) => document.body.append(host));
      const [rootA, rootB] = hosts.map((host) => createRoot(host));
      try {
        await act(async () =>
          rootA!.render(
            createElement(StudyActivityTracker, {
              courseId: "course",
              lessonId: "lesson-a",
            }),
          ),
        );
        expect(
          fetcher.mock.calls.map(
            ([, options]) => JSON.parse(options.body).action,
          ),
        ).toEqual(["prepare", "start"]);
        focus.mockReturnValue(false);
        await act(async () => window.dispatchEvent(new Event("blur")));
        f.at(1);
        focus.mockReturnValue(true);
        await act(async () =>
          rootB!.render(
            createElement(StudyActivityTracker, {
              courseId: "course",
              lessonId: lessonB,
            }),
          ),
        );
        const owned = { ...f.row() };
        expect(owned.trackerId).not.toBe(trackerA);
        f.at(2);
        await act(async () => release());
        expect(results.filter((r) => r.trackerId === trackerA)).toEqual([
          { trackerId: trackerA, action: "prepare", recorded: false },
          { trackerId: trackerA, action: "start", recorded: false },
          { trackerId: trackerA, action: "stop", recorded: false },
        ]);
        expect(f.row()).toEqual(owned);
        for (const second of [31, 61, 91]) {
          f.at(second);
          // Each component represents a separate tab: A stays blurred, B focused.
          focus.mockReturnValueOnce(false).mockReturnValueOnce(true);
          await act(async () => {
            await vi.advanceTimersByTimeAsync(30000);
          });
          expect(f.row()?.trackerId).toBe(owned.trackerId);
          expect(f.seconds()).toBe(second - 1);
        }
        expect(
          results.filter(
            (r) => r.trackerId === owned.trackerId && r.action === "heartbeat",
          ),
        ).toHaveLength(3);
      } finally {
        release();
        await act(async () => {
          rootA!.unmount();
          rootB!.unmount();
        });
        hosts.forEach((host) => host.remove());
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.useRealTimers();
      }
    },
  );
  it("prepares without modifying the active clock or crediting time", async () => {
    const f = fixture();
    expect(await f.heartbeat("tracker-a", "prepare")).toEqual({
      recorded: false,
      owner: null,
    });
    expect(f.row()).toBeUndefined();
    await f.heartbeat("tracker-b", "start");
    const owned = { ...f.row() };
    f.at(20);
    expect(await f.heartbeat("tracker-a", "prepare")).toEqual({
      recorded: false,
      owner: "tracker-b",
    });
    expect(f.row()).toEqual(owned);
    expect(f.seconds()).toBe(0);
  });
  it("rejects delayed acquisitions even after the newer owner stops", async () => {
    const f = fixture();
    await f.heartbeat("tracker-b", "start");
    f.at(10);
    await f.heartbeat("tracker-b", "stop");
    const stopped = { ...f.row() };
    f.at(20);
    expect(
      await f.heartbeat("tracker-a", "start", "lesson-a", "course", null),
    ).toEqual({ recorded: false });
    expect(f.row()).toEqual(stopped);
    expect(f.seconds()).toBe(10);
    expect(
      await f.heartbeat(
        "tracker-c",
        "start",
        "lesson-a",
        "course",
        "tracker-b",
      ),
    ).toEqual({ recorded: true });
  });
  it("rejects a missing or mismatched acquisition token without changing the clock", async () => {
    const f = fixture();
    expect(
      await f.rawHeartbeat(
        "learner",
        "course",
        "lesson-a",
        "start",
        "tracker-a",
      ),
    ).toEqual({ recorded: false });
    expect(
      await f.heartbeat("tracker-a", "start", "lesson-a", "course", "unknown"),
    ).toEqual({ recorded: false });
    expect(f.row()).toBeUndefined();
    await f.heartbeat("tracker-b", "start");
    expect(
      await f.heartbeat("tracker-a", "start", "lesson-a", "course", null),
    ).toEqual({ recorded: false });
    expect(f.row()?.trackerId).toBe("tracker-b");
  });
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
        const result = await f.heartbeat(
          body.trackerId,
          body.action,
          "lesson-a",
          "course",
          body.expectedOwner,
        );
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
        expect(fetcher).toHaveBeenCalledTimes(3);
        vi.mocked(document.hasFocus).mockReturnValue(false);
        await act(async () => {
          window.dispatchEvent(new Event("blur"));
        });
        f.at(31);
        await f.heartbeat("tracker-b", "start", lessonB);
        const owned = { ...f.row() };
        f.at(32);
        await act(async () => release());
        expect(fetcher).toHaveBeenCalledTimes(4);
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
      expect(f.row()).toMatchObject({
        lastSeenAt: null,
        trackerId: "tracker-b",
      });
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
    expect(f.row()).toMatchObject({ lastSeenAt: null, trackerId: "tracker-a" });
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
