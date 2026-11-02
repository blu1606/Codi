# Porting guide — Codi mockup → codi-rebuild (React)

Read this before porting any mockup module. Goal: a faithful React port of the clickable prototype in
`D:\CODE\Study\FPT\Ki_5\SWP391\Codi\docs\mockup` (vanilla JS). Flows, states, guards and Vietnamese copy must
match the mockup; layout may be cleaned up but never re-invent a screen's states.

## Sources of truth (read-only, never edit)

Since stage 2, the **real app wins**. `Codi/apps/web/src` (Next.js) and `Codi/packages/*` are the primary
source for behaviour, states, rules and Vietnamese copy. The mockup below fills only what the real app lacks.
Where the real app shows a disabled "Chưa khả dụng" / "Sắp có" AI feature, keep the working simulation, and
compute analytics from seed data rather than inventing numbers. Record every behaviour that differs from the
mockup docs in `docs/deviations-from-mockup.md`.

Seed additions go in `backend/scripts/seed-source/patches/<nn>-<area>.js` as plain scripts that call
`patchSeed((db) => { ... })`. They are applied in name order on top of `data.js`.

- `Codi/docs/mockup/README.md` — what is binding.
- `Codi/docs/mockup/PRODUCT.md` — flows (L*, T*, D*), screens (S**), interaction rules §7.
- `Codi/docs/mockup/STATE-MACHINES.md` — entity state machines (contract).
- `Codi/docs/mockup/js/<module>.js` — reference behaviour + copy. Port its logic nearly line by line.
- `Codi/docs/mockup/js/core.js` — runtime the modules call (already ported, see below).

## Runtime already ported (do not rewrite; extend only if your brief says so)

| Mockup | Port |
|---|---|
| `Codi.*` state, selectors, auth, notify, go | `src/lib/codi.js` → `import { Codi, useCodi } from '../../lib/codi'` |
| `Codi.fmt` | `Codi.fmt` (also `src/lib/format.js`) |
| `Codi.icon(name,{cls})` | `<Icon name="cart" className="icon-sm" />` |
| `Codi.ui.alert/empty/ring/progress/mastery/stepper/stars/avatar/thumb/courseStatus/orderStatus/spinnerBlock/workspace/md` | `<Alert> <Empty> <Ring> <Progress> <Mastery> <Stepper> <Stars> <Avatar> <Thumb> <CourseStatus> <OrderStatus> <SpinnerBlock> <Workspace> <Md>` + `masteryLabel`, `courseStatusLabel`, `orderStatusLabel`, `stream`, `mdToHtml`, `esc`, `<Html html>`, `<CopyButton>` from `src/components/ui/primitives.jsx` |
| `Codi.ui.toast/confirm/modal/sheet/closeAll/copy` | same names on `Codi.ui` (installed by `src/components/ui/overlay-host.jsx`); also declarative `<Modal>` / `<Sheet>` from that file |
| `Codi.charts.*` | `import { charts } from '../../lib/charts'` — returns HTML strings; render with `<Html html={charts.line({...})} />` |
| CSS (`css/*.css`) | copied verbatim to `src/styles/*.css`, imported globally. Reuse the mockup class names. |

### Store contract (`src/lib/codi.js`)

- `useCodi()` at the top of every component that reads `Codi.*` → re-renders on every change.
- Read: `Codi.db().courses`, `Codi.course(slug)`, `Codi.currentUser()`, `Codi.role()`, `Codi.ownership(id)`…
- Write: `Codi.set((s) => { s.db.orders.push(o); })` — mutate in place exactly like the mockup. It re-renders and
  syncs changed entities to Postgres automatically. `Codi.set(fn, { render: false })` for silent writes.
- Persisted per-feature state: `Codi.ensure('learning', () => ({...}))` → `Codi.state.learning` (stored in Postgres
  as `slice:learning`). Use the same slice keys the mockup uses.
- Session-only (localStorage): `Codi.state.currentUserId`, `Codi.state.scenario` (forced demo states:
  `paymentOutcome`, `pathAI`, `materials`, `aiAssistant`, `kmap`, `theme`).
- `Codi.go('/path')`, `Codi.path()`, `Codi.query()`; prefer `<Link to="/x">` for links (mockup `href="#/x"`).
- `Codi.rerender()` (re-render all subscribers), `Codi.onMount(fn)` (run after commit; prefer useEffect).
- `Codi.requireAuth(intent, { reason })`, `Codi.notify(userId, { title, body, link })`, `Codi.uid('ord')`, `Codi.wait(ms)`.

## Translation rules

1. **Routes.** Every `Codi.route(pattern, render, opts)` becomes an entry in your feature's `routes.jsx`:
   `{ path: '/courses/:slug', element: CourseDetailPage, role: 'learner' | ['lecturer','admin'], title: '…', layout: 'focus', exit: { href, label } }`.
   `element` is a component; it receives `{ params, query }` props (same as mockup `render(params, query)`).
   Guards, titles and the focus header are handled by `src/App.jsx` — don't re-implement them. Keep mockup paths.
2. **Templates → JSX.** `html\`...\`` → JSX with the same class names and structure. `class` → `className`,
   `for` → `htmlFor`, inline `style="a:b"` → `style={{ a: 'b' }}`, `aria-*` stays.
3. **Events.** `data-action="x"` + `Codi.action('x', fn)` → `onClick`. `data-submit` → `<form onSubmit>` with
   `e.preventDefault()`. `data-change` / `data-input` → `onChange`. `data-go` → `<Link>` or `Codi.go`.
   `Codi.onMount(fn)` → `useEffect`.
4. **Module-level view state** (`let view = {...}` + rerender) → `useState` in the page component, or a module
   variable + `Codi.set(() => {}, …)` when it must survive navigation. Persisted state → `Codi.ensure` slice.
5. **Cross-feature namespaces.** A mockup module that assigns `Codi.<ns> = {...}` (e.g. `Codi.code`, `Codi.tutor`,
   `Codi.github`, `Codi.review`, `Codi.teach`, `Codi.lecturerAI`, `Codi.teachCode`) keeps the **same namespace
   and member names** in the port: create `src/features/<feature>/<ns>-api.js(x)` that does
   `Object.assign(Codi, { <ns>: {...} })` and import it from your `routes.jsx` so it is installed at startup.
   - Non-UI members keep their signatures.
   - Members that returned HTML now return a **React element** (JSX) for the same arguments. If the piece needs
     hooks/state, the member returns `<SomeComponent {...args} />`. Callers write `{Codi.code.panel(args)}`.
   - Consumers call these at render time with optional chaining (`Codi.code?.panel(...)`), never at import time.
6. **Copy.** Vietnamese strings verbatim from the mockup JS. No `uppercase` on Vietnamese text.
7. **Prototype-only latency** (`Codi.wait`) stays only where it drives a visible loading/progress state.
8. **No fake shortcuts.** Every state the mockup renders (loading, empty, error, success, forced scenario) exists.

## File ownership

Each feature agent writes only inside `src/features/<its-feature>/` (any file names, kebab-case). Optional styles:
`src/features/<feature>/<feature>.css`, imported from that feature's code. Do **not** edit `src/lib/*`,
`src/components/*`, `src/styles/*`, `src/App.jsx`, `src/main.jsx`, `backend/*`, or another feature's folder. If the
shared runtime lacks something you need, implement it locally in your feature and report it in your status.

## Verify

- `npx vite build` from `codi-rebuild/` must pass with zero errors (warnings about chunk size are fine).
- Do not start dev servers or Docker; the controller runs the integrated app and browser checks.
