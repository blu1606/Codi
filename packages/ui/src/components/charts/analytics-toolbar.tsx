"use client";

import * as React from "react";
import { cn } from "@codi-1/ui/lib/utils";
import { Checkbox } from "@codi-1/ui/components/checkbox";

export type PeriodValue = "7" | "30" | "90" | "month";

export interface PeriodOption {
  value: PeriodValue;
  label: string;
}

export interface AnalyticsToolbarProps {
  periods?: PeriodOption[];
  selectedPeriod: PeriodValue;
  onSelectPeriod: (period: PeriodValue) => void;
  compare?: boolean;
  onToggleCompare?: (compare: boolean) => void;
  rangeText?: string;
  extraFilters?: React.ReactNode;
  className?: string;
}

const DEFAULT_PERIODS: PeriodOption[] = [
  { value: "7", label: "7 ngày" },
  { value: "30", label: "30 ngày" },
  { value: "90", label: "Quý" },
];

export function AnalyticsToolbar({
  periods = DEFAULT_PERIODS,
  selectedPeriod,
  onSelectPeriod,
  compare,
  onToggleCompare,
  rangeText,
  extraFilters,
  className,
}: AnalyticsToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 select-none text-sm",
        className,
      )}
      role="group"
      aria-label="Khoảng thời gian áp dụng cho mọi thẻ"
    >
      {/* Segmented Period Control */}
      <div
        className="inline-flex p-0.5 border border-border rounded-md bg-muted"
        role="group"
        aria-label="Khoảng thời gian"
      >
        {periods.map((p) => {
          const isSelected = selectedPeriod === p.value;
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectPeriod(p.value)}
              className={cn(
                "min-h-9 px-3 rounded text-sm transition-all cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isSelected
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Compare Checkbox */}
      {onToggleCompare && compare !== undefined && (
        <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium">
          <Checkbox
            checked={compare}
            onCheckedChange={(checked) => onToggleCompare(!!checked)}
            className="size-4"
          />
          <span>So sánh: kỳ trước</span>
        </label>
      )}

      {/* Extra custom filter slots (e.g. course select) */}
      {extraFilters}

      {/* Current Range Text */}
      {rangeText && (
        <span className="text-sm text-muted-foreground">{rangeText}</span>
      )}
    </div>
  );
}
