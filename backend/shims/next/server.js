// next/server: the parts Codi's route handlers use (NextRequest.nextUrl, NextResponse.json/redirect/next, after).
import { parseCookieHeader } from "./request-context.js";

export class NextRequest extends Request {
  constructor(input, init) {
    super(input, init);
    Object.defineProperty(this, "nextUrl", { value: new URL(this.url), enumerable: true });
    const jar = parseCookieHeader(this.headers.get("cookie"));
    Object.defineProperty(this, "cookies", {
      value: {
        get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        has: (name) => jar.has(name),
      },
    });
  }
}

export class NextResponse extends Response {
  static json(body, init = {}) {
    const headers = new Headers(init.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new NextResponse(JSON.stringify(body), { ...init, headers });
  }

  static redirect(url, init = 307) {
    const status = typeof init === "number" ? init : init.status ?? 307;
    const headers = new Headers(typeof init === "number" ? undefined : init.headers);
    headers.set("location", String(url));
    return new NextResponse(null, { status, headers });
  }

  static next(init = {}) {
    const headers = new Headers(init.headers);
    headers.set("x-middleware-next", "1");
    return new NextResponse(null, { ...init, headers });
  }
}

/** Runs work after the response is sent; errors are logged, never thrown into the request. */
export function after(task) {
  setImmediate(() => {
    Promise.resolve()
      .then(() => (typeof task === "function" ? task() : task))
      .catch((error) => console.error("[next/server after] background task failed", error));
  });
}
