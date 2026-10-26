# Evidence-backed profile projection handoff

Date: 2026-10-20. Status: implementation candidate for Lead inspection, not accepted integration.
Original base: `b304207e7f7e71438f9ecac1ef016f00b1077604`.
Workspace: `D:/CODE/Study/FPT/Ki_5/SWP391/Codi-github-import-261020`.
The immutable candidate commit SHA is returned with this report in the final handoff; this document is included in that commit.

## Outcome and paths

Only these new paths belong to this candidate:

- `apps/web/src/lib/github-profile-analysis-contract.ts`
- `apps/web/src/lib/github-profile-analysis-contract.test.ts`
- `plans/261020-github-skill-profile/reports/profile-projection.md`

Pure synchronous projection of an accepted collector snapshot plus an optional generation and independently stored corrections. No existing collector/extractor, database, service, UI, dependency, configuration or product authority file changed. No network, provider/model call, credential access, install, deployment, push or delegation performed. Vercel/TypeScript-only deployment constraints are preserved; no worker/runtime capability is added.

## Exact exported boundary

Runtime exports:

- `GITHUB_USAGE_LEVELS`: `tried | regular | deep`, and `GITHUB_USAGE_LABELS`: Đã thử / Dùng thường xuyên / Dùng sâu.
- `GITHUB_CONFIDENCE_LEVELS`: `low | medium | high`, and `GITHUB_CONFIDENCE_LABELS`: Thấp / Trung bình / Cao.
- `GITHUB_OVERALL_LABELS`: new / basic / solid labels; schema imports canonical `ONBOARDING_LEVELS` directly.
- `githubProfileAnalysisSchema`: strict Zod schema described below.
- `githubProfileCorrectionsSchema`: strict Zod schema with default-empty correction arrays.
- `GithubProfileAnalysisError`: provenance/attribution/duplicate-identity rejection. Structural failures remain Zod errors.
- `githubTechnologyId(observation: Pick<GithubTechnologyObservation, "technology" | "kind">): string`.
- `githubObservationId(observation: GithubTechnologyObservation): string`.
- `validateGithubProfileAnalysis(snapshot: GithubCollectionSnapshot, input: unknown, excludedRepositoryIds: readonly number[] = []): GithubProfileAnalysis`.
- `projectGithubProfile(snapshot: GithubCollectionSnapshot, input: unknown | null, correctionInput: unknown = {}): GithubProfileProjection`.

Type exports: `GithubProfileAnalysis`, `GithubProfileCorrections`, `GithubProfileCitation`, `GithubProfileProjection`.

Generation shape:

```text
{
  technologies: [{technologyId, usage, confidence, explanation, supports}],
  areas: [{areaId, label, confidence, explanation, supports}],
  overall: {level, confidence, summary, supports} | null
}
supports = [{observationId, evidenceId, repositoryId, quote?}] // nonempty
corrections = {
  excludedRepositoryIds: number[],
  technologies: [{technologyId, usage?, hidden?}],
  areas: [{areaId, hidden}]
}
```

Technology identity is `kind:encodeURIComponent(technology)`; observation identity adds `:signal`. Thus TypeScript language bytes and the declared TypeScript tool remain separate. IDs do not include generation, evidence position, repository counts or learner exclusion state. Area IDs are stable taxonomy keys in lower-case kebab-case, separate from display labels. The future generation caller must reuse the same area keys across generations; this helper does not establish a product ontology or equate differently named concepts. Unknown/orphan correction records remain stored in the returned corrections, not promoted to observed technologies or generated areas.

Projection returns identity/date, original collection status, `observed | none_observed`, technologies with deterministic observations and effective usage/source, inferred areas, nullable overall inference, `provided | invalidated | not_provided` summary state, recomputed factual summary, independent corrections and collection limitations. These operational markers are not new product workflow states and do not classify insufficient data.

Every returned inference has `kind: inference` and `semanticVerification: unverified`. Facts have `epistemicKind: observation` and distinguish `language_bytes` from `declared_dependency`. Citation URLs, times, repository IDs and file/SHA metadata come only from retained evidence. The output does not include complete retained file text.

## Guards and correction behavior

