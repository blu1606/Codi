---
phase: 1
title: "PR foundation and branch protection"
status: pending
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: PR foundation and branch protection

## Overview

Templates, ownership, auto-assignment, and the rules that stop anyone pushing to `develop`
or `main` directly. **None of this needs application code**, so it should land before the
team opens its first pull request rather than after the habits have set.

## Requirements

- Functional: opening a PR produces a filled-in template and an assigned author.
- Functional: `develop` and `main` reject direct pushes and force-pushes.
- Non-functional: no workflow with write permissions ever executes pull-request code.

## Architecture

### The `pull_request_target` trap

Auto-assignment needs write access to the PR, which `pull_request` does not have for forks.
`pull_request_target` does — but it runs **in the context of the base branch with a
write-capable token**. Checking out the head branch under that token and running anything
from it (a build, a test, even `npm install` with a postinstall script) hands repository
write access to whoever opened the PR.

VLearn's workflow carries the rule as a comment, and it is the right rule:

> Do not check out, download artifacts, or execute head-PR content here.

So: `pull_request_target` jobs may read the event payload and call the API. Nothing else.

### Rulesets over legacy branch protection

Rulesets are versionable as JSON and can be committed, which is why VLearn keeps
`.github/rulesets/*.json` in the repo. Same here — the rules become reviewable rather than
being something one person clicked once and nobody can audit.

Two rulesets:

| Branch | Rules |
|---|---|
| `develop` | no direct push · no force-push · no deletion · PR required · `CI Gate` must pass · branch must be up to date |
| `main` | everything above · plus: sources restricted to `develop` and `hotfix/*` |

The `main` source restriction is worth having. Without it someone merges a feature branch
straight to `main`, skips `develop`, and the branches diverge silently.

**`CI Gate` cannot be marked required until it has run at least once** — GitHub will not
offer an unknown check name. Land phase 2, let one PR run, then add the requirement.

## Related Code Files

- Create: `.github/PULL_REQUEST_TEMPLATE.md`
- Create: `.github/ISSUE_TEMPLATE/{bug-report,feature-request,task}.md`, `config.yml`
- Create: `.github/CODEOWNERS`
- Create: `.github/workflows/pr-auto-assign.yml`
- Create: `.github/rulesets/{develop,main}.json`
- Create: `docs/contributing.md`

## Implementation Steps

1. **PR template** — what changed, why, which issue it closes, how it was tested, and a
   checklist. Keep it short: a template nobody fills in is worse than none. Include
   `Closes #` so the issue closes on merge and the board card moves.
2. **Issue templates** — bug report, feature request, task. `config.yml` with
   `blank_issues_enabled: false` so everything arrives shaped.
3. **CODEOWNERS** — with four people and one repo, a single catch-all line assigning the
   team is honest. Per-directory ownership on a codebase this size is theatre.
4. **`pr-auto-assign.yml`** — adapt VLearn's: `pull_request_target`, `types: [opened,
   reopened]`, assign the author unless it is a bot, no checkout. Keep their comment
   explaining why there is no checkout, or someone will add one.
5. **Rulesets** — write both JSON files, apply with
   `gh api -X POST repos/blu1606/Codi/rulesets --input .github/rulesets/develop.json`.
   Leave the `CI Gate` required-check entry out for now; add it in phase 2.
6. **`docs/contributing.md`** — branch naming, commit format, how to run things locally,
   what CI will check. This is also the file that answers "how do I start" for teammates.
7. Open a throwaway PR and confirm the template renders, the author is assigned, and a
   direct push to `develop` is rejected.

## Success Criteria

- [ ] `git push origin develop` from a clean clone is rejected
- [ ] Force-push and branch deletion are rejected on both protected branches
- [ ] A new PR is pre-filled with the template and assigned to its author
- [ ] A PR targeting `main` from a branch that is not `develop` or `hotfix/*` is blocked
- [ ] Blank issues are disabled; all three templates appear in the chooser
- [ ] `docs/contributing.md` lets a teammate open a correct PR without asking

## Risk Assessment

**Locking yourself out.** Rulesets apply to the repository owner too. If `CI Gate` is marked
required before it exists, every PR blocks and nobody can merge — including the PR that
would fix it. That is why the required check is deferred to phase 2. Admins can bypass, but
relying on bypass daily defeats the point.

**`pull_request_target` misuse.** Covered above. The failure mode is not a broken build, it
is repository compromise, and it looks completely reasonable in review — someone adds
`actions/checkout` to "fix" the workflow. The comment is the defence.

**Template fatigue.** A 30-line PR template gets deleted wholesale by the third PR. Keep it
to what is actually read.

**One-approval rule with four people.** See open question 1 in `plan.md` — this can block
work at exactly the wrong moment. Decide deliberately rather than by default.
