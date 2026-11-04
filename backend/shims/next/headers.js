// next/headers on top of the router's request context.
import { currentRequestStore, parseCookieHeader, serializeCookie } from "./request-context.js";

function requireStore(api) {
  const store = currentRequestStore();
  if (!store) throw new Error(`\`${api}\` was called outside a request scope.`);
  return store;
}

export async function headers() {
  return requireStore("headers").request.headers;
}

export async function cookies() {
  const store = requireStore("cookies");
  const jar = parseCookieHeader(store.request.headers.get("cookie"));
  const entry = (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined);
  return {
    get: (name) => entry(typeof name === "string" ? name : name?.name),
    getAll: (name) => (name ? [entry(name)].filter(Boolean) : [...jar].map(([n, value]) => ({ name: n, value }))),
    has: (name) => jar.has(name),
    get size() { return jar.size; },
    set(nameOrOptions, value, options) {
      const opts = typeof nameOrOptions === "object" ? nameOrOptions : { ...options, name: nameOrOptions, value };
      jar.set(opts.name, opts.value);
      store.setCookies.push(serializeCookie(opts.name, opts.value, opts));
      return this;
    },
    delete(nameOrOptions) {
      const opts = typeof nameOrOptions === "object" ? nameOrOptions : { name: nameOrOptions };
      jar.delete(opts.name);
      store.setCookies.push(serializeCookie(opts.name, "", { ...opts, maxAge: 0, expires: new Date(0) }));
      return this;
    },
    toString: () => [...jar].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; "),
  };
}
