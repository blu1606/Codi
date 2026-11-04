#!/bin/sh
# Records the server side of a load test: CPU and memory of the app and database containers, plus open database
# connections, once per sample, as CSV on stdout. Run it on the server for the length of the k6 run:
#   ssh <server> 'sh -s 1500' < perf/collect-server-stats.sh > perf/k6/results/server-stats.csv
# Columns: epoch seconds, container, CPU % (100 = one core), memory MiB, database connections.
SECONDS_TO_RUN="${1:-900}"
DB="${DB_CONTAINER:-codi-rebuild-db}"
END=$(( $(date +%s) + SECONDS_TO_RUN ))
echo "epoch,container,cpu_pct,mem_mib,db_connections"
while [ "$(date +%s)" -lt "$END" ]; do
  NOW=$(date +%s)
  CONN=$(docker exec "$DB" psql -U codi -d codi -tAc "select count(*) from pg_stat_activity where datname = 'codi'" 2>/dev/null || echo "")
  docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}}' |
    awk -F, -v now="$NOW" -v conn="$CONN" '{
      cpu = $2; sub(/%/, "", cpu)
      split($3, m, " ")
      mem = m[1]
      if (mem ~ /GiB$/) { sub(/GiB$/, "", mem); mem = mem * 1024 } else { sub(/MiB$/, "", mem) }
      print now "," $1 "," cpu "," mem "," conn
    }'
done
