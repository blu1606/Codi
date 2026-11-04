# CI/CD

One GitHub Actions workflow, [.github/workflows/ci-cd.yml](../.github/workflows/ci-cd.yml). Work goes to `develop`
first through a pull request, then `develop` is merged into `main`; only a push to `main` deploys.

| Event | check | e2e | deploy |
|---|---|---|---|
| Pull request into `develop` or `main` | yes | yes | no |
| Push to `develop` | yes | yes | no |
| Push to `main` (a merged PR) | yes | yes | after both pass, when the image or the release scripts changed |
| Manual run (`workflow_dispatch`) | yes | yes | always when run on `main` |

Changes that only touch `*.md`, `docs/`, `plans/`, `perf/runs/` or `security/scans/` run nothing (`paths-ignore`).
On `main`, the **release-needed** job compares the push with the release the VPS is running (`/api/health`): it
deploys only when `backend`, `frontend`, `Dockerfile`, `.dockerignore`, the lockfile or a deploy script differ, or
when the running release is not in the history (a manual deploy). A change to tests or to the workflow is checked
but not released. The run summary states the decision and why.

## Jobs

**check** (about 3 minutes): `npm ci`, backend typecheck, `npm test` (Vitest and the `node:test` files; no database
needed), frontend build, `npm run security:check` (secret scan, secret files in git, `npm audit` high/critical).

**e2e** (about 8 minutes): builds the production image, starts it with its own Postgres through
[deploy/compose.perf.yml](../deploy/compose.perf.yml) (a random `BETTER_AUTH_SECRET`, demo seed), then runs
`deploy/fastcheck.sh`, every Playwright spec (fast check on desktop and mobile, role guards, Content-Security-Policy)
and the full security probe including its active checks. On failure the Playwright report is attached to the run as
`playwright-report`.

**deploy** (about 6 minutes, `main` only, environment `production`): builds the image tagged with the short commit
sha, streams it to the VPS, copies the deploy scripts (`compose.yml`, `release.sh`, `rollback.sh`, `release-lib.sh`,
`fastcheck.sh`) so the server always runs the committed versions, and runs `release.sh <sha>`. `release.sh` backs up
the database, applies migrations, switches to the new image and rolls back by itself when the health check or the
fast check fails (the job then fails). Afterwards the job checks the public site: `fastcheck.sh` through Caddy
expecting the new release, the read-only Playwright fast check and the passive security probe. Deploys never run in
parallel (`concurrency: deploy-production`).

## Secrets (environment `production`)

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | the VPS address |
| `DEPLOY_SSH_KEY` | private key of the dedicated deploy key (`github-actions-codi-deploy` in `/root/.ssh/authorized_keys`) |
| `DEPLOY_SSH_KNOWN_HOSTS` | `ssh-keyscan` output of the VPS, so the job refuses an unknown host key |

To replace the key: create a new ed25519 key, add its public half to `/root/.ssh/authorized_keys` on the VPS, set
`DEPLOY_SSH_KEY` to the private half (`gh secret set DEPLOY_SSH_KEY --env production < key`), run the workflow once,
then remove the old line from `authorized_keys`.

## Rolling back

A failed release rolls back automatically. To go back after a release that passed: on the VPS run
`sh /opt/codi-rebuild/rollback.sh` (previous release) or `rollback.sh <sha>`, see [deployment.md](deployment.md).
Reverting the commit on `main` and letting the workflow deploy the revert works too.

## Requiring CI before merge

The workflow does not block merges by itself. To make it a gate, protect `develop` and `main` (Settings → Branches)
with the required status checks "Typecheck, unit tests, build, security check" and "E2E (Playwright) and security
probe on the production image". Merge pull requests with **Create a merge commit**, which keeps each branch's commits.
