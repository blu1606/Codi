import { Skeleton } from "@codi-1/ui/components/skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";

export function CheckoutSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label} className="container mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <div className="space-y-6 rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="mx-auto aspect-square w-64 max-w-full rounded-lg" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          </div>
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-6 lg:col-span-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    </LoadingRegion>
  );
}
