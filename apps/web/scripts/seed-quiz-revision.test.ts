import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Database } from "@codi-1/db";
import { seedQuizRevision } from "./seed-quiz-revision";
import { seedAssessmentFixture } from "./assessment-fixture";

type Row = Record<string, any>;
const dialect = new PgDialect();
let rows: Record<string, Row[]>;
let events: string[];
let nextId: number;
const property = (name: string) =>
  name.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
function matches(condition: SQL | undefined, row: Row) {
  if (!condition) return true;
  const { sql, params } = dialect.sqlToQuery(condition);
  const equals = [...sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)];
  const memberships = [
    ...sql.matchAll(/"[^"]+"\."([^"]+)" in \((\$\d+(?:, \$\d+)*)\)/g),
  ];
  if (/\bor\b/i.test(sql) || (!equals.length && !memberships.length))
    throw new Error(`Unsupported SQL: ${sql}`);
  return (
    equals.every(
      ([, key, index]) => row[property(key!)] === params[Number(index) - 1],
    ) &&
    memberships.every(([, key, indexes]) =>
      [...indexes!.matchAll(/\$(\d+)/g)].some(
        ([, index]) => row[property(key!)] === params[Number(index) - 1],
      ),
    )
  );
}
const unique: Record<string, string[]> = {
  courses: ["id"],
  course_chapters: ["id"],
  course_lessons: ["id"],
  skills: ["courseId", "name"],
  lesson_skills: ["lessonId", "skillId"],
  student_enrollments: ["userId", "courseId"],
  quiz_questions: ["assessmentId", "quizRevision", "position"],
  quiz_options: ["questionId", "position"],
};
// Evaluates real predicates and uniqueness keys; records lock requests, not PostgreSQL behavior.
function query(operation: string, table?: Table) {
  let name = table ? getTableName(table) : "";
  let condition: SQL | undefined;
  let values: Row | Row[] = {};
  let conflict: "nothing" | { set: Row } | undefined;
  let order: SQL[] = [];
  let limit = Infinity;
  const builder = {
    from(value: Table) {
      name = getTableName(value);
      return builder;
    },
    where(value: SQL) {
      condition = value;
      return builder;
    },
    for(mode: string) {
      events.push(`lock:${name}:${mode}`);
      return builder;
    },
    orderBy(...value: SQL[]) {
      order = value;
      return builder;
    },
    limit(value: number) {
      limit = value;
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
    onConflictDoNothing() {
      conflict = "nothing";
      return builder;
    },
    onConflictDoUpdate(value: { set: Row }) {
      conflict = value;
      return builder;
    },
    then(
      resolve: (value: Row[]) => unknown,
      reject?: (error: unknown) => unknown,
    ) {
      return Promise.resolve()
        .then(() => {
          const source = (rows[name] ??= []);
          if (operation === "select") {
            let selected = source.filter((row) => matches(condition, row));
            for (const item of order) {
              const match = dialect
                .sqlToQuery(item)
                .sql.match(/"[^"]+"\."([^"]+)" asc/);
              if (!match) throw new Error("Unsupported order");
              const key = property(match[1]!);
              selected = [...selected].sort((a, b) => a[key] - b[key]);
            }
            return selected.slice(0, limit).map((row) => ({ ...row }));
          }
          events.push(`${operation}:${name}`);
          if (operation === "update") {
            const updated = source.filter((row) => matches(condition, row));
            for (const row of updated) Object.assign(row, values);
            return updated.map((row) => ({ ...row }));
          }
          return (Array.isArray(values) ? values : [values]).flatMap(
            (value) => {
              const defaults =
                name === "assessments"
                  ? { currentQuizRevision: 1, isDiagnostic: false }
                  : name === "quiz_questions"
                    ? {
                        quizRevision: 1,
                        lessonId: null,
                        type: "single_choice",
                        codeSnippet: null,
                        explanation: null,
                        points: 1,
                      }
                    : name === "quiz_options"
                      ? { explanation: null }
                      : {};
              const row = { id: ++nextId, ...defaults, ...value };
              const keys =
                name === "assessments" && row.isDiagnostic
                  ? ["courseId", "isDiagnostic"]
                  : unique[name];
              const old =
                keys &&
                source.find((item) =>
                  keys.every((key) => item[key] === row[key]),
                );
              if (old) {
                if (!conflict) throw new Error("Duplicate fixture key");
                if (conflict === "nothing") return [];
                Object.assign(old, conflict.set);
                return [{ ...old }];
              }
              source.push(row);
              return [{ ...row }];
            },
          );
        })
        .then(resolve, reject);
    },
  };
  return builder;
}
const store = {
  select: vi.fn(() => query("select")),
  insert: vi.fn((table: Table) => query("insert", table)),
  update: vi.fn((table: Table) => query("update", table)),
};
const tx = store as unknown as Pick<Database, "select" | "insert" | "update">;
const desired = [
  {
    text: "Original",
    options: [
      { text: "Yes", isCorrect: true },
      { text: "No", isCorrect: false },
    ],
  },
];
beforeEach(() => {
  vi.clearAllMocks();
  nextId = 100;
  events = [];
  rows = {
    assessments: [{ id: 10, type: "quiz", currentQuizRevision: 1 }],
    quiz_questions: [],
    quiz_options: [],
    assessment_submissions: [],
    assessment_answers: [],
    learning_path_evidence: [],
  };
});

describe("immutable fixture question publication", () => {
  it("initializes the current revision and makes an identical rerun write-free", async () => {
    const initial = await seedQuizRevision(tx, 10, desired);
    expect(initial.quizRevision).toBe(1);
    events = [];
    const second = await seedQuizRevision(tx, 10, desired);
    expect(second).toEqual(initial);
    expect(events).toEqual(["lock:assessments:update"]);
  });
  it.each(["answered", "unknown", "zero-answer"])(
    "appends changed content without altering a %s attempt",
    async (kind) => {
      const old = await seedQuizRevision(tx, 10, desired);
      rows.assessment_submissions!.push({
        id: 40,
        assessmentId: 10,
        quizRevision: 1,
        status: "draft",
      });
      if (kind !== "zero-answer")
        rows.assessment_answers!.push({
          submissionId: 40,
          questionId: old.questions[0]!.id,
          selectedOptionId:
            kind === "unknown" ? null : old.questions[0]!.options[0]!.id,
          isUnknown: kind === "unknown",
        });
      rows.learning_path_evidence!.push({
        submissionId: 9,
        observationKey: "existing",
      });
      const before = structuredClone(rows);
      events = [];
      const changed = await seedQuizRevision(tx, 10, [
        {
          text: "Changed",
          options: [
            { text: "No", isCorrect: true },
            { text: "Yes", isCorrect: false },
          ],
        },
      ]);
      expect(changed.quizRevision).toBe(2);
      expect(changed.questions[0]!.id).not.toBe(old.questions[0]!.id);
      expect(
        rows.quiz_questions!.filter((question) => question.quizRevision === 1),
      ).toEqual(before.quiz_questions);
      expect(
        rows.quiz_options!.filter(
          (option) => option.questionId === old.questions[0]!.id,
        ),
      ).toEqual(before.quiz_options);
      for (const name of [
        "assessment_submissions",
        "assessment_answers",
        "learning_path_evidence",
      ])
        expect(rows[name]).toEqual(before[name]);
      expect(events).toContain("lock:assessments:update");
      expect(events).toContain("insert:quiz_questions");
      expect(events.indexOf("lock:assessments:update")).toBeLessThan(
        events.indexOf("insert:quiz_questions"),
      );
      expect(events.filter((event) => event.startsWith("update:"))).toEqual([
        "update:assessments",
      ]);
      expect(events).toContain("insert:quiz_options");
      expect(events.at(-1)).toBe("update:assessments");
      const count = rows.quiz_questions!.length;
      await seedQuizRevision(tx, 10, [{ text: "Changed", options: [{ text: "No", isCorrect: true }, { text: "Yes", isCorrect: false }] }]);
      expect(rows.quiz_questions).toHaveLength(count);
    },
  );
  it("does not populate an empty question set already pinned by a zero-answer draft", async () => {
    rows.assessment_submissions!.push({
      id: 40,
      assessmentId: 10,
      quizRevision: 1,
      status: "draft",
    });
    expect((await seedQuizRevision(tx, 10, desired)).quizRevision).toBe(2);
    expect(rows.assessment_submissions![0]!.quizRevision).toBe(1);
    expect(
      rows.quiz_questions!.every((question) => question.quizRevision === 2),
    ).toBe(true);
  });
  it("keeps fill-only fixture semantics while adding missing positions in a new complete set", async () => {
    const old = await seedQuizRevision(tx, 10, desired);
    const result = await seedQuizRevision(
      tx,
      10,
      [
        {
          text: "Do not replace",
          options: [{ text: "Changed", isCorrect: false }],
        },
        ...desired,
      ],
      true,
    );
    expect(result.quizRevision).toBe(2);
    expect(result.questions.map((question) => question.text)).toEqual([
      "Original",
      "Original",
    ]);
    expect(result.questions[0]!.options.map((option) => option.text)).toEqual([
      "Yes",
      "No",
    ]);
    expect(
      rows.quiz_questions!.find(
        (question) => question.id === old.questions[0]!.id,
      )!.text,
    ).toBe("Original");
  });
  it("actual assessment/onboarding fixture reruns read only current content after a publication", async () => {
    rows.assessments = [];
    const initial = await seedAssessmentFixture(tx, "course", ["learner"]);
    const existing = rows.assessments!.find(
      (assessment) => assessment.id === initial.quizId,
    )!;
    const changed = await seedQuizRevision(
      tx,
      initial.quizId,
      initial.questions.map((question) => ({
        ...question,
        text: "Author changed",
      })),
    );
    const before = structuredClone(rows.quiz_questions);
    const rerun = await seedAssessmentFixture(tx, "course", ["learner"]);
    expect(existing.currentQuizRevision).toBe(changed.quizRevision);
    expect(rerun.questions.map((question) => question.id)).toEqual(
      changed.questions.map((question) => question.id),
    );
    expect(
      rerun.questions.every((question) => question.text === "Author changed"),
    ).toBe(true);
    expect(rows.quiz_questions).toEqual(before);
  });
  it.each([null, 0, -1, 1.5])(
    "rejects invalid revision %s before inserting content",
    async (pin) => {
      rows.assessments![0]!.currentQuizRevision = pin;
      await expect(seedQuizRevision(tx, 10, desired)).rejects.toThrow(
        "invalid",
      );
      expect(store.insert).not.toHaveBeenCalled();
      expect(store.update).not.toHaveBeenCalled();
    },
  );
});
