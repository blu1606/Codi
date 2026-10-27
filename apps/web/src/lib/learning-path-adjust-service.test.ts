import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assessments,
  courseLessons,
  courses,
  enrollmentSkillMastery,
  learningPathCompletions,
  learningPathJobs,
  personalizedLearningPaths,
  pathItems,
  studentEnrollments,
} from "@codi-1/db";
import { createLearningPathService, offerPathAdjustment } from "./learning-path-service";
import { LearningPathError } from "./learning-path-contract";

const authMocks = vi.hoisted(() => ({
  getActiveRoles: vi.fn().mockResolvedValue(["LEARNER"]),
}));
vi.mock("@codi-1/auth", () => ({
  requireRole: vi.fn().mockResolvedValue(undefined),
  getActiveRoles: (...args: unknown[]) => authMocks.getActiveRoles(...args),
  ROLE: { LEARNER: "LEARNER" },
}));

// In-memory store: a table router that serves the rows each query needs and applies writes.
// Where-clauses are not interpreted; each test holds a single enrollment, so that is safe.
let st: any;
const L1 = "00000000-0000-4000-8000-000000000001";
const L2 = "00000000-0000-4000-8000-000000000002";
const userId = "learner-1";
const courseId = "course-1";

function publication() {
  return {
    version: 1,
    publicationId: "publication-1",
    contentGeneration: 0,
    publishedAt: "2026-10-24T00:00:00.000Z",
    skills: [101, 102].map((id) => ({
      id,
      name: `Khái niệm ${id}`,
      bktPInit: 0.1,
      bktPLearn: 0.2,
      bktPGuess: 0.2,
      bktPSlip: 0.1,
    })),
    edges: [{ from: 101, to: 102 }],
    links: [
      { lessonId: L1, skillId: 101 },
      { lessonId: L2, skillId: 102 },
    ],
  };
}

function freshState(overrides: Record<string, unknown> = {}) {
  const enrollment = {
    id: 10,
    userId,
    courseId,
    status: "active",
    pathStatus: "ready",
    pathSource: "ai",
    goalEditing: false,
    learningGoal: "project",
    selfAssessedLevel: "new",
    weeklyGoalMinutes: 300,
    completedAt: null,
    diagnosticStatus: "skipped",
    diagnosticCardDismissedAt: null,
    goalSetAt: new Date("2026-10-20T00:00:00.000Z"),
  };
  return {
    enrollments: [enrollment],
    course: {
      id: courseId,
      title: "Khoá học",
      slug: "khoa-hoc",
      status: "published",
      knowledgeMapStatus: "confirmed",
      confirmedKnowledgeMap: publication(),
      knowledgeMapContentGeneration: 0,
    },
    lessons: [
      { id: L1, title: "Bài 1", durationSeconds: 600, progress: "completed", isRemedial: false },
      { id: L2, title: "Bài 2", durationSeconds: 800, progress: null, isRemedial: false },
    ],
    coding: [] as string[],
    // Mastery: concept 101 at p .9 (level 4), concept 102 at p .7 (level 3) -> L2 is fully mastered.
    mastery: [
      { enrollmentId: 10, skillId: 101, pMastery: 0.9, evidenceCount: 2, correctCount: 2 },
      { enrollmentId: 10, skillId: 102, pMastery: 0.7, evidenceCount: 2, correctCount: 2 },
    ],
    paths: [
      {
        id: 7,
        enrollmentId: 10,
        version: 1,
        status: "active",
        trigger: "lesson_completed",
        generatedBy: "ai",
        aiModel: "model-x",
        aiRationale: "Lộ trình AI",
        updateSummary: null,
        createdAt: new Date("2026-10-26T00:00:00.000Z"),
      },
    ] as any[],
    items: [
      { id: 1, pathId: 7, lessonId: L1, position: 1, isSkippable: false, reason: "Bài nền", estimatedMinutes: 10 },
      { id: 2, pathId: 7, lessonId: L2, position: 2, isSkippable: false, reason: "Bài tiếp", estimatedMinutes: 13 },
    ] as any[],
    jobs: [] as any[],
    writes: [] as { table: unknown; values: any }[],
    nextPathId: 8,
    ...overrides,
  };
}

