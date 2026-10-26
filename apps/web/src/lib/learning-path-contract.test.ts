import { describe, expect, it } from "vitest";
import {
  constrainPath,
  generationOutcome,
  graphLayers,
  learningPathCommand,
  levelOf,
  lockInfo,
  pathDiff,
  pathProposal,
  selectPath,
  type PathInput,
  type PathProposal,
} from "./learning-path-contract";

const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
];
function input(): PathInput {
  return {
    goal: "project",
    level: "new",
    hours: 5,
    previous: [],
    concepts: [1, 2, 3].map((id) => ({
      id,
      name: `Khái niệm ${id}`,
      probability: null,
      evidenceCount: 0,
    })),
    lessons: ids.map((id, i) => ({
      id,
      title: `Bài ${i + 1}`,
      chapterId: "chapter",
      chapterTitle: "Chương",
      skillIds: [i + 1],
      durationSeconds: 600,
      progress: "not_started",
      studied: false,
    })),
    edges: [
      { from: 1, to: 2 },
      { from: 2, to: 3 },
    ],
  };
}
const proposal = (order = [...ids].reverse()): PathProposal => ({
  rationale: "Ôn phần còn thiếu",
  lessons: order.map((lessonId) => ({
    lessonId,
    reason: "Phù hợp mục tiêu",
    isSkippable: true,
  })),
});

