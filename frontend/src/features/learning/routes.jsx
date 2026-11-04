// Routes for the learning feature. Each entry: { path, element, role?, title?, layout?: 'focus', exit?: { href, label } }
import './learning.css';
import DashboardPage from './dashboard-page';
import OnboardingPage from './onboarding-page';
import PathPage from './path-page';
import PathUpdatePage from './path-update-page';
import LessonPlayerPage from './lesson-player-page';
import ProgressPage from './progress-page';
import { InsightsRedirect } from './insights-pages';

// Old "Thống kê" URLs open the matching tab of "Kết quả học tập".
const StatsRedirect = (props) => <InsightsRedirect {...props} tab="stats" />;
const MapRedirect = (props) => <InsightsRedirect {...props} tab="map" />;

const routes = [
  { path: '/dashboard', element: DashboardPage, title: 'Trang chủ', role: 'learner' },
  { path: '/learn/:courseId/onboarding', element: OnboardingPage, title: 'Thiết lập lộ trình', role: 'learner', layout: 'focus', exit: { href: '/dashboard', label: 'Để sau' } },
  { path: '/learn/:courseId', element: PathPage, title: 'Lộ trình học', role: 'learner' },
  { path: '/learn/:courseId/path-update', element: PathUpdatePage, title: 'Cập nhật lộ trình', role: 'learner' },
  { path: '/learn/:courseId/:lessonId', element: LessonPlayerPage, title: 'Bài học', role: 'learner' },
  { path: '/progress', element: ProgressPage, title: 'Kết quả học tập', role: 'learner' },
  { path: '/insights/stats', element: StatsRedirect, title: 'Kết quả học tập', role: 'learner' },
  { path: '/insights/knowledge-map', element: MapRedirect, title: 'Kết quả học tập', role: 'learner' },
  { path: '/insights', element: StatsRedirect, title: 'Kết quả học tập', role: 'learner' },
];

export default routes;