const lessonRows = () =>
  st.lessons.map((l: any) => ({
    lesson: { id: l.id, chapterId: "ch", title: l.title, durationSeconds: l.durationSeconds, isPublished: true, position: 0 },
    chapter: { id: "ch", title: "Chương", position: 0, isPublished: true, courseId },
    progress: l.progress ? { status: l.progress, studiedAt: l.progress === "completed" ? new Date() : null, mediaProgress: {} } : null,
  }));

const activePath = () => st.paths.find((p: any) => p.status === "active") ?? null;

function rowsFor(table: unknown, selection?: Record<string, unknown>): any[] {
  if (table === studentEnrollments) return st.enrollments;
  if (table === courses) return [st.course];
  if (table === courseLessons) {
    if (selection && "lesson" in selection) return lessonRows();
    if (selection && "kind" in selection) return st.lessons.map((l: any) => ({ id: l.id, kind: "reading" }));
    return st.lessons.filter((l: any) => l.isRemedial).map((l: any) => ({ id: l.id }));
  }
  if (table === assessments) return st.coding.map((lessonId: string) => ({ lessonId }));
  if (table === enrollmentSkillMastery) return st.mastery;
  if (table === personalizedLearningPaths) {
    if (selection && "version" in selection)
      return [...st.paths].sort((a, b) => b.version - a.version);
    return st.paths.filter((p: any) => p.status === "active");
  }
  if (table === pathItems) return st.items.filter((i: any) => i.pathId === activePath()?.id);
  if (table === learningPathJobs) return st.jobs.filter((j: any) => !j.finishedAt);
  return [];
}

// Reads the numeric value compared with a given column (e.g. `version = n`) from a drizzle condition.
function columnValue(node: any, column: unknown): number | undefined {
  const chunks = node?.queryChunks;
  if (!Array.isArray(chunks)) return undefined;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (Array.isArray(chunk?.queryChunks)) {
      const nested = columnValue(chunk, column);
      if (nested !== undefined) return nested;
    } else if (chunk === column) {
      const param = chunks.slice(i + 1).find((c: any) => typeof c?.value === "number");
      if (param) return param.value;
    }
  }
  return undefined;
}

function chainFor(table: unknown, selection?: Record<string, unknown>) {
  let limit: number | undefined;
  let version: number | undefined;
  let pathId: number | undefined;
  const query: any = {};
  for (const name of ["innerJoin", "leftJoin", "orderBy", "for"]) query[name] = () => query;
  query.where = (condition: unknown) => {
    version = columnValue(condition, personalizedLearningPaths.version);
    pathId = columnValue(condition, pathItems.pathId);
    return query;
  };
  query.limit = (n: number) => {
    limit = n;
    return query;
  };
  query.then = (resolve: any, reject?: any) => {
    const rows =
      table === personalizedLearningPaths && !selection && version !== undefined
        ? st.paths.filter((p: any) => p.version === version)
        : table === pathItems && pathId !== undefined
          ? st.items.filter((i: any) => i.pathId === pathId)
          : rowsFor(table, selection);
    return Promise.resolve(limit === undefined ? rows : rows.slice(0, limit)).then(resolve, reject);
  };
  return query;
}

// Writes return an object that is both thenable and offers returning()/onConflict*().
function writeChain(table: unknown, values: any, run: () => any[]) {
  const result = () => run();
  const chain: any = {
    returning: async () => result(),
    onConflictDoNothing: () => ({ returning: async () => result() }),
    onConflictDoUpdate: async () => result(),
    then: (resolve: any, reject?: any) => Promise.resolve(result()).then(resolve, reject),
  };
  return chain;
}

