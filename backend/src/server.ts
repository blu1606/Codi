// Backend entry: Codi's API (route handlers + server actions, vendored unchanged) on Hono, port 4100.
// The Vite dev server on :3001 proxies /api here, so the browser sees one origin.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { aiWorkerEnabled, startAiWorker } from "./host/ai-worker";
import { mountNextRoutes } from "./host/next-routes";
import { mountServerActions } from "./host/server-actions";
import { ENV } from "./env";
import { db } from "./services";

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "app");
const port = Number(process.env.API_PORT || 4100);

async function main() {
  const app = new Hono();

  // `release` is the image tag (git short sha) set by deploy/compose.yml, so release.sh, rollback.sh and the fast
  // check can confirm which build answers.
  const release = process.env.APP_RELEASE || "dev";
  app.get("/api/health", async (c) => {
    try {
      await db.execute(sql`select 1`);
      return c.json({ ok: true, release });
    } catch (error) {
      console.error("[health] database unreachable", error);
      return c.json({ ok: false, release, error: "Không kết nối được cơ sở dữ liệu." }, 503);
    }
  });

  // Public runtime switches the frontend reads once at boot (same image for demo and real-shop deploys).
  app.get("/api/config", (c) => c.json({ demoTools: ENV.DEMO_TOOLS }));

  const routes = await mountNextRoutes(app, appDir);
  const actionModules = await mountServerActions(app, appDir);

  // Production image: the built frontend is served from WEB_DIST on the same origin; unknown non-API paths get
  // index.html so React Router handles them.
  const webDist = process.env.WEB_DIST;
  if (webDist) {
    const indexHtml = readFileSync(path.join(webDist, "index.html"), "utf8");
    app.use("*", serveStatic({ root: webDist }));
    app.get("*", (c, next) => (c.req.path.startsWith("/api/") ? next() : c.html(indexHtml)));
  }

  app.notFound((c) => c.json({ error: "Không tìm thấy." }, 404));
  app.onError((error, c) => {
    console.error(`[server] ${c.req.method} ${c.req.path} failed`, error);
    return c.json({ error: "Lỗi máy chủ. Vui lòng thử lại." }, 500);
  });

  // Behind a TLS proxy (Caddy) the request arrives as http; rebuild its URL as https so the routes' Origin checks
  // (Origin === nextUrl.origin) match what the browser sent.
  const fetch = (req: Request, env: unknown) => {
    if (req.headers.get("x-forwarded-proto") === "https" && req.url.startsWith("http:")) {
      const init = { method: req.method, headers: req.headers, body: req.body, duplex: "half" };
      req = new Request(`https:${req.url.slice(5)}`, init as RequestInit);
    }
    return app.fetch(req, env);
  };

  const server = serve({ fetch, port }, () => {
    const actions = actionModules.reduce((n, m) => n + m.actions.length, 0);
    console.log(`Codi API on http://localhost:${port} (${routes.length} routes, ${actions} actions in ${actionModules.length} modules)`);
  });

  // AI background jobs (GitHub analysis, knowledge map, quiz generation, learning paths) run in this process.
  const workerStop = new AbortController();
  const worker = aiWorkerEnabled() ? startAiWorker(workerStop.signal) : Promise.resolve();
  if (aiWorkerEnabled()) console.log("AI background worker started");

  const shutdown = () => {
    workerStop.abort();
    server.close(() => {
      worker.finally(() => db.$client.end()).finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Backend failed to start. Is Postgres up (npm run db:up) and migrated (npm run migrate)?", error);
  process.exit(1);
});