describe("hard prerequisite path scheduling", () => {
  it("settles generating to ready with AI reasons and a prerequisite-safe order", () => {
    const result = generationOutcome(input(), proposal());
    expect(result).toMatchObject({
      status: "ready",
      source: "ai",
      generatedBy: "ai",
    });
    expect(result.items.map((p) => p.lessonId)).toEqual(ids);
  });
  it("settles an empty valid AI plan to ready/default without pretending it was personalised", () => {
    expect(
      generationOutcome(input(), { rationale: "Chưa có đề xuất", lessons: [] }),
    ).toMatchObject({
      status: "ready",
      source: "default",
      generatedBy: "system",
    });
  });
  it.each([undefined, { malformed: true }, proposal([ids[0]!, ids[0]!])])(
    "settles invalid/failed generation to a usable system fallback",
    (value) => {
      const result = generationOutcome(input(), value);
      expect(result).toMatchObject({
        status: "failed",
        source: "default",
        generatedBy: "system",
      });
      expect(result.items.map((p) => p.lessonId)).toEqual(ids);
      expect(result.items.every((p) => !p.isSkippable)).toBe(true);
    },
  );
  it("provider timeout ignores even a seemingly valid result and keeps completed lessons", () => {
    const ctx = input();
    ctx.lessons[0]!.progress = "completed";
    expect(generationOutcome(ctx, proposal(), true).status).toBe("failed");
    expect(ctx.lessons[0]!.progress).toBe("completed");
  });
  it.each([
    [undefined, true],
    [{ malformed: true }, false],
    [proposal([ids[0]!, ids[0]!]), false],
    [proposal(["10000000-0000-4000-8000-000000000000"]), false],
    [{ rationale: "Không có đề xuất", lessons: [] }, false],
  ])(
    "keeps ready/ai, AI order, reasons and skips when a completion replan fails",
    (value, failed) => {
      const ctx = input();
      ctx.concepts.forEach((c) => {
        c.probability = 0.9;
        c.evidenceCount = 2;
      });
      ctx.previous = constrainPath(ctx, proposal());
      ctx.lessons[2]!.progress = "completed";
      const result = generationOutcome(ctx, value, failed as boolean, true);
      expect(result).toMatchObject({
        status: "ready",
        source: "ai",
        generatedBy: "ai",
      });
      expect(result.items).toEqual(ctx.previous);
      expect(result.items.some((p) => p.isSkippable)).toBe(true);
    },
  );
  it("rechecks mastery and published lessons while retaining a failed AI replan", () => {
    const ctx = input();
    ctx.edges = [];
    ctx.concepts.forEach((c) => {
      c.probability = 0.9;
      c.evidenceCount = 1;
    });
    ctx.previous = constrainPath(ctx, proposal());
    ctx.lessons.pop();
    ctx.concepts[0]!.probability = 0.1;
    const result = generationOutcome(ctx, undefined, true, true);
    expect(result.items.map((p) => p.lessonId)).toEqual([ids[1], ids[0]]);
    expect(result.items.find((p) => p.lessonId === ids[0])!.isSkippable).toBe(
      false,
    );
    expect(result.items.find((p) => p.lessonId === ids[1])!.isSkippable).toBe(
      true,
    );
  });
  it("corrects an AI reverse order and refuses skipping without evidence", () => {
    const items = constrainPath(input(), proposal());
    expect(items.map((p) => p.lessonId)).toEqual(ids);
    expect(items.every((p) => !p.isSkippable)).toBe(true);
  });
  it("preserves every published lesson when AI omits it, including newly added lessons", () => {
    const ctx = input();
    ctx.previous = [{ lessonId: ids[0]!, reason: "Cũ", isSkippable: false }];
    expect(
      constrainPath(ctx, proposal([ids[1]!])).map((p) => p.lessonId),
    ).toEqual(ids);
    expect(selectPath(ctx, ctx.previous, "ai").rows).toHaveLength(3);
  });
  it("allows prerequisite mastery >=3, but requires all taught skills before skipping", () => {
    const ctx = input();
    ctx.concepts.forEach((c) => {
      c.probability = 0.6;
      c.evidenceCount = 2;
    });
    expect(constrainPath(ctx, proposal()).map((p) => p.lessonId)).toEqual(
      [...ids].reverse(),
    );
    expect(constrainPath(ctx, proposal()).every((p) => p.isSkippable)).toBe(
      true,
    );
    ctx.lessons[0]!.skillIds.push(99);
    expect(
      constrainPath(ctx, proposal()).find((p) => p.lessonId === ids[0])!
        .isSkippable,
    ).toBe(false);
  });
  it("freezes completed rows and their metadata while only replanning unfinished rows", () => {
    const ctx = input();
    ctx.previous = ids.map((lessonId) => ({
      lessonId,
      reason: "Đã lưu",
      isSkippable: false,
    }));
    ctx.lessons[0]!.progress = "completed";
    expect(constrainPath(ctx, proposal())[0]).toEqual(ctx.previous[0]);
    expect(ctx.lessons[0]!.progress).toBe("completed");
  });
  it.each([
    proposal([ids[0]!, ids[0]!]),
    proposal(["10000000-0000-4000-8000-000000000000"]),
  ])("rejects duplicate or foreign model lessons", (invalid) =>
    expect(() => constrainPath(input(), invalid)).toThrow(/không hợp lệ/),
  );
  it("rejects cyclic scheduling and graph layers instead of inventing an unlock", () => {
    const ctx = input();
    ctx.edges.push({ from: 3, to: 1 });
    expect(() => constrainPath(ctx, proposal())).toThrow(/tiên quyết/);
    expect(() => graphLayers([1, 2, 3], ctx.edges)).toThrow(/giảng viên/);
  });
});

