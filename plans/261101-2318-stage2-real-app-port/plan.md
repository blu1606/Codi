# Stage 2: port the real Codi app's features into codi-rebuild

Status: done (2026-11-02)

## Outcome

codi-rebuild reaches feature parity with the real Codi app (`Codi/apps/web`), UI first. After that, an
impeccable pass improves the UI.

## Decisions (user, 2026-11-01)

1. **The real app wins.** When the real app and `docs/mockup` PRODUCT.md / STATE-MACHINES.md conflict, port
   the real app's behaviour and copy. The docs only fill the gaps where the real app has nothing. Every
   deviation from the docs is logged in `docs/deviations-from-mockup.md`.
2. **Simulated AI stays working.** Where the real app shows "Chưa khả dụng" / "Sắp có" (AI grading, AI
   knowledge-map generation, analytics cards A4/A6/A9/B5), keep the working simulation. Analytics numbers must
   come from the seed data, never invented or hashed values.
3. **Scope is P1 + P2 + P3** from the scout reports. The only exclusions are developer-only pages such as
   `/dev/foundation`.

## Inputs

The scout reports in `plans/reports/` list the gaps, priorities, UI states and rules:
`scout-261101-2318-{shell-account,commerce,learning,lecturer,admin}.md`.

## Phases

| Phase | Owner | Status |
|---|---|---|
| 0. Shared groundwork: seed patches, ownership rules | controller | done |
| 1. Parallel port, one agent per feature folder | 7 agents | done (reports `port-261101-2318-*.md`) |
| 2. Integration: reseed, build, Playwright smoke and flows | controller | done: 59 routes clean, purchase, admin cancel, AI drafts, OTP, theme, duplicate-order guard verified; fixed double `loadStore` overwrite and sidebar meta wrap |
| 3. impeccable critique and polish pass | controller + 4 agents | done: axe AA clean in both themes, no mobile overflow, path page reorganised (reports `ui-polish-261102-0108-*.md`) |
| 4. Real content and assets | controller + Codex CLI | done: javascript.info + F8 content for the JS course, favicon, 9 course covers, hero illustration |

## Ownership (phase 1)

| Agent | Writes in | Seed patch | Report rows |
|---|---|---|---|
| shell | `src/features/shell/`, `src/styles/app.css` (shell sections only) | `patches/10-shell.js` | shell-account (minus /ai, home) |
| commerce | `src/features/commerce/`, `src/styles/commerce.css` | `patches/20-commerce.js` | commerce + shell-account home and /ai rows |
| learning | `src/features/learning/`, `src/styles/learning.css` | `patches/30-learning.js` | learning (non-coding, non-tutor rows) |
| coding | `src/features/coding/` | `patches/40-coding.js` | learning: coding challenge, tutorial, AI tutor rows |
| lecturer | `src/features/lecturer/`, `src/styles/lecturer.css` | `patches/50-lecturer.js` | lecturer (non-AI rows) |
| lecturer-ai | `src/features/lecturer-ai/` | `patches/60-lecturer-ai.js` | lecturer: code editor, AI quiz, knowledge map, AI grading |
| admin | `src/features/admin/`, `src/styles/admin.css` | `patches/70-admin.js` | admin |

Shared runtime files (`src/lib/*`, `src/components/*`, `src/App.jsx`, `server/*` except the agent's own patch
file) stay controller-owned. If an agent needs a change there, it reports the request instead of making it.

## Acceptance

- Every P1–P3 row in the scout reports is done or explicitly marked out of scope, with a reason.
- `npx vite build` passes. The Playwright smoke test of all routes and 4 roles shows no page or console errors.
- Purchase, learning, grading, and admin flows work end to end and persist to Postgres.
- `docs/deviations-from-mockup.md` lists every behaviour that differs from the mockup docs.
