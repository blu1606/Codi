import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { masteryLevel } from "@codi-1/ui/lib/mastery";
import {
  assignmentFormat,
  buildConfirmedKnowledgeMap,
  codingExerciseFromMockup,
  codingSubmitPlan,
  diagnosticPattern,
  endOfVietnamDay,
  formatCourseDuration,
  masterySeed,
  mockupLessonUuid,
  mockupSnapshot,
  paymentDeadline,
  quizAnswerPattern,
  rubricText,
  spreadTimestamps,
} from "./seed-mockup-mapping";

describe("mockup seed mapping", () => {
  it("validates the committed snapshot", () => {
    const raw = JSON.parse(readFileSync(fileURLToPath(new URL("./data/mockup-seed.json", import.meta.url)), "utf8"));
    const parsed = mockupSnapshot.safeParse(raw);
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    expect(parsed.data?.courses).toHaveLength(9);
    expect(parsed.data?.users).toHaveLength(13);
  });

  it("maps every mastery stop to a probability inside its own band", () => {
    expect(masterySeed(0).evidenceCount).toBe(0);
    for (const level of [1, 2, 3, 4]) {
      const seed = masterySeed(level);
      expect(masteryLevel(seed.pMastery)).toBe(level);
      expect(seed.correctCount).toBeLessThanOrEqual(seed.evidenceCount);
    }
    expect(() => masterySeed(5)).toThrow(RangeError);
    expect(() => masterySeed(1.5)).toThrow(RangeError);
  });

  it("formats course duration from lesson minutes", () => {
    expect(formatCourseDuration(18)).toBe("18 phút");
    expect(formatCourseDuration(120)).toBe("2 giờ");
    expect(formatCourseDuration(220)).toBe("3 giờ 40 phút");
    expect(formatCourseDuration(-5)).toBe("0 phút");
  });

  it("keeps recorded quiz answers only when they reproduce the score", () => {
    expect(quizAnswerPattern(["a", "b"], { a: false, b: true }, 50)).toEqual([false, true]);
    expect(quizAnswerPattern(["a", "b"], { a: false, b: true }, 100)).toEqual([true, true]);
    expect(quizAnswerPattern(["a", "b"], {}, 50)).toEqual([true, false]);
    expect(quizAnswerPattern(["a", "b"], {}, 0)).toEqual([false, false]);
  });

  it("gives diagnostic right answers to the strongest concepts", () => {
    const pattern = diagnosticPattern(["var", "func", "arr", "obj", "dom", "async"], { var: 4, func: 3, arr: 3, obj: 2, dom: 1, async: 0 }, { right: 3, wrong: 1 });
    expect(pattern).toEqual(["right", "right", "right", "wrong", "unknown", "unknown"]);
  });

  it("plans coding submits so only the last can pass", () => {
    const plan = codingSubmitPlan({ submits: 4, passed: true, bestScore: 100, failedTests: { t1: 3, t2: 1 }, testIds: ["t1", "t2", "t3", "t4"] });
    expect(plan).toEqual([{ score: 50, isPassed: false }, { score: 75, isPassed: false }, { score: 75, isPassed: false }, { score: 100, isPassed: true }]);
    expect(codingSubmitPlan({ submits: 2, passed: true, bestScore: 100, failedTests: {}, testIds: ["t1", "t2"] })[0]).toEqual({ score: 50, isPassed: false });
    expect(codingSubmitPlan({ submits: 0, passed: false, bestScore: 0, failedTests: {}, testIds: ["t1"] })).toEqual([]);
  });

  it("maps assignment settings", () => {
    expect(assignmentFormat(true, true)).toBe("file_or_link");
    expect(assignmentFormat(true, false)).toBe("file");
    expect(assignmentFormat(false, true)).toBe("link");
    expect(assignmentFormat(false, false)).toBe("text");
    expect(rubricText([])).toBeNull();
    expect(rubricText([{ name: "Đúng", points: 5, desc: "Chạy đúng." }])).toBe("- Đúng (5 điểm): Chạy đúng.");
  });

  it("derives dates", () => {
    expect(paymentDeadline(new Date("2026-10-11T07:50:00Z")).toISOString()).toBe("2026-10-11T08:20:00.000Z");
    expect(endOfVietnamDay("2026-12-31").toISOString()).toBe("2026-12-31T16:59:59.000Z");
    const [a, b] = spreadTimestamps(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T03:00:00Z"), 2);
    expect([a!.toISOString(), b!.toISOString()]).toEqual(["2026-01-01T01:00:00.000Z", "2026-01-01T02:00:00.000Z"]);
    expect(spreadTimestamps(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"), 1)[0]!.toISOString()).toBe("2026-01-01T00:01:00.000Z");
  });

  it("builds stable lesson ids", () => {
    expect(mockupLessonUuid("lesson-js-001")).toBe(mockupLessonUuid("lesson-js-001"));
    expect(mockupLessonUuid("lesson-js-001")).not.toBe(mockupLessonUuid("lesson-js-002"));
    expect(mockupLessonUuid("lesson-js-001")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("turns challenges and tutorials into runnable exercises", () => {
    const challenge = codingExerciseFromMockup("Tổng", {
      kind: "challenge", language: "javascript", instructions: ["Viết tong()."], starter: "function tong() {}", solution: "function tong() { return 1; }",
      tests: [{ id: "a", name: "mẫu", call: "tong()", expected: { b: 1, a: [2] } }, { id: "b", name: "ẩn", call: "tong()", expected: null, hidden: true }],
      hints: ["Gợi ý"], solutionCheck: { ok: true, at: "2026-06-01T09:00:00Z" },
    });
    expect(challenge.instructions).toBe("1. Viết tong().");
    expect(challenge.tests.map((t) => [t.expectedOutput, t.isSample])).toEqual([['{"a":[2],"b":1}', true], ["null", false]]);
    expect(challenge.solutionVerifiedAt?.toISOString()).toBe("2026-06-01T09:00:00.000Z");

    const tutorial = codingExerciseFromMockup("Hướng dẫn", {
      kind: "tutorial", language: "javascript",
      steps: [
        { title: "Chào", body: "Bấm Chạy.", starter: "console.log(1);" },
        { title: "Sửa", body: "Sửa hàm.", starter: "function f() {}", tests: [{ id: "t", name: "f()", call: "f()", expected: "Giỏi" }] },
        { title: "Lời giải", body: "", starter: "function f() { return 'Giỏi'; }", isSolution: true },
      ],
    });
    expect(tutorial.starterCode).toBe("console.log(1);");
    expect(tutorial.solutionCode).toBe("function f() { return 'Giỏi'; }");
    expect(tutorial.tests).toEqual([{ mockupId: "t", name: "f()", input: "f()", expectedOutput: '"Giỏi"', isSample: true }]);
    expect(tutorial.tutorialSteps).toHaveLength(3);
    expect(tutorial.tutorialSteps[1]!.tests).toEqual([{ name: "f()", input: "f()", expectedOutput: '"Giỏi"' }]);
    expect(tutorial.tutorialSteps[2]!.isSolution).toBe(true);
    expect(tutorial.instructions).toContain("Đi hết các bước");
    expect(tutorial.instructions).not.toContain("Lời giải");
  });

  describe("buildConfirmedKnowledgeMap", () => {
    const bkt = { bktPInit: 0.1, bktPLearn: 0.2, bktPGuess: 0.2, bktPSlip: 0.1 };
    type BuilderInput = Parameters<typeof buildConfirmedKnowledgeMap>[0];
    const input = (): BuilderInput => ({
      courseId: "course-x",
      contentGeneration: 0,
      publishedAt: "2026-10-07T10:00:00.000Z",
      skills: [
        { id: 2, name: "B", review: "accepted" as const, ...bkt },
        { id: 1, name: "A", review: "edited" as const, ...bkt },
        { id: 3, name: "Bỏ", review: "declined" as const, ...bkt },
      ],
      edges: [
        { skillId: 2, prerequisiteSkillId: 1, review: "accepted" as const },
        { skillId: 2, prerequisiteSkillId: 3, review: "accepted" as const },
      ],
      links: [
        { lessonId: "lesson-b", skillId: 2 },
        { lessonId: "lesson-a", skillId: 1 },
        { lessonId: "lesson-a", skillId: 3 },
      ],
    });

    it("drops declined concepts with their edges and links, sorted by id", () => {
      const map = buildConfirmedKnowledgeMap(input());
      expect(map.skills.map((s) => s.id)).toEqual([1, 2]);
      expect(map.edges).toEqual([{ from: 1, to: 2 }]);
      expect(map.links).toEqual([{ lessonId: "lesson-a", skillId: 1 }, { lessonId: "lesson-b", skillId: 2 }]);
      expect(map.version).toBe(1);
      expect(map.publishedAt).toBe("2026-10-07T10:00:00.000Z");
    });

    it("keeps the publication id stable for identical content", () => {
      expect(buildConfirmedKnowledgeMap(input()).publicationId).toBe(buildConfirmedKnowledgeMap(input()).publicationId);
    });

    it("refuses pending suggestions, cycles and empty maps", () => {
      const pending = input();
      pending.skills[0]!.review = "suggested";
      expect(() => buildConfirmedKnowledgeMap(pending)).toThrow("đề xuất chưa xem lại");
      const cyclic = input();
      cyclic.edges.push({ skillId: 1, prerequisiteSkillId: 2, review: "accepted" });
      expect(() => buildConfirmedKnowledgeMap(cyclic)).toThrow("vòng lặp");
      const empty = input();
      empty.skills = empty.skills.map((s) => ({ ...s, review: "declined" as const }));
      expect(() => buildConfirmedKnowledgeMap(empty)).toThrow("ít nhất một khái niệm");
    });
  });
});
