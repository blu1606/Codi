import { describe, expect, it } from "vitest";
import { getCourseCatalogPrompt, SEED_COURSES } from "./data/courses";

describe("course advisor catalog", () => {
  it("does not advertise tuition from the static discovery catalog", () => {
    expect(getCourseCatalogPrompt()).not.toMatch(/Giá:|\bVND\b|5[.,]?000/);
  });

  it("preserves course descriptions and learning guidance", () => {
    const prompt = getCourseCatalogPrompt();
    for (const course of SEED_COURSES) {
      expect(prompt).toContain(course.title);
      expect(prompt).toContain(course.description);
      expect(prompt).toContain(course.prerequisites);
      expect(prompt).toContain(course.topics.join(", "));
    }
  });
});
