import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton";
import { KnowledgeMapSkeleton } from "@/components/skeletons/knowledge-map-skeleton";

export default function KnowledgeMapInsightLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeaderSkeleton withBackLink />
      <KnowledgeMapSkeleton />
    </main>
  );
}
