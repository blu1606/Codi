import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  LearnerOverviewError,
  overviewCommand,
} from "@/lib/learner-overview-contract";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  roles: vi.fn(),
  get: vi.fn(),
  execute: vi.fn(),
  heartbeat: vi.fn(),
}));
vi.mock("@/services", () => ({
  auth: { api: { getSession: mocks.session } },
  db: {},
}));
vi.mock("@codi-1/auth", () => ({
  getActiveRoles: mocks.roles,
  ROLE: { LEARNER: "LEARNER" },
}));
vi.mock("@/lib/learner-overview-runtime", () => ({
  learnerOverviewService: mocks,
  studyActivityService: mocks,
}));
import { GET, POST } from "./route";
import { POST as heartbeat } from "../../learn/[courseId]/lessons/[lessonId]/activity/route";
const origin = "https://codi.test";
const lessonId = "c937bd55-1283-493e-bca0-31047cd80aa3";
const trackerId = "19a88269-9c03-4c26-921d-bcecd007906b";
const ctx = { params: Promise.resolve({ courseId: "owned", lessonId }) };
const read = () =>
  new NextRequest(`${origin}/api/learner/overview?userId=victim`);
const write = (body: unknown, source: string | null = origin) =>
  new NextRequest(`${origin}/api/learner/overview`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(source ? { origin: source } : {}),
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "viewer" } });
  mocks.roles.mockResolvedValue(["LEARNER"]);
  mocks.get.mockResolvedValue({ courses: [] });
  mocks.execute.mockImplementation(async (_user, raw) => {
    overviewCommand.parse(raw);
    return { dismissedAt: null };
  });
  mocks.heartbeat.mockResolvedValue({ recorded: true });
});
describe("learner overview HTTP boundaries", () => {
  it("always reads the session's learner and disables shared caching", async () => {
    const response = await GET(read());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.get).toHaveBeenCalledWith("viewer");
  });
  it("requires authentication for reads and writes", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(read())).status).toBe(401);
    expect((await POST(write({}))).status).toBe(401);
    expect((await heartbeat(write({ action: "start" }), ctx)).status).toBe(401);
    expect(mocks.heartbeat).not.toHaveBeenCalled();
  });
  it.each([[], ["ADMIN"], ["LECTURER"]])(
    "requires an active learner grant: %j",
    async (...roles) => {
      mocks.roles.mockResolvedValue(roles);
      expect((await GET(read())).status).toBe(403);
      expect((await heartbeat(write({ action: "start" }), ctx)).status).toBe(
        403,
      );
    },
  );
  it.each([null, "https://attacker.test"])(
    "rejects missing/foreign write origin: %s",
    async (source) => {
      expect(
        (
          await POST(
            write({ type: "dismiss-diagnostic", courseId: "owned" }, source),
          )
        ).status,
      ).toBe(403);
      expect(
        (await heartbeat(write({ action: "start" }, source), ctx)).status,
      ).toBe(403);
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.heartbeat).not.toHaveBeenCalled();
    },
  );
  it("validates heartbeat payloads before touching the database", async () => {
    expect(
      (await heartbeat(write({ active: true, trackerId }), ctx)).status,
    ).toBe(400);
    for (const body of [
      { action: "start", trackerId },
      { action: "start", trackerId, expectedOwner: "invalid" },
      { action: "heartbeat", trackerId, expectedOwner: null },
    ])
      expect((await heartbeat(write(body), ctx)).status).toBe(400);
    expect(
      (await heartbeat(write({ action: "resume", trackerId }), ctx)).status,
    ).toBe(400);
    expect(
      (
        await heartbeat(
          write({ action: "start", trackerId, seconds: 3600 }),
          ctx,
        )
      ).status,
    ).toBe(400);
    expect((await heartbeat(write({ action: "stop" }), ctx)).status).toBe(400);
    expect(
      (await heartbeat(write({ action: "start", trackerId: "invalid" }), ctx))
        .status,
    ).toBe(400);
    expect(mocks.heartbeat).not.toHaveBeenCalled();
    expect(
      (await heartbeat(write({ action: "stop", trackerId }), ctx)).status,
    ).toBe(200);
    expect(mocks.heartbeat).toHaveBeenCalledWith(
      "viewer",
      "owned",
      lessonId,
      "stop",
      trackerId,
      undefined,
    );
  });
  it.each(["prepare", "start", "heartbeat", "stop"])(
    "forwards explicit %s intent",
    async (action) => {
      const response = await heartbeat(
        write({
          action,
          trackerId,
          ...(action === "start" ? { expectedOwner: null } : {}),
        }),
        ctx,
      );
      expect(response.status).toBe(200);
      expect(mocks.heartbeat).toHaveBeenCalledWith(
        "viewer",
        "owned",
        lessonId,
        action,
        trackerId,
        action === "start" ? null : undefined,
      );
    },
  );
  it("rejects forged dismiss commands", async () => {
    expect(
      (
        await POST(
          write({
            type: "dismiss-diagnostic",
            courseId: "owned",
            userId: "victim",
          }),
        )
      ).status,
    ).toBe(400);
  });
  it("preserves ownership and stale-undo failures", async () => {
    mocks.execute.mockRejectedValue(
      new LearnerOverviewError("Thông báo đã thay đổi.", 409),
    );
    const response = await POST(
      write({
        type: "restore-diagnostic",
        courseId: "owned",
        dismissedAt: "2026-10-19T03:00:00Z",
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Thông báo đã thay đổi." });
  });
  it("sanitizes infrastructure errors", async () => {
    mocks.get.mockRejectedValue(new Error("database-secret"));
    const response = await GET(read());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});
