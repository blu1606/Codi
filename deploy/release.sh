#!/bin/sh
# Runs on the server: load the uploaded image, back up, migrate, roll the app. Usage: sh release.sh <tag>
set -e
TAG="$1"
cd /opt/codi-rebuild
if [ -f image.tar.gz ]; then gunzip -c image.tar.gz | docker load && rm image.tar.gz; fi
mkdir -p backups
docker exec codi-rebuild-db pg_dump -U codi -Fc codi > "backups/codi-$(date +%y%m%d-%H%M).dump"
ls -la backups | tail -1
if grep -q "^AI_DAILY_JOB_LIMIT=" rebuild.env; then
  sed -i "s/^AI_DAILY_JOB_LIMIT=.*/AI_DAILY_JOB_LIMIT=50/" rebuild.env
else
  echo "AI_DAILY_JOB_LIMIT=50" >> rebuild.env
fi
sed -i "s/^RELEASE=.*/RELEASE=$TAG/" .env
docker compose run --rm --no-deps app npx tsx scripts/migrate.ts 2>&1 | grep -v "npm notice" | tail -2
docker compose up -d app 2>&1 | tail -1
s=starting
for i in $(seq 1 40); do
  s=$(docker inspect -f "{{.State.Health.Status}}" codi-rebuild-app)
  [ "$s" = healthy ] && break
  sleep 3
done
echo "app $s"
docker logs codi-rebuild-app 2>&1 | grep -iE "Codi API on|worker" | tail -3
docker exec codi-rebuild-app printenv AI_BACKGROUND_WORKER_ENABLED AI_DAILY_JOB_LIMIT
