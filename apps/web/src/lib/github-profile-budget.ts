import type { GithubProfileTrustedBudget } from "./github-profile-store";

// Runtime-only operator settings. Missing settings fail closed; never read from request JSON.
export function trustedBudget(): GithubProfileTrustedBudget | undefined {
  const budgetKey = process.env.GITHUB_PROFILE_BUDGET_KEY;
  const slot = process.env.GITHUB_PROFILE_BUDGET_SLOT;
  const candidateSha = process.env.GITHUB_PROFILE_CANDIDATE_SHA;
  if (
    !budgetKey ||
    budgetKey.length > 300 ||
    !slot ||
    (slot !== "pre-integration" &&
      slot !== "diagnostic-preintegration" &&
      slot !== "integrated" &&
      !(slot.trim() === slot && /^test-[a-z0-9-]{1,64}$/.test(slot))) ||
    !candidateSha ||
    !/^[0-9a-f]{40}$/.test(candidateSha)
  )
    return;
  return { budgetKey, slot, candidateSha };
}
