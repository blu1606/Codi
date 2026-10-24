import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../");
const migrationRoot = resolve(root, "packages/db/src/migrations");
const predecessor = "20261019102323_coding_tutorial_steps";
const migration = "20261020151926_quiz_content_revisions";
const read = (file: string) => readFileSync(resolve(root, file), "utf8");
const sql = readFileSync(
  resolve(migrationRoot, migration, "migration.sql"),
  "utf8",
);

describe("quiz revision migration source contract", () => {
  it("extends the actual predecessor with only revision columns, checks and index replacement", () => {
    const before = JSON.parse(
      readFileSync(
        resolve(migrationRoot, predecessor, "snapshot.json"),
        "utf8",
      ),
    );
    const after = JSON.parse(
      readFileSync(resolve(migrationRoot, migration, "snapshot.json"), "utf8"),
    );
    expect(after.prevIds).toEqual([before.id]);
    expect(before.id).toBe("bbb768a4-2407-46c4-945b-cb2b89ee3416");
    expect(after.version).toBe(before.version);
    expect(after.dialect).toBe(before.dialect);
    const key = (row: Record<string, unknown>) =>
      [row.entityType, row.schema, row.table, row.name].join("|");
    const oldRows = new Map<string, unknown>(
      before.ddl.map((row: Record<string, unknown>) => [key(row), row]),
    );
    const newRows = new Map<string, unknown>(
      after.ddl.map((row: Record<string, unknown>) => [key(row), row]),
    );
    expect([...oldRows.keys()].filter((id) => !newRows.has(id))).toEqual([
      "indexes|public|quiz_questions|quiz_questions_position_idx",
    ]);
    expect([...newRows.keys()].filter((id) => !oldRows.has(id)).sort()).toEqual(
      [
        "checks|public|assessment_submissions|submissions_quiz_revision_check",
        "checks|public|assessments|assessments_quiz_revision_check",
        "checks|public|quiz_questions|quiz_questions_revision_check",
        "columns|public|assessment_submissions|quiz_revision",
        "columns|public|assessments|current_quiz_revision",
        "columns|public|quiz_questions|quiz_revision",
        "indexes|public|quiz_questions|quiz_questions_revision_position_idx",
      ].sort(),
    );
    for (const [id, row] of oldRows)
      if (newRows.has(id)) expect(newRows.get(id), id).toEqual(row);
    for (const [table, column, nullable, defaultValue] of [
      ["assessment_submissions", "quiz_revision", true, null],
      ["assessments", "current_quiz_revision", false, "1"],
      ["quiz_questions", "quiz_revision", false, "1"],
    ] as const)
      expect(newRows.get(`columns|public|${table}|${column}`)).toMatchObject({
        type: "integer", notNull: !nullable, default: defaultValue,
      });
    expect(newRows.get("checks|public|assessment_submissions|submissions_quiz_revision_check")).toMatchObject({ value: '"quiz_revision" IS NULL OR "quiz_revision" > 0' });
    expect(newRows.get("checks|public|assessments|assessments_quiz_revision_check")).toMatchObject({ value: '"current_quiz_revision" > 0' });
    expect(newRows.get("checks|public|quiz_questions|quiz_questions_revision_check")).toMatchObject({ value: '"quiz_revision" > 0' });
    expect(newRows.get("indexes|public|quiz_questions|quiz_questions_revision_position_idx")).toMatchObject({ isUnique: true, columns: [{ value: "assessment_id" }, { value: "quiz_revision" }, { value: "position" }] });
    expect(after.renames).toEqual(before.renames);
  });

  it("pins every quiz submission without depending on answers or draft/graded status", () => {
    expect(sql).toMatch(
      /UPDATE "assessment_submissions" AS s\s+SET "quiz_revision" = 1\s+FROM "assessments" AS a\s+WHERE s\."assessment_id" = a\."id" AND a\."type" = 'quiz';/,
    );
    expect(sql).not.toMatch(
      /assessment_answers|DELETE\s+FROM|TRUNCATE|CASCADE|IF\s+(?:NOT\s+)?EXISTS/i,
    );
    expect(sql.match(/\bUPDATE\b/g)).toHaveLength(1);
    expect(sql).toContain('"current_quiz_revision" integer DEFAULT 1 NOT NULL');
    expect(sql).toContain(
      '"quiz_questions" ADD COLUMN "quiz_revision" integer DEFAULT 1 NOT NULL',
    );
    expect(sql).toContain(
      '"assessment_submissions" ADD COLUMN "quiz_revision" integer;',
    );
  });

  it("establishes the new uniqueness before dropping the predecessor index", () => {
    const create = sql.indexOf(
      'CREATE UNIQUE INDEX "quiz_questions_revision_position_idx"',
    );
    const drop = sql.indexOf('DROP INDEX "quiz_questions_position_idx"');
    expect(create).toBeGreaterThanOrEqual(0);
    expect(drop).toBeGreaterThan(create);
    expect(sql).not.toMatch(/DROP\s+(?:TABLE|COLUMN|CONSTRAINT)/i);
    expect(sql).toContain('("assessment_id","quiz_revision","position")');
  });
});

describe("direct fixture quiz writers", () => {
  it("pins both graded and zero-answer lesson-player quiz fixtures", () => {
    const fixture = read("apps/web/scripts/lesson-player-fixture.ts");
    expect(fixture).toMatch(
      /quizRevision:\s*a\.type === "quiz" \? a\.currentQuizRevision : null/,
    );
    const verify = read("apps/web/scripts/verify-lesson-player.ts");
    expect(
      verify.match(/quizRevision: quiz\.currentQuizRevision/g),
    ).toHaveLength(2);
  });
  it("pins learning-path graded fixture questions and submission to the same set", () => {
    const verify = read("apps/web/scripts/verify-learning-path.ts");
    expect(
      verify.match(/quizRevision: quiz\.currentQuizRevision/g),
    ).toHaveLength(2);
  });
  it("pins mockup diagnostic and ordinary attempts to their returned content revision", () => {
    const seed = read("apps/web/scripts/seed-mockup.ts");
    expect(seed).toContain("quizRevision: quiz.quizRevision");
    expect(seed).toContain("quizRevision: courseRef.diagnostic.quizRevision");
    expect(seed).not.toContain(
      "target: [quizQuestions.assessmentId, quizQuestions.position]",
    );
    expect(seed).not.toContain(
      "target: [quizOptions.questionId, quizOptions.position], set: { text, isCorrect }",
    );
  });
});
