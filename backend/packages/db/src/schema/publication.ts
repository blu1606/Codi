import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./courses";
import { courseLessons } from "./course-content";

// UC-32/33/35/36. One row per review round (STATE-MACHINES.md §17): the lecturer's request is
// round n, the admin decides it, a resubmission opens round n+1 carrying open flags over.
export const reviewRoundStatus = pgEnum("review_round_status", ["in_review", "changes_requested", "rejected", "approved"]);
// UC-33 automatic completeness check, run when the lecturer submits.
export const validationStatus = pgEnum("publication_validation_status", ["pending", "passed", "failed"]);
export const criterionStatus = pgEnum("review_criterion_status", ["pass", "fix", "na"]);
export const flagSeverity = pgEnum("review_flag_severity", ["must", "should"]);
export const flagStatus = pgEnum("review_flag_status", ["open", "fixed", "closed"]);
export const flagSource = pgEnum("review_flag_source", ["admin", "ai"]);

export const coursePublicationRequests = pgTable.withRLS("course_publication_requests", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  round: integer("round").default(1).notNull(),
  requestedBy: text("requested_by").notNull().references(() => user.id),
  reviewedBy: text("reviewed_by").references(() => user.id),
  validationStatus: validationStatus("validation_status").default("pending").notNull(),
  validationNote: text("validation_note"),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  status: reviewRoundStatus("status").default("in_review").notNull(),
  // Required for changes_requested / rejected — the lecturer reads it on the publication tab.
  reviewNote: text("review_note"),
  // Price set by the admin when approving (pricing belongs to Admin).
  approvedPrice: integer("approved_price"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("publication_course_round_idx").on(table.courseId, table.round),
  // at most one open round per course
  uniqueIndex("publication_open_round_idx").on(table.courseId).where(sql`${table.status} = 'in_review'`),
  index("publication_queue_idx").on(table.status, table.requestedAt),
  check("publication_round_check", sql`${table.round} > 0`),
  check("publication_decision_check", sql`${table.status} = 'in_review' OR (${table.reviewedBy} IS NOT NULL AND ${table.reviewedAt} IS NOT NULL)`),
  check("publication_reason_check", sql`${table.status} NOT IN ('changes_requested','rejected') OR ${table.reviewNote} IS NOT NULL`),
]);

// Fixed criteria ids from docs/mockup/js/course-review.js CRITERIA: info, materials, quiz, entry, code, assignment, rights.
export const publicationReviewCriteria = pgTable.withRLS("publication_review_criteria", {
  requestId: bigint("request_id", { mode: "number" }).notNull().references(() => coursePublicationRequests.id, { onDelete: "cascade" }),
  criterionId: text("criterion_id").notNull(),
  status: criterionStatus("status"),
  note: text("note"),
}, (table) => [
  primaryKey({ columns: [table.requestId, table.criterionId] }),
]);

export const publicationReviewFlags = pgTable.withRLS("publication_review_flags", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  requestId: bigint("request_id", { mode: "number" }).notNull().references(() => coursePublicationRequests.id, { onDelete: "cascade" }),
  // What the flag points at: course info, a lesson, or an item inside a lesson.
  targetType: text("target_type").notNull(),
  lessonId: uuid("lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
  targetLabel: text("target_label").notNull(),
  severity: flagSeverity("severity").notNull(),
  comment: text("comment").notNull(),
  status: flagStatus("status").default("open").notNull(),
  lecturerReply: text("lecturer_reply"),
  source: flagSource("source").default("admin").notNull(),
  // Copied from the previous round on resubmission.
  carriedFromFlagId: bigint("carried_from_flag_id", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("publication_flags_request_idx").on(table.requestId),
]);
