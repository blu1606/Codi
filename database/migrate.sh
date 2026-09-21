#!/usr/bin/env bash
#
# Migration runner for Codi.
#
# Applies database/migrations/*.sql in filename order, records each one in
# schema_migrations, and is safe to run repeatedly: a second run applies
# nothing and exits 0.
#
#   ./database/migrate.sh            apply pending migrations
#   ./database/migrate.sh --seed     also apply database/seed.sql
#   ./database/migrate.sh --reset    drop and recreate the database first
#
# Requires bash, not POSIX sh: `pipefail` and `-E` are bash extensions and
# silently do nothing (or abort) under dash.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL="postgresql://postgres:postgres@localhost:${POSTGRES_HOST_PORT:-5433}/codi"
fi

# Every psql call aborts on the first error. Without ON_ERROR_STOP psql keeps
# going after a failed statement and still exits 0, so a broken migration
# would be recorded as applied — the exact failure this runner exists to stop.
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)

db_name() { basename "${DATABASE_URL%%\?*}"; }

# Connect to the maintenance database: you cannot drop the database you are
# currently connected to.
maintenance_url() { echo "${DATABASE_URL%/*}/postgres"; }

reset_database() {
  if [ "${NODE_ENV:-development}" = "production" ]; then
    echo "refusing to --reset with NODE_ENV=production" >&2
    exit 1
  fi
  local name admin
  name="$(db_name)"
  admin="$(maintenance_url)"
  echo "dropping and recreating database '${name}'"
  psql "$admin" -v ON_ERROR_STOP=1 --quiet --no-psqlrc \
    -c "DROP DATABASE IF EXISTS \"${name}\" WITH (FORCE);"
  psql "$admin" -v ON_ERROR_STOP=1 --quiet --no-psqlrc \
    -c "CREATE DATABASE \"${name}\";"
}

ensure_migrations_table() {
  "${PSQL[@]}" -c "
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );"
}

already_applied() {
  local found
  # -v binds the value as a literal, so a filename never reaches SQL as code.
  found="$("${PSQL[@]}" --tuples-only --no-align \
    -v fname="$1" \
    -c "SELECT 1 FROM schema_migrations WHERE filename = :'fname';")"
  [ -n "$found" ]
}

apply_migrations() {
  ensure_migrations_table

  local dir="${SCRIPT_DIR}/migrations"
  if [ ! -d "$dir" ]; then
    echo "no migrations directory at ${dir}"
    return 0
  fi

  local applied=0 file name
  # Sorted so numbered migrations apply in order regardless of locale.
  while IFS= read -r file; do
    name="$(basename "$file")"

    if already_applied "$name"; then
      echo "  skip    ${name}"
      continue
    fi

    echo "  apply   ${name}"
    # Single transaction per migration: the file and its bookkeeping row
    # commit together, so a failure leaves nothing half-applied.
    "${PSQL[@]}" --single-transaction \
      -v fname="$name" \
      -f "$file" \
      -c "INSERT INTO schema_migrations (filename) VALUES (:'fname');"
    applied=$((applied + 1))
  done < <(find "$dir" -maxdepth 1 -name '*.sql' -type f | sort)

  if [ "$applied" -eq 0 ]; then
    echo "nothing to apply"
  else
    echo "applied ${applied} migration(s)"
  fi
}

apply_seed() {
  local seed="${SCRIPT_DIR}/seed.sql"
  if [ ! -f "$seed" ]; then
    echo "no seed file at ${seed}"
    return 0
  fi
  echo "  seed    $(basename "$seed")"
  "${PSQL[@]}" --single-transaction -f "$seed"
}

main() {
  local do_seed=0 do_reset=0

  for arg in "$@"; do
    case "$arg" in
      --seed)  do_seed=1 ;;
      --reset) do_reset=1 ;;
      -h|--help)
        sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'
        exit 0
        ;;
      *)
        echo "unknown argument: ${arg}" >&2
        exit 1
        ;;
    esac
  done

  # `if` rather than `[ x ] && cmd`: under set -e a false test as the final
  # command of an and-or list makes the script exit non-zero.
  if [ "$do_reset" -eq 1 ]; then reset_database; fi
  apply_migrations
  if [ "$do_seed" -eq 1 ]; then apply_seed; fi
}

main "$@"
