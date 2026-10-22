"use client";

import * as React from "react";
import { cn } from "@codi-1/ui/lib/utils";
import {
  calculateScale,
  formatCompact,
  formatNum,
  formatPct,
  pickLabels,
} from "./chart-utils";

export interface StackedSegment {
  label: string;
  value: number;
  amount?: number;
  tone?: "good" | "warning" | "serious" | "critical" | "neutral" | "accent" | "slot-1" | "slot-2" | "slot-3" | "slot-4" | "slot-5";
}

export interface StackedBarProps {
  segments: StackedSegment[];
  format?: (v: number) => string;
  amountFormat?: (v: number) => string;
  keepZero?: boolean;
  emptyText?: string;
  className?: string;
}

export function StackedBar({
  segments,
  format = formatNum,
  amountFormat = formatCompact,
  keepZero = false,
  emptyText = "Không có dữ liệu trong kỳ này.",
  className,
}: StackedBarProps) {
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);

  const segs = (segments || []).filter((s) => s.value > 0 || keepZero);
  const total = segs.reduce((s, x) => s + x.value, 0);

  if (!total) {
    return (
      <div className="grid place-items-center min-h-[120px] p-4 border border-dashed border-border rounded-md text-muted-foreground text-sm text-center">
        {emptyText}
      </div>
    );
  }

  const toneBg = (seg: StackedSegment, i: number) => {
    if (seg.tone) {
      if (seg.tone.startsWith("slot-")) {
        return `var(--viz-${seg.tone.replace("slot-", "")})`;
      }
      return `var(--viz-${seg.tone})`;
    }
    return `var(--viz-${(i % 5) + 1})`;
  };

  return (
    <div className={cn("grid gap-3 select-none", className)}>
      {/* Stacked bar line */}
      <div
        className="flex gap-[2px] h-6 rounded overflow-hidden"
        role="group"
        aria-label={segs.map((s) => `${s.label}: ${format(s.value)}`).join(", ")}
      >
        {segs.map((s, i) => {
          const share = (s.value / total) * 100;
          const isHovered = activeIdx === i;

          return (
            <div
              key={s.label + i}
              className="relative min-w-[3px] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:brightness-110"
              style={{
                flex: `${s.value} 1 0%`,
                backgroundColor: toneBg(s, i),
              }}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
              onFocus={() => setActiveIdx(i)}
              onBlur={() => setActiveIdx(null)}
              tabIndex={0}
            >
              {isHovered && (
                <div
                  className="absolute bottom-full mb-1 z-50 px-2.5 py-1.5 rounded-md bg-foreground text-background text-xs shadow-pop pointer-events-none whitespace-nowrap tabular-nums left-1/2 -translate-x-1/2"
                  role="tooltip"
                >
                  <div className="font-semibold">{s.label}</div>
                  <div>
                    {format(s.value)} ({formatPct(share, 1)})
                  </div>
                  {s.amount != null && (
                    <div className="opacity-80">{amountFormat(s.amount)}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend with counts & shares */}
      <ul className="list-none m-0 p-0 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-4 gap-y-2 text-sm">
        {segs.map((s, i) => (
          <li
            key={s.label + i}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2"
          >
            <span
              className="w-3 h-3 rounded-xs shrink-0"
              style={{ backgroundColor: toneBg(s, i) }}
              aria-hidden="true"
            />
            <span className="truncate">{s.label}</span>
            <strong className="tabular-nums font-semibold">{format(s.value)}</strong>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatPct((s.value / total) * 100)}
              {s.amount != null && ` · ${amountFormat(s.amount)}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface StackedColKey {
  label: string;
  tone?: "good" | "warning" | "serious" | "critical" | "neutral" | "accent" | "slot-1" | "slot-2" | "slot-3";
}

export interface StackedCol {
  label: string;
  values: number[];
}

export interface StackedColsProps {
  cols: StackedCol[];
  keys: StackedColKey[];
  format?: (v: number) => string;
  height?: number;
  ariaLabel?: string;
  emptyText?: string;
  maxXLabels?: number;
  className?: string;
}

export function StackedCols({
  cols,
  keys,
  format = formatNum,
  height = 180,
  ariaLabel = "Biểu đồ cột chồng",
  emptyText = "Chưa có dữ liệu trong kỳ này.",
  maxXLabels = 8,
  className,
}: StackedColsProps) {
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);

  const totals = cols.map((c) => c.values.reduce((a, b) => a + b, 0));
  if (!cols.length || !totals.some(Boolean)) {
    return (
      <div className="grid place-items-center min-h-[120px] p-4 border border-dashed border-border rounded-md text-muted-foreground text-sm text-center">
        {emptyText}
      </div>
    );
  }

  const { top, ticks } = calculateScale(Math.max(...totals));
  const labelIndices = new Set(pickLabels(cols.length, maxXLabels));

  const toneBg = (key: StackedColKey, i: number) => {
    if (key.tone) {
      if (key.tone.startsWith("slot-")) {
        return `var(--viz-${key.tone.replace("slot-", "")})`;
      }
      return `var(--viz-${key.tone})`;
    }
    return `var(--viz-${(i % 5) + 1})`;
  };

  return (
    <div
      className={cn("grid gap-3 min-w-0 select-none", className)}
      role="group"
      aria-label={ariaLabel}
    >
      {/* Legend */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground list-none m-0 p-0">
        {keys.map((k, i) => (
          <li key={k.label + i} className="inline-flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-xs shrink-0"
              style={{ backgroundColor: toneBg(k, i) }}
              aria-hidden="true"
            />
            <span>{k.label}</span>
          </li>
        ))}
      </ul>

      {/* Frame */}
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
              {formatCompact(t)}
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

          {/* Columns */}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {cols.map((c, ci) => {
              const currentTotal = totals[ci] ?? 0;
              const h = (currentTotal / top) * 100;
              const isHovered = activeIdx === ci;

              return (
                <div
                  key={c.label + ci}
                  className="relative flex-1 h-full flex items-end justify-center rounded cursor-pointer transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onMouseEnter={() => setActiveIdx(ci)}
                  onMouseLeave={() => setActiveIdx(null)}
                  onFocus={() => setActiveIdx(ci)}
                  onBlur={() => setActiveIdx(null)}
                  tabIndex={0}
                >
                  <div
                    className="w-[min(24px,70%)] flex flex-col-reverse gap-[2px] rounded-t-sm overflow-hidden"
                    style={{ height: `${h.toFixed(2)}%` }}
                  >
                    {c.values.map((v, i) =>
                      v > 0 ? (
                        <span
                          key={i}
                          className="block min-h-[2px]"
                          style={{
                            flex: `${v} 1 0%`,
                            backgroundColor: toneBg(keys[i] || { label: "" }, i),
                          }}
                        />
                      ) : null,
                    )}
                  </div>

                  {/* Tooltip */}
                  {isHovered && (
                    <div
                      className="absolute bottom-full mb-1 z-50 px-2.5 py-1.5 rounded-md bg-foreground text-background text-xs shadow-pop pointer-events-none whitespace-nowrap tabular-nums left-1/2 -translate-x-1/2"
                      role="tooltip"
                    >
                      <div className="font-semibold">{c.label}</div>
                      {keys.map((k, i) => (
                        <div key={k.label} className="flex justify-between gap-2">
                          <span>{k.label}:</span>
                          <span className="font-medium">{format(c.values[i] ?? 0)}</span>
                        </div>
                      ))}
                      <div className="border-t border-background/20 pt-0.5 mt-0.5 font-semibold">
                        Tổng: {format(currentTotal)}
                      </div>
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
          {cols.map((c, i) => (
            <span
              key={c.label + i}
              className="flex-1 text-center text-[11px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis"
            >
              {labelIndices.has(i) ? c.label : ""}
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
              {keys.map((k) => (
                <th key={k.label} scope="col">
                  {k.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cols.map((c) => (
              <tr key={c.label}>
                <th scope="row">{c.label}</th>
                {c.values.map((v, i) => (
                  <td key={i}>{format(v)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
