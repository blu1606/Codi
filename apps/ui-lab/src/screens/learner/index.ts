import type { Screen } from "../screen-types";
import { ghGithubProfileScreen } from "./gh-github-profile";
import { s08OnboardingScreen } from "./s08-onboarding";
import { s10CourseHomeScreen } from "./s10-course-home";
import { s11LessonPlayerScreen } from "./s11-lesson-player";
import { s11tTutorPageScreen } from "./s11t-tutor-page";
import { s12DashboardScreen } from "./s12-dashboard";
import { s13ProgressScreen } from "./s13-progress";
import { s13cKnowledgeMapScreen } from "./s13c-knowledge-map";
import { s14ReviewFormScreen } from "./s14-review-form";

export const learnerScreens: Screen[] = [
  s12DashboardScreen,
  s08OnboardingScreen,
  s10CourseHomeScreen,
  s11LessonPlayerScreen,
  s11tTutorPageScreen,
  s13ProgressScreen,
  s13cKnowledgeMapScreen,
  s14ReviewFormScreen,
  ghGithubProfileScreen,
];
