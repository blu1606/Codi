import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./courses";
import { courseLessons } from "./course-content";
import { studentEnrollments } from "./student-profile";
import { aiInteractionLogs } from "./ai-interaction-logs";

// In-lesson AI tutor thread (STATE-MACHINES.md §13): one thread per learner + lesson, capped at 40 rows.
// `limit` / `error` rows keep the rate-limited and failed turns visible after a reload.
export const aiTutorMessageRole = pgEnum("ai_tutor_message_role", ["user", "ai", "limit", "error"]);
export const aiTutorVote = pgEnum("ai_tutor_vote", ["up", "down"]);

// A suggested change of at most 3 lines, applied to the editor only when the learner presses "Áp dụng" (G9).
export type AiTutorDiff = {
  at: number;
  add: string[];
  context: string;
  state: "applied" | "skipped" | null;
};

export const aiTutorMessages = pgTable.withRLS("ai_tutor_messages", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  enrollmentId: bigint("enrollment_id", { mode: "number" }).notNull().references(() => studentEnrollments.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  role: aiTutorMessageRole("role").notNull(),
  // user/ai: the message; error: the question that was not answered (re-asked by "Thử lại").
  body: text("body").notNull(),
  lines: jsonb("lines").$type<number[]>().default([]).notNull(),
  diff: jsonb("diff").$type<AiTutorDiff>(),
  stopped: boolean("stopped").default(false).notNull(),
  vote: aiTutorVote("vote"),
  voteReason: text("vote_reason"),
  logId: bigint("log_id", { mode: "number" }).references(() => aiInteractionLogs.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ai_tutor_messages_thread_idx").on(table.userId, table.lessonId, table.id),
  check("ai_tutor_messages_vote_reason_check", sql`${table.voteReason} IS NULL OR ${table.vote} = 'down'`),
]);
