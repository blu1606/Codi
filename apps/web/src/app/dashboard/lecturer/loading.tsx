import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { StatCardsSkeleton } from "@/components/skeletons/stat-cards-skeleton";
import { ListRowsSkeleton } from "@/components/skeletons/list-rows-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";

export default function LecturerLoading() {
  return (
    <LoadingRegion label="Đang tải không gian giảng viên…" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton withActions />
      <StatCardsSkeleton count={4} />
      <ListRowsSkeleton rows={4} withAvatar={false} />
    </LoadingRegion>
  );
}
