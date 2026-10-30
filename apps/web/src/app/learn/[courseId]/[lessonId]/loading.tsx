import { LoadingRegion } from "@/components/skeletons/loading-region";
import { Skeleton } from "@codi-1/ui/components/skeleton";

// Mirrors the lesson player: course rail on large screens, then header, task list, content and completion.
export default function LessonLoading() {
  return (
    <LoadingRegion label="Đang tải bài học…" className="grid w-full min-w-0 gap-6 p-4 lg:grid-cols-[18.5rem_minmax(0,1fr)] lg:gap-0 lg:p-0">
      <aside className="hidden space-y-3 border-r px-3 py-2 lg:block">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-4 w-20" />
        <div className="space-y-3 pt-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2 px-3 py-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          ))}
        </div>
      </aside>
      <div className="min-w-0 space-y-6 lg:px-6 lg:pb-6">
        <div className="flex flex-wrap items-center gap-2 border-b py-3">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="ml-auto h-9 w-28" />
        </div>
        <header className="space-y-3">
          <Skeleton className="h-4 w-64 max-w-full" />
          <Skeleton className="h-7 w-3/4 max-w-full" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </header>
        <div className="rounded-xl border p-2">
          <div className="grid gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex min-h-11 items-center gap-3 px-3 py-2">
                <Skeleton className="size-5 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="aspect-video w-full rounded-xl" />
        <div className="space-y-3 rounded-xl border p-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <div className="space-y-5 rounded-xl border p-6">
          <Skeleton className="h-5 w-56" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="mt-0.5 size-5 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
          <Skeleton className="h-11 w-52" />
        </div>
      </div>
    </LoadingRegion>
  );
}
