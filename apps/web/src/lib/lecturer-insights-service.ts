/**
 * Pure domain logic and calculation helpers for Lecturer Insights & Revenue (Screen S29b).
 * Adheres to PRODUCT.md §7.21–23, Flow T4, and Mockup js/lecturer-insights.js.
 */

export type InsightsPeriodKey = "7d" | "30d" | "90d";

export interface PeriodOption {
  key: InsightsPeriodKey;
  label: string;
  days: number;
}

export const INSIGHTS_PERIODS: PeriodOption[] = [
  { key: "7d", label: "Tuần này", days: 7 },
  { key: "30d", label: "30 ngày", days: 30 },
  { key: "90d", label: "90 ngày", days: 90 },
];

export interface KpiCardData {
  key: "gross" | "net" | "orders" | "discount";
  label: string;
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number;
  isPositive: boolean;
  formattedCurrent: string;
  formattedPrevious: string;
}

export interface ChartDataPoint {
  date: string;
  label: string;
  current: number;
  previous: number;
}

export interface ChartDataResult {
  series: ChartDataPoint[];
  currentTotal: number;
  averagePerDay: number;
}

export interface CourseRevenueItem {
  courseId: string;
  courseTitle: string;
  ordersCount: number;
  revenue: number;
  percentage: number;
}

export interface LecturerInsightsDto {
  state: "ready" | "no_courses" | "no_published_courses" | "no_sales";
  period: InsightsPeriodKey;
  kpiData: KpiCardData[];
  chartData: ChartDataResult;
  courseRevenues: CourseRevenueItem[];
  totalRevenue: number;
  totalOrders: number;
}

/**
 * Tính toán các mốc thời gian cho kỳ hiện tại và kỳ trước (để so sánh đối ứng).
 */
export function calculatePeriodDates(
  period: InsightsPeriodKey = "30d",
  now: Date = new Date()
): {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  days: number;
} {
  const option = INSIGHTS_PERIODS.find((p) => p.key === period) || INSIGHTS_PERIODS[1];
  const days = option.days;

  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - days);

  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - days);

  const prevEnd = new Date(start);

  return { start, end, prevStart, prevEnd, days };
}

/**
 * Tính tỉ lệ phần trăm thay đổi giữa kỳ này và kỳ trước.
 */
export function calculateDeltaPercent(current: number, previous: number): number {
  if (!previous || previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Định dạng tiền tệ VND chuẩn Việt Nam.
 */
export function formatVnd(amount: number): string {
  if (typeof amount !== "number" || isNaN(amount)) return "0 ₫";
  return new Intl.NumberFormat("vi-VN").format(Math.round(amount)) + " ₫";
}

/**
 * Định dạng số nguyên chuẩn Việt Nam.
 */
export function formatNumber(num: number): string {
  if (typeof num !== "number" || isNaN(num)) return "0";
  return new Intl.NumberFormat("vi-VN").format(Math.round(num));
}

/**
 * Tạo dữ liệu 4 thẻ KPI: Doanh thu gộp, Doanh thu ròng, Đơn thanh toán, Tiền giảm giá.
 */
export function buildKpiData(
  curr: { gross: number; net: number; orders: number; discount: number },
  prev: { gross: number; net: number; orders: number; discount: number }
): KpiCardData[] {
  const items: Array<{
    key: "gross" | "net" | "orders" | "discount";
    label: string;
    isNumeric: boolean;
  }> = [
    { key: "gross", label: "Doanh thu gộp", isNumeric: false },
    { key: "net", label: "Doanh thu ròng", isNumeric: false },
    { key: "orders", label: "Đơn thanh toán", isNumeric: true },
    { key: "discount", label: "Tiền giảm giá", isNumeric: false },
  ];

  return items.map((item) => {
    const currentVal = curr[item.key] || 0;
    const previousVal = prev[item.key] || 0;
    const delta = currentVal - previousVal;
    const deltaPercent = calculateDeltaPercent(currentVal, previousVal);
    const isPositive = delta >= 0;

    return {
      key: item.key,
      label: item.label,
      current: currentVal,
      previous: previousVal,
      delta,
      deltaPercent,
      isPositive,
      formattedCurrent: item.isNumeric ? formatNumber(currentVal) : formatVnd(currentVal),
      formattedPrevious: item.isNumeric ? formatNumber(previousVal) : formatVnd(previousVal),
    };
  });
}

/**
 * Gom nhóm doanh thu theo từng ngày trong kỳ để vẽ biểu đồ đường (Line chart B2).
 */
export function generateChartSeries(
  currentRecords: Array<{ paidAt: Date | string; amount: number }>,
  previousRecords: Array<{ paidAt: Date | string; amount: number }>,
  period: InsightsPeriodKey,
  now: Date = new Date()
): ChartDataResult {
  const option = INSIGHTS_PERIODS.find((p) => p.key === period) || INSIGHTS_PERIODS[1];
  const days = option.days;

  const pad = (n: number) => String(n).padStart(2, "0");
  const formatDateKey = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const formatDisplayLabel = (d: Date) =>
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

  const currentMap = new Map<string, number>();
  const previousMap = new Map<string, number>();

  currentRecords.forEach((r) => {
    const d = new Date(r.paidAt);
    if (!isNaN(d.getTime())) {
      const k = formatDateKey(d);
      currentMap.set(k, (currentMap.get(k) || 0) + r.amount);
    }
  });

  previousRecords.forEach((r) => {
    const d = new Date(r.paidAt);
    if (!isNaN(d.getTime())) {
      const k = formatDateKey(d);
      previousMap.set(k, (previousMap.get(k) || 0) + r.amount);
    }
  });

  const series: ChartDataPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const currD = new Date(now);
    currD.setDate(currD.getDate() - i);
    const currKey = formatDateKey(currD);

    const prevD = new Date(now);
    prevD.setDate(prevD.getDate() - days - i);
    const prevKey = formatDateKey(prevD);

    series.push({
      date: currKey,
      label: formatDisplayLabel(currD),
      current: currentMap.get(currKey) || 0,
      previous: previousMap.get(prevKey) || 0,
    });
  }

  const currentTotal = series.reduce((sum, item) => sum + item.current, 0);
  const averagePerDay = days > 0 ? Math.round(currentTotal / days) : 0;

  return {
    series,
    currentTotal,
    averagePerDay,
  };
}
