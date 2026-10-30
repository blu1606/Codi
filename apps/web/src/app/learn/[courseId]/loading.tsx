import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { ListRowsSkeleton } from "@/components/skeletons/list-rows-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { Skeleton } from "@codi-1/ui/components/skeleton";

export default function CourseHomeLoading() {
  return (
    <LoadingRegion label="Đang tải khoá học…" className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton withBackLink />
      <Skeleton className="h-2 w-full rounded-full" />
      <ListRowsSkeleton rows={5} />
    </LoadingRegion>
  );
}
