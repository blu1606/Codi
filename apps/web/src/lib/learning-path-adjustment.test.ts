import { describe, expect, it } from "vitest";
import {
  planAdjustment,
  suggestAdjustment,
  type AdjustmentFacts,
} from "./learning-path-adjustment";
import type { PathInput, PathItem } from "./learning-path-contract";

const L1 = "00000000-0000-4000-8000-000000000001";
const L2 = "00000000-0000-4000-8000-000000000002";
const L3 = "00000000-0000-4000-8000-000000000003";
const L4 = "00000000-0000-4000-8000-000000000004";

// Concept 1: mastered (p .9). Concept 2: mastered (p .7). Concept 3: weak (p .3, evidence).
// L1 completed (teaches 1). L2 teaches 2 and requires 1. L3 is coding and teaches 3 and requires 2.
// L4 teaches 3 (remedial in some tests).
function input(overrides: Partial<PathInput> = {}): PathInput {
  return {
    goal: "project",
    level: "new",
    hours: 5,
    previous: [],
    concepts: [
      { id: 1, name: "Biến", probability: 0.9, evidenceCount: 2 },
      { id: 2, name: "Hàm", probability: 0.7, evidenceCount: 2 },
      { id: 3, name: "Mảng", probability: 0.3, evidenceCount: 1 },
    ],
    lessons: [
      { id: L1, title: "Bài 1", chapterId: "c", chapterTitle: "Chương", skillIds: [1], durationSeconds: 600, progress: "completed", studied: true },
      { id: L2, title: "Bài 2", chapterId: "c", chapterTitle: "Chương", skillIds: [2], durationSeconds: 600, progress: "not_started", studied: false },
      { id: L3, title: "Bài 3 code", chapterId: "c", chapterTitle: "Chương", skillIds: [3], durationSeconds: 600, progress: "not_started", studied: false },
      { id: L4, title: "Bài 4 ôn", chapterId: "c", chapterTitle: "Chương", skillIds: [3], durationSeconds: 600, progress: "not_started", studied: false },
    ],
    edges: [
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ],
    ...overrides,
  };
}

const items = (order = [L1, L2, L3, L4]): PathItem[] =>
  order.map((lessonId) => ({ lessonId, isSkippable: false, reason: "Theo thứ tự." }));

function facts(overrides: Partial<AdjustmentFacts> = {}): AdjustmentFacts {
  return {
    afterLessonId: L1,
    codingLessonIds: new Set([L3]),
    remedialLessonIds: new Set([L4]),
    quizPercent: null,
    ...overrides,
  };
}

const order = (plan: { items: PathItem[] } | null) => plan?.items.map((i) => i.lessonId);

describe("skip-mastered", () => {
  it("marks open lessons whose concepts are all mastered as skippable, for AI and default paths alike", () => {
    const plan = planAdjustment(input(), items(), facts(), "skip-mastered");
    expect(plan).not.toBeNull();
    expect(plan!.items.find((i) => i.lessonId === L2)!.isSkippable).toBe(true);
    expect(plan!.items.find((i) => i.lessonId === L3)!.isSkippable).toBe(false);
    expect(plan!.changes).toEqual([
      expect.objectContaining({ lessonId: L2, type: "now-skippable" }),
    ]);
    expect(order(plan)).toEqual([L1, L2, L3, L4]);
  });

  it("is not applicable once every mastered lesson is already skippable (stale offer)", () => {
    const applied = planAdjustment(input(), items(), facts(), "skip-mastered")!;
    expect(planAdjustment(input(), applied.items, facts(), "skip-mastered")).toBeNull();
  });

  it("is not applicable when no open lesson is fully mastered", () => {
    const weak = input({
      concepts: [
        { id: 1, name: "Biến", probability: 0.9, evidenceCount: 2 },
        { id: 2, name: "Hàm", probability: 0.2, evidenceCount: 1 },
        { id: 3, name: "Mảng", probability: 0.3, evidenceCount: 1 },
      ],
    });
    expect(planAdjustment(weak, items(), facts(), "skip-mastered")).toBeNull();
  });
});

