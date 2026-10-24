import { describe, expect, it } from "vitest";
import {
  aiPrecheck,
  autoCriteria,
  canApprove,
  checkReadiness,
  CRITERIA,
  materialOk,
  targetHref,
  type CourseDataForReview,
  type ReviewRoundDto,
} from "./publication-service";

describe("publication-service", () => {
  const baseValidCourse: CourseDataForReview = {
    id: "course-123",
    title: "Khoá học React Fullstack",
    description: "Khoá học chất lượng cao từ cơ bản đến nâng cao cho lập trình viên.",
    summary: "Khoá học chất lượng cao từ cơ bản đến nâng cao cho lập trình viên.",
    category: "Lập trình Web",
    level: "Beginner",
    price: 1290000,
    proposedPrice: 1290000,
    knowledgeMapStatus: "confirmed",
    chapters: [
      {
        id: "ch-1",
        title: "Chương 1: Mở đầu",
        lessons: [
          {
            id: "ls-1",
            title: "Bài 1: Giới thiệu",
            type: "video",
            materials: [{ type: "video", fileName: "intro.mp4", url: "https://example.com/intro.mp4" }],
          },
        ],
      },
    ],
    entryTest: {
      questions: [
        { id: 1, text: "Câu 1", options: ["A", "B", "C", "D"], correctIndex: 0, aiReviewed: true },
        { id: 2, text: "Câu 2", options: ["A", "B", "C", "D"], correctIndex: 1, aiReviewed: true },
        { id: 3, text: "Câu 3", options: ["A", "B", "C", "D"], correctIndex: 2, aiReviewed: true },
        { id: 4, text: "Câu 4", options: ["A", "B", "C", "D"], correctIndex: 3, aiReviewed: true },
        { id: 5, text: "Câu 5", options: ["A", "B", "C", "D"], correctIndex: 0, aiReviewed: true },
      ],
    },
  };

  describe("checkReadiness", () => {
    it("returns allOk = true when all 8 requirements are satisfied", () => {
      const result = checkReadiness(baseValidCourse);
      expect(result.allOk).toBe(true);
      expect(result.items.every((i) => i.ok)).toBe(true);
    });

    it("fails when description is shorter than 20 characters", () => {
      const course = { ...baseValidCourse, description: "Quá ngắn" };
      const result = checkReadiness(course);
      expect(result.allOk).toBe(false);
      const descItem = result.items.find((i) => i.key === "desc");
      expect(descItem?.ok).toBe(false);
    });

    it("fails when course has no lessons", () => {
      const course = { ...baseValidCourse, chapters: [{ id: "ch-1", title: "Chương", lessons: [] }] };
      const result = checkReadiness(course);
      expect(result.allOk).toBe(false);
      const lessonItem = result.items.find((i) => i.key === "lessons");
      expect(lessonItem?.ok).toBe(false);
    });

    it("fails when proposed price is null/undefined", () => {
      const course = { ...baseValidCourse, price: 1290000, proposedPrice: null };
      const result = checkReadiness(course);
      expect(result.allOk).toBe(false);
      const priceItem = result.items.find((i) => i.key === "price");
      expect(priceItem?.ok).toBe(false);
    });

    it("fails when entry test has fewer than 5 questions", () => {
      const course: CourseDataForReview = {
        ...baseValidCourse,
        entryTest: {
          questions: [
            { id: 1, text: "Q1", options: ["A", "B"], correctIndex: 0 },
            { id: 2, text: "Q2", options: ["A", "B"], correctIndex: 0 },
          ],
        },
      };
      const result = checkReadiness(course);
      expect(result.allOk).toBe(false);
      const entryItem = result.items.find((i) => i.key === "entry");
      expect(entryItem?.ok).toBe(false);
    });

    it("fails when knowledge map status is not confirmed", () => {
      const course = { ...baseValidCourse, knowledgeMapStatus: "stale" };
      const result = checkReadiness(course);
      expect(result.allOk).toBe(false);
      const kmapItem = result.items.find((i) => i.key === "kmap");
      expect(kmapItem?.ok).toBe(false);
      expect(kmapItem?.hint).toContain("cũ");
    });

    it("fails when code challenges exist but solution is not verified or tests missing", () => {
      const course: CourseDataForReview = {
        ...baseValidCourse,
        chapters: [
          {
            id: "ch-1",
            title: "Chương 1",
            lessons: [
              {
                id: "ls-code",
                title: "Bài code",
                type: "code",
                code: {
                  kind: "challenge",
                  tests: [],
                  solutionCheck: { ok: false },
                },
              },
            ],
          },
        ],
      };
      const result = checkReadiness(course);
      expect(result.allOk).toBe(false);
      const codeItem = result.items.find((i) => i.key === "code");
      expect(codeItem?.ok).toBe(false);
    });

    it("passes when code challenge has tests and solutionCheck.ok", () => {
      const course: CourseDataForReview = {
        ...baseValidCourse,
        chapters: [
          {
            id: "ch-1",
            title: "Chương 1",
            lessons: [
              {
                id: "ls-code",
                title: "Bài code",
                type: "code",
                code: {
                  kind: "challenge",
                  tests: [{ id: 1, name: "Test 1" }],
                  solutionCheck: { ok: true, passed: 1, total: 1 },
                },
              },
            ],
          },
        ],
      };
      const result = checkReadiness(course);
      expect(result.allOk).toBe(true);
      const codeItem = result.items.find((i) => i.key === "code");
      expect(codeItem?.ok).toBe(true);
    });

    it("fails when unreviewed AI questions exist", () => {
      const course: CourseDataForReview = {
        ...baseValidCourse,
        chapters: [
          {
            id: "ch-1",
            title: "Chương 1",
            lessons: [
              {
                id: "ls-quiz",
                title: "Quiz",
                type: "reading",
                body: "Nội dung bài học",
                quiz: {
                  questions: [
                    { id: 101, text: "AI Q", options: ["A", "B"], aiGenerated: true, aiReviewed: false },
                  ],
                },
              },
            ],
          },
        ],
      };
      const result = checkReadiness(course);
      expect(result.allOk).toBe(false);
      const aiItem = result.items.find((i) => i.key === "ai");
      expect(aiItem?.ok).toBe(false);
    });

    it("fails when an assignment has no rubric", () => {
      const course: CourseDataForReview = {
        ...baseValidCourse,
        chapters: [
          {
            id: "ch-1",
            title: "Chương 1",
            lessons: [
              {
                id: "ls-assign",
                title: "Bài tập lớn",
                type: "reading",
                body: "Hướng dẫn nộp bài",
                assignment: {
                  instructions: "Nộp bài dự án",
                  rubric: [],
                },
              },
            ],
          },
        ],
      };
      const result = checkReadiness(course);
      expect(result.allOk).toBe(false);
      const assignItem = result.items.find((i) => i.key === "assignment");
      expect(assignItem?.ok).toBe(false);
    });
  });

  describe("canApprove", () => {
    it("allows approval when all 7 criteria are marked (pass/na) and all must flags are closed", () => {
      const criteria: Record<string, { status: any; note?: string }> = {};
      CRITERIA.forEach((c) => {
        criteria[c.id] = { status: "pass" };
      });

      const round = {
        criteria,
        flags: [
          {
            id: 1,
            targetLabel: "Lỗi nhỏ",
            severity: "should" as const,
            comment: "Nên thêm ví dụ",
            status: "open" as const,
            source: "admin" as const,
          },
          {
            id: 2,
            targetLabel: "Lỗi quan trọng",
            severity: "must" as const,
            comment: "Sửa tệp video",
            status: "closed" as const,
            source: "admin" as const,
          },
        ],
      };

      const reasons = canApprove(round);
      expect(reasons).toHaveLength(0);
    });

    it("blocks approval if any criterion is unmarked", () => {
      const criteria: Record<string, { status: any }> = {
        info: { status: "pass" },
        materials: { status: "pass" },
        quiz: { status: "na" },
        // entry, code, assignment, rights unmarked
      };

      const round = { criteria, flags: [] };
      const reasons = canApprove(round);
      expect(reasons.some((r) => r.includes("tiêu chí chưa chấm"))).toBe(true);
    });

    it("blocks approval if any criterion has status 'fix'", () => {
      const criteria: Record<string, { status: any }> = {};
      CRITERIA.forEach((c) => {
        criteria[c.id] = { status: "pass" };
      });
      criteria.materials = { status: "fix" };

      const round = { criteria, flags: [] };
      const reasons = canApprove(round);
      expect(reasons.some((r) => r.includes('"Cần sửa"'))).toBe(true);
    });

    it("blocks approval if any flag with severity 'must' is open or fixed (not closed)", () => {
      const criteria: Record<string, { status: any }> = {};
      CRITERIA.forEach((c) => {
        criteria[c.id] = { status: "pass" };
      });

      const round = {
        criteria,
        flags: [
          {
            id: 1,
            targetLabel: "Video hỏng",
            severity: "must" as const,
            comment: "Video bài 1 không phát được",
            status: "fixed" as const, // lecturer marked fixed, admin has not closed yet
            source: "admin" as const,
          },
        ],
      };

      const reasons = canApprove(round);
      expect(reasons.some((r) => r.includes('"Bắt buộc sửa" chưa đóng'))).toBe(true);
    });
  });

  describe("materialOk", () => {
    it("returns true for reading lesson with body", () => {
      expect(materialOk({ id: "1", title: "Read", type: "reading", body: "Hello world" })).toBe(true);
    });

    it("returns false for reading lesson without body", () => {
      expect(materialOk({ id: "1", title: "Read", type: "reading", body: "" })).toBe(false);
    });

    it("returns true for video lesson with materials", () => {
      expect(
        materialOk({
          id: "1",
          title: "Video",
          type: "video",
          materials: [{ type: "video", fileName: "lesson.mp4" }],
        })
      ).toBe(true);
    });

    it("returns false for video lesson without file", () => {
      expect(
        materialOk({
          id: "1",
          title: "Video",
          type: "video",
          materials: [],
        })
      ).toBe(false);
    });
  });

  describe("autoCriteria & aiPrecheck", () => {
    it("computes accurate suggestions for autoCriteria", () => {
      const auto = autoCriteria(baseValidCourse);
      expect(auto.info.status).toBe("pass");
      expect(auto.materials.status).toBe("pass");
      expect(auto.entry.status).toBe("pass");
      expect(auto.rights.status).toBeNull(); // always needs human mark
    });

    it("generates advisory flags via aiPrecheck", () => {
      const courseWithMissingFile: CourseDataForReview = {
        ...baseValidCourse,
        chapters: [
          {
            id: "ch-1",
            title: "Chương",
            lessons: [
              {
                id: "ls-empty",
                title: "Bài trống",
                type: "video",
                materials: [],
              },
            ],
          },
        ],
      };

      const flags = aiPrecheck(courseWithMissingFile);
      expect(flags.some((f) => f.severity === "must" && f.comment.includes("Chưa có tệp"))).toBe(true);
    });
  });

  describe("targetHref", () => {
    it("returns correct links for different targets", () => {
      expect(targetHref("c1", { type: "course", label: "Mô tả khoá học" })).toBe("/dashboard/lecturer/courses/c1/info");
      expect(targetHref("c1", { type: "course", label: "Bài kiểm tra đầu vào" })).toBe("/dashboard/lecturer/courses/c1/quiz/entry");
      expect(targetHref("c1", { type: "lesson", lessonId: "ls1", label: "Bài 1" })).toBe("/dashboard/lecturer/courses/c1/content?lesson=ls1");
      expect(targetHref("c1", { type: "code", lessonId: "ls2", label: "Bài code" })).toBe("/dashboard/lecturer/courses/c1/code/ls2");
    });
  });
});
