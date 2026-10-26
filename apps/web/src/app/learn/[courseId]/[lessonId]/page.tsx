import { headers } from "next/headers";
import { auth } from "@/services";
import LessonPlayer from "./lesson-player";
import StudyActivityTracker from "@/components/study-activity-tracker";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  // The layout already requires a session; this only reads the name for the tutor greeting.
  const session = await auth.api.getSession({ headers: await headers() });
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
        viewerName={session?.user.name ?? null}
      />
    </>
  );
}
