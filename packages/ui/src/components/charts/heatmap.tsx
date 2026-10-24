"use client";

import * as React from "react";
import { cn } from "@codi-1/ui/lib/utils";
import { formatNum, formatPct } from "./chart-utils";

export interface HeatmapRow {
  label: string;
  n: number;
  cells: (number | null)[];
  pinned?: boolean;
}

export interface HeatmapProps {
  cols: string[];
  rows: HeatmapRow[];
  rowHeader?: string;
  minN?: number;
  caption?: string;
  emptyText?: string;
  className?: string;
}

export function Heatmap({
  cols,
  rows,
  rowHeader = "Nhóm",
  minN = 20,
  caption = "Bảng nhiệt giữ chân",
  emptyText = "Chưa có dữ liệu.",
  className,
}: HeatmapProps) {
  const [activeCell, setActiveCell] = React.useState<{ r: number; c: number } | null>(null);

  if (!rows || !rows.length) {
    return (
      <div className="grid place-items-center min-h-[120px] p-4 border border-dashed border-border rounded-md text-muted-foreground text-sm text-center">
        {emptyText}
      </div>
    );
  }

  const getLevelClass = (v: number | null) => {
    if (v == null) return "bg-muted/40 text-muted-foreground";
    const lvl = Math.min(5, Math.floor(v / 20));
    switch (lvl) {
      case 0:
        return "bg-[var(--viz-s0)] text-foreground";
      case 1:
        return "bg-[var(--viz-s1)] text-foreground";
      case 2:
        return "bg-[var(--viz-s2)] text-foreground";
      case 3:
        return "bg-[var(--viz-s3)] text-[var(--viz-on-s4)]";
      case 4:
      case 5:
      default:
        return "bg-[var(--viz-s4)] text-[var(--viz-on-s4)]";
    }
  };

  return (
    <div className={cn("overflow-x-auto rounded border border-border select-none", className)}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted text-xs font-semibold">
          <tr>
            <th scope="col" className="px-3 py-2 text-left whitespace-nowrap">
              {rowHeader}
            </th>
            <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">
              n
            </th>
            {cols.map((c) => (
              <th
                key={c}
                scope="col"
                className="px-3 py-2 text-center whitespace-nowrap font-medium"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, ri) => (
            <tr
              key={r.label + ri}
              className={cn(
                "hover:bg-muted/30 transition-colors",
                r.pinned && "font-semibold bg-muted/60 border-b-2 border-[var(--viz-axis)]",
              )}
            >
              <th scope="row" className="px-3 py-2 text-left whitespace-nowrap font-normal">
                <span>{r.label}</span>
                {r.n < minN && (
                  <span
                    className="inline-block ml-2 px-1.5 py-0.5 rounded-full bg-warning-soft text-foreground text-[10px] font-medium"
                    title={`Mẫu nhỏ: n = ${r.n} < ${minN}`}
                  >
                    n &lt; {minN}
                  </span>
                )}
              </th>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground font-medium">
                {formatNum(r.n)}
              </td>
              {r.cells.map((v, ci) => {
                const isHovered = activeCell?.r === ri && activeCell?.c === ci;
                return (
                  <td
                    key={ci}
                    className={cn(
                      "relative p-2 text-center tabular-nums text-xs font-medium border border-card min-w-[52px] cursor-pointer transition-transform",
                      getLevelClass(v),
                    )}
                    onMouseEnter={() => setActiveCell({ r: ri, c: ci })}
                    onMouseLeave={() => setActiveCell(null)}
                    onFocus={() => setActiveCell({ r: ri, c: ci })}
                    onBlur={() => setActiveCell(null)}
                    tabIndex={v != null ? 0 : -1}
                  >
                    {v == null ? (
                      <span className="sr-only">chưa có</span>
                    ) : (
                      formatPct(v)
                    )}

                    {/* Tooltip on cell hover */}
                    {isHovered && v != null && (
                      <div
                        className="absolute bottom-full mb-1 z-50 px-2.5 py-1.5 rounded-md bg-foreground text-background text-xs shadow-pop pointer-events-none whitespace-nowrap tabular-nums left-1/2 -translate-x-1/2"
                        role="tooltip"
                      >
                        <div className="font-semibold">{r.label}</div>
                        <div>
                          {cols[ci]}: {formatPct(v)}
                        </div>
                        <div className="opacity-80">n = {formatNum(r.n)}</div>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
