# Local Development Setup

This guide will walk you through setting up a local development environment for Codi.

## Prerequisites

Ensure you have the following installed on your system:
- **Git** — for version control
- **Docker** — for running services locally
- **Docker Compose** — for orchestrating containers (v2.0+)
- **psql** (PostgreSQL client) — for database operations
- **Node.js** (24+) — for running the application (installed separately when needed)

## Setup Steps

### 1. Clone the repository

```bash
git clone https://github.com/blu1606/Codi.git
cd Codi
```

### 2. Copy environment variables

Copy the example environment file to `.env.local`:

```bash
cp .env.example .env.local
```

**Important:** Review `.env.local` and update any values as needed. For local development, the defaults should work, but you'll need to add OAuth credentials and API keys if you plan to test those features.

### 3. Start the local services

Bring up PostgreSQL and Mailpit using Docker Compose:

```bash
docker compose up -d postgres mailpit
```

Verify that PostgreSQL is healthy:

```bash
docker compose ps
```

You should see:
- `codi-postgres` with status `healthy` (after a few seconds)
- `codi-mailpit` with status `running`

### 4. Run database migrations and seed

Apply all pending migrations and seed data:

```bash
./database/migrate.sh --seed
```

This will:
1. Create the `schema_migrations` table
2. Apply all `.sql` files from `database/migrations/` in alphabetical order
3. Load the seed data from `database/seed.sql` (if it exists)

The script is idempotent — running it again will not duplicate data.

### 5. Verify the database

Test the database connection from your host:

```bash
psql "$DATABASE_URL" -c "SELECT version();"
```

You should see: `PostgreSQL 16.x on ...`

### 6. Access Mailpit (email testing)

The Mailpit UI is available at **http://localhost:8025**. Any emails sent during development will appear here instead of being delivered.

## Common Tasks

### Reset the database (development only)

To drop and recreate the database:

```bash
./database/migrate.sh --reset --seed
```

**Note:** This command is not allowed when `NODE_ENV=production`.

### Apply migrations without seed data

```bash
./database/migrate.sh
```

### Stop local services

```bash
docker compose down
```

### Stop and clean up volumes (delete all database data)

```bash
docker compose down -v
```

## Troubleshooting

### Port already in use

If port 5433 is already in use, set an environment variable:

```bash
export POSTGRES_HOST_PORT=5434
docker compose up -d postgres mailpit
```

Update `DATABASE_URL` in `.env.local` to match:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/codi
```

### psql command not found

Install the PostgreSQL client tools:

**macOS:**
```bash
brew install postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql-client
```

**Windows:**
Download and install from [postgresql.org](https://www.postgresql.org/download/windows/)

### Docker Compose fails to start

Ensure Docker daemon is running:

```bash
docker ps
```

If this fails, start Docker Desktop or the Docker daemon.

### Migrations fail

1. Check that PostgreSQL is healthy: `docker compose ps`
2. Verify `DATABASE_URL` is set correctly
3. Check the migration file for syntax errors
4. Review Docker logs: `docker compose logs postgres`

## RBAC: seeding roles and the first Admin

After the database is up and migrated, seed the 3 RBAC roles (`LEARNER`, `LECTURER`,
`ADMIN`) and backfill any existing user to `LEARNER`:

```bash
pnpm --filter @codi-1/db db:seed-roles
```

Safe to re-run — idempotent.

New registrations are auto-granted `LEARNER`. There is no UI path to create the first
`ADMIN` (by design — the Admin role-management screen requires an Admin to exist
already), so bootstrap one from a normal registered account:

```bash
SEED_ADMIN_EMAIL=you@example.com pnpm --filter @codi-1/db db:seed-admin
```

The user must already exist (register normally first). Once one Admin exists, further
role changes (promoting to Lecturer/Admin, demoting) go through
`/dashboard/admin/users` in the app.

## Next Steps

Once local setup is complete, the development workflow is:

1. Create a feature branch from `develop`
2. Make your changes
3. Test locally using `pnpm test` and `pnpm test:e2e`
4. Commit and push to open a pull request
5. CI/CD will validate before merging

For authentication and API testing, see the relevant phase documentation in `plans/`.
