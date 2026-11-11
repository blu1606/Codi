// Unit tests for feature F3 "Personal learning path": F3-1 isMasteredLesson, F3-2 weakConceptIds,
// F3-3 planAdjustment, F3-4 suggestAdjustment. Mastery levels come from BKT probability (evidence required):
// < 0.40 level 1, < 0.60 level 2 (weak), < 0.85 level 3 (mastered), otherwise level 4.
import { describe, expect, it } from "vitest";
import { isMasteredLesson, planAdjustment, suggestAdjustment, weakConceptIds } from "./learning-path-adjustment";
import type { PathConcept, PathInput, PathItem, PathLesson } from "./learning-path-contract";

const concept = (id: number, probability: number | null, evidenceCount = 1): PathConcept => ({ id, name: `Concept ${id}`, probability, evidenceCount });
const lesson = (id: string, skillIds: number[], progress: PathLesson["progress"] = "not_started"): PathLesson => ({
  id, title: `Lesson ${id}`, chapterId: "ch1", chapterTitle: "Chapter 1", durationSeconds: 600, skillIds, progress, studied: progress !== "not_started",
});
const pathInput = (lessons: PathLesson[], concepts: PathConcept[], edges: PathInput["edges"] = []): PathInput => ({
  lessons, concepts, edges, previous: [], goal: null, hours: null, level: null,
});
const itemsOf = (ids: string[], skippable: string[] = []): PathItem[] =>
  ids.map((lessonId) => ({ lessonId, isSkippable: skippable.includes(lessonId), reason: `default ${lessonId}` }));
const ids = (items: PathItem[] | undefined) => items?.map((i) => i.lessonId);
const facts = (overrides: Partial<Parameters<typeof planAdjustment>[2]> = {}) => ({
  afterLessonId: "L1", codingLessonIds: new Set<string>(), remedialLessonIds: new Set<string>(), quizPercent: null, ...overrides,
});

// L1 is completed. L2..L4 are open and teach concepts 2..4.
const LESSONS = [lesson("L1", [1], "completed"), lesson("L2", [2]), lesson("L3", [3]), lesson("L4", [4])];
const ORDER = ["L1", "L2", "L3", "L4"];

describe("F3-1 isMasteredLesson(input, lessonId)", () => {
  it("F3-1 UTCID01: all concepts at probability 0.60 count as mastered", () => {
    expect(isMasteredLesson(pathInput([lesson("L1", [1, 2])], [concept(1, 0.6), concept(2, 0.6)]), "L1")).toBe(true);
  });
  it("F3-1 UTCID02: one concept at 0.59 makes the lesson not mastered", () => {
    expect(isMasteredLesson(pathInput([lesson("L1", [1, 2])], [concept(1, 0.9), concept(2, 0.59)]), "L1")).toBe(false);
  });
  it("F3-1 UTCID03: high probability without evidence is not mastered", () => {
    expect(isMasteredLesson(pathInput([lesson("L1", [1])], [concept(1, 0.9, 0)]), "L1")).toBe(false);
  });
});

describe("F3-2 weakConceptIds(input)", () => {
  const weak = (concepts: PathConcept[]) => weakConceptIds(pathInput([], concepts));
  it("F3-2 UTCID01: probability 0.59 with evidence is weak", () => {
    expect(weak([concept(1, 0.59)])).toEqual([1]);
  });
  it("F3-2 UTCID02: probability 0.60 is mastered, not weak", () => {
    expect(weak([concept(1, 0.6)])).toEqual([]);
  });
  it("F3-2 UTCID03: low probability without evidence is not weak (not studied yet)", () => {
    expect(weak([concept(1, 0.2, 0)])).toEqual([]);
  });
});

