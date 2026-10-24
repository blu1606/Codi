"use client";

import * as React from "react";
import { cn } from "@codi-1/ui/lib/utils";
import { formatNum } from "./chart-utils";

export interface ActivityDay {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface ActivityCalendarProps {
  days: ActivityDay[];
  today?: string;
  unit?: string;
  ariaLabel?: string;
  emptyText?: string;
  className?: string;
}

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WEEKDAYS_LONG = [
  "Chủ nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

export function ActivityCalendar({
  days,
  today,
  unit = "phút",
  ariaLabel = "Lịch hoạt động",
  emptyText = "Chưa có dữ liệu.",
  className,
}: ActivityCalendarProps) {
  const [activeDate, setActiveDate] = React.useState<string | null>(null);

  if (!days || !days.length) {
    return (
      <div className="grid place-items-center min-h-[120px] p-4 border border-dashed border-border rounded-md text-muted-foreground text-sm text-center">
        {emptyText}
      </div>
    );
  }

  const sortedDays = days.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const maxVal = Math.max(...sortedDays.map((d) => d.value || 0), 1);

  const getLevel = (v: number) => {
    if (!v) return 0;
    return Math.min(4, 1 + Math.floor((v / maxVal) * 3.999));
  };

  const getLevelColor = (lv: number) => {
    switch (lv) {
      case 0:
        return "bg-[var(--viz-s0)]";
      case 1:
        return "bg-[var(--viz-s1)]";
      case 2:
        return "bg-[var(--viz-s2)]";
      case 3:
        return "bg-[var(--viz-s3)]";
      case 4:
      default:
        return "bg-[var(--viz-s4)]";
    }
  };

  const parseUtcDate = (s: string) => new Date(`${s}T00:00:00Z`);
  const firstDay = sortedDays[0];
  const firstDate = firstDay ? parseUtcDate(firstDay.date) : new Date();
  const leadEmptyDays = (firstDate.getUTCDay() + 6) % 7; // Monday-first grid

  return (
    <div
      className={cn("flex flex-wrap items-end gap-x-6 gap-y-4 select-none", className)}
      role="group"
      aria-label={ariaLabel}
    >
      <div className="grid gap-1 w-[min(100%,320px)]">
        {/* Weekday headers: T2..CN */}
        <div className="grid grid-cols-7 gap-1" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
            <span
              key={dow}
              className="text-[11px] text-muted-foreground text-center font-medium"
            >
              {WEEKDAYS[dow]}
            </span>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {/* Lead empty cells */}
          {Array.from({ length: leadEmptyDays }, (_, i) => (
            <span key={`empty-${i}`} className="block aspect-square" aria-hidden="true" />
          ))}

          {/* Actual days */}
          {sortedDays.map((d) => {
            const dt = parseUtcDate(d.date);
            const lv = getLevel(d.value);
            const isToday = d.date === today;
            const isHovered = activeDate === d.date;
            const dayLabel = `${WEEKDAYS_LONG[dt.getUTCDay()]}, ${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;

            return (
              <div
                key={d.date}
                className={cn(
                  "relative block aspect-square rounded-xs cursor-pointer transition-all hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  getLevelColor(lv),
                  isToday && "ring-2 ring-foreground",
                )}
                onMouseEnter={() => setActiveDate(d.date)}
                onMouseLeave={() => setActiveDate(null)}
                onFocus={() => setActiveDate(d.date)}
                onBlur={() => setActiveDate(null)}
                tabIndex={0}
              >
                <span className="sr-only">
                  {dayLabel}: {d.value ? `${formatNum(d.value)} ${unit}` : "không học"}
                </span>

                {/* Tooltip */}
                {isHovered && (
                  <div
                    className="absolute bottom-full mb-1 z-50 px-2.5 py-1.5 rounded-md bg-foreground text-background text-xs shadow-pop pointer-events-none whitespace-nowrap tabular-nums left-1/2 -translate-x-1/2"
                    role="tooltip"
                  >
                    <div className="font-semibold">{dayLabel}</div>
                    <div>
                      {d.value ? `${formatNum(d.value)} ${unit}` : "Không học"}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-hidden="true">
        <span>Ít</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span
            key={l}
            className={cn("w-3.5 h-3.5 rounded-xs inline-block", getLevelColor(l))}
          />
        ))}
        <span>Nhiều</span>
      </div>
    </div>
  );
}
