import { Skeleton } from "@codi-1/ui/components/skeleton";

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
};

export function TableSkeleton({ rows = 6, columns = 5 }: TableSkeletonProps) {
  const cols = Array.from({ length: columns });
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className="grid gap-4 border-b border-border bg-muted/40 px-4 py-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {cols.map((_, i) => (
          <Skeleton key={i} className="h-4 w-3/4" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {cols.map((_, c) => (
            <Skeleton key={c} className={c === 0 ? "h-5 w-5/6" : "h-4 w-2/3"} />
          ))}
        </div>
      ))}
    </div>
  );
}
