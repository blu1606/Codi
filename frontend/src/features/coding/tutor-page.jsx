/**
 * '/learn/:courseId/tutor': the Tutor has one full page for every screen (Codi develop's
 * app/learn/[courseId]/tutor/page.tsx redirects to /ai); old per-course links land there.
 */
import { Navigate } from 'react-router-dom';

export default function TutorPage() {
  return <Navigate to="/ai" replace />;
}
