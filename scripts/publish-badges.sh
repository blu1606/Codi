#!/usr/bin/env bash
# Publishes every file under <dir> to the `badges` branch of this repository, keeping relative paths.
# The branch is an orphan that holds only badge JSON, so it never touches develop or main.
#
# Requires GITHUB_REPOSITORY and GITHUB_TOKEN (the caller grants `contents: write` on that job only).
set -euo pipefail

src="${1:?usage: publish-badges.sh <dir>}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"

remote="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if git ls-remote --exit-code --heads "$remote" badges >/dev/null 2>&1; then
  git clone --quiet --depth 1 --branch badges "$remote" "$work/badges"
else
  git init --quiet "$work/badges"
  git -C "$work/badges" checkout --quiet --orphan badges
  git -C "$work/badges" remote add origin "$remote"
fi

(cd "$src" && find . -type f -name '*.json' -print0) | while IFS= read -r -d '' file; do
  mkdir -p "$work/badges/$(dirname "$file")"
  cp "$src/$file" "$work/badges/$file"
done

git -C "$work/badges" add -A
if git -C "$work/badges" diff --cached --quiet; then
  echo "badge files unchanged; nothing to publish"
  exit 0
fi

git -C "$work/badges" -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
  commit --quiet -m "chore(badges): update CI badge data"
git -C "$work/badges" push --quiet origin HEAD:badges
echo "published badge files to the badges branch"
