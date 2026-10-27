import { Skeleton } from "@codi-1/ui/components/skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";
import { ListRowsSkeleton } from "@/components/skeletons/list-rows-skeleton";

export default function ProfileLoading() {
  return (
    <main className="min-h-screen min-w-0 bg-background px-4 py-8 sm:px-6">
      <LoadingRegion label="Đang tải hồ sơ…" className="mx-auto w-full max-w-[1440px] space-y-6 px-2 sm:px-4 lg:px-8">
        <Skeleton className="h-8 w-56" />
        <div className="space-y-2 border-b border-border/40 pb-4">
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <nav className="flex gap-3 border-b border-border pb-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-5 w-24" />
          ))}
        </nav>
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[360px_minmax(0,1fr)] xl:gap-12">
          <div className="min-w-0 space-y-4">
            <div className="space-y-4 rounded-xl border border-border bg-card p-6">
              <Skeleton className="mx-auto size-24 rounded-full" />
              <Skeleton className="mx-auto h-5 w-40" />
              <Skeleton className="mx-auto h-4 w-56" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
          </div>
          <div className="min-w-0">
            <ListRowsSkeleton rows={4} withAvatar={false} />
          </div>
        </div>
      </LoadingRegion>
    </main>
  );
}
