#!/usr/bin/env bash
# Install as /usr/local/sbin/codi-deploy, owned and writable only by root.
set -Eeuo pipefail
umask 027
[[ $# == 2 && "$1" =~ ^[0-9a-f]{40}$ && "$2" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo 'Invalid revision' >&2; exit 2; }
revision=$1
digest=$2
base=/opt/codi
repo=$base/repository.git
release=$base/releases/$revision
exec 9>/run/lock/codi-deploy.lock
flock -n 9 || { echo 'A Codi deploy is already running' >&2; exit 1; }
command -v docker >/dev/null
command -v docker-compose >/dev/null
test -r /etc/codi/codi.env
test -r /etc/codi/compose.yml
install -d -o root -g root -m 0755 "$base/releases"
if [[ ! -d "$repo" ]]; then
  git init --bare "$repo" >/dev/null
  git --git-dir="$repo" remote add origin https://github.com/blu1606/Codi.git
fi
[[ "$(git --git-dir="$repo" remote get-url origin)" == https://github.com/blu1606/Codi.git ]]
git --git-dir="$repo" fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
[[ "$(git --git-dir="$repo" rev-parse refs/remotes/origin/main)" == "$revision" ]] || { echo 'Commit is not the current main HEAD' >&2; exit 1; }
if [[ -e "$release" ]]; then
  if [[ "$(readlink "$base/current" 2>/dev/null || true)" == "releases/$revision" ]]; then
    echo 'This revision is already deployed'; exit 0
  fi
  echo 'Release already exists; investigate before retrying' >&2; exit 1
fi
stage=$(mktemp -d "$base/releases/.build-XXXXXXXX")
cleanup() { if [[ -n "$stage" ]]; then rm -rf -- "$stage"; fi; }
trap cleanup EXIT
git --git-dir="$repo" archive "$revision" | tar -x -C "$stage"
test -f "$stage/Dockerfile"
# GitHub Actions sends a short-lived registry token over the restricted SSH connection.
IFS= read -r registry_user
IFS= read -r registry_token
[[ "$registry_user" =~ ^[a-zA-Z0-9-]+$ && -n "$registry_token" ]] || { echo 'Invalid registry credentials' >&2; exit 1; }
registry_config=$(mktemp -d /run/codi-registry.XXXXXXXX)
chmod 0700 "$registry_config"
export DOCKER_CONFIG="$registry_config"
cleanup() { if [[ -n "$stage" ]]; then rm -rf -- "$stage"; fi; rm -rf -- "$registry_config"; }
printf '%s' "$registry_token" | docker login ghcr.io --username "$registry_user" --password-stdin >/dev/null
unset registry_token
docker pull "ghcr.io/blu1606/codi@$digest"
docker tag "ghcr.io/blu1606/codi@$digest" "codi-web:$revision"
rm -rf -- "$registry_config"
unset DOCKER_CONFIG

chmod 0755 "$stage"
mv "$stage" "$release"
stage=''
previous=''
if [[ -L "$base/current" ]]; then
  previous=$(readlink "$base/current")
  [[ "$previous" =~ ^releases/[0-9a-f]{40}$ ]] || { echo "Invalid current release link" >&2; exit 1; }
  previous=${previous#releases/}
  [[ "$previous" =~ ^[0-9a-f]{40}$ && -d "$base/releases/$previous" ]] || { echo 'Invalid current release' >&2; exit 1; }
fi
rollback() {
  echo 'Deployment failed; restoring previous Codi release if available' >&2
  CODI_RELEASE="$revision" docker-compose -p codi -f /etc/codi/compose.yml down || true
  if [[ -n "$previous" ]]; then
    CODI_RELEASE="$previous" docker-compose -p codi -f /etc/codi/compose.yml up -d --no-build || true
  fi
}
trap rollback ERR
CODI_RELEASE="$revision" docker-compose -p codi -f /etc/codi/compose.yml up -d --no-build
healthy=false
for attempt in {1..30}; do
  if curl --silent --show-error --fail --max-time 3 http://127.0.0.1:3001/ >/dev/null; then healthy=true; break; fi
  sleep 2
done
[[ "$healthy" == true ]] || { echo 'Codi health check failed' >&2; false; }
ln -s "releases/$revision" "$base/.current-$revision"
mv -Tf "$base/.current-$revision" "$base/current"
trap - ERR
printf 'Deployed Codi revision %s\n' "$revision"
