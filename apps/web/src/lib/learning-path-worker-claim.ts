/** Called while holding the selected job's database row lock. */
export function learningPathClaimDisposition(
  job: { id: string; leaseToken: string | null; leaseExpiresAt: Date | null } | undefined,
  now: number,
  observedJobId?: string,
): "skip" | "run" | "recover" {
  if (!job || (observedJobId && job.id !== observedJobId)) return "skip";
  if (job.leaseExpiresAt && job.leaseExpiresAt.getTime() > now) return "skip";
  // An expired claim can have dispatched a paid call before the process died.
  // Reconcile as failed rather than issuing a second call.
  return job.leaseToken ? "recover" : "run";
}

/** Reconcile an ambiguous attempt before enqueueing work for changed inputs. */
export function hasExpiredPathClaim(
  pending: { leaseToken: string | null; leaseExpiresAt: Date | null }[],
  now: number,
): boolean {
  return pending.some((job) => !!job.leaseToken && !!job.leaseExpiresAt && job.leaseExpiresAt.getTime() <= now);
}
