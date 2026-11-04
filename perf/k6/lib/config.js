// Shared target, guard, ramp and threshold settings for every k6 script.
//
// Required environment:
//   BASE_URL=http://localhost:3001          explicit target, never a default (the local Docker stack, see
//                                           docs/performance-testing.md)
//   I_UNDERSTAND_TARGET=1                   confirms the target has its own database
//
// Optional:
//   VUS, DURATION, RAMP                     load shape (see rampStages)
//   ACCOUNTS_CSV                            learner accounts file (see data/accounts.js)
//   COURSE_SLUG                             course the test accounts are enrolled in
//   ENABLE_WRITES=1                         allow quiz submission (other writes are always on)
//   SUMMARY_DIR                             where handleSummary writes JSON (default perf/k6/results)

const rawBase = (__ENV.BASE_URL || "").trim();

if (!rawBase) {
  throw new Error("BASE_URL is required. Pass it explicitly, e.g. -e BASE_URL=http://localhost:3001");
}
if (__ENV.I_UNDERSTAND_TARGET !== "1") {
  throw new Error(
    "Refusing to run: set I_UNDERSTAND_TARGET=1 to confirm the target is a load-test environment with its own database.",
  );
}
// The production VPS serves real users and shares one machine with its database: never a load-test target.
const PRODUCTION_HOSTS = /(^|\/\/)(codi\.hoangblue\.dev|codi\.ddnsfree\.com|172\.93\.209\.12)(:|\/|$)/i;
if (PRODUCTION_HOSTS.test(rawBase) || (__ENV.PRODUCTION_URL && rawBase.replace(/\/$/, "") === __ENV.PRODUCTION_URL.replace(/\/$/, ""))) {
  throw new Error(`Refusing to load-test production (${rawBase}). Run the local Docker stack instead.`);
}
if (!/^https:\/\//.test(rawBase) && !/^http:\/\/localhost(:\d+)?$/.test(rawBase)) {
  throw new Error("BASE_URL must be https://... (or http://localhost for a local server)");
}

export const BASE_URL = rawBase.replace(/\/$/, "");
export const ENABLE_WRITES = __ENV.ENABLE_WRITES === "1";
// Local targets only: one X-Forwarded-For per VU, as the VPS proxy would send (see lib/http.js).
export const SIMULATE_CLIENT_IPS = __ENV.SIMULATE_CLIENT_IPS === "1";
if (SIMULATE_CLIENT_IPS && !/^http:\/\/localhost(:\d+)?$/.test(BASE_URL)) {
  throw new Error("SIMULATE_CLIENT_IPS=1 is only for a local target (http://localhost:<port>)");
}
export const COURSE_SLUG = __ENV.COURSE_SLUG || "";
export const SUMMARY_DIR = __ENV.SUMMARY_DIR || "perf/k6/results";

// Latency targets from docs/performance-testing.md. Writes are only measured when a script writes.
export const READ_P95_MS = 500;
export const WRITE_P95_MS = 1000;
export const MAX_FAILURE_RATE = 0.01;
export const ABORT_FAILURE_RATE = 0.05;

export function thresholds({ writes = false } = {}) {
  const result = {
    "http_req_duration{type:read}": [`p(95)<${READ_P95_MS}`],
    http_req_failed: [
      `rate<${MAX_FAILURE_RATE}`,
      // Protects the target: stop the run once more than 5% of requests fail.
      { threshold: `rate<${ABORT_FAILURE_RATE}`, abortOnFail: true, delayAbortEval: "30s" },
    ],
    // Any API answer that is not JSON means the target is broken, so the numbers are meaningless.
    api_not_json: [{ threshold: "rate==0", abortOnFail: true }],
    // A journey that throws stops early and makes iterations look fast; fail the run instead.
    checks: ["rate>0.99"],
  };
  if (writes) result["http_req_duration{type:write}"] = [`p(95)<${WRITE_P95_MS}`];
  // Always-true thresholds: they only make k6 keep a latency trend per endpoint, which the summary prints, so a slow
  // run says which endpoint is slow.
  for (const name of ENDPOINTS) result[`http_req_duration{name:${name}}`] = ["max>=0"];
  return result;
}

// Request names used by lib/journey.js and lib/auth.js.
const ENDPOINTS = [
  "POST /api/auth/sign-in/email",
  "GET /",
  "GET /courses",
  "GET /api/courses",
  "GET /api/courses/:slug",
  "GET /api/learn/:courseId/path",
  "GET /api/learn/:courseId/access/:lessonId",
  "GET /api/learn/:courseId/lessons/:lessonId",
  "POST /api/learn/:courseId/lessons/:lessonId (study)",
  "GET /api/learn/:courseId/lessons/:lessonId/assessments/:assessmentId",
  "POST /api/learn/:courseId/lessons/:lessonId/assessments/:assessmentId (quiz-open)",
  "POST /api/learn/:courseId/lessons/:lessonId/assessments/:assessmentId (quiz-answer)",
  "POST /api/learn/:courseId/lessons/:lessonId/assessments/:assessmentId (quiz-submit)",
];

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Ramp to `VUS` over RAMP, hold for DURATION, then ramp down. Defaults are per script.
export function rampStages({ vus, duration }) {
  const target = positiveInt(__ENV.VUS, vus);
  return {
    target,
    stages: [
      { duration: __ENV.RAMP || "2m", target },
      { duration: __ENV.DURATION || duration, target },
      { duration: "30s", target: 0 },
    ],
  };
}
