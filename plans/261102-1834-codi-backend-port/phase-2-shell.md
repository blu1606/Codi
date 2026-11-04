# Phase 2 report: shell / account

Status: done. Register, email OTP, sign-in, forgot/reset password, settings (name, email, password, sessions),
profile, notifications and the search palette now run on the real backend. GitHub skill analysis stays on the legacy
store (reason below). Resend is not configured: every email code is printed to the backend console as
`[Auth OTP for <email>]: 123456`; the OTP hint under the code boxes says so.

## Screens ported

| Screen | Backend used |
|---|---|
| /register + OTP step | `POST /api/auth/sign-up/email` (creates the account, signs it in, sends the code) → `email-otp/verify-email` → `get-session`; resend `email-otp/send-verification-otp {type:'email-verification'}`. Existing email → "Email đã được dùng"; wrong / expired / too many tries map to the Vietnamese copy. A new learner then lands on the GitHub onboarding step as before. |
| Sign-in (page + gated modal) | unchanged from phase 1, plus `POST /api/student/profile {type:'login'}` so sign-ins feed the heatmap. |
| Google / GitHub buttons | real OAuth: `POST /api/auth/sign-in/social` → browser goes to the provider; back to `/login?social=ok&next=…` (continues to `next` / role home), new accounts to `/onboarding/github?next=…`, errors to `/login?social=<provider>&error=…` (shown with the existing alert + "Thử lại với …"). The simulated account chooser/consent screens are gone; the provider's own screens replace them. |
| /forgot-password | `email-otp/send-verification-otp {type:'forget-password'}` → `email-otp/reset-password {email,otp,password}`; unknown emails fail like a wrong code. |
| /reset-password?token= | `POST /api/auth/reset-password {token,newPassword}`; the error box shows the server failure. |
| /reset-password?source=account | `GET account/password/reset-status` (grant cookie) → `POST account/password/reset` (signs every session out → /login). |
| /settings · account | name `PATCH /api/user/profile`; change email `email-otp/request-email-change` → `email-otp/change-email` (occupied address refused before any code is sent); unverified card `send-verification-otp` + `verify-email`. |
| /settings · security | `change-password {currentPassword,newPassword,revokeOtherSessions:true}`; "Quên mật khẩu hiện tại?" `account/password/request-reset` + `verify-reset`; devices `list-sessions` + `get-session` (current) + `revoke-session {token}`. |
| /profile | `GET /api/student/profile` (enrolments + progress) and the new `GET /api/student/profile/summary?year=` (heatmap days, orders). Name + avatar save with `POST /api/auth/update-user {name,image}`. |
| Notification bell | `GET /api/notifications` (mount, open, 30 s, focus); `PATCH {id}` / `PATCH {all:true}`. |
| Search palette (Ctrl K) | courses `GET /api/courses`; learner: `GET /api/learner/overview` (enrolled courses, lesson UUIDs) + summary orders; lecturer: `getLecturerCourses`, `getCourseEditorData` per own course, `getGradingQueueData {status:'pending'}`, `getLecturerQuestionsData` (unanswered + answered); admin: `getAdminOrdersExportAction`, `getAdminPublicationQueue('pending')`. |
| Header / user menu / drawer | name, email, avatar from the backend session; sign-out awaits `/api/auth/sign-out`. |

## Backend addition

`backend/src/app/api/student/profile/summary/route.ts` — `GET ?year=` (session required) →
`{ year, days:[{day,count}], orders:[{id,code,status,totalAmount,createdAt,items:[{courseId,title}]}] }`.
Days (Vietnam calendar) come from `student_activities`, enrolments, completed lessons, submitted assessments and
study days, because the seed has no `student_activities` rows and the stock route would show an empty heatmap;
orders because Codi has no learner order-list route and `student_transactions` is empty. No vendored file changed.

## Decisions

- Avatar: `POST /api/user/avatar` needs Cloudflare R2, which is not configured locally, so the cropped JPEG / preset
  SVG is stored as a data URL in `user.image` via Better Auth `update-user`. Copy no longer claims "Cloudflare R2".
- Dev drawer "Đặt lại dữ liệu": relabelled "Đặt lại dữ liệu tạm". It still resets only the transitional store
  (`/api/reset`, db `codi_rebuild`); the dialog and a note say server data is untouched and point to `npm run seed`
  in backend. I did not add a browser-triggered reseed: it drops and recreates the live schemas under the running
  server, signs everyone out and takes the pg_dump path from a request handler, which is not "simple and safe".
- Removed dev-drawer flags that no longer drive anything: notifications, sessions, profileData (real errors now show
  the same error states).
- Transitional bridge: `Codi.state.currentUserId` (lib/codi.js) is null for a user missing from the legacy store,
  which a new sign-up / first OAuth sign-in always is. `syncLegacyUser()` (account-store) creates/updates that
  legacy record from the backend session (name, email, image, emailVerified) and is run after auth and from the
  always-mounted dev drawer. Remove it with the legacy store in Phase 3.

## Still on the legacy store

- GitHub "Hồ sơ năng lực" panel, onboarding step, learner card and settings "Tài khoản liên kết" (`slice:githubAnalysis`).
  The real flow needs `link-social` OAuth plus the GitHub + OpenAI analysis pipeline, and its result DTO
  (github-profile-result.tsx) differs from the rebuild's canned result layout; porting the renderer is a separate
  task. The simulated outcomes still come from the dev-drawer `githubAnalysis` flag.
- Search: admin users and vouchers groups (no list route in the contract; the admin area is adding its own).
- Header cart badge reads `Codi.cart()` (commerce owns the cart).

## Shared-file changes needed (controller)

- Done by controller (b0ae871): Vite proxy `changeOrigin: false`; every Origin-checked route returned 403 through it.
- `lib/codi.js` Phase 3: derive the current user from `Codi.session.user` instead of requiring a legacy record; then
  `syncLegacyUser` / `useLegacyUserSync` can go.
- OAuth on localhost: Google needs `http://localhost:5190/api/auth/callback/google` added to its OAuth client;
  GitHub's app was registered for Codi's localhost:3001 (GitHub may accept another loopback port — the button does
  reach github.com/login/oauth/authorize, the full round trip was not tested because it needs a real account).
- e2e: no change needed in smoke/flow/axe/mobile.

## Verification

- `npx vite build` (scratchpad build-shell) passes; `backend npx tsc --noEmit` clean.
- Playwright `scratchpad/e2e/shell-account.js` (OTP read from the `verification` table): 35/35 pass — register,
  wrong OTP, verify → onboarding, reload stays signed in, empty notifications, profile name + preset avatar persist
  after reload (DB checked), header name, settings name, sessions list, wrong/right current password, occupied email
  refused, email change (DB), account recovery → /login, sign-in with new email + password, forgot password, sign-in
  with reset password, unverified card verifies, GitHub button redirects, provider error notice, learner
  notifications listed from DB, mark-as-read persists across reload, search for learner/lecturer/admin, transactions
  tab, lecturer + admin profile/settings. No page errors; the only console errors are the three deliberate 400s
  (wrong OTP, wrong current password, occupied email).
- Data touched: test accounts `e2e.shell.*@example.com`; usr-learner-001's notifications are now all read.
