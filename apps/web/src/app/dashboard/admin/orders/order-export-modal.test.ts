// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderExportModal } from "./order-export-modal";
import type { AdminOrderSummaryItem } from "@/lib/admin-orders-service";

const mockGetAdminOrdersExportAction = vi.fn();

vi.mock("../actions", () => ({
  getAdminOrdersExportAction: (...args: any[]) => mockGetAdminOrdersExportAction(...args),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const sampleOrders: AdminOrderSummaryItem[] = [
  {
    id: 1,
    code: "ORD-001",
    userId: "u1",
    buyerName: "Nguyen Van A",
    buyerEmail: "a@codi.vn",
    subtotal: 500000,
    discountAmount: 0,
    totalAmount: 500000,
    receivedAmount: 500000,
    status: "paid",
    failReason: null,
    needsReconciliation: false,
    isBuyNow: false,
    voucherCode: null,
    coursesText: "React Pro",
    createdAt: "2026-10-15T10:00:00Z",
    paidAt: "2026-10-15T10:05:00Z",
    cancelledAt: null,
    isOverdue: false,
  },
];

describe("OrderExportModal Component", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAdminOrdersExportAction.mockReset();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:order-export");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    root = undefined;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("uses the dialog period and toggles all current filters in action arguments and downloaded CSV", async () => {
    const otherOrder = {
      ...sampleOrders[0], id: 2, code: "ORD-002", buyerName: "Tran Van B",
      buyerEmail: "b@example.test", status: "pending", paidAt: null,
    };
    mockGetAdminOrdersExportAction
      .mockResolvedValueOnce(sampleOrders)
      .mockResolvedValueOnce(sampleOrders)
      .mockResolvedValueOnce([...sampleOrders, otherOrder])
      .mockResolvedValueOnce(sampleOrders);
    const onOpenChange = vi.fn();
    await act(async () => {
      root!.render(createElement(OrderExportModal, {
        open: true, onOpenChange, orders: [{ ...sampleOrders[0], code: "FALLBACK" }],
        initialRange: "90", currentStatus: "all",
        currentFilter: { status: "paid", q: "Nguyen Van A", overdue: true, reconciliation: true },
      }));
    });
    const filteredQuery = {
      range: "90", status: "paid", q: "Nguyen Van A", overdueOnly: true, reconciliationOnly: true,
    };
    expect(mockGetAdminOrdersExportAction).toHaveBeenLastCalledWith(filteredQuery);
    const rangeButton = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "7 ngày")!;
    await act(async () => { rangeButton.click(); });
    expect(mockGetAdminOrdersExportAction).toHaveBeenLastCalledWith({ ...filteredQuery, range: "7" });

    const exportButton = document.querySelector<HTMLButtonElement>("button:has(svg)")!;
    const download = vi.mocked(HTMLAnchorElement.prototype.click);
    const expectDownload = async (codes: string[]) => {
      expect(exportButton.disabled).toBe(false);
      await act(async () => { exportButton.click(); });
      const blob = vi.mocked(URL.createObjectURL).mock.lastCall![0] as Blob;
      expect(blob.type).toBe("text/csv;charset=utf-8");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]);
      const csv = new TextDecoder().decode(bytes);
      expect(csv.split("\r\n")).toHaveLength(codes.length + 1);
      expect(csv).toContain('"Mã giao dịch","Người mua","Email"');
      for (const code of codes) expect(csv).toContain(`"${code}"`);
      expect(csv).toContain('"Nguyen Van A","a@codi.vn","React Pro"');
      expect(csv).toContain('"500000","Đã thanh toán"');
      expect(csv).not.toContain("FALLBACK");
      expect(csv.includes('"Tran Van B","b@example.test"')).toBe(codes.includes("ORD-002"));
      const anchor = download.mock.instances.at(-1)! as HTMLAnchorElement;
      expect(anchor.href).toBe("blob:order-export");
      expect(anchor.download).toMatch(/^codi-don-hang-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
    };
    await expectDownload(["ORD-001"]);

    const filterCheckbox = document.getElementById("exp-filter")!;
    await act(async () => { filterCheckbox.click(); });
    expect(mockGetAdminOrdersExportAction).toHaveBeenLastCalledWith({
      range: "7", status: "all", q: "", overdueOnly: false, reconciliationOnly: false,
    });
    await expectDownload(["ORD-001", "ORD-002"]);

    await act(async () => { filterCheckbox.click(); });
    expect(mockGetAdminOrdersExportAction).toHaveBeenLastCalledWith({ ...filteredQuery, range: "7" });
    await expectDownload(["ORD-001"]);
    expect(download).toHaveBeenCalledTimes(3);
    expect(mockGetAdminOrdersExportAction).toHaveBeenCalledTimes(4);
  });

  it("blocks CSV export while query is pending, and only exports when latest selected range data is ready", async () => {
    let resolveFirstQuery: ((orders: any[]) => void) | null = null;
    let resolveSecondQuery: ((orders: any[]) => void) | null = null;

    mockGetAdminOrdersExportAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstQuery = resolve;
        })
    );

    await act(async () => {
      root!.render(
        createElement(OrderExportModal, {
          open: true,
          onOpenChange: vi.fn(),
          orders: sampleOrders,
          currentStatus: "all",
        })
      );
    });

    // 1. Initial load (range 30) is pending
    const exportBtn = document.querySelector<HTMLButtonElement>("button:has(svg)")!;
    expect(exportBtn).not.toBeNull();
    expect(exportBtn.disabled).toBe(true);
    expect(document.body.textContent).toContain("Đang tải dữ liệu kỳ xuất (30 ngày)...");

    // 2. User switches range to 'all' while 30-day query is still pending
    mockGetAdminOrdersExportAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecondQuery = resolve;
        })
    );

    const allRangeBtn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === "Tất cả"
    )!;
    expect(allRangeBtn).toBeDefined();

    await act(async () => {
      allRangeBtn.click();
    });

    // Button must still be disabled and summary indicates 'Tất cả' is loading
    expect(exportBtn.disabled).toBe(true);
    expect(document.body.textContent).toContain("Đang tải dữ liệu kỳ xuất (Tất cả)...");

    // Resolve the first (stale) 30-day request
    await act(async () => {
      resolveFirstQuery!([sampleOrders[0]]);
    });

    // Since the latest selection is 'all' and second query is still pending, button MUST still be disabled
    expect(exportBtn.disabled).toBe(true);

    // Resolve the second query for 'all' with 2 orders
    const allOrders = [
      sampleOrders[0],
      {
        ...sampleOrders[0],
        id: 2,
        code: "ORD-002",
        totalAmount: 1000000,
        coursesText: "Next.js Mastery",
      },
    ];

    await act(async () => {
      resolveSecondQuery!(allOrders);
    });

    // Data ready: button is enabled and live summary reflects 2 orders
    expect(exportBtn.disabled).toBe(false);
    expect(document.body.textContent).toContain("2 đơn");
    expect(document.body.textContent).toContain("1.500.000 ₫");
  });

  it("handles query rejection gracefully: displays error with retry button and prevents export of stale/incomplete data", async () => {
    mockGetAdminOrdersExportAction.mockRejectedValueOnce(new Error("Network timeout"));

    await act(async () => {
      root!.render(
        createElement(OrderExportModal, {
          open: true,
          onOpenChange: vi.fn(),
          orders: sampleOrders,
          currentStatus: "all",
        })
      );
    });

    // Error state rendered
    expect(document.body.textContent).toContain("Network timeout");
    const retryBtn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === "Thử lại"
    )!;
    expect(retryBtn).toBeDefined();

    // Export button MUST be disabled
    const exportBtn = document.querySelector<HTMLButtonElement>("button:has(svg)")!;
    expect(exportBtn.disabled).toBe(true);

    await act(async () => { exportBtn.click(); });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("500.000 ₫");

    // Click retry with successful response
    mockGetAdminOrdersExportAction.mockResolvedValueOnce(sampleOrders);

    await act(async () => {
      retryBtn.click();
    });

    // Error cleared, export button enabled with correct summary
    expect(document.body.textContent).not.toContain("Network timeout");
    expect(exportBtn.disabled).toBe(false);
    expect(document.body.textContent).toContain("1 đơn");
  });

  it("handles an action rejection carrying a chunk-error message without stuck loading", async () => {
    // The actions module is already mocked; this does not simulate module loading failure.
    mockGetAdminOrdersExportAction.mockRejectedValueOnce(
      new Error("Failed to fetch dynamically imported module")
    );

    await act(async () => {
      root!.render(
        createElement(OrderExportModal, {
          open: true,
          onOpenChange: vi.fn(),
          orders: sampleOrders,
          currentStatus: "all",
        })
      );
    });

    // Loading MUST be turned off and error displayed
    expect(document.body.textContent).toContain("Failed to fetch dynamically imported module");
    const retryBtn = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === "Thử lại"
    )!;
    expect(retryBtn).toBeDefined();

    // Export button disabled
    const exportBtn = document.querySelector<HTMLButtonElement>("button:has(svg)")!;
    expect(exportBtn.disabled).toBe(true);
  });
});
