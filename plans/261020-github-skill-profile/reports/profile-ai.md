# Bounded profile synthesis handoff

Date: 2026-10-20. Implementation candidate only; Lead owns exact-candidate acceptance.
Original base: `98b9ea4fd3b42c3a7494adc9e335167a70f547e7`.
Shared branch advanced to nonoverlapping UI commit `806f1e5375959ba2fd9ee83604aaf39a30ea2551` before this candidate commit; that is its actual parent. This writer's commit contains only the three paths below, not the existing UI changes.
Workspace: `D:/CODE/Study/FPT/Ki_5/SWP391/Codi-github-import-261020`.
Immutable local commit is identified in the final handoff, including this report.

## Outcome and changed paths

- `apps/web/src/lib/github-profile-ai.ts`
- `apps/web/src/lib/github-profile-ai.test.ts`
- `plans/261020-github-skill-profile/reports/profile-ai.md`

One schema-inclusive token-count request, followed by at most one reserved generation request, followed by the accepted `validateGithubProfileAnalysis` boundary. No retry, fallback, repair generation, tool, search, file upload, prompt-cache option, background task or queue. No existing collector, projection, provider, config, dependency, DB or UI file changed. Existing unrelated lockfile and moving UI work were preserved and excluded from the candidate. No live API, credential read, paid call, install, push or delegation occurred.

## Exported interface for acceptance

```ts
generateGithubProfileAnalysis(
  snapshot: GithubCollectionSnapshot,
  options: GithubProfileAiOptions,
): Promise<GithubProfileAiResult>

interface GithubProfileAiOptions {
  apiKey: string; // trusted server input, not read from environment
  abortSignal: AbortSignal;
  reserveGeneration: (
    reservation: Readonly<GithubProfileGenerationReservation>,
  ) => Promise<boolean>;
  excludedRepositoryIds?: readonly number[];
  fetch?: typeof globalThis.fetch; // trusted, nonretrying test transport
}
interface GithubProfileGenerationReservation {
  model: "openai/gpt-6-luna";
  inputTokens: number;
  maxOutputTokens: 4096;
  maximumCostMicroUsd: number;
}
interface GithubProfileAiResult {
  analysis: GithubProfileAnalysis;
  model: "openai/gpt-6-luna";
  inputTokens: number;
  outputTokens: number;
  preflightInputTokens: number;
  reservedMaximumCostMicroUsd: number;
}
```

Also exports `GITHUB_PROFILE_AI_LIMITS` (exact model, 16,000 input tokens, 4,096 output tokens, 25,000 ms whole-phase deadline, zero retries) and `GithubProfileAiError`. Error codes: `invalid_input`, `no_observations`, `aborted`, `preflight_failed`, `input_limit`, `reservation_failed`, `generation_failed`, `invalid_output`. Error `reservationState`: `not_attempted`, `denied`, `unknown`, `consumed`. Errors contain no raw response, prompt, credential, provider error or cause, and this module logs nothing.

`reserveGeneration` is a required trusted caller contract, not an implemented database guarantee: before returning true it must atomically consume an allowed attempt and reserve its maximum cost across concurrent requests and both approved regressions. It enforces the total TWO attempts / 20,000 microUSD allowance, not merely a per-request boolean. False means no consumption; an exception or abort before acknowledgement is ambiguous and must be reconciled conservatively as potentially consumed. After successful reservation, no error or ambiguous external completion refunds an attempt. A late reservation completion after abort never dispatches generation. No callback implementation or fake durable counter is supplied as acceptance proof.

## Implementation choices and evidence

1. The existing `OpenAiProvider` uses the installed `@ai-sdk/openai` adapter. Its `src/openai-language-model-capabilities.ts` excludes `none` from GPT-6 efforts; `src/responses/openai-responses-language-model.ts:312` drops unsupported effort before serialization. Current official Luna documentation explicitly supports `none`. Rather than modifying shared code, upgrading dependencies or silently allowing default reasoning, this model-specific adapter uses the official Responses HTTP interface directly. There is no SDK retry/telemetry/warning layer in the dispatched path. Direct fetch has no application retry loop; an injected trusted transport must also never retry.
2. Preprocessing uses the accepted private projection to validate retained provenance and compute exclusions. It sends at most 40 positive observations, their explicit observation/evidence/repository relationships and bounded retained manifest excerpts (800 characters each, 12,000 aggregate). Identity and source URLs are not needed in the model input. Character bounds are resource/coverage limits only, never a token-count substitute. Excerpts are explicitly untrusted data. Prompt instructions prohibit invented technology identity, missing-evidence weakness claims, scores/mastery and instruction-following from repository text.
3. The wire schema is derived from the accepted schema, omitting optional quotes so all strict-output properties are required, and limiting generated technology/area rows to 20/8. Full accepted validation still runs after wire-schema/JSON validation. No existing accepted contract is loosened. Free-text semantics remain unverified; prompt instructions are not a semantic safety proof.
4. `POST https://api.openai.com/v1/responses/input_tokens` receives the actual complete model context: model, developer/user text input, complete `text.format` JSON schema, reasoning `none`, and disabled truncation. The generation body uses those identical values, adding only `max_output_tokens:4096`, `service_tier:"default"` (Standard) and `store:false`. No SDK conversion, hidden context, extra tools or prompt change occurs after counting. The module rejects missing/malformed/nonpositive counts and counts over 16,000 before reservation or generation. There is no approximate-count fallback.
5. Fixed official endpoint, POST only, redirects rejected, HTTP cache disabled, bounded response readers (4 KiB count / 256 KiB generation), caller abort plus 25-second phase deadline. Returned response must be completed, exact model/Standard tier, text-only, within input/output usage caps and match the preflight count; otherwise the already-consumed attempt fails without repair. Refusal, provider/HTTP failure, malformed JSON or unsupported evidence cannot trigger another generation.
6. Pricing read on 2026-10-20: Standard Luna input $0.10/M, cache-write $0.125/M, output $0.50/M tokens. Reserve against the higher cache-write input rate even though no cache option is requested: `ceil(inputTokens / 8 + 4096 / 2)` microUSD, at most 4,048 per attempt / 8,096 for two. This is a conservative token-cost reservation, not actual usage/billing or a provider-side hard cap. Taxes excluded. Caller must reverify prices before later live authorization and update the accepted rate boundary if pricing changes; no ongoing price-lock guarantee is claimed. Token usage is returned only on successful validation; ambiguous/failing attempts retain their full conservative reservation.

