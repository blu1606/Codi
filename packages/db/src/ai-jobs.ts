import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./index";

export const aiJobTypes = ["github_profile", "knowledge_map", "quiz_generation"] as const;
export type AiJobType = typeof aiJobTypes[number];
type SqlClient = Pick<Database, "execute">;
type TransactionalClient = Pick<Database, "execute" | "transaction">;
export type AiJob = { id: string; type: AiJobType; userId: string; resourceId: string; payload: unknown; leaseToken: string };
export type AiJobStatus = { id: string; type: AiJobType; status: "queued" | "running" | "completed" | "failed"; errorCode: string | null; createdAt: Date; updatedAt: Date };
export class AiJobLeaseError extends Error {
  constructor() { super("AI job lease is no longer valid"); this.name = "AiJobLeaseError"; }
}
export class AiJobEnqueueError extends Error {
  constructor(public readonly code: "active_job" | "daily_limit" | "store_failed") { super(`AI job enqueue failed: ${code}`); this.name = "AiJobEnqueueError"; }
}

const identifier = z.string().min(1).max(300);
const uuid = z.string().uuid();
const jobType = z.enum(aiJobTypes);
const statusSchema = z.object({ id: uuid, type: jobType, status: z.enum(["queued", "running", "completed", "failed"]), errorCode: z.string().nullable(), createdAt: z.coerce.date(), updatedAt: z.coerce.date() });
// Defense in depth, not a replacement for strict per-producer payload schemas.
const secretKey = /(?:password|passphrase|secret|token|cookie|authorization|credentials?|session(?:[_-]?id)?|api[_-]?key|private[_-]?key)$/i;
function validatePayload(input: unknown): string | null {
  if (input == null) return null;
  const scan = (value: unknown, depth: number): void => {
    if (depth > 12) throw new Error("Invalid AI job payload");
    if (Array.isArray(value)) { for (const item of value) scan(item, depth + 1); }
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (secretKey.test(key)) throw new Error("Credentials cannot be stored in AI jobs");
        scan(item, depth + 1);
      }
    }
  };
  scan(input, 0);
  const value = JSON.stringify(input);
  if (!value || Buffer.byteLength(value, "utf8") > 60_000) throw new Error("AI job payload is too large");
  return value;
}

