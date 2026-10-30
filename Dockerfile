FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
# Build-only placeholders; runtime values come from /etc/codi/codi.env.
# Never use the production database or credentials during the build.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    BETTER_AUTH_SECRET=build-only-not-a-production-secret-1234567890 \
    BETTER_AUTH_URL=https://example.invalid \
    NODE_ENV=production pnpm --filter web build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app /app
WORKDIR /app/apps/web
USER node
EXPOSE 3001
CMD ["./node_modules/.bin/varlock", "run", "--", "./node_modules/.bin/next", "start", "--port", "3001"]
