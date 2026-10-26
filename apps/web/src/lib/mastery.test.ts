import { describe, expect, it } from "vitest";
import { masteryLevel } from "@codi-1/ui/lib/mastery";

describe("D16 BKT mastery thresholds", () => {
  it.each([[null, 0], [0, 1], [0.3999, 1], [0.4, 2], [0.5999, 2], [0.6, 3], [0.8499, 3], [0.85, 4], [1, 4]] as const)("maps evidence %s to level %s", (probability, level) => {
    expect(masteryLevel(probability)).toBe(level);
  });
  it.each([NaN, -0.1, 1.1])("rejects invalid evidence %s", (probability) => {
    expect(() => masteryLevel(probability)).toThrow(RangeError);
  });
});
