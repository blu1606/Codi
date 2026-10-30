import { Suspense } from "react";
import { AiAdvisorView } from "@/components/ai/ai-advisor-view";
import { AiAdvisorSkeleton } from "@/components/skeletons/ai-advisor-skeleton";

interface PageProps {
  searchParams: Promise<{
    topic?: string;
    prompt?: string;
    action?: string;
    courseId?: string;
  }>;
}

export default async function AIPage({ searchParams }: PageProps) {
  const { topic, prompt, action, courseId } = await searchParams;

  return (
    <Suspense fallback={<AiAdvisorSkeleton />}>
      <AiAdvisorView
        initialTopic={topic}
        initialPrompt={prompt}
        initialAction={action}
        initialCourseId={courseId}
      />
    </Suspense>
  );
}
