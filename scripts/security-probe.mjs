#!/usr/bin/env node
// Black-box security probe for a running Codi rebuild.
//
//   node scripts/security-probe.mjs http://localhost:3001          passive + active checks (local Docker image)
//   node scripts/security-probe.mjs https://codi.hoangblue.dev     passive checks only (production)
//
// Passive checks send anonymous requests only: security headers, secret files, error leakage, Origin and CORS
// rules, guest access to protected APIs, and whether the demo payment simulator is enabled.
// Active checks sign in the seeded demo accounts (docs/getting-started.md) and trip the sign-in rate limit, so they
// never run against production: role checks on the API, cross-account order access (IDOR), banned accounts,
// session cookie flags, sign-out, and brute-force throttling (also with a spoofed X-Forwarded-For).
//
// Result per check: PASS, WARN (a hardening gap or a deliberate setting to confirm), FAIL (a defect), SKIP.
// Exits 1 when any check fails.

const base = (process.argv[2] || "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("usage: node scripts/security-probe.mjs <base-url>");
  process.exit(2);
}
const PRODUCTION = /codi\.hoangblue\.dev|codi\.ddnsfree\.com|172\.93\.209\.12/i.test(base);
const PASSWORD = process.env.SEED_ACCOUNT_PASSWORD || "Codi@12345";
const ACCOUNTS = {
  learner: process.env.E2E_LEARNER_EMAIL || "minhanh@codi.vn",
  otherLearner: process.env.E2E_OTHER_LEARNER_EMAIL || "minhvu@codi.vn",
  lecturer: process.env.E2E_LECTURER_EMAIL || "quochuy@codi.vn",
  banned: process.env.E2E_BANNED_EMAIL || "kimoanh@codi.vn",
};
const EVIL = "https://evil.example";

