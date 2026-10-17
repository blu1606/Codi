import LessonPlayer from "./lesson-player";

export default async function LessonPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const { courseId, lessonId } = await params;
  return <LessonPlayer key={`${courseId}:${lessonId}`} courseId={courseId} lessonId={lessonId} />;
}
