---
phase: 2
title: "CI pipeline with lanes"
status: pending
priority: P1
effort: "1-2d"
dependencies: [1]
---

# Phase 2: CI pipeline with lanes

# Overview

The core workflow: classify the changed paths, run only the jobs that lane needs, and report
through one gate. Needs the Next.js scaffold to exist first — there is nothing to lint until
then.

## Requirements

- Functional: a docs-only PR finishes in under a minute without running tests.
- Functional: a source PR runs lint, typecheck, unit tests, and the database checks.
- Functional: exactly one required status check, `CI Gate`, which always runs.
- Non-functional: unrecognised paths fall through to `fast`, never to `docs`.

## Architecture

### Job graph

```
classify ──┬─> validate        (lint · typecheck · unit)   lane: fast | full
           ├─> database        (migrate · parity · smoke)  lane: fast | full
           ├─> workflow-check  (actionlint · self-tests)   when .github changed
           └─────────────────> ci-gate  (always runs, reads the lane, asserts)
```

`validate` and `database` run **in parallel**. This is the main deliberate divergence from
VLearn, whose two-slot self-hosted runner made parallelism expensive. GitHub-hosted runners
on a public repo are free and allow 20 concurrent jobs, so the tradeoff reverses.

### The gate

```yaml
ci-gate:
  if: always()
  needs: [classify, validate, database, workflow-check]
  steps:
    - run: |
        set -Eeuo pipefail
        test "$CLASSIFY" = "success"
        case "$LANE" in
          docs)     ;;
          workflow) test "$WORKFLOW" = "success" ;;
          fast|full) test "$VALIDATE" = "success"; test "$DATABASE" = "success" ;;
          *) echo "Unknown lane: $LANE"; exit 1 ;;
        esac
        if [ "$WORKFLOW_REQUIRED" = "true" ]; then test "$WORKFLOW" = "success"; fi
```

Two details that are easy to get wrong:

- **`if: always()`** — without it the gate is skipped when a dependency fails, and a skipped
  required check blocks the PR forever instead of failing it.
- **The `*)` branch exits non-zero.** If someone adds a lane to the classifier and forgets
  the gate, CI must fail loudly rather than pass silently. A gate that defaults to success
  is not a gate.

### Classifier self-tests

VLearn's classifier runs a table of known path→lane cases against its own logic and calls
`core.setFailed` on any mismatch, before classifying the real PR. Copy this. Lane bugs are
otherwise invisible — a misclassification just means tests quietly did not run, and nobody
notices until something breaks on `main`.

Codi's table should cover: `README.md`→docs, `docs/x.md`→docs, `.github/workflows/ci.yml`→
workflow, `src/app/page.tsx`→fast, `database/schema.sql`→fast, mixed docs+source→fast, and
an unknown path→fast.

### Database job

Codi's schema is hand-written SQL and is the source of truth, so CI must exercise it:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: codi_test }
    options: >-
      --health-cmd pg_isready --health-interval 5s
      --health-timeout 5s --health-retries 10
```

Steps: run `database/migrate.sh --seed`, then the schema/migration parity check, then the
ported smoke test. The smoke test is the one that matters — it proves constraints still
**reject** what they should, which no type system can tell you.

Set `TZ=UTC` on the job. The schema pins UTC when applying migrations, and a runner in
another zone would produce a difference that only shows up in timestamp assertions.

### pnpm caching

`pnpm/action-setup` then `actions/setup-node` with `cache: 'pnpm'`. Order matters — setup-node
looks for the pnpm binary to locate the store, so installing pnpm second silently disables
caching and every job pays a cold install.

## Related Code Files

- Create: `.github/workflows/ci.yml`
- Create: `.github/actionlint.yaml`
- Modify: `package.json` (`lint`, `typecheck`, `test`, `test:e2e` scripts must exist)
- Modify: `.github/rulesets/{develop,main}.json` (add `CI Gate` once it has run)

## Implementation Steps

1. Write `classify` as an `actions/github-script` step: paginate `pulls.listFiles`, include
   `previous_filename` for renames (a renamed file must be judged on both paths), build the
   predicates, run the self-test table, then set `lane` and `workflow` outputs.
2. Write the lane predicates. `docs` = `README.md`, `docs/**`, `.github/ISSUE_TEMPLATE/**`,
   `.github/PULL_REQUEST_TEMPLATE.md`. `workflow` = `.github/**`, `.gitignore`.
   Everything else is `fast`. PRs into `main` are `full` regardless.
3. Add a job summary via `core.summary` listing the lane and the paths. When someone asks
   "why didn't my tests run", this is the answer without digging through logs.
4. `validate` job — checkout, pnpm, install, then `lint` → `typecheck` → `test` in that
   order. Lint first because it fails in about a minute; a formatting slip should not cost
   the full test run first.
5. `database` job — Postgres service as above, `TZ=UTC`.
6. `workflow-check` job — `docker://rhysd/actionlint:1.7.12`, pinned by tag.
7. `ci-gate` exactly as above.
8. Concurrency: `group: ci-${{ github.event.pull_request.number }}`,
   `cancel-in-progress: true`, so a force-push cancels the stale run.
9. Open one PR of each kind and confirm the lanes. **Then** add `CI Gate` to both rulesets.

## Success Criteria

- [ ] Docs-only PR: gate green, no test job ran, under a minute
- [ ] Source PR: `validate` and `database` both ran and are required by the gate
- [ ] Workflow-only PR: actionlint ran; a deliberately broken YAML fails it
- [ ] A classifier self-test mismatch fails the run before anything else executes
- [ ] Renamed file is classified on both old and new path
- [ ] Forcing `validate` to fail turns the gate red — not skipped, not pending
- [ ] Job summary shows the lane and the changed paths
- [ ] `CI Gate` is the only required check on `develop`

## Risk Assessment

**A gate that cannot fail.** The single worst outcome is a gate that reports success when
its lane's jobs did not run. `if: always()`, the explicit `test` assertions, and the
non-zero `*)` branch are all guarding this one failure mode. Verify it by deliberately
breaking a job and watching the gate go red.

**Classifier too generous.** Anything that lands in `docs` skips all testing. Default to
`fast` on anything unrecognised, and never add a broad prefix like `src/docs` to the docs
predicate without thinking about what else it matches.

**pnpm cache ordering.** Silent, not an error — CI just gets slower and nobody investigates.

**Database service startup.** Without the healthcheck, migrations race the container and the
job fails intermittently, which teaches the team to re-run CI instead of reading it.

**Required check added too early.** Repeated from phase 1 because it is the likeliest way to
brick the repo: the check name must exist before it can be required.
