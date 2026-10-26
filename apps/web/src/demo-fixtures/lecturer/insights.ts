import type { LecturerInsightsDto } from "@/lib/lecturer-insights-service";
import { analyticsWindow, type RevenueDayRow, type RevenueTotals } from "@/lib/analytics-contract";
import { previousWindowOf, windowDayKeys } from "@/lib/analytics-formulas";
import { LAB_NOW } from "@/demo-fixtures/commerce/s36-admin-insights";

/** S29b lab payloads. Shapes match LecturerInsightsDto; the revenue numbers follow the same formulas as the service. */

export const lecturerInsightsNoCourses: LecturerInsightsDto = { state: "no-courses" };
export const lecturerInsightsNoPublished: LecturerInsightsDto = { state: "no-published" };

function days(window: ReturnType<typeof analyticsWindow>, seed: number, quiet: boolean): RevenueDayRow[] {
  return windowDayKeys(window).map((date, i) => {
    if (quiet) return { date, gross: 0, discount: 0, net: 0, refunds: 0 };
    const wave = 0.5 + 0.5 * Math.sin((i + seed) / 3);
    const gross = Math.round((300_000 + wave * 900_000) / 1_000) * 1_000;
    const discount = Math.round((gross * 0.08) / 1_000) * 1_000;
    return { date, gross, discount, net: gross - discount, refunds: i % 11 === 6 ? 790_000 : 0 };
  });
}

function totals(rows: RevenueDayRow[], paidOrders: number): RevenueTotals {
  const sum = (key: keyof Omit<RevenueDayRow, "date">) => rows.reduce((s, r) => s + r[key], 0);
  const net = sum("net");
  return {
    gross: sum("gross"),
    discount: sum("discount"),
    net,
    paidOrders,
    averageOrderValue: paidOrders ? Math.round(net / paidOrders) : 0,
    refunds: sum("refunds"),
    refundCount: rows.filter((r) => r.refunds > 0).length,
  };
}

/** Ready payload for one period. `quiet` is a course that is published but has no revenue in the period. */
export function lecturerInsightsReady(period: "7" | "30" | "90" = "30", quiet = false): LecturerInsightsDto {
  const window = analyticsWindow(period, LAB_NOW);
  const previousWindow = previousWindowOf(window);
  const daily = days(window, 0, quiet);
  const previousDaily = days(previousWindow, 3, quiet);
  const paidOrders = quiet ? 0 : 23;
  return {
    state: "ready",
    window,
    previousWindow,
    totals: totals(daily, paidOrders),
    previousTotals: totals(previousDaily, quiet ? 0 : 19),
    daily,
    previousDaily,
    courses: quiet
      ? []
      : [
          { courseId: "course-react-001", title: "React dự án thực tế", gross: 15_840_000, discount: 1_267_200, net: 14_572_800, refunds: 0, paidOrders: 16 },
          { courseId: "course-node-001", title: "Node.js & Express xây dựng REST API", gross: 2_610_000, discount: 208_800, net: 2_401_200, refunds: 0, paidOrders: 7 },
        ],
  };
}
