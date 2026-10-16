import { Alert } from "@codi-1/ui/components/alert";
import { learnerPageAllowed } from "@/components/learner-page-guard";
import CourseHome from "./course-home";

export default async function CourseHomePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  if (!await learnerPageAllowed(`/learn/${encodeURIComponent(courseId)}`)) return <main className="mx-auto max-w-2xl p-6"><Alert variant="destructive">Bạn không có quyền học viên đang hoạt động.</Alert></main>;
  return <CourseHome key={courseId} courseId={courseId} />;
}
