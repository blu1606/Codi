import { Alert } from "@codi-1/ui/components/alert";
import { learnerPageAllowed } from "@/components/learner-page-guard";
import { getLearnerStatsData } from "@/lib/learner-insights-service";
import { LearnerStatsView } from "./learner-stats-view";

export default async function LearnerStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; course?: string }>;
}) {
  if (!(await learnerPageAllowed("/insights/stats"))) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Alert variant="destructive">Bạn không có quyền học viên đang hoạt động.</Alert>
      </main>
    );
  }

  const { period, course } = await searchParams;
  const initialPeriod = period === "7" || period === "month" || period === "30" ? period : "30";
  const initialCourse = course || "all";

  const initialData = getLearnerStatsData(initialPeriod, initialCourse);

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <LearnerStatsView initialData={initialData} />
    </main>
  );
}
