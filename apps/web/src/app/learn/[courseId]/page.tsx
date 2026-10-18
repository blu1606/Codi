import { Alert } from "@codi-1/ui/components/alert";
import { learnerPageSession } from "@/components/learner-page-guard";
import CourseHome from "./course-home";

export default async function CourseHomePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const session = await learnerPageSession(
    `/learn/${encodeURIComponent(courseId)}`,
  );
  if (!session)
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Alert variant="destructive">
          Bạn không có quyền học viên đang hoạt động.
        </Alert>
      </main>
    );
  return (
    <CourseHome
      key={courseId}
      courseId={courseId}
      dismissalScope={`${session.user.id}:${new Date(session.session.createdAt).getTime()}`}
    />
  );
}
