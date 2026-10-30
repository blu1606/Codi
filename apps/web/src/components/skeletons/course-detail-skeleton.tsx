import { Skeleton } from "@codi-1/ui/components/skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { ListRowsSkeleton } from "@/components/skeletons/list-rows-skeleton";
import styles from "@/components/courses/course-detail.module.css";

export function CourseDetailSkeleton() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <LoadingRegion label="Đang tải khoá học…" className="space-y-6">
          <Skeleton className="h-4 w-48" />
          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="aspect-video w-full rounded-xl" />
              <div className="space-y-3 rounded-xl border border-border bg-card p-5">
                <Skeleton className="h-6 w-40" />
                <ListRowsSkeleton rows={4} withAvatar={false} />
              </div>
            </div>
            <div className="space-y-4 rounded-xl border border-border bg-card p-5">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        </LoadingRegion>
      </div>
    </main>
  );
}
