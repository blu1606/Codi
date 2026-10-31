import type { Database } from "./index";
import { AiJobLeaseError, claimAiJob, expireOneAiJob, finishAiJob, lockAiJob, type AiJob, type AiJobType } from "./ai-jobs";

export type AiWorkerTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export interface AiJobHandler {
  // Handler writes results and finishes the job inside one fenced transaction.
  run(job: AiJob): Promise<void>;
  // Optional domain failure transition, executed inside the fenced failure transaction.
  onFailure?(tx: AiWorkerTransaction, job: AiJob): Promise<void>;
}

/** Single-process bounded worker; it only claims types with explicitly registered handlers. */
export async function runAiWorker(options: {
  db: Database;
  handlers: Partial<Record<AiJobType, AiJobHandler>>;
  signal: AbortSignal;
  leaseSeconds?: number;
  pollMs?: number;
  // Run one item from an additional queue. True means it did work; alternate with generic jobs.
  idle?: () => Promise<boolean>;
}): Promise<void> {
  const types = Object.keys(options.handlers) as AiJobType[];
  if (!types.length || types.some((type) => !options.handlers[type])) throw new Error("No AI worker handlers registered");
  const pollMs = options.pollMs ?? 5_000;
  if (!Number.isInteger(pollMs) || pollMs < 1000 || pollMs > 60_000) throw new Error("Invalid worker poll interval");
  const wait = () => new Promise<void>((resolve) => {
    if (options.signal.aborted) return resolve();
    const timer = setTimeout(done, pollMs);
    function done() { clearTimeout(timer); options.signal.removeEventListener("abort", done); resolve(); }
    options.signal.addEventListener("abort", done, { once: true });
  });
  let preferIdle = false;
  const runIdle = async () => {
    if (!options.idle) return false;
    try { return await options.idle(); }
    catch { console.error("AI worker could not process an auxiliary job"); return false; }
  };
  while (!options.signal.aborted) {
    let job: AiJob | null;
    try {
      const expired = await expireOneAiJob(options.db, types, async (tx, expiredJob) => {
        await options.handlers[expiredJob.type]?.onFailure?.(tx, expiredJob);
      });
      if (expired) continue;
      if (preferIdle && await runIdle()) { preferIdle = false; continue; }
      job = await claimAiJob(options.db, types, options.leaseSeconds);
    } catch {
      console.error("AI worker could not claim a job");
      await wait();
      continue;
    }
    if (!job) { if (!preferIdle && await runIdle()) { preferIdle = false; continue; } await wait(); preferIdle = false; continue; }
    preferIdle = true;
    const handler = options.handlers[job.type]!;
    try {
      await handler.run(job);
    } catch {
      // Error details can contain source material or credentials; never log them.
      try {
        await options.db.transaction(async (tx) => {
          await lockAiJob(tx, job.id, job.leaseToken);
          if (handler.onFailure) await handler.onFailure(tx, job);
          await finishAiJob(tx, job.id, job.leaseToken, "failed", "worker_failed");
        });
      } catch (error) {
        if (!(error instanceof AiJobLeaseError)) console.error("AI worker could not finalize a failed job");
      }
    }
  }
}
