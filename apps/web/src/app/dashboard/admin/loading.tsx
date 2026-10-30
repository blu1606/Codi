import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { StatCardsSkeleton } from "@/components/skeletons/stat-cards-skeleton";
import { ListRowsSkeleton } from "@/components/skeletons/list-rows-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { Skeleton } from "@codi-1/ui/components/skeleton";

export default function AdminLoading() {
  return (
    <LoadingRegion label="Đang tải Bàn làm việc quản trị…" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton />
      <StatCardsSkeleton count={4} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <ListRowsSkeleton rows={3} withAvatar={false} />
    </LoadingRegion>
  );
}
