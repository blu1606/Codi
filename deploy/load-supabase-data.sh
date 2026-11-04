#!/bin/sh
# Replace a rebuild database's public data with a Supabase data dump from Codi, in one transaction.
#
# Make the dump from the Codi repo (read-only on Supabase; the CLI creates a temporary login role):
#   supabase db dump --linked --data-only --use-copy -s public -f data.sql
#
# Usage: sh load-supabase-data.sh <data.sql> [container] [db-user] [db-name]
#
# - Backs up the target first (next to data.sql).
# - Supabase allows NULL in a few columns the rebuild marks NOT NULL with a default: those are relaxed
#   during the load, NULLs get the column default, and NOT NULL is restored.
# - Sessions are dropped, so everyone signs in again.
# - The seeded demo accounts (usr-*) keep the rebuild's demo password: their hashes come from the backup.
set -e
DATA="$1"; C=${2:-codi-rebuild-postgres}; U=${3:-codi}; D=${4:-codi}
[ -f "$DATA" ] || { echo "usage: $0 <data.sql> [container] [db-user] [db-name]"; exit 1; }
q() { docker exec $C psql -U $U -d $D -Atc "$1"; }

backup="$(dirname "$DATA")/$D-before-supabase-$(date +%y%m%d-%H%M).dump"
docker exec $C pg_dump -U $U -Fc $D > "$backup"
echo "backup: $backup"
demo_pw=$(q "copy (select user_id, password from account where user_id like 'usr-%' and provider_id='credential') to stdout")

tables=$(q "select string_agg(format('public.%I', table_name), ', ') from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")
cols="from information_schema.columns where table_schema='public' and is_nullable='NO' and column_default is not null
  and (table_name, column_name) not in (select k.table_name, k.column_name from information_schema.key_column_usage k
  join information_schema.table_constraints t using (constraint_schema, constraint_name)
  where t.constraint_type='PRIMARY KEY' and k.table_schema='public')"
relax=$(q "select string_agg(format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL;', table_name, column_name), ' ') $cols")
restore=$(q "select string_agg(format('UPDATE public.%I SET %I = %s WHERE %I IS NULL; ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL;', table_name, column_name, column_default, column_name, table_name, column_name), ' ') $cols")

{
  echo "BEGIN;"
  echo "TRUNCATE $tables CASCADE;"
  echo "$relax"
  grep -v '^SET transaction_timeout' "$DATA"
  echo "$restore"
  echo "TRUNCATE public.session;"
  echo "CREATE TEMP TABLE demo_pw (user_id text, password text); COPY demo_pw FROM stdin;"
  [ -n "$demo_pw" ] && echo "$demo_pw"
  echo '\.'
  echo "UPDATE account a SET password = d.password FROM demo_pw d WHERE a.user_id = d.user_id AND a.provider_id = 'credential';"
  echo "COMMIT;"
} | docker exec -i $C psql -U $U -d $D -v ON_ERROR_STOP=1 -q -o /dev/null
q "select (select count(*) from public.\"user\") || ' users, ' || (select count(*) from courses) || ' courses loaded'"