describe("lesson states and completion", () => {
  it("renders next and locked rows and explains the missing prerequisite", () => {
    const ctx = input();
    const rows = selectPath(ctx, constrainPath(ctx), "default");
    expect(rows.rows.map((r) => r.status)).toEqual([
      "next",
      "locked",
      "locked",
    ]);
    expect(rows.rows[1]!.lock).toMatchObject({
      concept: "Khái niệm 1",
      lessonId: ids[0],
    });
    expect(rows.currentLessonId).toBe(ids[0]);
    expect(rows.complete).toBe(false);
  });
  it("unlocks through a completed prerequisite and preserves done even after later mastery falls", () => {
    const ctx = input();
    ctx.lessons[0]!.progress = "completed";
    ctx.lessons[1]!.progress = "in_progress";
    expect(
      selectPath(ctx, constrainPath(ctx), "ai").rows.map((r) => r.status),
    ).toEqual(["done", "active", "locked"]);
    expect(lockInfo(ctx, ctx.lessons[1]!)).toBeNull();
  });
  it("ignores a prerequisite taught in the same lesson or without a teaching lesson", () => {
    const ctx = input();
    ctx.lessons[1]!.skillIds.push(1);
    expect(lockInfo(ctx, ctx.lessons[1]!)).toBeNull();
    ctx.lessons[1]!.skillIds = [2];
    ctx.lessons[0]!.skillIds = [];
    expect(lockInfo(ctx, ctx.lessons[1]!)).toBeNull();
  });
  it("prefers a required lesson over skippable lessons, and still lets the learner review them", () => {
    const ctx = input();
    ctx.edges = [];
    ctx.concepts[0] = {
      id: 1,
      name: "Known",
      probability: 0.85,
      evidenceCount: 1,
    };
    const items = constrainPath(ctx, proposal(ids));
    const selected = selectPath(ctx, items, "ai");
    expect(selected.rows.map((r) => r.status)).toEqual([
      "skippable",
      "next",
      "todo",
    ]);
    expect(selected.currentLessonId).toBe(ids[1]);
    expect(selected.complete).toBe(false);
    ctx.lessons[1]!.progress = "completed";
    ctx.lessons[2]!.progress = "completed";
    expect(selectPath(ctx, items, "ai").complete).toBe(true);
    expect(selectPath(ctx, items, "default").complete).toBe(false);
  });
  it("never reports an empty course complete and never loses added lesson rows", () => {
    const ctx = input();
    ctx.lessons = [];
    expect(selectPath(ctx, [], "default")).toMatchObject({
      complete: false,
      percent: 0,
      total: 0,
    });
  });
  it("records moved and newly-skippable rows, never highlighting completed rows", () => {
    const ctx = input();
    ctx.edges = [];
    ctx.previous = ids.map((lessonId) => ({
      lessonId,
      reason: "cũ",
      isSkippable: false,
    }));
    ctx.lessons[0]!.progress = "completed";
    ctx.concepts[2]!.probability = 0.9;
    ctx.concepts[2]!.evidenceCount = 1;
    const diff = pathDiff(ctx, constrainPath(ctx, proposal()));
    expect(diff.map((c) => c.type)).toEqual(["moved-up", "now-skippable"]);
    expect(diff.every((c) => c.lessonId === ids[2])).toBe(true);
  });
});

describe("D16 and untrusted request boundaries", () => {
  it.each([
    [null, 0, 0],
    [0.2, 0, 0],
    [0.39, 1, 1],
  ] as const)(
    "maps probability %s with %s evidence to stop %s",
    (probability, evidenceCount, expected) =>
      expect(
        levelOf({ id: 1, name: "Skill", probability, evidenceCount }),
      ).toBe(expected),
  );
  it("excludes injected ownership, arbitrary state writes and completion commands", () => {
    for (const command of [
      { type: "sync", userId: "victim" },
      { type: "retry", pathSource: "ai" },
      { type: "complete", lessonId: ids[0] },
      { type: "review", rating: 0, text: "" },
      { type: "ack-highlights", pathId: -1 },
    ])
      expect(learningPathCommand.safeParse(command).success).toBe(false);
  });
  it("validates structured AI output and layers a branching DAG", () => {
    expect(pathProposal.safeParse(proposal()).success).toBe(true);
    expect(pathProposal.safeParse({ ...proposal(), score: 100 }).success).toBe(
      false,
    );
    expect(
      graphLayers(
        [1, 2, 3, 4],
        [
          { from: 1, to: 3 },
          { from: 2, to: 3 },
          { from: 3, to: 4 },
        ],
      ),
    ).toEqual([[1, 2], [3], [4]]);
  });
});
