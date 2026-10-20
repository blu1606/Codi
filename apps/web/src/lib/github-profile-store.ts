import { randomUUID } from "node:crypto";
import {
  and,
  count,
  eq,
  gt,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@codi-1/db";
import { account, user } from "@codi-1/db/schema/auth";
import {
  githubProfiles,
  githubGenerationReservations,
} from "@codi-1/db/schema/github-profile";
import type { GithubCollectionSnapshot } from "./github-profile-contract";
import type { GithubProfileGenerationReservation } from "./github-profile-ai";
import {
  githubProfileCorrectionsSchema,
  projectGithubProfile,
  validateGithubProfileAnalysis,
  type GithubProfileAnalysis,
  type GithubProfileCorrections,
} from "./github-profile-analysis-contract";

const id = z.string().min(1).max(300);
const githubId = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .max(20);
const claimInput = z
  .object({
    userId: id,
    accountId: id,
    githubUserId: githubId,
    consentVersion: z.literal("public-github-v1"),
  })
  .strict();
const requestSchema = claimInput.extend({
  requestId: z.string().uuid(),
  consentedAt: z.date(),
  activeUntil: z.date(),
});
const budgetSchema = z
  .object({
    budgetKey: id,
    slot: z.enum(["pre-integration", "integrated"]),
    candidateSha: z.string().regex(/^[0-9a-f]{40}$/),
  })
  .strict();
const reservationSchema = z
  .object({
    model: z.literal("openai/gpt-6-luna"),
    inputTokens: z.number().int().min(1).max(16_000),
    maxOutputTokens: z.literal(4096),
    maximumCostMicroUsd: z.number().int().min(1).max(20_000),
  })
  .strict()
  .refine(
    (item) =>
      item.maximumCostMicroUsd >= Math.ceil(item.inputTokens / 8 + 4096 / 2),
  );

export type GithubProfileClaimInput = z.infer<typeof claimInput>;
export type GithubProfileRequest = z.infer<typeof requestSchema>;
/** Server-owned configuration, never populated from a client request. */
export type GithubProfileTrustedBudget = z.infer<typeof budgetSchema>;
export interface GithubLinkedAccount {
  accountId: string;
  userId: string;
  githubUserId: string;
}
export interface GithubStoredProfile {
  accountId: string;
  githubUserId: string;
  snapshot: GithubCollectionSnapshot;
  analysis: GithubProfileAnalysis;
  corrections: GithubProfileCorrections;
  publishedAt: Date;
}
export class GithubProfileStoreError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "account_unavailable"
      | "active_request"
      | "request_fenced"
      | "invalid_profile"
      | "store_failed",
  ) {
    super(`GitHub profile store: ${code}`);
    this.name = "GithubProfileStoreError";
  }
}
type Store = Pick<Database, "select" | "insert" | "update" | "execute">;
// pg timestamps have microseconds, but pg/JS Dates preserve milliseconds. Store consent
// stamps at that precision so equality fences survive a database round-trip.
const databaseNow = sql`date_trunc('milliseconds', clock_timestamp())`;
const accountFields = {
  accountId: account.id,
  userId: account.userId,
  githubUserId: account.accountId,
};
const accountWhere = (request: GithubProfileClaimInput) =>
  and(
    eq(account.id, request.accountId),
    eq(account.userId, request.userId),
    eq(account.providerId, "github"),
    eq(account.accountId, request.githubUserId),
  );
const requestWhere = (request: GithubProfileRequest) =>
  and(
    eq(githubProfiles.userId, request.userId),
    eq(githubProfiles.accountId, request.accountId),
    eq(githubProfiles.activeRequestId, request.requestId),
    eq(githubProfiles.activeUntil, request.activeUntil),
    gt(githubProfiles.activeUntil, sql`clock_timestamp()`),
    eq(githubProfiles.consentVersion, request.consentVersion),
    eq(githubProfiles.consentedAt, request.consentedAt),
  );

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(structuredClone(value));
  } catch {
    throw new GithubProfileStoreError("invalid_input");
  }
}
async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof GithubProfileStoreError) throw error;
    throw new GithubProfileStoreError("store_failed");
  }
}
async function lockAccount(store: Store, request: GithubProfileClaimInput) {
  // Serializes first profile creation too, where no profile row yet exists to lock.
  const [owner] = await store
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, request.userId))
    .for("update");
  if (!owner) throw new GithubProfileStoreError("account_unavailable");
  const [linked] = await store
    .select(accountFields)
    .from(account)
    .where(accountWhere(request))
    .for("update");
  if (!linked || !githubId.safeParse(linked.githubUserId).success)
    throw new GithubProfileStoreError("account_unavailable");
  return linked;
}
async function lockRequest(store: Store, request: GithubProfileRequest) {
  await lockAccount(store, request);
  const [profile] = await store
    .select()
    .from(githubProfiles)
    .where(requestWhere(request))
    .for("update");
  if (!profile) throw new GithubProfileStoreError("request_fenced");
  return profile;
}
function storedIdentity(snapshot: unknown, expectedId: string) {
  return (
    snapshot === null ||
    (snapshot as GithubCollectionSnapshot)?.identity?.id === expectedId
  );
}

