"use client";

import * as React from "react";
import { cn } from "@codi-1/ui/lib/utils";
import { formatNum, formatPct } from "./chart-utils";

export interface KpiTileProps {
  label: string;
  value: number | string;
  format?: (v: any) => string;
  prev?: number | null;
  delta?: number | null;
  deltaGood?: "up" | "down";
  spark?: number[];
  note?: string;
  compare?: boolean;
  prevMissing?: boolean;
  className?: string;
}

export function KpiTile({
  label,
  value,
  format,
  prev,
  delta: explicitDelta,
  deltaGood = "up",
  spark,
  note,
  compare = true,
  prevMissing = false,
  className,
}: KpiTileProps) {
  const f = format ?? formatNum;

  let delta = explicitDelta;
  let rel: number | null = null;

  if (prev != null && typeof value === "number") {
    delta = value - prev;
    rel = prev ? (delta / Math.abs(prev)) * 100 : null;
  }

  const isGood = deltaGood === "up";

  let deltaNode: React.ReactNode = null;
  if (compare === false) {
    deltaNode = null;
  } else if (delta == null) {
    if (prevMissing) {
      deltaNode = (
        <div className="text-xs font-medium text-muted-foreground">
          Chưa có kỳ trước để so sánh
        </div>
      );
    }
  } else {
    const isFlat = Math.abs(delta) < 1e-9;
    const isSuccess = isFlat ? false : (delta > 0) === isGood;
    const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "■";
    const amount = rel != null ? formatPct(Math.abs(rel), Math.abs(rel) < 10 ? 1 : 0) : f(Math.abs(delta));
    const word = isFlat ? "không đổi" : isSuccess ? "tốt hơn" : "kém hơn";

    deltaNode = (
      <div
        className={cn(
          "text-xs font-semibold flex items-center gap-1",
          isFlat
            ? "text-muted-foreground"
            : isSuccess
              ? "text-success"
              : "text-destructive",
        )}
      >
        <span aria-hidden="true" className="text-[9px]">{arrow}</span>
        <span>{amount}</span>
        <span className="font-normal text-muted-foreground">so với kỳ trước</span>
        <span className="sr-only"> ({word})</span>
      </div>
    );
  }

  let sparkNode: React.ReactNode = null;
  if (spark && spark.length > 1) {
    const max = Math.max(...spark);
    const min = Math.min(...spark);
    const rng = max - min || 1;
    const pts = spark.map(
      (v, i) =>
        `${((i / (spark.length - 1)) * 100).toFixed(1)},${(28 - ((v - min) / rng) * 24).toFixed(1)}`,
    );
    const lastStr = pts[pts.length - 1] ?? "0,0";
    const last = lastStr.split(",");
    const cx = last[0] ?? "100";
    const cy = last[1] ?? "16";

    sparkNode = (
      <svg
        className="w-[72px] h-[28px] shrink-0 overflow-visible"
        viewBox="-3 0 106 32"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline
          points={pts.join(" ")}
          vectorEffect="non-scaling-stroke"
          fill="none"
          stroke="var(--viz-prev)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="3" fill="var(--viz-1)" />
      </svg>
    );
  }

  return (
    <div
      className={cn(
        "grid content-start gap-1 min-w-0 p-4 border border-border rounded-lg bg-card",
        className,
      )}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex items-end justify-between gap-2">
        <div className="text-[clamp(20px,2vw,28px)] font-semibold leading-tight text-foreground whitespace-nowrap">
          {typeof value === "number" ? f(value) : value}
        </div>
        {sparkNode}
      </div>
      {deltaNode}
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

export function KpiGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
