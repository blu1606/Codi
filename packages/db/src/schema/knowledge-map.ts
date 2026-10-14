import { sql } from "drizzle-orm";
import { bigint, check, index, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { courses } from "./courses";
import { courseLessons } from "./course-content";

// UC-26 Extract Course Knowledge Map. Skills are scoped to a course: two courses may both
// have a "Recursion" concept without colliding.

export const knowledgeSource = pgEnum("knowledge_source", ["ai", "lecturer"]);
// Lecturer review of each AI suggestion (STATE-MACHINES.md §18). Only accepted/edited items are live.
export const knowledgeReview = pgEnum("knowledge_review", ["suggested", "accepted", "edited", "declined"]);

export const skills = pgTable.withRLS("skills", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  level: text("level"),
  source: knowledgeSource("source").default("ai").notNull(),
  review: knowledgeReview("review").default("suggested").notNull(),
  // Bayesian Knowledge Tracing parameters per concept, seeded with literature defaults and
  // refitted once real learner data exists.
  bktPInit: numeric("bkt_p_init", { precision: 4, scale: 3, mode: "number" }).default(0.1).notNull(),
  bktPLearn: numeric("bkt_p_learn", { precision: 4, scale: 3, mode: "number" }).default(0.2).notNull(),
  bktPGuess: numeric("bkt_p_guess", { precision: 4, scale: 3, mode: "number" }).default(0.2).notNull(),
  bktPSlip: numeric("bkt_p_slip", { precision: 4, scale: 3, mode: "number" }).default(0.1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("skills_course_name_idx").on(table.courseId, table.name),
  check("skills_bkt_range_check", sql`${table.bktPInit} BETWEEN 0 AND 1 AND ${table.bktPLearn} BETWEEN 0 AND 1 AND ${table.bktPGuess} BETWEEN 0 AND 1 AND ${table.bktPSlip} BETWEEN 0 AND 1`),
  // BKT degenerates when guess + slip >= 1: it can no longer tell a knower from a guesser.
  check("skills_bkt_identifiable_check", sql`${table.bktPGuess} + ${table.bktPSlip} < 1`),
]);

// Prerequisite edges: prerequisiteSkillId must be learned before skillId. Both skills belong to
// the same course and the graph must stay acyclic — enforced by the application (cycle check
// blocks "Xác nhận bản đồ" and accept-all skips loop-closing edges).
export const skillPrerequisites = pgTable.withRLS("skill_prerequisites", {
  skillId: bigint("skill_id", { mode: "number" }).notNull().references(() => skills.id, { onDelete: "cascade" }),
  prerequisiteSkillId: bigint("prerequisite_skill_id", { mode: "number" }).notNull().references(() => skills.id, { onDelete: "cascade" }),
  source: knowledgeSource("source").default("ai").notNull(),
  review: knowledgeReview("review").default("suggested").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.skillId, table.prerequisiteSkillId] }),
  index("skill_prerequisites_required_idx").on(table.prerequisiteSkillId),
  check("skill_prerequisites_not_self_check", sql`${table.skillId} <> ${table.prerequisiteSkillId}`),
]);

export const lessonSkills = pgTable.withRLS("lesson_skills", {
  lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  skillId: bigint("skill_id", { mode: "number" }).notNull().references(() => skills.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.lessonId, table.skillId] }),
  index("lesson_skills_skill_idx").on(table.skillId),
]);
