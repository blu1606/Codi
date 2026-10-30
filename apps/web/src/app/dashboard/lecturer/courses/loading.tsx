import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { CardGridSkeleton } from "@/components/skeletons/card-grid-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";

export default function LecturerCoursesLoading() {
  return (
    <LoadingRegion label="Đang tải khoá học của bạn…" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton withActions />
      <CardGridSkeleton count={3} columns="3" />
    </LoadingRegion>
  );
}
