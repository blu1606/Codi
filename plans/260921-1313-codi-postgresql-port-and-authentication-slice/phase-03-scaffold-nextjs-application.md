---
phase: 3
title: "Scaffold Next.js application"
status: pending
priority: P1
effort: "4d"
dependencies: [1, 2]
---

# Phase 3: Scaffold Next.js application

## Overview

Stand up the Next.js 15 application with the design system, bilingual routing, typed
database access, and the test harness — so that feature phases write screens rather than
infrastructure.

This phase owns the **entire Node toolchain**. Phase 1 deliberately created no
`package.json`, so `create-next-app` runs onto a clean slate here with nothing to clobber.

## Requirements

- Functional: app runs at `/vi` and `/en`; a switcher changes locale and preserves the path.
- Functional: design tokens from `docs/design-guidelines.md` are live, including dark mode.
- Functional: `pnpm test` and `pnpm test:e2e` both run and pass against a trivial case.
- Non-functional: no feature logic in this phase — a placeholder page is the deliverable.
- Non-functional: nothing outside `src/lib/env.ts` reads `process.env`.

## Architecture

**Routing.** `next-intl` with a `[locale]` segment: `src/app/[locale]/...`. Middleware
negotiates locale from the path, then a cookie, then `Accept-Language`, defaulting to `vi`.

Bilingual was chosen deliberately, and it has a standing cost: **every user-facing string
goes in `messages/vi.json` and `messages/en.json` from the first screen onward.** Retrofitting
is the expensive path, so no phase after this one is allowed to hardcode a visible string.

**Theming.** Tailwind v4 is CSS-first — tokens live in `@theme` in the global stylesheet,
not in a JS config. shadcn/ui's current registry emits oklch variables in `:root` / `.dark`
outside `@layer base`, plus `@theme inline` mapping. Note the dependency shift most tutorials
get wrong: it is now the single `radix-ui` package plus `tw-animate-css`, not the old
`@radix-ui/react-*` set with `tailwindcss-animate`.

**Fonts.** Loaded via `next/font/google`, self-hosted at build: Be Vietnam Pro (body/UI),
Lexend (display), JetBrains Mono (code, ligatures disabled). Subset must include `vietnamese`.

**Database access.** Kysely instance as a module-level singleton, types generated from the
live local database by `kysely-codegen` and committed. In dev, stash the instance on
`globalThis` so hot reload does not open a new pool per edit and exhaust connections — a
classic and confusing failure.

**Environment contract.** `src/lib/env.ts` turns the `.env.example` notes from Phase 1 into
zod validation, split into `server` and `client` (`NEXT_PUBLIC_*`) objects so a server-only
secret cannot be imported into a client component. Provider-conditional keys use
`superRefine` — `RESEND_API_KEY` is required only when `EMAIL_PROVIDER=resend`. A key that
is optional in every branch is a key that will be missing in production.

**Test harness.** Vitest for unit and integration, Playwright for end-to-end. Both are
installed *here*, because Phases 4–7 assert against them in their success criteria and
nothing else sets them up. Integration tests run against the compose Postgres with the
Phase 1 runner applying migrations to a dedicated test database.

## Related Code Files

- Create: `next.config.ts`, `src/middleware.ts`, `src/i18n/request.ts`, `src/i18n/routing.ts`
- Create: `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`
- Create: `src/app/globals.css` (tokens from the design doc)
- Create: `messages/vi.json`, `messages/en.json`
- Create: `src/components/ui/*` (shadcn), `src/components/locale-switcher.tsx`
- Create: `src/components/theme-provider.tsx`, `src/components/theme-toggle.tsx`
- Create: `src/app/api/health/route.ts`
- Create: `package.json`, `tsconfig.json`, `eslint.config.mjs`, `prettier.config.mjs`, `.nvmrc`
- Create: `src/lib/env.ts`
- Create: `src/lib/db/index.ts` (Kysely singleton), `src/lib/db/types.ts` (generated)
- Create: `vitest.config.ts`, `playwright.config.ts`, `tests/setup.ts`

## Implementation Steps

1. `pnpm create next-app .` — App Router, TypeScript, Tailwind, `src/` directory. It will
   want to overwrite `.gitignore`; keep the existing one, which already covers `/storage`,
   drawio backups, and `.env*`. Pin Node via `.nvmrc` to the installed **24.15**.
2. Set `output: 'standalone'` in `next.config.ts` now, so container builds never diverge from
   dev. Install `sharp` and leave image optimization enabled.
3. Write `src/lib/env.ts` from the `.env.example` contract, then add `kysely`, `pg`, and
   `kysely-codegen`; generate `src/lib/db/types.ts` against the local database and commit it.
   Add `pnpm db:types`. Add the `globalThis` singleton guard.
4. Install and configure Vitest (with `@testing-library/react`) and Playwright. Add
   `pnpm test`, `pnpm test:e2e`. Write one trivial test of each kind so the harness is proven
   working rather than merely present.
5. Install and configure `next-intl`; create `[locale]` layout, routing config, and middleware.
6. Seed `messages/vi.json` and `messages/en.json` with the shared keys the auth phases will use
   (`common.*`, `auth.*`, `validation.*`). Agree the key naming convention here, in writing.
7. Install shadcn/ui; paste the token block from `docs/design-guidelines.md` into `globals.css`.
   Add the components the auth slice needs: `button input label form card alert sonner
   dropdown-menu avatar dialog separator badge skeleton input-otp`.
8. Wire `next-themes`; verify dark mode against the contrast figures in the design doc.
9. Build a locale switcher that preserves the current pathname, and a theme toggle.
10. Add `/api/health` returning 200 plus a database `SELECT 1` — Render needs it, and it proves
    the Kysely wiring end to end.
11. Placeholder home page rendering a few tokens and both fonts, to confirm Vietnamese diacritics
    render correctly at 14–16px.

## Success Criteria

- [ ] `pnpm dev` serves `/vi` and `/en`; unknown locale redirects to the default
- [ ] Switcher moves between locales and stays on the same page, with no reload loop
- [ ] Dark mode toggles; no token resolves to an undefined CSS variable
- [ ] Vietnamese diacritics (`ế ệ ộ ữ`) render without clipping at body size in both themes
- [ ] `/api/health` returns 200 and confirms database connectivity
- [ ] `pnpm build` produces a standalone output
- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] `pnpm test` and `pnpm test:e2e` each run and pass a real trivial case
- [ ] `src/lib/db/types.ts` is generated and typechecks against the ported schema
- [ ] Unsetting a required env var fails startup with a message naming the key
- [ ] `grep -rn "process.env" src/ --include=*.ts --include=*.tsx` matches only `src/lib/env.ts`

## Risk Assessment

**`create-next-app` clobbering.** Largely removed by Phase 1 owning no Node artifacts, but
it still wants `.gitignore`. Keep the existing one — the generated version drops `/storage`
and the drawio backup patterns.

**Middleware conflict later.** `next-intl` middleware and the Phase 4 auth check both want
to run. Decide the composition order now — locale first, then auth — and keep one exported
`middleware` that calls both, rather than discovering the conflict mid-auth-phase.

**Tailwind v4 drift.** Most tutorials online are v3. Symptoms are tokens that silently do
nothing. Trust `docs/design-guidelines.md`, which was written against the live registry.

**i18n discipline.** The real risk is social, not technical: one hardcoded Vietnamese string
in a hurry, then another. Add a lint rule or a review checklist item now.
