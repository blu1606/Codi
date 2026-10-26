import { PgDialect } from "drizzle-orm/pg-core";
import { courseChapters, courseLessons, courses, skills } from "@codi-1/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getKnowledgeMapData, runKnowledgeMapAnalysis, type KnowledgeMapDataDto } from "./actions";

const boundary = vi.hoisted(() => ({
  session: vi.fn(), role: vi.fn(), select: vi.fn(),
  insert: vi.fn(), update: vi.fn(), remove: vi.fn(), notify: vi.fn(), refresh: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => boundary.refresh(...args) }));
vi.mock("@codi-1/auth", () => ({
  ROLE: { LECTURER: "LECTURER" }, requireRole: (...args: unknown[]) => boundary.role(...args),
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: (...args: unknown[]) => boundary.session(...args) } },
  db: { select: (...args: unknown[]) => boundary.select(...args), insert: boundary.insert, update: boundary.update, delete: boundary.remove,
    transaction: (callback: any) => callback({ select: boundary.select, insert: boundary.insert, update: boundary.update, execute: vi.fn() }),
  },
}));
vi.mock("@/lib/notification-service", () => ({ createNotificationService: () => ({ notify: boundary.notify }) }));

type MapStatus = KnowledgeMapDataDto["course"]["knowledgeMapStatus"];
const statuses: MapStatus[] = ["empty", "ready", "analysing", "failed", "confirmed", "stale"];
const generatedAt = new Date("2026-10-19T00:00:00Z");
let storedCourse: {
  id: string; title: string; instructorId: string; status: string;
  knowledgeMapStatus: MapStatus; knowledgeMapGeneratedAt: Date | null;
  confirmedKnowledgeMap?: object | null;
  knowledgeMapContentGeneration?: number;
  knowledgeMapAnalysisGeneration?: number | null;
} | undefined;
let chapters: { id: string; title: string; position: number }[];
let lessons: { id: string; chapterId: string; title: string; position: number }[];
const reads: { table: unknown; sql: string; params: unknown[] }[] = [];

function expectReadOnly() {
  expect(boundary.insert).not.toHaveBeenCalled();
  expect(boundary.update).not.toHaveBeenCalled();
  expect(boundary.remove).not.toHaveBeenCalled();
  expect(boundary.notify).not.toHaveBeenCalled();
  expect(boundary.refresh).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  reads.length = 0;
  storedCourse = {
    id: "owned", title: "First course", instructorId: "lecturer", status: "draft",
    knowledgeMapStatus: "empty", knowledgeMapGeneratedAt: null,
  };
  chapters = [{ id: "chapter-1", title: "Chapter", position: 0 }];
  lessons = [];
  boundary.session.mockResolvedValue({ user: { id: "lecturer" } });
  boundary.role.mockResolvedValue(undefined);
  boundary.select.mockImplementation(() => ({
    from: (table: unknown) => ({
      where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        reads.push({ table, ...new PgDialect().sqlToQuery(condition) });
        const rows = table === courses ? (storedCourse ? [storedCourse] : [])
          : table === courseChapters ? chapters : table === courseLessons ? lessons : [];
        return Object.assign(Promise.resolve(rows), { orderBy: async () => rows });
      },
    }),
  }));
});

