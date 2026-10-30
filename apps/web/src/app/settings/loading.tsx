import { Skeleton } from "@codi-1/ui/components/skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";

export default function SettingsLoading() {
  return (
    <LoadingRegion label="Đang tải cài đặt…" className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton />
      <div className="flex gap-2 border-b border-border pb-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-28" />
        ))}
      </div>
      <div className="space-y-5 rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </LoadingRegion>
  );
}
