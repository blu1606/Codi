import { Suspense } from "react";
import { AiAdvisorView } from "@/components/ai/ai-advisor-view";

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
    <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Đang tải Codi AI...</div>}>
      <AiAdvisorView
        initialTopic={topic}
        initialPrompt={prompt}
        initialAction={action}
        initialCourseId={courseId}
      />
    </Suspense>
  );
}
