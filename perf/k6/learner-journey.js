// Signed-in learners run the journey at a steady load. Defaults: ramp to 50 VUs over 2 min, hold 3 min.
//   k6 run -e BASE_URL=... -e I_UNDERSTAND_TARGET=1 -e ACCOUNTS_CSV=... -e COURSE_SLUG=... perf/k6/learner-journey.js
//   Optional: -e VUS=100 -e DURATION=5m -e ENABLE_WRITES=1 (adds quiz submission)
import { learnerJourney } from "./lib/journey.js";
import { rampStages, thresholds } from "./lib/config.js";
export { handleSummary } from "./lib/summary.js";

const ramp = rampStages({ vus: 50, duration: "3m" });

export const options = {
  // Keep each VU's session cookie across iterations (see lib/auth.js).
  noCookiesReset: true,
  scenarios: {
    learners: { executor: "ramping-vus", startVUs: 0, stages: ramp.stages, gracefulRampDown: "30s" },
  },
  thresholds: thresholds({ writes: true }),
};

export default function () {
  learnerJourney({ writes: true });
}
