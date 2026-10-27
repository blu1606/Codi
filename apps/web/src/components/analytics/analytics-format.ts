import type { AnalyticsWindow } from "@/lib/analytics-contract";

/** GMT+7 calendar day ("2026-10-23") of an ISO instant. */
export function dayKeyOfIso(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** "2026-10-23" (GMT+7 day key) to "23/10". */
export function dayLabel(dayKey: string): string {
  const [, month, day] = dayKey.split("-");
  return `${day}/${month}`;
}

/** "2026-10-23" to "23/10/2026". */
export function dayLabelFull(dayKey: string): string {
  const [year, month, day] = dayKey.split("-");
  return `${day}/${month}/${year}`;
}

/** Date range text for the current window, with the comparison window when comparison is shown. */
export function rangeLabel(window: AnalyticsWindow, previousWindow?: AnalyticsWindow): string {
  const last = (w: AnalyticsWindow) => dayKeyOfIso(new Date(Date.parse(w.end) - 1).toISOString());
  const range = (w: AnalyticsWindow) => `${dayLabelFull(dayKeyOfIso(w.start))} – ${dayLabelFull(last(w))}`;
  return previousWindow
    ? `${range(window)} (GMT+7) · so với ${range(previousWindow)}`
    : `${range(window)} (GMT+7)`;
}

/** Sum of one numeric field across rows. */
export function sumOf<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}
