// Mounts Codi's Next.js route handlers (src/app/api/**/route.ts) on Hono, unchanged.
// Folder segments map to Hono paths: [id] → :id, [...all] → * (params.all = the remaining segments).
// Each handler runs inside the request context that next/headers reads.
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Context, Hono } from "hono";
import { NextRequest } from "next/server";
import { applyResponseCookies, currentRequestStore, runWithRequest } from "next/request-context";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];
type RouteContext = { params: Promise<Record<string, string | string[]>> };
type RouteHandler = (request: NextRequest, context: RouteContext) => Response | Promise<Response>;

export type MountedRoute = { path: string; methods: Method[]; file: string };

type Segment = { kind: "static"; value: string } | { kind: "param"; name: string } | { kind: "catchAll"; name: string };

function parseSegments(dir: string): Segment[] {
  return dir.split("/").filter(Boolean).map((part): Segment => {
    const catchAll = /^\[\.\.\.(\w+)\]$/.exec(part);
    if (catchAll) return { kind: "catchAll", name: catchAll[1]! };
    const param = /^\[(\w+)\]$/.exec(part);
    if (param) return { kind: "param", name: param[1]! };
    return { kind: "static", value: part };
  });
}

// Static segments win over params and params over catch-alls, so /orders/buy-now is tried before /orders/:id.
const RANK = { static: 0, param: 1, catchAll: 2 } as const;
function compareRoutes(a: Segment[], b: Segment[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (!a[i]) return -1;
    if (!b[i]) return 1;
    const d = RANK[a[i]!.kind] - RANK[b[i]!.kind];
    if (d) return d;
  }
  return 0;
}

function toHonoPath(segments: Segment[]) {
  return "/" + segments.map((s) => (s.kind === "static" ? s.value : s.kind === "param" ? `:${s.name}` : "*")).join("/");
}

function readParams(c: Context, segments: Segment[]) {
  const params: Record<string, string | string[]> = {};
  const parts = c.req.path.split("/").filter(Boolean);
  segments.forEach((s, i) => {
    if (s.kind === "param") params[s.name] = c.req.param(s.name) ?? "";
    if (s.kind === "catchAll") params[s.name] = parts.slice(i).map((p) => decodeURIComponent(p));
  });
  return params;
}

// @hono/node-server passes a lazy Request look-alike that the Request constructor cannot copy, so rebuild it.
// A body-less request (e.g. a plain DELETE) keeps body null, as in Next.js: some routes reject any request body.
function toNextRequest(raw: Request) {
  const length = raw.headers.get("content-length");
  const declaresBody = raw.headers.has("transfer-encoding") || (length !== null && length.trim() !== "0");
  const hasBody = raw.method !== "GET" && raw.method !== "HEAD" && declaresBody;
  return new NextRequest(raw.url, {
    method: raw.method,
    headers: raw.headers,
    body: hasBody ? raw.body : undefined,
    signal: raw.signal,
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);
}

/** Runs fn with the request context and returns its Response with any cookies().set() values appended. */
export async function runInRequestContext(request: Request, fn: () => Promise<Response>) {
  return runWithRequest(request, async () => {
    const response = await fn();
    return applyResponseCookies(response, currentRequestStore());
  });
}

export async function mountNextRoutes(app: Hono, appDir: string): Promise<MountedRoute[]> {
  const apiDir = path.join(appDir, "api");
  const files = (readdirSync(apiDir, { recursive: true }) as string[])
    .map((f) => f.split(path.sep).join("/"))
    .filter((f) => f === "route.ts" || f.endsWith("/route.ts"));
  const routes = files
    .map((file) => ({ file, segments: [{ kind: "static", value: "api" } as Segment, ...parseSegments(path.posix.dirname(file))] }))
    .sort((a, b) => compareRoutes(a.segments, b.segments));

  const mounted: MountedRoute[] = [];
  for (const { file, segments } of routes) {
    const mod = (await import(pathToFileURL(path.join(apiDir, file)).href)) as Partial<Record<Method, RouteHandler>>;
    const honoPath = toHonoPath(segments);
    const methods = METHODS.filter((m) => typeof mod[m] === "function");
    for (const method of methods) {
      const handler = mod[method]!;
      app.on(method, honoPath, (c) => {
        const request = toNextRequest(c.req.raw);
        const context: RouteContext = { params: Promise.resolve(readParams(c, segments)) };
        return runInRequestContext(request, async () => {
          try {
            return await handler(request, context);
          } catch (error) {
            console.error(`[route] ${method} ${c.req.path} failed`, error);
            return Response.json({ error: "Lỗi máy chủ. Vui lòng thử lại." }, { status: 500 });
          }
        });
      });
    }
    mounted.push({ path: honoPath, methods, file: `src/app/api/${file}` });
  }
  return mounted;
}
