# Deployment

The prototype runs on the VPS `172.93.209.12` (Debian, Docker) at **https://codi.ddnsfree.com**, in place of the
original Codi app. Caddy terminates TLS and proxies the domain to `127.0.0.1:3001`.

## What runs

| Piece | Where |
|---|---|
| Image | [Dockerfile](../Dockerfile): multi-stage; one Node container serves `/api` and the built frontend on port 3001 |
| Stack | `/opt/codi-rebuild/compose.yml` (copy of [deploy/compose.yml](../deploy/compose.yml)): `codi-rebuild-app` + `codi-rebuild-db` (Postgres 16, volume `codi-rebuild_pgdata`) |
| Compose variables | `/opt/codi-rebuild/.env`: `RELEASE` (image tag = git short sha) and `POSTGRES_PASSWORD` |
| App secrets | `/opt/codi-rebuild/rebuild.env` (mode 600): Codi's `/etc/codi/codi.env` without its Supabase `DATABASE_URL`, plus the `GITHUB_PROFILE_*` keys and `DEMO_TOOLS=true` |
| Proxy | `/etc/caddy/Caddyfile`, block `codi.ddnsfree.com` → `127.0.0.1:3001` (unchanged) |

`DEMO_TOOLS=true` keeps the simulated SePay payment (Alt+K) working in production. The app rebuilds request URLs as
https when Caddy sends `X-Forwarded-Proto: https`, so the routes' Origin checks pass.

## Release a new version

From the repo root on a dev machine:

```bash
sha=$(git rev-parse --short HEAD)
docker build -t codi-rebuild:$sha .
docker save codi-rebuild:$sha | gzip -1 > image.tar.gz
scp image.tar.gz root@172.93.209.12:/opt/codi-rebuild/
```

On the server:

```bash
cd /opt/codi-rebuild
gunzip -c image.tar.gz | docker load && rm image.tar.gz
sed -i "s/^RELEASE=.*/RELEASE=<sha>/" .env
docker compose up -d app            # migrations are not automatic, see below
curl -s https://codi.ddnsfree.com/api/health
```

Schema changes: `docker compose run --rm --no-deps app npx tsx scripts/migrate.ts`.

## Reset the demo data

Codi's seed refuses `NODE_ENV=production`, so the one-off run overrides it. Back up first:

```bash
cd /opt/codi-rebuild
docker exec codi-rebuild-db pg_dump -U codi -Fc codi > backup-$(date +%y%m%d-%H%M).dump
docker compose run --rm --no-deps -e NODE_ENV=development app npx tsx scripts/seed.ts --no-backup
```

## Logs and rollback

- Logs: `docker logs -f codi-rebuild-app`.
- Back to the original Codi: the old stack is stopped but kept (`/etc/codi/compose.yml`, `/etc/codi/codi.env`,
  images `codi-web:*`, `/opt/codi/current` → release). Run
  `cd /opt/codi-rebuild && docker compose stop app`, then
  `cd /etc/codi && CODI_RELEASE=$(basename "$(readlink /opt/codi/current)") docker compose --profile ai-worker up -d`.

## Known gaps

- Google sign-in on the domain fails with `redirect_uri_mismatch` until
  `https://codi.ddnsfree.com/api/auth/callback/google` is added to the Google OAuth client (it only lists
  `http://localhost:3001`). GitHub sign-in works.
- Uploads go to Codi's real R2 buckets and emails are sent through Codi's Resend account.
