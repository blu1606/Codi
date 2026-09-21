---
title: "Codi CI and PR automation"
description: "Path-classified CI with a single required gate, plus the PR hygiene and branch protection around it."
status: pending
priority: P1
effort: "3-4d"
tags: [ci, github-actions, automation, quality-gates]
created: 2026-09-21
---

# Codi CI and PR automation

## Overview

Build Codi's CI on the pattern proven in
[`vinuni-vlearn/vlearn-frontend`](https://github.com/vinuni-vlearn/vlearn-frontend/tree/develop/.github):
a **classifier** decides which lane a pull request belongs to, only the jobs that lane needs
run, and a single **CI Gate** job is the one required status check.

That last part is the reason the pattern is worth copying. Without a gate you must mark every
job required in branch protection, and a job that is skipped for docs-only changes reports as
*pending forever* — the PR can never merge. The gate collapses N conditional checks into one
that is always required and always runs.

## What we take from VLearn, and what we deliberately do not

| VLearn does | Codi | Why |
|---|---|---|
| Classify changed paths into lanes | **Copy** | A README typo should not run the test suite |
| Single `ci-gate` job as the only required check | **Copy** | Solves the skipped-job-blocks-merge problem |
| `actionlint` on workflow changes | **Copy** | Workflow YAML fails at runtime otherwise |
| Classifier self-tests its own logic before using it | **Copy** | Cheap, and lane bugs are invisible until they let something through |
| `pull_request_target` for auto-assign, never checking out head code | **Copy** | That token is write-capable; running PR code under it is how repos get taken over |
| **Lint + typecheck + test merged into one job** | **Reject** | Their `ci-x64` self-hosted runner has two slots, so one PR could occupy the machine. Codi is a **public repo on GitHub-hosted runners** — free minutes, 20 concurrent jobs. The constraint is inverted; merging would just make CI slower |
| Self-hosted runner labels | **Reject** | `ubuntu-latest` |
| `npm` | **Adapt** | `pnpm` with its own cache action |
| No database in CI | **Add** | Codi's schema is the source of truth; parity and the smoke test must run against real PostgreSQL |

## Lanes

| Lane | Trigger | Runs |
|---|---|---|
| `docs` | only `docs/`, `*.md`, issue/PR templates | nothing — gate passes |
| `workflow` | only `.github/**`, `.gitignore` | actionlint + script self-tests |
| `fast` | anything else, PR into `develop` | lint · typecheck · unit tests · database checks · secret scan |
| `full` | any PR into `main` | everything in `fast` plus build and Playwright e2e |

`fast` is the default for unrecognised paths. A classifier that guesses `docs` when it is
unsure is a classifier that lets untested code through.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|-------|--------|--------|-----------|
| 1 | [PR foundation and branch protection](./phase-01-start.md) | Pending | 1d | — |
| 2 | [CI pipeline with lanes](./phase-02-ci-pipeline-with-lanes.md) | Pending | 1-2d | 1, scaffold |
| 3 | [Full lane and security gates](./phase-03-full-lane-and-security-gates.md) | Pending | 1d | 2 |

**Phase 1 can land today** — templates, CODEOWNERS, auto-assign, and rulesets need no
application code, and the team is about to start opening pull requests. Phase 2 needs the
Next.js scaffold (main plan phase 3) because there is nothing to lint until then.

## Relationship to the main plan

The bootstrap plan's
[phase 7](../260921-1313-codi-postgresql-port-and-authentication-slice/phase-07-deployment-and-ci.md)
lists CI among its tasks. **This plan supersedes that portion.** Phase 7 keeps Docker,
Render, Vercel, and the provider seams; CI moves here. Update phase 7 to point at this plan
rather than describing CI twice.

## Success criteria

- [ ] A docs-only PR passes in under a minute without running a test
- [ ] A source PR runs lint, typecheck, unit tests, and the database checks
- [ ] A PR into `main` additionally builds and runs Playwright
- [ ] Exactly **one** required status check on `develop` and `main`: `CI Gate`
- [ ] A skipped lane never leaves a PR unmergeable
- [ ] A broken workflow YAML fails before it is merged
- [ ] A planted fake secret fails CI
- [ ] Nobody can push directly to `develop` or `main`

## Open questions

1. **Does a solo-reviewer rule work for a 4-person student team?** Requiring one approval is
   normal, but with four people and deadlines it can become a bottleneck at 2am. Alternative
   is to require review only on `main`. Needs a team decision.
2. **Playwright in CI costs 2-4 minutes per run.** Full lane only, or also on `develop`?
3. **Codecov or no coverage reporting?** Coverage is useful evidence for the report, but a
   coverage gate on a young codebase mostly produces noise.
