import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  headers: vi.fn(),
  requireRole: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  getCartSummary: vi.fn(),
  validateVoucher: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@codi-1/auth", () => ({
  ROLE: { LEARNER: "LEARNER" },
  ForbiddenError: class ForbiddenError extends Error {},
  requireRole: mocks.requireRole,
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.getSession } },
  db: {
    select: mocks.select,
  },
}));
vi.mock("@/lib/cart-service", () => ({
  getCartSummary: mocks.getCartSummary,
  validateVoucher: mocks.validateVoucher,
}));

import { ForbiddenError } from "@codi-1/auth";
import { POST } from "./route";

function makeValidateRequest(body: unknown, contentType: string = "application/json") {
  return new NextRequest("http://localhost/api/vouchers/validate", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/vouchers/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getSession.mockResolvedValueOnce(null);

    const res = await POST(makeValidateRequest({ code: "SALE10" }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Vui lòng đăng nhập");
  });

  it("returns 403 when user is not learner", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "admin-1" } });
    mocks.requireRole.mockRejectedValueOnce(new ForbiddenError("Forbidden"));

    const res = await POST(makeValidateRequest({ code: "SALE10" }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Chỉ học viên mới có thể áp dụng mã giảm giá");
  });

  it("returns 415 when Content-Type is invalid", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "u-1" } });
    mocks.requireRole.mockResolvedValueOnce(undefined);

    const res = await POST(makeValidateRequest("raw", "text/plain"));
    expect(res.status).toBe(415);
    const data = await res.json();
    expect(data.error).toBe("Yêu cầu Content-Type application/json");
  });

  it("returns 400 when body does not have code", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "u-1" } });
    mocks.requireRole.mockResolvedValueOnce(undefined);

    const res = await POST(makeValidateRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Mã giảm giá không hợp lệ");
  });

  it("returns 400 when code is empty whitespace", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "u-1" } });
    mocks.requireRole.mockResolvedValueOnce(undefined);

    const res = await POST(makeValidateRequest({ code: "   " }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Nhập mã giảm giá trước khi bấm Áp dụng.");
  });

  it("calculates subtotal from user cart on server and validates voucher successfully", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "u-1" } });
    mocks.requireRole.mockResolvedValueOnce(undefined);

    mocks.getCartSummary.mockResolvedValueOnce({
      subtotal: 500000,
      items: [{ id: "c1", price: 500000 }],
    });

    mocks.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            { id: 1, code: "SALE10", discountType: "percent", discountValue: 10 },
          ]),
        }),
      }),
    });

    mocks.validateVoucher.mockReturnValueOnce({
      valid: true,
      voucher: {
        code: "SALE10",
        discountType: "percent",
        discountValue: 10,
        discountAmount: 50000,
        description: "Giảm 10%",
      },
    });

    const res = await POST(makeValidateRequest({ code: "sale10" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.voucher.discountAmount).toBe(50000);

    // Verify subtotal passed to validateVoucher was 500,000 from server cart
    expect(mocks.validateVoucher).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SALE10" }),
      500000,
    );
  });

  it("returns 400 when voucher validation fails", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "u-1" } });
    mocks.requireRole.mockResolvedValueOnce(undefined);

    mocks.getCartSummary.mockResolvedValueOnce({
      subtotal: 100000,
      items: [{ id: "c1", price: 100000 }],
    });

    mocks.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    mocks.validateVoucher.mockReturnValueOnce({
      valid: false,
      error: "Mã giảm giá không tồn tại.",
    });

    const res = await POST(makeValidateRequest({ code: "NOTEXIST" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Mã giảm giá không tồn tại.");
  });
});
