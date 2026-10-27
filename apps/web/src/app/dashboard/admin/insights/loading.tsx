import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { Skeleton } from "@codi-1/ui/components/skeleton";

export default function AdminInsightsLoading() {
  return (
    <LoadingRegion label="Đang tải số liệu phân tích…" className="space-y-6">
      <PageHeaderSkeleton />
      <Skeleton className="h-10 w-44" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </LoadingRegion>
  );
}
