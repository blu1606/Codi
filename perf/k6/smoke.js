// One virtual user runs the full learner journey once. Run this before any load test.
//   k6 run -e BASE_URL=... -e I_UNDERSTAND_TARGET=1 -e ACCOUNTS_CSV=... -e COURSE_SLUG=... perf/k6/smoke.js
import { learnerJourney } from "./lib/journey.js";
import { thresholds } from "./lib/config.js";
export { handleSummary } from "./lib/summary.js";

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: thresholds({ writes: true }),
};

export default function () {
  learnerJourney({ writes: true, thinkTime: 0 });
}
