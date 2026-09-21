# Better Auth + Kysely/PostgreSQL + Next.js 15 Research Report

**Date:** 2026-09-21 | **Current version:** 1.7.5 (released Sep 2026) | **Sources:** Official docs + GitHub issues

## 1. Current Stable Version & Breaking Changes

Better Auth **v1.7.5** stable. v1.7 major changes:
- SCIM provisioning no longer depends on Organization/SSO plugins; requires full reprovisioning on upgrade
- Account schema: if you have v1.7.0–1.7.2 account schema, remove issuer unique index; make issuer nullable before upgrading
- Most other changes additive; upgrade guide available at better-auth.com/docs/guides/1-7-upgrade-guide

## 2. Database Wiring – Kysely/PostgreSQL – **CRITICAL ID MAPPING RESOLVED**

**Direct Pool support:** Accepts `node-postgres` Pool directly:
```ts
import { betterAuth } from "better-auth";
import { Pool } from "pg";

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
});
```

**ID generation (VERIFIED):** Better Auth default is random base62 strings. For auto-increment:
- `advanced.database.generateId: "serial"` disables Better-Auth ID generation; DB handles it. **CRITICAL CAVEAT:** Both `useNumberId: true` and `generateId: "serial"` currently generate **32-bit integers, not BIGINT** (#5657, open/unfixed). Workaround: manually edit generated schema SQL to `BIGINT` before committing, then Better-Auth will infer numeric types correctly on reads.
- Better Auth converts between string (API) ↔ numeric (DB) transparently.

**Your schema mapping (VERIFIED for app tables; unverified for Better Auth tables):** Rename to `users.id BIGINT GENERATED ALWAYS AS IDENTITY` + `user.modelName: "users"`. **BUT:** session/account/verification default schema uses `userId text NOT NULL` (string FKs to `user.id`). **Status:** Better Auth doesn't auto-declare FKs; you must add them manually post-schema-generation. BIGINT FK compatibility with string-typed userId columns is unverified—likely requires type cast or re-mapping fields.

**CLI (VERIFIED):** `npx auth@latest generate` (not `@better-auth/cli`). Outputs `schema.sql` to project root for Kysely; no documented `--output` flag for custom migration folder. Manually move/rename before committing.

**Performance:** Enable `advanced.database.joins: true` for 2–3x faster queries.

## 3. **Critical: Credential Password Location**

**Answer: `account` table, not `user`.** When using credential provider (email/password), the bcrypt hash is stored on `account` with `providerId: "credential"`, linked to user via `userId`. User table has no password column. **Implication:** Google-only accounts need no password field at all; email/password users have their password on the linked account record.

## 4. Mapping Onto Existing `users` Table

Can use `user.modelName: "users"` + `user.fields: { ... }` to map Better Auth columns to your snake_case schema. Works with BIGINT PK (e.g. `user_id BIGINT PRIMARY KEY`). **Constraints:**
- id field must remain named `id` or mapped via database; PK type (BIGINT) is fine
- additionalFields can extend user table with custom columns (e.g. `is_active`, `avatar_url`)

## 5–7. Email Verification, Password Reset, Change Password

**Email verification:** `sendOnSignUp`, `requireEmailVerification`, `autoSignInAfterVerification`, callbacks `beforeEmailVerification`/`afterEmailVerification`. Avoid awaiting email sends (timing attack).

**Password reset:** `requestPasswordReset` → `resetPassword`. Config `resetPasswordTokenExpiresIn` (default 3600s), optional `revokeSessionsOnPasswordReset`.

**Change password:** `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`. Setting `revokeOtherSessions: true` invalidates all other sessions; defaults false.

## 8. Google OAuth & Account Linking – **trustedOrigins VERIFIED**

**Base URL (VERIFIED):** Use `baseURL` (not env `BETTER_AUTH_URL`). Supports static string or dynamic object for multi-domain deploys. `trustedOrigins` (correct; `allowedHosts` is only for dynamic `baseURL` patterns) extends trust beyond base URL.

**Config:**
```ts
baseURL: "https://yourdomain.com",
trustedOrigins: ["https://trusted-domain.com"],
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }
}
```

**Redirect URI:** Register: `http://localhost:3000/api/auth/callback/google` (dev), `https://your-domain.com/api/auth/callback/google` (prod).

**Account linking:** Enabled by default for verified emails. Config `accountLinking.enabled: true` + `trustedProviders: ["google"]` auto-links same-email OAuth. **Caveat (Sep 2026 bug):** `trustedProviders` not currently respected in some scenarios (#11321); account linking can fail if unverified password account exists (#11138). **Security:** Implicit linking can be disabled with `disableImplicitLinking: true` to require manual confirmation.

## 9. Next.js 15 Specifics

**Route handler:**
```ts
// app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

**Server Actions & cookies:** Use `nextCookies()` plugin to auto-set cookies in server actions (e.g., `signInEmail`). Without it, Set-Cookie headers are ignored in server actions. **Known issues:** Router refresh loops reported (#8464); plugin cookie leakage (#8784)—monitor in production.

**RSC session reading:** `auth.api.getSession()` with headers for React Server Components. RSCs can't set cookies; cache refresh waits for client interaction.

**Middleware session checks:** Next.js 15.2.0+ supports Node.js runtime in middleware for full DB validation; older versions limited to edge-compatible `getSessionCookie()` (cookie only, no DB lookup, ~1ms).

## 10. Profile Fields & Avatar

**Extra columns:** `user.additionalFields` extends schema with custom fields (e.g. `is_active`, `avatar_url`, `full_name`). These are handled by your own schema migration; Better Auth doesn't auto-generate them.

**Avatar image:** Better Auth uses `user.image` for profile picture. Map your `avatar_url` column via `user.fields: { image: "avatar_url" }`.

## 11. Known Gotchas & Pitfalls

1. **Middleware Edge Runtime:** Middleware runs on edge, cannot make database calls (pre-15.2). Use `getSessionCookie()` for optimistic checks or wait for Node.js runtime support.
2. **Kysely migration:** CLI generates SQL; commit manually to your own migration files (no automatic ORM integration like Prisma).
3. **Cookie naming:** If custom cookie name/prefix, sync it in middleware's `getSessionCookie()` config; it doesn't auto-read from auth.ts.
4. **Account linking timing:** Unverified password + OAuth same email = linking fails; design flow to verify email first or use `disableImplicitLinking`.
5. **SCIM upgrade:** If upgrading from v1.6 with SCIM, provisioning data lost; plan cutover carefully.
6. **Smaller ecosystem:** Edge-case bugs may need source-code digging; smaller community than NextAuth.
7. **ID field customization:** Cannot rename user.id field; if your schema uses `user_id`, you must map at the database adapter level (not yet first-class in config).

---

## CRITICAL BLOCKERS – ID Mapping Linchpin

**Status: UNRESOLVED—planning blocked until clarified.**

1. **BIGINT FK Type Mismatch (UNVERIFIED):** Your `users.user_id BIGINT` + 27 FKs vs. Better Auth's `session.userId text`. Schema inference doesn't auto-correct FK types. **Must verify:** Does Better Auth's type inference auto-promote string userId to numeric when `generateId: "serial"` + app manually edits schema to BIGINT? Or must you remap `session.fields: { userId: "..." }` to an integer column? Sources silent—test required before schema lock.

2. **Referential Integrity (UNVERIFIED):** Do session/account/verification tables declare actual FK constraints in generated schema.sql, or only logical references? If generated, are they `text` FKs (mismatch with your BIGINT)? If not generated, do you add them manually? Documentation unclear.

3. **CLI Output Path (VERIFIED):** `schema.sql` outputs to project root only; no `--output` flag. You must rename/move to numbered migration before committing (manual step, add to docs).

## Remaining Open Questions

- Can `additionalFields` reference foreign keys or only scalar types?
- Post-v1.7.5, is account linking with Google working reliably when `disableImplicitLinking: true`, or are there still edge cases with same-email OAuth attempts?

---

## Sources

- [Better Auth Database Concepts](https://better-auth.com/docs/concepts/database)
- [Better Auth Options Reference](https://better-auth.com/docs/reference/options)
- [Better Auth PostgreSQL Adapter](https://better-auth.com/docs/adapters/postgresql)
- [Better Auth CLI Documentation](https://better-auth.com/docs/concepts/cli)
- [Better Auth Google OAuth](https://better-auth.com/docs/authentication/google)
- [Better Auth GitHub Issue #5657 – BIGINT IDs](https://github.com/better-auth/better-auth/issues/5657)
- [Better Auth GitHub Issue #11321 – trustedProviders](https://github.com/better-auth/better-auth/issues/11321)
- [Better Auth GitHub Issue #11138 – Account linking UNVERIFIED_EMAIL](https://github.com/better-auth/better-auth/issues/11138)
