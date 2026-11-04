import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { studentEnrollments } from "./student-profile";
import { courseLessons } from "./course-content";
import { assessmentSubmissions } from "./assessments";
import { pathTrigger } from "./learning";

// Durable work, claimed with a lease. A crashed request can be recovered on the next visit.
// These operational timestamps do not introduce any new learner-facing path states.
export const learningPathJobs = pgTable.withRLS("learning_path_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  enrollmentId: bigint("enrollment_id", { mode: "number" }).notNull().references(() => studentEnrollments.id, { onDelete: "cascade" }),
  trigger: pathTrigger("trigger").notNull(),
  inputHash: text("input_hash").notNull(),
  afterLessonId: uuid("after_lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
  leaseToken: uuid("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [
  index("learning_path_jobs_pending_idx").on(table.enrollmentId).where(sql`${table.finishedAt} IS NULL`),
  check("learning_path_jobs_lease_check", sql`(${table.leaseToken} IS NULL) = (${table.leaseExpiresAt} IS NULL)`),
]);

// #98 calls the completion hook in its transaction. Reconciliation is also safe on return.
export const learningPathCompletions = pgTable.withRLS("learning_path_completions", {
  enrollmentId: bigint("enrollment_id", { mode: "number" }).notNull().references(() => studentEnrollments.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.enrollmentId, table.lessonId] })]);

// One deterministic BKT application per graded quiz answer / coding submission.
// Diagnostic evidence belongs to #96 and is deliberately excluded by this consumer.
export const learningPathEvidence = pgTable.withRLS("learning_path_evidence", {
  submissionId: bigint("submission_id", { mode: "number" }).notNull().references(() => assessmentSubmissions.id, { onDelete: "cascade" }),
  observationKey: text("observation_key").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.submissionId, table.observationKey] })]);
