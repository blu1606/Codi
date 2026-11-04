# Sync codi-rebuild with Codi origin/develop, port the new Tutor, pull three feature branches

Status: done (2026-11-03) · Owner approved all three steps.

## Why

`backend/` was vendored from the local Codi checkout at `6898548b` (2026-10-27), 65 commits behind `origin/develop`
(2026-10-31: 175 files, +35.6k/-6.8k). The owner's reworked AI Tutor (PR #247), the AI background worker (#268) and
several fixes live only upstream.

## Outcome

1. `backend/` matches `origin/develop` for every vendored file, with the rebuild's own fixes kept (3-way merge:
   base `6898548b`, theirs `origin/develop`, ours rebuild). New migrations applied; AI jobs worker running.
2. The frontend uses develop's Tutor: `/ai` (chat with history, streaming, intake) and the in-course Tutor
   (`/learn/:courseId/tutor` and the lesson panel), ported into the rebuild's design system.
3. Branches `feat/auto-knowledge-map-analysis`, `feat/ai-grading-suggestions`, `feat/github-profile-corrections`
   merged on top; the rebuild's simulations they replace (knowledge-map analysis, AI grading drafts) switch to the
   real backend.

## Constraints

- Codi repo stays read-only (read with `git show origin/...`, never checkout/pull there).
- Keep the rebuild's deliberate deviations (port 3001, DEMO_TOOLS, R2 avatar route, GitHub VPS time budget,
  stale-pending-payment fix if upstream did not supersede it, forwarded-proto handling, publication review work).
- Back up DB `codi` before migrations; deploy runs migrations manually (docs/deployment.md).

## Phases

1. Backend 3-way sync + migrations + worker (blocks 2 and 3). Done, see [phase-1-report.md](phase-1-report.md).
2. Tutor frontend port (`/ai`, in-course Tutor) — replaces the interim `/ai` advisor rework (c176199). Done, see
   [phase-2-report.md](phase-2-report.md).
3. Feature branches + switch simulations to real routes. Done, see [phase-3-report.md](phase-3-report.md).
4. Verify (smoke, flow, axe, mobile, area scripts), deploy to codi.hoangblue.dev. Done 2026-11-03: release 312848b, migrations applied, worker on, AI_DAILY_JOB_LIMIT=50.

## Acceptance

- `npx tsc --noEmit` clean; every page loads; Tutor answers for real with saved history; knowledge-map analysis and
  AI grading suggestions run against the backend; smoke 64/64, flow OK; production healthy after deploy.
