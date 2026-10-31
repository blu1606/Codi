import { describe, expect, it } from "vitest";
import { reorderLessonIds } from "./course-content-contract";

describe("course content ordering", () => {
  it("moves a lesson to the requested destination index", () => {
    expect(reorderLessonIds(["a", "b", "c", "d"], "a", 2)).toEqual([
      "b", "c", "a", "d",
    ]);
    expect(reorderLessonIds(["a", "b", "c", "d"], "d", 1)).toEqual([
      "a", "d", "b", "c",
    ]);
  });

  it.each([
    [[], "a", 0],
    [["a"], "missing", 0],
    [["a", "b"], "a", -1],
    [["a", "b"], "a", 2],
    [["a", "b"], "a", 0.5],
    [["a", "b"], "a", 0],
  ])("rejects invalid/no-op destinations", (ids, lessonId, index) => {
    expect(reorderLessonIds(ids as string[], lessonId as string, index as number)).toBeNull();
  });
});
