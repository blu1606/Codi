import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { codingRunLeases } from "@codi-1/db/schema/coding-exercises";
import { RUN_LEASE_MS } from "@codi-1/coding-runner";
import { LearningPathError } from "./learning-path-contract";

// Learner, lecturer, tutorial and assignment runs share codingRunLeases. The lease must outlast one full
// sandbox call (cold start, execution, watchdog) plus finalization, so it comes from the runner's budget.
export const runLeaseExpiresAt = sql`clock_timestamp() + ${sql.raw(`interval '${RUN_LEASE_MS} milliseconds'`)}`;

type Store = Pick<Database, "select" | "insert" | "update">;

/**
 * Takes the user's run lease (one sandbox run at a time per user, at most one start every 2 seconds) or throws
 * 409 while a run is in progress / 429 when the user runs too fast.
 */
export async function acquireRunLease(store: Store, userId: string, token: string) {
  const [lease] = await store
    .insert(codingRunLeases)
    .values({
      userId,
      token,
      runningUntil: runLeaseExpiresAt,
      lastStartedAt: sql`clock_timestamp()`,
    })
    .onConflictDoUpdate({
      target: codingRunLeases.userId,
      set: {
        token,
        runningUntil: runLeaseExpiresAt,
        lastStartedAt: sql`clock_timestamp()`,
      },
      setWhere: sql`${codingRunLeases.runningUntil} <= clock_timestamp() and ${codingRunLeases.lastStartedAt} <= clock_timestamp() - interval '2 seconds'`,
    })
    .returning();
  if (lease) return lease;
  const [existing] = await store
    .select()
    .from(codingRunLeases)
    .where(eq(codingRunLeases.userId, userId));
  if (existing && existing.runningUntil > new Date())
    throw new LearningPathError("Bài tập đang chạy. Vui lòng chờ kết quả.", 409);
  throw new LearningPathError(
    "Bạn chạy code quá nhanh. Vui lòng chờ 2 giây rồi thử lại.",
    429,
  );
}

/** Ends the run; an old request never releases a newer request's lease. */
export async function releaseRunLease(store: Store, userId: string, token: string) {
  await store
    .update(codingRunLeases)
    .set({ runningUntil: sql`clock_timestamp()` })
    .where(
      and(eq(codingRunLeases.userId, userId), eq(codingRunLeases.token, token)),
    );
}
