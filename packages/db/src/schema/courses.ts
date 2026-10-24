import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import type { ConfirmedKnowledgeMap } from "./confirmed-knowledge-map";
import { user } from "./auth";

// Course lifecycle — values are the contract in docs/mockup/STATE-MACHINES.md §16.
export const courseStatus = pgEnum("course_status", ["draft", "pending", "rejected", "published", "hidden"]);

// Knowledge-map extraction state for the whole course (STATE-MACHINES.md §18).
export const knowledgeMapStatus = pgEnum("knowledge_map_status", ["empty", "analysing", "ready", "confirmed", "failed", "stale"]);

export const courses = pgTable("courses", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  level: text("level").notNull(),
  duration: text("duration").notNull(),
  description: text("description").notNull(),
  // VND has no minor unit, so prices are whole numbers. Owned by Admin (UC-38).
  price: integer("price").default(0).notNull(),
  // Lecturer proposes a price; Admin confirms/sets final price on approval (STATE-MACHINES §16).
  proposedPrice: integer("proposed_price"),
  instructorId: text("instructor_id").references(() => user.id),
  rating: real("rating").default(0).notNull(),
  reviewCount: integer("review_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

  status: courseStatus("status").default("draft").notNull(),
  // Shown to the lecturer when an admin hides a published course (reason is mandatory).
  hiddenReason: text("hidden_reason"),
  priceUpdatedBy: text("price_updated_by").references(() => user.id),
  priceUpdatedAt: timestamp("price_updated_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),

  // UC-26: the map itself lives in skills / skill_prerequisites; these columns record the extraction run.
  knowledgeMapStatus: knowledgeMapStatus("knowledge_map_status").default("empty").notNull(),
  knowledgeMapModel: text("knowledge_map_model"),
  // Lets the app skip re-extraction when the authored content has not changed.
  knowledgeMapContentHash: text("knowledge_map_content_hash"),
  knowledgeMapGeneratedAt: timestamp("knowledge_map_generated_at", { withTimezone: true }),
  confirmedKnowledgeMap: jsonb("confirmed_knowledge_map").$type<ConfirmedKnowledgeMap>(),
  knowledgeMapContentGeneration: integer("knowledge_map_content_generation").default(0).notNull(),
  knowledgeMapAnalysisGeneration: integer("knowledge_map_analysis_generation"),
}, (table) => [
  index("courses_status_level_idx").on(table.status, table.level),
  index("courses_instructor_idx").on(table.instructorId),
  check("courses_price_check", sql`${table.price} >= 0`),
  check("courses_hidden_reason_check", sql`${table.status} <> 'hidden' OR ${table.hiddenReason} IS NOT NULL`),
]);
