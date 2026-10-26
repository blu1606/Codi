import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./courses";
import { courseLessons } from "./course-content";
import { studentEnrollments } from "./student-profile";
import { personalizedLearningPaths } from "./learning";

// Audit trail of every model call: UC-23 tutor, the /ai course advisor (guests allowed, user_id NULL),
// and background work (knowledge-map extraction, path generation/update). Cost and latency are
// kept so the AI usage report can quantify them.
export const aiRequestType = pgEnum("ai_request_type", [
  "extract_knowledge_map",
  "generate_path",
  "update_path",
  "ask_assistant",
  "ask_advisor",
  "explain_lesson",
  "generate_content",
  "other",
]);

export const aiInteractionLogs = pgTable.withRLS("ai_interaction_logs", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  enrollmentId: bigint("enrollment_id", { mode: "number" }).references(() => studentEnrollments.id, { onDelete: "set null" }),
  courseId: text("course_id").references(() => courses.id, { onDelete: "set null" }),
  lessonId: uuid("lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
  pathId: bigint("path_id", { mode: "number" }).references(() => personalizedLearningPaths.id, { onDelete: "set null" }),
  requestType: aiRequestType("request_type").notNull(),
  model: text("model"),
  userPrompt: text("user_prompt"),
  aiResponse: text("ai_response"),
  // Tutor only: hint step reached (1..3). Visible to the lecturer, never a score penalty.
  hintLevel: integer("hint_level"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  latencyMs: integer("latency_ms"),
  isSuccess: boolean("is_success").default(true).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ai_logs_user_idx").on(table.userId, table.createdAt),
  index("ai_logs_type_idx").on(table.requestType, table.createdAt),
  check("ai_logs_tokens_check", sql`(${table.promptTokens} IS NULL OR ${table.promptTokens} >= 0) AND (${table.completionTokens} IS NULL OR ${table.completionTokens} >= 0)`),
  check("ai_logs_latency_check", sql`${table.latencyMs} IS NULL OR ${table.latencyMs} >= 0`),
  check("ai_logs_hint_level_check", sql`${table.hintLevel} IS NULL OR ${table.hintLevel} BETWEEN 1 AND 3`),
]);

// AI-generated drafts the lecturer reviews before they become content (STATE-MACHINES.md §19).
export const aiDraftStatus = pgEnum("ai_draft_status", ["pending", "accepted", "discarded"]);
export const aiDraftKind = pgEnum("ai_draft_kind", ["course_outline", "lesson", "quiz_questions", "coding_exercise"]);

export const aiContentDrafts = pgTable.withRLS("ai_content_drafts", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  lecturerId: text("lecturer_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id").references(() => courses.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").references(() => courseLessons.id, { onDelete: "cascade" }),
  kind: aiDraftKind("kind").notNull(),
  status: aiDraftStatus("status").default("pending").notNull(),
  payload: jsonb("payload").notNull(),
  logId: bigint("log_id", { mode: "number" }).references(() => aiInteractionLogs.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}, (table) => [index("ai_drafts_lecturer_status_idx").on(table.lecturerId, table.status)]);
