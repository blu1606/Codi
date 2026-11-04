# Deployment

The prototype runs on the VPS `172.93.209.12` (Debian, Docker) at **https://codi.hoangblue.dev** (DNS: A record `codi` → `172.93.209.12` at Name.com; the old `codi.ddnsfree.com` redirects there), in place of the
original Codi app. Caddy terminates TLS and proxies the domain to `127.0.0.1:3001`.

## What runs

| Piece | Where |
|---|---|
| Image | [Dockerfile](../Dockerfile): multi-stage; one Node container serves `/api` and the built frontend on port 3001 |
| Stack | `/opt/codi-rebuild/compose.yml` (copy of [deploy/compose.yml](../deploy/compose.yml)): `codi-rebuild-app` + `codi-rebuild-db` (Postgres 16, volume `codi-rebuild_pgdata`) |
| Compose variables | `/opt/codi-rebuild/.env`: `RELEASE` (image tag = git short sha) and `POSTGRES_PASSWORD` |
| App secrets | `/opt/codi-rebuild/rebuild.env` (mode 600): Codi's `/etc/codi/codi.env` without its Supabase `DATABASE_URL`, plus the `GITHUB_PROFILE_*` keys and `DEMO_TOOLS=false` |
| Proxy | `/etc/caddy/Caddyfile`, block `codi.hoangblue.dev` → `127.0.0.1:3001`; `codi.ddnsfree.com` answers with a 301 to it |

The AI background worker (GitHub profile analysis, knowledge-map extraction, AI quiz generation, learning paths) runs
inside `codi-rebuild-app`; there is no separate worker container (Codi's own stack used `--profile ai-worker`). The
image sets `AI_BACKGROUND_WORKER_ENABLED=true` and the compose file pins it over `rebuild.env`; to turn it off, put
`AI_BACKGROUND_WORKER_ENABLED=false` in `/opt/codi-rebuild/.env` and `docker compose up -d app`. The startup log shows
`AI background worker started`.

Production runs `DEMO_TOOLS=false`, so it behaves like a real shop: `POST /api/dev/simulate-payment` answers 404, and
the frontend (which reads `demoTools` from `GET /api/config` at boot) hides the Alt+K scenario drawer and the
demo-account card, and checkout never simulates a transfer. Checkout shows SePay's VietQR image
(`https://qr.sepay.vn/img`) built from `SEPAY_BANK_CODE` / `SEPAY_ACCOUNT_NUMBER`, and an order is paid only when
SePay calls the webhook: in the SePay dashboard the webhook URL must be
`https://codi.hoangblue.dev/api/payments/sepay/callback`, authenticated with `SEPAY_WEBHOOK_SECRET` (API key).
Demo tools are always on outside production; `DEMO_TOOLS=true` turns them back on in production with the same image.
The app rebuilds request URLs as https when Caddy sends `X-Forwarded-Proto: https`, so the routes' Origin checks pass.

## Release a new version

From the repo root on a dev machine:

```bash
sha=$(git rev-parse --short HEAD)
docker build -t codi-rebuild:$sha .
docker save codi-rebuild:$sha | gzip -1 > image.tar.gz
scp image.tar.gz root@172.93.209.12:/opt/codi-rebuild/
```

Copy the deploy scripts to the server as well (they change rarely, but always together):

```bash
scp deploy/compose.yml deploy/release.sh deploy/rollback.sh deploy/release-lib.sh deploy/fastcheck.sh \
  root@172.93.209.12:/opt/codi-rebuild/
```

Then on the server run `sh /opt/codi-rebuild/release.sh <sha>`. It:

1. loads the image and refuses to continue when `codi-rebuild:<sha>` is missing;
2. checks the release it replaces (`RELEASE` in `.env`): when that image is still on disk it becomes the rollback
   target and is recorded as `PREVIOUS_RELEASE`; otherwise it warns that this release cannot roll back automatically;
3. backs up the database to `/opt/codi-rebuild/backups/`, keeps `AI_DAILY_JOB_LIMIT=50` in `rebuild.env` and applies
   migrations;
4. starts the new image, waits for the Docker health check, then runs [deploy/fastcheck.sh](../deploy/fastcheck.sh)
   against `http://127.0.0.1:3001` expecting `/api/health` to report the new `release`;
5. on success, appends to `releases.log` and deletes release images older than the three newest (never the running or
   previous one); on failure, **switches back to the previous image automatically** and prints the
   `rollback.sh … --restore-db` command for the backup it just took (migrations of the failed release stay applied).

Then check from your machine: `npm run fastcheck -- https://codi.hoangblue.dev <sha>` (curl-level) and
`E2E_BASE_URL=https://codi.hoangblue.dev npm run fastcheck:ui` (real browser, desktop and mobile). Both are read-only.

Schema changes: back up (below), then `docker compose run --rm --no-deps app npx tsx scripts/migrate.ts` before
`docker compose up -d app`. Migrations are tracked by folder name, so a migration that sorts before one already
applied (as Codi develop's `20261027101706_ai_chats` and `20261031033253_free_toad` do before
`20261102155311_publication_review_anchors`) still runs.

## Reset the demo data

Codi's seed refuses `NODE_ENV=production`, so the one-off run overrides it. Back up first:

```bash
cd /opt/codi-rebuild
docker exec codi-rebuild-db pg_dump -U codi -Fc codi > backup-$(date +%y%m%d-%H%M).dump
docker compose run --rm --no-deps -e NODE_ENV=development app npx tsx scripts/seed.ts --no-backup
```

## Load Codi's real data from Supabase

Codi's Supabase project (`codi`, linked in the Codi repo's `supabase/.temp`) has the same 60 tables as the rebuild;
the rebuild only adds `publication_review_flags.target_item_id` and `course_publication_requests.reviewed_content`.
From the Codi repo (read-only on Supabase; the CLI makes a temporary login role, no DB password needed):

