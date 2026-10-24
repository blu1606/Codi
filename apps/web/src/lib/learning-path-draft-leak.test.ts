import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  courseChapters,
  courseLessons,
  courses,
  lessonProgress,
  lessonSkills,
  personalizedLearningPaths,
  skillPrerequisites,
  skills,
  studentEnrollments,
  assessmentSubmissions,
  learningPathEvidence,
  enrollmentSkillMastery,
  learningPathJobs,
  user as users,
} from "@codi-1/db";
import { createLearningPathService } from "./learning-path-service";
import { createLearnerOverviewService } from "./learner-overview-service";

const mockTransaction = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

const mockDb: any = {
  execute: vi.fn(),
  select: (...args: any[]) => mockSelect(...args),
  insert: (...args: any[]) => mockInsert(...args),
  update: (...args: any[]) => mockUpdate(...args),
  transaction: (cb: any) => mockTransaction(cb),
};

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn().mockResolvedValue(undefined),
  getActiveRoles: vi.fn().mockResolvedValue(["LEARNER"]),
}));

vi.mock("@codi-1/auth", () => ({
  requireRole: (...args: any[]) => authMocks.requireRole(...args),
  getActiveRoles: (...args: any[]) => authMocks.getActiveRoles(...args),
  ROLE: { LEARNER: "LEARNER" },
}));

