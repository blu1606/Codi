import { Alert } from "@codi-1/ui/components/alert";
import KnowledgeMap from "@/components/knowledge-map";
import { learnerPageAllowed } from "@/components/learner-page-guard";

export default async function KnowledgeMapPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  if (!(await learnerPageAllowed("/insights/knowledge-map")))
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Alert variant="destructive">
          Bạn không có quyền học viên đang hoạt động.
        </Alert>
      </main>
    );
  const { course } = await searchParams;
  return (
    <main className="mx-auto min-w-0 w-full max-w-[1200px] px-4 pb-12 pt-8">
      <KnowledgeMap initialCourseId={course} />
    </main>
  );
}