describe("knowledge map content availability", () => {
  it.each([[0, null, false], [1, null, true], [2, 1, true], [2, 2, false]] as const)(
    "projects confirmation availability for content %s / analysis %s without stamping a generation", async (content, analysis, unavailable) => {
      storedCourse!.knowledgeMapStatus = "ready";
      storedCourse!.knowledgeMapContentGeneration = content;
      storedCourse!.knowledgeMapAnalysisGeneration = analysis;
      lessons.push({ id: "lesson-1", chapterId: "chapter-1", title: "Lesson", position: 0 });
      expect((await getKnowledgeMapData("owned")).course.confirmationUnavailable).toBe(unavailable);
      expect(storedCourse!.knowledgeMapAnalysisGeneration).toBe(analysis);
      expectReadOnly();
    },
  );
  it("projects an empty map to ready after its first lesson exists without fabricating analysis", async () => {
    const before = await getKnowledgeMapData("owned");
    expect(before.course.knowledgeMapStatus).toBe("empty");
    lessons.push({ id: "lesson-1", chapterId: "chapter-1", title: "First lesson", position: 0 });
    const after = await getKnowledgeMapData("owned");
    expect(after.course.knowledgeMapStatus).toBe("ready");
    expect(after.lessons).toEqual([{ id: "lesson-1", chapterId: "chapter-1", title: "First lesson" }]);
    expect(after.concepts).toEqual([]);
    expect(after.edges).toEqual([]);
    expect(after.course.knowledgeMapGeneratedAt).toBeNull();
    expect(storedCourse!.knowledgeMapStatus).toBe("empty");
    expectReadOnly();
  });

  it("returns to empty when the last lesson is removed and becomes ready if a lesson returns", async () => {
    lessons.push({ id: "lesson-1", chapterId: "chapter-1", title: "First lesson", position: 0 });
    expect((await getKnowledgeMapData("owned")).course.knowledgeMapStatus).toBe("ready");
    const removed = lessons.pop()!;
    expect((await getKnowledgeMapData("owned")).course.knowledgeMapStatus).toBe("empty");
    lessons.push(removed);
    expect((await getKnowledgeMapData("owned")).course.knowledgeMapStatus).toBe("ready");
    expectReadOnly();
  });

  it.each(statuses.filter((status) => status !== "empty"))("preserves %s when lessons exist", async (status) => {
    storedCourse!.knowledgeMapStatus = status;
    storedCourse!.knowledgeMapGeneratedAt = generatedAt;
    if (status === "confirmed") storedCourse!.confirmedKnowledgeMap = {
      version: 1, publicationId: "published-1", contentGeneration: 0, publishedAt: generatedAt.toISOString(),
      skills: [{ id: 101, name: "Concept", bktPInit: 0.1, bktPLearn: 0.2, bktPGuess: 0.2, bktPSlip: 0.1 }],
      edges: [], links: [{ lessonId: "lesson-1", skillId: 101 }],
    };
    lessons.push({ id: "lesson-1", chapterId: "chapter-1", title: "First lesson", position: 0 });
    const data = await getKnowledgeMapData("owned");
    expect(data.course.knowledgeMapStatus).toBe(status);
    expect(data.course.knowledgeMapGeneratedAt).toBe(generatedAt);
    expectReadOnly();
  });

  it.each(statuses)("keeps no-lesson courses empty when the stored status is %s", async (status) => {
    storedCourse!.knowledgeMapStatus = status;
    expect((await getKnowledgeMapData("owned")).course.knowledgeMapStatus).toBe("empty");
    expectReadOnly();
  });
  it("offers explicit reconfirmation for legacy confirmed status without silently publishing draft rows", async () => {
    storedCourse!.knowledgeMapStatus = "confirmed";
    storedCourse!.confirmedKnowledgeMap = null;
    lessons.push({ id: "lesson-1", chapterId: "chapter-1", title: "First lesson", position: 0 });
    const data = await getKnowledgeMapData("owned");
    expect(data.course.knowledgeMapStatus).toBe("ready");
    expect(data.course.requiresReconfirmation).toBe(true);
    expect(storedCourse!.knowledgeMapStatus).toBe("confirmed");
    expect(storedCourse!.confirmedKnowledgeMap).toBeNull();
    expectReadOnly();
  });

  it("does not read lessons when no owned chapters exist", async () => {
    chapters = [];
    lessons.push({ id: "foreign-lesson", chapterId: "foreign-chapter", title: "Unrelated", position: 0 });
    expect((await getKnowledgeMapData("owned")).course.knowledgeMapStatus).toBe("empty");
    expect(reads.some((read) => read.table === courseLessons)).toBe(false);
    expectReadOnly();
  });

  it("scopes availability reads through the authorized course and its chapters", async () => {
    lessons.push({ id: "lesson-1", chapterId: "chapter-1", title: "First lesson", position: 0 });
    await getKnowledgeMapData("owned");
    expect(reads.find((read) => read.table === courses)?.params).toEqual(["owned", "lecturer"]);
    expect(reads.find((read) => read.table === courses)?.sql).toContain('"courses"."instructor_id"');
    expect(reads.find((read) => read.table === courseChapters)?.params).toEqual(["owned"]);
    expect(reads.find((read) => read.table === courseLessons)?.params).toEqual(["chapter-1"]);
    expect(reads.find((read) => read.table === skills)?.params).toEqual(["owned"]);
    expectReadOnly();
  });

  it("keeps a pending course read-only even when empty is projected to ready", async () => {
    storedCourse!.status = "pending";
    lessons.push({ id: "lesson-1", chapterId: "chapter-1", title: "First lesson", position: 0 });
    const data = await getKnowledgeMapData("owned");
    expect(data.course.knowledgeMapStatus).toBe("ready");
    expect(data.isLocked).toBe(true);
    await expect(runKnowledgeMapAnalysis("owned")).rejects.toThrow("Khoá học đang chờ duyệt — nội dung chỉ đọc.");
    expectReadOnly();
  });

  it("rejects analysis with no lessons before writes", async () => {
    await expect(runKnowledgeMapAnalysis("owned")).rejects.toThrow("Phân tích AI chưa khả dụng");
    expectReadOnly();
  });

  it("rejects an unowned course before reading content", async () => {
    storedCourse = undefined;
    await expect(getKnowledgeMapData("foreign")).rejects.toThrow("Không tìm thấy khoá học hoặc khoá học không thuộc quyền quản lý của bạn.");
    expect(reads).toHaveLength(1);
    expectReadOnly();
  });

  it("requires a lecturer session before content reads", async () => {
    boundary.session.mockResolvedValue(null);
    await expect(getKnowledgeMapData("owned")).rejects.toThrow("Unauthorized");
    expect(reads).toHaveLength(0);
    expectReadOnly();
  });

  it("rejects a non-lecturer before content reads", async () => {
    boundary.role.mockRejectedValue(new Error("Forbidden"));
    await expect(getKnowledgeMapData("owned")).rejects.toThrow("Forbidden");
    expect(reads).toHaveLength(0);
    expectReadOnly();
  });
});

// Session transport is a boundary here; transactional revalidation has its own tests.
vi.mock("@/lib/lecturer-auth", () => ({
  readLecturerIdentity: async () => {
    const identity = await boundary.session();
    if (!identity?.user) throw new Error("Unauthorized");
    return identity;
  },
  verifyLecturerSession: async (_store: unknown, identity?: any) => {
    const authenticated = identity ?? await boundary.session();
    if (!authenticated?.user) throw new Error("Unauthorized");
    await boundary.role();
    return authenticated.user;
  },
}));