describe("practice (luyện thêm)", () => {
  it("moves the remedial lesson teaching a weak concept right after the completed lesson", () => {
    const plan = planAdjustment(input(), items(), facts(), "practice");
    expect(order(plan)).toEqual([L1, L4, L2, L3]);
    expect(plan!.changes).toEqual([
      expect.objectContaining({ lessonId: L4, type: "moved-up" }),
    ]);
    expect(plan!.items.find((i) => i.lessonId === L4)!.reason).toContain("Mảng");
  });

  it("falls back to any open lesson teaching the weak concept when no remedial lesson exists", () => {
    const plan = planAdjustment(input(), items(), facts({ remedialLessonIds: new Set() }), "practice");
    expect(order(plan)).toEqual([L1, L3, L4, L2]);
  });

  it("is not applicable when the only teaching lessons sit before the current position", () => {
    expect(
      planAdjustment(input(), items([L3, L4, L1, L2]), facts({ afterLessonId: L1 }), "practice"),
    ).toBeNull();
  });

  it("is not applicable when no concept is weak", () => {
    const strong = input({
      concepts: [
        { id: 1, name: "Biến", probability: 0.9, evidenceCount: 2 },
        { id: 2, name: "Hàm", probability: 0.7, evidenceCount: 2 },
        { id: 3, name: "Mảng", probability: 0.9, evidenceCount: 2 },
      ],
    });
    expect(planAdjustment(strong, items(), facts(), "practice")).toBeNull();
  });
});

describe("harder (làm bài code sớm hơn)", () => {
  it("moves the coding lesson earlier when its prerequisite is covered", () => {
    const plan = planAdjustment(input(), items(), facts(), "harder");
    expect(order(plan)).toEqual([L1, L3, L2, L4]);
    expect(plan!.changes).toEqual([expect.objectContaining({ lessonId: L3, type: "moved-up" })]);
  });

  it("never places a coding lesson before its unmet prerequisite", () => {
    const unmet = input({
      concepts: [
        { id: 1, name: "Biến", probability: 0.9, evidenceCount: 2 },
        { id: 2, name: "Hàm", probability: 0.2, evidenceCount: 1 },
        { id: 3, name: "Mảng", probability: 0.3, evidenceCount: 1 },
      ],
    });
    expect(planAdjustment(unmet, items(), facts(), "harder")).toBeNull();
  });

  it("is not applicable without coding lessons", () => {
    expect(planAdjustment(input(), items(), facts({ codingLessonIds: new Set() }), "harder")).toBeNull();
  });
});

describe("suggestAdjustment", () => {
  it("offers only applicable options, keep last, with insight from mastery and quiz", () => {
    const offer = suggestAdjustment(input(), items(), facts({ quizPercent: 80 }))!;
    expect(offer.options.map((o) => o.type)).toEqual(["skip-mastered", "practice", "harder", "keep"]);
    expect(offer.insight).toContain("Bài quiz gần nhất đạt 80%.");
    expect(offer.insight).toContain("Codi thấy bạn đã nắm vững Biến.");
    expect(offer.insight).toContain("Bạn còn chưa chắc về Mảng.");
  });

  it("returns null when no change option applies, so no card is shown", () => {
    const blank = input({
      concepts: [
        { id: 1, name: "Biến", probability: 0.9, evidenceCount: 2 },
        { id: 2, name: "Hàm", probability: null, evidenceCount: 0 },
        { id: 3, name: "Mảng", probability: null, evidenceCount: 0 },
      ],
    });
    expect(suggestAdjustment(blank, items(), facts({ codingLessonIds: new Set(), remedialLessonIds: new Set() }))).toBeNull();
  });

  it("returns null until the lesson is actually completed", () => {
    const open = input({
      lessons: input().lessons.map((l) => (l.id === L1 ? { ...l, progress: "in_progress" as const } : l)),
    });
    expect(suggestAdjustment(open, items(), facts())).toBeNull();
  });
});
