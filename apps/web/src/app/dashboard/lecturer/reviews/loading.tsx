import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { ListRowsSkeleton } from "@/components/skeletons/list-rows-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";

export default function LecturerReviewsLoading() {
  return (
    <LoadingRegion label="Đang tải đánh giá…" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton />
      <ListRowsSkeleton rows={6} />
    </LoadingRegion>
  );
}
