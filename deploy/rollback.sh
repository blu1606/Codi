#!/bin/sh
# Runs on the server: switch the app back to an older image, optionally restoring a database backup.
#   sh rollback.sh --list                          release images, backups and the release log
#   sh rollback.sh                                 back to PREVIOUS_RELEASE (the release before the running one)
#   sh rollback.sh <tag>                           back to a specific image tag
#   sh rollback.sh <tag> --restore-db <dump>       also restore that backup (the current data is backed up first)
set -eu
cd /opt/codi-rebuild
. ./release-lib.sh

if [ "${1:-}" = "--list" ]; then
  echo "release images:"; list_images
  echo "backups (newest 5):"; ls -1t backups/*.dump 2>/dev/null | head -5 | sed 's/^/  /'
  echo "releases.log (last 5):"; tail -5 releases.log 2>/dev/null | sed 's/^/  /'
  exit 0
fi

CURRENT=$(env_get RELEASE)
TARGET="${1:-$(env_get PREVIOUS_RELEASE)}"
DUMP=""
if [ "${2:-}" = "--restore-db" ]; then DUMP="${3:?--restore-db needs a dump file}"; fi

[ -n "$TARGET" ] || { echo "no PREVIOUS_RELEASE recorded; pass a tag (sh rollback.sh --list)"; exit 1; }
if ! image_exists "$TARGET"; then
  echo "image $IMAGE:$TARGET not found. Available:"; list_images; exit 1
fi
if [ -n "$DUMP" ] && [ ! -s "$DUMP" ]; then echo "backup $DUMP not found or empty"; exit 1; fi
echo "rollback: $CURRENT -> $TARGET${DUMP:+ with database $DUMP}"

if [ -n "$DUMP" ]; then
  SAFETY=$(backup_db)
  echo "current data backed up to $SAFETY"
  docker compose stop app
  # Start from empty schemas: tables added by newer migrations would otherwise survive the restore, and the
  # restored migration journal would then re-run those migrations against them.
  docker exec -e PGOPTIONS=--client-min-messages=warning "$DBC" psql -U codi -d codi -v ON_ERROR_STOP=1 -qc \
    'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
  docker exec -i "$DBC" pg_restore -U codi -d codi --no-owner --exit-on-error < "$DUMP"
  echo "database restored from $DUMP"
fi

# Swap, so running rollback.sh again returns to the release just left.
[ -n "$CURRENT" ] && [ "$CURRENT" != "$TARGET" ] && env_set PREVIOUS_RELEASE "$CURRENT"
if switch_to "$TARGET"; then
  log_release "rollback=$TARGET from=${CURRENT:-none} db=${DUMP:-unchanged} result=ok"
  echo "running $TARGET; previous release is $(env_get PREVIOUS_RELEASE)"
else
  log_release "rollback=$TARGET from=${CURRENT:-none} db=${DUMP:-unchanged} result=failed"
  docker logs --tail 40 "$APP" 2>&1 || true
  echo "rollback to $TARGET failed its health or fast check"
  exit 1
fi
