# Red-Team Feasibility Review: Codi PostgreSQL + Auth Slice Plan

**Date:** 2026-09-21 | **Scope:** Phases 1-7, all eight phases interdependent and time-boxed  
**Assessment:** Plan is **scoped aggressively** with **critical gaps in test infra and data initialization** that will surface at deadline.

---

## Critical Issues (Blockers)

### 1. **Test Infrastructure Phantom Requirement**
- **Where:** Phase 4 success criteria: "Vitest unit tests green; Playwright covers register → verify → sign in → sign out"  
  Phase 7 CI: "unit tests" run in workflow
- **Problem:** No phase installs, configures, or documents Vitest or Playwright. Success criteria reference tools that do not exist at execution time.
- **Impact:** BLOCKING. Phase 4 cannot pass success criteria; CI in Phase 7 will fail on a missing test runner. A 2-3 day delay materializes mid-stream.
- **Fix:** Add Vitest + Playwright install/config to Phase 1, allocate 1 day; update Phase 4 & 7 with concrete test files and example Playwright specs.

### 2. **Database Migration Runner Not Wired**
- **Where:** Phase 2 step 6 creates `database/migrations/001-baseline.sql` and `seed.sql`. Phase 1 docker-compose.yml has no mechanism to apply them.
- **Problem:** `docker compose up postgres mailpit` does not initialize the schema. A developer must manually `psql -f database/migrations/001-baseline.sql && psql -f database/seed.sql`. This breaks every fresh checkout and blocks Phase 3 onward.
- **Impact:** HIGH. Phase 3 `/api/health` will connect to an empty database and fail. Workaround is either manual CLI or a mystery bash script in `docker-compose.yml` that is not described.
- **Fix:** Add a Postgres init container or entry script in Phase 1 docker-compose that applies migrations on first startup. Document in Phase 1 success criteria.

