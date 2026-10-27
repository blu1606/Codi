import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { Skeleton } from "@codi-1/ui/components/skeleton";

export default function LecturerNewCourseLoading() {
  return (
    <LoadingRegion label="Đang tải biểu mẫu tạo khoá học…" className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton withBackLink />
      <div className="space-y-5 rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
    </LoadingRegion>
  );
}
