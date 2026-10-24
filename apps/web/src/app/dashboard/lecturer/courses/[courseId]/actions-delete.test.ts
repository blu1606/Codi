import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { courseLessons } from "@codi-1/db";

const boundary = vi.hoisted(() => ({ db: { select: vi.fn(), delete: vi.fn(), update: vi.fn(), transaction: vi.fn() }, revalidate: vi.fn() }));
vi.mock("@/services", () => ({ db: boundary.db }));
vi.mock("@/lib/lecturer-auth", () => ({ verifyLecturerSession: async () => ({ id: "lecturer" }) }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidate }));
import { deleteLesson } from "./actions";

type Row = Record<string, unknown>;
const dialect = new PgDialect();
let tables: Record<string, Row[]>;
let events: string[];
let afterLock: (() => void) | undefined;
function matches(predicate: SQL | undefined, row: Row, table: string) {
  if (!predicate) return true;
  const query = dialect.sqlToQuery(predicate);
  const context: Record<string, Row> = { [table]: row };
  if (table === "course_lessons") context.course_chapters = tables.course_chapters!.find((ch) => ch.id === row.chapterId) ?? {};
  if (table === "assessment_submissions") context.assessments = tables.assessments!.find((a) => a.id === row.assessmentId) ?? {};
  const equalities = [...query.sql.matchAll(/"([^"]+)"\."([^"]+)" = \$(\d+)/g)];
  if (!equalities.length) throw new Error(`Unsupported predicate: ${query.sql}`);
  return equalities.every(([, name, column, index]) => context[name!]?.[column!.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] === query.params[Number(index) - 1]);
}
function select(selection?: Record<string, unknown>) {
  let table = "";
  let predicate: SQL | undefined;
  let limit = Infinity;
  const query = {
    from(value: Table) { table = getTableName(value); return query; },
    innerJoin() { return query; },
    where(value: SQL) { predicate = value; return query; },
    orderBy() { return query; },
    limit(value: number) { limit = value; return query; },
    for(mode: string) { events.push(`lock:${table}:${mode}`); afterLock?.(); afterLock = undefined; return query; },
    then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
      return Promise.resolve().then(() => {
        events.push(`read:${table}`);
        const rows = (tables[table] ?? []).filter((row) => matches(predicate, row, table));
        if (selection?.count) return [{ count: rows.length }];
        return rows.slice(0, limit).map((row) => selection?.lesson === courseLessons ? { lesson: row } : row);
      }).then(resolve, reject);
    },
  };
  return query;
}
beforeEach(() => {
  vi.resetAllMocks();
  events = [];
  afterLock = undefined;
  tables = {
    courses: [{ id: "course", instructorId: "lecturer", status: "published", knowledgeMapStatus: "confirmed" }],
    course_chapters: [{ id: "chapter", courseId: "course" }],
    course_lessons: [{ id: "lesson", chapterId: "chapter", title: "Reading", body: "Body", position: 0 }],
    lesson_materials: [{ id: 1, lessonId: "lesson", type: "pdf", title: "PDF", url: "https://example.com/file.pdf", position: 0 }],
    assessments: [], assessment_submissions: [],
  };
  boundary.db.select.mockImplementation(select);
  boundary.db.transaction.mockImplementation(async (run: (tx: typeof boundary.db) => unknown) => {
    const before = structuredClone(tables);
    events.push("begin");
    try { const result = await run(boundary.db); events.push("commit"); return result; }
    catch (error) { tables = before; events.push("rollback"); throw error; }
  });
  boundary.db.delete.mockImplementation((value: Table) => ({ where: async (predicate: SQL) => {
    const table = getTableName(value);
    events.push(`delete:${table}`);
    tables[table] = (tables[table] ?? []).filter((row) => !matches(predicate, row, table));
  } }));
  boundary.db.update.mockImplementation((value: Table) => ({ set: (patch: Row) => ({ where: async (predicate: SQL) => {
    const table = getTableName(value);
    events.push(`update:${table}`);
    for (const row of tables[table] ?? []) if (matches(predicate, row, table)) Object.assign(row, patch);
  } }) }));
});

const dependents = [
  ["lesson_progress", "lessonId"], ["path_items", "lessonId"], ["learning_path_completions", "lessonId"],
  ["lesson_skills", "lessonId"], ["quiz_questions", "lessonId"], ["learning_path_jobs", "afterLessonId"],
  ["student_enrollments", "lastLessonId"], ["course_discussions", "lessonId"], ["course_conversations", "lessonId"],
  ["publication_review_flags", "lessonId"], ["ai_interaction_logs", "lessonId"], ["ai_content_drafts", "lessonId"],
] as const;
describe("lesson deletion preserves non-restorable state", () => {
  it.each(dependents)("refuses %s without submissions and without partial mutation", async (table, column) => {
    tables[table] = [{ id: 10, [column]: "lesson" }];
    const before = structuredClone(tables);
    await expect(deleteLesson("course", "lesson")).rejects.toThrow("Không thể xoá bài học");
    expect(tables).toEqual(before);
    expect(events.filter((event) => /^(delete|update):/.test(event))).toEqual([]);
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });

  it.each(["quiz", "coding", "assignment"])("refuses a %s assessment even with no submissions to preserve its identity and content", async (type) => {
    tables.assessments = [{ id: 20, lessonId: "lesson", type, currentQuizRevision: 3 }];
    const before = structuredClone(tables);
    await expect(deleteLesson("course", "lesson")).rejects.toThrow("Không thể xoá bài học");
    expect(tables).toEqual(before);
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });

  it("rechecks dependencies after requesting the lesson lock", async () => {
    afterLock = () => { tables.lesson_progress = [{ lessonId: "lesson", studied: true }]; };
    await expect(deleteLesson("course", "lesson")).rejects.toThrow("Không thể xoá bài học");
    expect(events).toContain("lock:course_lessons:update");
    expect(events.some((event) => event.startsWith("delete:"))).toBe(false);
  });

  it("deletes only a dependency-free lesson transactionally and returns its materials", async () => {
    const result = await deleteLesson("course", "lesson");
    expect(result.deletedLesson.lesson.id).toBe("lesson");
    expect(result.deletedLesson.materials).toEqual([expect.objectContaining({ id: 1 })]);
    expect(result.deletedLesson.assessments).toEqual([]);
    expect(tables.course_lessons).toEqual([]);
    expect(events).toContain("lock:course_lessons:update");
    expect(events.indexOf("begin")).toBeLessThan(events.indexOf("delete:course_lessons"));
    expect(events.indexOf("delete:course_lessons")).toBeLessThan(events.indexOf("commit"));
    expect(boundary.revalidate).toHaveBeenCalledOnce();
  });

  it("rolls back deletion when the knowledge-map update fails", async () => {
    const before = structuredClone(tables);
    boundary.db.update.mockImplementationOnce(() => ({ set: () => ({ where: async () => { throw new Error("Write failed"); } }) }));
    await expect(deleteLesson("course", "lesson")).rejects.toThrow("Write failed");
    expect(tables).toEqual(before);
    expect(events).toContain("rollback");
    expect(events).not.toContain("commit");
    expect(boundary.revalidate).not.toHaveBeenCalled();
  });
});