/** Enqueue inside the same transaction as domain-state changes. Unique active jobs are rejected by PostgreSQL. */
export async function enqueueAiJob(db: TransactionalClient, input: { type: AiJobType; userId: string; resourceId: string; payload?: unknown }): Promise<string> {
  const type = jobType.parse(input.type);
  const userId = identifier.parse(input.userId);
  const resourceId = identifier.parse(input.resourceId);
  const payload = validatePayload(input.payload);
  try {
    return await db.transaction(async (tx) => {
      if (type === "knowledge_map" || type === "quiz_generation") {
        const configured = process.env.AI_DAILY_JOB_LIMIT;
        // Invalid operator configuration fails closed; a missing value defaults to five.
        if (configured !== undefined && !/^[1-9][0-9]{0,2}$/.test(configured)) throw new AiJobEnqueueError("store_failed");
        const limit = configured === undefined ? 5 : Number(configured);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`ai-job-quota:${type}:${userId}`}, 0))`);
        const usage = await tx.execute(sql`select count(*)::integer as count from ai_jobs
          where type = ${type} and user_id = ${userId}
            and created_at >= (date_trunc('day', clock_timestamp() at time zone 'UTC') at time zone 'UTC')`);
        if (Number(usage.rows[0]?.count) >= limit) throw new AiJobEnqueueError("daily_limit");
      }
      const result = await tx.execute(sql`insert into ai_jobs (type, user_id, resource_id, payload)
        values (${type}, ${userId}, ${resourceId}, ${payload}::jsonb) returning id`);
      return uuid.parse(result.rows[0]?.id);
    });
  } catch (error) {
    if (error instanceof AiJobEnqueueError) throw error;
    // Drizzle's raw exception includes SQL parameters, including private source text.
    const cause = error instanceof Error ? error.cause : undefined;
    const conflict = !!cause && typeof cause === "object" && "code" in cause && cause.code === "23505";
    throw new AiJobEnqueueError(conflict ? "active_job" : "store_failed");
  }
}

/** Call after a domain lock and before enqueue when workers lock job rows before domain rows. */
export async function assertNoActiveAiJob(tx: SqlClient, input: { type: AiJobType; userId: string; resourceId: string }): Promise<void> {
  const type = jobType.parse(input.type), userId = identifier.parse(input.userId), resourceId = identifier.parse(input.resourceId);
  try {
    const result = await tx.execute(sql`select id from ai_jobs where type = ${type} and user_id = ${userId}
      and resource_id = ${resourceId} and status in ('queued', 'running') for update nowait`);
    if (result.rows.length) throw new AiJobEnqueueError("active_job");
  } catch (error) {
    if (error instanceof AiJobEnqueueError) throw error;
    const cause = error instanceof Error ? error.cause : undefined;
    if (!!cause && typeof cause === "object" && "code" in cause && cause.code === "55P03") throw new AiJobEnqueueError("active_job");
    throw new AiJobEnqueueError("store_failed");
  }
}

/** Claims one queued job. Timed-out work is reconciled separately, never replayed automatically. */
export async function claimAiJob(db: SqlClient, types: readonly AiJobType[], leaseSeconds = 300): Promise<AiJob | null> {
  const validTypes = z.array(jobType).min(1).parse(types);
  z.number().int().min(10).max(3600).parse(leaseSeconds);
  const result = await db.execute(sql`with candidate as (
      select id from ai_jobs where status = 'queued' and type in (${sql.join(validTypes.map((type) => sql`${type}`), sql`, `)})
      order by created_at, id for update skip locked limit 1
    ) update ai_jobs j set status = 'running', lease_token = gen_random_uuid(),
      lease_until = clock_timestamp() + (${leaseSeconds} * interval '1 second'), attempts = attempts + 1,
      updated_at = clock_timestamp() from candidate where j.id = candidate.id
    returning j.id, j.type, j.user_id as "userId", j.resource_id as "resourceId", j.payload, j.lease_token as "leaseToken"`);
  const row = result.rows[0];
  if (!row) return null;
  return { id: uuid.parse(row.id), type: jobType.parse(row.type), userId: identifier.parse(row.userId), resourceId: identifier.parse(row.resourceId), payload: row.payload, leaseToken: uuid.parse(row.leaseToken) };
}

/** Reconcile an expired job with its domain state while holding the job lock. Never redispatch it. */
export async function expireOneAiJob(db: Database, types: readonly AiJobType[], onExpired: (tx: Parameters<Parameters<Database["transaction"]>[0]>[0], job: AiJob) => Promise<void>): Promise<boolean> {
  const validTypes = z.array(jobType).min(1).parse(types);
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`select id, type, user_id as "userId", resource_id as "resourceId", payload, lease_token as "leaseToken"
      from ai_jobs where status = 'running' and lease_until <= clock_timestamp()
      and type in (${sql.join(validTypes.map((type) => sql`${type}`), sql`, `)})
      order by lease_until, id for update skip locked limit 1`);
    const row = result.rows[0];
    if (!row) return false;
    const job: AiJob = { id: uuid.parse(row.id), type: jobType.parse(row.type), userId: identifier.parse(row.userId), resourceId: identifier.parse(row.resourceId), payload: row.payload, leaseToken: uuid.parse(row.leaseToken) };
    await onExpired(tx, job);
    await tx.execute(sql`update ai_jobs set status = 'failed', error_code = 'lease_expired', payload = null,
      lease_token = null, lease_until = null, updated_at = clock_timestamp() where id = ${job.id}::uuid`);
    return true;
  });
}

/** Must run inside the same transaction as the domain write and finishAiJob. */
export async function lockAiJob(tx: SqlClient, id: string, leaseToken: string): Promise<void> {
  uuid.parse(id); uuid.parse(leaseToken);
  const result = await tx.execute(sql`select id from ai_jobs where id = ${id}::uuid and status = 'running'
    and lease_token = ${leaseToken}::uuid and lease_until > clock_timestamp() for update`);
  if (result.rows.length !== 1) throw new AiJobLeaseError();
}

export async function finishAiJob(tx: SqlClient, id: string, leaseToken: string, status: "completed" | "failed", errorCode?: string): Promise<void> {
  uuid.parse(id); uuid.parse(leaseToken);
  z.enum(["completed", "failed"]).parse(status);
  const safeCode = errorCode === undefined ? null : z.string().regex(/^[a-z0-9_]{1,80}$/).parse(errorCode);
  const result = await tx.execute(sql`update ai_jobs set status = ${status}, error_code = ${safeCode}, payload = null,
    lease_token = null, lease_until = null, updated_at = clock_timestamp()
    where id = ${id}::uuid and status = 'running' and lease_token = ${leaseToken}::uuid
      and lease_until > clock_timestamp() returning id`);
  if (result.rows.length !== 1) throw new AiJobLeaseError();
}

/** Only status metadata is exposed to the owning user; request payload is never returned. */
export async function readAiJob(db: SqlClient, id: string, userId: string): Promise<AiJobStatus | null> {
  uuid.parse(id); identifier.parse(userId);
  const result = await db.execute(sql`select id, type, status, error_code as "errorCode", created_at as "createdAt", updated_at as "updatedAt"
    from ai_jobs where id = ${id}::uuid and user_id = ${userId} limit 1`);
  return result.rows[0] ? statusSchema.parse(result.rows[0]) : null;
}

export async function readLatestAiJob(db: SqlClient, input: { type: AiJobType; userId: string; resourceId: string }): Promise<AiJobStatus | null> {
  const type = jobType.parse(input.type);
  const userId = identifier.parse(input.userId);
  const resourceId = identifier.parse(input.resourceId);
  const result = await db.execute(sql`select id, type, status, error_code as "errorCode", created_at as "createdAt", updated_at as "updatedAt"
    from ai_jobs where type = ${type} and user_id = ${userId} and resource_id = ${resourceId}
    order by created_at desc, id desc limit 1`);
  return result.rows[0] ? statusSchema.parse(result.rows[0]) : null;
}
