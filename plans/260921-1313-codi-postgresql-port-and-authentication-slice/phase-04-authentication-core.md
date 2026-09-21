---
phase: 4
title: "Authentication core"
status: pending
priority: P1
effort: "5-6d"
dependencies: [2, 3]
---

# Phase 4: Authentication core

## Overview

Wire Better Auth to the ported schema and deliver the email/password half of the slice:
register with verification, sign in, sign out, change password, and forgot password.

Covers UC-01 Register Account, UC-02 Verify Email Address, UC-05 Sign In, UC-06 Recover
Password, UC-07 Sign Out, UC-09 Change Password.

## Requirements

- Functional: a new account cannot sign in until its email is verified.
- Functional: every new account receives the `LEARNER` role.
- Functional: a deactivated account (`is_active = false`) cannot sign in.
- Non-functional: no password or token is ever logged.
- Non-functional: all UI strings come from the message catalogues.

## Architecture

### Better Auth configuration

The decisions below were verified against better-auth 1.7.5 source, not documentation:

```ts
betterAuth({
  database: new Pool({ connectionString: env.DATABASE_URL }),
  advanced: {
    database: { generateId: "serial", joins: true },
  },
  user: {
    modelName: "users",
    fields: { name: "full_name", image: "avatar_url", emailVerified: "is_email_verified" },
    additionalFields: { is_active: { type: "boolean", input: false } },
  },
  session:      { modelName: "session",      fields: { userId: "user_id" } },
  account:      { modelName: "account",      fields: { userId: "user_id" } },
  verification: { modelName: "verification" },
  emailAndPassword: { enabled: true, requireEmailVerification: true },
  plugins: [nextCookies()],
})
```

`generateId: "serial"` is the real option — `useNumberId` is an internal variable that a
stale error message still names, which is the source of the confusion in community posts.
It makes the database assign ids and makes Better Auth coerce them with `Number()` on read,
so node-postgres returning `BIGINT` as a string is handled without a custom type parser.

`nextCookies()` is **not optional**: without it, `Set-Cookie` from a server action is
silently dropped and sign-in appears to succeed while leaving the user logged out.

### Role assignment

Better Auth knows nothing about `user_roles`. Use `databaseHooks.user.create.after` to
insert the `LEARNER` grant in the same request. It must be idempotent — the hook can fire
again on OAuth account linking in Phase 5.

### Account status

`is_active` is ours, not Better Auth's. Enforce it in a sign-in hook and reject with a
distinct error, so the UI can say "account deactivated" rather than "wrong password".

### Email

`EmailProvider` interface with a Mailpit/SMTP adapter for dev and Resend for production,
selected by `EMAIL_PROVIDER`. Templates render both locales — the verification mail must
match the language the user registered in, so persist the locale at registration or read it
from the request.

Do **not** await the send inside the auth callback; a slow SMTP call becomes a timing oracle
and a slow signup. Fire and forget with error logging.

### Account enumeration — the response contract

"Do not leak whether an address exists" is easy to assert and easy to violate. The contract,
stated so it can be tested:

| Endpoint | Existing address | Unknown address |
|---|---|---|
| Register | generic "check your email" + send a *"someone tried to register with your address"* mail | generic "check your email" + verification mail |
| Forgot password | generic "if that address exists, we sent a link" + reset mail | identical text, no mail |
| Sign in, wrong password | generic "email or password is incorrect" | identical text |

Two non-obvious requirements:

- **Email must be normalised to lowercase before lookup**, matching the `lower(email)` index
  from Phase 2, or the same address in different case behaves inconsistently.
- **Timing must not differ.** The unknown-address path skips a password hash and so returns
  measurably faster. Either perform a dummy hash on the miss path, or make both paths respond
  after a fixed floor. Pick one and test it — a timing oracle is still an oracle.

Rate-limit registration, sign-in, forgot-password, and verification resend. Better Auth ships
rate limiting; enable it rather than writing one.

### Authorization, not just authentication

The schema has `roles` and `user_roles` with grant/revoke history and a partial unique index
on active grants, but authentication alone never consults them. Without a check, "signed in"
silently becomes "authorized" — and the Admin and Lecturer use cases in later slices will
inherit that mistake.

Add now, while there is one protected page to apply it to:

```ts
getActiveRoles(userId): Promise<RoleId[]>   // revoked_at IS NULL
requireRole(session, ...roles): void        // throws if absent
```

