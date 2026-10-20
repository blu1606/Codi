import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { assessments, assessmentSubmissions, courseLessons, quizQuestions, skills } from "@codi-1/db";
import type { Database } from "@codi-1/db";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
  transaction: vi.fn(), revalidate: vi.fn(), verifySession: vi.fn(), lock: vi.fn(),
}));
vi.mock("@/services", () => ({ db: mocks }));
vi.mock("@/lib/lecturer-auth", () => ({ verifyLecturerSession: mocks.verifySession }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { getQuizBuilderData, saveQuizData } from "@/app/dashboard/lecturer/courses/[courseId]/actions";
import { createOnboardingService } from "./onboarding-service";

type Row = Record<string, any>;
const dialect = new PgDialect();
let tables: Record<string, Row[]>;
let events: string[];
let nextId: number;
const property = (name: string) => name.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
const input = {
  passingScore: 80, isEntry: true,
  questions: [
    { text: "Replacement second question", correctIndex: 1, options: ["Wrong", "New correct"] },
  ],
};

function matches(predicate: SQL | undefined, row: Row) {
  if (!predicate) return true;
  const { sql, params } = dialect.sqlToQuery(predicate);
  if (/\bor\b/i.test(sql)) throw new Error(`Unsupported predicate: ${sql}`);
  const equalities = [...sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)];
  const memberships = [...sql.matchAll(/"[^"]+"\."([^"]+)" in \((\$\d+(?:, \$\d+)*)\)/g)];
  if (!equalities.length && !memberships.length) throw new Error(`Unsupported predicate: ${sql}`);
  return equalities.every(([, column, index]) => row[property(column!)] === params[Number(index) - 1])
    && memberships.every(([, column, indexes]) => [...indexes!.matchAll(/\$(\d+)/g)].some(([, index]) => row[property(column!)] === params[Number(index) - 1]));
}

function select(selection?: Row) {
  let name = "";
  let predicate: SQL | undefined;
  let maximum = Infinity;
  let ordering: SQL[] = [];
  const query = {
    from(table: Table) { name = getTableName(table); return query; },
    where(value: SQL) { predicate = value; return query; },
    innerJoin() { return query; },
    leftJoin() { return query; },
    orderBy(...values: SQL[]) { ordering = values; return query; },
    limit(value: number) { maximum = value; return query; },
    // Observe the requested query mode, not actual PostgreSQL lock acquisition.
    for(mode: string) { mocks.lock(name, mode); events.push(`lock:${name}:${mode}`); return query; },
    then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
      return Promise.resolve().then(() => {
        let rows = tables[name]!.filter((row) => matches(predicate, row));
        for (const order of [...ordering].reverse()) {
          const sql = dialect.sqlToQuery(order).sql;
          const match = sql.match(/"[^"]+"\."([^"]+)" (asc|desc)/);
          if (!match) throw new Error(`Unsupported order: ${sql}`);
          const key = property(match[1]!);
          rows = [...rows].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (match[2] === "desc" ? -1 : 1));
        }
        return rows.slice(0, maximum).map((row) => {
          if (selection?.skill === skills) return { skill: { ...row } };
          if (selection?.lesson === courseLessons) return { lesson: { ...row } };
          if (!selection) return { ...row };
          return Object.fromEntries(Object.entries(selection).map(([key, column]) => [key, row[property(column.name)]]));
        });
      }).then(resolve, reject);
    },
  };
  return query;
}

function mutation(operation: string, table: Table) {
  const name = getTableName(table);
  let values: Row = {};
  let predicate: SQL | undefined;
  let conflict: { target: { name: string }[]; set: Row } | undefined;
  const execute = () => {
    events.push(`${operation}:${name}`);
    const rows = tables[name]!;
    const existing = conflict && rows.find((row) => conflict!.target.every((column) => row[property(column.name)] === values[property(column.name)]));
    if (existing) {
      Object.assign(existing, conflict!.set);
      return [{ ...existing }];
    }
    const defaults = name === "assessment_submissions" ? { status: "draft", gradedAt: null }
      : name === "assessments" ? { currentQuizRevision: 1 } : name === "quiz_questions" ? { quizRevision: 1, points: 1 } : {};
    const affected = operation === "insert" ? [{ id: ++nextId, ...defaults, ...values }] : rows.filter((row) => matches(predicate, row));
    if (operation === "delete" && name === "quiz_questions" && tables.assessment_answers!.some((a) => affected.some((q) => q.id === a.questionId))) {
      throw new Error("assessment_answers_question_id_quiz_questions_id_fkey");
    }
    const next = operation === "insert" ? [...rows, ...affected] : operation === "delete" ? rows.filter((row) => !affected.includes(row)) : rows.map((row) => affected.includes(row) ? { ...row, ...values } : row);
    if (name === "quiz_questions") {
      const keys = next.map((q) => `${q.assessmentId}:${q.quizRevision}:${q.position}`);
      if (new Set(keys).size !== keys.length) throw new Error("quiz_questions_revision_position_idx");
    }
    tables[name] = next;
    return operation === "update" ? affected.map((row) => ({ ...row, ...values })) : affected;
  };
  const query = {
    values(value: Row) { values = value; return query; },
    set(value: Row) { values = value; return query; },
    where(value: SQL) { predicate = value; return query; },
    returning() { return query; },
    onConflictDoUpdate(value: typeof conflict) { conflict = value; return query; },
    then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) { return Promise.resolve().then(execute).then(resolve, reject); },
  };
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  events = [];
  nextId = 100;
  tables = {
    courses: [{ id: "own", instructorId: "lecturer", status: "published", knowledgeMapStatus: "confirmed", title: "Course" }],
    course_lessons: [{ id: "lesson", chapterId: "chapter", courseId: "own", title: "Lesson" }],
    student_enrollments: [{ id: 1, userId: "learner", courseId: "own", status: "active", diagnosticStatus: "in-progress", diagnosticQuestionIndex: 0, goalSetAt: new Date(), pathStatus: "none", progress: 40 }],
    assessments: [{ id: 10, courseId: "own", lessonId: null, type: "quiz", isDiagnostic: true, status: "published", currentQuizRevision: 1, passingScore: 70, maxScore: 100 }],
    quiz_questions: [
      { id: 20, assessmentId: 10, quizRevision: 1, position: 0, text: "Original first", lessonId: "lesson", points: 1, type: "single_choice" },
      { id: 21, assessmentId: 10, quizRevision: 1, position: 1, text: "Original second", lessonId: "lesson", points: 1, type: "single_choice" },
    ],
    quiz_options: [
      { id: 30, questionId: 20, position: 0, text: "Original correct", isCorrect: true },
      { id: 31, questionId: 20, position: 1, text: "Original wrong", isCorrect: false },
      { id: 32, questionId: 21, position: 0, text: "Correct two", isCorrect: true },
      { id: 33, questionId: 21, position: 1, text: "Wrong two", isCorrect: false },
    ],
    assessment_submissions: [{ id: 40, assessmentId: 10, enrollmentId: 1, attempt: 1, status: "draft", quizRevision: 1, gradedAt: null }],
    assessment_answers: [{ submissionId: 40, questionId: 20, selectedOptionId: 30, isUnknown: false, isCorrect: null, earnedPoints: 0 }],
    personalized_learning_paths: [],
    skills: [{ id: 50, courseId: "own", lessonId: "lesson", review: "accepted", name: "Skill", bktPInit: 0.2, bktPLearn: 0.1, bktPGuess: 0.2, bktPSlip: 0.1 }],
    enrollment_skill_mastery: [{ enrollmentId: 1, skillId: 50, pMastery: 0.2, evidenceCount: 0, correctCount: 0 }],
    learning_path_evidence: [{ submissionId: 99, observationKey: "question:90" }],
  };
  mocks.verifySession.mockResolvedValue({ id: "lecturer" });
  mocks.select.mockImplementation(select);
  mocks.insert.mockImplementation((table: Table) => mutation("insert", table));
  mocks.update.mockImplementation((table: Table) => mutation("update", table));
  mocks.delete.mockImplementation((table: Table) => mutation("delete", table));
  mocks.transaction.mockImplementation(async (callback: (tx: typeof mocks) => unknown) => {
    const snapshot = structuredClone(tables);
    try { return await callback(mocks); } catch (error) { tables = snapshot; throw error; }
  });
});
const onboarding = () => createOnboardingService(mocks as unknown as Database);

