import { describe, expect, it } from "vitest";
import { buildCourseQuizMaterial, type CourseQuizSource } from "./quiz-ai-course-material";

const long = (marker: string, size = 5000) => `${marker} ${"nội dung ".repeat(Math.ceil(size / 10)).slice(0, size)}`;

function course(overrides: Partial<CourseQuizSource> = {}): CourseQuizSource {
  return {
    title: "React cơ bản",
    description: "Khoá học nhập môn React.",
    learningOutcomes: ["Viết component", "Quản lý state"],
    chapters: [
      { title: "Chương 1: Nền tảng", lessons: [{ title: "Bài 1.1 JSX", description: "Cú pháp JSX", body: "JSX là gì." }] },
      { title: "Chương 2: State", lessons: [{ title: "Bài 2.1 useState", body: "useState giữ trạng thái." }] },
    ],
    ...overrides,
  };
}

describe("buildCourseQuizMaterial", () => {
  it("includes the course header, outcomes, every chapter title and every lesson title and text", () => {
    const material = buildCourseQuizMaterial(course());
    expect(material).toContain("Khoá học: React cơ bản");
    expect(material).toContain("Khoá học nhập môn React.");
    expect(material).toContain("- Viết component");
    expect(material).toContain("- Quản lý state");
    expect(material).toContain("## Chương: Chương 1: Nền tảng");
    expect(material).toContain("## Chương: Chương 2: State");
    expect(material).toContain("### Bài: Bài 1.1 JSX");
    expect(material).toContain("Cú pháp JSX");
    expect(material).toContain("JSX là gì.");
    expect(material).toContain("### Bài: Bài 2.1 useState");
    expect(material).toContain("useState giữ trạng thái.");
  });

  it("keeps the course's chapters in their original order", () => {
    const material = buildCourseQuizMaterial(course());
    expect(material.indexOf("Chương 1")).toBeLessThan(material.indexOf("Chương 2"));
    expect(material.indexOf("Bài 1.1 JSX")).toBeLessThan(material.indexOf("Bài 2.1 useState"));
  });

  it("returns an empty string when the course has no text to read, even if titles exist", () => {
    const material = buildCourseQuizMaterial({
      title: "Khoá trống",
      description: "",
      learningOutcomes: [],
      chapters: [{ title: "Chương 1", lessons: [{ title: "Bài 1", description: "  ", body: null }] }],
    });
    expect(material).toBe("");
  });

  it("counts a course description or learning outcomes as text on their own", () => {
    const material = buildCourseQuizMaterial({
      title: "Khoá chỉ có mô tả",
      description: "Mô tả đủ để AI đọc.",
      chapters: [{ title: "Chương 1", lessons: [{ title: "Bài 1" }] }],
    });
    expect(material).toContain("Mô tả đủ để AI đọc.");
  });

  it("never exceeds the character cap", () => {
    const material = buildCourseQuizMaterial(course({
      chapters: [{ title: "Chương 1", lessons: [{ title: "Bài 1", body: long("A", 40000) }] }],
    }), 3000);
    expect(material.length).toBeLessThanOrEqual(3000);
  });

  it("keeps the titles of later chapters even when the early lessons fill the budget", () => {
    const chapters = Array.from({ length: 5 }, (_, c) => ({
      title: `Chương ${c + 1}`,
      lessons: Array.from({ length: 4 }, (_, l) => ({ title: `Bài ${c + 1}.${l + 1}`, body: long(`MARK-${c + 1}-${l + 1}`) })),
    }));
    const material = buildCourseQuizMaterial(course({ chapters }), 12000);
    expect(material.length).toBeLessThanOrEqual(12000);
    for (let c = 1; c <= 5; c++) expect(material).toContain(`## Chương: Chương ${c}`);
    for (let c = 1; c <= 5; c++) expect(material).toContain(`### Bài: Bài ${c}.4`);
  });

  it("shares the text budget across chapters so the last chapter still has reading text", () => {
    const chapters = Array.from({ length: 4 }, (_, c) => ({
      title: `Chương ${c + 1}`,
      lessons: [{ title: `Bài ${c + 1}.1`, body: long(`MARK-${c + 1}`, 8000) }],
    }));
    const material = buildCourseQuizMaterial(course({ chapters }), 12000);
    for (let c = 1; c <= 4; c++) expect(material).toContain(`MARK-${c}`);
  });

  it("keeps short lessons whole and gives the remaining budget to long ones", () => {
    const short = "Bài ngắn chỉ có một câu định nghĩa quan trọng.";
    const chapters = [{
      title: "Chương 1",
      lessons: [
        { title: "Bài dài", body: long("LONG", 20000) },
        { title: "Bài ngắn", body: short },
      ],
    }];
    const material = buildCourseQuizMaterial(course({ chapters }), 6000);
    expect(material).toContain(short);
    expect(material).toContain("LONG");
    expect(material.length).toBeLessThanOrEqual(6000);
  });

  it("does not stop reading material when the header is large", () => {
    const outcomes = Array.from({ length: 40 }, (_, i) => `Mục tiêu số ${i} ${"x".repeat(200)}`);
    const material = buildCourseQuizMaterial(course({ learningOutcomes: outcomes }), 12000);
    expect(material).toContain("### Bài: Bài 2.1 useState");
    expect(material).toContain("useState giữ trạng thái.");
  });
});
