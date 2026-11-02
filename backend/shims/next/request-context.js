// Per-request store shared by next/headers and the Hono router. The router runs every route handler and
// server action inside runWithRequest(); headers()/cookies() read the active request from here and
// cookies().set() records Set-Cookie values that the router appends to the outgoing response.
import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();

export function runWithRequest(request, fn) {
  return storage.run({ request, setCookies: [] }, fn);
}

export function currentRequestStore() {
  return storage.getStore();
}

/** Copies the response (its headers may be immutable) and appends the Set-Cookie values recorded during the request. */
export function applyResponseCookies(response, store = storage.getStore()) {
  if (!store || store.setCookies.length === 0) return response;
  const copy = new Response(response.body, response);
  for (const value of store.setCookies) copy.headers.append("set-cookie", value);
  return copy;
}

export function parseCookieHeader(header) {
  const jar = new Map();
  if (!header) return jar;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    const raw = part.slice(eq + 1).trim();
    let value = raw;
    try { value = decodeURIComponent(raw); } catch { /* keep the raw value */ }
    if (name && !jar.has(name)) jar.set(name, value);
  }
  return jar;
}

export function serializeCookie(name, value, options = {}) {
  let out = `${name}=${encodeURIComponent(value ?? "")}`;
  if (options.maxAge !== undefined) out += `; Max-Age=${Math.floor(Number(options.maxAge))}`;
  if (options.expires) out += `; Expires=${new Date(options.expires).toUTCString()}`;
  out += `; Path=${options.path || "/"}`;
  if (options.domain) out += `; Domain=${options.domain}`;
  if (options.httpOnly) out += "; HttpOnly";
  if (options.secure) out += "; Secure";
  if (options.partitioned) out += "; Partitioned";
  if (options.sameSite) {
    const s = String(options.sameSite === true ? "strict" : options.sameSite).toLowerCase();
    out += `; SameSite=${s.charAt(0).toUpperCase()}${s.slice(1)}`;
  }
  return out;
}
