import { Skeleton } from "@codi-1/ui/components/skeleton";

type StatCardsSkeletonProps = {
  count?: number;
};

export function StatCardsSkeleton({ count = 4 }: StatCardsSkeletonProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
