import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { StatCardsSkeleton } from "@/components/skeletons/stat-cards-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { Skeleton } from "@codi-1/ui/components/skeleton";

export default function LearnerStatsLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <LoadingRegion label="Đang tải thống kê…" className="space-y-6">
        <PageHeaderSkeleton withActions />
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-10 w-56" />
        </div>
        <StatCardsSkeleton count={4} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </LoadingRegion>
    </main>
  );
}
