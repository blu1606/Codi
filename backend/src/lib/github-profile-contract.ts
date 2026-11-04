/** Safety ceilings, not a promise of complete repository coverage. */
export const GITHUB_PROFILE_LIMITS = Object.freeze({
  listedRepos: 300,
  selectedRepos: 15,
  requests: 60,
  requestMs: 10_000,
  totalMs: 90_000,
  fileBytes: 64 * 1024,
  responseBytes: 1024 * 1024,
  aggregateBytes: 4 * 1024 * 1024,
});

export type GithubProfileLimits = {
  [Key in keyof typeof GITHUB_PROFILE_LIMITS]: number;
};

export const GITHUB_MANIFEST_PATHS = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "pom.xml",
  "Cargo.toml",
  "go.mod",
] as const;

export type GithubReadCode =
  | "invalid_input"
  | "identity_mismatch"
  | "connection_expired"
  | "app_auth_failed"
  | "rate_limited"
  | "not_found"
  | "http_error"
  | "network_error"
  | "redirect_rejected"
  | "invalid_response"
  | "graphql_error"
  | "graphql_partial"
  | "pagination_limit"
  | "language_limit"
  | "request_timeout"
  | "total_timeout"
  | "request_limit"
  | "response_limit"
  | "aggregate_limit"
  | "directory_limit"
  | "file_limit";

export interface GithubReadIssue {
  operation:
    "identity" | "listing" | "ref" | "languages" | "directory" | "file";
  code: GithubReadCode;
  repositoryId?: number;
  path?: string;
  httpStatus?: number;
  retryAt?: string;
}

export interface GithubRepositorySnapshot {
  id: number;
  owner: string;
  name: string;
  pushedAt: string | null;
  defaultBranch: string;
  disposition: "selected" | "fork" | "empty" | "capped";
  commitSha: string | null;
  /** Only successful observations are evidence. Missing/unread files stay distinct. */
  files: {
    path: string;
    state: "collected" | "missing" | "unavailable";
    evidenceId?: string;
  }[];
}

interface GithubEvidenceBase {
  id: string;
  repositoryId: number;
  collectedAt: string;
  sourceUrl: string;
}

export type GithubEvidence = GithubEvidenceBase &
  (
    | { kind: "languages"; bytes: Record<string, number> }
    | {
        kind: "file";
        path: string;
        commitSha: string;
        blobSha: string;
        text: string;
      }
  );

/** Private server-side snapshot. Never serialize to an unrelated user's client. */
export interface GithubCollectionSnapshot {
  version: 1;
  status: "complete" | "partial" | "failed";
  identity: { id: string; login: string } | null;
  collectedAt: string;
  repositories: GithubRepositorySnapshot[];
  evidence: GithubEvidence[];
  issues: GithubReadIssue[];
  coverage: {
    publicAccess: "oauth_app" | "anonymous" | null;
    listingComplete: boolean;
    listed: number;
    selected: number;
    requests: number;
    /** Bytes admitted to the bounded response reader, including failed JSON. */
    responseBytes: number;
    elapsedMs: number;
    limits: GithubProfileLimits;
  };
}

export interface GithubTechnologyObservation {
  technology: string;
  kind: "language" | "framework" | "tool";
  signal: "language_bytes" | "declared_dependency";
  repositoryIds: number[];
  evidenceIds: string[];
  /** Language bytes are not measures of proficiency or authorship. */
  languageBytes?: number;
}
