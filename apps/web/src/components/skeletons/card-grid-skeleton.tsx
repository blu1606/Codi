import { Skeleton } from "@codi-1/ui/components/skeleton";

type CardGridSkeletonProps = {
  count?: number;
  columns?: "2" | "3";
};

export function CardGridSkeleton({ count = 6, columns = "3" }: CardGridSkeletonProps) {
  const gridCols = columns === "2" ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={`grid grid-cols-1 gap-6 ${gridCols}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
          <Skeleton className="aspect-video w-full" />
          <div className="flex flex-1 flex-col gap-2.5 p-4">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="mt-1 h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
