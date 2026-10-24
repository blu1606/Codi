import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { assessments, courseLessons } from "@codi-1/db";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
  transaction: vi.fn(), revalidate: vi.fn(), verifySession: vi.fn(),
}));
vi.mock("@/services", () => ({ db: mocks }));
vi.mock("@/lib/lecturer-auth", () => ({ readLecturerIdentity: async () => ({ user: await (mocks.verifySession)(), session: { id: "session-1" } }), verifyLecturerSession: mocks.verifySession }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { getQuizBuilderData, saveQuizData } from "./actions";

type Row = Record<string, unknown>;
const dialect = new PgDialect();
let tables: Record<string, Row[]>;
let sequence: number;
const input = {
  passingScore: 70, isEntry: true,
  questions: [{ text: "First question", correctIndex: 0, options: ["Yes", "No"] }],
};

function matches(predicate: SQL, row: Row) {
  const { sql, params } = dialect.sqlToQuery(predicate);
  const membership = sql.match(/^"[^"]+"\."([^"]+)" in \((\$\d+(?:, \$\d+)*)\)$/);
  if (membership) {
    const property = membership[1]!.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
    return params.includes(row[property]);
  }
  const comparisons = [...sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)];
  if (!comparisons.length || /\bor\b/i.test(sql)) throw new Error(`Unsupported predicate: ${sql}`);
  return comparisons.every(([, column, index]) => {
    const property = column!.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
    return row[property] === params[Number(index) - 1];
  });
}

// Statement-time checks mirror the real schema, not a permissive queued result.
// Schema SQL assertions below keep these intentionally narrow semantics honest.
function checkAssessments(rows: Row[]) {
  const diagnosticCourses = new Set();
  for (const row of rows) {
    if (!row.isDiagnostic && row.lessonId == null) throw new Error("assessments_lesson_scoped_check");
    if (row.isDiagnostic && (row.type !== "quiz" || row.lessonId != null)) {
      throw new Error("assessments_diagnostic_shape_check");
    }
    if (row.isDiagnostic) {
      if (diagnosticCourses.has(row.courseId)) throw new Error("assessments_diagnostic_per_course_idx");
      diagnosticCourses.add(row.courseId);
    }
  }
}

function select(selection?: Record<string, unknown>) {
  let name = "";
  let predicate: SQL;
  let maximum = Infinity;
  const query = {
    from(table: Table) { name = getTableName(table); return query; },
    innerJoin() { return query; },
    where(value: SQL) { predicate = value; return query; },
    orderBy() { return query; },
    limit(value: number) { maximum = value; return query; },
    for() { return query; },
    then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
      return Promise.resolve().then(() => tables[name]!.filter((row) => {
        const context = name === "course_lessons" ? { ...row, courseId: "own" } : row;
        return matches(predicate, context);
      }).slice(0, maximum).map((row) => selection?.lesson === courseLessons ? { lesson: { ...row } } : { ...row })).then(resolve, reject);
    },
  };
  return query;
}

function mutation(operation: "insert" | "update" | "delete", table: Table) {
  const name = getTableName(table);
  let values: Row = {};
  let predicate: SQL;
  const execute = () => {
    const rows = tables[name]!;
    const affected = operation === "insert" ? [{ id: ++sequence, ...(name === "assessments" ? { currentQuizRevision: 1 } : {}), ...values }] : rows.filter((row) => matches(predicate, row));
    const next = operation === "insert" ? [...rows, ...affected]
      : operation === "delete" ? rows.filter((row) => !affected.includes(row))
      : rows.map((row) => affected.includes(row) ? { ...row, ...values } : row);
    if (name === "assessments") checkAssessments(next);
    tables[name] = next;
    if (operation === "delete" && name === "quiz_questions") {
      tables.quiz_options = tables.quiz_options!.filter((row) => !affected.some((question) => question.id === row.questionId));
    }
    return operation === "update" ? affected.map((row) => ({ ...row, ...values })) : affected;
  };
  const query = {
    values(value: Row) { values = value; return query; },
    set(value: Row) { values = value; return query; },
    where(value: SQL) { predicate = value; return query; },
    returning() { return query; },
    then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
      return Promise.resolve().then(execute).then(resolve, reject);
    },
  };
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  sequence = 100;
  tables = {
    courses: [{ id: "own", instructorId: "lecturer", status: "draft" }],
    course_lessons: [{ id: "lesson", chapterId: "chapter", title: "Own lesson" }],
    assessments: [
      { id: 20, courseId: "other", lessonId: null, type: "quiz", isDiagnostic: true, passingScore: 60 },
      { id: 30, courseId: "own", lessonId: "lesson", type: "quiz", isDiagnostic: false, passingScore: 50 },
    ],
    quiz_questions: [], quiz_options: [],
  };
  tables.assessments = tables.assessments!.map((row) => ({ currentQuizRevision: 1, ...row }));
  mocks.verifySession.mockResolvedValue({ id: "lecturer" });
  mocks.select.mockImplementation(select);
  mocks.insert.mockImplementation((table: Table) => mutation("insert", table));
  mocks.update.mockImplementation((table: Table) => mutation("update", table));
  mocks.delete.mockImplementation((table: Table) => mutation("delete", table));
  mocks.transaction.mockImplementation(async (callback: (tx: typeof mocks) => unknown) => {
    const snapshot = structuredClone(tables);
    try { return await callback(mocks); }
    catch (error) { tables = snapshot; throw error; }
  });
});