describe("learning path draft leakage guard (PO policy)", () => {
  let mapStatus: "empty" | "ready" | "confirmed" | "stale" = "ready";
  let published: any = null;
  let observations: any[] = [];
  let writes: { table: unknown; values: any }[] = [];
  let applied: boolean;
  let pathStatus: string;
  let job: any;
  let contentGeneration: number;
  const courseId = "course-1";
  const userId = "learner-1";
  const enrollmentId = 10;
  const lesson1Id = "00000000-0000-4000-8000-000000000001";
  const lesson2Id = "00000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    vi.resetAllMocks();
    authMocks.getActiveRoles.mockResolvedValue(["LEARNER"]);
    mapStatus = "ready";
    published = null;
    observations = [];
    writes = [];
    applied = false;
    pathStatus = "ready";
    job = null;
    contentGeneration = 0;
    mockUpdate.mockImplementation((table: unknown) => ({ set: (values: any) => ({ where: async () => {
      if (table === learningPathJobs && job) Object.assign(job, values);
      return [];
    } }) }));
    mockInsert.mockImplementation((table: unknown) => ({ values: (values: any) => {
      if (table === learningPathJobs) {
        job = { id: "job-1", ...values };
        writes.push({ table, values });
      }
      if (table === personalizedLearningPaths) writes.push({ table, values });
      return {
        returning: async () => [{ id: 1, ...values }],
        onConflictDoNothing: () => ({ returning: async () => {
          if (table === learningPathEvidence && applied) return [];
          if (table === learningPathEvidence) applied = true;
          writes.push({ table, values });
          return [{}];
        } }),
        onConflictDoUpdate: async () => { writes.push({ table, values }); return []; },
      };
    } }));

    mockTransaction.mockImplementation(async (cb: any) => cb(mockDb));

    mockSelect.mockImplementation((selection?: any) => {
      const chain: any = {
        from: vi.fn().mockImplementation((table: any) => {
          let rows: any[] = [];

          if (table === studentEnrollments) {
            if (selection?.title) {
              rows = [{ id: courseId, title: "Khóa học TypeScript" }];
            } else {
              rows = [
                {
                  id: enrollmentId,
                  userId,
                  courseId,
                  status: "active",
                  pathStatus,
                  pathSource: "default",
                  learningGoal: "project",
                  selfAssessedLevel: "new",
                  weeklyGoalMinutes: 300,
                  enrolledAt: new Date("2026-10-24T00:00:00.000Z"),
                },
              ];
              if (selection?.enrollment) {
                rows = [{ enrollment: rows[0], course: { id: courseId, title: "Course", slug: "course",
                  status: "published", knowledgeMapStatus: mapStatus, confirmedKnowledgeMap: published }, cover: null }];
              }
            }
          } else if (table === courses) {
            rows = [
              {
                id: courseId,
                title: "Khóa học TypeScript",
                slug: "typescript",
                status: "published",
                knowledgeMapStatus: mapStatus,
                confirmedKnowledgeMap: published,
                knowledgeMapContentGeneration: contentGeneration,
              },
            ];
          } else if (table === courseLessons) {
            rows = [
              {
                courseId,
                lesson: {
                  id: lesson1Id,
                  chapterId: "ch-1",
                  title: "Bài 1: Cơ bản",
                  durationSeconds: 600,
                  isPublished: true,
                  position: 0,
                },
                chapter: {
                  id: "ch-1",
                  title: "Chương 1",
                  position: 0,
                  isPublished: true,
                },
                progress: { status: "not_started", studiedAt: null },
              },
              {
                courseId,
                lesson: {
                  id: lesson2Id,
                  chapterId: "ch-1",
                  title: "Bài 2: Nâng cao",
                  durationSeconds: 800,
                  isPublished: true,
                  position: 1,
                },
                chapter: {
                  id: "ch-1",
                  title: "Chương 1",
                  position: 0,
                  isPublished: true,
                },
                progress: { status: "not_started", studiedAt: null },
              },
            ];
          } else if (table === skills) {
            rows = [
              {
                skill: {
                  id: 101,
                  courseId,
                  name: "Khái niệm Draft A",
                  review: "accepted",
                },
                mastery: null,
              },
              {
                skill: {
                  id: 102,
                  courseId,
                  name: "Khái niệm Draft B",
                  review: "accepted",
                },
                mastery: null,
              },
            ];
          } else if (table === skillPrerequisites) {
            rows = [
              {
                skillId: 102,
                prerequisiteSkillId: 101,
                review: "accepted",
              },
            ];
          } else if (table === lessonSkills) {
            rows = [
              { lessonId: lesson1Id, skillId: 101 },
              { lessonId: lesson2Id, skillId: 102 },
            ];
          } else if (table === personalizedLearningPaths) {
            rows = [];
          } else if (table === assessmentSubmissions && selection?.key) {
            rows = applied ? [] : observations;
          } else if (table === learningPathJobs) {
            rows = job && !job.finishedAt ? [job] : [];
          } else if (table === users) {
            rows = [{ name: "Learner", banned: false }];
          }

          const query: any = {};
          query.innerJoin = vi.fn().mockReturnValue(query);
          query.leftJoin = vi.fn().mockReturnValue(query);
          query.where = vi.fn().mockImplementation(() => query);
          query.orderBy = vi.fn().mockImplementation(() => query);
          query.for = vi.fn().mockImplementation(() => query);
          query.limit = vi.fn().mockImplementation(() => query);
          query.then = (resolve: any, reject?: any) => Promise.resolve(rows).then(resolve, reject);
          return query;
        }),
      };
      return chain;
    });
  });

  it("không rò rỉ draft skills và edges sang learner khi knowledgeMapStatus !== confirmed", async () => {
    mapStatus = "ready";
    const service = createLearningPathService(mockDb);

    // 1. Kiểm tra màn hình bản đồ kiến thức của học viên
    const kmap = await service.getKnowledgeMap(userId, courseId);
    expect(kmap.confirmed).toBe(false);
    expect(kmap.nodes).toEqual([]);
    expect(kmap.edges).toEqual([]);

    // 2. Kiểm tra lộ trình học: không dùng draft skills
    const pathView = await service.get(userId, courseId);
    expect(pathView.rows).toHaveLength(2);

    // Bài 2 không bị khoá bởi quan hệ tiên quyết draft giữa 101 và 102
    const lesson2 = pathView.rows.find((i) => i.lessonId === lesson2Id);
    expect(lesson2?.status).not.toBe("locked");
  });

  it("tải đầy đủ đồ thị kiến thức cho learner khi knowledgeMapStatus === confirmed", async () => {
    mapStatus = "confirmed";
    published = publication();
    const service = createLearningPathService(mockDb);

    // 1. Kiểm tra màn hình bản đồ kiến thức của học viên
    const kmap = await service.getKnowledgeMap(userId, courseId);
    expect(kmap.confirmed).toBe(true);
    expect(kmap.nodes.length).toBeGreaterThan(0);
    expect(kmap.edges.length).toBeGreaterThan(0);

    // 2. Kiểm tra lộ trình học: áp dụng điều kiện tiên quyết từ bản đồ đã xác nhận
    const pathView = await service.get(userId, courseId);
    const lesson2 = pathView.rows.find((i) => i.lessonId === lesson2Id);
    expect(lesson2?.status).toBe("locked");
  });

  function publication() {
    return {
      version: 1, publicationId: "publication-1", contentGeneration: 0,
      publishedAt: "2026-10-24T00:00:00.000Z",
      skills: [101, 102].map((id) => ({ id, name: `Published ${id}`,
        bktPInit: 0.1, bktPLearn: 0.2, bktPGuess: 0.2, bktPSlip: 0.1 })),
      edges: [{ from: 101, to: 102 }],
      links: [{ lessonId: lesson1Id, skillId: 101 }, { lessonId: lesson2Id, skillId: 102 }],
    };
  }

  it.each(["ready", "stale"] as const)("retains published names and prerequisite locks during %s draft edits", async (status) => {
    mapStatus = status;
    published = publication();
    const service = createLearningPathService(mockDb);
    const graph = await service.getKnowledgeMap(userId, courseId);
    expect(graph.confirmed).toBe(true);
    expect(graph.nodes.map((node) => node.name)).toEqual(["Published 101", "Published 102"]);
    expect((await service.get(userId, courseId)).rows.find((row) => row.lessonId === lesson2Id)?.status).toBe("locked");
  });

  it("does not bless legacy confirmed rows without an explicit payload", async () => {
    mapStatus = "confirmed";
    const graph = await createLearningPathService(mockDb).getKnowledgeMap(userId, courseId);
    expect(graph.confirmed).toBe(false);
    expect(graph.nodes).toEqual([]);
  });

  it("leaves ordinary graded evidence unconsumed until a trusted mapping exists, then applies it once", async () => {
    observations = [{ submissionId: 20, submittedAt: new Date(), key: "question:30", lessonId: lesson1Id,
      correct: true, position: 0, questionId: 30 }];
    const service = createLearningPathService(mockDb);
    await service.execute(userId, courseId, { type: "sync" });
    expect(writes.filter((write) => write.table === learningPathEvidence)).toEqual([]);
    expect(writes.filter((write) => write.table === enrollmentSkillMastery)).toEqual([]);
    published = publication();
    await service.execute(userId, courseId, { type: "sync" });
    expect(writes.filter((write) => write.table === learningPathEvidence)).toHaveLength(1);
    expect(writes.filter((write) => write.table === enrollmentSkillMastery)).toHaveLength(1);
    await service.execute(userId, courseId, { type: "sync" });
    expect(writes.filter((write) => write.table ===enrollmentSkillMastery)).toHaveLength(1);
  });

  it.each(["publication", "content"])("does not publish a worker result if %s generation changes during provider work", async (generation) => {
    pathStatus = "generating";
    published = publication();
    let release!: (value: any) => void;
    let started!: () => void;
    const atProvider = new Promise<void>((resolve) => { started = resolve; });
    const generator = vi.fn(async () => {
      started();
      return new Promise<any>((resolve) => { release = resolve; });
    });
    const service = createLearningPathService(mockDb, generator);
    const pending = service.runPending(userId, courseId);
    await atProvider;
    if (generation === "publication") published = { ...published, publicationId: "publication-2" };
    else contentGeneration++;
    release({ model: "test-provider", proposal: { rationale: "A path", lessons: [] } });
    await pending;
    expect(writes.filter((write) => write.table === personalizedLearningPaths)).toEqual([]);
    expect(generator).toHaveBeenCalledOnce();
  });

  it("keeps dashboard overview names and locks aligned with the published path during edits", async () => {
    published = publication();
    const result = await createLearnerOverviewService(mockDb).get(userId);
    expect(result.courses[0]?.skills.map((skill) => skill.name)).toEqual(["Published 101", "Published 102"]);
    expect(result.courses[0]?.lessons.find((lesson) => lesson.id === lesson2Id)?.status).toBe("locked");
    published = null;
    expect((await createLearnerOverviewService(mockDb).get(userId)).courses[0]?.skills).toEqual([]);
  });
});
