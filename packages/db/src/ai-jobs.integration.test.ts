import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { AiJobEnqueueError, AiJobLeaseError, assertNoActiveAiJob, claimAiJob, enqueueAiJob, expireOneAiJob, finishAiJob, lockAiJob, readAiJob } from "@codi-1/db/ai-jobs";
import { runAiWorker } from "@codi-1/db/ai-worker";
import { relations } from "./relations";

// Explicitly isolated local fixture only. Never run against the shared/prod database.
const connectionString = process.env.AI_JOBS_TEST_DATABASE_URL;
const url = connectionString ? new URL(connectionString) : null;
const safe = url && ["127.0.0.1", "localhost", "::1"].includes(url.hostname) && url.pathname === "/codi_ai_jobs_test";
const suite = safe ? describe : describe.skip;

suite("durable AI job queue (isolated PostgreSQL)", () => {
  const schema = `ai_jobs_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString });
  const pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}` });
  const db = drizzle({ client: pool, relations });
  beforeAll(async () => {
    await admin.query(`create schema "${schema}"`);
    await pool.query('create table "user" (id text primary key)');
    await pool.query("insert into \"user\" (id) values ('owner'), ('other'), ('quota')");
    const migration = await readFile("packages/db/src/migrations/20261031033253_free_toad/migration.sql", "utf8");
    await pool.query(migration.replaceAll("--> statement-breakpoint", ""));
  });
  afterAll(async () => {
    await pool.end();
    await admin.query(`drop schema if exists "${schema}" cascade`);
    await admin.end();
  });
  it("enforces ownership, atomic claim and fencing and purges payload", async () => {
    const id = await enqueueAiJob(db, { type: "knowledge_map", userId: "owner", resourceId: "course", payload: { generation: 3 } });
    expect(await readAiJob(db, id, "other")).toBeNull();
    await expect(enqueueAiJob(db, { type: "knowledge_map", userId: "owner", resourceId: "course" })).rejects.toThrow();
    const claims = await Promise.all([claimAiJob(db, ["knowledge_map"]), claimAiJob(db, ["knowledge_map"])]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const job = claims.find(Boolean)!;
    await expect(db.transaction((tx) => lockAiJob(tx, id, randomUUID()))).rejects.toBeInstanceOf(AiJobLeaseError);
    await db.transaction(async (tx) => {
      await lockAiJob(tx, id, job.leaseToken);
      await finishAiJob(tx, id, job.leaseToken, "completed");
    });
    expect(await readAiJob(db, id, "owner")).toMatchObject({ status: "completed" });
    const rows = await db.execute(sql`select payload from ai_jobs where id = ${id}::uuid`);
    expect(rows.rows[0]?.payload).toBeNull();
    await expect(db.transaction((tx) => finishAiJob(tx, id, job.leaseToken, "completed"))).rejects.toBeInstanceOf(AiJobLeaseError);
  });
  it("fails expired work without rerunning it", async () => {
    const id = await enqueueAiJob(db, { type: "github_profile", userId: "owner", resourceId: "account", payload: { consentVersion: "v1" } });
    const job = await claimAiJob(db, ["github_profile"]);
    expect(job?.id).toBe(id);
    await db.execute(sql`update ai_jobs set lease_until = clock_timestamp() - interval '1 second' where id = ${id}::uuid`);
    let reconciled = false;
    await expect(expireOneAiJob(db, ["github_profile"], async () => { throw new Error("reconciliation failed"); })).rejects.toThrow();
    expect(await readAiJob(db, id, "owner")).toMatchObject({ status: "running" });
    expect(await expireOneAiJob(db, ["github_profile"], async () => { reconciled = true; })).toBe(true);
    expect(reconciled).toBe(true);
    expect(await claimAiJob(db, ["github_profile"])).toBeNull();
    expect(await readAiJob(db, id, "owner")).toMatchObject({ status: "failed", errorCode: "lease_expired" });
    await expect(db.transaction((tx) => lockAiJob(tx, id, job!.leaseToken))).rejects.toBeInstanceOf(AiJobLeaseError);
  });
  it("serializes GitHub analysis enqueue with profile deletion owner locks", async () => {
    let release!: () => void;
    let locked!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const acquired = new Promise<void>((resolve) => { locked = resolve; });
    const transaction = db.transaction(async (tx) => {
      await tx.execute(sql`select id from "user" where id = 'owner' for update`);
      locked();
      await held;
    });
    await acquired;
    let settled = false;
    const enqueue = enqueueAiJob(db, { type: "github_profile", userId: "owner", resourceId: "owner" })
      .finally(() => { settled = true; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(settled).toBe(false);
    } finally {
      release();
      await transaction;
    }
    expect(await enqueue).toBeTruthy();
  });
  it("rejects payloads with credential-shaped keys", async () => {
    for (const name of ["access_token", "accessToken", "sessionId", "privateKey", "api_key"]) {
      await expect(enqueueAiJob(db, { type: "github_profile", userId: "owner", resourceId: "account", payload: { [name]: "do not persist" } })).rejects.toThrow();
    }
  });
  it("runs registered handlers and marks failed work without exposing errors", async () => {
    const id = await enqueueAiJob(db, { type: "quiz_generation", userId: "owner", resourceId: "lesson" });
    const stop = new AbortController();
    let failureHookCalled = false;
    await runAiWorker({
      db,
      signal: stop.signal,
      handlers: { quiz_generation: {
        async run() { throw new Error("private provider response"); },
        async onFailure() { failureHookCalled = true; stop.abort(); },
      } },
    });
    expect(failureHookCalled).toBe(true);
    expect(await readAiJob(db, id, "owner")).toMatchObject({ status: "failed", errorCode: "worker_failed" });
  });
  it("enforces the per-user daily quota atomically for concurrent enqueues", async () => {
    const prior = process.env.AI_DAILY_JOB_LIMIT;
    delete process.env.AI_DAILY_JOB_LIMIT;
    try {
      const attempts = await Promise.allSettled(Array.from({ length: 8 }, (_, n) =>
        enqueueAiJob(db, { type: "quiz_generation", userId: "quota", resourceId: `lesson-${n}` })));
      expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(5);
      const rejected = attempts.filter((x): x is PromiseRejectedResult => x.status === "rejected");
      expect(rejected).toHaveLength(3);
      expect(rejected.every((x) => x.reason instanceof AiJobEnqueueError && x.reason.code === "daily_limit")).toBe(true);
      // A different type has its own quota; GitHub uses its separate reservation budget.
      await expect(enqueueAiJob(db, { type: "knowledge_map", userId: "quota", resourceId: "course" })).resolves.toBeTruthy();
      await expect(enqueueAiJob(db, { type: "github_profile", userId: "quota", resourceId: "account" })).resolves.toBeTruthy();
    } finally {
      if (prior === undefined) delete process.env.AI_DAILY_JOB_LIMIT; else process.env.AI_DAILY_JOB_LIMIT = prior;
    }
  });
  it("does not wait on an active row held by another transaction", async () => {
    const id = await enqueueAiJob(db, { type: "knowledge_map", userId: "other", resourceId: "contended" });
    let release!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => { locked = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select id from ai_jobs where id = ${id}::uuid for update`);
      locked();
      await hold;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('codi:confirmed-knowledge-map:contended', 0))`);
    });
    await ready;
    try {
      await expect(db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('codi:confirmed-knowledge-map:contended', 0))`);
        release();
        await assertNoActiveAiJob(tx, { type: "knowledge_map", userId: "other", resourceId: "contended" });
      }))
        .rejects.toMatchObject({ code: "active_job" });
    } finally { release(); await holder; }
  });
});
