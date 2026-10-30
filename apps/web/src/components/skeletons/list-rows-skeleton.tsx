import { Skeleton } from "@codi-1/ui/components/skeleton";

type ListRowsSkeletonProps = {
  rows?: number;
  withAvatar?: boolean;
};

export function ListRowsSkeleton({ rows = 5, withAvatar = true }: ListRowsSkeletonProps) {
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          {withAvatar && <Skeleton className="size-10 shrink-0 rounded-full" />}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="hidden h-6 w-16 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}
