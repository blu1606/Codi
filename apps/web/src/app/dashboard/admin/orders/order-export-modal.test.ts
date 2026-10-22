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

  it("handles dynamic import chunk rejection gracefully without stuck loading", async () => {
    // Giả lập lỗi tải chunk module dynamic import (Failed to fetch dynamically imported module)
    const originalImport = vi.fn();
    const spy = vi.spyOn(mockGetAdminOrdersExportAction, "mockImplementationOnce");

    // Mock action rejection tương đương với import fail bằng cách reject ngay
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
