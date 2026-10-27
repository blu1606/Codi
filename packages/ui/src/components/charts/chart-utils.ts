// Chart Kit formatting and utility helpers
// Source of truth: docs/mockup/js/charts.js

const viNumberFormat = new Intl.NumberFormat("vi-VN");

export function formatNum(n: number | string | null | undefined): string {
  if (typeof n === "number" && Number.isFinite(n)) {
    return viNumberFormat.format(Math.round(n * 10) / 10);
  }
  return String(n == null ? "—" : n);
}

export function formatOne(v: number): string {
  return viNumberFormat.format(Math.round(v * 10) / 10);
}

export function formatCompact(n: number | string | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return String(n ?? "—");
  const a = Math.abs(n);
  if (a >= 1e9) return formatOne(n / 1e9) + " tỷ";
  if (a >= 1e6) return formatOne(n / 1e6) + " tr";
  if (a >= 1e4) return formatOne(n / 1e3) + "k";
  return formatNum(n);
}

export function formatPct(v: number | null | undefined, digits: number = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return viNumberFormat.format(Number(v.toFixed(digits))) + "%";
}

export function formatVnd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "— ₫";
  return `${viNumberFormat.format(Math.round(v))} ₫`;
}

export function formatVndCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "— ₫";
  return `${formatCompact(v)} ₫`;
}

export function niceStep(range: number): number {
  const raw = range / 4 || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

export function calculateScale(maxVal: number): { top: number; ticks: number[] } {
  if (!(maxVal > 0)) return { top: 1, ticks: [0, 1] };
  const step = niceStep(maxVal);
  const top = Math.ceil(maxVal / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) {
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return { top, ticks };
}

export function pickLabels(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => Math.round(i * step));
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escapeCell = (v: string | number | null | undefined): string => {
    const s = String(v == null ? "" : v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = "\ufeff" + [headers, ...rows].map((r) => r.map(escapeCell).join(",")).join("\r\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const MASTERY_LABELS = [
  "Chưa học",
  "Đang học · mới bắt đầu",
  "Đang học · khá",
  "Thành thạo",
  "Thành thạo · vững",
] as const;

export const MASTERY_SHORT_LABELS = [
  "Chưa học",
  "Đang học",
  "Đang học",
  "Thành thạo",
  "Thành thạo",
] as const;

export function getMasteryLabel(level: number): string {
  return MASTERY_LABELS[Math.max(0, Math.min(4, Math.floor(level)))] ?? MASTERY_LABELS[0];
}

/** Whole-number scale for counts: integer steps only, so an axis never shows 0.2 repositories. */
export function integerScale(maxVal: number): { top: number; ticks: number[] } {
  const top = Math.max(1, Math.ceil(maxVal));
  const step = Math.max(1, Math.ceil(top / 4));
  const bound = Math.ceil(top / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= bound; v += step) ticks.push(v);
  return { top: bound, ticks };
}