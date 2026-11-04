// Capacity test: an open model (arrival rate) with the real traffic mix, so the server's own slowness cannot lower
// the load the way a fixed number of VUs does. One run measures two things:
//   1. load:  ramp to LOAD_RPS requests/s and hold it (the expected peak, see docs/performance-testing.md);
//   2. steps: raise the rate step by step (STEPS) until the server breaks; the last step that keeps p95 under
//      500 ms and failures under 1% is the measured capacity.
// Traffic mix by requests: 70% anonymous browsing, 30% signed-in learners studying a lesson.
//
//   k6 run -e BASE_URL=... -e I_UNDERSTAND_TARGET=1 -e ACCOUNTS_CSV=... -e COURSE_SLUG=... perf/k6/capacity.js
//
// Sign-in is rate-limited per IP (3 per 10 s) and every request of a run comes from one machine, so setup() signs the
// accounts in one by one and each learner VU reuses one session instead of signing in under load.
import http from "k6/http";
import exec from "k6/execution";
import { sleep } from "k6";
import { BASE_URL, SIMULATE_CLIENT_IPS, thresholds } from "./lib/config.js";
import { browseJourney, learnerJourney } from "./lib/journey.js";
import { useExistingSession } from "./lib/auth.js";
import { allAccounts } from "./data/accounts.js";
import { handleSummary as baseSummary } from "./lib/summary.js";

const LOAD_RPS = Number(__ENV.LOAD_RPS || 130);
const LOAD_HOLD_S = Number(__ENV.LOAD_HOLD_S || 300);
const STEPS = (__ENV.STEPS || "200,300,400,500,650,800").split(",").map(Number);
const STEP_HOLD_S = Number(__ENV.STEP_HOLD_S || 60);
const LEARNER_VUS = Number(__ENV.LEARNER_VUS || 120);

// Requests per iteration: browse = home, /courses, catalogue, course detail; learner = catalogue, course detail,
// path, access, lesson, save progress.
const BROWSE_REQS = 4;
const LEARNER_REQS = 6;
const BROWSE_SHARE = 0.7;
// Iterations per 10 s for a total request rate (arrival-rate targets are whole numbers per time unit).
const browseRate = (rps) => Math.round(((rps * BROWSE_SHARE) / BROWSE_REQS) * 10);
const learnerRate = (rps) => Math.round(((rps * (1 - BROWSE_SHARE)) / LEARNER_REQS) * 10);

// The schedule, phase by phase. Each phase tags its requests, so the summary reports every load level separately.
const PHASES = [
  { label: "ramp", seconds: 60, rps: LOAD_RPS },
  { label: `load-${LOAD_RPS}`, seconds: LOAD_HOLD_S, rps: LOAD_RPS },
  ...STEPS.flatMap((rps) => [
    { label: `ramp-${rps}`, seconds: 10, rps },
    { label: `step-${rps}`, seconds: STEP_HOLD_S, rps },
  ]),
  { label: "cooldown", seconds: 20, rps: 0 },
];
const stagesFor = (rate) => PHASES.map((p) => ({ duration: `${p.seconds}s`, target: rate(p.rps) }));

function phaseAt(elapsedMs) {
  let end = 0;
  for (const phase of PHASES) {
    end += phase.seconds * 1000;
    if (elapsedMs < end) return phase.label;
  }
  return "cooldown";
}

const phaseThresholds = {};
for (const { label } of PHASES) {
  // Always-true thresholds: they only make k6 keep per-phase metrics for the summary.
  phaseThresholds[`http_req_duration{phase:${label}}`] = ["max>=0"];
  phaseThresholds[`http_req_failed{phase:${label}}`] = ["rate>=0"];
  phaseThresholds[`http_reqs{phase:${label}}`] = ["count>=0"];
}

const shared = { executor: "ramping-arrival-rate", startRate: 0, timeUnit: "10s" };
export const options = {
  noCookiesReset: true,
  setupTimeout: "15m",
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
  scenarios: {
    browse: { ...shared, exec: "browse", stages: stagesFor(browseRate), preAllocatedVUs: 50, maxVUs: 400 },
    learn: {
      ...shared,
      exec: "learn",
      stages: stagesFor(learnerRate),
      preAllocatedVUs: Math.min(40, LEARNER_VUS),
      maxVUs: LEARNER_VUS,
    },
  },
  thresholds: {
    ...thresholds({ writes: true }),
    // Safety stop for the target: a server answering slower than 5 s at p95 is past the point worth measuring.
    http_req_duration: [{ threshold: "p(95)<5000", abortOnFail: true, delayAbortEval: "60s" }],
    ...phaseThresholds,
  },
};

