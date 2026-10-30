import LessonPlayer from "./lesson-player";
import StudyActivityTracker from "@/components/study-activity-tracker";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  return (
    <>
      <StudyActivityTracker
        key={`activity:${courseId}:${lessonId}`}
        courseId={courseId}
        lessonId={lessonId}
      />
      <LessonPlayer
        key={`${courseId}:${lessonId}`}
        courseId={courseId}
        lessonId={lessonId}
      />
    </>
  );
}