`/dashboard` requires `LEARNER`. This is deliberately small — the point is that the pattern
exists and is used once, so later phases extend it instead of inventing one under deadline.

### Session access

- React Server Components: `auth.api.getSession({ headers: await headers() })`.
- Middleware: Node.js runtime is available in Next 15.2+, so a real database-backed check is
  possible. Prefer the cheap cookie check for redirect decisions and re-verify in the page
  or route handler. Never treat a cookie's presence as authorization.

## Related Code Files

- Create: `src/lib/auth.ts`, `src/lib/auth-client.ts`
- Create: `src/lib/providers/email/{index,types,mailpit,resend}.ts`
- Create: `src/emails/{verify-email,reset-password}.tsx`
- Create: `src/app/api/auth/[...all]/route.ts`
- Create: `src/app/[locale]/(auth)/{sign-in,sign-up,verify-email,forgot-password,reset-password}/page.tsx`
- Create: `src/app/[locale]/(app)/dashboard/page.tsx` (protected placeholder)
- Create: `src/components/auth/*` (forms)
- Modify: `src/middleware.ts` (compose locale + auth), `messages/{vi,en}.json`

## Implementation Steps

1. Install `better-auth`, `pg`, and the email dependencies. Generate `BETTER_AUTH_SECRET`.
2. Write `src/lib/auth.ts` per above. Mount the route handler with `toNextJsHandler`.
3. Cross-check the config against the hand-written tables from Phase 2 by running one real
   signup before building any UI. A column-name mismatch surfaces here, cheaply.
4. Build the `EmailProvider` seam and the Mailpit adapter; verify mail arrives at :8025.
5. Registration form with zod validation shared between client and server. Password rules:
   set a minimum length of 12 and **do not** impose composition rules — length beats
   character-class requirements, which mostly push users toward `Password1!`.
6. Verification page consuming the token; handle expired and already-used tokens as distinct,
   translated messages.
7. Sign-in form, including the deactivated-account and unverified-email paths.
8. Forgot-password and reset-password flows, implementing the response contract above —
   including the timing floor, not just the message text. Reset must invalidate the token on
   use and revoke existing sessions.
8b. Add `getActiveRoles` / `requireRole` and enforce `LEARNER` on `/dashboard`.
8c. Enable Better Auth rate limiting on register, sign-in, forgot-password, and resend.
9. Change-password form for signed-in users, with `revokeOtherSessions: true`.
10. Sign out, clearing the session cookie and redirecting locale-aware.
11. Protected `/dashboard` placeholder proving the session round-trip.
12. Tests — see below.

## Success Criteria

- [ ] Register → mail in Mailpit → verify → sign in → `/dashboard` renders the user's name
- [ ] Sign-in is refused before verification, with a distinct translated message
- [ ] A `LEARNER` row appears in `user_roles` for each new account, exactly once
- [ ] Setting `is_active = false` blocks sign-in with its own message
- [ ] Forgot-password responds identically for known and unknown addresses — **verified by
      measuring response time across both paths**, not by reading the message
- [ ] Registering with `Alice@x` when `alice@x` exists is treated as the same account
- [ ] Reset password works; expired and reused tokens are handled distinctly; reset revokes sessions
- [ ] Change password succeeds and other sessions are revoked
- [ ] `/dashboard` refuses a signed-in user whose `LEARNER` grant has been revoked
- [ ] Rate limiting rejects a burst of sign-in attempts
- [ ] Every string renders in both `vi` and `en`
- [ ] Vitest unit tests green; Playwright covers register → verify → sign in → sign out

## Risk Assessment

**Schema/config mismatch.** The most likely failure, and it appears as a confusing runtime
error deep in the library. Step 3 exists to surface it before any UI is built on top.

**Middleware composition.** Locale and auth middleware must compose in one exported function.
Getting this wrong produces redirect loops that look like auth bugs. Decided in Phase 3.

**Account enumeration.** Registration, forgot-password, and sign-in can each leak whether an
address exists, through message text *or* response timing. Treated explicitly above; verify
it rather than assume it.

**Email in production.** Resend without a verified domain lands in spam. Not a blocker for a
Mailpit-based demo, but do not discover it the week of the presentation.

**`requireEmailVerification` and OAuth.** Phase 5 introduces users who never had a password.
Confirm this flag does not block them — it interacts with the auto-linking decision.
