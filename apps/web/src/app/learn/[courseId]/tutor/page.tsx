import { Alert } from "@codi-1/ui/components/alert";
import { learnerPageSession } from "@/components/learner-page-guard";
import TutorPage from "./tutor-page";

export default async function TutorRoute({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ lesson?: string }>;
}) {
  const { courseId } = await params;
  const { lesson } = await searchParams;
  const session = await learnerPageSession(
    `/learn/${encodeURIComponent(courseId)}/tutor`,
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
    <TutorPage key={courseId} courseId={courseId} initialLessonId={lesson ?? null} />
  );
}
