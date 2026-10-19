import { describe, expect, it } from "vitest";
import { generateSlug, generateUniqueCourseSlug } from "./course-slug";

describe("generateSlug", () => {
  it.each([
    ["Lập trình Web Frontend cơ bản", "lap-trinh-web-frontend-co-ban"],
    ["Node.js & Express.js Nâng Cao", "node-js-express-js-nang-cao"],
    ["Đại số tuyến tính cho AI / ML", "dai-so-tuyen-tinh-cho-ai-ml"],
    ["  Khóa học React 19   ", "khoa-hoc-react-19"],
    ["!!!!!", "khoa-hoc"],
    ["???", "khoa-hoc"],
    ["🔥🚀💻", "khoa-hoc"],
    ["", "khoa-hoc"],
    ["123 456", "123-456"],
  ])("generates valid slug for %s -> %s", (input, expected) => {
    expect(generateSlug(input)).toBe(expected);
  });
});

describe("generateUniqueCourseSlug", () => {
  it("appends custom suffix", () => {
    expect(generateUniqueCourseSlug("React Cơ Bản", "a1b2")).toBe("react-co-ban-a1b2");
  });

  it("appends random 6-character hex suffix when not provided", () => {
    const slug1 = generateUniqueCourseSlug("React Cơ Bản");
    const slug2 = generateUniqueCourseSlug("React Cơ Bản");
    expect(slug1).toMatch(/^react-co-ban-[a-f0-9]{6}$/);
    expect(slug2).toMatch(/^react-co-ban-[a-f0-9]{6}$/);
    expect(slug1).not.toBe(slug2);
  });

  it("handles non-latin title properly", () => {
    const slug = generateUniqueCourseSlug("🎉🎉🎉", "test");
    expect(slug).toBe("khoa-hoc-test");
  });
});
