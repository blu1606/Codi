#!/bin/sh
# Runs at 08:00 (VPS time, Asia/Ho_Chi_Minh) from /etc/cron.d/codi-digest: posts yesterday's sales, sign-ups, failed AI
# jobs and the orders waiting for reconciliation to the team's Discord channel (DISCORD_WEBHOOK_URL in
# /opt/monitoring/.env). Read-only against the production database.
#   sh /opt/codi-rebuild/daily-digest.sh
set -eu
. /opt/codi-rebuild/release-lib.sh

# "Yesterday" is the previous calendar day in Vietnam. user.created_at has no time zone and holds UTC.
row=$(docker exec "$DBC" psql -U codi -d codi -AtF '|' -c "
with d as (
  select (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') - interval '1 day') at time zone 'Asia/Ho_Chi_Minh' as since,
         date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh' as until
)
select
  to_char(d.since at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'),
  (select count(*) from orders o where o.status = 'paid' and o.paid_at >= d.since and o.paid_at < d.until),
  (select coalesce(sum(o.total_amount), 0) from orders o where o.status = 'paid' and o.paid_at >= d.since and o.paid_at < d.until),
  (select count(*) from \"user\" u where (u.created_at at time zone 'UTC') >= d.since and (u.created_at at time zone 'UTC') < d.until),
  (select count(*) from ai_jobs j where j.status = 'failed' and j.updated_at >= d.since and j.updated_at < d.until),
  (select count(*) from orders o where o.needs_reconciliation),
  (select count(*) from orders o where o.status = 'pending' and o.created_at < now() - interval '24 hours')
from d")

IFS='|' read -r day paid revenue signups ai_failed reconcile stale <<EOF
$row
EOF
revenue=$(printf '%s' "$revenue" | sed ':a;s/\B[0-9]\{3\}\>/.&/;ta')

text=":bar_chart: **Codi · ngày $day**\\n"
text="$text:moneybag: $paid đơn đã thanh toán · $revenue ₫\\n"
text="$text:bust_in_silhouette: $signups người dùng mới\\n"
text="$text:robot: $ai_failed job AI lỗi"
if [ "$reconcile" -gt 0 ] || [ "$stale" -gt 0 ]; then
  text="$text\\n:warning: $reconcile đơn cần đối soát · $stale đơn chờ thanh toán quá 24 giờ"
fi

# notify_discord escapes quotes and backslashes; the \n above must reach Discord as JSON newlines, so post directly.
url=$(sed -n 's/^DISCORD_WEBHOOK_URL=//p' /opt/monitoring/.env | tail -1)
[ -n "$url" ] || { echo "DISCORD_WEBHOOK_URL is not set in /opt/monitoring/.env" >&2; exit 1; }
curl -sS -m 10 -H "Content-Type: application/json" -d "{\"content\":\"$text\",\"allowed_mentions\":{\"parse\":[]}}" "$url" >/dev/null
echo "$(date -Iseconds) digest for $day posted"
