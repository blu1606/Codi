import { describe, expect, it } from "vitest";
import { analyticsWindow } from "./analytics-contract";
import {
  adminDayRows,
  adminTotals,
  cohortFunnel,
  courseRevenue,
  gmt7DayKey,
  inWindow,
  itemRevenue,
  orderBucket,
  orderRevenue,
  paymentTime,
  previousWindowOf,
  reconciliation,
  statusDistribution,
  voucherUsage,
  windowDayKeys,
  type ItemFact,
  type OrderFact,
} from "./analytics-formulas";

// Window: 7 days ending on 23/10/2026 (GMT+7). Starts 17/10 00:00 GMT+7 = 16/10 17:00Z.
const NOW = new Date("2026-10-22T18:00:00Z");
const WINDOW = analyticsWindow("7", NOW);
const at = (iso: string) => new Date(iso);

function order(patch: Partial<OrderFact> & { id: number }): OrderFact {
  return {
    code: `CODI${String(patch.id).padStart(5, "0")}`,
    status: "paid",
    subtotal: 1_000_000,
    discountAmount: 0,
    totalAmount: 1_000_000,
    receivedAmount: 1_000_000,
    failReason: null,
    needsReconciliation: false,
    voucherCode: null,
    createdAt: at("2026-10-20T09:00:00Z"),
    paidAt: at("2026-10-20T09:05:00Z"),
    updatedAt: at("2026-10-20T09:05:00Z"),
    ...patch,
  };
}

describe("GMT+7 calendar boundaries", () => {
  it("assigns an instant to the Vietnamese calendar day, not the UTC day", () => {
    expect(gmt7DayKey("2026-10-22T16:59:59Z")).toBe("2026-10-22");
    expect(gmt7DayKey("2026-10-22T17:00:00Z")).toBe("2026-10-23");
  });

  it("lists exactly the days of the window, oldest first", () => {
    expect(windowDayKeys(WINDOW)).toEqual([
      "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23",
    ]);
  });

  it("treats the window as half-open at both edges", () => {
    expect(inWindow(at("2026-10-16T17:00:00Z"), WINDOW)).toBe(true);
    expect(inWindow(at("2026-10-16T16:59:59.999Z"), WINDOW)).toBe(false);
    expect(inWindow(at("2026-10-23T17:00:00Z"), WINDOW)).toBe(false);
    expect(inWindow(null, WINDOW)).toBe(false);
  });
});

describe("previous period", () => {
  it("is the same length, immediately before the window", () => {
    const previous = previousWindowOf(WINDOW);
    expect(previous.start).toBe("2026-10-09T17:00:00.000Z");
    expect(previous.end).toBe(WINDOW.start);
    expect(windowDayKeys(previous)).toHaveLength(7);
    expect(windowDayKeys(previous)[0]).toBe("2026-10-10");
  });
});