- Strict generation objects reject arbitrary citation URL fields, weakness/gap/mastery/score fields and unknown structural fields. Model prose containing HTTP/WWW URLs is also rejected, rather than used for citations.
- References must match an extracted positive observation, that observation's actual evidence and the evidence's repository. Technology estimates must match that observation's technology identity. This rejects a valid ID borrowed from another technology or repo.
- Skipped/unlisted/excluded repositories cannot support claims. File evidence must agree with its selected repository's pinned commit, collected file entry, evidence ID and collector-format source URL. Quotes must be exact retained-file substrings, not normalized paraphrases; language-byte sources cannot carry file quotes. Duplicate repository/evidence/generated identities and ambiguous duplicate correction identities fail closed.
- Projection validates the original generation first, then recomputes factual observations offline with exclusions. If any declared support is removed, the entire dependent inference is dropped, not trimmed into a new inference. An invalidated overall summary becomes null and is replaced only by deterministic factual summary lines.
- Hidden technologies remove their dependent areas/summary. Learner usage wins over every generation and suppresses the old usage explanation and dependent inferred areas/summary. Hidden areas also invalidate the overall summary. Corrections are preserved even when no current observation survives; later reanalysis can merge them back.
- Coverage, read issues, skipped/capped repositories and missing/unavailable files remain limitations, not negative capability claims. Empty partial/failed collections preserve their collection status; the helper never manufactures a beginner estimate or insufficient-data verdict.

## Verification

All verification commands use `.git/run-isolated.ps1 -TaskCommand '<command>'` (cleared credential environment).

- Focused first run: `pnpm exec vitest run apps/web/src/lib/github-profile-analysis-contract.test.ts` — 51 tests passed before the additional later-generation override regression.
- Final focused family: `pnpm exec vitest run apps/web/src/lib/github-profile-analysis-contract.test.ts apps/web/src/lib/github-profile-extraction.test.ts apps/web/src/lib/github-profile-collector.test.ts` — 144 tests passed (52 projection, 36 extraction, 56 collector), exit 0.
- `pnpm --filter web check-types` — exit 0 on the initial candidate and final-source repeat.
- `pnpm run check:standards` — exit 0, zero violations.
- Formatting: initial `pnpm exec prettier ...` failed because root has no Prettier executable. No install attempted. Corrected to the existing `node apps/web/node_modules/prettier/bin/prettier.cjs --write <two owned TS files>` — exit 0.
- `node apps/web/node_modules/prettier/bin/prettier.cjs --check <two owned TS files>` — exit 0.
- `git diff --cached --check` — exit 0, including the final three-path check.
- Normal three-path staging exited 1 because `.gitignore:97` ignores `plans/`; the two source files were staged. Resolved by force-adding only this explicitly assigned report, without changing ignore rules. Staged-path check shows exactly the three owned files. Secret-pattern scan matched explanatory report prose only; no secret value or credential file is staged.
- `git commit -m "feat(profile): add evidence-backed profile projection"` initially failed with `Author identity unknown` in the cleared environment. Lead resolved the dependency by approving reuse of the accepted base commit's author metadata through command-scoped options for this one local commit. No global/local config changed, attribution was not invented, and identity values are not copied into this report.

Tests use synthetic retained snapshots only, without mocking the projection/extraction logic. They prove structural validation, provenance checks, exclusions, precedence and immutability, not live-user acceptance. Self-review followed spec compliance and code-quality/edge-case checklists; there is no independent reviewer or acceptance claim. No downstream imports of this new module existed at inspection.

## Limits and usable next inputs

Evidence attribution and exact quotes are not semantic verification of prose or proof of proficiency. Area labels/explanations, usage/confidence estimates and overall summary can still be false, including unsupported negative wording in free text; the contract explicitly marks all of them unverified and never converts them into deterministic facts, scores or mastery. The unit test documenting that limit is intentional, not a semantic safety pass. The future caller must treat prose and quoted repository content as untrusted text, preserve inference labels, and decide its generation/review safeguards. No automatic language-understanding guarantee is claimed.

No real model, consent/OAuth return, session/role isolation, persistence/reopen, live exclusion UI, deletion/late-worker race, scheduling, course mapping, measured evidence behavior, build, browser or deployment criterion was exercised. Those remain Lead-owned. No new external or paid effect is authorized by this increment.

Lead can inspect the exported schemas/helpers and rerun the focused command, then explicitly accept or reject this exact boundary before service/UI dispatch. Writer relinquishes ownership at the immutable handoff. Rollback is source-only; no persisted state was touched.
