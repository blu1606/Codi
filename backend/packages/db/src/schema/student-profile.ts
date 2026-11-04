import { sql } from "drizzle-orm";
import { bigint, boolean, check, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { ONBOARDING_GOALS, ONBOARDING_LEVELS, type GoalDraft } from "./onboarding-values";
import { user } from "./auth";
import { courses } from "./courses";
import { courseLessons } from "./course-content";
import { orderItems, orderStatus } from "./commerce";
import { skills } from "./knowledge-map";

export { orderStatus };

export const activityType = pgEnum("student_activity_type", ["login", "course_view", "lesson_complete", "quiz_complete", "course_enrolled"]);

export const studentActivities = pgTable("student_activities", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  type: activityType("type").notNull(),
  courseId: text("course_id"),
  metadata: text("metadata"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("student_activities_user_date_idx").on(table.userId, table.occurredAt)]);

// UC-12 Set Course Learning Goal — an input to path generation, so it is structured, not prose.
// ONBOARDING_GOALS (project/finish/interview) is canonical for new course goal writes (§7).
// The four schema-v7 values remain readable for existing enrollments; goal edit maps them to finish.
export const learningGoal = pgEnum("learning_goal", ["complete_course", "pass_assessments", "master_specific_skill", "refresh_basics", ...ONBOARDING_GOALS]);
export const selfAssessedLevel = pgEnum("self_assessed_level", ONBOARDING_LEVELS);
export const enrollmentStatus = pgEnum("enrollment_status", ["active", "completed", "suspended"]);
// Onboarding diagnostic and personalised-path states (STATE-MACHINES.md §7, §8).
export const diagnosticStatus = pgEnum("diagnostic_status", ["none", "fork", "intro", "in-progress", "done", "skipped"]);
export const pathStatus = pgEnum("path_status", ["none", "generating", "ready", "failed"]);
export const pathSource = pgEnum("path_source", ["ai", "default"]);

// The enrollment is the learner's ownership of a course (v7 "enrollments"). Every learning
// record (progress, submissions, mastery, path, review) hangs off it.
export const studentEnrollments = pgTable("student_enrollments", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  progress: integer("progress").default(0).notNull(),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow().notNull(),

  orderItemId: bigint("order_item_id", { mode: "number" }).references(() => orderItems.id),
  status: enrollmentStatus("status").default("active").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  learningGoal: learningGoal("learning_goal"),
  // only for master_specific_skill
  targetSkillId: bigint("target_skill_id", { mode: "number" }).references(() => skills.id, { onDelete: "set null" }),
  weeklyGoalMinutes: integer("weekly_goal_minutes"),
  goalSetAt: timestamp("goal_set_at", { withTimezone: true }),
  selfAssessedLevel: selfAssessedLevel("self_assessed_level"),
  goalDraft: jsonb("goal_draft").$type<GoalDraft>().default({}).notNull(),
  goalStep: integer("goal_step").default(0).notNull(),
  goalEditing: boolean("goal_editing").default(false).notNull(),
  diagnosticQuestionIndex: integer("diagnostic_question_index").default(0).notNull(),
  diagnosticCardDismissedAt: timestamp("diagnostic_card_dismissed_at", { withTimezone: true }),
  diagnosticStatus: diagnosticStatus("diagnostic_status").default("none").notNull(),
  pathStatus: pathStatus("path_status").default("none").notNull(),
  pathSource: pathSource("path_source"),
  lastLessonId: uuid("last_lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("student_enrollments_user_course_idx").on(table.userId, table.courseId),
  check("student_enrollments_progress_check", sql`${table.progress} BETWEEN 0 AND 100`),
  check("student_enrollments_goal_step_check", sql`${table.goalStep} BETWEEN 0 AND 2`),
  check("student_enrollments_diagnostic_index_check", sql`${table.diagnosticQuestionIndex} >= 0`),
  check("student_enrollments_completed_check", sql`${table.status} <> 'completed' OR ${table.completedAt} IS NOT NULL`),
  check("student_enrollments_target_skill_check", sql`${table.targetSkillId} IS NULL OR ${table.learningGoal} = 'master_specific_skill'`),
]);

export const studentWishlist = pgTable("student_wishlist", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("student_wishlist_user_course_idx").on(table.userId, table.courseId)]);

// The pre-checkout cart (v7 "cart_items"). Rows are removed when checkout turns them into order_items.
export const studentCart = pgTable("student_cart", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("student_cart_user_course_idx").on(table.userId, table.courseId)]);

// Legacy one-row-per-course payment record used by the current SePay routes.
// Superseded by orders / order_items / payments (commerce.ts); drop once checkout is migrated.
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
