import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@codi-1/auth";
import { BuyNowError } from "@/lib/buy-now";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  headers: vi.fn(),
  createBuyNowOrder: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.getSession } },
  db: {},
}));

vi.mock("@/lib/buy-now", async () => {
  const actual = await vi.importActual<typeof import("@/lib/buy-now")>("@/lib/buy-now");
  return {
    ...actual,
    createBuyNowOrder: mocks.createBuyNowOrder,
  };
});

import { POST } from "./route";

function makeRequest(body: any = { courseId: "course-1" }) {
  return new Request("http://localhost/api/orders/buy-now", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.headers.mockResolvedValue(new Headers());
  mocks.getSession.mockResolvedValue({ user: { id: "user-learner-1" } });
});

describe("POST /api/orders/buy-now", () => {
  it("returns 401 when not authenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Vui lòng đăng nhập" });
  });

  it.each([
    null,
    {},
    { courseId: "" },
    { courseId: "   " },
    { courseId: 123 },
  ])("returns 400 for invalid body %j", async (body) => {
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Mã khóa học không hợp lệ" });
  });

  it("creates a new order and returns 201", async () => {
    const orderResult = {
      orderId: 42,
      orderCode: "CODI12345",
      courseId: "course-1",
      courseTitle: "React Pro",
      courseSlug: "react-pro",
      price: 1290000,
      isExisting: false,
    };
    mocks.createBuyNowOrder.mockResolvedValue(orderResult);

    const res = await POST(makeRequest({ courseId: "course-1" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(orderResult);
    expect(mocks.createBuyNowOrder).toHaveBeenCalledWith(expect.anything(), "user-learner-1", "course-1");
  });

  it("returns 200 when reusing existing pending order", async () => {
    const orderResult = {
      orderId: 42,
      orderCode: "CODI12345",
      courseId: "course-1",
      courseTitle: "React Pro",
      courseSlug: "react-pro",
      price: 1290000,
      isExisting: true,
    };
    mocks.createBuyNowOrder.mockResolvedValue(orderResult);

    const res = await POST(makeRequest({ courseId: "course-1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(orderResult);
  });

  it("returns 403 when user is not a learner", async () => {
    mocks.createBuyNowOrder.mockRejectedValue(new ForbiddenError("Forbidden"));
    const res = await POST(makeRequest({ courseId: "course-1" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Chỉ tài khoản học viên mới mua được khoá học." });
  });

  it("maps BuyNowError status and message", async () => {
    mocks.createBuyNowOrder.mockRejectedValue(new BuyNowError(409, "Bạn đã sở hữu khóa học này."));
    const res = await POST(makeRequest({ courseId: "course-1" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Bạn đã sở hữu khóa học này." });
  });

  it("returns 500 on unexpected errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createBuyNowOrder.mockRejectedValue(new Error("Unexpected crash"));
    const res = await POST(makeRequest({ courseId: "course-1" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Không thể xử lý mua ngay. Vui lòng thử lại." });
    spy.mockRestore();
  });
});
