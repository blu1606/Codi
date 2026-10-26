import { Circle, CircleCheck, CircleDot } from "lucide-react";
import { cn } from "@codi-1/ui/lib/utils";

export function Stepper({ steps, current, allDone = false, className }: { steps: readonly string[]; current: number; allDone?: boolean; className?: string }) {
  return <ol aria-label="Các bước thực hiện" className={cn("flex flex-wrap gap-x-6 gap-y-3 text-sm", className)}>
    {steps.map((label, index) => {
      const done = allDone || index < current;
      const active = !allDone && index === current;
      const Icon = done ? CircleCheck : active ? CircleDot : Circle;
      return <li key={`${index}-${label}`} aria-current={active ? "step" : undefined} className={cn("flex items-center gap-2", done ? "text-success" : active ? "font-semibold text-primary" : "text-muted-foreground")}>
        <Icon aria-hidden="true" className="size-4 shrink-0" /><span className="sr-only">{done ? "Đã hoàn thành: " : active ? "Đang thực hiện: " : "Chưa thực hiện: "}</span>{label}
      </li>;
    })}
  </ol>;
}
