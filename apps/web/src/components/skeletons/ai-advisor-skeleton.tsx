import { Skeleton } from "@codi-1/ui/components/skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";

export function AiAdvisorSkeleton() {
  return (
    <LoadingRegion label="Đang tải gợi ý danh mục…" className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-4">
        <Skeleton className="ml-auto h-12 w-2/3 rounded-xl" />
        <Skeleton className="h-24 w-4/5 rounded-xl" />
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
    </LoadingRegion>
  );
}
