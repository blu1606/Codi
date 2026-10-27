import { analyticsWindow, type FinanceData, type OrderStatusBucket, type RevenueDayRow, type RevenueTotals } from "@/lib/analytics-contract";
import { previousWindowOf, windowDayKeys } from "@/lib/analytics-formulas";
import { LAB_NOW } from "./s36-admin-insights";

const sumOf = (rows: RevenueDayRow[], key: "gross" | "discount" | "net" | "refunds") => rows.reduce((s, r) => s + r[key], 0);

function dailyRevenue(window: ReturnType<typeof analyticsWindow>, seed: number): RevenueDayRow[] {
  return windowDayKeys(window).map((date, i) => {
    const wave = 0.5 + 0.5 * Math.sin((i + seed) / 3);
    const gross = Math.round((1_200_000 + wave * 2_400_000) / 1_000) * 1_000;
    const discount = Math.round((gross * 0.08) / 1_000) * 1_000;
    const refunds = i % 9 === 4 ? 790_000 : 0;
    return { date, gross, discount, net: gross - discount, refunds };
  });
}

function totalsFrom(days: RevenueDayRow[], paidOrders: number, refundCount: number): RevenueTotals {
  const gross = sumOf(days, "gross");
  const discount = sumOf(days, "discount");
  const net = sumOf(days, "net");
  return {
    gross,
    discount,
    net,
    paidOrders,
    averageOrderValue: paidOrders ? Math.round(net / paidOrders) : 0,
    refunds: sumOf(days, "refunds"),
    refundCount,
  };
}

const STATUS_ROWS: { bucket: OrderStatusBucket; orders: number; amount: number }[] = [
  { bucket: "paid", orders: 118, amount: 142_300_000 },
  { bucket: "awaiting", orders: 6, amount: 5_870_000 },
  { bucket: "underpaid", orders: 2, amount: 2_640_000 },
  { bucket: "expired", orders: 14, amount: 16_420_000 },
  { bucket: "failed", orders: 1, amount: 990_000 },
  { bucket: "cancelled", orders: 9, amount: 10_150_000 },
  { bucket: "refunded", orders: 2, amount: 1_580_000 },
];

/** S37 finance payload for one period. `quiet` returns the "no paid orders in period" variant. */
export function adminFinanceFixture(period: "7" | "30" | "90" = "30", quiet = false): FinanceData {
  const window = analyticsWindow(period, LAB_NOW);
  const previousWindow = previousWindowOf(window);
  const daily = quiet ? windowDayKeys(window).map((date) => ({ date, gross: 0, discount: 0, net: 0, refunds: 0 })) : dailyRevenue(window, 0);
  const previousDaily = quiet ? windowDayKeys(previousWindow).map((date) => ({ date, gross: 0, discount: 0, net: 0, refunds: 0 })) : dailyRevenue(previousWindow, 4);
  const paidOrders = quiet ? 0 : 118;
  return {
    window,
    previousWindow,
    totals: totalsFrom(daily, paidOrders, quiet ? 0 : 2),
    previousTotals: totalsFrom(previousDaily, quiet ? 0 : 97, quiet ? 0 : 3),
    daily,
    previousDaily,
    statusDistribution: quiet ? STATUS_ROWS.map((row) => ({ ...row, orders: 0, amount: 0 })) : STATUS_ROWS,
    courses: quiet
      ? []
      : [
          { courseId: "course-react-001", title: "React dự án thực tế", gross: 61_200_000, discount: 4_900_000, net: 56_300_000, refunds: 790_000, paidOrders: 52 },
          { courseId: "course-node-001", title: "Node.js & Express xây dựng REST API", gross: 38_400_000, discount: 3_072_000, net: 35_328_000, refunds: 0, paidOrders: 31 },
          { courseId: "course-ts-002", title: "TypeScript cho người viết JavaScript", gross: 18_900_000, discount: 1_512_000, net: 17_388_000, refunds: 0, paidOrders: 22 },
          { courseId: "course-sql-003", title: "SQL và thiết kế cơ sở dữ liệu", gross: 6_200_000, discount: 0, net: 6_200_000, refunds: 0, paidOrders: 8 },
        ],
    paymentTime: quiet
      ? { buckets: [{ label: "< 1 phút", orders: 0 }, { label: "1–5 phút", orders: 0 }, { label: "5–15 phút", orders: 0 }, { label: "15–30 phút", orders: 0 }, { label: "Sau 30 phút", orders: 0 }], medianLabel: null }
      : { buckets: [{ label: "< 1 phút", orders: 18 }, { label: "1–5 phút", orders: 46 }, { label: "5–15 phút", orders: 37 }, { label: "15–30 phút", orders: 17 }, { label: "Sau 30 phút", orders: 0 }], medianLabel: "1–5 phút" },
    vouchers: quiet
      ? []
      : [
          { code: "WELCOME20", orders: 41, discount: 6_880_000, net: 54_200_000 },
          { code: "REACT10", orders: 19, discount: 1_970_000, net: 17_700_000 },
          { code: "BACKEND50K", orders: 7, discount: 350_000, net: 4_950_000 },
        ],
    reconciliation: quiet
      ? { underpaid: 0, stalePending: 0, flagged: 0, items: [] }
      : {
          underpaid: 2,
          stalePending: 1,
          flagged: 1,
          items: [
            { code: "CODI10342", status: "pending", totalAmount: 1_290_000, receivedAmount: 645_000, createdAt: "2026-10-24T09:12:00.000Z", reasons: ["underpaid", "stale"] },
            { code: "CODI10351", status: "pending", totalAmount: 890_000, receivedAmount: 300_000, createdAt: "2026-10-25T02:40:00.000Z", reasons: ["underpaid"] },
            { code: "CODI10368", status: "paid", totalAmount: 1_690_000, receivedAmount: 1_890_000, createdAt: "2026-10-25T13:05:00.000Z", reasons: ["flagged"] },
          ],
        },
  };
}
