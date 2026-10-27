import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";

export default function AdminCoursesLoading() {
  return (
    <LoadingRegion label="Đang tải khoá học đã xuất bản…" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton withBackLink />
      <TableSkeleton rows={6} columns={8} />
    </LoadingRegion>
  );
}
