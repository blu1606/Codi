// Backend entry: Codi's API (route handlers + server actions, vendored unchanged) on Hono, port 4100.
// The Vite dev server on :3001 proxies /api here, so the browser sees one origin.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { secureHeaders } from "hono/secure-headers";
import { aiWorkerEnabled, startAiWorker } from "./host/ai-worker";
import { mountNextRoutes } from "./host/next-routes";
import { mountServerActions } from "./host/server-actions";
import { ENV } from "./env";
import { assignmentUploadOrigin, publicStorageBase } from "./lib/storage";
import { db } from "./services";

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "app");

// Content-Security-Policy of the frontend pages. Everything is same-origin (API, uploads, lesson media, covers)
// except what is listed: Google Fonts, the YouTube player (iframe on youtube-nocookie.com plus the iframe_api script
// and thumbnails), Cloudflare Turnstile on the sign-up form (script and challenge iframe), SePay's VietQR image and
// Google / GitHub profile pictures. Scripts allow no inline code and no
// eval (the code editor's syntax check parses with acorn). Inline styles stay allowed: components set style
// attributes. Sent on HTML responses only, so lecture PDFs keep opening in the browser's own viewer.
// When R2_PUBLIC_URL names a public storage domain, uploaded avatars, lecture videos and PDFs are linked there instead
// of through the same-origin proxies (storage.ts publicStorageBase), so that origin is allowed for those three.
function storageOrigin() {
  const base = publicStorageBase();
  try {
    return base ? ` ${new URL(base).origin}` : "";
  } catch {
    console.error("[csp] R2_PUBLIC_URL is not a URL; uploaded media will be blocked until it is fixed");
    return "";
  }
}
const STORAGE = storageOrigin();
const uploadOrigin = assignmentUploadOrigin();
const UPLOAD = uploadOrigin ? ` ${uploadOrigin}` : "";
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://www.youtube.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: https://qr.sepay.vn https://i.ytimg.com https://lh3.googleusercontent.com https://avatars.githubusercontent.com${STORAGE}`,
  `media-src 'self' blob:${STORAGE}`,
  `frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://challenges.cloudflare.com${STORAGE}`,
  // Learners upload assignment files straight to R2 with a presigned PUT (lesson-assessments.jsx).
  `connect-src 'self'${UPLOAD}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const port = Number(process.env.API_PORT || 4100);

async function main() {
  const app = new Hono();

  // Security headers on every response (pages and API). HSTS is ignored by browsers over plain http, so local runs
  // are unaffected. The Content-Security-Policy is added to the HTML pages only (see CONTENT_SECURITY_POLICY).
  // COOP/CORP keep Hono's same-origin defaults (no popups are used).
  // Uploaded lecture PDFs are embedded in the lesson page (an iframe on the same origin), so that one route allows
  // SAMEORIGIN framing; everything else stays DENY.
  const headersFor = (xFrameOptions: "DENY" | "SAMEORIGIN") =>
    secureHeaders({ strictTransportSecurity: "max-age=31536000", xFrameOptions, referrerPolicy: "strict-origin-when-cross-origin" });
  const strictHeaders = headersFor("DENY");
  const mediaHeaders = headersFor("SAMEORIGIN");
  app.use("*", (c, next) => (c.req.path === "/api/lesson-media" ? mediaHeaders(c, next) : strictHeaders(c, next)));

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
  // turnstileSiteKey is null unless both Turnstile keys are set, matching when the backend enforces the captcha.
  app.get("/api/config", (c) => c.json({
    demoTools: ENV.DEMO_TOOLS,
    turnstileSiteKey: ENV.TURNSTILE_SITE_KEY && ENV.TURNSTILE_SECRET_KEY ? ENV.TURNSTILE_SITE_KEY : null,
  }));

  const routes = await mountNextRoutes(app, appDir);
  const actionModules = await mountServerActions(app, appDir);

  // Production image: the built frontend is served from WEB_DIST on the same origin; unknown non-API paths get
  // index.html so React Router handles them.
  const webDist = process.env.WEB_DIST;
  if (webDist) {
    const indexHtml = readFileSync(path.join(webDist, "index.html"), "utf8");
    // Frontend only: gzip (the main bundle is ~1.3 MB raw, ~0.35 MB gzipped) and caching. Vite fingerprints
    // /assets/* file names, so they never change and can be cached for a year; everything else (index.html, icons)
    // is revalidated so a release shows up on the next load. API responses are left alone: compressing them would
    // buffer the AI tutor's streamed answers.
    const gzip = compress();
    app.use("*", async (c, next) => {
      if (c.req.path.startsWith("/api/")) return next();
      await gzip(c, async () => {
        await next();
        if (c.res.headers.get("content-type")?.startsWith("text/html")) {
          c.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
        }
        if (c.res.status !== 200) return;
        c.header("Cache-Control", c.req.path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
      });
    });
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
