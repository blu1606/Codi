"use client";

import * as React from "react";
import { cn } from "@codi-1/ui/lib/utils";
import {
  calculateScale,

  integerScale,
  formatCompact,
  formatNum,
  pickLabels,
} from "./chart-utils";

export interface BarItem {
  label: string;
  value: number;
  tip?: string;
  tone?: "good" | "warning" | "serious" | "critical" | "neutral" | "accent";
}

export interface BarChartProps {
  items: BarItem[];
  goal?: number;
  goalLabel?: string;
  format?: (v: number) => string;
  capFormat?: (v: number) => string;
  axisFormat?: (v: number) => string;
  height?: number;
  ariaLabel?: string;
  emptyText?: string;
  maxXLabels?: number;
  valueLabel?: string;

  /** Whole-number axis ticks (0, 1, 2, ...) for counts. */

  integerTicks?: boolean;
  className?: string;
}

export function BarChart({
  items,
  goal,
  goalLabel = "Mục tiêu",
  format = formatNum,
  capFormat,
  axisFormat = formatCompact,
  height = 180,
  ariaLabel = "Biểu đồ cột",
  emptyText = "Chưa có dữ liệu trong kỳ này.",
  maxXLabels = 8,
  valueLabel = "Giá trị",

  integerTicks = false,
  className,
}: BarChartProps) {
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);

  const hasData = items && items.length > 0 && items.some((it) => it.value > 0);
  if (!hasData) {
    return (
      <div className="grid place-items-center min-h-[120px] p-4 border border-dashed border-border rounded-md text-muted-foreground text-sm text-center">
        {emptyText}
      </div>
    );
  }

  const maxVal = Math.max(...items.map((i) => i.value), goal || 0);
  const { top, ticks } = integerTicks ? integerScale(maxVal) : calculateScale(maxVal);
  const n = items.length;
  const maxIdx = items.reduce(
    (m, it, i) => {
      const currentMax = items[m]?.value ?? 0;
      return it.value > currentMax ? i : m;
    },
    0,
  );
  const labelAll = n <= 8;
  const labelIndices = new Set(pickLabels(n, maxXLabels));

  const toneBg = (tone?: BarItem["tone"]) => {
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
    <div
      className={cn("grid gap-3 min-w-0 select-none", className)}
      role="group"
      aria-label={ariaLabel}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        {/* Y Axis */}
        <div
          className="relative text-[11px] text-muted-foreground tabular-nums min-w-[28px]"
          style={{ height }}
          aria-hidden="true"
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 transform translate-y-1/2 whitespace-nowrap leading-none"
              style={{ bottom: `${((t / top) * 100).toFixed(2)}%` }}
            >
              {axisFormat(t)}
            </span>
          ))}
        </div>

        {/* Plot Area */}
        <div
          className="relative border-b border-[var(--viz-axis)]"
          style={{ height }}
        >
          {/* Grid lines */}
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute left-0 right-0 h-0 border-t border-[var(--viz-grid)]"
              style={{ bottom: `${((t / top) * 100).toFixed(2)}%` }}
            />
          ))}

          {/* Goal line */}
          {goal != null && (
            <div
              className="absolute left-0 right-0 h-0 border-t-2 border-dashed border-[var(--viz-ref)] pointer-events-none z-[1]"
              style={{ bottom: `${((goal / top) * 100).toFixed(2)}%` }}
            >
              <span className="absolute right-0 bottom-1 px-1 rounded bg-card text-[11px] text-foreground whitespace-nowrap shadow-xs">
                {goalLabel}: {format(goal)}
              </span>
            </div>
          )}

          {/* Columns */}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {items.map((it, i) => {
              const h = (it.value / top) * 100;
              const showCap = (labelAll || i === maxIdx || i === n - 1) && it.value > 0;
              const capText = capFormat ? capFormat(it.value) : format(it.value);
              const isHovered = activeIdx === i;

              return (
                <div
                  key={it.label + i}
                  className="relative flex-1 h-full flex items-end justify-center rounded cursor-pointer transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseLeave={() => setActiveIdx(null)}
                  onFocus={() => setActiveIdx(i)}
                  onBlur={() => setActiveIdx(null)}
                  tabIndex={n <= 16 ? 0 : -1}
                >
                  <div
                    className="relative w-[min(24px,70%)] min-h-[2px] rounded-t-sm transition-all"
                    style={{
                      height: `${h.toFixed(2)}%`,
                      backgroundColor: toneBg(it.tone),
                    }}
                  >
                    {showCap && (
                      <span className="absolute bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 text-[11px] font-semibold text-foreground whitespace-nowrap pointer-events-none">
                        {capText}
                      </span>
                    )}
                  </div>

                  {/* Tooltip on hover */}
                  {isHovered && (
                    <div
                      className="absolute bottom-full mb-2 z-50 px-2.5 py-1.5 rounded-md bg-foreground text-background text-xs shadow-pop pointer-events-none whitespace-nowrap tabular-nums left-1/2 -translate-x-1/2"
                      role="tooltip"
                    >
                      <div className="font-semibold">{it.label}</div>
                      <div>
                        {valueLabel}: {format(it.value)}
                      </div>
                      {it.tip && <div className="opacity-80">{it.tip}</div>}
                      {goal != null && (
                        <div className="opacity-80">
                          {goalLabel}: {format(goal)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Empty placeholder */}
        <div />

        {/* X Axis */}
        <div className="flex gap-[2px] pt-2" aria-hidden="true">
          {items.map((it, i) => (
            <span
              key={it.label + i}
              className="flex-1 text-center text-[11px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis"
            >
              {labelIndices.has(i) ? it.label : ""}
            </span>
          ))}
        </div>
      </div>

      {/* Screen Reader Table */}
      <div className="sr-only">
        <table>
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Mốc</th>
              <th scope="col">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.label}>
                <th scope="row">{it.label}</th>
                <td>{format(it.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