Official sources actually inspected (documentation only, no API execution):

- [Count API, including `text.format` JSON schema](https://developers.openai.com/api/reference/typescript/resources/responses/subresources/input_tokens/methods/count).
- [Token counting guide and output-token cap semantics](https://developers.openai.com/api/docs/guides/token-counting): output caps include non-visible/reasoning tokens.
- [Exact Luna capabilities](https://developers.openai.com/api/docs/models/gpt-6-luna).
- [Current pricing](https://developers.openai.com/api/docs/pricing).

The documentation fetch tool returned 404 for one language-neutral `.md` count URL and generic HTML retrieval exceeded its size limit; the TypeScript count reference was successfully fetched in full instead. Its top-level parameters include model/input/instructions/reasoning/text/truncation and its text format explicitly accepts the JSON schema. Schema-inclusive counting is documented and wired; successful real-account/model counting/generation remains unverified. Any preflight endpoint failure fails closed without generation.

## Actual verification

Every command below ran through `.git/run-isolated.ps1 -TaskCommand '<command>'`, using existing direct binaries, no install/package resolution.

- Initial focused `node apps/web/node_modules/vitest/vitest.mjs run apps/web/src/lib/github-profile-ai.test.ts`: 41 passed.
- Adding pending-reservation abort coverage first exposed one acknowledgement-race failure: 185 passed / 1 failed across four files. Fixed the race (already-settled acknowledgement wins; genuinely pending work stays unknown); no test weakened or hidden.
- Final family `node apps/web/node_modules/vitest/vitest.mjs run apps/web/src/lib/github-profile-ai.test.ts apps/web/src/lib/github-profile-analysis-contract.test.ts apps/web/src/lib/github-profile-extraction.test.ts apps/web/src/lib/github-profile-collector.test.ts`: 186 passed, exit 0 (42 synthesis + 144 accepted-pipeline tests).
- `node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json`: exit 0, including final-source repeat.
- `node apps/web/node_modules/prettier/bin/prettier.cjs --write <two owned TS files>`: exit 0; final check repeated before commit.
- First standards invocation used nonexistent `apps/web/node_modules/tsx/dist/cli.mjs`, exit 1 / MODULE_NOT_FOUND. Corrected to installed root `node node_modules/tsx/dist/cli.mjs scripts/check-design-standards.ts`: exit 0, zero violations.
- Final formatting check, staged-path and diff-whitespace checks passed. Exactly the three assigned files are staged. Secret-pattern review matched code identifiers, explanatory text and the explicitly synthetic fixture key only; no real credential is staged. The unrelated lockfile remains outside the candidate.

Fixtures implement only a deterministic HTTP transport; production synthesis, schema conversion, counting payload construction, reservation order and accepted evidence validation are exercised unchanged. Tests do not call or fake acceptance of a real provider. They check exact count/generation context equality, wire caps/options, token-count failures, reservation denial/ambiguity, consumed failures, aborts, exclusions, fabricated attribution/URLs, snapshot mutation isolation, bounded responses and no payload logging. Self-review used the spec-compliance and code-quality checklists; independent acceptance remains Lead-owned.

## Limits and downstream inputs

Usable input for the next Lead-owned service: accepted snapshot, trusted server key, request/deadline abort signal and an actual atomic attempt/budget reservation callback. No new UI/service consumer is wired here. The caller must establish consent/identity and preserve the old profile on synthesis failure, persist outcome/accounting, guard ownership/deletion, maintain area keys and render all inference text as untrusted. No course-prior/mastery behavior is added.

Zero live generation attempts or paid calls were made. No claim of real token-count endpoint compatibility, model schema behavior, cost/latency measurement, semantic truth, UI, save/reopen, OAuth, deployment, build or full-L14 acceptance. The current single-request override leaves unattended retry/background completion deferred. Writer relinquishes the three-file write scope at immutable handoff; Lead inspects and explicitly accepts/rejects before consumer wiring.
