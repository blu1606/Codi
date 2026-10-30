import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { ListRowsSkeleton } from "@/components/skeletons/list-rows-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { Skeleton } from "@codi-1/ui/components/skeleton";

export default function LecturerCourseEditorLoading() {
  return (
    <LoadingRegion label="Đang tải khoá học…" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton withBackLink withActions />
      <div className="flex gap-2 border-b border-border pb-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>
      <ListRowsSkeleton rows={5} withAvatar={false} />
    </LoadingRegion>
  );
}
