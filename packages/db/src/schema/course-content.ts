import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { courses } from "./courses";

export const courseLessonKind = pgEnum("course_lesson_kind", ["reading", "video", "pdf", "coding", "tutorial"]);

export const courseDetails = pgTable.withRLS("course_details", {
  courseId: text("course_id").primaryKey().references(() => courses.id, { onDelete: "cascade" }),
  learningOutcomes: text("learning_outcomes").array().default(sql`'{}'::text[]`).notNull(),
  requirements: text("requirements").array().default(sql`'{}'::text[]`).notNull(),
  targetAudience: text("target_audience"),
  coverImageUrl: text("cover_image_url"),
  introVideoUrl: text("intro_video_url"),
  introVideoCaptionsUrl: text("intro_video_captions_url"),
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
  // Reading text of the lesson; video / PDF / slides live in lesson_materials.
  body: text("body"),
  // "Học thử": open to guests on the course detail page.
  isFreePreview: boolean("is_free_preview").default(false).notNull(),
  // Remedial lessons are only scheduled by the personalised path when mastery is low.
  isRemedial: boolean("is_remedial").default(false).notNull(),
  kind: courseLessonKind("kind").default("reading").notNull(),
}, (table) => [
  index("course_lessons_chapter_position_idx").on(table.chapterId, table.position),
  check("course_lessons_position_check", sql`${table.position} >= 0`),
  check("course_lessons_duration_check", sql`${table.durationSeconds} >= 0`),
]);

export const lessonMaterialType = pgEnum("lesson_material_type", ["video", "pdf", "slide", "document", "link"]);

// A lesson owns an ordered list of materials (lecture video, PDF / slide deck, links).
export const lessonMaterials = pgTable.withRLS("lesson_materials", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  type: lessonMaterialType("type").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  fileSizeKb: integer("file_size_kb"),
  durationSeconds: integer("duration_seconds"),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("lesson_materials_lesson_position_idx").on(table.lessonId, table.position),
  check("lesson_materials_size_check", sql`${table.fileSizeKb} IS NULL OR ${table.fileSizeKb} > 0`),
  check("lesson_materials_duration_check", sql`${table.durationSeconds} IS NULL OR ${table.durationSeconds} >= 0`),
  check("lesson_materials_position_check", sql`${table.position} >= 0`),
]);
