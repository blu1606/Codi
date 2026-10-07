import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { courses } from "./courses";

export const courseDetails = pgTable.withRLS("course_details", {
  courseId: text("course_id").primaryKey().references(() => courses.id, { onDelete: "cascade" }),
  learningOutcomes: text("learning_outcomes").array().default(sql`'{}'::text[]`).notNull(),
  requirements: text("requirements").array().default(sql`'{}'::text[]`).notNull(),
  targetAudience: text("target_audience"),
  coverImageUrl: text("cover_image_url"),
  introVideoUrl: text("intro_video_url"),
});

export const courseChapters = pgTable.withRLS("course_chapters", {
  id: uuid("id").defaultRandom().primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  position: integer("position").default(0).notNull(),
  isPublished: boolean("is_published").default(false).notNull(),
}, (table) => [
  index("course_chapters_course_position_idx").on(table.courseId, table.position),
  check("course_chapters_position_check", sql`${table.position} >= 0`),
]);

export const courseLessons = pgTable.withRLS("course_lessons", {
  id: uuid("id").defaultRandom().primaryKey(),
  chapterId: uuid("chapter_id").notNull().references(() => courseChapters.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  durationSeconds: integer("duration_seconds").default(0).notNull(),
  position: integer("position").default(0).notNull(),
  isPublished: boolean("is_published").default(false).notNull(),
}, (table) => [
  index("course_lessons_chapter_position_idx").on(table.chapterId, table.position),
  check("course_lessons_position_check", sql`${table.position} >= 0`),
  check("course_lessons_duration_check", sql`${table.durationSeconds} >= 0`),
]);
