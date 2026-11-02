// Routes for the coding feature. Each entry: { path, element, role?, title?, layout?: 'focus', exit?: { href, label } }
// Importing code-api and tutor-api installs the shared namespaces Codi.code and Codi.tutor + Codi.aiFeedbackRow.
// The static /learn/:courseId/tutor segment outranks the lesson player's /learn/:courseId/:lessonId.
import './code-api';
import './tutor-api';
import TutorPage from './tutor-page';

const courseHome = () => `/learn/${window.location.pathname.split('/')[2] || ''}`;

const routes = [
  { path: '/learn/:courseId/tutor', element: TutorPage, role: 'learner', title: 'Tutor', layout: 'focus', exit: { href: courseHome, label: 'Đóng Tutor' } },
];

export default routes;
