import type { FixtureRoute } from "../fixture-route";
import { learnerOverviewDefault } from "./s12-dashboard";
import { onboardingReady } from "./s08-onboarding";
import { knowledgeMapDefault } from "./s13c-knowledge-map";
import { tutorialAtStep } from "./s11-tutorial";
import { tutorChatDetails, tutorChats, tutorLessonMeta } from "./s11-tutor";

/** GET endpoints of this area answered from demo data. */
export const learnerRoutes: FixtureRoute[] = [
  { path: "/api/learner/overview", body: () => learnerOverviewDefault },
  { path: /^\/api\/learn\/[^/]+\/onboarding$/, body: () => onboardingReady },
  { path: "/api/insights/knowledge-map", body: () => knowledgeMapDefault },
  { path: /^\/api\/learn\/[^/]+\/lessons\/[^/]+\/assessments\/\d+\/tutorial$/, body: () => tutorialAtStep(0) },
  // Shared Tutor reads: the history, one chat, and the lesson meta of a new lesson chat.
  { path: "/api/ai/chats", body: () => ({ chats: tutorChats }) },
  {
    path: /^\/api\/ai\/chats\/[^/]+$/,
    body: (url) => tutorChatDetails[url.pathname.split("/").pop() ?? ""] ?? Object.values(tutorChatDetails)[0],
  },
  { path: "/api/ai/lesson", body: () => tutorLessonMeta() },
];
