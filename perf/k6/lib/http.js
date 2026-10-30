// Tagged HTTP helpers. Every request carries type:read|write|auth and a stable name, so the
// summary and thresholds group dynamic URLs (slugs, ids) under one label.
import http from "k6/http";
import { Rate } from "k6/metrics";
import { BASE_URL } from "./config.js";

// Routes that must never be called from load tests: AI generation (quota and cost), GitHub
// profile analysis, payments and order flows, and tutor/discussion threads.
const EXCLUDED = [
  /^\/api\/ai\//,
  /^\/api\/github-profile/,
  /^\/api\/payments\//,
  /^\/api\/orders\//,
  /^\/api\/learn\/[^/]+\/lessons\/[^/]+\/conversations/,
  /^\/api\/learn\/[^/]+\/lessons\/[^/]+\/discussions/,
  /\/tutorial$/,
];

function assertAllowed(path) {
  if (EXCLUDED.some((pattern) => pattern.test(path))) {
    throw new Error(`refusing to call an excluded route from a load test: ${path}`);
  }
}

// An API answering HTML (a failed deployment, an error page) would otherwise pass status checks.
const apiNotJson = new Rate("api_not_json");

// `path` is relative to BASE_URL; `name` is the metric label (defaults to the path).
export function call(method, path, { type, name, body, origin = false, headers = {}, expected } = {}) {
  assertAllowed(path);
  const allHeaders = { Accept: "application/json", ...headers };
  if (body !== undefined) allHeaders["Content-Type"] = "application/json";
  // Mutating routes check that Origin matches the site origin.
  if (origin) allHeaders.Origin = BASE_URL;
  const payload = body === undefined ? null : JSON.stringify(body);
  const res = http.request(method, `${BASE_URL}${path}`, payload, {
    headers: allHeaders,
    tags: { type, name: name || `${method} ${path}` },
    // Statuses a step expects (e.g. 409 before onboarding) do not count as failed requests.
    ...(expected ? { responseCallback: http.expectedStatuses(...expected) } : {}),
  });
  // A throttled sign-in answers in plain text; it is retried, not a broken target.
  if (path.startsWith("/api/") && res.status !== 429) {
    apiNotJson.add(!String(res.headers["Content-Type"] || "").includes("application/json"));
  }
  return res;
}

export function read(path, name, expected) {
  return call("GET", path, { type: "read", name, expected });
}

export function write(method, path, body, name, expected) {
  return call(method, path, { type: "write", name, body, origin: true, expected });
}