describe("entry-diagnostic persistence", () => {
  it("tracks the actual diagnostic shape and uniqueness schema", () => {
    const config = getTableConfig(assessments);
    const checks = Object.fromEntries(config.checks.map((check) => [check.name, dialect.sqlToQuery(check.value).sql]));
    expect(checks.assessments_lesson_scoped_check).toBe('"assessments"."is_diagnostic" OR "assessments"."lesson_id" IS NOT NULL');
    expect(checks.assessments_diagnostic_shape_check).toBe('NOT "assessments"."is_diagnostic" OR ("assessments"."type" = \'quiz\' AND "assessments"."lesson_id" IS NULL)');
    const index = config.indexes.find((item) => item.config.name === "assessments_diagnostic_per_course_idx")!;
    expect(index.config.unique).toBe(true);
    expect(index.config.columns).toEqual([expect.objectContaining({ name: "course_id" })]);
    expect(dialect.sqlToQuery(index.config.where!).sql).toBe('"assessments"."is_diagnostic"');
  });

  it("rejects transient invalid shapes and duplicate diagnostics in the boundary double", () => {
    const diagnostic = tables.assessments![0]!;
    expect(() => checkAssessments([{ ...diagnostic, isDiagnostic: false }])).toThrow("assessments_lesson_scoped_check");
    expect(() => checkAssessments([{ ...diagnostic, lessonId: "lesson" }])).toThrow("assessments_diagnostic_shape_check");
    expect(() => checkAssessments([diagnostic, { ...diagnostic, id: 21 }])).toThrow("assessments_diagnostic_per_course_idx");
  });

  it.each(["entry", "lesson"])("creates then repeatedly saves one diagnostic via %s without altering unrelated assessments", async (route) => {
    const unrelated = structuredClone(tables.assessments);
    await expect(saveQuizData("own", route, input)).resolves.toEqual({ success: true });
    const created = tables.assessments!.find((row) => row.courseId === "own" && row.isDiagnostic)!;
    expect(created).toMatchObject({ lessonId: null, type: "quiz", passingScore: 70 });
    for (const passingScore of [80, 90]) {
      const questions = [{ text: `Updated ${passingScore}`, correctIndex: 1, options: ["No", "Yes"] }];
      await expect(saveQuizData("own", route, { ...input, passingScore, questions })).resolves.toEqual({ success: true });
      expect(tables.assessments!.filter((row) => row.courseId === "own" && row.isDiagnostic)).toEqual([
        expect.objectContaining({ id: created.id, lessonId: null, isDiagnostic: true, passingScore }),
      ]);
      expect(tables.assessments!.filter((row) => row.id !== created.id)).toEqual(unrelated);
      const reopened = await getQuizBuilderData("own", "entry");
      expect(reopened.passingScore).toBe(passingScore);
      expect(reopened.questions).toEqual([expect.objectContaining({ text: questions[0]!.text, correctIndex: 1, options: ["No", "Yes"] })]);
      const current = tables.assessments!.find((row) => row.id === created.id)!;
      expect(tables.quiz_questions!.filter((row) => row.assessmentId === created.id && row.quizRevision === current.currentQuizRevision)).toHaveLength(1);
      expect(tables.quiz_questions!.filter((row) => row.assessmentId === created.id)).toHaveLength(passingScore === 80 ? 2 : 3);
      expect(tables.quiz_options).toHaveLength(passingScore === 80 ? 4 : 6);
    }
    expect(mocks.revalidate).toHaveBeenCalledTimes(3);
  });

  it("keeps ordinary lesson saves independent of an existing diagnostic", async () => {
    tables.assessments!.push({ id: 40, courseId: "own", lessonId: null, type: "quiz", isDiagnostic: true, passingScore: 75, currentQuizRevision: 1 });
    await expect(saveQuizData("own", "lesson", { ...input, isEntry: false })).resolves.toEqual({ success: true });
    expect(tables.assessments!.find((row) => row.id === 40)).toMatchObject({ isDiagnostic: true, lessonId: null, passingScore: 75 });
    expect(tables.assessments!.find((row) => row.id === 30)).toMatchObject({ isDiagnostic: false, lessonId: "lesson", passingScore: 70 });
  });

  it("reuses a persisted diagnostic on the entry route even without the input flag", async () => {
    tables.assessments!.push({ id: 40, courseId: "own", lessonId: null, type: "quiz", isDiagnostic: true, passingScore: 75, currentQuizRevision: 1 });
    await expect(saveQuizData("own", "entry", { ...input, isEntry: false })).resolves.toEqual({ success: true });
    expect(tables.assessments).toHaveLength(3);
    expect(tables.assessments!.find((row) => row.id === 40)).toMatchObject({ isDiagnostic: true, lessonId: null, passingScore: 70 });
  });

  it.each(["pending", "foreign"])("still rejects diagnostic writes for a %s course", async (state) => {
    Object.assign(tables.courses![0]!, state === "pending" ? { status: "pending" } : { instructorId: "other" });
    const snapshot = structuredClone(tables);
    await expect(saveQuizData("own", "entry", input)).rejects.toThrow(state === "pending" ? "chỉ đọc" : "quản lý");
    expect(tables).toEqual(snapshot);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("validates before changing a persisted diagnostic", async () => {
    tables.assessments!.push({ id: 40, courseId: "own", lessonId: null, type: "quiz", isDiagnostic: true });
    const snapshot = structuredClone(tables);
    await expect(saveQuizData("own", "entry", { ...input, questions: [] })).rejects.toThrow("Cần ít nhất một câu hỏi.");
    expect(tables).toEqual(snapshot);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
