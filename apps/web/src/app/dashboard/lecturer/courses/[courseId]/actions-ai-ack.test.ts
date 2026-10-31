import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
const m = vi.hoisted(() => ({ editable: vi.fn(), lesson: vi.fn(), run: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn(), tx: vi.fn(), execute: vi.fn() }));
vi.mock("./course-queries", () => ({
  getEditableCourse: m.editable, requireCourseLesson: m.lesson,
  withCourseContentWrite: (_course: string, callback: (store: unknown) => unknown) => callback({ transaction: m.tx }),
}));
vi.mock("@/services", () => ({ db: {} }));
vi.mock("@/lib/lecturer-auth", () => ({ readLecturerIdentity: vi.fn(), verifyLecturerSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { saveQuizData } from "./actions";

const jobId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const input = { passingScore: 70, isEntry: true, questions: [{ text: "Q", options: ["Yes", "No"], correctIndex: 0 }], appliedAiJobIds: [jobId] };
let writes: string[];
let draftWhere: SQL | undefined;
let failDraft: boolean;
let failQuestion: boolean;
let missingDraft: boolean;
const dialect = new PgDialect();

beforeEach(() => {
  vi.resetAllMocks();
  writes = []; draftWhere = undefined; failDraft = false; failQuestion = false; missingDraft = false;
  m.editable.mockResolvedValue({ user: { id: "owner" }, course: { id: "course" } });
  m.lesson.mockResolvedValue({ id: "lesson" });
  m.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: () => ({ for: () => Promise.resolve([]) }) }) }) }));
  m.insert.mockImplementation((table: Table) => ({ values: () => {
    const name = getTableName(table);
    if (name === "quiz_questions" && failQuestion) throw new Error("save_failed");
    writes.push(name);
    return { returning: () => Promise.resolve([{ id: 1 }]), then: (resolve: (value: unknown) => unknown) => Promise.resolve().then(resolve) };
  } }));
  m.update.mockImplementation((table: Table) => ({ set: () => ({ where: (predicate: SQL) => {
    if (getTableName(table) === "ai_content_drafts") { draftWhere = predicate; if (failDraft) throw new Error("draft_update_failed"); }
    writes.push(`update:${getTableName(table)}`);
    return Object.assign(Promise.resolve(), { returning: async () => missingDraft ? [] : [{ id: 77 }] });
  } }) }));
  m.tx.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const before = [...writes];
    try { return await fn({ select: m.select, insert: m.insert, update: m.update, transaction: m.tx }); }
    catch (error) { writes = before; throw error; }
  });
});

describe("quiz AI draft acknowledgement", () => {
  it("accepts only pending drafts for the owner, course, entry lesson and job", async () => {
    await expect(saveQuizData("course", "entry", input)).resolves.toEqual({ success: true });
    const query = dialect.sqlToQuery(draftWhere!);
    expect(query.sql).toMatch(/"lecturer_id" =/);
    expect(query.sql).toMatch(/"course_id" =/);
    expect(query.sql).toMatch(/"lesson_id" is null/i);
    expect(query.sql).toMatch(/"status" =/);
    expect(query.sql).toMatch(/"payload".*jobId/);
    expect(query.params).toEqual(expect.arrayContaining(["owner", "course", "pending", "quiz_questions", jobId]));
    expect(writes.at(-1)).toBe("update:ai_content_drafts");
  });
  it("scopes acknowledgement to the selected lesson", async () => {
    await saveQuizData("course", "lesson", { ...input, isEntry: false });
    const query = dialect.sqlToQuery(draftWhere!);
    expect(query.sql).toMatch(/"lesson_id" =/);
    expect(query.params).toContain("lesson");
  });
  it("does not acknowledge when quiz save fails", async () => {
    failQuestion = true;
    await expect(saveQuizData("course", "entry", input)).rejects.toThrow("save_failed");
    expect(draftWhere).toBeUndefined();
    expect(writes).toEqual([]);
  });
  it("rolls back the quiz writes when acknowledgement fails", async () => {
    failDraft = true;
    await expect(saveQuizData("course", "entry", input)).rejects.toThrow("draft_update_failed");
    expect(writes).toEqual([]);
  });
  it("rolls back if the draft is absent, already accepted or belongs to another user", async () => {
    missingDraft = true;
    await expect(saveQuizData("course", "entry", input)).rejects.toThrow("Bản nháp");
    expect(writes).toEqual([]);
  });
  it("rejects invalid job identifiers and rolls quiz writes back", async () => {
    await expect(saveQuizData("course", "entry", { ...input, appliedAiJobIds: ["invalid"] })).rejects.toThrow("không hợp lệ");
    expect(writes).toEqual([]);
  });
});
