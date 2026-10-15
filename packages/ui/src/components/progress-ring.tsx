import { cn } from "@codi-1/ui/lib/utils";

export function ProgressRing({ value, label = "Tiến độ", size = 72, className }: { value: number; label?: string; size?: number; className?: string }) {
  const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  const circumference = 2 * Math.PI * 30;
  return <span role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
    <svg viewBox="0 0 72 72" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
      <circle cx="36" cy="36" r="30" fill="none" strokeWidth="6" className="stroke-muted" />
      <circle cx="36" cy="36" r="30" fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)} className="stroke-primary" />
    </svg>
    <span className="text-sm font-semibold tabular-nums">{percent}%</span>
  </span>;
}
