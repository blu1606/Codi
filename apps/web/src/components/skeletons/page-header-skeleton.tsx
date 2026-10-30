import { Skeleton } from "@codi-1/ui/components/skeleton";

type PageHeaderSkeletonProps = {
  withBackLink?: boolean;
  withActions?: boolean;
};

export function PageHeaderSkeleton({ withBackLink = false, withActions = false }: PageHeaderSkeletonProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2 min-w-0">
        {withBackLink && <Skeleton className="h-4 w-40" />}
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {withActions && (
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
      )}
    </div>
  );
}
