---
phase: 7
title: "Deployment, CI, and provider seams"
status: pending
priority: P2
effort: "2d"
dependencies: [3]
---

# Phase 7: Deployment, CI, and provider seams

## Overview

Make the same commit deploy to Vercel and build as a container, add CI gates, and define
the LLM seam the AI slice will consume later.

Can start once Phase 3 lands; only the final demo depends on it.

## Requirements

- Functional: one commit deploys to Vercel and builds/runs as a Docker image, with no forked config.
- Functional: the scripts CI depends on (`lint`, `typecheck`, `test`, `test:e2e`, parity
  check) all exist and pass locally. CI itself is planned separately.
- Non-functional: moving to Cloud Run, Kubernetes, or behind Cloudflare is configuration only.

## Architecture

**Portability comes from refusing host primitives, not from an abstraction layer.**
Banned outright: `@vercel/kv`, `@vercel/blob`, `@vercel/postgres`, Edge Config, and
`runtime: 'edge'`. Each has no Render or Cloud Run equivalent. A deployment "adapter" would
be over-engineering; a Dockerfile plus env vars already reaches every target.

**Database hosting: Neon or Supabase, not Render.** Render's free PostgreSQL expires after
30 days with no auto-renew, which lands mid-semester. Both alternatives are reached through
the same `DATABASE_URL`, so this is a hosting choice rather than a lock-in.

**Images:** install `sharp` in the runtime stage and keep optimization on. The common
self-hosting advice to set `unoptimized: true` is unnecessary and would hurt the course
catalog later.

**Dockerfile:** multi-stage on `node:24-alpine`, matching the team's local Node 24.15.
Copy `.next/standalone`, then `.next/static` and `public/` separately. Run as a non-root
user. `HOSTNAME=0.0.0.0` or the container accepts no external connections.

**Designed in now for Cloudflare**, because retrofitting is worse: real client IP comes from
`CF-Connecting-IP`, not `X-Forwarded-For`; Better Auth needs `baseURL` plus `trustedOrigins`
driven by env so preview deployments and a custom domain both work.

### LLM seam

```ts
interface LlmProvider {
  complete(opts: { system?: string; prompt: string; json?: boolean }): Promise<string>
}
```

OpenAI adapter now, plus a deterministic fake for tests.

**Stated honestly: this has no consumer in this slice.** It is built because the AI layer is
the thesis of the project and the seam was explicitly requested. Keep it to the interface,
one adapter, one fake, and one smoke test — anything more is speculative. The fake is the
part that will actually earn its keep, because LLM output is not reproducible and the AI
phases will need tests that are.

## Related Code Files

- Create: `Dockerfile`, `.dockerignore`, `.gitattributes`
- Create: `render.yaml`, `vercel.json` (only if genuinely needed)
- Create: `src/lib/providers/llm/{index,types,openai,fake}.ts`
- Create: `docs/deployment.md`
- Modify: `docker-compose.yml` (app service builds from the Dockerfile)

## Implementation Steps

1. Write the Dockerfile and `.dockerignore`. Verify the image runs standalone against the
   compose Postgres.
2. Add `.gitattributes` forcing LF on `Dockerfile`, `*.sh`, and `*.sql` — the team is on
   Windows and CRLF in a container entrypoint fails as a confusing `not found`.
3. Provision Postgres on Neon or Supabase; apply the Phase 2 migrations; record the pooled
   connection string. Serverless platforms need the **pooled** endpoint, not the direct one.
4. Deploy to Vercel from the repo. Set env vars. Confirm `/api/health` is green.
5. Add `render.yaml` for the Docker service with a `/api/health` check, pointed at the same
   external database.
6. **CI is planned separately** — see [`plans/260921-1342-codi-ci-and-pr-automation`](../260921-1342-codi-ci-and-pr-automation/plan.md),
   which covers path-classified lanes, the single `CI Gate` required check, the PostgreSQL
   service, gitleaks, and the `@vercel/` guard. Do not describe CI here as well; this phase
   only has to make sure the scripts CI calls (`lint`, `typecheck`, `test`, `test:e2e`, the
   parity check) exist and work locally.
7. Build the LLM seam with its fake and a single smoke test behind an env guard, so CI does
   not need a real API key.
8. Write `docs/deployment.md`: env var table, how to deploy to each target, how to rotate a
   secret, and what changes for Cloud Run, Kubernetes, and Cloudflare.

## Success Criteria

- [ ] `docker build` succeeds; the container serves and reaches the database
- [ ] The same commit deploys green to Vercel
- [ ] Render Docker service deploys and passes its health check
- [ ] Every script the CI plan calls exists and passes locally
- [ ] `grep -r "@vercel/" src/` returns nothing
- [ ] `docs/deployment.md` lets a teammate deploy without asking anyone

## Risk Assessment

**Vercel-specific behaviour creeping in.** Easy to add `@vercel/blob` "just for now" and
discover the container build broken weeks later. The grep in the success criteria is the
cheap guard; make it a CI step.

**Cold starts on free tiers.** Render free spins down after 15 minutes and takes 1–2 minutes
to wake. Fine for grading, bad for a live demo — warm it beforehand, and say so in the
deployment doc.

**Secrets in CI logs.** Echoing env for debugging leaks them into a public Actions log. Use
masked secrets and never `echo $DATABASE_URL`.

**Two hosts drifting.** Vercel and Render can silently diverge in env vars. The health check
should report a build identifier so it is obvious which commit each is running.

**LLM seam scope creep.** The temptation is to build retries, streaming, token accounting,
and caching now. None has a consumer. Interface, adapter, fake, smoke test — stop there.
