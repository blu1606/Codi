import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { assessmentSubmissions, assessments } from "./assessments";
import { studentEnrollments } from "./student-profile";
import { user } from "./auth";
import type { TutorialProgress, TutorialStep } from "./coding-tutorial";

// Flow L6b / S11g / S23b. One exercise per CODING assessment; runs and submissions are
// assessment_submissions rows (mode run | submit) with one result row per test case.

export const codingExercises = pgTable.withRLS("coding_exercises", {
  id: bigint("id", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  assessmentId: bigint("assessment_id", { mode: "number" })
    .notNull()
    .unique()
    .references(() => assessments.id, { onDelete: "cascade" }),
  language: text("language").notNull(),
  fileName: text("file_name"),
  tutorialSteps: jsonb("tutorial_steps")
    .$type<TutorialStep[]>()
    .default([])
    .notNull(),
  // "Khôi phục code ban đầu"
  starterCode: text("starter_code").notNull(),
  hints: jsonb("hints").$type<string[]>().default([]).notNull(),
  // Reference solution, lecturer-only. Must pass every test before the exercise can be saved.
  solutionCode: text("solution_code"),
  solutionVerifiedAt: timestamp("solution_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const codingTestCases = pgTable.withRLS(
  "coding_test_cases",
  {
    id: bigint("id", { mode: "number" })
      .generatedByDefaultAsIdentity()
      .primaryKey(),
    exerciseId: bigint("exercise_id", { mode: "number" })
      .notNull()
      .references(() => codingExercises.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    input: text("input"),
    expectedOutput: text("expected_output").notNull(),
    // Sample tests run on "Chạy" and are visible; hidden tests only run on "Nộp bài".
    isSample: boolean("is_sample").default(false).notNull(),
    position: integer("position").notNull(),
    // Reserved for authoring. §12 grades the unweighted percentage of passing tests.
    points: numeric("points", { precision: 6, scale: 2, mode: "number" })
      .default(1)
      .notNull(),
  },
  (table) => [
    uniqueIndex("coding_test_cases_position_idx").on(
      table.exerciseId,
      table.position,
    ),
    check("coding_test_cases_points_check", sql`${table.points} > 0`),
  ],
);

// Outcome of the whole run: done (tests evaluated) | syntax | runtime | timeout (STATE-MACHINES.md §12).
export const codeRunPhase = pgEnum("code_run_phase", [
  "done",
  "syntax",
  "runtime",
  "timeout",
]);

export const codingWorkspaces = pgTable.withRLS(
  "coding_workspaces",
  {
    exerciseId: bigint("exercise_id", { mode: "number" })
      .notNull()
      .references(() => codingExercises.id, { onDelete: "cascade" }),
    enrollmentId: bigint("enrollment_id", { mode: "number" })
      .notNull()
      .references(() => studentEnrollments.id, { onDelete: "cascade" }),
    draft: text("draft").notNull(),
    tutorialProgress: jsonb("tutorial_progress").$type<TutorialProgress>(),
    solutionViewed: boolean("solution_viewed").default(false).notNull(),
    lastRunId: bigint("last_run_id", { mode: "number" }).references(
      () => assessmentSubmissions.id,
      { onDelete: "set null" },
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.exerciseId, table.enrollmentId] })],
);

export const codingTestResults = pgTable.withRLS(
  "coding_test_results",
  {
    submissionId: bigint("submission_id", { mode: "number" })
      .notNull()
      .references(() => assessmentSubmissions.id, { onDelete: "cascade" }),
    testCaseId: bigint("test_case_id", { mode: "number" })
      .notNull()
      .references(() => codingTestCases.id, { onDelete: "cascade" }),
    isPassed: boolean("is_passed").notNull(),
    actualOutput: text("actual_output"),
    phase: codeRunPhase("phase").default("done").notNull(),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
  },
  (table) => [
    primaryKey({ columns: [table.submissionId, table.testCaseId] }),
    index("coding_test_results_test_case_idx").on(table.testCaseId),
  ],
);

// Cross-instance per-user lease and cooldown. No connection is held during execution.
export const codingRunLeases = pgTable.withRLS("coding_run_leases", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  runningUntil: timestamp("running_until", { withTimezone: true }).notNull(),
  lastStartedAt: timestamp("last_started_at", { withTimezone: true }).notNull(),
});
