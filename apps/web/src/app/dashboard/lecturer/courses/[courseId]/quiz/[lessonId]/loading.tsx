import { LoadingRegion } from "@/components/skeletons/loading-region";
import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { Skeleton } from "@codi-1/ui/components/skeleton";

// Quiz editor: question list on the left, the selected question's text and options on the right.
export default function QuizEditorLoading() {
  return (
    <LoadingRegion label="Đang tải trình soạn quiz…" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <PageHeaderSkeleton withBackLink withActions />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="space-y-2 rounded-xl border border-border bg-card p-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 rounded-lg p-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
        <div className="space-y-5 rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Skeleton className="size-4 shrink-0 rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
