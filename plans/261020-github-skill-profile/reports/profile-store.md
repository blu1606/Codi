# Private profile and generation accounting store

Date: 2026-10-20. Candidate acceptance remains Lead-owned.

Assigned base: `bb314c6127330d8d6af7fcfd7afe59287481e630`.
Integration parent inspected: `53ca9c80f39987c093bf31519499d6fc71df3748` (accepted service and Lead-owned schema/migration now present).
The immutable candidate SHA is supplied in the handoff; this report is included in that commit.

## Owned paths

- `apps/web/src/lib/github-profile-store.ts`
- `apps/web/src/lib/github-profile-store.test.ts`
- `plans/261020-github-skill-profile/reports/profile-store.md`

No schema, migration, index, service, provider, UI, dependency, environment or credential changes. The unrelated lockfile modification is preserved.

## Exact exported interface

```ts
type GithubProfileClaimInput = {
  userId: string;
  accountId: string; // local Better Auth account row ID, NOT provider account ID
  githubUserId: string; // canonical positive numeric provider identity
  consentVersion: "public-github-v1";
};
type GithubProfileRequest = GithubProfileClaimInput & {
  requestId: string; // store-generated UUID
  consentedAt: Date;
  activeUntil: Date;
};
type GithubProfileTrustedBudget = {
  budgetKey: string;
  slot: "pre-integration" | "integrated";
  candidateSha: string; // lowercase, full 40-character SHA
};
interface GithubLinkedAccount {
  accountId: string;
  userId: string;
  githubUserId: string;
}
interface GithubStoredProfile {
  accountId: string;
  githubUserId: string;
  snapshot: GithubCollectionSnapshot;
  analysis: GithubProfileAnalysis;
  corrections: GithubProfileCorrections;
  publishedAt: Date;
}
// GithubProfileStore is exported as ReturnType<typeof createGithubProfileStore>.
function createGithubProfileStore(
  database: Database,
  trustedBudget?: GithubProfileTrustedBudget,
): {
  getLinkedAccount(userId: string): Promise<GithubLinkedAccount | null>;
  claim(input: GithubProfileClaimInput): Promise<GithubProfileRequest>;
  release(request: GithubProfileRequest): Promise<boolean>;
  publish(request: GithubProfileRequest, snapshot: GithubCollectionSnapshot,
    analysis: GithubProfileAnalysis): Promise<void>;
  read(userId: string): Promise<GithubStoredProfile | null>;
  reserveGeneration(request: GithubProfileRequest,
    reservation: Readonly<GithubProfileGenerationReservation>): Promise<boolean>;
};
```

Also exports `GithubProfileStoreError` with sanitized `code`:
`invalid_input | account_unavailable | active_request | request_fenced | invalid_profile | store_failed`.
No raw DB error/cause is returned or logged. Absent trusted budget returns `false` without DB access; invalid provided configuration throws `invalid_input`.

## Implemented invariants