```bash
supabase db dump --linked --data-only --use-copy -s public -f data.sql
```

Then load it with [deploy/load-supabase-data.sh](../deploy/load-supabase-data.sh)
(`sh load-supabase-data.sh data.sql [container] [db-user] [db-name]`; local defaults `codi-rebuild-postgres codi codi`,
on the VPS `codi-rebuild-db codi codi`). It backs up the target, replaces all public data in one transaction, drops
sessions and keeps the rebuild's demo password on the seeded `usr-*` accounts. The dump holds real users' emails and
password hashes: keep `data.sql` out of git.

## Logs and rollback

- Logs: `docker logs -f codi-rebuild-app`.
- Which builds can I go back to? `sh rollback.sh --list` shows the release images (running and previous marked), the
  five newest backups and the end of `releases.log`.
- Back to the previous release: `sh rollback.sh` (uses `PREVIOUS_RELEASE`; running it again returns to the release
  just left). A specific build: `sh rollback.sh <sha>`. Both check that the image exists, wait for health and run the
  fast check.
- Also restore the data: `sh rollback.sh <sha> --restore-db backups/codi-<stamp>.dump`. It backs up the current data
  first, stops the app, recreates the `public` and `drizzle` schemas empty and restores the dump, so tables added by
  newer migrations do not survive. Needed only when the old code cannot run on the newer schema.
- Back to the original Codi: the old stack is stopped but kept (`/etc/codi/compose.yml`, `/etc/codi/codi.env`,
  images `codi-web:*`, `/opt/codi/current` → release). Run
  `cd /opt/codi-rebuild && docker compose stop app`, then
  `cd /etc/codi && CODI_RELEASE=$(basename "$(readlink /opt/codi/current)") docker compose --profile ai-worker up -d`.

## Known gaps

- The Google and GitHub OAuth clients must list `https://codi.hoangblue.dev/api/auth/callback/{google,github}`.
- Uploads go to Codi's real R2 buckets and emails are sent through Codi's Resend account.
