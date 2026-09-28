import { describe, expect, it } from "vitest";
import { SEED_COURSES, type Course } from "./data/courses";
import { filterCourseCatalog } from "./filter-course-catalog";

describe("filterCourseCatalog", () => {
  it.each(["", "   "])("trả về toàn bộ danh mục khi query là khoảng trắng hoặc rỗng (%j)", (query) => {
    // Arrange
    const input = [...SEED_COURSES];

    // Act
    const result = filterCourseCatalog(input, query, "Tất cả", "Tất cả cấp độ");

    // Assert
    expect(result).toEqual(SEED_COURSES);
  });

  it("tìm kiếm không phân biệt hoa thường theo tiêu đề (title)", () => {
    // Arrange
    const query = "NEXT.JS";

    // Act
    const result = filterCourseCatalog(SEED_COURSES, query, "Tất cả", "Tất cả cấp độ");

    // Assert
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((c) => c.title.toLowerCase().includes("next.js"))).toBe(true);
  });

  it("tìm kiếm không phân biệt hoa thường theo mô tả (description)", () => {
    // Arrange
    const query = "production";

    // Act
    const result = filterCourseCatalog(SEED_COURSES, query, "Tất cả", "Tất cả cấp độ");

    // Assert
    expect(result.length).toBeGreaterThan(0);
    const hasMatchInDescription = result.some((c) =>
      c.description.toLowerCase().includes("production")
    );
    expect(hasMatchInDescription).toBe(true);
  });

  it("tìm kiếm theo chủ đề tags/topics", () => {
    // Arrange
    const query = "Tailwind CSS";

    // Act
    const result = filterCourseCatalog(SEED_COURSES, query, "Tất cả", "Tất cả cấp độ");

    // Assert
    expect(result.length).toBeGreaterThan(0);
    expect(
      result.some((c) =>
        c.topics.some((t) => t.toLowerCase().includes("tailwind css"))
      )
    ).toBe(true);
  });

  it("trả về mảng rỗng khi không tìm thấy kết quả phù hợp", () => {
    // Arrange
    const query = "NonExistentKeywordXYZ123";

    // Act
    const result = filterCourseCatalog(SEED_COURSES, query, "Tất cả", "Tất cả cấp độ");

    // Assert
    expect(result).toEqual([]);
  });

  it("lọc chính xác theo danh mục (category)", () => {
    // Arrange
    const category = "Frontend";

    // Act
    const result = filterCourseCatalog(SEED_COURSES, "", category, "Tất cả cấp độ");

    // Assert
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((c) => c.category === category)).toBe(true);
  });

  it("lọc chính xác theo cấp độ (level)", () => {
    // Arrange
    const level = "Beginner";

    // Act
    const result = filterCourseCatalog(SEED_COURSES, "", "Tất cả", level);

    // Assert
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((c) => c.level === level)).toBe(true);
  });

  it("kết hợp đồng thời từ khóa, danh mục và cấp độ (điều kiện AND)", () => {
    // Arrange
    const query = "React";
    const category = "Frontend";
    const level = "Beginner";

    // Act
    const result = filterCourseCatalog(SEED_COURSES, query, category, level);

    // Assert
    expect(result.length).toBeGreaterThan(0);
    expect(
      result.every(
        (c) =>
          c.category === category &&
          c.level === level &&
          (c.title.toLowerCase().includes("react") ||
            c.description.toLowerCase().includes("react") ||
            c.topics.some((t) => t.toLowerCase().includes("react")))
      )
    ).toBe(true);
  });

  it("bảo toàn thứ tự mảng gốc và không làm biến đổi mảng đầu vào (immutability)", () => {
    // Arrange
    const sampleCourses: Course[] = SEED_COURSES.slice(0, 2);
    const frozenInput = Object.freeze([...sampleCourses]);

    // Act
    const result = filterCourseCatalog(frozenInput, sampleCourses[0].title, "Tất cả", "Tất cả cấp độ");

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(sampleCourses[0].id);
    expect(frozenInput).toHaveLength(2);
  });
});
