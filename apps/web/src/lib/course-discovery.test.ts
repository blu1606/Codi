import { describe, expect, it } from "vitest";
import { filterCourseCatalog } from "./filter-course-catalog";

const catalog = [
  { id: "title", title: "React foundations", description: "Build interfaces", category: "Web", level: "Beginner" },
  { id: "description", title: "UI workshop", description: "Practice REACT components", category: "Web", level: "Advanced", topics: [] },
  { id: "topic", title: "Frontend patterns", description: "Modern interfaces", category: "Web", level: "Beginner", topics: ["React", "State"] },
  { id: "other-category", title: "React native", description: "Mobile apps", category: "Mobile", level: "Beginner" },
  { id: "unrelated", title: "Databases", description: "Relational queries", category: "Web", level: "Beginner", topics: ["SQL"] },
] as const;

describe("course discovery", () => {
  it("returns all courses for a whitespace query and unrestricted filters without mutating input", () => {
    const snapshot = structuredClone(catalog);
    expect(filterCourseCatalog(catalog, "  ", "Tất cả", "Tất cả cấp độ")).toEqual(catalog);
    expect(catalog).toEqual(snapshot);
  });

  it("matches a trimmed title query case insensitively", () => {
    expect(filterCourseCatalog(catalog, "  REACT FOUNDATIONS  ", "Tất cả", "Tất cả cấp độ")).toEqual([catalog[0]]);
  });

  it("matches description text case insensitively", () => {
    expect(filterCourseCatalog(catalog, "practice react", "Tất cả", "Tất cả cấp độ")).toEqual([catalog[1]]);
  });

  it("matches topics even when other entries omit topics", () => {
    expect(filterCourseCatalog(catalog, "sTaTe", "Tất cả", "Tất cả cấp độ")).toEqual([catalog[2]]);
  });

  it("requires query, category, and level to match together", () => {
    expect(filterCourseCatalog(catalog, " react ", "Web", "Beginner")).toEqual([catalog[0], catalog[2]]);
  });
});
