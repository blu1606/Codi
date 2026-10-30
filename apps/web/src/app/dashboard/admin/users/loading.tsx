import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { Skeleton } from "@codi-1/ui/components/skeleton";

export default function AdminUsersLoading() {
  return (
    <LoadingRegion label="Đang tải người dùng…" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton />
      <Skeleton className="h-10 w-72" />
      <TableSkeleton rows={8} columns={6} />
    </LoadingRegion>
  );
}
