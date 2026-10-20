import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { courseLessons } from "@codi-1/db";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
  transaction: vi.fn(), revalidate: vi.fn(), verifySession: vi.fn(),
}));
vi.mock("@/services", () => ({ db: mocks }));
vi.mock("@/lib/lecturer-auth", () => ({ verifyLecturerSession: mocks.verifySession }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import {
  addLesson, deleteChapter, deleteLesson, generateAiQuizQuestions,
  getQuizBuilderData, moveChapter, moveLesson, renameChapter, renameLesson,
  restoreLesson, saveQuizData,
} from "./actions";

type Row = Record<string, unknown>;
type Write = { operation: string; table: string; values?: Row; predicate?: SQL };
const dialect = new PgDialect();
let tables: Record<string, Row[]>;
let writes: Write[];

const quiz = {
  passingScore: 70, isEntry: false,
  questions: [{ text: "A valid question", correctIndex: 0, options: ["Yes", "No"] }],
};

// Boundary double: evaluate the actual Drizzle equality predicates, not a queued
// success response. A missing course predicate therefore exposes foreign rows.
function matches(predicate: SQL | undefined, context: Record<string, Row>) {
  if (!predicate) return true;
  const { sql, params } = dialect.sqlToQuery(predicate);
  const comparisons = [...sql.matchAll(/"([^"]+)"\."([^"]+)" = \$(\d+)/g)];
  if (!comparisons.length) throw new Error(`Unsupported test predicate: ${sql}`);
  return comparisons.every(([, table, column, index]) => {
    const property = column!.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
    return context[table!]?.[property] === params[Number(index) - 1];
  });
}

function select(selection?: Record<string, unknown>) {
  let tableName = "";
  let predicate: SQL | undefined;
  let maximum = Infinity;
  const result = () => (tables[tableName] ?? []).filter((row) => {
    const context: Record<string, Row> = { [tableName]: row };
    if (tableName === "course_lessons") {
      context.course_chapters = tables.course_chapters!.find((ch) => ch.id === row.chapterId) ?? {};
    }
    return matches(predicate, context);
  }).slice(0, maximum).map((row) => {
    if (selection?.lesson === courseLessons) return { lesson: row };
    return selection ? Object.fromEntries(Object.keys(selection).map((key) => [key, row[key]])) : row;
  });
  const query = {
    from(table: Table) { tableName = getTableName(table); return query; },
    innerJoin() { return query; },
    where(value: SQL) { predicate = value; return query; },
    orderBy() { return query; },
    limit(value: number) { maximum = value; return query; },
    then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
      return Promise.resolve().then(result).then(resolve, reject);
    },
  };
  return query;
}

function mutation(operation: string, table: Table) {
  const write: Write = { operation, table: getTableName(table) };
  writes.push(write);
  const query = {
    values(value: Row) { write.values = value; return query; },
    set(value: Row) { write.values = value; return query; },
    where(predicate: SQL) { write.predicate = predicate; return query; },
    returning() { return Promise.resolve([{ id: 501, ...write.values }]); },
    then(resolve: (rows: Row[]) => unknown) { return Promise.resolve([]).then(resolve); },
  };
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  writes = [];
  tables = {
    courses: [
      { id: "own", instructorId: "lecturer", status: "draft", title: "Own course" },
      { id: "foreign", instructorId: "other", status: "pending", title: "Private course" },
      { id: "other-owned", instructorId: "lecturer", status: "draft" },
      { id: "pending", instructorId: "lecturer", status: "pending" },
    ],
    course_chapters: [
      { id: "own-chapter", courseId: "own", position: 0 },
      { id: "own-next-chapter", courseId: "own", position: 1 },
      { id: "foreign-chapter", courseId: "foreign", position: 0 },
      { id: "other-owned-chapter", courseId: "other-owned", position: 0 },
    ],
    course_lessons: [
      { id: "own-lesson", chapterId: "own-chapter", title: "Own lesson", position: 0 },
      { id: "own-next-lesson", chapterId: "own-chapter", title: "Own next lesson", position: 1 },
      { id: "foreign-lesson", chapterId: "foreign-chapter", title: "Private lesson", position: 0 },
      { id: "foreign-next-lesson", chapterId: "foreign-chapter", position: 1 },
      { id: "other-owned-lesson", chapterId: "other-owned-chapter", position: 0 },
      { id: "other-owned-next-lesson", chapterId: "other-owned-chapter", position: 1 },
    ],
  };
  mocks.verifySession.mockResolvedValue({ id: "lecturer" });
  mocks.select.mockImplementation(select);
  mocks.insert.mockImplementation((table: Table) => mutation("insert", table));
  mocks.update.mockImplementation((table: Table) => mutation("update", table));
  mocks.delete.mockImplementation((table: Table) => mutation("delete", table));
  mocks.transaction.mockImplementation((callback: (tx: typeof mocks) => unknown) => callback(mocks));
});

