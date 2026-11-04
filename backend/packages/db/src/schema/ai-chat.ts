import { sql } from "drizzle-orm";
import { check, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./courses";
import { courseLessons } from "./course-content";
import { aiTutorVote } from "./ai-tutor";

// One Tutor across every screen: a chat keeps the context it was started in (a lesson, or a general page)
// and the learner's history lists both kinds together. `lesson` chats are the in-lesson tutor (S11a);
// `general` chats answer about the catalogue and the learner's own learning (S17).
export const aiChatKind = pgEnum("ai_chat_kind", ["lesson", "general"]);
export const aiChatRole = pgEnum("ai_chat_role", ["user", "assistant"]);

export const aiChats = pgTable.withRLS("ai_chats", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: aiChatKind("kind").notNull(),
  courseId: text("course_id").references(() => courses.id, { onDelete: "set null" }),
  lessonId: uuid("lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
  // The first question, cut to one line.
  title: text("title").notNull(),
  // "Đang hỏi về: …" at the time the chat started, and where "Mở đúng chỗ" goes back to.
  contextLabel: text("context_label").notNull(),
  contextHref: text("context_href"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ai_chats_user_updated_idx").on(table.userId, table.updatedAt),
]);

// Stored in the AI SDK UIMessage shape (parts: text, reasoning, tool calls) so a reload renders exactly
// what streamed. `id` is the UIMessage id.
export const aiChatMessages = pgTable.withRLS("ai_chat_messages", {
  id: text("id").primaryKey(),
  chatId: uuid("chat_id").notNull().references(() => aiChats.id, { onDelete: "cascade" }),
  role: aiChatRole("role").notNull(),
  parts: jsonb("parts").$type<unknown[]>().notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  vote: aiTutorVote("vote"),
  voteReason: text("vote_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("ai_chat_messages_chat_idx").on(table.chatId, table.createdAt),
  check("ai_chat_messages_vote_reason_check", sql`${table.voteReason} IS NULL OR ${table.vote} = 'down'`),
]);
