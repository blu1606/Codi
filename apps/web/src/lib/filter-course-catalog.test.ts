import { describe, expect, it } from "vitest";
import { SEED_COURSES } from "./data/courses";
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
    const frozenInput = Object.freeze([
      Object.freeze({ id: "second", title: "React basics", category: "Frontend", level: "Beginner", description: "" }),
      Object.freeze({ id: "excluded", title: "Node basics", category: "Backend", level: "Beginner", description: "" }),
      Object.freeze({ id: "first", title: "React advanced", category: "Frontend", level: "Advanced", description: "" }),
    ]);
    const original = structuredClone(frozenInput);

    // Act
    const result = filterCourseCatalog(frozenInput, "React", "Tất cả", "Tất cả cấp độ");

    // Assert
    expect(result.map((course) => course.id)).toEqual(["second", "first"]);
    expect(frozenInput).toEqual(original);
  });

  describe("lọc theo giá (price)", () => {
    const mixedCourses = [
      { id: "c1", title: "Free Course", category: "Frontend", level: "Beginner", description: "Free", price: 0 },
      { id: "c2", title: "Paid Course", category: "Backend", level: "Intermediate", description: "Paid", price: 200000 },
    ];

    it("lọc các khóa học miễn phí (free)", () => {
      const result = filterCourseCatalog(mixedCourses, "", "Tất cả", "Tất cả cấp độ", { price: "free" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("c1");
    });

    it("lọc các khóa học có phí (paid)", () => {
      const result = filterCourseCatalog(mixedCourses, "", "Tất cả", "Tất cả cấp độ", { price: "paid" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("c2");
    });
  });

  describe("sắp xếp (sort)", () => {
    const list = [
      { id: "c1", title: "Course 1", category: "Frontend", level: "Beginner", description: "", price: 300000, enrollmentCount: 50, rating: 4.8, createdAt: "2026-01-01" },
      { id: "c2", title: "Course 2", category: "Backend", level: "Intermediate", description: "", price: 100000, enrollmentCount: 150, rating: 4.2, createdAt: "2026-03-01" },
      { id: "c3", title: "Course 3", category: "Mobile", level: "Advanced", description: "", price: 200000, enrollmentCount: 10, rating: 4.9, createdAt: "2026-02-01" },
    ];

    it("sắp xếp theo độ phổ biến (popular): số học viên giảm dần", () => {
      const result = filterCourseCatalog(list, "", "Tất cả", "Tất cả cấp độ", { sort: "popular" });
      expect(result.map((c) => c.id)).toEqual(["c2", "c1", "c3"]);
    });

    it("sắp xếp theo học nhiều nhất (enrollment): số học viên giảm dần", () => {
      const result = filterCourseCatalog(list, "", "Tất cả", "Tất cả cấp độ", { sort: "enrollment" });
      expect(result.map((c) => c.id)).toEqual(["c2", "c1", "c3"]);
    });

    it("sắp xếp relevant ưu tiên khớp tiêu đề rồi số học viên khi cùng mức khớp", () => {
      const searchList = [
        { id: "description", title: "Học Lập trình Web", category: "Frontend", level: "Beginner", description: "Chứa React trong mô tả", enrollmentCount: 500 },
        { id: "c1", title: "React Nâng cao", category: "Frontend", level: "Advanced", description: "Lập trình web", enrollmentCount: 20 },
        { id: "c2", title: "React Cơ bản", category: "Frontend", level: "Beginner", description: "Lập trình web", enrollmentCount: 100 },
      ];
      // Title khớp "React" xếp trước dù ít enrollment hơn
      const result = filterCourseCatalog(searchList, "React", "Tất cả", "Tất cả cấp độ", { sort: "relevant" });
      expect(result.map((c) => c.id)).toEqual(["c2", "c1", "description"]);
    });

    it("sắp xếp theo mới nhất (newest)", () => {
      const result = filterCourseCatalog(list, "", "Tất cả", "Tất cả cấp độ", { sort: "newest" });
      expect(result.map((c) => c.id)).toEqual(["c2", "c3", "c1"]);
    });

    it("sắp xếp theo giá tăng dần (price-asc)", () => {
      const result = filterCourseCatalog(list, "", "Tất cả", "Tất cả cấp độ", { sort: "price-asc" });
      expect(result.map((c) => c.id)).toEqual(["c2", "c3", "c1"]);
    });

    it("sắp xếp theo giá giảm dần (price-desc)", () => {
      const result = filterCourseCatalog(list, "", "Tất cả", "Tất cả cấp độ", { sort: "price-desc" });
      expect(result.map((c) => c.id)).toEqual(["c1", "c3", "c2"]);
    });

    it("sắp xếp theo đánh giá cao nhất (rating)", () => {
      const result = filterCourseCatalog(list, "", "Tất cả", "Tất cả cấp độ", { sort: "rating" });
      expect(result.map((c) => c.id)).toEqual(["c3", "c1", "c2"]);
    });

  });

  describe("getTypeaheadSuggestions", () => {
    it("keeps category-only matches consistent with the catalog destination", async () => {
      const { getTypeaheadSuggestions } = await import("./filter-course-catalog");
      const input = [{ title: "Interfaces", description: "Build views", category: "Frontend", level: "Beginner" }];
      const destination = filterCourseCatalog(input, "frontend", "all", "all");
      const suggestions = getTypeaheadSuggestions(input, "frontend");
      expect(destination).toEqual(input);
      expect(suggestions.matches).toEqual(destination);
      expect(suggestions.isEmpty).toBe(false);
    });

    it.each([
      [" REACT ", ["c1", "c2"]],
      ["apps", ["c2"]],
      ["Hooks", ["c1"]],
      ["not-found", []],
    ] as const)("matches expected courses and the catalog destination for %s", async (query, expectedIds) => {
      const { getTypeaheadSuggestions } = await import("./filter-course-catalog");
      const suggestions = getTypeaheadSuggestions(catalog, query);
      const destination = filterCourseCatalog(catalog, query, "all", "all");
      expect(destination.map((course) => course.id)).toEqual(expectedIds);
      expect(suggestions.matches.map((course) => course.id)).toEqual(expectedIds);
      expect(suggestions.matches).toEqual(destination);
    });

    const catalog = [
      { id: "c1", title: "React Fundamentals", category: "Frontend", level: "Beginner", description: "Learn React", topics: ["React", "Hooks", "JSX"] },
      { id: "c2", title: "React Native Mobile", category: "Mobile", level: "Intermediate", description: "Build apps", topics: ["Mobile", "React Native"] },
      { id: "c3", title: "Node.js Backend", category: "Backend", level: "Beginner", description: "APIs with Node", topics: ["Node.js", "Express"] },
    ];

    it("gợi ý và gom nhóm chính xác theo danh mục", async () => {
      const { getTypeaheadSuggestions } = await import("./filter-course-catalog");
      const result = getTypeaheadSuggestions(catalog, "React");
      expect(result.matches).toHaveLength(2);
      expect(result.isEmpty).toBe(false);
      expect(Object.keys(result.grouped)).toEqual(["Frontend", "Mobile"]);
      expect(result.grouped["Frontend"][0].id).toBe("c1");
      expect(result.grouped["Mobile"][0].id).toBe("c2");
    });

    it("trả về querySuggestions và topResults với badge Khóa học / Chủ đề", async () => {
      const { getTypeaheadSuggestions } = await import("./filter-course-catalog");
      const result = getTypeaheadSuggestions(catalog, "React");
      expect(result.querySuggestions).toContain("React Fundamentals");

      const courseTop = result.topResults.find((r) => r.type === "Khóa học");
      expect(courseTop?.badgeLabel).toBe("Khóa học");

      const topicTop = result.topResults.find((r) => r.type === "Chủ đề");
      expect(topicTop?.badgeLabel).toBe("Chủ đề");
    });

    it("trả về isEmpty: true khi không có gợi ý phù hợp", async () => {
      const { getTypeaheadSuggestions } = await import("./filter-course-catalog");
      const result = getTypeaheadSuggestions(catalog, "PythonMachineLearning");
      expect(result.matches).toHaveLength(0);
      expect(result.topResults).toHaveLength(0);
      expect(result.querySuggestions).toHaveLength(0);
      expect(result.isEmpty).toBe(true);
      expect(result.grouped).toEqual({});
    });

    it("trả về mảng rỗng khi query rỗng", async () => {
      const { getTypeaheadSuggestions } = await import("./filter-course-catalog");
      const result = getTypeaheadSuggestions(catalog, "   ");
      expect(result.matches).toHaveLength(0);
      expect(result.topResults).toHaveLength(0);
      expect(result.querySuggestions).toHaveLength(0);
      expect(result.isEmpty).toBe(false);
    });
  });
});