const lessonOperations = [
  ["rename", (id: string) => renameLesson("own", id, "Renamed")],
  ["delete", (id: string) => deleteLesson("own", id)],
  ["move", (id: string) => moveLesson("own", id, 1)],
  ["read quiz", (id: string) => getQuizBuilderData("own", id)],
  ["save quiz", (id: string) => saveQuizData("own", id, quiz)],
  ["save diagnostic from lesson route", (id: string) => saveQuizData("own", id, { ...quiz, isEntry: true })],
  ["prepare quiz draft", (id: string) => generateAiQuizQuestions("own", id)],
] as const;
const chapterOperations = [
  ["rename chapter", (id: string) => renameChapter("own", id, "Renamed")],
  ["delete chapter", (id: string) => deleteChapter("own", id)],
  ["move chapter", (id: string) => moveChapter("own", id, 1)],
  ["add lesson", (id: string) => addLesson("own", id, "New lesson")],
  ["restore lesson", (id: string) => restoreLesson("own", { id: "deleted", chapterId: id, title: "Restored", position: 0 })],
] as const;

async function expectMembershipRejection(operation: () => Promise<unknown>) {
  let result: unknown;
  let rejected = false;
  try {
    result = await operation();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Không tìm thấy (bài học|chương)/);
    rejected = true;
  }
  if (!rejected) expect(result).toMatchObject({ success: false });
  expect(writes).toEqual([]);
  expect(mocks.revalidate).not.toHaveBeenCalled();
}

describe("course-editor child membership", () => {
  for (const [name, operation] of lessonOperations) {
    it.each(["foreign-lesson", "other-owned-lesson", "missing"])(`${name} rejects out-of-course lesson %s before any write`, async (id) => {
      await expectMembershipRejection(() => operation(id));
    });
    it(`${name} retains the own-course path`, async () => {
      await expect(operation("own-lesson")).resolves.toBeDefined();
      if (name === "read quiz") expect(writes).toEqual([]);
      else expect(writes.length).toBeGreaterThan(0);
    });
  }
  for (const [name, operation] of chapterOperations) {
    it.each(["foreign-chapter", "other-owned-chapter", "missing"])(`${name} rejects out-of-course chapter %s before any write`, async (id) => {
      await expectMembershipRejection(() => operation(id));
    });
    it(`${name} retains the own-course path`, async () => {
      await expect(operation("own-chapter")).resolves.toMatchObject({ success: true });
      expect(writes.length).toBeGreaterThan(0);
    });
  }

  it("moves only the two own-course sibling lessons", async () => {
    await moveLesson("own", "own-lesson", 1);
    expect(writes).toHaveLength(2);
    expect(writes.map((write) => write.values?.position)).toEqual([1, 0]);
    for (const [index, write] of writes.entries()) {
      expect(write.table).toBe("course_lessons");
      const { params } = dialect.sqlToQuery(write.predicate!);
      expect(params).toEqual([index === 0 ? "own-lesson" : "own-next-lesson", "own-chapter"]);
    }
  });

  it("scopes both chapter movement endpoints to the authorized course", async () => {
    await moveChapter("own", "own-chapter", 1);
    expect(writes).toHaveLength(2);
    expect(writes.map((write) => dialect.sqlToQuery(write.predicate!).params)).toEqual([
      ["own-chapter", "own"], ["own-next-chapter", "own"],
    ]);
  });

  it("keeps course-wide entry quiz reads and writes independent of a lesson ID", async () => {
    await expect(getQuizBuilderData("own", "entry")).resolves.toMatchObject({ isEntry: true, lesson: null });
    await expect(saveQuizData("own", "entry", { ...quiz, isEntry: true })).resolves.toMatchObject({ success: true });
  });

  it("still rejects pending courses and courses owned by another lecturer", async () => {
    await expect(renameLesson("pending", "own-lesson", "New")).rejects.toThrow("chỉ đọc");
    await expect(renameLesson("foreign", "foreign-lesson", "New")).rejects.toThrow("quản lý");
    expect(writes).toEqual([]);
  });
});
