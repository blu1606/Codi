import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@codi-1/db";
import {
  studentStudyClocks,
  studentStudyDays,
} from "@codi-1/db/schema/study-activity";
import { createStudyActivityService } from "./study-activity-service";

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
      active: boolean,
      lesson = "lesson-a",
      course = "course",
    ) => service.heartbeat("learner", course, lesson, active, tracker),
    at: (second: number) => {
      now = new Date(Date.parse("2026-10-19T03:00:00Z") + second * 1000);
    },
    row: () => row,
    seconds: () => seconds,
  };
}
describe("study clock ownership", () => {
  it.each(["lesson-a", "lesson-b"])(
    "rejects A's delayed stop after B starts %s and preserves B's next interval",
    async (lessonB) => {
      const f = fixture();
      await f.heartbeat("tracker-a", true);
      f.at(10);
      await f.heartbeat("tracker-b", true, lessonB);
      const owned = { ...f.row() };
      expect(f.seconds()).toBe(10);
      f.at(11);
      expect(await f.heartbeat("tracker-a", false)).toEqual({
        recorded: false,
      });
      expect(f.row()).toEqual(owned);
      expect(f.seconds()).toBe(10);
      f.at(40);
      await f.heartbeat("tracker-b", true, lessonB);
      expect(f.seconds()).toBe(40);
      expect(f.row()?.trackerId).toBe("tracker-b");
      f.at(45);
      await f.heartbeat("tracker-b", false, lessonB);
      expect(f.seconds()).toBe(45);
      expect(f.row()).toMatchObject({ lastSeenAt: null, trackerId: null });
      f.at(46);
      expect(await f.heartbeat("tracker-b", false, lessonB)).toEqual({
        recorded: false,
      });
      expect(f.seconds()).toBe(45);
    },
  );
  it("does not create a clock for an obsolete stop", async () => {
    const f = fixture();
    expect(await f.heartbeat("tracker-a", false)).toEqual({ recorded: false });
    expect(f.row()).toBeUndefined();
    expect(f.seconds()).toBe(0);
  });
  it.each([
    ["lesson-b", "course"],
    ["lesson-a", "other-course"],
  ])(
    "keeps ownership scoped to lesson %s and course %s",
    async (lesson, course) => {
      const f = fixture();
      await f.heartbeat("tracker-a", true);
      f.at(10);
      expect(await f.heartbeat("tracker-a", false, lesson, course)).toEqual({
        recorded: false,
      });
      expect(f.row()?.lastSeenAt?.toISOString()).toBe(
        "2026-10-19T03:00:00.000Z",
      );
      expect(f.seconds()).toBe(0);
    },
  );
  it("checks lesson access even for a stale stop", async () => {
    const f = fixture();
    access.mockRejectedValueOnce(new Error("access denied"));
    await expect(f.heartbeat("tracker-a", false)).rejects.toThrow(
      "access denied",
    );
    expect(f.row()).toBeUndefined();
  });
});
