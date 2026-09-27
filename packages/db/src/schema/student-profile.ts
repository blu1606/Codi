import { bigint, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./courses";

export const activityType = pgEnum("student_activity_type", ["login", "course_view", "lesson_complete", "quiz_complete", "course_enrolled"]);
export const orderStatus = pgEnum("student_order_status", ["pending", "paid", "failed", "cancelled", "refunded"]);

export const studentActivities = pgTable("student_activities", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  type: activityType("type").notNull(),
  courseId: text("course_id"),
  metadata: text("metadata"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("student_activities_user_date_idx").on(table.userId, table.occurredAt)]);

export const studentEnrollments = pgTable("student_enrollments", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  progress: integer("progress").default(0).notNull(),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("student_enrollments_user_course_idx").on(table.userId, table.courseId)]);

export const studentWishlist = pgTable("student_wishlist", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("student_wishlist_user_course_idx").on(table.userId, table.courseId)]);

export const studentCart = pgTable("student_cart", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("student_cart_user_course_idx").on(table.userId, table.courseId)]);

export const studentTransactions = pgTable("student_transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  currency: text("currency").default("VND").notNull(),
  paymentMethod: text("payment_method"),
  status: orderStatus("status").default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
