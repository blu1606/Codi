import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

// Server-owned queue. Payload is bounded request input, never credentials or raw model output.
export const aiJobs = pgTable.withRLS("ai_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  resourceId: text("resource_id").notNull(),
  payload: jsonb("payload"),
  status: text("status").notNull().default("queued"),
  leaseToken: uuid("lease_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  errorCode: text("error_code"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("ai_jobs_type_check", sql`${table.type} in ('github_profile', 'knowledge_map', 'quiz_generation')`),
  check("ai_jobs_status_check", sql`${table.status} in ('queued', 'running', 'completed', 'failed')`),
  check("ai_jobs_lease_check", sql`(${table.status} = 'running' and ${table.leaseToken} is not null and ${table.leaseUntil} is not null) or (${table.status} <> 'running' and ${table.leaseToken} is null and ${table.leaseUntil} is null)`),
  check("ai_jobs_payload_size_check", sql`${table.payload} is null or octet_length(${table.payload}::text) <= 65536`),
  index("ai_jobs_queue_idx").on(table.status, table.createdAt),
  index("ai_jobs_quota_idx").on(table.type, table.userId, table.createdAt),
  uniqueIndex("ai_jobs_active_unique_idx").on(table.type, table.userId, table.resourceId).where(sql`${table.status} in ('queued', 'running')`),
]);
