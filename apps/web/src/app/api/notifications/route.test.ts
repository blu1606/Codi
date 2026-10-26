import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { NotificationNotFoundError } from "@/lib/notification-service";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), roles: vi.fn(), list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(),
}));
vi.mock("@/services", () => ({ auth: { api: { getSession: mocks.session } }, db: {} }));
vi.mock("@codi-1/auth", () => ({ getActiveRoles: mocks.roles }));
vi.mock("@/lib/notifications", () => ({ notificationService: mocks }));
import { GET, PATCH } from "./route";

const origin = "https://codi.test";
const request = (body: unknown, source: string | null = origin) => new NextRequest(`${origin}/api/notifications`, {
  method: "PATCH", headers: { "Content-Type": "application/json", ...(source ? { origin: source } : {}) }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "learner-a" } });
  mocks.roles.mockResolvedValue(["LEARNER"]);
  mocks.list.mockResolvedValue({ items: [], unreadCount: 0 });
});

describe("notification API authentication and transitions", () => {
  it("lists only the session owner's inbox and disables caching", async () => {
    const response = await GET(new NextRequest(`${origin}/api/notifications?userId=other-user`));
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith("learner-a");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("rejects an anonymous reader", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(new NextRequest(`${origin}/api/notifications`))).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("rejects a banned or role-revoked session", async () => {
    mocks.roles.mockResolvedValue([]);
    expect((await PATCH(request({ all: true }))).status).toBe(401);
    expect(mocks.markAllRead).not.toHaveBeenCalled();
  });
  it("marks an owned notification read using the session identity", async () => {
    expect((await PATCH(request({ id: 7, userId: "victim" }))).status).toBe(200);
    expect(mocks.markRead).toHaveBeenCalledWith("learner-a", 7);
  });
  it("marks all unread notifications for the viewer", async () => {
    expect((await PATCH(request({ all: true }))).status).toBe(200);
    expect(mocks.markAllRead).toHaveBeenCalledWith("learner-a");
  });
  it("returns 404 for another user's or a missing notification", async () => {
    mocks.markRead.mockRejectedValue(new NotificationNotFoundError("Không tìm thấy thông báo."));
    expect((await PATCH(request({ id: 7 }))).status).toBe(404);
  });
  it.each([{ id: -1 }, { id: "7" }, { id: 1.2 }, { id: Number.MAX_SAFE_INTEGER + 1 }, {}, null, { id: 7, all: true }, { all: false }])("rejects an invalid transition request: %j", async (body) => {
    expect((await PATCH(request(body))).status).toBe(400);
    expect(mocks.markRead).not.toHaveBeenCalled();
    expect(mocks.markAllRead).not.toHaveBeenCalled();
  });
  it.each(["https://attacker.test", null])("rejects a cross-origin or missing-origin write: %s", async (source) => {
    expect((await PATCH(request({ all: true }, source))).status).toBe(403);
    expect(mocks.markAllRead).not.toHaveBeenCalled();
  });
  it("handles malformed JSON", async () => {
    const response = await PATCH(new NextRequest(`${origin}/api/notifications`, { method: "PATCH", headers: { origin }, body: "{" }));
    expect(response.status).toBe(400);
  });
  it("returns a recoverable error without database details", async () => {
    mocks.list.mockRejectedValue(new Error("private database connection string"));
    const response = await GET(new NextRequest(`${origin}/api/notifications`));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("connection string");
  });
});