const mockDb: any = {
  execute: vi.fn(async () => []),
  select: (selection?: Record<string, unknown>) => ({
    from: (table: unknown) => chainFor(table, selection),
  }),
  insert: (table: unknown) => ({
    values: (values: any) => {
      st.writes.push({ table, values });
      return writeChain(table, values, () => {
        if (table === personalizedLearningPaths) {
          for (const p of st.paths) if (p.status === "active") p.status = "superseded";
          const row = { id: st.nextPathId++, status: "active", updateSummary: null, ...values };
          st.paths.push(row);
          return [row];
        }
        if (table === pathItems) {
          const list = Array.isArray(values) ? values : [values];
          st.items.push(...list.map((v: any, i: number) => ({ id: 100 + st.items.length + i, ...v })));
          return list;
        }
        if (table === learningPathJobs) {
          const row = { id: 900 + st.jobs.length, finishedAt: null, ...values };
          st.jobs.push(row);
          return [row];
        }
        if (table === learningPathCompletions) return [];
        return [{ ...values }];
      });
    },
  }),
  update: (table: unknown) => ({
    set: (values: any) => ({
      where: async () => {
        if (table === learningPathJobs) {
          for (const job of st.jobs) if (!job.finishedAt) Object.assign(job, values);
        }
        if (table === personalizedLearningPaths) {
          for (const p of st.paths) if (p.status === "active") Object.assign(p, values);
        }
        if (table === studentEnrollments) Object.assign(st.enrollments[0], values);
        return [];
      },
    }),
  }),
  transaction: async (cb: any) => cb(mockDb),
};

const pendingCompletionJob = () => ({
  id: 901,
  enrollmentId: 10,
  inputHash: "hash",
  trigger: "lesson_completed",
  afterLessonId: L1,
  finishedAt: null,
  leaseToken: null,
  leaseExpiresAt: null,
  createdAt: new Date("2026-10-26T00:00:00.000Z"),
});

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.getActiveRoles.mockResolvedValue(["LEARNER"]);
  st = freshState();
});

describe("soft lock: prerequisites never block access", () => {
  it("opens a lesson whose prerequisite is not covered and reports the advisory", async () => {
    st.lessons[0].progress = null;
    st.mastery = [];
    const service = createLearningPathService(mockDb);
    await expect(service.assertLessonAccess(userId, courseId, L2)).resolves.toMatchObject({ id: L2 });
    const view = await service.get(userId, courseId);
    const row = view.rows.find((r) => r.id === L2)!;
    expect(row.status).toBe("locked");
    expect(row.lock).toMatchObject({ lessonId: L1, lessonTitle: "Bài 1" });
  });

  it("still rejects a caller who has no enrollment in the course (wrong owner)", async () => {
    st.enrollments = [];
    const service = createLearningPathService(mockDb);
    await expect(service.assertLessonAccess(userId, courseId, L2)).rejects.toMatchObject({ status: 403 });
  });
});

