import { GITHUB_PROFILE_LIMITS, type GithubCollectionSnapshot } from "@/lib/github-profile-contract";
import { projectGithubProfile } from "@/lib/github-profile-analysis-contract";

const COLLECTED_AT = "2026-10-20T08:00:00.000Z";

const coverage = (listed: number, selected: number): GithubCollectionSnapshot["coverage"] => ({
  publicAccess: "oauth_app",
  listingComplete: true,
  listed,
  selected,
  requests: 5,
  responseBytes: 20480,
  elapsedMs: 900,
  limits: { ...GITHUB_PROFILE_LIMITS },
});

/** A complete collection: two selected repositories with language bytes, one fork skipped. */
export const githubSnapshotComplete: GithubCollectionSnapshot = {
  version: 1,
  status: "complete",
  identity: { id: "583211", login: "minhan-dev" },
  collectedAt: COLLECTED_AT,
  repositories: [
    { id: 101, owner: "minhan-dev", name: "format-price", pushedAt: "2026-09-30T14:20:00.000Z", defaultBranch: "main", disposition: "selected", commitSha: "a1b2c3d", files: [] },
    { id: 102, owner: "minhan-dev", name: "todo-react", pushedAt: "2026-08-12T09:05:00.000Z", defaultBranch: "main", disposition: "selected", commitSha: "e4f5a6b", files: [] },
    { id: 103, owner: "minhan-dev", name: "forked-utils", pushedAt: "2026-07-01T10:00:00.000Z", defaultBranch: "main", disposition: "fork", commitSha: null, files: [] },
  ],
  evidence: [
    { id: "ev-lang-101", kind: "languages", repositoryId: 101, collectedAt: COLLECTED_AT, sourceUrl: "https://api.github.com/repos/minhan-dev/format-price/languages", bytes: { JavaScript: 18450, CSS: 1200 } },
    { id: "ev-lang-102", kind: "languages", repositoryId: 102, collectedAt: COLLECTED_AT, sourceUrl: "https://api.github.com/repos/minhan-dev/todo-react/languages", bytes: { TypeScript: 52000, JavaScript: 3100 } },
  ],
  issues: [],
  coverage: coverage(3, 2),
};

/** Collection finished but found no usable repository. */
export const githubSnapshotEmpty: GithubCollectionSnapshot = {
  ...githubSnapshotComplete,
  repositories: [],
  evidence: [],
  coverage: coverage(0, 0),
};

/** Same data as the complete snapshot, collected more than 90 days ago. */
export const githubSnapshotStale: GithubCollectionSnapshot = {
  ...githubSnapshotComplete,
  collectedAt: "2026-06-01T08:00:00.000Z",
};

/** Projection the profile page receives for a linked, analysed account (no AI summary yet). */
export const githubProfileReady = projectGithubProfile(githubSnapshotComplete, null, {});
export const githubProfileInsufficient = projectGithubProfile(githubSnapshotEmpty, null, {});
export const githubProfileStale = projectGithubProfile(githubSnapshotStale, null, {});
