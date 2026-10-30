import Link from "next/link";
import type { Route } from "next";
import { Info } from "lucide-react";
import { cn } from "@codi-1/ui/lib/utils";

export type PrerequisiteAdvice = {
  concept: string;
  lessonId: string;
  lessonTitle: string;
};

// Soft lock: an advisory warning only. The learner can still open and complete the lesson.
export function PrerequisiteAdvice({
  advice,
  lessonUrl,
  className,
}: {
  advice: PrerequisiteAdvice;
  lessonUrl: (id: string) => Route;
  className?: string;
}) {
  return (
    <p
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning",
        className,
      )}
    >
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>
        Nên học {advice.concept} trước (bài{" "}
        <Link
          href={lessonUrl(advice.lessonId)}
          className="font-medium underline underline-offset-2"
        >
          {advice.lessonTitle}
        </Link>
        ).
      </span>
    </p>
  );
}
