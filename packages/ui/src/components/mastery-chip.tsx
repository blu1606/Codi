import { MASTERY_LEVELS, MASTERY_LABELS, type MasteryLevel } from "@codi-1/ui/lib/mastery";
import { cn } from "@codi-1/ui/lib/utils";

const colors = ["bg-mastery-0", "bg-mastery-1", "bg-mastery-2", "bg-mastery-3", "bg-mastery-4"] as const;
export function MasteryChip({ level, className }: { level: MasteryLevel; className?: string }) {
  return <span data-level={level} className={cn("inline-flex items-center gap-2 rounded-pill border px-2.5 py-1 text-xs", className)}>
    <span className="flex gap-1" aria-hidden="true">{MASTERY_LEVELS.map((dot) => <span key={dot} className={cn("size-1.5 rounded-full", level > 0 && dot <= level ? colors[level] : "bg-mastery-0")} />)}</span>
    <span>{MASTERY_LABELS[level]}</span>
  </span>;
}
