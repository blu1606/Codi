import { describe, expect, it } from "vitest";
import { createCourseSchema } from "./course-schema";

describe("createCourseSchema", () => {
  const validPayload = {
    title: "Khóa học TypeScript Chuyên Sâu",
    summary: "Nắm vững generics, mapped types, conditional types và AST trong TypeScript.",
    category: "Backend",
    level: "Intermediate",
  };

  it("passes for valid payload", () => {
    const res = createCourseSchema.safeParse(validPayload);
    expect(res.success).toBe(true);
  });

  it("fails if title is too short (< 5 chars)", () => {
    const res = createCourseSchema.safeParse({ ...validPayload, title: "Vue" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.format().title?._errors).toContain("Tên khoá học cần ít nhất 5 ký tự.");
    }
  });

  it("fails if title exceeds 120 chars", () => {
    const res = createCourseSchema.safeParse({ ...validPayload, title: "A".repeat(121) });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.format().title?._errors).toContain("Tên khoá học tối đa 120 ký tự.");
    }
  });

  it("fails if summary is too short (< 20 chars)", () => {
    const res = createCourseSchema.safeParse({ ...validPayload, summary: "Quá ngắn" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.format().summary?._errors).toContain("Mô tả cần ít nhất 20 ký tự.");
    }
  });

  it("fails if summary exceeds 500 chars", () => {
    const res = createCourseSchema.safeParse({ ...validPayload, summary: "A".repeat(501) });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.format().summary?._errors).toContain("Mô tả tối đa 500 ký tự.");
    }
  });

  it("fails if category is not whitelisted", () => {
    const res = createCourseSchema.safeParse({ ...validPayload, category: "InvalidCategory" });
    expect(res.success).toBe(false);
  });

  it("fails if level is not whitelisted", () => {
    const res = createCourseSchema.safeParse({ ...validPayload, level: "Expert" });
    expect(res.success).toBe(false);
  });

  it("handles null or invalid types gracefully without throwing", () => {
    expect(createCourseSchema.safeParse(null).success).toBe(false);
    expect(createCourseSchema.safeParse(undefined).success).toBe(false);
    expect(createCourseSchema.safeParse({ title: 123 }).success).toBe(false);
  });
});
