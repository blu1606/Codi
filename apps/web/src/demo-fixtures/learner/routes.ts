import type { FixtureRoute } from "../fixture-route";
import { learnerOverviewDefault } from "./s12-dashboard";
import { onboardingReady } from "./s08-onboarding";
import { knowledgeMapDefault } from "./s13c-knowledge-map";
import { tutorialAtStep } from "./s11-tutorial";
import { tutorAnswered, tutorThreadsDefault } from "./s11-tutor";

/** GET endpoints of this area answered from demo data. */
export const learnerRoutes: FixtureRoute[] = [
  { path: "/api/learner/overview", body: () => learnerOverviewDefault },
  { path: /^\/api\/learn\/[^/]+\/onboarding$/, body: () => onboardingReady },
  { path: "/api/insights/knowledge-map", body: () => knowledgeMapDefault },
  { path: /^\/api\/learn\/[^/]+\/lessons\/[^/]+\/assessments\/\d+\/tutorial$/, body: () => tutorialAtStep(0) },
  // Tutor reads (S11a / S11t): the thread of a lesson and the learner's threads in the course.
  { path: /^\/api\/learn\/[^/]+\/lessons\/[^/]+\/tutor$/, body: () => tutorAnswered },
  { path: /^\/api\/learn\/[^/]+\/tutor\/threads$/, body: () => ({ threads: tutorThreadsDefault }) },
];