describe("adjust command", () => {
  it("applies skip-mastered as one new version, supersedes the completion job and offers nothing new", async () => {
    st.jobs.push(pendingCompletionJob());
    const service = createLearningPathService(mockDb);
    const view = await service.execute(userId, courseId, { type: "adjust", afterLessonId: L1, option: "skip-mastered" });

    const latest = activePath();
    expect(latest.version).toBe(2);
    expect(latest.trigger).toBe("manual");
    expect(latest.aiModel).toBe("model-x");
    expect(latest.updateSummary).toMatchObject({
      afterLessonId: L1,
      changes: [expect.objectContaining({ lessonId: L2, type: "now-skippable" })],
    });
    const l2 = st.items.filter((i: any) => i.pathId === latest.id).find((i: any) => i.lessonId === L2);
    expect(l2.isSkippable).toBe(true);
    expect(st.enrollments[0].pathSource).toBe("ai");
    expect(st.jobs[0].finishedAt).toBeInstanceOf(Date);
    expect(view.update?.changes).toHaveLength(1);
  });

  it("rejects a stale offer once its change is already applied", async () => {
    const service = createLearningPathService(mockDb);
    await service.execute(userId, courseId, { type: "adjust", afterLessonId: L1, option: "skip-mastered" });
    const versions = st.paths.length;
    await expect(
      service.execute(userId, courseId, { type: "adjust", afterLessonId: L1, option: "skip-mastered" }),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining("không còn phù hợp") });
    expect(st.paths.length).toBe(versions);
  });

  it("rejects while the path is not ready", async () => {
    st.enrollments[0].pathStatus = "generating";
    const service = createLearningPathService(mockDb);
    await expect(
      service.execute(userId, courseId, { type: "adjust", afterLessonId: L1, option: "skip-mastered" }),
    ).rejects.toBeInstanceOf(LearningPathError);
    expect(st.paths.length).toBe(1);
  });

  it("rejects an adjustment for a lesson the learner has not completed", async () => {
    const service = createLearningPathService(mockDb);
    await expect(
      service.execute(userId, courseId, { type: "adjust", afterLessonId: L2, option: "skip-mastered" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a wrong owner before any write", async () => {
    st.enrollments = [];
    const service = createLearningPathService(mockDb);
    await expect(
      service.execute(userId, courseId, { type: "adjust", afterLessonId: L1, option: "skip-mastered" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(st.writes).toEqual([]);
  });

  it("apply then undo restores the previous active version as a new version", async () => {
    const service = createLearningPathService(mockDb);
    await service.execute(userId, courseId, { type: "adjust", afterLessonId: L1, option: "skip-mastered" });
    const adjusted = activePath();
    expect(adjusted.version).toBe(2);
    expect(st.items.filter((i: any) => i.pathId === adjusted.id).find((i: any) => i.lessonId === L2).isSkippable).toBe(true);

    await service.execute(userId, courseId, { type: "undo-adjust", pathId: adjusted.id });

    const restored = activePath();
    expect(restored.version).toBe(3);
    expect(restored.trigger).toBe("manual");
    expect(restored.updateSummary.changes).toEqual([]);
    expect(st.paths.find((p: any) => p.id === 7).status).toBe("superseded");
    const restoredItems = st.items
      .filter((i: any) => i.pathId === restored.id)
      .sort((a: any, b: any) => a.position - b.position);
    expect(restoredItems.map((i: any) => i.lessonId)).toEqual([L1, L2]);
    expect(restoredItems.find((i: any) => i.lessonId === L2).isSkippable).toBe(false);
  });

  it("keep is a no-op that writes nothing", async () => {
    const service = createLearningPathService(mockDb);
    await service.execute(userId, courseId, { type: "adjust", afterLessonId: L1, option: "keep" });
    expect(st.writes).toEqual([]);
    expect(st.paths).toHaveLength(1);
  });

  it("undo is refused for a path that is not the just-adjusted one", async () => {
    const service = createLearningPathService(mockDb);
    await expect(service.execute(userId, courseId, { type: "undo-adjust", pathId: 7 })).rejects.toMatchObject({ status: 409 });
  });
});

describe("AI regeneration after an applied adjustment", () => {
  it("drops a pending completion regeneration so it cannot overwrite the adjustment", async () => {
    st.jobs.push(pendingCompletionJob());
    const generator = vi.fn();
    const service = createLearningPathService(mockDb, generator);
    await service.execute(userId, courseId, { type: "adjust", afterLessonId: L1, option: "skip-mastered" });
    const adjusted = activePath().id;
    await service.runPending(userId, courseId);
    expect(generator).not.toHaveBeenCalled();
    expect(activePath().id).toBe(adjusted);
    expect(st.jobs.every((j: any) => j.finishedAt)).toBe(true);
  });

  it("offers the completion options from the current state without writing", async () => {
    const offer = await offerPathAdjustment(mockDb, userId, courseId, L1, null);
    expect(offer?.options.map((o) => o.type)).toEqual(["skip-mastered", "keep"]);
    expect(st.writes).toEqual([]);
  });
});
