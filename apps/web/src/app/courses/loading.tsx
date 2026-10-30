import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { CardGridSkeleton } from "@/components/skeletons/card-grid-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { Skeleton } from "@codi-1/ui/components/skeleton";

export default function CoursesLoading() {
  return (
    <LoadingRegion label="Đang tải danh sách khoá học…" className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-40" />
      </div>
      <Skeleton className="h-4 w-32" />
      <CardGridSkeleton count={6} />
    </LoadingRegion>
  );
}
