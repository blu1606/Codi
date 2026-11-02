// Backend entry: Codi's API (route handlers + server actions, vendored unchanged) on Hono, port 4100.
// The Vite dev server on :5190 proxies /api here, so the browser sees one origin.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { mountNextRoutes } from "./host/next-routes";
import { mountServerActions } from "./host/server-actions";
import { db } from "./services";

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "app");
const port = Number(process.env.API_PORT || 4100);

async function main() {
  const app = new Hono();

  app.get("/api/health", async (c) => {
    try {
      await db.execute(sql`select 1`);
      return c.json({ ok: true });
    } catch (error) {
      console.error("[health] database unreachable", error);
      return c.json({ ok: false, error: "Không kết nối được cơ sở dữ liệu." }, 503);
    }
  });

  const routes = await mountNextRoutes(app, appDir);
  const actionModules = await mountServerActions(app, appDir);

  app.notFound((c) => c.json({ error: "Không tìm thấy." }, 404));
  app.onError((error, c) => {
    console.error(`[server] ${c.req.method} ${c.req.path} failed`, error);
    return c.json({ error: "Lỗi máy chủ. Vui lòng thử lại." }, 500);
  });

  const server = serve({ fetch: app.fetch, port }, () => {
    const actions = actionModules.reduce((n, m) => n + m.actions.length, 0);
    console.log(`Codi API on http://localhost:${port} (${routes.length} routes, ${actions} actions in ${actionModules.length} modules)`);
  });

  const shutdown = () => {
    server.close(() => {
      db.$client.end().finally(() => process.exit(0));
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
