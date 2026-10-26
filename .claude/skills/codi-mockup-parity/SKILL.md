---
name: codi-mockup-parity
description: Implement or review a Codi screen/module against the clickable mockup in docs/mockup (source of truth). Use whenever building, changing or reviewing any page, flow, server action or schema that a mockup screen (S01–S41), flow (L*, T*, D*) or entity state covers — cart, checkout, payment, onboarding, learning path, lesson player, quiz, assignment, coding exercise, AI tutor, Q&A, lecturer workspace, knowledge map, publication review, grading, admin users/orders/vouchers/analytics. UI may differ from the mockup; flows, states and design tokens may not.
---

# Codi mockup parity

`docs/mockup/` is the source of truth. Goal of every task: same business flow and **identical state machine** as the
mockup, real data/backend, UI free to improve, design tokens identical.

## 0. Inputs

- The GitHub issue (sub-issue of an epic). It lists screen IDs, mockup routes, source JS files and the states to cover.
  No issue → ask for one before writing code.
- `docs/mockup/README.md` → module map (mockup route → JS file → real route).

## 1. Read the contract (do not skip)

1. `docs/mockup/STATE-MACHINES.md` — the section for every entity the module touches. Copy the enum values and the
   transition table into your working notes.
2. `docs/mockup/PRODUCT.md` — grep the screen IDs (`S05`, `S11g`…) in §6, the flow in §5, rules in §7. Do not read the
   whole file.
3. The mockup JS file for that route: find the `Codi.route('<path>'` render function, the `Codi.action(...)` handlers it
   uses and any state slice (`Codi.ensure('<slice>'`). This is the reference behaviour for edge cases.
4. Open `docs/mockup/index.html`, switch role with Alt+K, force each scenario, and screenshot every state you must build.

## 2. Map before coding

Write a short table in the PR description (and keep it in mind while coding):

| Mockup state / transition | Real implementation (schema field, server action, component) | Test |
|---|---|---|

Rules:
- State enum lives in one place (Drizzle `pgEnum` or exported `as const` array) and is imported everywhere.
- Every transition is a server-side function that checks: current state, role/ownership, preconditions. Illegal
  transition → typed error, never a silent no-op. The client only reflects what the server allows.
- Side effects from the contract (notification, enrolment, cart cleanup, path update, counts) happen in the same server
  operation (transaction where money or enrolment is involved).
- Derived states (e.g. course ownership `owned | pending-payment | in-cart | free | not-owned`) are computed by one
  shared function, not re-derived per component.
- Prototype-only things are not ported: dev drawer, scenario flags, localStorage, seed, `Codi.wait`. Each scenario flag
  is a real condition (webhook delay, provider error, rate limit…) that the real app must handle.

## 3. Build

- UI: shadcn/ui + semantic token classes only (see `docs/mockup/DESIGN-TOKENS.md`). Layout may differ from the mockup.
- Every state in `PRODUCT.md` §6 for the screen must be reachable and rendered: loading, empty, error, success and the
  listed edge states. Keep the Vietnamese copy for statuses and primary CTAs.
- Interaction rules (§7): confirm dialog with consequence for money/others (+ required reason when it affects another
  person); undo toast for reversible self-actions; never auto-redirect after success; mastery always with text label;
  AI never grades and never gives full solutions; prerequisites are hard constraints.
- Learner flows must work at 375px width. Light and dark mode.

## 4. Verify

- Vitest: one test per transition (happy path) and per guard (rejected transition). Run `pnpm test`.
- `pnpm run check:standards` (0 token violations) and `pnpm run check-types`.
- Walk the flow end-to-end in `pnpm run dev:web` with each role involved.

## 5. Pull request

- Branch `feat/<module>` from `develop`. PR body: `Closes #<sub-issue>`.
- **Screenshot table is mandatory**: one row per state, columns `State | Mockup | Implementation`, light + dark;
  add mobile for learner screens. Upload images into the PR (drag & drop), no external links.
- Fill the parity checklist in the PR template. List any intentional UI deviation and any place where the mockup was
  ambiguous (with the question asked).

## Review mode

When reviewing a PR with this skill: check enum values and transitions against `STATE-MACHINES.md`, verify guards run
server-side, verify every §6 state has a screenshot, run `check:standards`. A UI difference is fine; a missing state, an
extra state, a transition the contract does not allow, or a hardcoded colour is a blocking finding.
