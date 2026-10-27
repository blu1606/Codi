import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  roles: vi.fn(),
  adminOverview: vi.fn(),
  financeOverview: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/services", () => ({ auth: { api: { getSession: mocks.session } }, db: {} }));
vi.mock("@codi-1/auth", () => ({ getActiveRoles: mocks.roles, ROLE: { ADMIN: "ADMIN", LEARNER: "LEARNER" } }));
vi.mock("@/lib/admin-analytics-service", () => ({ getAdminInsightsOverview: mocks.adminOverview }));
vi.mock("@/lib/revenue-analytics-service", () => ({ getAdminFinanceOverview: mocks.financeOverview }));
import { GET as insightsOverview } from "../app/api/admin/insights/overview/route";
import { GET as financeOverview } from "../app/api/admin/finance/overview/route";

const request = (query = "") => new NextRequest("http://localhost/api/test" + query);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "admin-1" } });
  mocks.roles.mockResolvedValue(["ADMIN"]);
  mocks.adminOverview.mockResolvedValue({ totals: { signups: 3 } });
  mocks.financeOverview.mockResolvedValue({ totals: { net: 900000 } });
});

describe.each([
  ["S36 insights overview", insightsOverview, () => mocks.adminOverview],
  ["S37 finance overview", financeOverview, () => mocks.financeOverview],
] as const)("%s", (_name, handler, service) => {
  it("rejects unauthenticated callers before any role or data read", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await handler(request())).status).toBe(401);
    expect(mocks.roles).not.toHaveBeenCalled();
    expect(service()).not.toHaveBeenCalled();
  });

  it("rejects non-admin active roles before any data read", async () => {
    mocks.roles.mockResolvedValue(["LEARNER", "LECTURER"]);
    expect((await handler(request("?period=30"))).status).toBe(403);
    expect(service()).not.toHaveBeenCalled();
  });

  it("reads the role for the trusted session user, never a userId from the query", async () => {
    await handler(request("?period=30&userId=mallory"));
    expect(mocks.roles).toHaveBeenCalledWith({}, "admin-1");
    expect(service()).toHaveBeenCalledWith({}, "30");
  });

  it("rejects an unknown period instead of silently choosing another window", async () => {
    expect((await handler(request("?period=365"))).status).toBe(400);
    expect(service()).not.toHaveBeenCalled();
  });

  it("returns no-store aggregates and a non-sensitive retriable failure", async () => {
    const ok = await handler(request("?period=7"));
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect(service()).toHaveBeenCalledWith({}, "7");

    service().mockRejectedValueOnce(new Error("private database detail"));
    const failure = await handler(request());
    expect(failure.status).toBe(500);
    expect(JSON.stringify(await failure.json())).not.toContain("private database");
  });
});
