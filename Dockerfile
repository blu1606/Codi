# syntax=docker/dockerfile:1
# One image: Hono backend serving /api and the built Vite frontend on the same port.

# 1. All workspace dependencies (dev included, needed for the Vite build).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY backend/shims backend/shims
COPY backend/packages backend/packages
RUN npm ci --no-audit --no-fund

# 2. Frontend production build.
FROM deps AS web
COPY frontend frontend
RUN npm run build -w frontend

# 3. Backend source with runtime dependencies only.
FROM deps AS backend
COPY backend backend
RUN npm prune --omit=dev --no-audit --no-fund \
 && rm -rf frontend node_modules/.cache

# 4. Runtime.
FROM node:22-alpine AS runtime
# The AI background worker (src/host/ai-worker.ts) runs inside the app process.
ENV NODE_ENV=production \
    API_PORT=3001 \
    WEB_DIST=/app/frontend/dist \
    AI_BACKGROUND_WORKER_ENABLED=true
WORKDIR /app/backend
COPY --from=backend --chown=node:node /app /app
COPY --from=web --chown=node:node /app/frontend/dist /app/frontend/dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null || exit 1
CMD ["node", "--import", "tsx", "src/server.ts"]
