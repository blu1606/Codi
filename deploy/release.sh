#!/bin/sh
# Runs on the server: load the uploaded image, check the release it replaces, back up, migrate, roll the app, fast
# check it, and roll back automatically when the new release is unhealthy or fails the check.
#   sh release.sh <tag>
set -eu
TAG="${1:?usage: sh release.sh <tag>}"
cd /opt/codi-rebuild
. ./release-lib.sh

if [ -f image.tar.gz ]; then gunzip -c image.tar.gz | docker load && rm image.tar.gz; fi
image_exists "$TAG" || { echo "image $IMAGE:$TAG not found; upload it first (docs/deployment.md)"; exit 1; }

# The release being replaced is the rollback target: make sure its image is still here before touching anything.
CURRENT=$(env_get RELEASE)
# Restored when this release rolls back, so a later rollback.sh never targets the failed tag.
OLD_PREVIOUS=$(env_get PREVIOUS_RELEASE)
PREV=""
if [ -n "$CURRENT" ] && [ "$CURRENT" != "$TAG" ]; then
  if image_exists "$CURRENT"; then
    PREV="$CURRENT"
    echo "rollback target: $PREV (image present)"
  else
    echo "WARNING: the running release $CURRENT has no image left; this release cannot roll back automatically."
  fi
elif [ "$CURRENT" = "$TAG" ]; then
  PREV=$(env_get PREVIOUS_RELEASE)
  echo "re-deploying $TAG; rollback target stays ${PREV:-none}"
fi

BACKUP=$(backup_db)
echo "backup: $BACKUP"

# Production settings every release enforces in rebuild.env: the AI job budget, and no demo tools (the payment
# simulator would let any buyer mark their own orders paid).
for setting in AI_DAILY_JOB_LIMIT=50 DEMO_TOOLS=false; do
  key=${setting%%=*}
  if grep -q "^$key=" rebuild.env; then sed -i "s/^$key=.*/$setting/" rebuild.env; else echo "$setting" >> rebuild.env; fi
done

[ -n "$PREV" ] && env_set PREVIOUS_RELEASE "$PREV"
env_set RELEASE "$TAG"
docker compose run --rm --no-deps app npx tsx scripts/migrate.ts 2>&1 | grep -v "npm notice" | tail -2

if switch_to "$TAG"; then
  log_release "deployed=$TAG previous=${PREV:-none} backup=$BACKUP result=ok"
  docker logs "$APP" 2>&1 | grep -iE "Codi API on|worker" | tail -3
  docker exec "$APP" printenv AI_BACKGROUND_WORKER_ENABLED AI_DAILY_JOB_LIMIT DEMO_TOOLS
  # Keep the three newest release images plus the running and previous ones; older images only fill the disk.
  docker images "$IMAGE" --format '{{.Tag}}' | tail -n +4 | while read -r old; do
    [ "$old" = "$TAG" ] || [ "$old" = "$PREV" ] || docker rmi "$IMAGE:$old" >/dev/null 2>&1 || true
  done
  echo "release images:"
  list_images
  exit 0
fi

echo "release $TAG failed its health or fast check"
docker logs --tail 40 "$APP" 2>&1 || true
if [ -z "$PREV" ]; then
  log_release "deployed=$TAG previous=none backup=$BACKUP result=failed-no-rollback"
  echo "no previous image to roll back to; fix forward or restore by hand (docs/deployment.md)"
  exit 1
fi
echo "rolling back to $PREV"
env_set PREVIOUS_RELEASE "$OLD_PREVIOUS"
if switch_to "$PREV"; then
  log_release "deployed=$TAG previous=$PREV backup=$BACKUP result=rolled-back"
  echo "rolled back to $PREV. Migrations of $TAG stay applied; if $PREV misbehaves on the new schema, run"
  echo "  sh rollback.sh $PREV --restore-db $BACKUP"
else
  log_release "deployed=$TAG previous=$PREV backup=$BACKUP result=rollback-failed"
  echo "rollback to $PREV is unhealthy too; restore the database: sh rollback.sh $PREV --restore-db $BACKUP"
fi
exit 1
