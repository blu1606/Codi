# Codi Deployment Abstraction Research

**Date:** 2026-09-21  
**Author:** Researcher (van.nh120802@gmail.com)

## Executive Summary
Codi can deploy to Vercel *and* Render+Docker via one codebase by avoiding Vercel-exclusive services (KV, Blob, Edge Config, Image Optimization), using environment-driven abstractions for storage/email, and keeping auth config flexible. GCP/Kubernetes/Cloudflare require only configuration changes if designed now.

---

## 1. Portable Next.js 15 Container

**Dockerfile shape** (multi-stage, node:22-alpine):
```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER nextjs
EXPOSE 3000
ENV NODE_ENV=production HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
```

**next.config.ts**: `output: 'standalone'` reduces image 5–7x [1][2].  
**Key detail**: copy `.next/static` and `public/` *separately* after standalone build; Render/GCP will auto-mount volumes for avatars [2][3].

---

## 2. Vercel ↔ Docker Lock-In Vectors

**Avoid these Vercel-only features** or they break self-hosting:
- `@vercel/kv`, `@vercel/postgres`, `@vercel/blob` — no Render equivalent; use PostgreSQL + S3-compatible instead [5]
- **Edge Config** (`@vercel/edge-config`) — read-only config store; migrate to database or env vars
- **Image Optimization** (`next/image` default `unoptimized: false`) — Vercel CDN; set `unoptimized: true` in `next.config.ts` for self-hosted [4]
- **Edge Runtime** (`runtime: 'edge'`) — only on Vercel; use Node.js runtime for all APIs
- **ISR cache on disk** — `.next` folder is ephemeral on Render; see **§3** for workaround

**Vercel Postgres/Edge Config replacement**: use raw PostgreSQL (Kysely already in stack) [5].

---

## 3. Render Deployment Specifics

**Free tier** [6][7]:
- Web services: 750 free compute hours/month, spin-down after 15 min inactivity (cold start ~1–2 min)
- PostgreSQL: **1 GB storage, 30-day expiry**; no auto-renew on free tier — must upgrade or seed dev-only

**For academic MVP**: 
- Accept cold starts; free tier is demo-only
- PostgreSQL: seed fresh after 30 days or add free tier Vercel Postgres as backup (no lock-in if you avoid Blob/KV)
- Health check: `/api/health` returning 200

**render.yaml blueprint**:
```yaml
services:
  - type: web
    name: codi-app
    env: docker
    dockerfilePath: ./Dockerfile
    envVars:
      - key: DATABASE_URL
        scope: run_and_build
  databases:
    - name: codi-db
      databaseName: codi_db
      plan: free
```

---

## 4. Forward Path: GCP, Kubernetes, Cloudflare

**GCP Cloud Run**: accepts Docker images directly [8]. Configuration-only change — point image URL to Cloud Run registry.

**Kubernetes**: `.next` cache is **per-pod**; for multi-replica ISR, mount shared volume:
```yaml
volumes:
  - name: nextjs-cache
    persistentVolumeClaim:
      claimName: nextjs-cache-pvc
volumeMounts:
  - name: nextjs-cache
    mountPath: /app/.next
```
Else disable ISR or use external cache handler [9].

**Cloudflare reverse proxy**:
- Read real client IP from `CF-Connecting-IP` header (Cloudflare injects; X-Forwarded-For is unreliable) [10]
- Better Auth: explicitly configure `allowedHosts: ["yourdomain.com", "*.vercel.app"]` and `baseURL` with protocol — wildcard support built-in [11]
- Secure cookies: Cloudflare does not strip `Secure`/`SameSite`; verify Better Auth's `trustHost` setting matches your reverse proxy headers

---

## 5. Storage Abstraction

**Interface** (minimal, for avatars):
```typescript
interface StorageProvider {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<string> // returns URL
  delete(key: string): Promise<void>
  getPresignedUrl(key: string, expiresIn: number): Promise<string>
}
```

