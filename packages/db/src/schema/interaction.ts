import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./courses";
import { courseLessons } from "./course-content";
import { studentEnrollments } from "./student-profile";

// UC-21 Post Course Question / UC-30 Answer Course Question (public lesson Q&A),
// private learner ↔ lecturer conversations (Flow L6d), UC-22/31 course reviews, notifications.

// Public Q&A: a root row is the question, child rows are replies (STATE-MACHINES.md §14.1).
export const questionStatus = pgEnum("question_status", ["unanswered", "answered"]);

export const courseDiscussions = pgTable.withRLS("course_discussions", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
  parentId: bigint("parent_id", { mode: "number" }),
  authorId: text("author_id").notNull().references(() => user.id),
  body: text("body").notNull(),
  isLecturerReply: boolean("is_lecturer_reply").default(false).notNull(),
  // Only meaningful on a root question.
  status: questionStatus("status"),
  isHidden: boolean("is_hidden").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("discussions_course_idx").on(table.courseId, table.createdAt),
  index("discussions_lesson_idx").on(table.lessonId),
  index("discussions_parent_idx").on(table.parentId),
  check("discussions_root_status_check", sql`(${table.parentId} IS NULL) = (${table.status} IS NOT NULL)`),
]);

// Private conversation, usually escalated from the AI tutor with its context attached.
// Only the course lecturer or an admin may resolve / reopen; resolve needs a lecturer reply (D9).
export const conversationStatus = pgEnum("conversation_status", ["open", "resolved"]);

export const courseConversations = pgTable.withRLS("course_conversations", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
  learnerId: text("learner_id").notNull().references(() => user.id),
  lecturerId: text("lecturer_id").references(() => user.id),
  status: conversationStatus("status").default("open").notNull(),
  fromAi: boolean("from_ai").default(false).notNull(),
  // {summary, code, failingTest} — what the learner chose to attach.
  aiContext: jsonb("ai_context"),
  resolvedBy: text("resolved_by").references(() => user.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("conversations_lecturer_status_idx").on(table.lecturerId, table.status),
  index("conversations_learner_idx").on(table.learnerId),
  check("conversations_resolved_check", sql`${table.status} <> 'resolved' OR (${table.resolvedBy} IS NOT NULL AND ${table.resolvedAt} IS NOT NULL)`),
]);

export const conversationMessages = pgTable.withRLS("conversation_messages", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  conversationId: bigint("conversation_id", { mode: "number" }).notNull().references(() => courseConversations.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id),
  isLecturer: boolean("is_lecturer").default(false).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("conversation_messages_conversation_idx").on(table.conversationId, table.createdAt)]);

// One review per enrollment, so only a buyer can review; the lecturer reply is a column.
export const courseReviews = pgTable.withRLS("course_reviews", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  enrollmentId: bigint("enrollment_id", { mode: "number" }).notNull().unique().references(() => studentEnrollments.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  text: text("text"),
  lecturerReply: text("lecturer_reply"),
  repliedBy: text("replied_by").references(() => user.id),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  isVisible: boolean("is_visible").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("course_reviews_course_idx").on(table.courseId, table.isVisible),
  check("course_reviews_rating_check", sql`${table.rating} BETWEEN 1 AND 5`),
  check("course_reviews_reply_check", sql`${table.lecturerReply} IS NULL OR (${table.repliedBy} IS NOT NULL AND ${table.repliedAt} IS NOT NULL)`),
]);

// In-app notifications only (decision D15). link is an app path such as /learn/<courseId>.
export const notifications = pgTable.withRLS("notifications", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("notifications_user_unread_idx").on(table.userId, table.createdAt).where(sql`${table.readAt} IS NULL`),
]);
