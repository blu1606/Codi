import { getCourseLearnerProgress } from "../actions";
import { CourseProgressClient } from "../course-progress-client";
import { ProgressCourseMissingView } from "../progress-views";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

export default async function CourseProgressDetailPage({ params }: PageProps) {
  const { courseId } = await params;
  const data = await getCourseLearnerProgress(courseId);

  if (!data) {
    return <ProgressCourseMissingView />;
  }

  return <CourseProgressClient data={data} />;
}