**Adapters**:
- **Local** (dev): write to `./public/avatars/`, serve via Next.js static
- **R2** (prod): free tier = 10 GB + 1M Class A ops + **free egress** (S3 charges $0.09/GB) [12]

**Why abstraction buys portability**: Vercel Blob is upload-only (no direct URLs); avoid it. Use S3-compatible (R2/S3/GCS) — all accept same SDK (`@aws-sdk/client-s3` with custom endpoint).

**Presigned URLs** (preferred): client signs directly; avoids proxy overhead, works behind Cloudflare [12].

---

## 6. Email Abstraction

**Interface**:
```typescript
interface EmailProvider {
  send(to: string, subject: string, html: string): Promise<void>
}
```

**Recommendation**:
- **Production**: Resend (3,000 emails/month free, great TypeScript DX) [13]
- **Development**: Mailpit in docker-compose (SMTP:1025, UI:8025; actively maintained replacement for MailHog) [14]

Set env var `EMAIL_PROVIDER=resend|mailpit`; initialize adapter accordingly.

---

## 7. Config/Secrets Pattern

**`.env.local`** (Zod-validated):
```typescript
const envSchema = z.object({
  // Public (hardcoded or env var, safe for client)
  NEXT_PUBLIC_APP_URL: z.string().url(),
  
  // Server-only
  DATABASE_URL: z.string(),
  AUTH_SECRET: z.string(),
  AUTH_TRUST_HOST: z.enum(['true', 'false']).default('false'), // for reverse proxy
  
  STORAGE_PROVIDER: z.enum(['local', 'r2']).default('local'),
  R2_ENDPOINT: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  
  EMAIL_PROVIDER: z.enum(['resend', 'mailpit']).default('mailpit'),
  RESEND_API_KEY: z.string().optional(),
  MAILPIT_HOST: z.string().default('localhost'),
})
```

**Better Auth config**:
```typescript
auth({
  baseURL: process.env.AUTH_URL, // e.g., https://yourdomain.com
  allowedHosts: (process.env.AUTH_ALLOWED_HOSTS || 'localhost').split(','),
  trustHost: process.env.AUTH_TRUST_HOST === 'true', // enable for Cloudflare
})
```

---

## 8. Local Dev docker-compose

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgres://user:pass@postgres:5432/codi_db
      EMAIL_PROVIDER: mailpit
      MAILPIT_HOST: mailpit
      STORAGE_PROVIDER: local
    depends_on:
      - postgres
      - mailpit

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: codi_db
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  mailpit:
    image: axllent/mailpit:latest
    ports:
      - '1025:1025'
      - '8025:8025'

volumes:
  postgres_data:
```

---

## Unresolved Questions

1. **Avatar size limits** — Render's free disk is 100 MB; how many avatars before storage cost? Document quota enforcement.
2. **ISR invalidation** — if cache is per-pod (K8s), how to trigger revalidation? On-demand revalidation only?
3. **Better Auth session storage** — default is `useSecureCookies: true`; will this work behind Cloudflare without `trustHost: true`? Test early.

---

## Sources

[1] https://github.com/kristiyan-velkov/nextjs-prod-dockerfile  
[2] https://draftedby.com/blog/nextjs-15-standalone-docker-guide  
[3] https://docs.docker.com/guides/nextjs/  
[4] https://nextjs.org/docs/app/getting-started/deploying  
[5] https://vercel.com/docs/storage  
[6] https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026  
[7] https://www.srvrlss.io/provider/render/  
[8] https://dev.to/googleai/the-ultimate-cloud-run-guide-2026-54f8  
[9] https://github.com/vercel/next.js/discussions/38858  
[10] https://ipgeolocation.io/guides/get-real-client-ip-address  
[11] https://better-auth.com/docs/guides/dynamic-base-url  
[12] https://www.kunalganglani.com/blog/cloudflare-r2-vs-aws-s3  
[13] https://www.pkgpulse.com/guides/resend-vs-nodemailer-vs-postmark-email-nodejs-2026  
[14] https://www.jeffgeerling.com/blog/2026/mailpit-local-email-debugging/
