# Codi mockup — source of truth

Clickable prototype (vanilla HTML/CSS/JS) covering every actor: Guest, Learner, Lecturer, Admin. It is the
**reference implementation of business flows and states** for the real app in `apps/web`.

## What is binding vs. free

| Layer | Binding? | Where it is defined |
|---|---|---|
| Business flow (step order, preconditions, who can do what) | **Yes — must match** | `PRODUCT.md` §4–§5, `STATE-MACHINES.md` |
| Entity states, transitions, guards, side effects | **Yes — must match exactly** (enum values, allowed transitions, what gets disabled) | `STATE-MACHINES.md` (contract), `js/*.js` (reference behaviour) |
| Screen states (loading / empty / error / success / forced edge cases) | **Yes — every listed state must exist** | `PRODUCT.md` §6 |
| Interaction rules (confirm vs undo, no auto-redirect, reason required…) | **Yes** | `PRODUCT.md` §7 |
| Vietnamese copy for statuses, CTAs, errors | Strongly preferred verbatim | `js/*.js` |
| Design tokens (colour, type, radius, spacing, mastery scale) | **Yes — same values** | `DESIGN-TOKENS.md`, `css/app.css :root` |
| Layout, component composition, spacing choices, animations | **No — free to improve** | — |

Rule of thumb: you may redraw a screen, never re-invent its states.

## Run it

Open `docs/mockup/index.html` directly in a browser (works from `file://`, no build).
Bottom-right **"Kịch bản thử nghiệm"** (Alt+K) switches role (Khách / Học viên / Giảng viên / Quản trị viên) and forces
scenario states (payment expired/underpaid/slow/QR fail, AI path fail, materials error, AI rate limit, knowledge-map
cycle…). "Đặt lại dữ liệu" resets the seed. Use it to screenshot the reference state you are implementing.

The drawer, `localStorage` persistence (`codi-proto-v9`), seed data and fake latency are **prototype-only** — do not port them.

## Files

| File | Purpose |
|---|---|
| `PRODUCT.md` | Product spec: journeys, flows (L*, T*, D*), screen inventory (S**), interaction rules, decisions, open questions |
| `product-updated-12-10.md` | Change log of decisions made 12/10/2026 (audit + PO decisions) |
| `STATE-MACHINES.md` | **Contract** for every entity/process state machine |
| `DESIGN-TOKENS.md` | Token values and mapping to the shadcn/Tailwind variables in `packages/ui` |
| `js/data.js` | Entity shapes (header comment) + seed data |
| `js/core.js` | Runtime API, `ownership()`, `requireAuth()`, shared UI primitives (confirm, sheet, toast, mastery…) |
| `notes/` | UX audit reports that produced the 12/10 revision (history, not binding) |

## Module map

Real routes keep the existing `apps/web` structure (`/dashboard/lecturer/*`, `/dashboard/admin/*`). Do not invent
other prefixes — all three workstreams link to each other through these paths.

### Shared / foundation

| Mockup | Source | Real route / location | Screens |
|---|---|---|---|
| Tokens, primitives (confirm, sheet, toast+undo, mastery chip, status badges, empty, alert, stepper, ring) | `css/app.css`, `js/core.js` (`Codi.ui.*`) | `packages/ui` | — |
| Role-aware header, notifications bell | `js/core.js` | `apps/web/src/components/header.tsx` | S40, S41 |
| Auth, settings, profile | `js/core.js` | `/login`, `/forgot-password`, `/reset-password`, `/settings`, `/profile` (exist) | S03, S04, S04b |
| Charts kit | `js/charts.js`, `css/charts.css` | `packages/ui` or `apps/web/src/components/charts` | §7.21 rules |

### Commerce, AI advisor & Admin operations