describe("F3-3 planAdjustment(input, items, facts, option)", () => {
  it("F3-3 UTCID01: option keep changes nothing", () => {
    expect(planAdjustment(pathInput(LESSONS, [concept(2, 0.9)]), itemsOf(ORDER), facts(), "keep")).toBeNull();
  });
  it("F3-3 UTCID02: skip-mastered marks an open mastered lesson as skippable", () => {
    const plan = planAdjustment(pathInput(LESSONS, [concept(3, 0.9)]), itemsOf(ORDER), facts(), "skip-mastered");
    expect(plan?.items.find((i) => i.lessonId === "L3")).toEqual({ lessonId: "L3", isSkippable: true, reason: "Bạn đã nắm vững Concept 3, nên bài này có thể bỏ qua." });
    expect(plan?.changes).toEqual([{ lessonId: "L3", type: "now-skippable", text: "Lesson L3: có thể bỏ qua vì bạn đã nắm vững các khái niệm." }]);
    expect(plan?.summary).toBe("Đánh dấu 1 bài có thể bỏ qua.");
  });
  it("F3-3 UTCID03: practice moves the remedial lesson for a weak concept right after the completed lesson", () => {
    const plan = planAdjustment(pathInput(LESSONS, [concept(3, 0.5), concept(4, 0.5)]), itemsOf(ORDER), facts({ remedialLessonIds: new Set(["L4"]) }), "practice");
    expect(ids(plan?.items)).toEqual(["L1", "L4", "L2", "L3"]);
    expect(plan?.changes).toEqual([{ lessonId: "L4", type: "moved-up", text: "Lesson L4 được đưa lên ngay sau bài vừa học để ôn Concept 3, Concept 4." }]);
  });
  it("F3-3 UTCID04: practice after a lesson that is not in the course returns null", () => {
    expect(planAdjustment(pathInput(LESSONS, [concept(3, 0.3)]), itemsOf(ORDER), facts({ afterLessonId: "L9" }), "practice")).toBeNull();
  });
  it("F3-3 UTCID05: harder never breaks a prerequisite (move blocked returns null)", () => {
    // L4 needs concept 2, taught by L2 and not mastered, so L4 cannot go before L2.
    const input = pathInput(LESSONS, [], [{ from: 2, to: 4 }]);
    expect(planAdjustment(input, itemsOf(["L1", "L2", "L4", "L3"]), facts({ codingLessonIds: new Set(["L4"]) }), "harder")).toBeNull();
  });
  it("F3-3 UTCID06: lessons missing from a stale path are appended and unknown items dropped", () => {
    const stale = [...itemsOf(["L1", "L2", "L3"]), { lessonId: "GONE", isSkippable: false, reason: "old" }];
    const plan = planAdjustment(pathInput(LESSONS, []), stale, facts({ codingLessonIds: new Set(["L4"]) }), "harder");
    expect(ids(plan?.items)).toEqual(["L1", "L4", "L2", "L3"]);
  });
});

describe("F3-4 suggestAdjustment(input, items, facts)", () => {
  it("F3-4 UTCID01: unknown completed lesson gives no offer", () => {
    expect(suggestAdjustment(pathInput(LESSONS, []), itemsOf(ORDER), facts({ afterLessonId: "L9" }))).toBeNull();
  });
  it("F3-4 UTCID02: no possible change gives no offer", () => {
    expect(suggestAdjustment(pathInput(LESSONS, []), itemsOf(ORDER), facts())).toBeNull();
  });
  it("F3-4 UTCID03: offer lists possible options, keep last, with quiz, mastered and weak insight", () => {
    const input = pathInput(LESSONS, [concept(1, 0.9), concept(3, 0.5)]);
    const offer = suggestAdjustment(input, itemsOf(ORDER), facts({ quizPercent: 87.6, codingLessonIds: new Set(["L4"]) }));
    expect(offer?.options.map((o) => o.type)).toEqual(["practice", "harder", "keep"]);
    expect(offer?.insight).toBe("Bài quiz gần nhất đạt 88%. Codi thấy bạn đã nắm vững Concept 1. Bạn còn chưa chắc về Concept 3.");
  });
  it("F3-4 UTCID04: offer without quiz, mastery or weak data uses the default insight", () => {
    const offer = suggestAdjustment(pathInput(LESSONS, []), itemsOf(ORDER), facts({ codingLessonIds: new Set(["L4"]) }));
    expect(offer?.options.map((o) => o.type)).toEqual(["harder", "keep"]);
    expect(offer?.insight).toBe("Codi sẽ tiếp tục theo dõi tiến độ của bạn.");
  });
});
