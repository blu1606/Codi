#!/bin/sh
# Static security checks, run from the repo root before a release (Git Bash on Windows works):
#   sh scripts/security-check.sh
# 1. no hardcoded secret in tracked files (the CI check Codi runs, with the rebuild's own variable names)
# 2. no secret-bearing file tracked (or about to be) by git (.env, rebuild.env, dumps, load-test CSVs)
# 3. npm audit of the production dependencies at severity high or above
set -u
cd "$(dirname "$0")/.."
FAILS=0
AUDIT=$(mktemp)
trap 'rm -f "$AUDIT"' EXIT

echo "1. hardcoded secrets in tracked files"
KEYS='BETTER_AUTH_SECRET|DATABASE_URL|POSTGRES_PASSWORD|RESEND_API_KEY|GOOGLE_CLIENT_SECRET|GITHUB_CLIENT_SECRET|GOOGLE_GENERATIVE_AI_API_KEY|OPENAI_API_KEY|SEPAY_WEBHOOK_SECRET|R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|GITHUB_PROFILE_BUDGET_KEY'
# KEY=<value of 12+ chars>, except test fixtures, the throwaway local database password (codi:codi@...) and ${...}
# references.
hits=$(git ls-files -co --exclude-standard -z | xargs -0 grep -nIE "($KEYS)[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9_./+:@-]{12,}" -- 2>/dev/null \
  | grep -vE '\.example:|\.md:|\.test\.ts:|codi:codi@|\$\{|process\.env|ENV\.|read\("' || true)
if [ -n "$hits" ]; then echo "$hits"; echo "   FAIL  possible hardcoded secrets above"; FAILS=$((FAILS + 1)); else echo "   ok    none"; fi
# Well-known token shapes anywhere in tracked files.
tokens=$(git ls-files -co --exclude-standard -z | xargs -0 grep -nIE '(sk-[A-Za-z0-9]{32,}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,}|re_[A-Za-z0-9]{24,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)' -- 2>/dev/null || true)
if [ -n "$tokens" ]; then echo "$tokens"; echo "   FAIL  token-shaped strings above"; FAILS=$((FAILS + 1)); else echo "   ok    no token-shaped strings"; fi

echo "2. secret-bearing files tracked by git"
tracked=$(git ls-files -co --exclude-standard | grep -E '(^|/)\.env(\.local|\.production)?$|rebuild\.env$|\.dump$|data\.sql$|perf/k6/.*\.csv$|accounts\.csv$' || true)
if [ -n "$tracked" ]; then echo "$tracked"; echo "   FAIL  remove these from git"; FAILS=$((FAILS + 1)); else echo "   ok    none"; fi

echo "3. npm audit (production dependencies, high and critical)"
# `next` is backend/shims/next: a few hundred lines that let Codi's route handlers run on Hono, published under the
# name and version of Next.js 16.3.5 but containing none of its code, so Next.js advisories do not apply to it.
IGNORED="next"
npm audit --omit=dev --json > "$AUDIT" 2>/dev/null
if IGNORED="$IGNORED" node -e '
  const audit = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const ignored = new Set(process.env.IGNORED.split(" "));
  let bad = 0;
  for (const [name, v] of Object.entries(audit.vulnerabilities || {})) {
    const advisories = v.via.filter((x) => typeof x === "object").map((x) => `${x.title} (${x.url})`);
    const fix = v.fixAvailable === true ? "npm audit fix" : v.fixAvailable ? `upgrade ${v.fixAvailable.name} to ${v.fixAvailable.version}` : "no fix";
    const blocking = ["high", "critical"].includes(v.severity) && !ignored.has(name);
    if (blocking) bad++;
    console.log(`   ${blocking ? "FAIL" : ignored.has(name) ? "skip" : "note"}  ${name} ${v.severity}: ${fix}`);
    if (blocking) for (const a of advisories) console.log(`           ${a}`);
  }
  process.exit(bad ? 1 : 0);
' "$AUDIT"; then
  echo "   ok    no high or critical advisory outside the ignore list ($IGNORED)"
else
  echo "   FAIL  high or critical advisories above"
  FAILS=$((FAILS + 1))
fi

if [ "$FAILS" -gt 0 ]; then echo "security-check: $FAILS failed"; exit 1; fi
echo "security-check: all passed"
