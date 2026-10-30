import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { Skeleton } from "@codi-1/ui/components/skeleton";

export default function AdminOrdersLoading() {
  return (
    <LoadingRegion label="Đang tải đơn hàng…" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton withActions />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
      </div>
      <TableSkeleton rows={8} columns={7} />
    </LoadingRegion>
  );
}
