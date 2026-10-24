import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), roles: vi.fn(), learner: vi.fn(), admin: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/services", () => ({ auth: { api: { getSession: mocks.session } }, db: {} }));
vi.mock("@codi-1/auth", () => ({ getActiveRoles: mocks.roles, ROLE: { ADMIN: "ADMIN", LEARNER: "LEARNER" } }));
vi.mock("./learner-insights-service", () => ({ getLearnerStatsData: mocks.learner }));
vi.mock("./admin-analytics-service", () => ({ getAdminCount: mocks.admin }));
import { GET as learner } from "../app/api/insights/stats/route";
import { GET as admin } from "../app/api/admin/insights/[card]/route";
import { GET as finance } from "../app/api/admin/finance/[card]/route";

const request = (query = "") => new NextRequest("http://localhost/api/test" + query);
const context = (card = "users") => ({ params: Promise.resolve({ card }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "alice" } });
  mocks.roles.mockResolvedValue(["LEARNER", "ADMIN"]);
  mocks.learner.mockResolvedValue({ completedLessons: 2 });
  mocks.admin.mockResolvedValue({ value: 3 });
});
describe("analytics authorization and transport", () => {
  it("rejects unauthenticated requests before role or data reads", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await learner(request())).status).toBe(401);
    expect((await admin(request(), context())).status).toBe(401);
    expect((await finance()).status).toBe(401);
    expect(mocks.roles).not.toHaveBeenCalled();
    expect(mocks.learner).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("keeps active-role guards on all APIs", async () => {
    mocks.roles.mockResolvedValue([]);
    expect((await learner(request())).status).toBe(403);
    expect((await admin(request(), context())).status).toBe(403);
    expect((await finance()).status).toBe(403);
    expect(mocks.learner).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("passes only trusted session identity, not query identity, for two users", async () => {
    for (const id of ["alice", "bob"]) {
      mocks.session.mockResolvedValue({ user: { id } });
      const result = await learner(request("?period=7&course=c1&userId=mallory"));
      expect(result.status).toBe(200);
      expect(result.headers.get("cache-control")).toBe("private, no-store");
      expect(mocks.learner).toHaveBeenLastCalledWith({}, id, "7", "c1");
    }
  });
  it("rejects invalid periods rather than silently selecting a different window", async () => {
    expect((await learner(request("?period=bad"))).status).toBe(400);
    expect((await admin(request("?period=bad"), context())).status).toBe(400);
    expect(mocks.learner).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("does not serve retired fixture card or finance payloads", async () => {
    const retired = await admin(request(), context("a1"));
    expect(retired.status).toBe(404);
    expect(await retired.json()).toMatchObject({ status: "unavailable" });
    const result = await finance();
    expect(result.status).toBe(404);
    expect(await result.json()).toMatchObject({ status: "unavailable" });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("returns actual aggregates and a retriable non-sensitive failure", async () => {
    const result = await admin(request("?period=90"), context("orders"));
    expect(await result.json()).toEqual({ value: 3 });
    expect(mocks.admin).toHaveBeenCalledWith({}, "orders", "90");
    mocks.admin.mockRejectedValue(new Error("private database detail"));
    const failure = await admin(request(), context());
    expect(failure.status).toBe(500);
    expect(JSON.stringify(await failure.json())).not.toContain("private database");
    mocks.learner.mockRejectedValue(new Error("private database detail"));
    expect((await learner(request())).status).toBe(500);
  });
});
