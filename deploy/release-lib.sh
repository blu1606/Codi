#!/bin/sh
# Helpers shared by release.sh and rollback.sh. Sourced from /opt/codi-rebuild, never run on its own.

DIR=/opt/codi-rebuild
IMAGE="${IMAGE:-codi-rebuild}"
APP=codi-rebuild-app
DBC=codi-rebuild-db
LOCAL_URL="${LOCAL_URL:-http://127.0.0.1:3001}"

# env_get KEY -> value of KEY in .env (empty when missing)
env_get() { sed -n "s/^$1=//p" "$DIR/.env" | tail -1; }

# env_set KEY VALUE: replaces KEY in .env or appends it.
env_set() {
  if grep -q "^$1=" "$DIR/.env"; then sed -i "s|^$1=.*|$1=$2|" "$DIR/.env"; else echo "$1=$2" >> "$DIR/.env"; fi
}

image_exists() { [ -n "$1" ] && docker image inspect "$IMAGE:$1" >/dev/null 2>&1; }

# Lists the release images, newest first, marking the running and the previous release.
list_images() {
  current=$(env_get RELEASE)
  previous=$(env_get PREVIOUS_RELEASE)
  docker images "$IMAGE" --format '{{.Tag}}\t{{.CreatedSince}}\t{{.Size}}' | while IFS="$(printf '\t')" read -r tag created size; do
    mark=""
    [ "$tag" = "$current" ] && mark=" <- running"
    [ "$tag" = "$previous" ] && mark=" <- previous"
    printf '  %-12s %-16s %s%s\n' "$tag" "$created" "$size" "$mark"
  done
}

# Waits for the container's Docker health check; prints the final status, returns 0 when healthy.
wait_healthy() {
  s=starting
  for _ in $(seq 1 40); do
    s=$(docker inspect -f '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo starting)
    [ "$s" = healthy ] && break
    sleep 3
  done
  echo "app $s"
  [ "$s" = healthy ]
}

# Starts the app on RELEASE=<tag>, waits for health, then runs the fast check against that tag.
switch_to() {
  env_set RELEASE "$1"
  docker compose up -d app 2>&1 | tail -1
  wait_healthy && sh "$DIR/fastcheck.sh" "$LOCAL_URL" "$1"
}

backup_db() {
  mkdir -p "$DIR/backups"
  file="$DIR/backups/codi-$(date +%y%m%d-%H%M%S).dump"
  docker exec "$DBC" pg_dump -U codi -Fc codi > "$file"
  [ -s "$file" ] || { echo "backup failed: $file is empty" >&2; return 1; }
  echo "$file"
}

log_release() { echo "$(date -Iseconds) $*" >> "$DIR/releases.log"; }
