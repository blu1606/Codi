import { Skeleton } from "@codi-1/ui/components/skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";

export function AuthFormSkeleton() {
  return (
    <LoadingRegion label="Đang tải biểu mẫu…" className="w-full space-y-5 rounded-xl border border-border bg-card p-6">
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-4 w-3/4" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
    </LoadingRegion>
  );
}
