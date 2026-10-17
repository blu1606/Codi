import type { PathChange } from "./learning-path-values";
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { courseLessons } from "./course-content";
import { skills } from "./knowledge-map";
import { assessmentSubmissions } from "./assessments";
import { studentEnrollments } from "./student-profile";

// UC-16 Study Course Lesson, UC-14/15/17 personalised learning path, UC-20/34 progress.

export const lessonProgressStatus = pgEnum("lesson_progress_status", ["not_started", "in_progress", "completed"]);

export const lessonProgress = pgTable.withRLS("lesson_progress", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  enrollmentId: bigint("enrollment_id", { mode: "number" }).notNull().references(() => studentEnrollments.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  status: lessonProgressStatus("status").default("not_started").notNull(),
  // Checklist step "Học nội dung" (video to end, PDF last page, or "Đánh dấu đã học").
  studiedAt: timestamp("studied_at", { withTimezone: true }),
  // Resume position for video.
  lastPositionSeconds: integer("last_position_seconds"),
  firstStartedAt: timestamp("first_started_at", { withTimezone: true }),
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("lesson_progress_enrollment_lesson_idx").on(table.enrollmentId, table.lessonId),
  index("lesson_progress_lesson_idx").on(table.lessonId),
  check("lesson_progress_completed_check", sql`${table.status} <> 'completed' OR ${table.completedAt} IS NOT NULL`),
  check("lesson_progress_position_check", sql`${table.lastPositionSeconds} IS NULL OR ${table.lastPositionSeconds} >= 0`),
]);

// BKT posterior P(L_n) per (enrollment, skill). UI maps it to the 5-stop scale:
// 0 no evidence · 1 < 0.40 · 2 < 0.60 · 3 < 0.85 · 4 >= 0.85 "Thành thạo" (decision D16).
export const enrollmentSkillMastery = pgTable.withRLS("enrollment_skill_mastery", {
  enrollmentId: bigint("enrollment_id", { mode: "number" }).notNull().references(() => studentEnrollments.id, { onDelete: "cascade" }),
  skillId: bigint("skill_id", { mode: "number" }).notNull().references(() => skills.id, { onDelete: "cascade" }),
  pMastery: numeric("p_mastery", { precision: 6, scale: 5, mode: "number" }).default(0.1).notNull(),
  evidenceCount: integer("evidence_count").default(0).notNull(),
  correctCount: integer("correct_count").default(0).notNull(),
  lastAssessedAt: timestamp("last_assessed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  primaryKey({ columns: [table.enrollmentId, table.skillId] }),
  index("mastery_skill_idx").on(table.skillId),
  check("mastery_probability_check", sql`${table.pMastery} BETWEEN 0 AND 1`),
  check("mastery_counts_check", sql`${table.evidenceCount} >= 0 AND ${table.correctCount} BETWEEN 0 AND ${table.evidenceCount}`),
]);

// Path versions: one active per enrollment, older versions kept to show "what changed".
export const learningPathStatus = pgEnum("learning_path_status", ["active", "superseded", "completed"]);
export const pathTrigger = pgEnum("path_trigger", ["diagnostic_completed", "lesson_completed", "goal_changed", "default_order", "manual"]);
export const pathGeneratedBy = pgEnum("path_generated_by", ["ai", "system"]);

export const personalizedLearningPaths = pgTable.withRLS("personalized_learning_paths", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  enrollmentId: bigint("enrollment_id", { mode: "number" }).notNull().references(() => studentEnrollments.id, { onDelete: "cascade" }),
  version: integer("version").default(1).notNull(),
  status: learningPathStatus("status").default("active").notNull(),
  trigger: pathTrigger("trigger").notNull(),
  // The diagnostic or quiz submission that caused this version.
  sourceSubmissionId: bigint("source_submission_id", { mode: "number" }).references(() => assessmentSubmissions.id, { onDelete: "set null" }),
  // system = default course order (no AI call, or AI unavailable).
  generatedBy: pathGeneratedBy("generated_by").default("ai").notNull(),
  aiModel: text("ai_model"),
  // Overall explanation shown to the learner.
  aiRationale: text("ai_rationale"),
  // Regenerate only when the mastery vector moved enough to change this hash.
  masterySnapshotHash: text("mastery_snapshot_hash"),
  updateSummary: jsonb("update_summary").$type<{ afterLessonId: string | null; changes: PathChange[]; message: string }>(),
  highlightsSeenAt: timestamp("highlights_seen_at", { withTimezone: true }),
  updateDismissedAt: timestamp("update_dismissed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("paths_enrollment_version_idx").on(table.enrollmentId, table.version),
  uniqueIndex("paths_active_per_enrollment_idx").on(table.enrollmentId).where(sql`${table.status} = 'active'`),
  check("paths_version_check", sql`${table.version} > 0`),
  check("paths_superseded_check", sql`${table.status} <> 'superseded' OR ${table.supersededAt} IS NOT NULL`),
]);

export const pathItems = pgTable.withRLS("path_items", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  pathId: bigint("path_id", { mode: "number" }).notNull().references(() => personalizedLearningPaths.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  // The AI may mark a lesson skippable; prerequisite order is a hard constraint it can never break.
  isSkippable: boolean("is_skippable").default(false).notNull(),
  // Why this lesson sits here, in plain language for the learner.
  reason: text("reason"),
  estimatedMinutes: integer("estimated_minutes"),
}, (table) => [
  uniqueIndex("path_items_position_idx").on(table.pathId, table.position),
  uniqueIndex("path_items_lesson_idx").on(table.pathId, table.lessonId),
  check("path_items_position_check", sql`${table.position} > 0`),
]);
