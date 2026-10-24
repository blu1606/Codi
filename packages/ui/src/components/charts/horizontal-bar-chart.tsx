"use client";

import * as React from "react";
import { cn } from "@codi-1/ui/lib/utils";
import { formatNum } from "./chart-utils";

export interface HorizontalBarItem {
  label: string;
  value: number;
  max?: number;
  marker?: number | null;
  markerLabel?: string;
  markerText?: string;
  text?: string;
  tip?: string;
  tone?: "good" | "warning" | "serious" | "critical" | "neutral" | "accent";
}

export interface HorizontalBarChartProps {
  items: HorizontalBarItem[];
  max?: number;
  format?: (v: number) => string;
  sort?: boolean;
  emptyText?: string;
  className?: string;
}

export function HorizontalBarChart({
  items,
  max,
  format = formatNum,
  sort = true,
  emptyText = "Chưa có kỹ năng nào được ghi nhận.",
  className,
}: HorizontalBarChartProps) {
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);

  if (!items || !items.length) {
    return (
      <div className="grid place-items-center min-h-[120px] p-4 border border-dashed border-border rounded-md text-muted-foreground text-sm text-center">
        {emptyText}
      </div>
    );
  }

  const processed = items.slice();
  if (sort) {
    processed.sort((a, b) => b.value / (b.max || 1) - a.value / (a.max || 1));
  }

  const overallMax = max || Math.max(...processed.map((i) => i.max || i.value), 1);

  const toneBg = (tone?: HorizontalBarItem["tone"]) => {
    switch (tone) {
      case "good":
        return "var(--viz-good)";
      case "warning":
        return "var(--viz-warning)";
      case "serious":
        return "var(--viz-serious)";
      case "critical":
        return "var(--viz-critical)";
      case "neutral":
        return "var(--viz-neutral)";
      case "accent":
      default:
        return "var(--viz-1)";
    }
  };

  return (
    <ul
      className={cn("list-none m-0 p-0 grid gap-2", className)}
      role="list"
    >
      {processed.map((it, idx) => {
        const m = it.max || overallMax;
        const w = Math.max(0, Math.min(100, (it.value / m) * 100));
        const valueText = it.text || `${format(it.value)}${it.max ? "/" + format(it.max) : ""}`;
        const isHovered = activeIdx === idx;

        return (
          <li
            key={it.label + idx}
            className="relative grid grid-cols-[minmax(96px,34%)_minmax(0,1fr)_auto] items-center gap-3 min-h-[32px] px-1 py-0.5 rounded cursor-pointer transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onMouseEnter={() => setActiveIdx(idx)}
            onMouseLeave={() => setActiveIdx(null)}
            onFocus={() => setActiveIdx(idx)}
            onBlur={() => setActiveIdx(null)}
            tabIndex={0}
          >
            <span className="min-w-0 text-sm leading-snug break-words">
              {it.label}
            </span>

            <span className="relative h-3 rounded bg-muted">
              <span
                className="absolute left-0 top-0 bottom-0 rounded-r transition-all"
                style={{
                  width: `${w.toFixed(2)}%`,
                  backgroundColor: toneBg(it.tone),
                }}
              />
              {it.marker != null && (
                <span
                  className="absolute -top-1 -bottom-1 w-0 border-l-2 border-dashed border-foreground/60"
                  style={{ left: `${((it.marker / m) * 100).toFixed(2)}%` }}
                  aria-hidden="true"
                />
              )}
            </span>

            <span className="text-sm text-foreground whitespace-nowrap tabular-nums text-right font-medium">
              {valueText}
            </span>

            {/* Tooltip */}
            {isHovered && (
              <div
                className="absolute bottom-full mb-1 z-50 px-2.5 py-1.5 rounded-md bg-foreground text-background text-xs shadow-pop pointer-events-none whitespace-nowrap tabular-nums left-1/2 -translate-x-1/2"
                role="tooltip"
              >
                <div className="font-semibold">{it.label}</div>
                <div>{valueText}</div>
                {it.marker != null && (
                  <div className="opacity-80">
                    {it.markerLabel || "Mốc so sánh"}: {it.markerText || format(it.marker)}
                  </div>
                )}
                {it.tip && <div className="opacity-80">{it.tip}</div>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function InlineBar({
  value,
  max,
  text,
  className,
}: {
  value: number;
  max: number;
  text?: string;
  className?: string;
}) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 min-w-[140px] justify-end w-full",
        className,
      )}
    >
      <span className="flex-1 max-w-[120px] h-2 rounded bg-muted overflow-hidden">
        <span
          className="block h-full rounded-r bg-[var(--viz-1)] transition-all"
          style={{ width: `${w.toFixed(1)}%` }}
        />
      </span>
      <span className="min-w-[4ch] text-right tabular-nums text-xs font-medium">
        {text != null ? text : formatNum(value)}
      </span>
    </span>
  );
}
