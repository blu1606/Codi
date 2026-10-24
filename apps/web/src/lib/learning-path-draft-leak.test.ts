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
} from "@codi-1/db";
import { createLearningPathService } from "./learning-path-service";

const mockTransaction = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

const mockDb: any = {
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
  const courseId = "course-1";
  const userId = "learner-1";
  const enrollmentId = 10;
  const lesson1Id = "00000000-0000-4000-8000-000000000001";
  const lesson2Id = "00000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    vi.resetAllMocks();
    authMocks.getActiveRoles.mockResolvedValue(["LEARNER"]);
    mapStatus = "ready";

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
                  pathStatus: "ready",
                  pathSource: "default",
                  learningGoal: "project",
                  selfAssessedLevel: "new",
                  weeklyGoalMinutes: 300,
                },
              ];
            }
          } else if (table === courses) {
            rows = [
              {
                id: courseId,
                title: "Khóa học TypeScript",
                slug: "typescript",
                status: "published",
                knowledgeMapStatus: mapStatus,
              },
            ];
          } else if (table === courseLessons) {
            rows = [
              {
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
});
