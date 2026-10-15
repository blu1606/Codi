# Shared UI foundation (#95)

Tracks [#95](https://github.com/blu1606/Codi/issues/95), part of [epic #94](https://github.com/blu1606/Codi/issues/94).

## Contract and entry points

`docs/mockup/DESIGN-TOKENS.md`, `STATE-MACHINES.md` §22 and `PRODUCT.md` S40/S41 define the contract.
The light/dark semantic variables and chart palette live in `packages/ui/src/styles/globals.css`.
The root layout loads Be Vietnam Pro, Lexend and JetBrains Mono with Vietnamese subsets.
The login-specific palette remains scoped in `apps/web/src/index.css`.

| Shared component | Import from `@codi-1/ui/components/` | Behavior |
|---|---|---|
| Confirmation | `confirm-dialog` | Controlled `open`, consequence and reversibility, optional required reason / typed confirmation, async error and duplicate-submit guard |
| Undo | `undo-toast` | Call `undoToast(message, inverse)` after a successful reversible self-action; supply the actual server-side inverse |
| Side panel | `sheet` | Modal with keyboard/focus handling and full width on phones; `docked` renders an independent non-modal aside |
| Mastery | `mastery-chip` | Five levels with a visible text label; `@codi-1/ui/lib/mastery` maps BKT evidence to D16 thresholds |
| Status | `status-badge` | Typed `kind`/`status` combinations for course, order and submission; labels plus icons |
| Empty | `empty` | Composable EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription and EmptyContent |
| Message | `alert` | Semantic info/success/warning/destructive/accent variants with icons and live-region roles |
| Steps | `stepper` | Current, completed and upcoming steps with accessible text |
| Progress | `progress-ring` | Bounded 0–100 progressbar with a visible percentage |

`/dev/foundation` renders the primitives for manual review in development; it returns 404 in production.
It changes no application records and is not a substitute for testing the authenticated header and inbox.

## Roles and protected routes

Client-safe role labels, workspace paths and priority live in `@codi-1/auth/roles`.
Priority is ADMIN > LECTURER > LEARNER, matching the existing dashboard redirect.
`GET /api/user/roles` reads the authenticated user's active database grants, including the banned-user check.
The header renders guest, learner, lecturer and admin navigation with an equivalent mobile menu.
This navigation is presentational; server pages/actions must still call `requireRole` from `@codi-1/auth`.
The cart destination `/cart` follows the module map and is supplied by the commerce workstream.

## In-app notifications (D15)

Use `notify(userId, title, body?, link?)` from `@/lib/notifications` in trusted server code.
There is deliberately no public endpoint accepting a notification recipient.
Links must be app-relative paths, and title/body are rendered as text, never HTML.

For an emitting module's transaction, use `createNotificationService(tx).notify(...)` from
`@/lib/notification-service` inside the same transaction as the business operation.
The service accepts the existing database or transaction's select/insert/update methods.

| Transition | Implementation | Guards |
|---|---|---|
| Event → unread | `notify` inserts a row into `notifications` | Trusted server caller; valid title and internal destination; DB user foreign key |
| List / unread count | `GET /api/notifications` | Authenticated, active role, no cache; both queries scope by session user ID |
| Unread → read | `PATCH /api/notifications`, `{ "id": 123 }` | Same-origin request; active session; positive safe integer; update scopes by both owner and ID |
| Read → read | Same endpoint | First read timestamp preserved; idempotent |
| All unread → read | `PATCH /api/notifications`, `{ "all": true }` | Updates only the viewer's unread rows |

The inbox shows the 50 most recent items and a count of all unread rows, polls every 30 seconds,
and refreshes on focus/open. Loading, empty, read/unread, network error and retry states are explicit.
Signing out or changing accounts hides the previous owner's inbox immediately.

## Manual verification still required

Capture the reference mockup and implementation in light/dark, plus 375px mobile, for:

- Guest / learner / lecturer / admin header and mobile navigation.
- Inbox loading, empty, unread, read, all-read, request failure and retry.
- Simple / reason-required / type-to-confirm dialogs; pending and server-error states.
- Undo toast; modal and docked panels; five mastery stops; all status badges; alerts; empty; steps; progress.

The supplied Claude artifact also needs direct visual comparison once browser access is available:
https://claude.ai/artifact/WXxCME9cqxrnT1Ff9AhUD5.
Do not mark the screenshot/browser checklist complete based only on automated tests or HTTP checks.
