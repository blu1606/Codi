import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";

export default function LecturerGradingLoading() {
  return (
    <LoadingRegion label="Đang tải hàng chờ chấm bài…" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} columns={5} />
    </LoadingRegion>
  );
}
