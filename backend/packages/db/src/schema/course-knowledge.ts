import { bigint, index, integer, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { courses } from "./courses";
import { courseLessons, lessonMaterials } from "./course-content";

// Searchable course knowledge for the AI Tutor: every published lesson text and every uploaded material (PDF/slide
// text + OCR, video transcript) is split into chunks with an embedding. A source is re-indexed when its content hash
// (which includes the embedding model) changes; `failed` sources are retried later, `skipped` ones only on change.
export const knowledgeSourceStatus = pgEnum("knowledge_source_status", ["ready", "failed", "skipped"]);

export const courseKnowledgeSources = pgTable.withRLS("course_knowledge_sources", {
  // "lesson:<lesson uuid>" or "material:<material id>".
  sourceKey: text("source_key").primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  materialId: bigint("material_id", { mode: "number" }).references(() => lessonMaterials.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  contentHash: text("content_hash").notNull(),
  // Search only compares vectors made by the model currently configured.
  embeddingModel: text("embedding_model").notNull(),
  status: knowledgeSourceStatus("status").notNull(),
  error: text("error"),
  chunkCount: integer("chunk_count").default(0).notNull(),
  indexedAt: timestamp("indexed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("course_knowledge_sources_course_idx").on(table.courseId),
]);

export const courseKnowledgeChunks = pgTable.withRLS("course_knowledge_chunks", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  sourceKey: text("source_key").notNull().references(() => courseKnowledgeSources.sourceKey, { onDelete: "cascade" }),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  content: text("content").notNull(),
  // Unit-length vector, so the dot product is the cosine similarity.
  embedding: real("embedding").array().notNull(),
}, (table) => [
  index("course_knowledge_chunks_course_idx").on(table.courseId),
  uniqueIndex("course_knowledge_chunks_source_position_idx").on(table.sourceKey, table.position),
]);
