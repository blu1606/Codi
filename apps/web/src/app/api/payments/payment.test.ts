import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ limit: vi.fn(), values: vi.fn(), getSession: vi.fn(), transaction: vi.fn() }));
vi.mock("@/services", () => ({
 db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.limit }) }) }), insert: () => ({ values: mocks.values }), transaction: mocks.transaction },
 auth: { api: { getSession: mocks.getSession } }
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { POST as create } from "./create-transaction/route";
import { POST as callback } from "./sepay/callback/route";
const request = (body: unknown, authorized = true) => new Request("http://localhost/api/payments", { method: "POST", headers: authorized ? { authorization: "Apikey test-secret" } : {}, body: JSON.stringify(body) });
beforeEach(() => {
 vi.resetAllMocks();
 vi.stubEnv("SEPAY_WEBHOOK_SECRET", "test-secret"); vi.stubEnv("SEPAY_ACCOUNT_NUMBER", "12345678"); vi.stubEnv("SEPAY_BANK_CODE", "VCB");
 mocks.getSession.mockResolvedValue({ user: { id: "session-user" } });
 mocks.limit.mockResolvedValue([{ id: "db-id", slug: "database-only", title: "Database course", category: "Backend", price: 125000 }]);
});
afterEach(() => vi.unstubAllEnvs());
it.each([undefined, "", "   "])("fails closed without a webhook secret (%s)", async (secret) => {
 vi.stubEnv("SEPAY_WEBHOOK_SECRET", secret);
 const response = await callback(request({ transferType: "in", accountNumber: "12345678", content: "CODI12345", transferAmount: 125000 }, false));
 expect(response.status).toBe(503); expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
});
it("rejects invalid webhook authentication", async () => { expect((await callback(request({}, false))).status).toBe(401); });
it("returns authoritative price and configured receiver for a database-only slug", async () => {
 const response = await create(request({ courseSlug: "database-only", amount: 1, userId: "attacker" }));
 expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({ amount: 125000, receiver: { bankCode: "VCB", accountNumber: "12345678" }, course: { id: "db-id", title: "Database course" } });
 expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ amount: 125000, courseId: "db-id", userId: "session-user" }));
});
it("does not request payment for a free course", async () => {
 mocks.limit.mockResolvedValue([{ id: "free", price: 0 }]);
 expect((await create(request({ courseId: "free" }))).status).toBe(422); expect(mocks.values).not.toHaveBeenCalled();
});
it("rejects missing receiver configuration before inserting an order", async () => {
 vi.stubEnv("SEPAY_ACCOUNT_NUMBER", "");
 expect((await create(request({ courseId: "db-id" }))).status).toBe(503); expect(mocks.values).not.toHaveBeenCalled();
});
it("preserves session and missing-course errors", async () => {
 mocks.getSession.mockResolvedValueOnce(null); expect((await create(request({ courseId: "db-id" }))).status).toBe(401);
 mocks.limit.mockResolvedValueOnce([]); expect((await create(request({ courseId: "missing" }))).status).toBe(404);
});
it.each(["out", "wrong-account"])("ignores unrelated transfer %s before database access", async (kind) => {
 const response = await callback(request({ transferType: kind === "out" ? "out" : "in", accountNumber: kind === "wrong-account" ? "999" : "12345678", content: "CODI12345", transferAmount: 125000 }));
 expect(response.status).toBe(200); expect(mocks.limit).not.toHaveBeenCalled();
});
it("enrolls only a sufficiently funded authenticated incoming transfer", async () => {
 mocks.limit.mockResolvedValue([{ id: "CODI12345", amount: 125000, status: "pending", userId: "session-user", courseId: "db-id" }]);
 const update = vi.fn(); const enroll = vi.fn();
 mocks.transaction.mockImplementation(async (fn) => fn({ update: () => ({ set: (value: unknown) => { update(value); return { where: vi.fn() }; } }), insert: () => ({ values: (value: unknown) => { enroll(value); return { onConflictDoNothing: vi.fn() }; } }) }));
 await callback(request({ transferType: "in", accountNumber: "12345678", content: "CODI12345", transferAmount: 1 }));
 expect(mocks.transaction).not.toHaveBeenCalled();
 await callback(request({ transferType: "in", accountNumber: "12345678", content: "CODI12345", transferAmount: 125000 }));
 expect(update).toHaveBeenCalledWith({ status: "paid" }); expect(enroll).toHaveBeenCalledWith({ userId: "session-user", courseId: "db-id" });
});