- Metadata selection explicitly excludes tokens. All session owner IDs and budget configuration must be supplied by trusted server code; the module is not an HTTP authentication/role boundary.
- Claim transaction locks owner, linked account and profile. The owner lock serializes first creation before a profile row exists. Account matching checks local row ID, session owner, provider `github`, and canonical numeric provider ID, not merely a foreign key.
- Claim stores a new UUID, explicit consent and a 55-second database-clock deadline. An active duplicate cannot replace it. Existing snapshot, analysis, corrections and publication time are not modified. Database timestamps are truncated to milliseconds so returned JavaScript Dates survive exact equality fences.
- Release only clears the matching owner/account/UUID/deadline/consent pair, including after expiry for cleanup. It cannot clear a newer request or erase a publication.
- Publish requires a validated, nonempty analysis with observed evidence and matching snapshot identity; failed collection and no-observation/empty analysis do not overwrite prior results. Service success with `generation:null` must skip publication. No AI result is manufactured.
- Publication locks/rechecks still-linked identity and the current consent/request fence, then rechecks deadline in its final UPDATE. It is UPDATE-only: missing/deleted/recreated rows and stale request UUIDs cannot be resurrected. Latest corrections are validated under lock and never overwritten by generation data.
- Read joins the profile to the same current local account, owner and GitHub provider; a changed numeric identity returns no old data. Accepted projection validation is rerun before returning stored data. Generic account deletion relies on the accepted schema's cascade; a new local account cannot adopt the old row.
- Reservation is a READ COMMITTED transaction. It acquires `pg_advisory_xact_lock(hashtextextended(...))` from a namespaced trusted budget key before checking aggregate usage. The next aggregate statement can therefore see the prior lock holder's commit. Aggregate count must be below two and reserved maximum cost plus this call must not exceed 20,000 microUSD.
- Model is exactly `openai/gpt-6-luna`; input is integer 1..16,000, output exactly 4,096. Reserved maximum cost cannot undercut the accepted adapter's conservative ceiling `ceil(inputTokens / 8 + 4096 / 2)`. Full SHA and the two approved unique slots are validated.
- The reservation INSERT SELECT rechecks owner, local account, provider numeric identity, UUID, consent timestamps/version and live deadline at insertion. Accepted schema uniqueness prevents duplicate slots and repeated request IDs. No refund/update/delete/retry accounting API exists; failed or ambiguous generation does not release an already committed reservation. Ambiguous reservation commit throws a sanitized error, never authorizes generation on an unknown outcome.

## Verification

All commands used the credential-cleared `.git/run-isolated.ps1 -TaskCommand '<command>'` runner, existing binaries, deterministic fixtures, and no installations.

```text
node apps/web/node_modules/vitest/vitest.mjs run apps/web/src/lib/github-profile-store.test.ts
node apps/web/node_modules/vitest/vitest.mjs run apps/web/src/lib/github-profile-store.test.ts apps/web/src/lib/github-profile-ai.test.ts apps/web/src/lib/github-profile-analysis-contract.test.ts apps/web/src/lib/github-profile-extraction.test.ts apps/web/src/lib/github-profile-collector.test.ts apps/web/src/lib/github-profile-service.test.ts
node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
node node_modules/tsx/dist/cli.mjs scripts/check-design-standards.ts
```

Initial focused store run: 46 passed, exit 0. Final focused rerun: 50 passed, exit 0. Final feature run after self-review guards: 290 tests across six files passed, including 50 store tests, exit 0. Final web typecheck: exit 0. Design standards: zero violations, exit 0. Prettier check of both owned TypeScript files passed. Staged-whitespace checks are recorded in the immutable handoff.

Tests use actual Drizzle compilation and transaction commands with a scripted in-memory pg client, not a fake production store. They check emitted SQL predicates, parameters, ordering, isolation, locks, mutation scope, rollback command emission and fail-closed guards. Scripted replies do not evaluate PostgreSQL predicates and do not prove real locking, isolation, rollback, foreign-key cascade or race execution. Tests do not claim runtime authorization or a live persistence pass.

The code-review self-check added sanitized handling of uncloneable publication input and invalid aggregate accounting guards. Database skill guidance informed parameterized queries and explicit owner/provider joins. No independent acceptance was performed by the writer.

## Remaining boundaries and handoff

- No database execution, migration application, credentials, GitHub/provider/model calls, browser/runtime start or deployment test occurred. Real DB concurrent duplicate/delete/unlink/reservation behavior and deployed RLS/role privileges remain unverified.
- Lead owns session/learner/same-origin and explicit-dialog consent authorization, request orchestration, stable cross-deployment budget key/slot/candidate configuration, actual reservation callback wiring, and no-generation response handling. Do not rotate budget keys to evade the two-call envelope. Store consent metadata does not independently prove a human dialog interaction.
- No correction mutation/delete endpoints, cooldown, scheduler/retries, course priors, admin access or generic OAuth callback behavior are added. Those remain outside this assignment.
- Corrections, dependent exclusions, factual observations and inference validation reuse the accepted projection. Its free-text semantic/area-key consistency limitations remain caller-owned, not verified truth.
- The schema/migration must be deployed through the coordinated Lead-owned chain before using this store. This source/test candidate alone is not an end-to-end acceptance or spending authorization.

Write ownership is released with the immutable candidate handoff. Lead owns acceptance and any subsequent changes.
