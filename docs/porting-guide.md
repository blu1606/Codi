# Porting guide — Codi mockup → codi-rebuild (React)

Read this before porting any mockup module. Goal: a faithful React port of the clickable prototype in
`D:\CODE\Study\FPT\Ki_5\SWP391\Codi\docs\mockup` (vanilla JS). Flows, states, guards and Vietnamese copy must
match the mockup; layout may be cleaned up but never re-invent a screen's states.

## Sources of truth (read-only, never edit)

Since stage 2, the **real app wins**. `Codi/apps/web/src` (Next.js) and `Codi/packages/*` are the primary
source for behaviour, states, rules and Vietnamese copy. The mockup below fills only what the real app lacks.
Where the real app shows a disabled "Chưa khả dụng" / "Sắp có" AI feature, keep the working simulation in the
browser (never stored as domain data); where it shows an analytics card as unavailable, show the same unavailable
state rather than computing or inventing numbers. Record every behaviour that differs from the
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
| `Codi.*` session, auth, go, ui | `src/lib/codi.js` → `import { Codi, useCodi } from '../../lib/codi'` |
| `Codi.fmt` | `Codi.fmt` (also `src/lib/format.js`) |
| `Codi.icon(name,{cls})` | `<Icon name="cart" className="icon-sm" />` |
| `Codi.ui.alert/empty/ring/progress/mastery/stepper/stars/avatar/thumb/courseStatus/orderStatus/spinnerBlock/workspace/md` | `<Alert> <Empty> <Ring> <Progress> <Mastery> <Stepper> <Stars> <Avatar> <Thumb> <CourseStatus> <OrderStatus> <SpinnerBlock> <Workspace> <Md>` + `masteryLabel`, `courseStatusLabel`, `orderStatusLabel`, `stream`, `mdToHtml`, `esc`, `<Html html>`, `<CopyButton>` from `src/components/ui/primitives.jsx` |
| `Codi.ui.toast/confirm/modal/sheet/closeAll/copy` | same names on `Codi.ui` (installed by `src/components/ui/overlay-host.jsx`); also declarative `<Modal>` / `<Sheet>` from that file |
| `Codi.charts.*` | `import { charts } from '../../lib/charts'` — returns HTML strings; render with `<Html html={charts.line({...})} />` |
| CSS (`css/*.css`) | copied verbatim to `src/styles/*.css`, imported globally. Reuse the mockup class names. |

### Talking to the backend

All domain data lives in Postgres behind the backend; the browser keeps no copy of it.

- Read with `useApi(url)` from `src/lib/use-api.js` → `{ data, loading, error, reload, setData }` (aborts stale
  requests; a null url skips the call). Render a skeleton while loading and an `<Alert>` with "Thử lại" on error.
- Write with `api` from `src/lib/api.js`: `api.get/post/put/patch/del(url, body)` sends JSON with the session cookie
  and throws `ApiError` (`message` = the server's Vietnamese `error`, `status`, `body`). Show `e.message` in a toast
  or inline, then reload or update local state with the response.
- Two kinds of endpoints:
  - **Routes** — `backend/src/app/api/**/route.ts`, e.g. `GET /api/learner/overview`. The contract is listed in
    `plans/261102-1834-codi-backend-port/phase-1-report.md`.
  - **Server actions** — the exports of `backend/src/app/dashboard/**/actions.ts`, called as
    `api.action('<module>', '<export>', ...args)` (`POST /api/actions/<module>/<export>`, JSON array of arguments),
    e.g. `api.action('dashboard/lecturer', 'getLecturerCourses', 'all')`.
- Adding a route: create `backend/src/app/api/<path>/route.ts` exporting `GET`/`POST`/… handlers in the Next.js
  style (`NextRequest` → `NextResponse.json`); folders `[id]` become `:id`. It is mounted at startup, no registry.
  Check the session with `auth.api.getSession({ headers: request.headers })` and roles with `getActiveRoles`, check
  `Origin` on writes, and answer errors as `{ error: '<Vietnamese message>' }`.

### Runtime contract (`src/lib/codi.js`)

- `useCodi()` re-renders a component after a session or scenario change.
- Session: `Codi.currentUser()` (backend user + primary role), `Codi.role()`, `Codi.session`, `Codi.signIn`,
  `Codi.signOut`, `Codi.refreshSession`, `Codi.requireAuth(intent, { reason })`.
- Browser-only state: `Codi.state.scenario` (Alt+K flags `paymentOutcome`, `aiAssistant`, `kmap`, and the resolved
  `theme`), changed with `Codi.set(fn)` and kept in localStorage. Never put domain data there.
- `Codi.go('/path')`, `Codi.path()`, `Codi.query()`; prefer `<Link to="/x">` for links.
- `Codi.rerender()`, `Codi.uid('x')`, `Codi.wait(ms)`, `Codi.ui.*`.

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
   variable with a small subscription when it must survive navigation. UI preferences may use localStorage;
   anything shared or durable goes to the backend.
5. **Cross-feature namespaces.** A mockup module that assigns `Codi.<ns> = {...}` (e.g. `Codi.code`, `Codi.tutor`,
   `Codi.github`, `Codi.teach`, `Codi.lecturerAI`, `Codi.teachCode`) keeps the **same namespace
   and member names** in the port: create `src/features/<feature>/<ns>-api.js(x)` that does
   `Object.assign(Codi, { <ns>: {...} })` and import it from your `routes.jsx` so it is installed at startup.
   - Non-UI members keep their signatures.
   - Members that returned HTML now return a **React element** (JSX) for the same arguments. If the piece needs
     hooks/state, the member returns `<SomeComponent {...args} />`. Callers write `{Codi.code.panel(args)}`.
   - Consumers call these at render time with optional chaining (`Codi.code?.panel(...)`), never at import time.
6. **Copy.** Vietnamese strings verbatim from the mockup JS. No `uppercase` on Vietnamese text.
7. **Prototype-only latency** (`Codi.wait`) stays only where it drives a visible loading/progress state.
8. **No fake shortcuts.** Every state the mockup renders (loading, empty, error, success, forced scenario) exists.

## Verify

- `npx vite build` in `frontend/` and `npx tsc --noEmit` in `backend/` pass (chunk-size warnings are fine).
- With `npm start` running, open the screen as the seeded role and check it again after a reload.
