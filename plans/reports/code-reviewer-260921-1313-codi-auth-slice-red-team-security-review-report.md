# Red Team Security Review: Codi PostgreSQL Port & Auth Slice

**Date:** 2026-09-21 | **Reviewer:** Code Security | **Status:** DONE_WITH_CONCERNS

---

## Critical Issues

| # | Area | Finding | Impact | Mitigation |
|---|------|---------|--------|-----------|
| C1 | **Authentication** | Account enumeration unspecified (Phase 4). Plan claims registration and forgot-password prevent enumeration via "identical responses," but implementation strategy absent. What does the signup form return for "email already taken"? What about timing? | Attacker enumerates valid email addresses via response timing or message text. | Phase 4 §9 must specify: (a) identical response text for known/unknown; (b) constant-time check; (c) rate limit on registration and password-reset endpoints. Document the actual response. |
| C2 | **OAuth linking** | Email verification state after linking unspecified (Phase 4/5). When a pre-registered unverified password account is linked via Google/GitHub OAuth, is the account marked verified? Plan silence on this means the linked account could remain unverified, blocking sign-in. | User links via Google but discovers account still unverified; confusing UX or account lockout. | Phase 5 must specify: does auto-link mark `is_email_verified = true`, or does `requireEmailVerification` still apply post-link? Test matrix (Phase 5, line 108) must include outcome state. |
| C3 | **Schema port** | **DATETIME2 → TIMESTAMPTZ timezone drift.** SQL Server `DATETIME2` is naive (no TZ); PostgreSQL `TIMESTAMPTZ` is UTC-aware. CHECK constraints comparing timestamps (line 107 `revoked_at >= granted_at`, lines 173–180 status/price/knowledge rules with SYSUTCDATETIME) silently change behavior if porting code runs on non-UTC timezone. Smoke test (21 scenarios) is too narrow to catch all edge cases. | Constraint enforcement drifts based on server timezone. E.g., a revocation backdated before grant could be accepted in UTC but rejected in UTC+7. | Phase 2 §1: Explicitly test all timestamp CHECKs with sample data at both UTC and offset timezones. Smoke test must include "revoked_at slightly before granted_at" edge case. Document server TZ requirement. |
| C4 | **Schema port** | **Email case sensitivity regression.** SQL Server unique index on email is case-insensitive (collation-aware); PostgreSQL `CREATE UNIQUE INDEX ON users(email)` is case-sensitive by default. Signup with `John@ex.com` then `john@ex.com` would fail in SQL Server but succeed in PostgreSQL. Better Auth + Kysely layer may hide this, but if any direct SQL queries exist, they hit it. | Duplicate accounts with case variants. OAuth linking to wrong account if provider returns lowercased email. Better Auth uniqueness check at ORM layer may catch it, but silent drift in row counts. | Phase 2 §2: Index must be `CREATE UNIQUE INDEX ON users(LOWER(email))`. Verify Better Auth config has no case-sensitive email checking. Add smoke test: register user@ex.com, attempt john@EX.COM from OAuth, confirm linked, not duplicate. |
| C5 | **Better Auth upstream bugs** | Phase 5 acknowledges #11321 (trustedProviders not honored) and #11138 (linking fails with unverified accounts) remain open at v1.7.5. Plan only catches #11138 error and shows recovery screen, but does not verify #11321 actually triggers the error or succeeds silently. Silent succeed = account linked when it shouldn't be. | Attacker pre-registers victim@ex.com, real owner signs in with untrusted provider (if #11321 ignores trustedProviders), account linked without permission. | Phase 5 implementation step 9: Test matrix must include "trustedProviders barrier" — attempt sign-in from a provider NOT in the trusted list and confirm it either errors with translated message or correctly rejects (document which). Do not assume either bug is fixed. |

---

## High Priority

| # | Area | Finding | Impact |
|---|------|---------|--------|
| H1 | **Upload security** | Presigned EXIF stripping client-side only (Phase 6). Canvas processing strips EXIF, but a user can POST directly to R2 presigned URL, bypassing canvas. Server cannot validate bytes. Blast radius stated as "avatar rendering broken," but if a user uploads a real JPEG with GPS EXIF, location leaks when avatar is shared. | PII leakage (coordinates). Attacker can upload image with malicious EXIF (e.g., `UserComment` field with script). | Phase 6 step 3: Document that presigned URL content-type/size constraints mitigate worst case (can't upload exe or unbounded data), but acknowledge EXIF risk is *accepted* as low-priority (single user's own avatar). If location privacy is required, add server-side EXIF stripping on upload confirmation. |
| H2 | **Authorization framework absent** | Auth slice delivers authentication only; no RBAC enforcement described. Schema has `roles.role_id` (LEARNER/LECTURER/ADMIN) and `user_roles`, but no mention of how protected endpoints check roles. Phase 4 grants LEARNER to all new users; nothing says HOW. Will Phase 8+ accidentally check `IS NOT NULL user_id` instead of role? | Future slices build without clear authorization patterns, opening privilege escalation bugs. | Phase 7 must include authorization stub: (a) define `hasRole(userId, roleId)` helper; (b) demonstrate on a protected `/lecturer` endpoint stub; (c) document: "check role before all sensitive mutations, not just after auth.getSession()." Add a test case showing admin-only action is rejected for learner. |
| H3 | **GitHub private email fallback untested** | Phase 5 says GitHub may return no email (private setting) and plan requests `user:email` scope + reads primary from `/user/emails` endpoint. Unspecified: if GitHub returns multiple verified addresses, which one is picked? If primary is unverified, does it fail? If emails endpoint is unavailable, does signup fail or fall back? | Account confusion (linking to wrong GitHub identity if primary swap). Silent signup failure breaks OAuth. | Phase 5 step 4 must specify: (a) pick primary OR first verified; (b) if none verified, prompt user to supply one, do not fail silently; (c) add rate limiting on email retrieval (GitHub API cost). Test with GitHub account having multiple verified addresses. |
| H4 | **Secret scan tool unspecified** | Phase 7 step 6: "run a secret scan" names no tool. Is it truffleHog, GitGuardian, secret-scanning by GitHub, or manual grep? Undefined = not enforced. | CI allows secrets to be committed undetected. | Phase 7 must name tool (recommend: TruffleHog v3 or GitHub secret-scanning) and show configuration in `.github/workflows/ci.yml`. Step 6: "Add step: `- uses: TruffleHog-Security/trufflehog@main` or equivalent". Add a planted secret test in CI to verify scan catches it. |

