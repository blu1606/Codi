// Routes for the lecturer-ai feature. Each entry: { path, element, role?, title?, layout?: 'focus', exit?: { href, label } }
// Importing the api modules installs Codi.lecturerAI (incl. openCreate, quizReview, kmap and grading helpers) and
// Codi.teachCode at startup.
import './lecturer-ai-api';
import './lecturer-ai-create';
import './teach-code-api';
import { CodeEditorPage, CodePreviewPage } from './code-editor-page';

const routes = [
  { path: '/teach/courses/:courseId/code/:lessonId', element: CodeEditorPage, title: 'Soạn bài code', role: 'lecturer' },
  { path: '/teach/courses/:courseId/code/:lessonId/preview', element: CodePreviewPage, title: 'Xem bài code như học viên', role: 'lecturer' },
];

export default routes;
