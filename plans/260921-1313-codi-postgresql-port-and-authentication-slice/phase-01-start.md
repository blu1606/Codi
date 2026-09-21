---
phase: 1
title: "Foundations and local environment"
status: pending
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: Foundations and local environment

## Overview

Establish the local service stack, the environment contract, and the migration runner —
all of it independent of Node, so that `create-next-app` in Phase 3 cannot collide with it.

## Requirements

- Functional: `docker compose up -d` brings up PostgreSQL 16 and a mail catcher.
- Functional: one command applies every migration and the seed to a clean database.
- Non-functional: no secret in git; `.env.example` documents every key.
- Non-functional: **this phase creates no `package.json`, `tsconfig.json`, or `node_modules`.**

## Architecture

The repo stays a **single Next.js application at the root**, not a monorepo — one deployable,
and a workspace tool would be overhead with no second package to justify it.

```
/                  docker-compose.yml, .env.example, .gitattributes
  database/        schema, migrations, seed, runner, python tooling (exists)
  docs/            tech-stack.md, design-guidelines.md (exists)
  plans/           (exists)
  src/             created in Phase 3
```

**Why no Node artifacts here.** `create-next-app` overwrites `package.json`, `tsconfig.json`,
and `.gitignore` without asking. Rather than scaffolding first and repairing the damage, this
phase simply owns nothing that the scaffold wants. Phase 3 runs the scaffold onto a clean
slate and then adds `src/lib/env.ts`.

**Migration runner.** A shell script over `psql`, not a Node tool — it must work before the
app exists and inside CI. Applies `database/migrations/*.sql` in filename order, tracks
applied files in a `schema_migrations` table, and is idempotent. Seeding is a separate flag
so tests can load schema without fixtures.

## Related Code Files

- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitattributes`
- Create: `database/migrate.sh` (apply migrations + optional seed)
- Already exists: `.gitignore`

## Implementation Steps

1. Write `.gitattributes` forcing LF on `*.sh`, `*.sql`, and `Dockerfile`. The team is on
   Windows; CRLF in a script a container executes fails as a confusing `not found`. Do this
   **first**, before creating any script, or the first commit bakes in CRLF.
2. Write `docker-compose.yml`:
   - `postgres` — `postgres:16-alpine`, named volume, `pg_isready` healthcheck,
     host port via `${POSTGRES_HOST_PORT:-5433}`
   - `mailpit` — `axllent/mailpit`, SMTP 1025, UI 8025
   - `app` — commented out; Phase 7 fills it in once a Dockerfile exists
3. Write `database/migrate.sh`:
   - create `schema_migrations (filename text primary key, applied_at timestamptz default now())`
   - apply each unapplied `migrations/*.sql` in order, inside a transaction, aborting on error
   - `--seed` also applies `database/seed.sql`
   - `--reset` drops and recreates the database (local only; refuse when `NODE_ENV=production`)
4. Write `.env.example` with every key the slice needs, safe placeholders, one-line comments:
   `DATABASE_URL`, `POSTGRES_HOST_PORT`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
   `NEXT_PUBLIC_APP_URL`, `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `RESEND_API_KEY`,
   `STORAGE_PROVIDER`, `R2_*`, `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`,
   `OPENAI_API_KEY`.
   Note in the file which keys are required per provider — Phase 3 turns these notes into
   conditional zod validation.
5. Write `docs/local-setup.md`: clone → copy `.env.example` → `docker compose up -d` →
   `./database/migrate.sh --seed`. A teammate should reach a working database without asking.
6. Verify end to end against a clean volume.

## Success Criteria

- [ ] `docker compose up -d` — Postgres healthy, Mailpit UI reachable on :8025
- [ ] `psql "$DATABASE_URL" -c 'select version()'` returns PostgreSQL 16 from the host
- [ ] `./database/migrate.sh` on a clean database succeeds and creates `schema_migrations`
- [ ] Running it a second time applies nothing and exits 0
- [ ] `--seed` loads the three roles; running it twice does not duplicate them
- [ ] No `package.json`, `tsconfig.json`, or `node_modules` exists at the end of this phase
- [ ] `git status` clean after a full compose cycle — no data directory tracked

## Risk Assessment

**Port collisions.** A team member already has a PostgreSQL 16 client installed, which
suggests a local server may hold 5432. Default the host port to 5433 and make it env-driven
rather than asking anyone to stop a service.

**CRLF.** Addressed by step 1, but only if step 1 genuinely goes first.

**Migration runner scope creep.** It needs apply, track, and seed. It does not need
rollback — for a greenfield academic project, `--reset` is the honest recovery path, and a
down-migration nobody tests is worse than none.

**Seed drift.** `seed.sql` must be idempotent (`ON CONFLICT DO NOTHING`), because it will be
re-run constantly during development. A seed that fails the second time will get commented
out by someone in a hurry, and then Phase 4's role hook breaks mysteriously.
