#!/bin/sh
# Fast, read-only check that a running Codi rebuild serves its interface and API. Needs only sh and curl, so it runs
# on the VPS (release.sh, rollback.sh) and on a dev machine (Git Bash).
#
#   sh deploy/fastcheck.sh <base-url> [expected-release]
#   sh deploy/fastcheck.sh http://127.0.0.1:3001 a1b2c3d        # on the server, right after a release
#   sh deploy/fastcheck.sh https://codi.hoangblue.dev            # from anywhere
#
# Checks: health and release tag, the SPA shell and every JS/CSS asset it references, SPA fallback for a client
# route, the public catalogue API, the session API, JSON 404s for unknown API paths, and that no secret file is
# served. Exits 1 when any check fails. Writes nothing and never signs in.
set -u
BASE="${1:?usage: fastcheck.sh <base-url> [expected-release]}"
BASE="${BASE%/}"
EXPECT_RELEASE="${2:-}"
FAILS=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ok() { printf '  ok    %s\n' "$1"; }
bad() { printf '  FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }

# fetch <path> <name>: body -> $TMP/<name>, headers -> $TMP/<name>.h, prints the status code.
fetch() {
  curl -sS -m 15 --compressed -o "$TMP/$2" -D "$TMP/$2.h" -w '%{http_code}' "$BASE$1" 2>/dev/null || echo 000
}
# header <name> <fetch-name>: value of a response header (empty when absent)
header() { grep -i "^$1:" "$TMP/$2.h" | tail -1 | tr -d '\r' | cut -d' ' -f2-; }
ctype() { header content-type "$1"; }

echo "fastcheck $BASE"

code=$(fetch /api/health health)
release=$(sed -n 's/.*"release":"\([^"]*\)".*/\1/p' "$TMP/health")
if [ "$code" = 200 ] && grep -q '"ok":true' "$TMP/health"; then ok "GET /api/health 200 (release ${release:-unknown})"; else bad "GET /api/health -> $code $(head -c 200 "$TMP/health" 2>/dev/null)"; fi
if [ -n "$EXPECT_RELEASE" ]; then
  if [ "$release" = "$EXPECT_RELEASE" ]; then ok "release is $EXPECT_RELEASE"; else bad "release is '${release:-none}', expected '$EXPECT_RELEASE'"; fi
fi

code=$(fetch / home)
if [ "$code" = 200 ] && grep -q '<div id="root">' "$TMP/home"; then ok "GET / serves the app shell"; else bad "GET / -> $code without <div id=\"root\">"; fi
if [ "$(header x-content-type-options home)" = nosniff ] && [ -n "$(header x-frame-options home)" ]; then ok "security headers present"; else bad "security headers missing (X-Content-Type-Options, X-Frame-Options)"; fi

assets=$(grep -oE '(src|href)="/assets/[^"]+"' "$TMP/home" 2>/dev/null | sed -E 's/^(src|href)="//; s/"$//')
if [ -z "$assets" ]; then bad "app shell references no /assets/ files"; fi
n=0
for asset in $assets; do
  n=$((n + 1))
  code=$(fetch "$asset" "asset$n")
  type=$(ctype "asset$n")
  size=$(wc -c < "$TMP/asset$n" | tr -d ' ')
  case "$asset" in
    *.js) want=javascript ;;
    *.css) want=css ;;
    *) want= ;;
  esac
  if [ "$code" = 200 ] && [ "$size" -gt 0 ] && echo "$type" | grep -qi "$want"; then ok "GET $asset 200 ($size bytes)"; else bad "GET $asset -> $code type '$type' size $size"; fi
  encoding=$(header content-encoding "asset$n")
  cache=$(header cache-control "asset$n")
  if [ -n "$encoding" ] && echo "$cache" | grep -q immutable; then ok "  compressed ($encoding), cached ($cache)"; else bad "  $asset not compressed or not cacheable (encoding '${encoding:-none}', cache-control '${cache:-none}')"; fi
done

code=$(fetch /courses spa)
if [ "$code" = 200 ] && grep -q '<div id="root">' "$TMP/spa"; then ok "GET /courses falls back to the app shell"; else bad "GET /courses -> $code"; fi

code=$(fetch '/api/courses?limit=1' catalogue)
if [ "$code" = 200 ] && ctype catalogue | grep -qi json && grep -q '"courses"' "$TMP/catalogue"; then ok "GET /api/courses 200 JSON"; else bad "GET /api/courses -> $code $(ctype catalogue)"; fi

code=$(fetch /api/auth/get-session session)
if [ "$code" = 200 ]; then ok "GET /api/auth/get-session 200"; else bad "GET /api/auth/get-session -> $code"; fi

code=$(fetch /api/fastcheck-missing missing)
if [ "$code" = 404 ] && ctype missing | grep -qi json; then ok "unknown API path answers JSON 404"; else bad "unknown API path -> $code $(ctype missing)"; fi

for secret in /.env /backend/.env /.git/config /rebuild.env; do
  name=$(echo "$secret" | tr -c 'a-z' _)
  fetch "$secret" "$name" >/dev/null
  if grep -qE 'DATABASE_URL|BETTER_AUTH_SECRET|\[core\]|POSTGRES_PASSWORD' "$TMP/$name"; then bad "$secret leaks its contents"; else ok "$secret not served"; fi
done

if [ "$FAILS" -gt 0 ]; then echo "fastcheck: $FAILS check(s) failed"; exit 1; fi
echo "fastcheck: all checks passed"
