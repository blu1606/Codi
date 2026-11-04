#!/bin/sh
# Runs nightly on the server from /etc/cron.d/codi-backup: dumps the production database, copies the dump to a
# private R2 bucket (the app's assignment bucket, under db-backups/; never the avatar bucket, which /api/avatar serves
# to anyone), keeps 30 days there and 7 days on the VPS. Posts to Discord when any step fails.
# Secrets come from /opt/monitoring/.env (R2_BACKUP_BUCKET, R2_BACKUP_PREFIX, RCLONE_CONFIG_R2_*, DISCORD_WEBHOOK_URL).
#   sh /opt/codi-rebuild/backup-offsite.sh
set -eu
DIR=/opt/codi-rebuild
set -a; . /opt/monitoring/.env; set +a

notify_failure() {
  [ -n "${DISCORD_WEBHOOK_URL:-}" ] || return 0
  curl -sS -m 10 -H "Content-Type: application/json" \
    -d "{\"content\":\":red_circle: Codi nightly backup failed on $(hostname) at $(date -Iseconds). Check /var/log/codi-backup.log\"}" \
    "$DISCORD_WEBHOOK_URL" >/dev/null || true
}
trap '[ $? -eq 0 ] || notify_failure' EXIT

remote="r2:$R2_BACKUP_BUCKET/${R2_BACKUP_PREFIX:-db-backups/postgres}"
name="nightly-$(date +%y%m%d-%H%M).dump"
file="$DIR/backups/$name"
mkdir -p "$DIR/backups"
docker exec codi-rebuild-db pg_dump -U codi -Fc codi > "$file"
[ -s "$file" ] || { echo "dump $file is empty" >&2; exit 1; }

# Credentials go in by name (-e VAR without a value), so they never appear on a command line.
docker run --rm -v "$DIR/backups:/data:ro" \
  -e RCLONE_CONFIG_R2_TYPE -e RCLONE_CONFIG_R2_PROVIDER -e RCLONE_CONFIG_R2_ENDPOINT \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET \
  rclone/rclone:1.68.2 copyto "/data/$name" "$remote/$name"

# Keep 30 days off-site and 7 days on the VPS.
docker run --rm \
  -e RCLONE_CONFIG_R2_TYPE -e RCLONE_CONFIG_R2_PROVIDER -e RCLONE_CONFIG_R2_ENDPOINT \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET \
  rclone/rclone:1.68.2 delete --min-age 30d "$remote"
find "$DIR/backups" -name 'nightly-*.dump' -mtime +7 -delete
echo "$(date -Iseconds) $name $(du -h "$file" | cut -f1) uploaded to $remote/"
