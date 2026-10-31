import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { account, user } from "./auth";

// Private server-owned evidence. A new request never clears the published result.
export const githubProfiles = pgTable.withRLS("github_profiles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().references(() => account.id, { onDelete: "cascade" }),
  activeRequestId: uuid("active_request_id"),
  activeUntil: timestamp("active_until", { withTimezone: true }),
  consentVersion: text("consent_version").notNull(),
  consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
  snapshot: jsonb("snapshot"),
  analysis: jsonb("analysis"),
  corrections: jsonb("corrections").default({}).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => [
  check("github_profiles_active_check", sql`(${table.activeRequestId} IS NULL) = (${table.activeUntil} IS NULL)`),
  check("github_profiles_publication_check", sql`(${table.publishedAt} IS NULL AND ${table.snapshot} IS NULL AND ${table.analysis} IS NULL) OR (${table.publishedAt} IS NOT NULL AND ${table.snapshot} IS NOT NULL AND ${table.analysis} IS NOT NULL)`),
]);

// Append-only accounting survives profile deletion. No credentials or evidence are stored.
// The caller serializes reservations for a budget key before checking its aggregate ceiling.
export const githubGenerationReservations = pgTable.withRLS("github_generation_reservations", {
  budgetKey: text("budget_key").notNull(),
  slot: text("slot").notNull(),
  requestId: uuid("request_id").primaryKey(),
  candidateSha: text("candidate_sha").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  maxOutputTokens: integer("max_output_tokens").notNull(),
  maximumCostMicroUsd: integer("maximum_cost_micro_usd").notNull(),
  reservedAt: timestamp("reserved_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("github_generation_reservations_budget_key_idx").on(table.budgetKey),
  check("github_generation_reservations_tokens_check", sql`${table.inputTokens} BETWEEN 1 AND 16000 AND ${table.maxOutputTokens} BETWEEN 1 AND 4096`),
  check("github_generation_reservations_cost_check", sql`${table.maximumCostMicroUsd} BETWEEN 1 AND 20000`),
  check("github_generation_reservations_sha_check", sql`${table.candidateSha} ~ '^[0-9a-f]{40}$'`),
]);
