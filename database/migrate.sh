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
# Requires bash, not POSIX sh: `pipefail` and `-E` are bash extensions that
# dash does not support.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL="postgresql://postgres:postgres@localhost:${POSTGRES_HOST_PORT:-5433}/codi"
fi

# ON_ERROR_STOP on every call. Without it psql continues past a failed
# statement and still exits 0, so a broken migration would be recorded as
# applied — the exact failure this runner exists to prevent.
#
# Options come before -d because psql stops parsing options at the first
# positional argument.
PSQL=(psql -v ON_ERROR_STOP=1 --quiet --no-psqlrc -d "$DATABASE_URL")

db_name() { basename "${DATABASE_URL%%\?*}"; }
maintenance_url() { echo "${DATABASE_URL%/*}/postgres"; }

reset_database() {
  if [ "${NODE_ENV:-development}" = "production" ]; then
    echo "refusing to --reset with NODE_ENV=production" >&2
    exit 1
  fi
  local name admin
  name="$(db_name)"
  # You cannot drop the database you are connected to, so this goes through
  # the maintenance database.
  admin="$(maintenance_url)"
  echo "dropping and recreating database '${name}'"
  psql -v ON_ERROR_STOP=1 --quiet --no-psqlrc -d "$admin" \
    -c "DROP DATABASE IF EXISTS \"${name}\" WITH (FORCE);"
  psql -v ON_ERROR_STOP=1 --quiet --no-psqlrc -d "$admin" \
    -c "CREATE DATABASE \"${name}\";"
}

ensure_migrations_table() {
  "${PSQL[@]}" -c "
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );"
}

# psql performs :'var' interpolation only while lexing script input, so these
# queries are fed through stdin. Binding the filename as a variable keeps it
# out of the SQL text entirely.
already_applied() {
  local found
  found="$(printf "%s" "SELECT 1 FROM schema_migrations WHERE filename = :'fname';" \
    | "${PSQL[@]}" --tuples-only --no-align -v fname="$1" -f - )"
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
  while IFS= read -r file; do
    name="$(basename "$file")"

    if already_applied "$name"; then
      echo "  skip    ${name}"
      continue
    fi

    echo "  apply   ${name}"
    # One transaction per migration: the file and its bookkeeping row commit
    # together, so a failure leaves nothing half-applied and nothing recorded.
    {
      cat "$file"
      printf "\nINSERT INTO schema_migrations (filename) VALUES (:'fname');\n"
    } | "${PSQL[@]}" --single-transaction -v fname="$name" -f -
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
  # command of an and-or list would make the script exit non-zero.
  if [ "$do_reset" -eq 1 ]; then reset_database; fi
  apply_migrations
  if [ "$do_seed" -eq 1 ]; then apply_seed; fi
}

main "$@"
