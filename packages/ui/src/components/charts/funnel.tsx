"use client";

import * as React from "react";
import { cn } from "@codi-1/ui/lib/utils";
import { formatNum, formatPct } from "./chart-utils";

export interface FunnelStep {
  label: string;
  value: number;
}

export interface FunnelChartProps {
  steps: FunnelStep[];
  format?: (v: number) => string;
  emptyText?: string;
  className?: string;
}

export function FunnelChart({
  steps,
  format = formatNum,
  emptyText = "Chưa có dữ liệu trong kỳ này.",
  className,
}: FunnelChartProps) {
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);

  if (!steps || !steps.length || !steps[0]?.value) {
    return (
      <div className="grid place-items-center min-h-[120px] p-4 border border-dashed border-border rounded-md text-muted-foreground text-sm text-center">
        {emptyText}
      </div>
    );
  }

  const firstVal = steps[0].value;

  return (
    <div className={cn("grid gap-4 select-none", className)}>
      <ul className="list-none m-0 p-0 grid gap-2" role="list">
        {steps.map((s, i) => {
          const w = (s.value / firstVal) * 100;
          const prevStepVal = i > 0 && steps[i - 1] ? steps[i - 1]!.value : firstVal;
          const prevW = i > 0 ? (prevStepVal / firstVal) * 100 : w;
          const dropW = Math.max(0, prevW - w);
          const stepRate = i > 0 ? (s.value / (prevStepVal || 1)) * 100 : 100;
          const isHovered = activeIdx === i;

          return (
            <li
              key={s.label + i}
              className="relative grid grid-cols-[minmax(96px,34%)_minmax(0,1fr)_auto] items-center gap-3 min-h-[32px] px-1 py-1 rounded cursor-pointer transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
              onFocus={() => setActiveIdx(i)}
              onBlur={() => setActiveIdx(null)}
              tabIndex={0}
            >
              <span className="min-w-0 text-sm leading-snug break-words">
                {i + 1}. {s.label}
              </span>

              <span className="relative h-5 rounded bg-muted overflow-hidden">
                {/* Drop shadow/pattern from previous step */}
                {i > 0 && dropW > 0 && (
                  <span
                    className="absolute top-0 bottom-0 opacity-40 bg-[repeating-linear-gradient(45deg,var(--viz-drop)_0_3px,transparent_3px_6px)]"
                    style={{
                      left: `${w.toFixed(2)}%`,
                      width: `${dropW.toFixed(2)}%`,
                    }}
                  />
                )}
                {/* Current step bar */}
                <span
                  className="absolute left-0 top-0 bottom-0 rounded-r bg-[var(--viz-1)] transition-all"
                  style={{ width: `${w.toFixed(2)}%` }}
                />
              </span>

              <span className="text-sm font-semibold tabular-nums text-right text-foreground">
                {format(s.value)}
              </span>

              {/* Tooltip */}
              {isHovered && (
                <div
                  className="absolute bottom-full mb-1 z-50 px-2.5 py-1.5 rounded-md bg-foreground text-background text-xs shadow-pop pointer-events-none whitespace-nowrap tabular-nums left-1/2 -translate-x-1/2"
                  role="tooltip"
                >
                  <div className="font-semibold">{s.label}</div>
                  <div>Số lượng: {format(s.value)}</div>
                  <div>{formatPct(w, 1)} so với bước 1</div>
                  {i > 0 && <div>{formatPct(stepRate, 1)} từ bước trước</div>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Legend */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className="w-3 h-3 rounded-xs border border-border inline-block bg-[repeating-linear-gradient(45deg,var(--viz-drop)_0_3px,transparent_3px_6px)]"
          aria-hidden="true"
        />
        <span>Phần rơi rụng so với bước trước</span>
      </div>

      {/* Breakdown Table */}
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Tỉ lệ từng bước phễu chuyển đổi</caption>
          <thead className="bg-muted text-xs font-semibold">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">Bước</th>
              <th scope="col" className="px-3 py-2 text-right">Số lượng</th>
              <th scope="col" className="px-3 py-2 text-right">% so với bước 1</th>
              <th scope="col" className="px-3 py-2 text-right">% chuyển bước</th>
              <th scope="col" className="px-3 py-2 text-right">Rơi rụng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {steps.map((s, i) => {
              const prevStep = i > 0 ? steps[i - 1] : undefined;
              return (
                <tr key={s.label + i} className="hover:bg-muted/40">
                  <th scope="row" className="px-3 py-1.5 text-left font-medium">
                    {i + 1}. {s.label}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{format(s.value)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatPct((s.value / firstVal) * 100, 1)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {prevStep ? formatPct((s.value / (prevStep.value || 1)) * 100, 1) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {prevStep ? format(prevStep.value - s.value) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