function expectEventBefore(before: string, after: string) {
  expect(events).toContain(before);
  expect(events).toContain(after);
  expect(events.indexOf(before)).toBeLessThan(events.indexOf(after));
}

describe("immutable quiz revisions", () => {
  it.each(["lock:assessments:update", "insert:quiz_questions"])("rejects absent event %s when checking lock ordering", (missing) => {
    events = ["lock:assessments:update", "insert:quiz_questions"].filter((event) => event !== missing);
    expect(() => expectEventBefore("lock:assessments:update", "insert:quiz_questions")).toThrow();
  });

  it.each([null, undefined, 0, -1, 1.5, NaN, Infinity, "1"])("rejects invalid persisted attempt revision %s instead of falling back to current", async (pin) => {
    tables.assessment_submissions![0]!.quizRevision = pin;
    const before = structuredClone(tables);
    await expect(onboarding().get("learner", "own")).rejects.toThrow("Không tìm thấy phiên bản bài kiểm tra.");
    expect(tables).toEqual(before);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.lock).not.toHaveBeenCalled();
  });

  it.each(["in-progress", "done"])("requests a read-only snapshot for %s GET without lock or mutation calls", async (state) => {
    tables.student_enrollments![0]!.diagnosticStatus = state;
    if (state === "done") {
      Object.assign(tables.assessment_submissions![0]!, { status: "graded", score: 1, gradedAt: new Date() });
      Object.assign(tables.assessment_answers![0]!, { isCorrect: true, earnedPoints: 1 });
    }
    const before = structuredClone(tables);
    const view = await onboarding().get("learner", "own");
    expect(view.attemptId).toBe(40);
    expect(view.diagnostic!.questions.map((question) => question.id)).toEqual([20, 21]);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read", accessMode: "read only",
    });
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(events.filter((event) => event.startsWith("lock:"))).toEqual([]);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(tables).toEqual(before);
  });
  it("declares positive revisions and revision-scoped question positions", () => {
    for (const [table, name] of [[assessments, "assessments_quiz_revision_check"], [quizQuestions, "quiz_questions_revision_check"], [assessmentSubmissions, "submissions_quiz_revision_check"]] as const) {
      const check = getTableConfig(table).checks.find((check) => check.name === name)!;
      const expression = dialect.sqlToQuery(check.value).sql;
      expect(expression).toContain(name === "assessments_quiz_revision_check" ? '"current_quiz_revision" > 0' : '"quiz_revision" > 0');
      if (table === assessmentSubmissions) expect(expression).toContain('"quiz_revision" IS NULL OR');
    }
    const index = getTableConfig(quizQuestions).indexes.find((index) => index.config.name === "quiz_questions_revision_position_idx")!;
    expect(index.config.unique).toBe(true);
    expect(index.config.columns.map((column) => "name" in column ? column.name : null)).toEqual(["assessment_id", "quiz_revision", "position"]);
  });
  it.each(["answered", "unknown", "zero-answer"])("publishes new content while preserving a %s draft and its original question set", async (kind) => {
    if (kind === "unknown") Object.assign(tables.assessment_answers![0]!, { selectedOptionId: null, isUnknown: true });
    if (kind === "zero-answer") tables.assessment_answers = [];
    const oldQuestions = structuredClone(tables.quiz_questions);
    const oldOptions = structuredClone(tables.quiz_options);
    const oldAnswers = structuredClone(tables.assessment_answers);
    const oldAttempts = structuredClone(tables.assessment_submissions);
    await expect(saveQuizData("own", "entry", input)).resolves.toEqual({ success: true });
    expect(tables.assessments![0]).toMatchObject({ id: 10, currentQuizRevision: 2, passingScore: 80, maxScore: 100 });
    expect(tables.quiz_questions!.filter((q) => q.quizRevision === 1)).toEqual(oldQuestions);
    expect(tables.quiz_options!.filter((o) => o.id < 100)).toEqual(oldOptions);
    expect(tables.assessment_answers).toEqual(oldAnswers);
    expect(tables.assessment_submissions).toEqual(oldAttempts);
    const current = await getQuizBuilderData("own", "entry");
    expect(current.questions.map((q) => q.text)).toEqual([input.questions[0]!.text]);
    const resumed = await onboarding().get("learner", "own");
    expect(resumed.diagnostic!.questions.map((q) => q.id)).toEqual([20, 21]);
    expect(resumed.attemptId).toBe(40);
    expect(resumed.answers).toHaveLength(oldAnswers!.length);
    expectEventBefore("lock:assessments:update", "insert:quiz_questions");
    expect(events).not.toContain("delete:quiz_questions");
  });

  it("keeps the old graded result after reorder/removal/correct-answer edits, then pins a new retake to current content", async () => {
    Object.assign(tables.student_enrollments![0]!, { diagnosticStatus: "done" });
    Object.assign(tables.assessment_submissions![0]!, { status: "graded", score: 1, gradedAt: new Date() });
    Object.assign(tables.assessment_answers![0]!, { isCorrect: true, earnedPoints: 1 });
    tables.assessment_answers!.push({ submissionId: 40, questionId: 21, selectedOptionId: null, isUnknown: true, isCorrect: null });
    const saved = structuredClone(tables.assessment_answers);
    await saveQuizData("own", "entry", input);
    const old = await onboarding().get("learner", "own");
    expect(old.result).toMatchObject({ right: 1, wrong: 0, unknown: 1 });
    expect(old.diagnostic!.questions.map((q) => q.text)).toEqual(["Original first", "Original second"]);
    await onboarding().execute("learner", "own", { type: "diagnostic-retake" });
    const intro = await onboarding().get("learner", "own");
    expect(intro.diagnostic!.questions.map((q) => q.text)).toEqual([input.questions[0]!.text]);
    const started = await onboarding().execute("learner", "own", { type: "diagnostic-start" });
    expect(started.diagnostic!.questions.map((q) => q.text)).toEqual([input.questions[0]!.text]);
    expect(tables.assessment_submissions!.at(-1)).toMatchObject({ quizRevision: 2, attempt: 2, status: "draft" });
    expect(tables.assessment_answers).toEqual(saved);
    expect(events).toContain("lock:assessments:share");
    expectEventBefore("lock:student_enrollments:update", "lock:assessments:share");
  });

  it("pins the first zero-answer attempt to latest, not a default revision", async () => {
    tables.assessment_submissions = [];
    tables.assessment_answers = [];
    tables.student_enrollments![0]!.diagnosticStatus = "intro";
    await saveQuizData("own", "entry", input);
    await onboarding().execute("learner", "own", { type: "diagnostic-start" });
    expect(tables.assessment_submissions![0]).toMatchObject({ quizRevision: 2 });
    await saveQuizData("own", "entry", { ...input, questions: [{ ...input.questions[0]!, text: "Third revision" }] });
    const resumed = await onboarding().get("learner", "own");
    expect(resumed.diagnostic!.questions[0]!.text).toBe(input.questions[0]!.text);
  });

  it("grades a resumed old revision once after an author edit without changing prior evidence or completion", async () => {
    tables.student_enrollments![0]!.diagnosticQuestionIndex = 1;
    tables.assessment_answers!.push({ submissionId: 40, questionId: 21, selectedOptionId: null, isUnknown: true });
    const evidence = structuredClone(tables.learning_path_evidence);
    await saveQuizData("own", "entry", input);
    const result = await onboarding().execute("learner", "own", { type: "submit", attemptId: 40 });
    expect(result.result).toMatchObject({ right: 1, wrong: 0, unknown: 1 });
    expect(tables.assessment_submissions![0]).toMatchObject({ score: 1, quizRevision: 1, status: "graded" });
    expect(tables.enrollment_skill_mastery![0]).toMatchObject({ evidenceCount: 1, correctCount: 1 });
    const mastery = structuredClone(tables.enrollment_skill_mastery);
    const answerWrites = events.filter((event) => event === "update:assessment_answers").length;
    await onboarding().execute("learner", "own", { type: "submit", attemptId: 40 });
    expect(tables.enrollment_skill_mastery).toEqual(mastery);
    expect(events.filter((event) => event === "update:assessment_answers")).toHaveLength(answerWrites);
    expect(tables.learning_path_evidence).toEqual(evidence);
    expect(tables.student_enrollments![0]!.progress).toBe(40);
  });

  it("publishes reorder and correctness changes without modifying historical questions or options", async () => {
    const questions = structuredClone(tables.quiz_questions);
    const options = structuredClone(tables.quiz_options);
    await saveQuizData("own", "entry", { ...input, questions: [
      { text: "Original second", options: ["Correct two", "Wrong two"], correctIndex: 1 },
      { text: "Original first", options: ["Original correct", "Original wrong"], correctIndex: 1 },
    ] });
    expect(tables.quiz_questions!.filter((q) => q.quizRevision === 1)).toEqual(questions);
    expect(tables.quiz_options!.filter((o) => o.id < 100)).toEqual(options);
    expect((await getQuizBuilderData("own", "entry")).questions.map((q) => [q.text, q.correctIndex])).toEqual([["Original second", 1], ["Original first", 1]]);
  });

  it("preserves answered ordinary lesson quizzes while publishing current author content", async () => {
    Object.assign(tables.assessments![0]!, { lessonId: "lesson", isDiagnostic: false });
    const oldAnswers = structuredClone(tables.assessment_answers);
    await saveQuizData("own", "lesson", { ...input, isEntry: false });
    expect(tables.assessments![0]).toMatchObject({ id: 10, currentQuizRevision: 2, lessonId: "lesson", isDiagnostic: false });
    expect(tables.assessment_answers).toEqual(oldAnswers);
    expect(tables.quiz_questions!.filter((q) => q.quizRevision === 1)).toHaveLength(2);
    expect((await getQuizBuilderData("own", "lesson")).questions.map((q) => q.text)).toEqual([input.questions[0]!.text]);
  });

  it("rolls back a partially inserted revision without changing the published pointer or learner history", async () => {
    const before = structuredClone(tables);
    mocks.insert.mockImplementation((table: Table) => {
      if (getTableName(table) === "quiz_options") throw new Error("option write failed");
      return mutation("insert", table);
    });
    await expect(saveQuizData("own", "entry", input)).rejects.toThrow("option write failed");
    expect(tables).toEqual(before);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
