/**
 * '/learn/:courseId/tutor': the Tutor has one full page for every screen (Codi develop's
 * app/learn/[courseId]/tutor/page.tsx redirects to /ai); old per-course links land there.
 * The redirect keeps the course: /ai's "Thu về" and the chat's origin point back at the course's path.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { tutorStore } from '../tutor/tutor-store';

export default function TutorPage({ params }) {
  const navigate = useNavigate();
  const courseId = params && params.courseId;
  useEffect(() => {
    if (courseId) tutorStore.rememberOrigin(`/learn/${encodeURIComponent(courseId)}`);
    navigate('/ai', { replace: true });
  }, [courseId, navigate]);
  return null;
}
