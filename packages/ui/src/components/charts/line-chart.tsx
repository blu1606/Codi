"use client";

import * as React from "react";
import { cn } from "@codi-1/ui/lib/utils";
import {
  calculateScale,
  formatCompact,
  pickLabels,
} from "./chart-utils";

export interface LinePoint {
  x: string | number;
  y: number;
  label?: string;
  note?: string;
  date?: string;
}

export interface LineSeries {
  name: string;
  points: LinePoint[];
  dashed?: boolean;
  role?: "current" | "previous" | "average" | "series2" | "series3" | "series4" | "series5";
}

export interface LineChartProps {
  series: LineSeries[];
  threshold?: { value: number; label?: string };
  yFormat?: (v: number) => string;
  xLabel?: (x: string | number, i: number) => string;
  height?: number;
  ariaLabel?: string;
  emptyText?: string;
  maxXLabels?: number;
  className?: string;
}

export function LineChart({
  series,
  threshold,
  yFormat = formatCompact,
  xLabel,
  height = 200,
  ariaLabel,
  emptyText = "Chưa có dữ liệu trong kỳ này.",
  maxXLabels = 6,
  className,
}: LineChartProps) {
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);

  const validSeries = series
    .map((s) => ({ ...s, points: s.points || [] }))
    .filter((s) => s.points.length > 0);

  const primarySeries = validSeries[0];
  if (!primarySeries || !validSeries.length) {
    return (
      <div className="grid place-items-center min-h-[120px] p-4 border border-dashed border-border rounded-md text-muted-foreground text-sm text-center">
        {emptyText}
      </div>
    );
  }

  const n = Math.max(...validSeries.map((s) => s.points.length));
  const allY = validSeries
    .flatMap((s) => s.points.map((p) => p.y))
    .concat(threshold ? [threshold.value] : []);
  const maxY = Math.max(...allY);
  const { top, ticks } = calculateScale(maxY);

  const basePoints = primarySeries.points;
  const getXLabel = (i: number) => {
    const p: LinePoint | undefined = basePoints[i];
    if (p?.label != null) return p.label;
    if (xLabel) return xLabel(p?.x ?? i + 1, i);
    return String(p?.x != null ? p.x : i + 1);
  };

  const coordX = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const coordY = (v: number) => 100 - (v / top) * 100;

  const roleOf = (s: LineSeries, k: number) =>
    s.role ||
    (s.dashed ? "previous" : k === 0 ? "current" : (`series${Math.min(k + 1, 5)}` as const));

  const roleStroke = (role: string) => {
    switch (role) {
      case "current":
        return { stroke: "var(--viz-1)", strokeDasharray: undefined };
      case "previous":
        return { stroke: "var(--viz-prev)", strokeDasharray: "5 4" };
      case "average":
        return { stroke: "var(--viz-ref)", strokeDasharray: "2 4" };
      case "series2":
        return { stroke: "var(--viz-2)", strokeDasharray: undefined };
      case "series3":
        return { stroke: "var(--viz-3)", strokeDasharray: undefined };
      case "series4":
        return { stroke: "var(--viz-4)", strokeDasharray: undefined };
      case "series5":
        return { stroke: "var(--viz-5)", strokeDasharray: undefined };
      default:
        return { stroke: "var(--viz-1)", strokeDasharray: undefined };
    }
  };

  const roleBg = (role: string) => {
    switch (role) {
      case "current":
        return "var(--viz-1)";
      case "previous":
        return "var(--viz-prev)";
      case "average":
        return "var(--viz-ref)";
      case "series2":
        return "var(--viz-2)";
      case "series3":
        return "var(--viz-3)";
      case "series4":
        return "var(--viz-4)";
      case "series5":
        return "var(--viz-5)";
      default:
        return "var(--viz-1)";
    }
  };

  const lastPoint = basePoints[basePoints.length - 1];
  const lastY = lastPoint?.y ?? 0;
  const lastRole = roleOf(primarySeries, 0);

  const labelIndices = pickLabels(n, maxXLabels);
  const hitWidth = n > 1 ? 100 / (n - 1) : 100;

  return (
    <div
      className={cn("grid gap-3 min-w-0 select-none", className)}
      role="group"
      aria-label={ariaLabel || validSeries.map((s) => s.name).join(", ")}
    >
      {/* Legend */}
      {(validSeries.length > 1 || threshold) && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground list-none m-0 p-0">
          {validSeries.map((s, k) => {
            const r = roleOf(s, k);
            const isDashed = r === "previous" || r === "average" || s.dashed;
            return (
              <li key={s.name + k} className="inline-flex items-center gap-2">
                <span
                  className={cn(
                    "w-[18px] h-0 border-t-2",
                    isDashed ? "border-dashed" : "border-solid",
                  )}
                  style={{ borderTopColor: roleBg(r) }}
                  aria-hidden="true"
                />
                <span>{s.name}</span>
              </li>
            );
          })}
          {threshold && (
            <li className="inline-flex items-center gap-2">
              <span
                className="w-[18px] h-0 border-t-2 border-dashed"
                style={{ borderTopColor: "var(--viz-ref)" }}
                aria-hidden="true"
              />
              <span>{threshold.label || "Ngưỡng"}</span>
            </li>
          )}
        </ul>
      )}

      {/* Plot Frame */}
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
              {yFormat(t)}
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

          {/* Threshold line */}
          {threshold && (
            <div
              className="absolute left-0 right-0 h-0 border-t-2 border-dashed border-[var(--viz-ref)] pointer-events-none z-[1]"
              style={{ bottom: `${((threshold.value / top) * 100).toFixed(2)}%` }}
            >
              <span className="absolute right-0 bottom-1 px-1 rounded bg-card text-[11px] text-foreground whitespace-nowrap shadow-xs">
                {threshold.label || yFormat(threshold.value)}
              </span>
            </div>
          )}

          {/* Stretched SVG for lines */}
          <svg
            className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {validSeries.map((s, k) => {
              const r = roleOf(s, k);
              const { stroke, strokeDasharray } = roleStroke(r);
              const d = s.points
                .map(
                  (p, i) =>
                    `${i === 0 ? "M" : "L"}${(coordX(i) * 10).toFixed(1)} ${(coordY(p.y) * 10).toFixed(1)}`,
                )
                .join(" ");
              return (
                <path
                  key={s.name + k}
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth="2"
                  strokeDasharray={strokeDasharray}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>

          {/* End label on primary series */}
          {lastPoint && (
            <>
              <span
                className="absolute w-2.5 h-2.5 -ml-[5px] -mb-[5px] rounded-full ring-2 ring-card pointer-events-none"
                style={{
                  left: `${coordX(basePoints.length - 1)}%`,
                  bottom: `${((lastY / top) * 100).toFixed(2)}%`,
                  backgroundColor: roleBg(lastRole),
                }}
              />
              <span
                className="absolute right-2 -translate-y-3.5 text-xs font-semibold text-foreground pointer-events-none bg-card px-1 rounded shadow-xs"
                style={{ bottom: `${((lastY / top) * 100).toFixed(2)}%` }}
              >
                {yFormat(lastY)}
              </span>
            </>
          )}

          {/* Hit areas for focus / tooltip */}
          {Array.from({ length: n }, (_, i) => {
            const isFirst = i === 0 && n > 1;
            const isLast = i === n - 1 && n > 1;
            const left = Math.max(0, coordX(i) - hitWidth / 2);
            const width = isFirst || isLast ? hitWidth / 2 : hitWidth;
            const cx = isFirst ? "0%" : isLast ? "100%" : "50%";
            const isHovered = activeIdx === i;

            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 z-10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm group"
                style={{ left: `${left}%`, width: `${width}%` }}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseLeave={() => setActiveIdx(null)}
                onFocus={() => setActiveIdx(i)}
                onBlur={() => setActiveIdx(null)}
                tabIndex={n <= 16 ? 0 : -1}
              >
                {/* Vertical hairline indicator */}
                <div
                  className={cn(
                    "absolute top-0 bottom-0 border-l border-[var(--viz-axis)] pointer-events-none transition-opacity",
                    isHovered ? "opacity-100" : "opacity-0",
                  )}
                  style={{ left: cx }}
                />

                {/* Dot markers on hover */}
                {validSeries.map((s, k) => {
                  const pt = s.points[i];
                  if (!pt) return null;
                  const r = roleOf(s, k);
                  return (
                    <span
                      key={s.name + k}
                      className={cn(
                        "absolute w-2.5 h-2.5 -ml-[5px] -mb-[5px] rounded-full ring-2 ring-card pointer-events-none transition-opacity",
                        isHovered ? "opacity-100" : "opacity-0",
                      )}
                      style={{
                        left: cx,
                        bottom: `${((pt.y / top) * 100).toFixed(2)}%`,
                        backgroundColor: roleBg(r),
                      }}
                    />
                  );
                })}

                {/* Inline Tooltip Box */}
                {isHovered && (
                  <div
                    className="absolute bottom-full mb-2 z-50 px-2.5 py-1.5 rounded-md bg-foreground text-background text-xs shadow-pop pointer-events-none whitespace-nowrap tabular-nums transform -translate-x-1/2 left-1/2"
                    style={{ left: cx }}
                    role="tooltip"
                  >
                    <div className="font-semibold text-xs border-b border-background/20 pb-0.5 mb-1">
                      {getXLabel(i)}
                    </div>
                    {validSeries.map((s, k) => {
                      const pt = s.points[i];
                      if (!pt) return null;
                      return (
                        <div key={s.name + k} className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{ backgroundColor: roleBg(roleOf(s, k)) }}
                          />
                          <span>{s.name}:</span>
                          <span className="font-medium">{yFormat(pt.y)}</span>
                          {pt.note && <span className="opacity-75">· {pt.note}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty placeholder for alignment */}
        <div />

        {/* X Axis */}
        <div className="relative h-7 text-[11px] text-muted-foreground" aria-hidden="true">
          {labelIndices.map((i) => {
            const isFirst = i === 0;
            const isLast = i === n - 1;
            return (
              <span
                key={i}
                className={cn(
                  "absolute top-2 whitespace-nowrap",
                  isFirst
                    ? "left-0 transform-none"
                    : isLast
                      ? "right-0 transform-none"
                      : "-translate-x-1/2",
                )}
                style={{ left: isFirst ? 0 : isLast ? undefined : `${coordX(i)}%` }}
              >
                {getXLabel(i)}
              </span>
            );
          })}
        </div>
      </div>

      {/* Screen reader table */}
      <div className="sr-only">
        <table>
          <caption>{ariaLabel || "Biểu đồ đường"}</caption>
          <thead>
            <tr>
              <th scope="col">Mốc</th>
              {validSeries.map((s) => (
                <th key={s.name} scope="col">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, i) => (
              <tr key={i}>
                <th scope="row">{getXLabel(i)}</th>
                {validSeries.map((s) => (
                  <td key={s.name}>
                    {s.points[i] ? yFormat(s.points[i].y) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