---

## Medium Priority

| # | Area | Finding | Impact |
|---|------|---------|--------|
| M1 | **CHECK constraint porting risk** | Phase 2 says "read every CHECK constraint" but provides no detailed port checklist. BIT comparisons (20 CHECKs), DATETIME comparisons, string functions vary between dialects. E.g., line 184: `CHECK (status <> 'PUBLISHED' OR price > 0)` — string comparison `<>` works in both, but collation matters if status has accents. | Silent semantic drift: constraint accepted in PostgreSQL but rejected in SQL Server or vice versa. Smoke test (21 scenarios) must explicitly cover each changed CHECK. | Phase 2 implementation: Before porting CHECKs, build a detailed translation table: BIT CHECKs → remove or rewrite to BOOLEAN domain; DATETIME CHECKs → test at TZ boundaries (line 107, 108). Add smoke-test scenario per CHECK type, not just counts. |
| M2 | **Session invalidation on password reset** | Phase 4 line 115: `revokeOtherSessions: true` on password change. No mention of whether a password reset (forgot password) also revokes. Difference: password change happens logged-in (reset does not). If reset doesn't revoke, attacker with an old session cookie could re-login after victim resets password. | Session hijacking via old token post-reset. | Phase 4 implementation: Verify Better Auth's `resetPassword` also triggers `revokeAllSessions` or equivalent. If not, hook it explicitly in the reset handler. Test: reset password, confirm old cookie no longer works. |
| M3 | **Role change session behavior unspecified** | When a user's role is granted or revoked (e.g., admin promotion or suspension), do active sessions reflect the new role? Or does the user stay logged in with stale role claims until re-login? | Privilege escalation (user logged in as admin, role revoked, user still acts as admin until logout). | Phase 4/41: Define: on role grant/revoke, either (a) revoke all sessions (safest), or (b) invalidate role cache with short TTL (faster, if role is cached). Implement at least the admin promotion case. Test: grant admin, confirm in active session, revoke admin, confirm session rejects admin action. |

---

## Low Priority

| # | Finding |
|---|---------|
| L1 | **Orphaned R2 objects** (Phase 6). Presigned uploads can fail after URL issued; object orphaned with no DB row. Plan: "Acceptable at this scale." Correct for MVP. Future: add monthly reaper script or document cost as technical debt. |
| L2 | **Render cold starts** (Phase 7). Render free tier spins down after 15 min, ~1–2 min wake time. Bad for live demo. Mitigation stated: "warm it beforehand." Add to deployment doc's "pre-demo checklist." |
| L3 | **User-supplied key path** (Phase 6). Plan correctly forbids client keys in presign endpoint ("derive server-side from session"). Mitigation is documented. Risk is LOW if implemented precisely as written; HIGH if implementer misreads and uses `req.body.key` anywhere. |

---

## Unresolved Questions

1. **Email verification required after OAuth linking?** Explicitly test case where unverified password account is linked — does the linked account need re-verification or is it auto-verified?

2. **Better Auth bugs #11321 / #11138 behavior in v1.7.5.** Do both reproduce, or has one been fixed? Verify by integration test before demo.

3. **GitHub multiple verified emails.** Which one is used if primary is unverified? Is this documented in the implementation, or will it fail at runtime?

4. **DATETIME2 timezone handling.** What is the deployment environment's timezone? Must porting verification and smoke tests both run at UTC and at an offset to catch drift?

5. **Authorization pattern.** Is a simple `hasRole(userId, roleId)` helper sufficient, or does the design require complex RBAC (resource-level, time-based expiry on role grants, etc.)? Confirm scope before Phase 8.

---

**Status:** DONE_WITH_CONCERNS

**Summary:** Plan establishes functional auth flows and explicitly mitigates key risks (enumeration, presigned-key derivation, Better Auth bugs). Three critical gaps block: (1) account-enumeration implementation unspecified, (2) email verification state after OAuth linking unspecified, (3) DATETIME2→TIMESTAMPTZ timezone drift and email case-sensitivity regressions not explicitly tested. High-priority concerns are upstream-bug verification and authorization framework stub. Low-priority risks are accepted correctly with mitigation plans.

**Concerns/Blockers:**
- C3, C4: Schema port verification must include timezone and collation testing, not just smoke-test counts.
- C2: OAuth linking outcome must be specified before Phase 5 starts (does `requireEmailVerification` still apply post-link?).
- C1: Account enumeration prevention (timing, message text) must be documented and tested in Phase 4.
- H4: Secret scan tool must be named and integrated into CI before Phase 7 completes.
