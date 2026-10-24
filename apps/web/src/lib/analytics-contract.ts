export type AnalyticsPeriod = "7" | "30" | "90" | "month";
export type AdminMetric = "users" | "courses" | "orders";

export function analyticsWindow(period: string, now = new Date()) {
  if (!["7", "30", "90", "month"].includes(period)) throw new Error("Invalid analytics period");
  const day = 86_400_000;
  const offset = 7 * 3_600_000;
  const local = new Date(now.getTime() + offset);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const days = period === "month" ? local.getUTCDate() : Number(period);
  return {
    start: new Date(midnight - offset - (days - 1) * day).toISOString(),
    end: new Date(midnight - offset + day).toISOString(),
    timeZone: "Asia/Ho_Chi_Minh" as const,
    period: period as AnalyticsPeriod,
  };
}

export interface CountData {
  value: number;
  window: ReturnType<typeof analyticsWindow>;
}
export interface LearnerStatsData {
  enrollments: number;
  completedLessons: number;
  studiedLessons: number;
  studyMinutes: null;
  window: ReturnType<typeof analyticsWindow>;
}

export const ANALYTICS_UNAVAILABLE = "Chưa khả dụng trong bản prototype: biểu đồ, so sánh, chi tiết và xuất CSV chưa có dữ liệu được xác minh.";
export const FINANCE_UNAVAILABLE = "Chưa khả dụng: chưa xác định cách ghi nhận doanh thu, giảm giá và hoàn tiền theo kỳ. Không ước tính số tiền hoặc số đơn cần đối soát.";
