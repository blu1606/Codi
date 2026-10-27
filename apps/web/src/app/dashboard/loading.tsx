import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { LearnerWorkspaceSkeleton } from "@/components/skeletons/learner-workspace-skeleton";
import { LoadingRegion } from "@/components/skeletons/loading-region";

export default function DashboardLoading() {
  return (
    <LoadingRegion label="Đang tải Bàn làm việc…" className="mx-auto w-full min-w-0 max-w-[1200px] space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeaderSkeleton withActions />
      <LearnerWorkspaceSkeleton progress={false} />
    </LoadingRegion>
  );
}
