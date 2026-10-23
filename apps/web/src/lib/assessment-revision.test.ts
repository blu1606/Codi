import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { courseLessons, type Database } from "@codi-1/db";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
  access: vi.fn(),
  revalidate: vi.fn(),
  lecturer: vi.fn(),
}));
vi.mock("./learning-path-service", () => ({
  loadLearningLessonAccess: mocks.access,
}));
vi.mock("@/services", () => ({ db: mocks }));
vi.mock("@/lib/lecturer-auth", () => ({
  verifyLecturerSession: mocks.lecturer,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { createAssessmentService } from "./assessment-service";
import { saveQuizData } from "@/app/dashboard/lecturer/courses/[courseId]/actions";

type Row = Record<string, any>;
const dialect = new PgDialect();
const scope = {
  userId: "learner",
  courseId: "course",
  lessonId: "lesson",
  assessmentId: 10,
};
let tables: Record<string, Row[]>;
let events: string[];
let sequence: number;
const property = (name: string) =>
  name.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());

function matches(predicate: SQL | undefined, row: Row) {
  if (!predicate) return true;
  const { sql, params } = dialect.sqlToQuery(predicate);
  const equals = [...sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)];
  const memberships = [
    ...sql.matchAll(/"[^"]+"\."([^"]+)" in \((\$\d+(?:, \$\d+)*)\)/g),
  ];
  if (/\bor\b/i.test(sql) || (!equals.length && !memberships.length))
    throw new Error(`Unsupported predicate: ${sql}`);
  return (
    equals.every(
      ([, column, index]) =>
        row[property(column!)] === params[Number(index) - 1],
    ) &&
    memberships.every(([, column, indexes]) =>
      [...indexes!.matchAll(/\$(\d+)/g)].some(
        ([, index]) => row[property(column!)] === params[Number(index) - 1],
      ),
    )
  );
}

// Boundary double evaluates real predicates and records requested locks, not PG acquisition.
function query(operation: string, selection?: Row, initialTable?: Table) {
  let name = initialTable ? getTableName(initialTable) : "";
  let predicate: SQL | undefined;
  let values: Row | Row[] = {};
  let maximum = Infinity;
  let orders: SQL[] = [];
  let conflict: { target: { name: string }[]; set: Row } | undefined;
  const builder = {
    from(table: Table) {
      name = getTableName(table);
      return builder;
    },
    innerJoin() {
      return builder;
    },
    where(value: SQL) {
      predicate = value;
      return builder;
    },
    orderBy(...value: SQL[]) {
      orders = value;
      return builder;
    },
    limit(value: number) {
      maximum = value;
      return builder;
    },
    for(mode: string) {
      events.push(`lock:${name}:${mode}`);
      return builder;
    },
    values(value: Row | Row[]) {
      values = value;
      return builder;
    },
    set(value: Row) {
      values = value;
      return builder;
    },
    returning() {
      return builder;
    },
    onConflictDoUpdate(value: typeof conflict) {
      conflict = value;
      return builder;
    },
    then(
      resolve: (rows: Row[]) => unknown,
      reject?: (error: unknown) => unknown,
    ) {
      return Promise.resolve()
        .then(() => {
          const source = tables[name]!;
          if (operation === "select") {
            let result = source.filter((row) => matches(predicate, row));
            for (const order of [...orders].reverse()) {
              const sql = dialect.sqlToQuery(order).sql;
              const match = sql.match(/"[^"]+"\."([^"]+)" (asc|desc)/);
              if (!match) throw new Error(`Unsupported order: ${sql}`);
              const key = property(match[1]!);
              result = [...result].sort(
                (a, b) =>
                  (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) *
                  (match[2] === "desc" ? -1 : 1),
              );
            }
            return result
              .slice(0, maximum)
              .map((row) =>
                selection?.lesson === courseLessons
                  ? { lesson: { ...row } }
                  : { ...row },
              );
          }
          events.push(`${operation}:${name}`);
          if (operation === "insert") {
            return (Array.isArray(values) ? values : [values]).map((value) => {
              const existing =
                conflict &&
                source.find((row) =>
                  conflict!.target.every(
                    (column) =>
                      row[property(column.name)] ===
                      value[property(column.name)],
                  ),
                );
              if (existing) {
                Object.assign(existing, conflict!.set);
                return { ...existing };
              }
              const row = {
                id: ++sequence,
                status: "draft",
                quizPercent: null,
                score: null,
                submittedAt: null,
                gradedAt: null,
                ...value,
              };
              source.push(row);
              return { ...row };
            });
          }
          const affected = source.filter((row) => matches(predicate, row));
          if (operation === "delete")
            tables[name] = source.filter((row) => !affected.includes(row));
          else for (const row of affected) Object.assign(row, values);
          return affected.map((row) => ({ ...row }));
        })
        .then(resolve, reject);
    },
  };
  return builder;
}

beforeEach(() => {
  vi.resetAllMocks();
  sequence = 100;
  events = [];
  tables = {
    courses: [
      {
        id: "course",
        instructorId: "lecturer",
        status: "published",
        knowledgeMapStatus: "confirmed",
      },
    ],
    course_lessons: [
      {
        id: "lesson",
        chapterId: "chapter",
        courseId: "course",
        title: "Lesson",
      },
    ],
    assessments: [
      {
        id: 10,
        courseId: "course",
        lessonId: "lesson",
        isDiagnostic: false,
        status: "published",
        type: "quiz",
        title: "Quiz",
        currentQuizRevision: 2,
        maxScore: 20,
        passingScore: 70,
        submissionFormat: null,
      },
    ],
    assessment_submissions: [
      {
        id: 40,
        assessmentId: 10,
        enrollmentId: 1,
        attempt: 1,
        quizRevision: 1,
        status: "draft",
        score: null,
        quizPercent: null,
        submittedAt: null,
        gradedAt: null,
      },
    ],
    quiz_questions: [
      {
        id: 20,
        assessmentId: 10,
        quizRevision: 1,
        position: 0,
        text: "Original",
        type: "single_choice",
        points: 1,
        explanation: "Original reason",
      },
      {
        id: 21,
        assessmentId: 10,
        quizRevision: 1,
        position: 1,
        text: "Removed",
        type: "single_choice",
        points: 1,
        explanation: "Removed reason",
      },
      {
        id: 22,
        assessmentId: 10,
        quizRevision: 2,
        position: 0,
        text: "Current",
        type: "single_choice",
        points: 1,
        explanation: "Current reason",
      },
    ],
    quiz_options: [
      {
        id: 30,
        questionId: 20,
        position: 0,
        text: "Old correct",
        isCorrect: true,
      },
      {
        id: 31,
        questionId: 20,
        position: 1,
        text: "Old wrong",
        isCorrect: false,
      },
      {
        id: 32,
        questionId: 21,
        position: 0,
        text: "Removed correct",
        isCorrect: true,
      },
      {
        id: 33,
        questionId: 21,
        position: 1,
        text: "Removed wrong",
        isCorrect: false,
      },
      {
        id: 34,
        questionId: 22,
        position: 0,
        text: "Current wrong",
        isCorrect: false,
      },
      {
        id: 35,
        questionId: 22,
        position: 1,
        text: "Current correct",
        isCorrect: true,
      },
    ],
    assessment_answers: [
      {
        submissionId: 40,
        questionId: 20,
        selectedOptionId: 30,
        isCorrect: null,
        earnedPoints: 0,
      },
    ],
    learning_path_evidence: [
      { submissionId: 99, observationKey: "question:90" },
    ],
  };
  mocks.access.mockImplementation(
    async (_store, _user, _course, _lesson, lock) => {
      if (lock) events.push("lock:enrollment:update");
      return { enrollment: { id: 1 } };
    },
  );
  mocks.lecturer.mockResolvedValue({ id: "lecturer" });
  mocks.select.mockImplementation((selection?: Row) =>
    query("select", selection),
  );
  for (const operation of ["insert", "update", "delete"] as const)
    mocks[operation].mockImplementation((table: Table) =>
      query(operation, undefined, table),
    );
  mocks.transaction.mockImplementation(
    async (callback: (tx: typeof mocks) => unknown) => {
      const snapshot = structuredClone(tables);
      try {
        return await callback(mocks);
      } catch (error) {
        tables = snapshot;
        throw error;
      }
    },
  );
});
const service = () => createAssessmentService(mocks as unknown as Database);
function expectBefore(first: string, second: string) {
  expect(events).toContain(first);
  expect(events).toContain(second);
  expect(events.indexOf(first)).toBeLessThan(events.indexOf(second));
}

describe("ordinary quiz content revisions", () => {
  it.each(["answered", "zero-answer"])(
    "resumes the %s draft on its pinned question set after publication",
    async (kind) => {
      if (kind === "zero-answer") tables.assessment_answers = [];
      const view = await service().get(scope);
      expect(view.questions.map((question) => question.id)).toEqual([20, 21]);
      expect(view.submission?.answers).toHaveLength(
        kind === "answered" ? 1 : 0,
      );
      expect(view.submission?.review).toEqual([]);
      expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
      expect(events).toEqual([]);
      await service().execute(scope, { type: "quiz-open" });
      expect(tables.assessment_submissions).toHaveLength(1);
      expectBefore("lock:enrollment:update", "lock:assessments:share");
      expectBefore(
        "lock:assessments:share",
        "lock:assessment_submissions:update",
      );
    },
  );

  it("opens a first attempt on current and retains its pin across another author save", async () => {
    tables.assessment_submissions = [];
    tables.assessment_answers = [];
    const opened = await service().execute(scope, { type: "quiz-open" });
    expect(opened.questions.map((question) => question.id)).toEqual([22]);
    expect(tables.assessment_submissions![0]).toMatchObject({
      quizRevision: 2,
      attempt: 1,
    });
    const attempts = structuredClone(tables.assessment_submissions);
    await saveQuizData("course", "lesson", {
      passingScore: 80,
      isEntry: false,
      questions: [{ text: "Third", options: ["Yes", "No"], correctIndex: 0 }],
    });
    expect(tables.assessment_submissions).toEqual(attempts);
    expect(
      (await service().get(scope)).questions.map((question) => question.id),
    ).toEqual([22]);
    expectBefore("lock:assessments:update", "insert:quiz_questions");
  });

  it("answers and grades only old content with the existing rounded-percent/current-threshold policy", async () => {
    await service().execute(scope, {
      type: "quiz-answer",
      submissionId: 40,
      questionId: 21,
      optionId: 33,
    });
    const result = await service().execute(scope, {
      type: "quiz-submit",
      submissionId: 40,
      confirmUnanswered: true,
    });
    expect(result.submission).toMatchObject({
      score: 10,
      quizPercent: 50,
      isPassed: false,
    });
    expect(
      result.submission!.review.map((answer) => [
        answer.questionId,
        answer.correctOptionId,
        answer.explanation,
      ]),
    ).toEqual([
      [20, 30, "Original reason"],
      [21, 32, "Removed reason"],
    ]);
    expect(result.questions.map((question) => question.id)).toEqual([20, 21]);
    const before = structuredClone(tables);
    await expect(
      service().execute(scope, {
        type: "quiz-submit",
        submissionId: 40,
        confirmUnanswered: true,
      }),
    ).rejects.toThrow("đã nộp");
    expect(tables).toEqual(before);
    expect(tables.learning_path_evidence).toEqual([
      { submissionId: 99, observationKey: "question:90" },
    ]);
  });

  it("reviews original answers after edits and retakes current content without altering old history", async () => {
    Object.assign(tables.assessment_submissions![0]!, {
      status: "graded",
      score: 10,
      quizPercent: 50,
      isPassed: false,
      submittedAt: new Date(),
      gradedAt: new Date(),
    });
    Object.assign(tables.assessment_answers![0]!, {
      isCorrect: true,
      earnedPoints: 1,
    });
    const old = structuredClone(tables.assessment_answers);
    expect((await service().get(scope)).submission!.review[0]).toMatchObject({
      correctOptionId: 30,
      explanation: "Original reason",
    });
    const retake = await service().execute(scope, {
      type: "quiz-retake",
      submissionId: 40,
    });
    expect(retake.questions.map((question) => question.id)).toEqual([22]);
    expect(retake.submission?.answers).toEqual([]);
    expect(retake.previousQuizPercent).toBe(50);
    expect(tables.assessment_submissions!.at(-1)).toMatchObject({
      attempt: 2,
      quizRevision: 2,
    });
    expect(tables.assessment_answers).toEqual(old);
    await expect(
      service().execute(scope, {
        type: "quiz-answer",
        submissionId: 40,
        questionId: 20,
        optionId: 30,
      }),
    ).rejects.toThrow("đã thay đổi");
    const answer = await service().execute(scope, {
      type: "quiz-answer",
      submissionId: retake.submission!.id,
      questionId: 22,
      optionId: 35,
    });
    expect(answer.submission?.review).toEqual([]);
    const result = await service().execute(scope, {
      type: "quiz-submit",
      submissionId: retake.submission!.id,
      confirmUnanswered: false,
    });
    expect(result.submission).toMatchObject({
      quizPercent: 100,
      score: 20,
      isPassed: true,
    });
    expect(
      (await service().get(scope)).questions.map((question) => question.id),
    ).toEqual([22]);
  });

  it.each([null, 0, -1, 1.5])(
    "rejects an invalid existing pin %s without falling back to current",
    async (pin) => {
      tables.assessment_submissions![0]!.quizRevision = pin;
      await expect(service().get(scope)).rejects.toThrow("phiên bản");
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.delete).not.toHaveBeenCalled();
    },
  );

  it("rejects a question from another revision without changing the pinned draft", async () => {
    const before = structuredClone(tables);
    await expect(
      service().execute(scope, {
        type: "quiz-answer",
        submissionId: 40,
        questionId: 22,
        optionId: 35,
      }),
    ).rejects.toThrow();
    expect(tables).toEqual(before);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("keeps current grading metadata rather than introducing historical thresholds", async () => {
    Object.assign(tables.assessments![0]!, { maxScore: 40, passingScore: 50 });
    const result = await service().execute(scope, {
      type: "quiz-submit",
      submissionId: 40,
      confirmUnanswered: true,
    });
    expect(result).toMatchObject({ maxScore: 40, passingScore: 50 });
    expect(result.submission).toMatchObject({
      quizPercent: 50,
      score: 20,
      isPassed: true,
    });
    expect(result.questions.map((question) => question.id)).toEqual([20, 21]);
  });

  it("rejects an unavailable current revision on retake without creating an attempt", async () => {
    Object.assign(tables.assessment_submissions![0]!, {
      status: "graded",
      submittedAt: new Date(),
    });
    tables.quiz_questions = tables.quiz_questions!.filter(
      (question) => question.quizRevision === 1,
    );
    const before = structuredClone(tables);
    await expect(
      service().execute(scope, { type: "quiz-retake", submissionId: 40 }),
    ).rejects.toThrow();
    expect(tables).toEqual(before);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each(["courseId", "lessonId"])(
    "keeps the assessment %s membership gate before revision reads or writes",
    async (field) => {
      tables.assessments![0]![field] = "foreign";
      await expect(
        service().execute(scope, { type: "quiz-open" }),
      ).rejects.toThrow("Không tìm thấy");
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.delete).not.toHaveBeenCalled();
    },
  );
});
