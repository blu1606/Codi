// Stress: adds 25 learners every minute until VUS (default 300). The run aborts itself once more
// than 5% of requests fail, so the last stage that held is the measured capacity.
//   k6 run -e BASE_URL=... -e I_UNDERSTAND_TARGET=1 -e ACCOUNTS_CSV=... -e COURSE_SLUG=... perf/k6/stress.js
import { learnerJourney } from "./lib/journey.js";
import { thresholds } from "./lib/config.js";
export { handleSummary } from "./lib/summary.js";

const MAX_VUS = Number.parseInt(__ENV.VUS || "300", 10);
const STEP = 25;

const stages = [];
for (let target = STEP; target <= MAX_VUS; target += STEP) {
  stages.push({ duration: "1m", target });
}
stages.push({ duration: "1m", target: 0 });

export const options = {
  // Keep each VU's session cookie across iterations (see lib/auth.js).
  noCookiesReset: true,
  scenarios: {
    stress: { executor: "ramping-vus", startVUs: 0, stages, gracefulRampDown: "30s" },
  },
  thresholds: thresholds({ writes: true }),
};

export default function () {
  learnerJourney({ writes: true });
}
