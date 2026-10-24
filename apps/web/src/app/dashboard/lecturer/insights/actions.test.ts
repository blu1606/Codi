import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock services & lecturer-auth
const mockVerifyLecturerSession = vi.fn();
vi.mock("@/lib/lecturer-auth", () => ({
  verifyLecturerSession: () => mockVerifyLecturerSession(),
}));

const mockDbSelect = vi.fn();
vi.mock("@/services", () => ({
  db: {
    select: (...args: any[]) => mockDbSelect(...args),
  },
}));

import { getLecturerInsightsData } from "./actions";

describe("Lecturer Insights Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyLecturerSession.mockResolvedValue({
      id: "lecturer-123",
      name: "Thầy Hưng",
    });
  });

  it("returns state 'no_courses' when lecturer has no courses at all", async () => {
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const res = await getLecturerInsightsData("30d");
    expect(res.state).toBe("no_courses");
    expect(res.kpiData).toEqual([]);
    expect(res.totalRevenue).toBe(0);
  });

  it("returns state 'no_published_courses' when courses exist but none are published or hidden", async () => {
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { id: "c1", title: "Khóa nháp", status: "draft" },
          { id: "c2", title: "Khóa chờ duyệt", status: "pending" },
        ]),
      }),
    });

    const res = await getLecturerInsightsData("30d");
    expect(res.state).toBe("no_published_courses");
  });

  it("returns state 'no_sales' when published courses have zero paid orders in the period", async () => {
    // 1. myCourses query
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { id: "c1", title: "Khóa Đã Xuất Bản", status: "published" },
        ]),
      }),
    });

    // 2. paidItems query
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await getLecturerInsightsData("30d");
    expect(res.state).toBe("no_sales");
    expect(res.totalRevenue).toBe(0);
    expect(res.totalOrders).toBe(0);
    expect(res.kpiData).toHaveLength(4);
    expect(res.courseRevenues).toHaveLength(1);
    expect(res.courseRevenues[0].revenue).toBe(0);
  });

  it("returns state 'ready' with proportional discount and accurate revenue calculations", async () => {
    const now = new Date();
    const paidAtCurr = new Date(now.getTime() - 2 * 86400000); // 2 days ago
    const paidAtPrev = new Date(now.getTime() - 40 * 86400000); // 40 days ago

    // 1. myCourses query
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { id: "c1", title: "Khóa Lập Trình TypeScript", status: "published" },
          { id: "c2", title: "Khóa React Nâng Cao", status: "published" },
        ]),
      }),
    });

    // 2. paidItems query: 2 items in current period, 1 in previous
    mockDbSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              orderId: 1001,
              courseId: "c1",
              unitPrice: 500000,
              orderSubtotal: 1000000,
              orderDiscount: 200000, // 50% proportional discount = 100,000 -> net = 400,000
              orderTotal: 800000,
              paidAt: paidAtCurr,
            },
            {
              orderId: 1002,
              courseId: "c2",
              unitPrice: 600000,
              orderSubtotal: 600000,
              orderDiscount: 0,
              orderTotal: 600000,
              paidAt: paidAtCurr,
            },
            {
              orderId: 999,
              courseId: "c1",
              unitPrice: 500000,
              orderSubtotal: 500000,
              orderDiscount: 0,
              orderTotal: 500000,
              paidAt: paidAtPrev,
            },
          ]),
        }),
      }),
    });

    const res = await getLecturerInsightsData("30d");
    expect(res.state).toBe("ready");
    // Current net: (500000 - 100000) + (600000 - 0) = 1,000,000
    expect(res.totalRevenue).toBe(1000000);
    expect(res.totalOrders).toBe(2);

    // KPI cards
    const grossKpi = res.kpiData.find((k) => k.key === "gross")!;
    expect(grossKpi.current).toBe(1100000); // 500k + 600k
    expect(grossKpi.previous).toBe(500000);

    const netKpi = res.kpiData.find((k) => k.key === "net")!;
    expect(netKpi.current).toBe(1000000);
    expect(netKpi.previous).toBe(500000);
    expect(netKpi.deltaPercent).toBe(100);

    // Course revenues ranking
    expect(res.courseRevenues).toHaveLength(2);
    // c2 has 600k, c1 has 400k -> c2 is first
    expect(res.courseRevenues[0].courseId).toBe("c2");
    expect(res.courseRevenues[0].revenue).toBe(600000);
    expect(res.courseRevenues[0].percentage).toBe(60);

    expect(res.courseRevenues[1].courseId).toBe("c1");
    expect(res.courseRevenues[1].revenue).toBe(400000);
    expect(res.courseRevenues[1].percentage).toBe(40);
  });
});
