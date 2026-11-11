// Routes for the lecturer feature (docs/mockup/js/lecturer.js + lecturer-insights.js).
// Importing teach-api installs Codi.teach for the lecturer-ai feature and the insights page.
import './teach-api';
import { TeachHomePage, CourseListPage, CreateCoursePage } from './home-pages';
import { CourseEditorPage } from './course-editor';
import { QuizBuilderPage } from './quiz-builder';
import { GradingPage } from './grading-page';
import { QuestionsPage, ReviewsPage } from './support-pages';
import { ProgressIndexPage, CourseProgressPage } from './progress-pages';
import { SnippetsPage } from './snippets-page';
import { InsightsPage } from './insights-page';
import { WarRoomPage } from './war-room-page';

const role = 'lecturer';
const routes = [
  { path: '/teach', element: TeachHomePage, title: 'Giảng dạy', role },
  { path: '/teach/courses', element: CourseListPage, title: 'Khoá học của tôi', role },
  { path: '/teach/new', element: CreateCoursePage, title: 'Tạo khoá học', role },
  { path: '/teach/courses/:courseId', element: CourseEditorPage, title: 'Soạn khoá học', role },
  { path: '/teach/courses/:courseId/:tab', element: CourseEditorPage, title: 'Soạn khoá học', role },
  { path: '/teach/courses/:courseId/quiz/:lessonId', element: QuizBuilderPage, title: 'Soạn quiz', role },
  { path: '/teach/courses/:courseId/warroom/:lessonId', element: WarRoomPage, title: 'Hội đồng AI', role },
  { path: '/teach/grading', element: GradingPage, title: 'Chấm bài', role },
  { path: '/teach/grading/:submissionId', element: GradingPage, title: 'Chấm bài', role },
  { path: '/teach/questions', element: QuestionsPage, title: 'Hỏi đáp', role },
  { path: '/teach/reviews', element: ReviewsPage, title: 'Đánh giá', role },
  { path: '/teach/progress', element: ProgressIndexPage, title: 'Tiến độ học viên', role },
  { path: '/teach/progress/:courseId', element: CourseProgressPage, title: 'Tiến độ học viên', role },
  { path: '/teach/snippets', element: SnippetsPage, title: 'Mẫu nhận xét', role },
  { path: '/teach/insights', element: InsightsPage, title: 'Doanh thu khoá học', role },
];

export default routes;
