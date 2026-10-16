import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { LearningPathError } from "@/lib/learning-path-contract";

const mocks = vi.hoisted(() => ({ session: vi.fn(), roles: vi.fn(), get: vi.fn(), execute: vi.fn(), assertLessonAccess: vi.fn(), getKnowledgeMap: vi.fn(), schedule: vi.fn() }));
vi.mock("@/services", () => ({ auth: { api: { getSession: mocks.session } }, db: {} }));
vi.mock("@codi-1/auth", () => ({ getActiveRoles: mocks.roles, ROLE: { LEARNER: "LEARNER" } }));
vi.mock("@/lib/learning-path-runtime", () => ({ learningPathService: mocks, scheduleLearningPath: mocks.schedule }));
import { GET, POST } from "./route";
import { GET as getMap } from "../../../insights/knowledge-map/route";
import { GET as getAccess } from "../access/[lessonId]/route";

const origin = "https://codi.test";
const ctx = () => ({ params: Promise.resolve({ courseId: "owned" }) });
const read = () => new NextRequest(`${origin}/api/learn/owned/path?userId=victim`);
const write = (body: unknown, source: string | null = origin) => new NextRequest(`${origin}/api/learn/owned/path`, { method: "POST", headers: { "Content-Type": "application/json", ...(source ? { origin: source } : {}) }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.session.mockResolvedValue({ user: { id: "viewer" } }); mocks.roles.mockResolvedValue(["LEARNER"]);
  mocks.get.mockResolvedValue({ status: "ready" }); mocks.execute.mockResolvedValue({ status: "generating" }); mocks.getKnowledgeMap.mockResolvedValue({ confirmed: false, nodes: [] }); mocks.assertLessonAccess.mockResolvedValue({ id: "lesson" });
});

describe("personal path HTTP boundaries", () => {
  it("reads with session identity, private no-store, ignoring injected user query", async () => {
    const response = await GET(read(), ctx()); expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.get).toHaveBeenCalledWith("viewer", "owned");
  });
  it("requires authentication on path, map and lesson access", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(read(), ctx())).status).toBe(401); expect((await POST(write({ type: "sync" }), ctx())).status).toBe(401);
    expect((await getMap(read())).status).toBe(401);
    expect((await getAccess(read(), { params: Promise.resolve({ courseId: "owned", lessonId: "lesson" }) })).status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([[], ["ADMIN"], ["LECTURER"]])("rejects absent/revoked/inactive learner grants: %j", async (...roles) => {
    mocks.roles.mockResolvedValue(roles);
    expect((await POST(write({ type: "sync" }), ctx())).status).toBe(403); expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it.each([null, "https://attacker.test"])("rejects writes with missing/foreign Origin %s", async (source) => {
    expect((await POST(write({ type: "retry" }, source), ctx())).status).toBe(403); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([{ type: "sync", userId: "victim" }, { type: "complete", lessonId: "lesson" }, { type: "retry", status: "ready" }, { type: "review", rating: 6, text: "" }])("rejects forged writes %j", async (command) => expect((await POST(write(command), ctx())).status).toBe(400));
  it("rejects malformed JSON", async () => expect((await POST(new NextRequest(`${origin}/api`, { method: "POST", headers: { origin }, body: "{" }), ctx())).status).toBe(400));
  it.each(["sync", "retry"])("schedules durable background work after a validated %s", async (type) => {
    expect((await POST(write({ type }), ctx())).status).toBe(200); expect(mocks.execute).toHaveBeenCalledWith("viewer", "owned", { type }); expect(mocks.schedule).toHaveBeenCalledWith("viewer", "owned");
  });
  it("does not generate on dismiss and passes the current path identity to server policy", async () => {
    expect((await POST(write({ type: "ack-highlights", pathId: 4 }), ctx())).status).toBe(200); expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledWith("viewer", "owned", { type: "ack-highlights", pathId: 4 });
  });
  it.each([403, 404, 409])("preserves typed ownership/transition/lock failures %s", async (status) => {
    mocks.execute.mockRejectedValue(new LearningPathError("Trạng thái đã thay đổi.", status)); expect((await POST(write({ type: "retry" }), ctx())).status).toBe(status); expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it("never leaks infrastructure errors", async () => {
    mocks.get.mockRejectedValue(new Error("private-db-password")); const response = await GET(read(), ctx()); expect(response.status).toBe(500); expect(await response.text()).not.toContain("password");
  });
  it("scopes map and lesson checks to the viewer and selected route", async () => {
    await getMap(new NextRequest(`${origin}/api/insights/knowledge-map?course=owned&userId=victim`)); expect(mocks.getKnowledgeMap).toHaveBeenCalledWith("viewer", "owned");
    const response = await getAccess(read(), { params: Promise.resolve({ courseId: "owned", lessonId: "lesson" }) });
    expect(await response.json()).toEqual({ allowed: true, lessonId: "lesson" }); expect(mocks.assertLessonAccess).toHaveBeenCalledWith("viewer", "owned", "lesson");
  });
});
