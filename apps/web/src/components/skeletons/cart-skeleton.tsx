import { Skeleton } from "@codi-1/ui/components/skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";

export function CartSkeleton() {
  return (
    <LoadingRegion label="Đang tải giỏ hàng…" className="mx-auto max-w-6xl px-4 py-8">
      <Skeleton className="mb-6 h-9 w-56" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4 rounded-xl border border-border bg-card p-4">
              <Skeleton className="aspect-video h-20 shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-auto h-5 w-24" />
              </div>
            </div>
          ))}
        </div>
        <div className="lg:col-span-4">
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