describe("revenue from orders (admin S37)", () => {
  const orders: OrderFact[] = [
    order({ id: 1, subtotal: 1_000_000, discountAmount: 100_000, totalAmount: 900_000, voucherCode: "WELCOME20" }),
    // Paid in the window and later refunded: still revenue of its paid day, refund on its update day.
    order({ id: 2, status: "refunded", subtotal: 500_000, totalAmount: 500_000, paidAt: at("2026-10-19T03:00:00Z"), updatedAt: at("2026-10-22T03:00:00Z") }),
    // Paid before the window, refunded inside it: refund only.
    order({ id: 3, status: "refunded", subtotal: 300_000, totalAmount: 300_000, paidAt: at("2026-10-01T03:00:00Z"), updatedAt: at("2026-10-21T03:00:00Z") }),
    // Paid just before the window start: outside.
    order({ id: 4, subtotal: 700_000, totalAmount: 700_000, paidAt: at("2026-10-16T16:59:59Z") }),
    // Open or failed orders never count as revenue.
    order({ id: 5, status: "pending", receivedAmount: 0, paidAt: null, subtotal: 400_000, totalAmount: 400_000 }),
    order({ id: 6, status: "failed", failReason: "expired", receivedAmount: 0, paidAt: null, subtotal: 400_000, totalAmount: 400_000 }),
    order({ id: 7, status: "cancelled", receivedAmount: 0, paidAt: null, subtotal: 400_000, totalAmount: 400_000 }),
  ];

  it("gross is pre-voucher subtotal, discount is the voucher, net is what the customer paid", () => {
    const { totals } = orderRevenue(WINDOW, orders);
    expect(totals.gross).toBe(1_000_000 + 500_000);
    expect(totals.discount).toBe(100_000);
    expect(totals.net).toBe(900_000 + 500_000);
    expect(totals.net).toBe(totals.gross - totals.discount);
    expect(totals.paidOrders).toBe(2);
    expect(totals.averageOrderValue).toBe(700_000);
  });

  it("refunds count refunded orders by the day they were last updated, including refunds of earlier payments", () => {
    const { totals, daily } = orderRevenue(WINDOW, orders);
    expect(totals.refunds).toBe(500_000 + 300_000);
    expect(totals.refundCount).toBe(2);
    expect(daily.find((d) => d.date === "2026-10-22")?.refunds).toBe(500_000);
    expect(daily.find((d) => d.date === "2026-10-21")?.refunds).toBe(300_000);
    expect(daily.find((d) => d.date === "2026-10-20")?.net).toBe(900_000);
  });

  it("builds one daily row per GMT+7 day with zeros where nothing happened", () => {
    const { daily } = orderRevenue(WINDOW, orders);
    expect(daily).toHaveLength(7);
    expect(daily.find((d) => d.date === "2026-10-17")).toEqual({ date: "2026-10-17", gross: 0, discount: 0, net: 0, refunds: 0 });
  });

  it("classifies orders created in the window into the S37 status buckets", () => {
    const created = [
      order({ id: 10, status: "pending", receivedAmount: 0, totalAmount: 900_000, subtotal: 900_000 }),
      order({ id: 11, status: "pending", receivedAmount: 450_000, totalAmount: 900_000, subtotal: 900_000 }),
      order({ id: 12, status: "failed", failReason: "expired", receivedAmount: 0 }),
      order({ id: 13, status: "failed", failReason: null, receivedAmount: 0 }),
      order({ id: 14, status: "cancelled", receivedAmount: 0 }),
      order({ id: 15, status: "refunded" }),
      order({ id: 16, status: "paid" }),
      order({ id: 17, createdAt: at("2026-10-01T03:00:00Z"), status: "paid" }),
    ];
    const rows = Object.fromEntries(statusDistribution(WINDOW, created).map((r) => [r.bucket, r.orders]));
    expect(rows).toMatchObject({ paid: 1, awaiting: 1, underpaid: 1, expired: 1, failed: 1, cancelled: 1, refunded: 1 });
    expect(orderBucket(created[1]!)).toBe("underpaid");
  });

  it("builds voucher usage from revenue orders only", () => {
    const withVoucher = [
      ...orders,
      order({ id: 20, voucherCode: "WELCOME20", subtotal: 800_000, discountAmount: 160_000, totalAmount: 640_000 }),
      order({ id: 21, voucherCode: "REACT10", status: "pending", receivedAmount: 0, paidAt: null }),
    ];
    expect(voucherUsage(WINDOW, withVoucher)).toEqual([
      { code: "WELCOME20", orders: 2, discount: 260_000, net: 1_540_000 },
    ]);
  });

  it("buckets payment time from creation to payment and reports the median bucket", () => {
    const paid = [0.5, 3, 10, 25, 40].map((minutes, i) => order({
      id: 30 + i,
      createdAt: at("2026-10-20T09:00:00Z"),
      paidAt: new Date(Date.parse("2026-10-20T09:00:00Z") + minutes * 60_000),
    }));
    const result = paymentTime(WINDOW, paid);
    expect(result.buckets.map((b) => b.orders)).toEqual([1, 1, 1, 1, 1]);
    expect(result.medianLabel).toBe("5–15 phút");
    expect(paymentTime(WINDOW, []).medianLabel).toBeNull();
  });
});

describe("reconciliation (S37 B8, independent of the period)", () => {
  const now = at("2026-10-26T00:00:00Z");
  const items = [
    order({ id: 40, status: "pending", receivedAmount: 0, paidAt: null, createdAt: at("2026-10-24T09:00:00Z") }),
    order({ id: 41, status: "pending", receivedAmount: 300_000, totalAmount: 900_000, paidAt: null, createdAt: at("2026-10-25T23:00:00Z") }),
    order({ id: 42, status: "paid", needsReconciliation: true, receivedAmount: 1_100_000, totalAmount: 1_000_000 }),
    order({ id: 43, status: "pending", receivedAmount: 0, paidAt: null, createdAt: at("2026-10-25T23:30:00Z") }),
  ];

  it("lists underpaid, stale (over 24 hours), and flagged orders with their reasons, oldest first", () => {
    const result = reconciliation(items, now);
    expect(result).toMatchObject({ underpaid: 1, stalePending: 1, flagged: 1 });
    expect(result.items.map((i) => [i.code, i.reasons])).toEqual([
      ["CODI00042", ["flagged"]],
      ["CODI00040", ["stale"]],
      ["CODI00041", ["underpaid"]],
    ]);
  });

  it("keeps an order that is both underpaid and stale as one item with two reasons", () => {
    const both = [order({ id: 50, status: "pending", receivedAmount: 1, totalAmount: 900_000, paidAt: null, createdAt: at("2026-10-24T00:00:00Z") })];
    expect(reconciliation(both, now).items[0]!.reasons).toEqual(["underpaid", "stale"]);
  });
});