| Mockup route | Source | Real route | Screens |
|---|---|---|---|
| `/courses` | `learner-commerce.js` | `/courses` | S01 |
| `/courses/:slug` | `learner-commerce.js` | `/courses/[slug]` | S02, S03 |
| `/cart` | `learner-commerce.js` | `/cart` | S05 |
| `/checkout`, `/checkout/success` | `learner-commerce.js` | `/checkout`, `/checkout/success` | S06, S07 |
| `/ai` | `ai-advisor.js` | `/ai` | S17 |
| `/admin` | `admin.js` | `/dashboard/admin` | S30 |
| `/admin/users` | `admin.js` | `/dashboard/admin/users` | S31 |
| `/admin/courses` | `admin.js` | `/dashboard/admin/courses` | S33 |
| `/admin/orders` | `admin.js` | `/dashboard/admin/orders` | S34 |
| `/admin/vouchers` | `admin.js` | `/dashboard/admin/vouchers` | S35 |
| `/admin/insights[/:card]` | `admin-analytics.js` | `/dashboard/admin/insights[/[card]]` | S36 |
| `/admin/finance[/:card]` | `admin-analytics.js` | `/dashboard/admin/finance[/[card]]` | S37 |
| `/insights`, `/insights/stats` | `learner-insights.js` | `/insights`, `/insights/stats` | S13b |

### Learner learning

| Mockup route | Source | Real route | Screens |
|---|---|---|---|
| `/dashboard` (learner) | `learner-learning.js` | `/dashboard` | S12 |
| `/learn/:courseId/onboarding` | `learner-learning.js` | `/learn/[courseId]/onboarding` | S08, S08b, S09a–c |
| `/learn/:courseId` | `learner-learning.js` | `/learn/[courseId]` | S10, S11f |
| `/learn/:courseId/:lessonId` | `learner-learning.js`, `coding-practice.js`, `ai-tutor.js` | `/learn/[courseId]/[lessonId]` | S11, S11a–h |
| `/insights/knowledge-map` | `learner-insights.js` | `/insights/knowledge-map` (also tab on S10) | S13c |
| `/progress` | `learner-learning.js` | `/progress` | S13 |
| review modal | `learner-learning.js` | modal | S14 |

### Lecturer workspace & publication review

| Mockup route | Source | Real route | Screens |
|---|---|---|---|
| `/teach` | `lecturer.js` | `/dashboard/lecturer` | S20 |
| `/teach/courses`, `/teach/new` | `lecturer.js`, `lecturer-ai-create.js` | `/dashboard/lecturer/courses`, `/dashboard/lecturer/new` | S21 |
| `/teach/courses/:courseId[/:tab]` | `lecturer.js`, `lecturer-ai.js` | `/dashboard/lecturer/courses/[courseId]/[tab]` | S22, S24, S25 |
| `/teach/courses/:courseId/quiz/:lessonId` | `lecturer.js` | `…/quiz/[lessonId]` | S23 |
| `/teach/courses/:courseId/code/:lessonId[/preview]` | `lecturer-coding.js` | `…/code/[lessonId][/preview]` | S23b |
| `/teach/grading[/:submissionId]`, `/teach/snippets` | `lecturer.js` | `/dashboard/lecturer/grading[/[submissionId]]`, `…/snippets` | S26 |
| `/teach/questions` | `lecturer.js` | `/dashboard/lecturer/questions` | S27 |
| `/teach/reviews` | `lecturer.js` | `/dashboard/lecturer/reviews` | S28 |
| `/teach/progress[/:courseId]` | `lecturer.js` | `/dashboard/lecturer/progress[/[courseId]]` | S29 |
| `/teach/insights` | `lecturer-insights.js` | `/dashboard/lecturer/insights` | S29b |
| `/admin/publication` | `admin-review.js`, `course-review.js` | `/dashboard/admin/publication` | S32, S32b |

## Updating the mockup

The mockup changes only when the product owner changes a flow or a state. Update `PRODUCT.md` +
`STATE-MACHINES.md` + the JS in the same PR, and say so in the PR title (`docs(mockup): …`). Code PRs never edit
`docs/mockup/**` to make a mismatch "go away".
