import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./courses";
import { courseLessons } from "./course-content";

// AI classroom: the lecturer's AI council drafts checkpoints for a lesson video; the applied checkpoints pause the
// learner's video, where Bo challenges the answer and Cô Lam closes with the key idea.

/** One spoken turn of the council, streamed to the War Room and kept with the run. */
export type CouncilEvent = {
  id: string;
  at: string;
  agent: "colam" | "bo" | "tri" | "linhchi" | "minhkhang" | "system";
  phase: "source" | "moments" | "trap" | "crosscheck" | "notes" | "question" | "final" | "done";
  kind: "thought" | "speech" | "verdict" | "checkpoint" | "error";
  text: string;
  checkpointIndex?: number;
};

/** A checkpoint as the council drafts it and the lecturer applies it. */
export type CheckpointDraft = {
  timestampSeconds: number;
  concept: string;
  question: string;
  options: string[] | null;
  correctIndex: number | null;
  answerKey: string;
  keyIdea: string;
  misconception: { description: string; explanation: string; hint1: string; hint2: string; boClaim: string; analogy: string | null };
};

export type CouncilDraft = { checkpoints: CheckpointDraft[]; summary: string };

export type DebateMessage = {
  id: string;
  agent: "colam" | "bo" | "tri" | "linhchi" | "minhkhang" | "an" | "learner";
  text: string;
  kind: "opening" | "answer" | "challenge" | "rebuttal" | "concede" | "pushback" | "hint" | "closing" | "skip";
  at: string;
};

export type DebateState = {
  phase: "question" | "debate" | "closed" | "skipped";
  hintLevel: 0 | 1 | 2;
  verdict: "correct" | "wrong" | null;
  trapMode: "shortcut_fallacy" | "edge_case_skeptic" | "misconception_ally" | null;
  rebuttals: number;
};

export const lessonCouncilRuns = pgTable.withRLS("lesson_council_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("running"),
  events: jsonb("events").$type<CouncilEvent[]>().default(sql`'[]'::jsonb`).notNull(),
  draft: jsonb("draft").$type<CouncilDraft>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
}, (table) => [
  check("lesson_council_runs_status_check", sql`${table.status} in ('running', 'completed', 'failed', 'applied')`),
  index("lesson_council_runs_lesson_idx").on(table.lessonId, table.createdAt),
]);

export const lessonCheckpoints = pgTable.withRLS("lesson_checkpoints", {
  id: uuid("id").defaultRandom().primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  timestampSeconds: integer("timestamp_seconds").notNull(),
  concept: text("concept").notNull(),
  question: text("question").notNull(),
  // Multiple choice when present; an open question otherwise.
  options: jsonb("options").$type<string[]>(),
  correctIndex: integer("correct_index"),
  answerKey: text("answer_key").notNull(),
  keyIdea: text("key_idea").notNull(),
  misconception: text("misconception").notNull(),
  misconceptionExplanation: text("misconception_explanation").notNull(),
  hint1: text("hint1").notNull(),
  hint2: text("hint2").notNull(),
  boClaim: text("bo_claim").notNull(),
  analogy: text("analogy"),
  councilRunId: uuid("council_run_id").references(() => lessonCouncilRuns.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("lesson_checkpoints_lesson_position_idx").on(table.lessonId, table.position),
  check("lesson_checkpoints_position_check", sql`${table.position} >= 0`),
  check("lesson_checkpoints_timestamp_check", sql`${table.timestampSeconds} >= 0`),
]);

export const classroomDebateSessions = pgTable.withRLS("classroom_debate_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  checkpointId: uuid("checkpoint_id").notNull().references(() => lessonCheckpoints.id, { onDelete: "cascade" }),
  state: jsonb("state").$type<DebateState>().notNull(),
  messages: jsonb("messages").$type<DebateMessage[]>().default(sql`'[]'::jsonb`).notNull(),
  // Optimistic lock: every turn bumps it, so two tabs cannot both advance the same debate.
  version: integer("version").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("classroom_debate_sessions_user_lesson_idx").on(table.userId, table.lessonId, table.createdAt),
]);