// Signs in LEARNER_VUS accounts one by one, waiting out the sign-in rate limit, and returns their cookies.
export function setup() {
  const accounts = allAccounts().slice(0, LEARNER_VUS);
  if (accounts.length < LEARNER_VUS) {
    throw new Error(`ACCOUNTS_CSV has ${accounts.length} accounts; LEARNER_VUS=${LEARNER_VUS} needs one each`);
  }
  const sessions = [];
  for (const [i, account] of accounts.entries()) {
    const jar = new http.CookieJar();
    const headers = { "Content-Type": "application/json", Origin: BASE_URL };
    // Local targets have no proxy: give each account its own address, as the VPS proxy would (see lib/http.js).
    if (SIMULATE_CLIENT_IPS) headers["X-Forwarded-For"] = `10.78.${Math.floor(i / 250)}.${(i % 250) + 1}`;
    for (let attempt = 1; attempt <= 30; attempt++) {
      const res = http.post(`${BASE_URL}/api/auth/sign-in/email`, JSON.stringify(account), {
        headers,
        jar,
        tags: { name: "setup sign-in", phase: "setup" },
        responseCallback: http.expectedStatuses(200, 429),
      });
      if (res.status === 200) break;
      if (res.status !== 429) throw new Error(`sign-in failed for ${account.email}: HTTP ${res.status}`);
      sleep(Number(res.headers["X-Retry-After"] || 10) + 0.5);
    }
    const cookies = jar.cookiesForURL(BASE_URL);
    if (Object.keys(cookies).length === 0) throw new Error(`no session cookie for ${account.email}`);
    sessions.push(cookies);
  }
  return { sessions, startedAt: Date.now() };
}

function tagPhase(data) {
  exec.vu.metrics.tags.phase = phaseAt(Date.now() - exec.scenario.startTime);
}

export function browse(data) {
  tagPhase(data);
  browseJourney({ thinkTime: 0 });
}

let sessionSet = false;
export function learn(data) {
  tagPhase(data);
  if (!sessionSet) {
    // One account per learner VU (maxVUs = LEARNER_VUS), so two VUs never write the same account's progress.
    const cookies = data.sessions[(exec.vu.idInTest - 1) % data.sessions.length];
    const jar = http.cookieJar();
    for (const [name, values] of Object.entries(cookies)) jar.set(BASE_URL, name, values[0], { secure: true });
    useExistingSession();
    sessionSet = true;
  }
  learnerJourney({ writes: false, thinkTime: 0 });
}

// Per-phase table: offered rate, achieved rate, p95/p99 and failures. Also written to capacity.json for the charts.
export function handleSummary(data) {
  const base = baseSummary(data);
  const m = data.metrics;
  // A run that aborts ends inside a phase: rate that phase over the seconds it actually ran.
  const elapsed = data.setup_data?.startedAt ? (Date.now() - data.setup_data.startedAt) / 1000 : Infinity;
  let phaseStart = 0;
  const ran = new Map(PHASES.map((p) => {
    const seconds = Math.max(0, Math.min(p.seconds, elapsed - phaseStart));
    phaseStart += p.seconds;
    return [p.label, seconds];
  }));
  const rows = PHASES.filter((p) => p.label !== "cooldown" && !p.label.startsWith("ramp")).map((p) => {
    const d = m[`http_req_duration{phase:${p.label}}`]?.values ?? {};
    const f = m[`http_req_failed{phase:${p.label}}`]?.values ?? {};
    const n = m[`http_reqs{phase:${p.label}}`]?.values?.count ?? 0;
    return {
      phase: p.label,
      offeredRps: p.rps,
      seconds: ran.get(p.label),
      achievedRps: ran.get(p.label) > 0 ? n / ran.get(p.label) : 0,
      requests: n,
      p50: d.med,
      p95: d["p(95)"],
      p99: d["p(99)"],
      failedRate: f.rate,
    };
  }).filter((r) => r.requests > 0);
  const fmt = (v, digits = 0) => (typeof v === "number" ? v.toFixed(digits) : "n/a");
  const table = [
    "capacity by phase:",
    "  phase        offered  achieved   p50    p95    p99   failed",
    ...rows.map(
      (r) =>
        `  ${r.phase.padEnd(11)} ${fmt(r.offeredRps).padStart(7)} ${fmt(r.achievedRps, 1).padStart(9)} ${fmt(r.p50).padStart(5)} ${fmt(r.p95).padStart(6)} ${fmt(r.p99).padStart(6)}  ${fmt((r.failedRate ?? 0) * 100, 2)} %`,
    ),
    `  dropped iterations (server too slow for the offered rate): ${m.dropped_iterations?.values?.count ?? 0}`,
    "",
  ].join("\n");
  const dir = __ENV.SUMMARY_DIR || "perf/k6/results";
  return {
    ...base,
    stdout: `${base.stdout}\n${table}`,
    [`${dir}/capacity.json`]: JSON.stringify(
      {
        target: BASE_URL,
        loadRps: LOAD_RPS,
        // When the scenarios started (end of setup) and the schedule, so the server stats can be lined up.
        loadStartedAt: data.setup_data?.startedAt,
        loadEndedAt: Date.now(),
        phases: PHASES,
        rows,
        dropped: m.dropped_iterations?.values?.count ?? 0,
      },
      null,
      2,
    ),
  };
}