### 3. **Roles Seed Dependency Unspecified**
- **Where:** Phase 2 creates `seed.sql` "3 roles + one admin". Phase 4 uses `databaseHooks.user.create.after` to insert `LEARNER` role assignment. But `LEARNER` role must already exist in `roles` table.
- **Problem:** If seed.sql is never run (see issue #2), `LEARNER` insertion fails with FK constraint error at first user registration in Phase 4. No phase guarantees roles exist.
- **Impact:** HIGH. Phase 4 demo breaks on "register new user" unless roles were seeded by someone manually.
- **Fix:** Ensure Phase 1's docker-compose integration runs seed.sql. Add an explicit success criterion in Phase 2: "SELECT COUNT(*) FROM roles WHERE name = 'LEARNER'" returns 1.

---

## High-Priority Issues (Significant Risk)

### 4. **Phase 2 Porting Effort Underestimated**
- **Estimate:** 3-4 days to port 1,245 lines of T-SQL with 85 CHECK constraints, update three tooling scripts (`gen_erd.py`, `lint_schema.py`, `smoke_test.sql`), and pass equivalence testing.
- **Reality check:** 
  - Porting 1,245 lines including mechanical substitution: ~1 day
  - Reading and understanding every CHECK constraint to detect SQL Server semantics: ~1 day minimum
  - Testing and fixing schema-migration parity: ~1 day
  - Regenerating ERD, updating linter (removing cascade-conflict check): ~0.5 day
  - Handling edge cases (name every constraint, composite FK for skill_prerequisites): ~0.5 day
  - **Realistic total: 4-5 days**, not 3-4.
- **Impact:** Medium-high. A one-day slip in Phase 2 blocks Phases 3, 4 start.
- **Mitigations already in plan:** Smoke test parity check, lint script. Sufficient. But team must be briefed that Phase 2 is the critical path and any hidden CHECK semantics delay downstream phases.

### 5. **OAuth Effort Vastly Underestimated**
- **Estimate:** 2 days to add Google and GitHub sign-in with account linking, handling two upstream Better Auth bugs (#11321, #11138) and GitHub private email fallback.
- **Work breakdown:**
  - Register OAuth apps, test callback URLs: ~0.5 day (easy to stall on redirect URI not matching deployed origin)
  - Implement both providers + `trustedOrigins`: ~0.5 day
  - GitHub email fallback (request scope + primary-verified fallback): ~0.5 day
  - Implement linking-error recovery screen + hasCredentialAccount() helper: ~1 day
  - Testing the matrix (6 scenarios × 2 locales = 12 test cases): ~1 day
  - **Realistic total: 3.5-4 days**, not 2.
- **Impact:** Medium. OAuth is Phase 5; if it slips, Phase 6 (which can run in parallel) is also blocked by the hasCredentialAccount() dependency.
- **Mitigation:** Phase 5 must cross-check against better-auth 1.7.5 behavior on issues #11138 and #11321 before committing to the recovery screen. If #11138 is already fixed in upstream, that's dead code and time saved.

### 6. **Better Auth BIGINT Type Mismatch — Unverified**
- **Where:** Tech-stack doc and Phase 4 assume Better Auth's `generateId: "serial"` makes `session.user_id` and `account.user_id` follow the app's BIGINT type, but the better-auth research report (§2) flags this as **unverified**: "BIGINT FK compatibility with string-typed userId columns is unverified — likely requires type cast or re-mapping fields."
- **Problem:** If Better Auth emits `userId text` on account/session tables and the app expects `userId BIGINT`, Phase 4 signup fails with a type mismatch error that surfaces only at runtime. No mechanism in the plan to verify this before Phase 4 starts.
- **Impact:** HIGH. Phase 4 step 3 says "Cross-check the config against hand-written tables by running one real signup before building any UI", which is the right catch, but **if the mismatch is found, Phase 4 is blocked and must rewrite the Better Auth tables**, a risky activity mid-stream.
- **Mitigation:** Phase 2 must add an explicit verification step: generate a fresh Better Auth config, inspect the resulting `account` and `session` table DDL, and confirm `user_id` columns are numeric. If they are `text`, escalate before proceeding.

### 7. **Create-Next-App Overwrite Conflict — Weak Mitigation**
- **Where:** Phase 3, step 1: "pnpm create next-app into the existing root... Reconcile with the Phase 1 package.json rather than overwriting it." Risk assessment suggests committing Phase 1 first and restoring the diff.
- **Problem:** `create-next-app` will ask which files to overwrite and will clobber tsconfig.json, package.json, eslint.config.mjs, prettier.config.mjs created in Phase 1. The operator must know to restore them from git, which is error-prone.
- **Impact:** Medium. If the operator doesn't restore, Phase 1's env contract (from src/lib/env.ts) is orphaned and env validation is lost silently. The app will read process.env directly, breaking the contract.
- **Mitigation (better):** 
  - Option A: Run `create-next-app` into a clean temp dir, then copy only the new files (`src/app`, `public`) into the existing repo, preserving Phase 1.
  - Option B: Commit Phase 1, run the scaffold, immediately review the git diff, and use `git checkout HEAD -- <files>` to restore, not manual inspection.
  - Plan should name the mitigation explicitly and add a checklist item to Phase 3: "Confirm env.ts was not overwritten; `pnpm typecheck` passes."

---

## Medium-Priority Issues (Tech Debt / Scope Risks)

### 8. **Phase 2 Says "Three Better Auth Tables," Plan Also Has Four**
- **Where:** Phase 2 overview: "add the three Better Auth tables (`session`, `account`, `verification`)"; tech-stack §3 says "Hand-write the four Better Auth tables (`user`, `session`, `account`, `verification`)".
- **Problem:** Inconsistency. Better Auth manages four tables: `user`, `session`, `account`, `verification`. The plan drops `user` from the mention in Phase 2 even though it's hand-written. The existing `users` table is not a Better Auth table; it is the app's table that Better Auth *maps onto*.
- **Impact:** LOW but confusing. A team member reading Phase 2 only will think there are three tables, not four, and may miss creating the `verification` table.
- **Fix:** Phase 2 should say "add the four Better Auth tables: `session`, `account`, `verification` (plus map Better Auth's `user` concerns onto the existing app `users` table)."

### 9. **Email in Production: Resend Without Verified Domain Lands in Spam**
- **Where:** Phase 4 risk assessment: "Resend without a verified domain lands in spam. Not a blocker for a Mailpit-based demo, but do not discover it the week of the presentation."
- **Problem:** Stated but not mitigated. If the grading presentation is the first time Resend is used (rather than Mailpit), and the team has not verified their domain or set up SPF/DKIM, verification mails go to spam and the demo fails.
- **Impact:** Medium. Grading happens once. A demo that "can't send email" is a hard fail.
- **Mitigation:** Add to Phase 7 or a pre-demo checklist: "If using Resend, verify domain DNS and send a test email to a personal address at least 24h before the demo."

### 10. **Cloudflare R2 Bucket CORS and Account Barrier**
- **Where:** Phase 6 risk assessment: "CORS on R2... this is the usual first failure."
- **Problem:** Two separate issues:
  1. The R2 bucket needs a CORS policy to allow PUT from the app origin. This is a configuration step not in Phase 6's implementation steps.
  2. Cloudflare account requires a payment method (credit card) for verification, which can block a student team.
- **Impact:** Medium. If R2 is only tested on demo day and CORS is not configured, avatar uploads fail with a browser CORS error. If a team member cannot add a credit card, the Cloudflare account cannot be created.
- **Mitigation:** Phase 6 implementation step should add: "Configure R2 bucket CORS policy: `PUT` and `OPTIONS` allowed from the deployed `NEXT_PUBLIC_APP_URL` origin." Phase 7 deployment doc should note: "R2 requires a verified Cloudflare account with payment details on file. This may take 24h. Set up this account in parallel with schema porting (Phase 2)."

### 11. **UC Model Update Not Confirmed; RDS Regeneration Blocked**
- **Where:** Plan.md open question 1: "Google and GitHub sign-in are being treated as alternate flows inside `Sign In`, keeping the count at 47. Confirm before the RDS is regenerated."
- **Problem:** Phase 2 is supposed to regenerate the RDS (Requirements Data Sheet) from the schema using the existing script. If the UC model is not confirmed, Phase 2 either:
  - Regenerates the RDS without the new sign-in flows (inconsistent with Phase 5), or
  - Waits for confirmation (blocks Phase 2).
- **Impact:** Medium. Phase 2 success criteria include "ERD regenerated from the ported schema", but the script that generates it depends on the UC model. If the UC count is uncertain, this success criterion is ambiguous.
- **Fix:** Confirm the UC model treatment before Phase 2 starts. If alternate flows keep the count at 47, document this in the RDS. If new use cases are added, update the plan's scope.

### 12. **When Is Database Seed Automatically Run?**
- **Where:** Phase 2 creates `seed.sql`; Phase 3 step 8 adds `/api/health`. There is no mention of when or how seed.sql is applied.
- **Problem:** Is seed.sql:
  - Run by docker-compose init script (see issue #2)?
  - Run manually by the developer?
  - Run by a migration tool?
  - Run by a Vitest setup fixture?
- **Impact:** Medium. Without clarity, a fresh checkout has no roles, and Phase 4 user registration fails.
- **Fix:** Phase 1 should explicitly add seed.sql to the docker-compose or init script. Phase 2 should not create seed.sql if it's not wired.

### 13. **Middleware Composition (Locale + Auth) — Order Not Yet Decided**
- **Where:** Phase 3 risk assessment: "Middleware conflict later... Decide the composition order now — locale first, then auth — and keep one exported middleware that calls both."
- **Problem:** Phase 3 says this should be decided, but does not describe it in implementation steps. Phase 4 then implements auth middleware assuming it is composed after locale middleware, but if Phase 3 did not do it correctly, Phase 4 has redirect loops.
- **Impact:** Medium-high. Middleware bugs are notoriously confusing; get the order wrong and the app appears to work but sign-in redirects infinitely.
- **Fix:** Phase 3 should include an explicit implementation step: "Wire locale middleware and auth middleware in `src/middleware.ts` with locale negotiation first, then session check. Test that a sign-in redirect to `/vi/auth/sign-in` resolves correctly."

### 14. **Environment Variables for Multiple Deployment Targets Not Detailed**
- **Where:** Phase 7 mentions Vercel and Render as targets; tech-stack says "Designed in now for Cloudflare". But the plan does not detail how env vars differ between Vercel and Render, or how to handle preview deployments vs production.
- **Problem:** Vercel uses `vercel.json` for env secrets; Render uses `render.yaml`. If the team does not set up env vars on both platforms identically, the app works locally but fails in one or both deployments.
- **Impact:** Medium. A one-off skip—set env on Vercel, forget Render—and the Render deployment silently fails at `/api/health`.
- **Mitigation:** Phase 7 deployment doc should include a table of each env var, which platform(s) need it, and whether it is a secret or public. Example:
  ```
  DATABASE_URL       | Vercel, Render | secret
  NEXT_PUBLIC_APP_URL | Vercel, Render | public
  GOOGLE_CLIENT_ID    | Vercel, Render | secret
  ```

### 15. **Phase 5 & 6 Parallel Execution Depends on Fallback**
- **Where:** Plan.md says "Phases 5 and 6 are independent of each other and can run in parallel once 4 lands." Phase 6 step 8 says "Hide the password section for OAuth-only users... If Phase 5 has not landed, branch on the `account` table directly rather than blocking."
- **Problem:** Phase 6 is *technically* independent but *socially* not: the cleaner implementation is `hasCredentialAccount()` from Phase 5. If Phase 5 is late, Phase 6 either uses a weaker fallback or waits. The "can run in parallel" statement is misleading if both are on the critical path.
- **Impact:** Low. Acceptable as-is because the fallback is stated, but the plan should clarify: "Phase 6 prefers Phase 5 completed but can proceed with a direct table query if needed."

---

## Scope Honesty Assessment

**Question:** Is delivering only auth a defensible first milestone for an academic AI-learning project?

**Answer:** Borderline defensible but risky for grading.
- **Defensible parts:**
  - Auth is genuinely complex (Better Auth integration, OAuth, email verification, account linking, upstream bug handling).
  - A working auth demo with bilingual UI is tangible and impressive for a grading panel.
  - Remaining work (course catalog, enrollment, AI/BKT) can proceed independently once schema exists.
- **Risk:**
  - The grading panel will ask: *"Where is the AI?"* The answer "it's next slice" sounds like an incomplete submission.
  - The plan delivers no learning-path personalization, no course browsing, no enrollment flow — the core UX of the platform.
  - If the AI phase is ambitious (course generation + adaptive mastery tracking via BKT), it may not land at all.
- **Recommendation:** Clarify with stakeholders whether "auth-complete, UI-present-but-noop" is sufficient for grading, or whether a lightweight course-browse feature (seed some courses, list them, enroll) should land in this slice. If the latter, the effort estimate increases by ~1 week.

---

## Dependency Graph — Verified

Declared graph is **correct**:
- Phase 1 → Phases 2, 3 (both read package.json + env.ts from Phase 1).
- Phase 2 → Phase 3 (Phase 3 `/api/health` needs database).
- Phases 2, 3 → Phase 4 (Phase 4 needs schema + app scaffold).
- Phase 4 → Phases 5, 6 (both build on auth core).
- Phase 3 → Phase 7 (Phase 7 CI and deploy builds on app).

**No hidden dependencies found.**

---

## Missing Work (Silent Scope)

| Item | Why needed | Effort | Proposed phase |
|---|---|---|---|
| Test infrastructure (Vitest + Playwright) | Success criteria reference it; CI runs it | 1d | Phase 1 |
| Migration runner / init script | docker-compose up must initialize DB | 0.5d | Phase 1 |
| Roles seed integration | LEARNER role must exist for Phase 4 | 0.5d | Phase 1 |
| Better Auth table verification | Unverified BIGINT FK type mismatch | 0.5d | Phase 2 |
| UC model confirmation | Blocks RDS regeneration | 0.25d | Phase 2 (pre-req) |
| Middleware composition example | Phase 3 mentions but doesn't detail | 0.5d | Phase 3 |
| Env var deployment table | No cross-platform clarity | 0.5d | Phase 7 docs |

**Added effort: ~4 person-days**, moving the estimate from 3.5-4.5 weeks to 4-5 weeks for a team of 4-5.

---

## Unresolved Questions

1. **Better Auth BIGINT FK:** Does `generateId: "serial"` actually emit BIGINT on FK columns, or does it emit text? Verify by running `create-auth` and inspecting the generated `account.sql` before Phase 2 completes.

2. **Upstream bug #11321 status:** Is it fixed in v1.7.5? Test matrix in Phase 5 assumes it still breaks; if fixed, remove the recovery screen.

3. **Scope question:** Does "auth-only, no course UI" meet grading expectations, or should a lightweight course list land in this slice?

4. **Localized email templates:** Phase 4 mentions templates render both locales, but how is the registration locale persisted? Read from Accept-Language header or persist on first signup request?

5. **Seed script format:** Does `seed.sql` insert only roles + admin, or also some dummy courses/lessons for Phase 3 home-page placeholder? Clarify scope.

6. **`hasCredentialAccount()` query:** Should it query `account` table directly or rely on a `LATERAL` join? Query performance matters if profiles are loaded on every page.

---

## Summary

**Plan is achievable but aggressive on timing.** Critical gaps in test infra and data initialization will surface at Phase 4 (user registration fails with missing roles/schema). BIGINT type mismatch with Better Auth is unverified and could block Phase 4 at the last moment.

Recommend:
1. **Immediately before Phase 1:** Confirm UC model treatment (open question 1).
2. **Phase 1:** Add test runner (Vitest) + migration/seed init + .gitattributes.
3. **Phase 2:** Verify Better Auth BIGINT behavior; rebuild tables if needed.
4. **Phase 3:** Explicit middleware composition example + create-next-app conflict mitigation.
5. **Phase 7:** Add env-var deployment table + pre-demo email/R2 setup checklist.

With these additions, **realistic total effort is 4-5 weeks for 4-5 people**, not 3-4. If scope is tight, defer Phase 6 (profile/avatar) to a later slice and focus on auth + OAuth + password reset core.

---

**Status:** DONE_WITH_CONCERNS  
**Summary:** Plan is sound in structure but underestimates effort by ~1 week and has three critical execution gaps (test infra, migration runner, role seed). All are fixable with Phase 1 additions and Phase 2 verification, but the window is narrow.  
**Concerns/Blockers:** 
- Test infrastructure phantom requirement (Phase 4 success criteria vs. no implementation)
- Database migration initialization not wired (docker-compose needs init script)
- Better Auth BIGINT FK type mismatch unverified at schema lock point
