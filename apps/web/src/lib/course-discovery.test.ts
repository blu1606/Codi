import { describe, expect, it } from "vitest";
import { filterCourseCatalog, type CourseCatalogEntry } from "./filter-course-catalog";
import { loadTestData } from "./load-test-data";

interface TestCourse extends CourseCatalogEntry {
  id: string;
}

const catalog = loadTestData<TestCourse[]>("course-discovery-catalog.json");

describe("course discovery", () => {
  it("returns all courses for a whitespace query and unrestricted filters without mutating input", () => {
    const snapshot = structuredClone(catalog);
    expect(filterCourseCatalog(catalog, "   ", "Tất cả", "Tất cả cấp độ")).toEqual(catalog);
    expect(catalog).toEqual(snapshot);
  });

  it("matches a trimmed, case-insensitive query in title, description or topics", () => {
    expect(filterCourseCatalog(catalog, "  REACT  ", "Tất cả", "Tất cả cấp độ"))
      .toEqual([catalog[0], catalog[1], catalog[2], catalog[3]]);
  });

  it("requires query, category, and level to match together", () => {
    expect(filterCourseCatalog(catalog, "react", "Web", "Beginner")).toEqual([catalog[0], catalog[2]]);
  });

  it("returns an empty list for a category that does not exist", () => {
    expect(filterCourseCatalog(catalog, "", "Unknown", "Tất cả cấp độ")).toEqual([]);
  });

  it("returns an empty list when no title, description or topic matches, including courses without topics", () => {
    expect(filterCourseCatalog(catalog, "python", "Tất cả", "Tất cả cấp độ")).toEqual([]);
  });
});
