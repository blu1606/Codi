// Anonymous visitors read the home page, the catalogue and a course detail. No account needed.
//   k6 run -e BASE_URL=... -e I_UNDERSTAND_TARGET=1 -e COURSE_SLUG=... -e VUS=200 perf/k6/browse.js
import { browseJourney } from "./lib/journey.js";
import { rampStages, thresholds } from "./lib/config.js";
export { handleSummary } from "./lib/summary.js";

const ramp = rampStages({ vus: 200, duration: "3m" });

export const options = {
  scenarios: {
    browse: { executor: "ramping-vus", startVUs: 0, stages: ramp.stages, gracefulRampDown: "30s" },
  },
  thresholds: thresholds(),
};

export default function () {
  browseJourney();
}