const results = [];
const report = (status, name, detail = "") => {
  results.push({ status, name });
  console.log(`  ${status.padEnd(5)} ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const looksLikeStack = (text) => /\n\s+at\s|\.tsx?:\d+|node_modules|ECONNREFUSED|syntax error at/i.test(text);

async function http(path, { method = "GET", body, cookie, origin, headers = {}, raw } = {}) {
  const h = { accept: "application/json", ...headers };
  if (cookie) h.cookie = cookie;
  if (origin !== undefined) h.origin = origin;
  if (body !== undefined || raw !== undefined) h["content-type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers: h,
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, headers: res.headers, text, json };
}

async function signIn(email, password = PASSWORD) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await http("/api/auth/sign-in/email", { method: "POST", origin: base, body: { email, password } });
    if (res.status === 429) { await sleep((Number(res.headers.get("x-retry-after")) || 10) * 1000 + 500); continue; }
    const cookies = res.headers.getSetCookie?.() ?? [];
    return { ...res, cookies, cookie: cookies.map((c) => c.split(";")[0]).join("; ") };
  }
  throw new Error(`sign-in for ${email} stayed rate-limited`);
}

async function passive() {
  console.log("passive checks");

  const home = await http("/", { headers: { accept: "text/html" } });
  const header = (name) => home.headers.get(name);
  const csp = header("content-security-policy") || "";
  for (const [name, ok] of [
    ["X-Content-Type-Options: nosniff", /nosniff/i.test(header("x-content-type-options") || "")],
    ["clickjacking protection (X-Frame-Options or CSP frame-ancestors)", !!header("x-frame-options") || /frame-ancestors/i.test(csp)],
    ["Referrer-Policy", !!header("referrer-policy")],
    ["Content-Security-Policy", !!csp],
  ]) report(ok ? "PASS" : "WARN", `header ${name}`, ok ? "" : "missing");
  if (base.startsWith("https://")) {
    const hsts = header("strict-transport-security");
    report(hsts ? "PASS" : "WARN", "header Strict-Transport-Security", hsts || "missing");
  }
  const powered = header("x-powered-by") || header("server");
  report(powered && /\d/.test(powered) ? "WARN" : "PASS", "no versioned Server/X-Powered-By header", powered || "");

  for (const path of ["/.env", "/backend/.env", "/.git/config", "/rebuild.env", "/package.json", "/backend/src/env.ts"]) {
    const res = await http(path);
    const leaked = /DATABASE_URL|BETTER_AUTH_SECRET|POSTGRES_PASSWORD|\[core\]|"workspaces"|process\.env/.test(res.text);
    report(leaked ? "FAIL" : "PASS", `${path} is not served`, leaked ? `HTTP ${res.status} with file contents` : "");
  }

  const missing = await http("/api/security-probe-missing");
  report(missing.status === 404 && missing.json && !looksLikeStack(missing.text) ? "PASS" : "FAIL",
    "unknown API path answers a JSON 404 without internals", `HTTP ${missing.status}`);

  const malformed = await http("/api/auth/sign-in/email", { method: "POST", origin: base, raw: "{not json" });
  report(malformed.status < 500 && !looksLikeStack(malformed.text) ? "PASS" : "FAIL",
    "malformed JSON is rejected without a stack trace", `HTTP ${malformed.status}`);

  for (const q of ["/api/courses?search=%27%20OR%201%3D1--&limit=1", "/api/courses/%27%20OR%20%271%27%3D%271", "/api/courses?limit=-1"]) {
    const res = await http(q);
    report(res.status < 500 && !looksLikeStack(res.text) ? "PASS" : "FAIL", `injection-shaped input handled: ${decodeURIComponent(q)}`, `HTTP ${res.status}`);
  }

  // A 429 only says the sign-in limit was reached (e.g. by an e2e run just before), not how a foreign Origin is
  // treated: wait out the window and ask again.
  let crossSignIn;
  for (let attempt = 0; attempt < 4; attempt++) {
    crossSignIn = await http("/api/auth/sign-in/email", { method: "POST", origin: EVIL, body: { email: "probe@codi.test", password: "x".repeat(12) } });
    if (crossSignIn.status !== 429) break;
    await sleep((Number(crossSignIn.headers.get("x-retry-after")) || 10) * 1000 + 500);
  }
  report(crossSignIn.status === 403 ? "PASS" : "FAIL", "sign-in from a foreign Origin is refused", `HTTP ${crossSignIn.status}`);

  const cors = await http("/api/courses?limit=1", { origin: EVIL });
  const allowOrigin = cors.headers.get("access-control-allow-origin");
  const corsBad = allowOrigin === EVIL || (allowOrigin === "*" && cors.headers.get("access-control-allow-credentials") === "true");
  report(corsBad ? "FAIL" : "PASS", "CORS does not grant a foreign Origin", allowOrigin ? `allow-origin ${allowOrigin}` : "");

  for (const path of ["/api/learner/overview", "/api/student/cart", "/api/student/profile", "/api/notifications", "/api/admin/users", "/api/admin/finance/overview", "/api/admin/insights/overview", "/api/orders/1"]) {
    const res = await http(path);
    report([401, 403].includes(res.status) ? "PASS" : "FAIL", `guest is refused ${path}`, `HTTP ${res.status}`);
  }

  const simulate = await http("/api/dev/simulate-payment", { method: "POST", origin: base, body: { orderCode: "CODI00000", outcome: "paid" } });
  if (simulate.status === 404) report("PASS", "demo payment simulator is disabled");
  else report("WARN", "demo payment simulator is enabled (DEMO_TOOLS=true)",
    `HTTP ${simulate.status}; any signed-in buyer can mark their own orders paid`);
}

async function active() {
  console.log("active checks (seeded demo accounts)");

  const learner = await signIn(ACCOUNTS.learner);
  if (learner.status !== 200) {
    report("SKIP", "active checks", `cannot sign in ${ACCOUNTS.learner} (HTTP ${learner.status}); is the database seeded?`);
    return;
  }
  const session = learner.cookies.find((c) => /session_token/i.test(c)) || "";
  report(/httponly/i.test(session) ? "PASS" : "FAIL", "session cookie is HttpOnly");
  report(/samesite=(lax|strict)/i.test(session) ? "PASS" : "FAIL", "session cookie is SameSite=Lax or Strict");
  if (base.startsWith("https://")) report(/;\s*secure/i.test(session) ? "PASS" : "FAIL", "session cookie is Secure");

  for (const path of ["/api/admin/users", "/api/admin/finance/overview", "/api/admin/insights/overview", "/api/admin/vouchers"]) {
    const res = await http(path, { cookie: learner.cookie });
    report([401, 403].includes(res.status) ? "PASS" : "FAIL", `learner is refused ${path}`, `HTTP ${res.status}`);
  }

  const lecturer = await signIn(ACCOUNTS.lecturer);
  const adminAsLecturer = await http("/api/admin/users", { cookie: lecturer.cookie });
  report([401, 403].includes(adminAsLecturer.status) ? "PASS" : "FAIL", "lecturer is refused /api/admin/users", `HTTP ${adminAsLecturer.status}`);

  // Cross-account access: orders the first learner can read must stay invisible to the second learner.
  const owned = [];
  for (let id = 1; id <= 40; id++) {
    const res = await http(`/api/orders/${id}`, { cookie: learner.cookie });
    if (res.status === 200) owned.push(id);
  }
  if (owned.length === 0) {
    report("SKIP", "order IDOR", `${ACCOUNTS.learner} has no readable order with id 1-40`);
  } else {
    const other = await signIn(ACCOUNTS.otherLearner);
    const leaked = [];
    for (const id of owned) {
      const res = await http(`/api/orders/${id}`, { cookie: other.cookie });
      if (res.status === 200) leaked.push(id);
    }
    report(leaked.length === 0 ? "PASS" : "FAIL", "a learner cannot read another learner's orders",
      leaked.length ? `orders ${leaked.join(", ")} readable` : `${owned.length} orders checked`);
  }

  const banned = await signIn(ACCOUNTS.banned);
  report(banned.status !== 200 ? "PASS" : "FAIL", "a disabled account cannot sign in", `HTTP ${banned.status}`);

  const signOut = await http("/api/auth/sign-out", { method: "POST", origin: base, cookie: learner.cookie, body: {} });
  const afterSignOut = await http("/api/learner/overview", { cookie: learner.cookie });
  report(signOut.status === 200 && afterSignOut.status === 401 ? "PASS" : "FAIL", "sign-out invalidates the session",
    `sign-out ${signOut.status}, then ${afterSignOut.status}`);

  // Brute force last: it rate-limits this machine's IP for the next window.
  const statuses = [];
  for (let i = 0; i < 8; i++) {
    const res = await http("/api/auth/sign-in/email", { method: "POST", origin: base, body: { email: "probe+brute@codi.test", password: `wrong-${i}-password` } });
    statuses.push(res.status);
  }
  const throttled = statuses.includes(429);
  report(throttled ? "PASS" : "FAIL", "repeated wrong sign-ins are throttled (429)", statuses.join(" "));
  if (throttled) {
    const spoofed = await http("/api/auth/sign-in/email", {
      method: "POST", origin: base, headers: { "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250) + 1}` },
      body: { email: "probe+brute@codi.test", password: "wrong-spoofed-password" },
    });
    report(spoofed.status === 429 ? "PASS" : "WARN", "a spoofed X-Forwarded-For does not reset the throttle",
      spoofed.status === 429 ? "" : `HTTP ${spoofed.status}: the app trusts the header; safe only behind a proxy that overwrites it (Caddy does by default)`);
  }
}

console.log(`security probe ${base}${PRODUCTION ? " (production: passive checks only)" : ""}`);
try {
  await passive();
  if (PRODUCTION) report("SKIP", "active checks", "never run against production");
  else await active();
} catch (error) {
  report("FAIL", "probe aborted", error.message);
}
const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\n${count("PASS")} pass, ${count("WARN")} warn, ${count("FAIL")} fail, ${count("SKIP")} skip`);
process.exit(count("FAIL") > 0 ? 1 : 0);
