// Routes for the learning feature. Each entry: { path, element, role?, title?, layout?: 'focus', exit?: { href, label } }
import './learning.css';
import DashboardPage from './dashboard-page';
import OnboardingPage from './onboarding-page';
import PathPage from './path-page';
import LessonPlayerPage from './lesson-player-page';
import ProgressPage from './progress-page';
import { InsightsHubPage, KnowledgeMapPage, StatsPage } from './insights-pages';

const routes = [
  { path: '/dashboard', element: DashboardPage, title: 'Bàn làm việc', role: 'learner' },
  { path: '/learn/:courseId/onboarding', element: OnboardingPage, title: 'Thiết lập lộ trình', role: 'learner', layout: 'focus', exit: { href: '/dashboard', label: 'Để sau' } },
  { path: '/learn/:courseId', element: PathPage, title: 'Lộ trình học', role: 'learner' },
  { path: '/learn/:courseId/:lessonId', element: LessonPlayerPage, title: 'Bài học', role: 'learner' },
  { path: '/progress', element: ProgressPage, title: 'Tiến độ & kết quả', role: 'learner' },
  { path: '/insights/stats', element: StatsPage, title: 'Thống kê học tập', role: 'learner' },
  { path: '/insights/knowledge-map', element: KnowledgeMapPage, title: 'Bản đồ kiến thức', role: 'learner' },
  { path: '/insights', element: InsightsHubPage, title: 'Thống kê học tập', role: 'learner' },
];

export default routes;
