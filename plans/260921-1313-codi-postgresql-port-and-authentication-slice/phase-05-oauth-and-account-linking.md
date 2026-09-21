---
phase: 5
title: "OAuth and account linking"
status: pending
priority: P1
effort: "3-4d"
dependencies: [4]
---

# Phase 5: OAuth and account linking

## Overview

Add Google and GitHub sign-in with automatic account linking, and handle the failure modes
that two open Better Auth bugs make likely.

Documented as alternate flows of UC-05 Sign In — pending confirmation, see `plan.md` open
question 1.

## Requirements

- Functional: a user can sign in with Google or with GitHub, in either locale.
- Functional: signing in with a provider whose email matches an existing account links to
  that account rather than creating a duplicate.
- Functional: an OAuth-only user never sees a password prompt and can still reach every
  profile screen.
- Non-functional: a provider outage degrades to email/password, it does not break the page.

## Architecture

```ts
socialProviders: {
  google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
  github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
},
account: {
  accountLinking: { enabled: true, trustedProviders: ["google", "github"] },
},
```

**Auto-linking is the user's explicit decision**, taken with the trade-off stated: anyone
who pre-registers an address they do not own could later be linked to by the real owner's
OAuth sign-in. The risk is bounded because `requireEmailVerification` means an unverified
pre-registration cannot itself sign in.

### Verification state after linking — decide before building

When a provider links to an existing **unverified** password account, does that account
become verified? The plan previously left this undefined, which is how an account-takeover
window stays open by accident.

**Proposed: yes, mark it verified.** Google and GitHub both assert a verified address, so
the assertion is at least as strong as our own email round-trip. More importantly it *closes*
the window the auto-link decision opened: an attacker who pre-registered the address never
verified it, and once the real owner signs in via OAuth the account becomes theirs rather
than remaining in a half-claimed state.

The residual risk stays what the user accepted: the pre-registering attacker may have set a
password, and linking does not remove it. **Therefore revoke any existing `credential`
account row on link** — the real owner can set a new password through forgot-password. This
is the mitigation that makes the accepted trade-off actually bounded rather than nominal.

Confirm the decision (`plan.md` open question 1) before implementing.

**GitHub returns no email when the user has it set to private.** This is common among
developers, which is exactly this platform's audience, so it is a likely path rather than an
edge case. Request the `user:email` scope and read the primary verified address from the
emails endpoint. If still absent, send the user to a "supply an email" step rather than
failing with a stack trace.

**Two open upstream bugs** land on precisely the flow we enabled:

| Issue | Effect |
|---|---|
| #11321 | `trustedProviders` not always honoured |
| #11138 | linking fails when an *unverified* password account holds the same email |

So the realistic failure is not an insecure link — it is a **hard failure at the callback**.
Handle it as a first-class path: catch the linking error and show a translated screen telling
the user to verify their existing account first, with a resend button. Do not let it surface
as a 500.

Because passwords live on `account`, an OAuth-only user has no `credential` row. Any screen
offering "change password" must therefore branch on whether one exists — Phase 6 depends on
this.

## Related Code Files

- Modify: `src/lib/auth.ts` (providers, linking, GitHub email fallback)
- Create: `src/components/auth/oauth-buttons.tsx`
- Create: `src/app/[locale]/(auth)/link-error/page.tsx`
- Create: `src/lib/auth-helpers.ts` (`hasCredentialAccount(userId)`)
- Modify: `messages/{vi,en}.json`, `.env.example`, `docs/tech-stack.md` (callback URLs)

## Implementation Steps

1. Register OAuth apps. Callback URLs: `{BETTER_AUTH_URL}/api/auth/callback/google` and
   `.../github`. Register localhost and deployed origins now — a missing redirect URI is the
   most common first failure.
2. Add both providers to the config and set `trustedOrigins` (**not** `allowedHosts`, which
   applies only to dynamic base-URL patterns).
3. Add the buttons with official brand marks and accessible labels; both locales.
4. Request `user:email` from GitHub and implement the primary-verified-email fallback.
5. Ensure the Phase 4 role hook grants `LEARNER` to OAuth users too, and remains idempotent
   when an existing account is linked.
6. **Establish actual behaviour of #11321 and #11138 before writing mitigations.** Both were
   open at v1.7.5 but neither is confirmed against our configuration. Run the matrix below
   against a scratch database first. If `trustedProviders` is honoured, the mitigation is
   smaller than planned; if #11138 is fixed, the recovery screen is dead code and should not
   be built. Do not implement defences for bugs that do not reproduce.
6b. Implement the linking-failure path and its page, if step 6 shows it is needed.
6c. Implement the verification-state decision: mark verified on link, and revoke any existing
   `credential` row.
7. Add `hasCredentialAccount()` for Phase 6 to branch on.
8. Confirm `requireEmailVerification` does not block provider-verified users.
9. Test the matrix below.

## Success Criteria

- [ ] Google sign-in creates an account and reaches `/dashboard`
- [ ] GitHub sign-in likewise, **including with a private GitHub email**
- [ ] Signing in with a provider matching a *verified* password account links, creating no duplicate
- [ ] Matching an *unverified* password account shows the translated recovery screen, not a 500
- [ ] An OAuth-only user sees no "current password" field anywhere
- [ ] `user_roles` holds exactly one active `LEARNER` row after linking
- [ ] Both flows work in `vi` and `en`

### Test matrix

| Existing state | Action | Expected |
|---|---|---|
| none | Google sign-in | account created, LEARNER granted |
| none | GitHub sign-in, private email | account created using primary verified address |
| verified password account | Google, same email | linked, no duplicate |
| unverified password account | Google, same email | linked; account marked verified; prior `credential` row revoked |
| attacker pre-registered victim's email, unverified, password set | victim signs in with Google | victim owns the account; attacker's password no longer works |
| mixed-case email on the provider vs stored | OAuth sign-in | matches via `lower(email)`, no duplicate |
| Google account exists | GitHub, same email | linked to same user |
| OAuth-only user | opens profile | no password section |

## Risk Assessment

**Upstream bugs may behave differently than reported.** Both issues were open at v1.7.5.
Verify actual behaviour against the matrix before assuming either the happy or the failing
path. If #11138 turns out to be fixed, the recovery screen becomes dead code — remove it
rather than leaving a path no one exercises.

**Secrets in the repo.** OAuth client secrets are the easiest thing to paste into a committed
file. `.gitignore` covers `.env*`; the CI secret scan in Phase 7 is the backstop.

**Provider consent screens.** Google's unverified-app screen shows a warning during testing.
Harmless, but surprising during a live demo — brief the team.

**Email change after linking.** Out of scope here, but worth knowing: if a user later edits
their email in Phase 6, it no longer matches the provider identity. Phase 6 must decide
whether to allow that for OAuth-linked accounts.
