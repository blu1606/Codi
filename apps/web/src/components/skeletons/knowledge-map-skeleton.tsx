import { Skeleton } from "@codi-1/ui/components/skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";

export function KnowledgeMapSkeleton() {
  return (
    <LoadingRegion label="Đang tải bản đồ…" className="space-y-4">
      <Skeleton className="h-10 w-56 max-w-full" />
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-card sm:aspect-[16/9]">
        <Skeleton className="absolute left-[12%] top-[20%] size-14 rounded-full" />
        <Skeleton className="absolute left-[42%] top-[12%] size-16 rounded-full" />
        <Skeleton className="absolute left-[70%] top-[28%] size-14 rounded-full" />
        <Skeleton className="absolute left-[25%] top-[58%] size-12 rounded-full" />
        <Skeleton className="absolute left-[55%] top-[62%] size-16 rounded-full" />
        <Skeleton className="absolute left-[82%] top-[66%] size-12 rounded-full" />
      </div>
    </LoadingRegion>
  );
}
