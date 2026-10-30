import type { Screen } from "../screen-types";
import { lecturerCoursesScreen } from "./s21-courses";
import { lecturerHomeScreen } from "./s20-lecturer-home";
import { lecturerCourseEditorScreen } from "./s22-course-editor";
import { lecturerKnowledgeMapScreen } from "./s24-knowledge-map";
import { lecturerPublishScreen } from "./s25-publish";
import { lecturerQuizScreen } from "./s23-quiz-builder";
import { lecturerCodingExerciseScreen } from "./s23b-coding-exercise";
import { lecturerGradingScreen } from "./s26-grading";
import { lecturerSnippetsScreen } from "./s26s-snippets";
import { lecturerQuestionsScreen } from "./s27-questions";
import { lecturerReviewsScreen } from "./s28-reviews";
import { lecturerProgressScreen } from "./s29-progress";
import { lecturerInsightsScreen } from "./s29b-insights";
import { adminPublicationScreen } from "./s32-admin-publication";

export const lecturerScreens: Screen[] = [
  lecturerHomeScreen,
  lecturerCoursesScreen,
  lecturerCourseEditorScreen,
  lecturerKnowledgeMapScreen,
  lecturerPublishScreen,
  lecturerQuizScreen,
  lecturerCodingExerciseScreen,
  lecturerGradingScreen,
  lecturerSnippetsScreen,
  lecturerQuestionsScreen,
  lecturerReviewsScreen,
  lecturerProgressScreen,
  lecturerInsightsScreen,
  adminPublicationScreen,
];
