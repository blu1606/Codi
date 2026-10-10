import { afterEach, expect, it, vi } from "vitest";
import { createCheckoutOrder } from "./checkout-order";
afterEach(() => vi.unstubAllGlobals());
it.each([401, 404, 500, 503])("surfaces order creation failure %s", async (status) => {
 vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Payment unavailable" }), { status })));
 await expect(createCheckoutOrder("database-only")).rejects.toThrow("Payment unavailable");
});
it("surfaces network failures", async () => {
 vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")));
 await expect(createCheckoutOrder("database-only")).rejects.toThrow("Network unavailable");
});
it("rejects malformed successful responses", async () => {
 vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
 await expect(createCheckoutOrder("database-only")).rejects.toThrow("Thông tin thanh toán không hợp lệ");
});
it("uses the returned order amount and receiver without fixture data", async () => {
 const order = { transactionId: "CODI12345", amount: 125000, receiver: { bankCode: "VCB", accountNumber: "12345678" }, course: { id: "db-id", title: "Real course", category: "Backend" } };
 const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(order))); vi.stubGlobal("fetch", fetcher);
 expect(await createCheckoutOrder("database-only")).toEqual(order);
 expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ courseSlug: "database-only" });
});
