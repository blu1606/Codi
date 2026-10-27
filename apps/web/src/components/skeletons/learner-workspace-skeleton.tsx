import { Skeleton } from "@codi-1/ui/components/skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { ListRowsSkeleton } from "@/components/skeletons/list-rows-skeleton";

export function LearnerWorkspaceSkeleton({ progress }: { progress: boolean }) {
  if (progress) {
    return (
      <LoadingRegion label="Đang tải tiến độ học tập…">
        <ListRowsSkeleton rows={5} withAvatar={false} />
      </LoadingRegion>
    );
  }
  return (
    <LoadingRegion label="Đang tải dữ liệu học tập…">
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            <Skeleton className="h-40 w-full rounded-xl" />
            <ListRowsSkeleton rows={3} withAvatar={false} />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
