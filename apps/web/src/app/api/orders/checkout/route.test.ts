import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  headers: vi.fn(),
  requireRole: vi.fn(),
  createOrderFromCart: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@codi-1/auth", () => ({
  ROLE: { LEARNER: "LEARNER" },
  ForbiddenError: class ForbiddenError extends Error {},
  requireRole: mocks.requireRole,
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.getSession } },
  db: {},
}));
vi.mock("@/lib/checkout-cart", () => ({
  createOrderFromCart: mocks.createOrderFromCart,
  CheckoutError: class CheckoutError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = "CheckoutError";
    }
  },
}));

import { ForbiddenError } from "@codi-1/auth";
import { CheckoutError } from "@/lib/checkout-cart";
import { POST } from "./route";

function makePostRequest(body: unknown, contentType: string = "application/json") {
  return new NextRequest("http://localhost/api/orders/checkout", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/orders/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
  });

  it("returns 401 when user is not authenticated", async () => {
    mocks.getSession.mockResolvedValueOnce(null);

    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Vui lòng đăng nhập");
  });

  it("returns 403 when user is not a learner", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "u-admin" } });
    mocks.requireRole.mockRejectedValueOnce(new ForbiddenError("Forbidden"));

    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Chỉ học viên mới có thể đặt hàng");
  });

  it("returns 415 when Content-Type is not application/json", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "u-1" } });
    mocks.requireRole.mockResolvedValueOnce(undefined);

    const res = await POST(makePostRequest("raw text", "text/plain"));
    expect(res.status).toBe(415);
    const data = await res.json();
    expect(data.error).toBe("Yêu cầu Content-Type application/json");
  });

  it("returns 201 with order info on successful checkout", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "u-1" } });
    mocks.requireRole.mockResolvedValueOnce(undefined);
    mocks.createOrderFromCart.mockResolvedValueOnce({
      orderId: 100,
      orderCode: "CODI12345",
      totalAmount: 450000,
    });

    const res = await POST(makePostRequest({ voucherCode: "SALE10" }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual({
      orderId: 100,
      orderCode: "CODI12345",
      totalAmount: 450000,
    });
    expect(mocks.createOrderFromCart).toHaveBeenCalledWith(
      expect.anything(),
      "u-1",
      "SALE10",
      undefined,
    );
  });

  it("returns 409 with PENDING_ORDER_EXISTS when pending order conflict occurs", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "u-1" } });
    mocks.requireRole.mockResolvedValueOnce(undefined);
    mocks.createOrderFromCart.mockRejectedValueOnce(
      new CheckoutError(
        409,
        "Bạn đang có đơn hàng CODI55555 chờ thanh toán",
        "PENDING_ORDER_EXISTS",
      ),
    );

    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("PENDING_ORDER_EXISTS");
    expect(data.error).toContain("CODI55555");
  });

  it("returns 409 when voucher is invalid", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "u-1" } });
    mocks.requireRole.mockResolvedValueOnce(undefined);
    mocks.createOrderFromCart.mockRejectedValueOnce(
      new CheckoutError(409, "Mã giảm giá đã hết hạn"),
    );

    const res = await POST(makePostRequest({ voucherCode: "EXPIRED" }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("Mã giảm giá đã hết hạn");
  });

  it("passes replaceOrderId when force replacing existing pending order", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "u-1" } });
    mocks.requireRole.mockResolvedValueOnce(undefined);
    mocks.createOrderFromCart.mockResolvedValueOnce({
      orderId: 105,
      orderCode: "CODI10500",
      totalAmount: 600000,
    });

    const res = await POST(makePostRequest({ replaceOrderId: 99 }));
    expect(res.status).toBe(201);
    expect(mocks.createOrderFromCart).toHaveBeenCalledWith(
      expect.anything(),
      "u-1",
      undefined,
      99,
    );
  });
});
