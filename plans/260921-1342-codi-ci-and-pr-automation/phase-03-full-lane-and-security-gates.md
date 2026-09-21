---
phase: 3
title: "Full lane and security gates"
status: pending
priority: P2
effort: "1d"
dependencies: [2]
---

# Phase 3: Full lane and security gates

## Overview

The heavier checks that should not run on every `develop` pull request: a production build,
Playwright end-to-end tests, and secret scanning.

## Requirements

- Functional: a PR into `main` builds the app and runs the e2e suite.
- Functional: a committed secret fails CI.
- Functional: a Vercel-only import fails CI.
- Non-functional: the `fast` lane stays under roughly five minutes.

## Architecture

### Why these are full-lane only

A production build plus Playwright is 5-8 minutes. Paid on every `develop` PR, that is the
difference between CI people wait for and CI people learn to ignore. `main` is the branch
where being wrong is expensive, so that is where the slow checks go.

The cost is a real one and worth naming: a build break can reach `develop` and sit there
until someone opens a release PR. Mitigation is that `develop` still typechecks, which
catches most of what a build would — a Next.js build additionally catches route collisions,
bad metadata exports, and server/client boundary violations that `tsc` does not.

If build breaks on `develop` turn out to be frequent in practice, move `build` down to the
fast lane and leave only Playwright on full. Decide from evidence, not up front.

### Secret scanning

**gitleaks**, named explicitly. "Run a secret scan" is not a specification — the tool
determines what is detected. Run it on the PR diff rather than full history; scanning all
history on every PR is slow and re-reports the same findings forever.

GitHub's own push protection is complementary, not a substitute: it catches known provider
token formats, while gitleaks catches the custom shapes too, including `BETTER_AUTH_SECRET`.

Note what this does **not** do: a secret already committed and pushed is public the moment
it lands. Scanning tells you to rotate it, it does not un-leak it. The `.gitignore` covering
`.env*` is the real control; gitleaks is the backstop.

### Lock-in guard

```bash
if grep -rn "@vercel/" src/ --include=*.ts --include=*.tsx; then
  echo "Vercel-only package found. See docs/tech-stack.md section 4."
  exit 1
fi
```

Cheap, and it enforces a decision that is otherwise invisible until a container build fails
weeks later. Point the failure message at the reasoning so whoever hits it understands why
rather than just deleting the check.

### Playwright

Needs the app running and a database. Reuse the phase 2 Postgres service, apply migrations
and the seed, build, start, then test. Cache the browser download — it is roughly 150 MB and
uncached it dominates the job.

Upload the HTML report as an artifact on failure only. Always-upload fills the artifact
quota with reports nobody opens.

## Related Code Files

- Modify: `.github/workflows/ci.yml` (add `build`, `e2e`, `security`; extend the gate)
- Create: `.gitleaks.toml` (only if the defaults produce false positives)
- Modify: `.github/rulesets/main.json`

## Implementation Steps

1. `build` job, `lane == 'full'`. Supply dummy build-time env — a build must not need real
   secrets, and if it does, that is a design problem worth surfacing now.
2. `e2e` job, `lane == 'full'`: Postgres service, migrate, seed, `pnpm build`, start the
   server, wait for `/api/health`, run Playwright. Cache `~/.cache/ms-playwright`.
3. `security` job on **every** lane including `docs` — a secret can be pasted into a
   markdown file, and that is not a hypothetical.
4. Add the `@vercel/` grep to the `security` job.
5. Extend `ci-gate`: `full` additionally requires `build` and `e2e`; every lane requires
   `security`.
6. Re-verify the gate still fails correctly when a full-lane job fails.
7. Add the now-existing check names to `.github/rulesets/main.json`.

## Success Criteria

- [ ] PR into `main` runs build and e2e; PR into `develop` runs neither
- [ ] `security` runs on all four lanes, including docs-only
- [ ] A planted fake secret fails CI
- [ ] An added `@vercel/blob` import fails CI with a message pointing at the reasoning
- [ ] Playwright report uploaded on failure, not on success
- [ ] Browser binaries cached — second run is materially faster
- [ ] Fast lane still around five minutes or less

## Risk Assessment

**Flaky e2e teaches people to ignore CI.** One flaky test does more damage than no test,
because the team learns that red means "re-run". Quarantine a flaky spec immediately rather
than retrying it; `retries: 2` in CI hides flakiness instead of fixing it, so use it only as
a temporary, commented measure.

**gitleaks false positives.** Test fixtures and example values in `.env.example` can trip it.
Tune `.gitleaks.toml` rather than disabling the job — a disabled scanner is worse than none
because it looks like coverage.

**Build breaks reaching `develop`.** Accepted above, with the trigger for revisiting stated.

**Artifact quota.** Failure-only upload, and a short retention period.

**Secrets in CI logs.** Never `echo` an env var for debugging. A public repo's Actions logs
are world-readable, so a leaked value is leaked to everyone, immediately.
