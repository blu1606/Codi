import { LoadingRegion } from "@/components/skeletons/loading-region";
import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { Skeleton } from "@codi-1/ui/components/skeleton";

// Code exercise editor: tab strip, then the exercise settings beside the code and test-case panels.
export default function CodeEditorLoading() {
  return (
    <LoadingRegion label="Đang tải trình soạn bài code…" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton withBackLink withActions />
      <div className="flex gap-2 overflow-hidden border-b border-border pb-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-28 shrink-0" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
          <div className="space-y-2 pt-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>
      </div>
    </LoadingRegion>
  );
}