/** All userIds originate from the authenticated session owner. No admin/lecturer bypass.
 * This module receives a DB handle; it never opens a connection or reads credentials. */
export function createGithubProfileStore(
  database: Database,
  trustedBudget?: GithubProfileTrustedBudget,
) {
  const budget =
    trustedBudget === undefined ? null : parse(budgetSchema, trustedBudget);
  return {
    async getLinkedAccount(
      userId: string,
    ): Promise<GithubLinkedAccount | null> {
      parse(id, userId);
      return safe(async () => {
        const rows = await database
          .select(accountFields)
          .from(account)
          .where(
            and(eq(account.userId, userId), eq(account.providerId, "github")),
          )
          .limit(2);
        if (!rows.length) return null;
        if (
          rows.length !== 1 ||
          !githubId.safeParse(rows[0]!.githubUserId).success
        )
          throw new GithubProfileStoreError("account_unavailable");
        return rows[0]!;
      });
    },
    async claim(input: GithubProfileClaimInput): Promise<GithubProfileRequest> {
      const request = parse(claimInput, input);
      return safe(() =>
        database.transaction(
          async (tx) => {
            await lockAccount(tx, request);
            await tx
              .insert(githubProfiles)
              .values({
                userId: request.userId,
                accountId: request.accountId,
                consentVersion: request.consentVersion,
                consentedAt: databaseNow,
              })
              .onConflictDoNothing({ target: githubProfiles.userId });
            const [prior] = await tx
              .select()
              .from(githubProfiles)
              .where(eq(githubProfiles.userId, request.userId))
              .for("update");
            if (
              !prior ||
              prior.accountId !== request.accountId ||
              !storedIdentity(prior.snapshot, request.githubUserId)
            )
              throw new GithubProfileStoreError("request_fenced");
            const [claimed] = await tx
              .update(githubProfiles)
              .set({
                activeRequestId: randomUUID(),
                activeUntil: sql`${databaseNow} + interval '55 seconds'`,
                consentVersion: request.consentVersion,
                consentedAt: databaseNow,
              })
              .where(
                and(
                  eq(githubProfiles.userId, request.userId),
                  eq(githubProfiles.accountId, request.accountId),
                  or(
                    isNull(githubProfiles.activeRequestId),
                    lte(githubProfiles.activeUntil, sql`clock_timestamp()`),
                  ),
                ),
              )
              .returning({
                requestId: githubProfiles.activeRequestId,
                activeUntil: githubProfiles.activeUntil,
                consentedAt: githubProfiles.consentedAt,
              });
            if (!claimed?.requestId || !claimed.activeUntil)
              throw new GithubProfileStoreError("active_request");
            return parse(requestSchema, { ...request, ...claimed });
          },
          { isolationLevel: "read committed" },
        ),
      );
    },
    async release(input: GithubProfileRequest): Promise<boolean> {
      const request = parse(requestSchema, input);
      return safe(async () => {
        const rows = await database
          .update(githubProfiles)
          .set({ activeRequestId: null, activeUntil: null })
          .where(
            and(
              eq(githubProfiles.userId, request.userId),
              eq(githubProfiles.accountId, request.accountId),
              eq(githubProfiles.activeRequestId, request.requestId),
              eq(githubProfiles.activeUntil, request.activeUntil),
              eq(githubProfiles.consentVersion, request.consentVersion),
              eq(githubProfiles.consentedAt, request.consentedAt),
            ),
          )
          .returning({ userId: githubProfiles.userId });
        return rows.length === 1;
      });
    },
    async publish(
      input: GithubProfileRequest,
      snapshot: GithubCollectionSnapshot,
      analysis: GithubProfileAnalysis,
    ): Promise<void> {
      const request = parse(requestSchema, input);
      let retained: GithubCollectionSnapshot;
      let proposed: GithubProfileAnalysis;
      try {
        retained = structuredClone(snapshot);
        if (
          retained.status === "failed" ||
          retained.identity?.id !== request.githubUserId
        )
          throw new Error("identity_mismatch");
        proposed = validateGithubProfileAnalysis(retained, analysis);
        if (
          (!proposed.technologies.length &&
            !proposed.areas.length &&
            !proposed.overall) ||
          projectGithubProfile(retained, proposed).observationAvailability !==
            "observed"
        )
          throw new Error("empty_analysis");
      } catch {
        throw new GithubProfileStoreError("invalid_profile");
      }
      await safe(() =>
        database.transaction(
          async (tx) => {
            const current = await lockRequest(tx, request);
            // Validate current corrections, but never replace them with the generation's old copy.
            try {
              projectGithubProfile(retained, proposed, current.corrections);
            } catch {
              throw new GithubProfileStoreError("invalid_profile");
            }
            const rows = await tx
              .update(githubProfiles)
              .set({
                snapshot: retained,
                analysis: proposed,
                publishedAt: databaseNow,
                activeRequestId: null,
                activeUntil: null,
              })
              .where(requestWhere(request))
              .returning({ userId: githubProfiles.userId });
            if (rows.length !== 1)
              throw new GithubProfileStoreError("request_fenced");
          },
          { isolationLevel: "read committed" },
        ),
      );
    },
    async read(userId: string): Promise<GithubStoredProfile | null> {
      parse(id, userId);
      return safe(async () => {
        const [stored] = await database
          .select({
            accountId: githubProfiles.accountId,
            githubUserId: account.accountId,
            snapshot: githubProfiles.snapshot,
            analysis: githubProfiles.analysis,
            corrections: githubProfiles.corrections,
            publishedAt: githubProfiles.publishedAt,
          })
          .from(githubProfiles)
          .innerJoin(
            account,
            and(
              eq(account.id, githubProfiles.accountId),
              eq(account.userId, userId),
              eq(account.providerId, "github"),
            ),
          )
          .where(
            and(
              eq(githubProfiles.userId, userId),
              isNotNull(githubProfiles.publishedAt),
            ),
          )
          .limit(1);
        if (
          !stored ||
          !githubId.safeParse(stored.githubUserId).success ||
          !storedIdentity(stored.snapshot, stored.githubUserId)
        )
          return null;
        try {
          const snapshot = stored.snapshot as GithubCollectionSnapshot;
          const analysis = validateGithubProfileAnalysis(
            snapshot,
            stored.analysis,
          );
          const corrections = githubProfileCorrectionsSchema.parse(
            stored.corrections,
          );
          projectGithubProfile(snapshot, analysis, corrections);
          if (!stored.publishedAt) throw new Error("missing_publication");
          return {
            ...stored,
            snapshot,
            analysis,
            corrections,
            publishedAt: stored.publishedAt,
          };
        } catch {
          throw new GithubProfileStoreError("invalid_profile");
        }
      });
    },
    async reserveGeneration(
      input: GithubProfileRequest,
      reservationInput: Readonly<GithubProfileGenerationReservation>,
    ): Promise<boolean> {
      if (!budget) return false;
      const request = parse(requestSchema, input);
      const reservation = parse(reservationSchema, reservationInput);
      return safe(() =>
        database.transaction(
          async (tx) => {
            // A transaction-scoped, server-derived key serializes count/cost/slot decisions.
            // READ COMMITTED ensures the aggregate sees the preceding lock holder's commit.
            await tx.execute(
              sql`select pg_advisory_xact_lock(hashtextextended(${`github-profile-generation:${budget.budgetKey}`}, 0))`,
            );
            await lockRequest(tx, request);
            const [usage] = await tx
              .select({
                attempts: count(),
                cost: sql`coalesce(sum(${githubGenerationReservations.maximumCostMicroUsd}), 0)`.mapWith(
                  Number,
                ),
              })
              .from(githubGenerationReservations)
              .where(
                eq(githubGenerationReservations.budgetKey, budget.budgetKey),
              );
            if (
              !usage ||
              !Number.isSafeInteger(usage.attempts) ||
              !Number.isSafeInteger(usage.cost) ||
              usage.attempts < 0 ||
              usage.cost < 0
            )
              throw new GithubProfileStoreError("store_failed");
            if (
              usage.attempts >= 2 ||
              usage.cost + reservation.maximumCostMicroUsd > 20_000
            )
              return false;
            // INSERT ... SELECT rechecks expiry and the whole request/account/consent fence
            // at the actual insertion, not only before the aggregate. No UPDATE/refund exists.
            const inserted =
              await tx.execute(sql`insert into ${githubGenerationReservations}
          ("budget_key", "slot", "request_id", "candidate_sha", "model", "input_tokens", "max_output_tokens", "maximum_cost_micro_usd")
          select ${budget.budgetKey}, ${budget.slot}, ${request.requestId}, ${budget.candidateSha}, ${reservation.model}, ${reservation.inputTokens}, ${reservation.maxOutputTokens}, ${reservation.maximumCostMicroUsd}
          from ${githubProfiles} inner join ${account} on ${account.id} = ${githubProfiles.accountId}
          where ${requestWhere(request)} and ${accountWhere(request)}
          on conflict do nothing returning "request_id"`);
            return inserted.rows.length === 1;
          },
          { isolationLevel: "read committed" },
        ),
      );
    },
  };
}
export type GithubProfileStore = ReturnType<typeof createGithubProfileStore>;
