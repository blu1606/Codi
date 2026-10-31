import { z } from "zod";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import type { AiJob } from "@codi-1/db/ai-jobs";
import { auth, db } from "@/services";
import { ENV } from "@/env.server";
import { trustedBudget } from "./github-profile-budget";
import { createGithubProfileStore, type GithubProfileRequest } from "./github-profile-store";
import { parseGithubProfileInput, runGithubProfileRequest } from "./github-profile-service";

const payloadSchema = z.object({
  consentVersion: z.literal("public-github-v1"),
  githubProfileInput: z.string().max(300),
  accountId: z.string().min(1).max(300),
  githubUserId: z.string().regex(/^[1-9][0-9]*$/).max(20),
}).strict();

/** One claimed job. This server-only handler never places OAuth tokens in the queue. */
export async function runGithubProfileJob(job: AiJob): Promise<void> {
  const budget = trustedBudget();
  const store = createGithubProfileStore(db, budget);
  const lease = { id: job.id, leaseToken: job.leaseToken };
  let claim: GithubProfileRequest | undefined;
  let finished = false;
  let failure = "request_failed";
  try {
    if (job.type !== "github_profile" || job.resourceId !== job.userId) throw new Error("invalid_job");
    const payload = payloadSchema.parse(job.payload);
    const input = parseGithubProfileInput({ consentVersion: payload.consentVersion, githubProfileInput: payload.githubProfileInput });
    if (!budget || ENV.AI_PROVIDER !== "openai" || ENV.AI_MODEL !== "gpt-6-luna" || !ENV.OPENAI_API_KEY || !ENV.GITHUB_CLIENT_ID || !ENV.GITHUB_CLIENT_SECRET) {
      failure = "not_ready";
      throw new Error("not_ready");
    }
    if (!(await getActiveRoles(db, job.userId)).includes(ROLE.LEARNER)) {
      failure = "unauthorized";
      throw new Error("unauthorized");
    }
    const signal = AbortSignal.timeout(175_000);
    const result = await runGithubProfileRequest(input, {
      abortSignal: signal,
      background: true,
      publicAccess: { mode: "oauth_app", clientId: ENV.GITHUB_CLIENT_ID, clientSecret: ENV.GITHUB_CLIENT_SECRET },
      getLinkedAccount: async (phaseSignal) => {
        phaseSignal.throwIfAborted();
        const linked = await store.getLinkedAccount(job.userId);
        if (!linked || linked.accountId !== payload.accountId || linked.githubUserId !== payload.githubUserId) return null;
        claim = await store.claim({ userId: job.userId, accountId: linked.accountId,
          githubUserId: linked.githubUserId, consentVersion: payload.consentVersion }, lease);
        phaseSignal.throwIfAborted();
        return { accountRowId: linked.accountId, githubUserId: linked.githubUserId };
      },
      getAccessToken: async (accountId, phaseSignal) => {
        phaseSignal.throwIfAborted();
        // No session, HTTP request or client-controlled user id: Better Auth verifies
        // the account belongs to this server-owned job's user before returning a token.
        const token = await auth.api.getAccessToken({ body: { userId: job.userId, accountId } });
        phaseSignal.throwIfAborted();
        return token.accessToken ?? null;
      },
      ai: { apiKey: ENV.OPENAI_API_KEY,
        reserveGeneration: async (reservation) => {
          signal.throwIfAborted();
          return claim ? store.reserveGeneration(claim, reservation, lease) : false;
        },
      },
    });
    signal.throwIfAborted();
    if (!result.ok) { failure = result.code; throw new Error("request_failed"); }
    if (!(await getActiveRoles(db, job.userId)).includes(ROLE.LEARNER)) {
      failure = "unauthorized";
      throw new Error("unauthorized");
    }
    if (!claim) throw new Error("missing_claim");
    if (result.generation) {
      await store.publish(claim, result.snapshot, result.generation.analysis, lease);
    } else {
      // Keep the previous accepted profile and report that no usable observations exist.
      await store.finishBackground(claim, lease, "completed", "no_observations");
    }
    finished = true;
  } catch {
    // Never retry an ambiguous provider dispatch; expose only fixed error codes.
    if (!finished) await store.finishBackground(claim, lease, "failed", failure);
  }
}
