// Exposes Codi's "use server" action modules (src/app/**/actions.ts) as JSON endpoints:
//   POST /api/actions/<module>/<exportName>   body: JSON array of arguments (or empty for none)
// <module> is the action file's folder under src/app with brackets dropped, e.g.
//   src/app/dashboard/lecturer/courses/[courseId]/kmap/actions.ts → dashboard/lecturer/courses/courseId/kmap
// The response body is the action's return value as JSON (undefined → null). The session cookie applies,
// because actions read it through next/headers like they do in Next.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Hono } from "hono";
import { ForbiddenError } from "@codi-1/auth";
import { runInRequestContext } from "./next-routes";

type Action = (...args: unknown[]) => unknown;
export type MountedActionModule = { module: string; file: string; actions: string[] };

const USE_SERVER = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const moduleKey = (dir: string) => dir.replace(/\[(?:\.\.\.)?(\w+)\]/g, "$1");

function errorResponse(error: unknown, label: string) {
  if (error instanceof ForbiddenError) return Response.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 403 });
  const message = error instanceof Error ? error.message : "";
  if (/^unauthori[sz]ed\b/i.test(message) || message === "Vui lòng đăng nhập.") {
    return Response.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  }
  console.error(`[action] ${label} failed`, error);
  // Database driver errors carry SQL text and parameters; only plain application messages reach the client.
  const fromDatabase = /^Failed query/.test(message) || (error instanceof Error && error.cause !== undefined);
  return Response.json({ error: !message || fromDatabase ? "Lỗi máy chủ. Vui lòng thử lại." : message }, { status: 500 });
}

export async function mountServerActions(app: Hono, appDir: string): Promise<MountedActionModule[]> {
  const files = (readdirSync(appDir, { recursive: true }) as string[])
    .map((f) => f.split(path.sep).join("/"))
    .filter((f) => /(^|\/)actions\.ts$/.test(f) && !f.startsWith("api/"))
    .filter((f) => USE_SERVER.test(readFileSync(path.join(appDir, f), "utf8")))
    .sort();

  const registry = new Map<string, Map<string, Action>>();
  const mounted: MountedActionModule[] = [];
  for (const file of files) {
    const mod = (await import(pathToFileURL(path.join(appDir, file)).href)) as Record<string, unknown>;
    const actions = new Map<string, Action>();
    for (const [name, value] of Object.entries(mod)) if (typeof value === "function") actions.set(name, value as Action);
    const key = moduleKey(path.posix.dirname(file));
    registry.set(key, actions);
    mounted.push({ module: key, file: `src/app/${file}`, actions: [...actions.keys()].sort() });
  }

  app.post("/api/actions/*", async (c) => {
    const rest = decodeURIComponent(c.req.path.slice("/api/actions/".length)).replace(/\/+$/, "");
    const slash = rest.lastIndexOf("/");
    const key = moduleKey(rest.slice(0, slash));
    const name = rest.slice(slash + 1);
    const action = slash > 0 ? registry.get(key)?.get(name) : undefined;
    if (!action) return c.json({ error: `Không có thao tác ${rest}.` }, 404);

    const raw = await c.req.text();
    if (raw.length > MAX_BODY_BYTES) return c.json({ error: "Dữ liệu gửi lên quá lớn." }, 413);
    let args: unknown;
    try {
      args = raw.trim() ? JSON.parse(raw) : [];
    } catch {
      return c.json({ error: "Body phải là mảng JSON các tham số." }, 400);
    }
    if (!Array.isArray(args)) return c.json({ error: "Body phải là mảng JSON các tham số." }, 400);

    return runInRequestContext(c.req.raw, async () => {
      try {
        const result = await action(...args);
        return Response.json(result === undefined ? null : result, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        return errorResponse(error, `${key}/${name}`);
      }
    });
  });
  return mounted;
}