describe("per-course revenue (S37 B3, S29b)", () => {
  const item = (patch: Partial<ItemFact> & Pick<ItemFact, "orderId" | "courseId" | "unitPrice">): ItemFact => ({
    courseTitle: patch.courseId.toUpperCase(),
    status: "paid",
    paidAt: at("2026-10-20T09:05:00Z"),
    updatedAt: at("2026-10-20T09:05:00Z"),
    subtotal: 1_000_000,
    discountAmount: 100_000,
    ...patch,
  });

  it("allocates each order's voucher across its lines in proportion to price", () => {
    const rows = courseRevenue(WINDOW, [
      item({ orderId: 1, courseId: "a", unitPrice: 600_000 }),
      item({ orderId: 1, courseId: "b", unitPrice: 400_000 }),
    ]);
    expect(rows.find((r) => r.courseId === "a")).toMatchObject({ gross: 600_000, discount: 60_000, net: 540_000, paidOrders: 1 });
    expect(rows.find((r) => r.courseId === "b")).toMatchObject({ gross: 400_000, discount: 40_000, net: 360_000 });
    expect(rows.reduce((s, r) => s + r.net, 0)).toBe(900_000);
  });

  it("counts a refunded line against the course, and counts distinct orders per course", () => {
    const rows = courseRevenue(WINDOW, [
      item({ orderId: 1, courseId: "a", unitPrice: 600_000 }),
      item({ orderId: 2, courseId: "a", unitPrice: 600_000, status: "refunded", paidAt: at("2026-10-18T09:00:00Z"), updatedAt: at("2026-10-22T09:00:00Z") }),
      item({ orderId: 2, courseId: "a", unitPrice: 600_000, status: "refunded", paidAt: at("2026-10-18T09:00:00Z"), updatedAt: at("2026-10-22T09:00:00Z") }),
    ]);
    const a = rows.find((r) => r.courseId === "a")!;
    expect(a.paidOrders).toBe(2);
    expect(a.refunds).toBe(2 * (600_000 - 60_000));
  });

  it("returns only the lines it was given, so a lecturer filter stays a filter", () => {
    const lecturerLines = [item({ orderId: 1, courseId: "mine", unitPrice: 600_000 })];
    const totals = itemRevenue(WINDOW, lecturerLines).totals;
    expect(totals).toMatchObject({ gross: 600_000, discount: 60_000, net: 540_000, paidOrders: 1 });
    expect(itemRevenue(WINDOW, []).totals.net).toBe(0);
  });
});

describe("S36 daily series and totals", () => {
  it("buckets a timestamp by GMT+7 day and fills missing days with zero", () => {
    const rows = adminDayRows(WINDOW, {
      signups: [at("2026-10-22T17:30:00Z")],
      newEnrolments: [],
      lessonsCompleted: [at("2026-10-20T03:00:00Z"), at("2026-10-20T04:00:00Z")],
      activeDays: ["2026-10-21", "2026-10-21", "2026-10-22"],
    });
    expect(rows.find((r) => r.date === "2026-10-23")?.signups).toBe(1);
    expect(rows.find((r) => r.date === "2026-10-22")?.signups).toBe(0);
    expect(rows.find((r) => r.date === "2026-10-20")?.lessonsCompleted).toBe(2);
    expect(rows.find((r) => r.date === "2026-10-21")?.activeLearners).toBe(2);
    expect(rows).toHaveLength(7);
  });

  it("averages active learners over every day of the window", () => {
    const rows = adminDayRows(WINDOW, { signups: [], newEnrolments: [], lessonsCompleted: [], activeDays: ["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"] });
    expect(adminTotals(rows)).toEqual({ signups: 0, newEnrolments: 0, lessonsCompleted: 0, activeLearnersAvg: 1 });
  });

  it("computes the signup cohort funnel as independent counts", () => {
    expect(cohortFunnel([
      { verified: true, purchased: true, firstLesson: true },
      { verified: true, purchased: false, firstLesson: false },
      { verified: false, purchased: true, firstLesson: false },
    ])).toEqual({ signups: 3, verified: 2, purchased: 2, firstLesson: 1 });
  });
});
