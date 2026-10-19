import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSession = vi.hoisted(() => ({ current: null as any }));

const mockDb = vi.hoisted(() => {
  const existingLog = {
    id: 101,
    userId: null as string | null,
    requestType: "ask_advisor",
    errorMessage: null as string | null,
    createdAt: new Date(),
  };

  return {
    existingLog,
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => (existingLog.id ? [existingLog] : [])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: any) => ({
        where: vi.fn(async () => {
          if (patch.errorMessage !== undefined) {
            existingLog.errorMessage = patch.errorMessage;
          }
          return [existingLog];
        }),
      })),
    })),
  };
});

vi.mock("@/services", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => mockSession.current),
    },
  },
  db: mockDb,
}));

import { POST } from "./route";

describe("POST /api/ai/feedback", () => {
  beforeEach(() => {
    mockSession.current = null;
    mockDb.existingLog.id = 101;
    mockDb.existingLog.userId = null;
    mockDb.existingLog.requestType = "ask_advisor";
    mockDb.existingLog.errorMessage = null;
    mockDb.existingLog.createdAt = new Date();
  });

  it("rejects unauthorized user trying to vote on another user's logged interaction", async () => {
    mockDb.existingLog.userId = "user-owner";
    mockSession.current = { user: { id: "user-attacker" } };

    const req = new NextRequest("http://localhost/api/ai/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logId: 101,
        vote: "up",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("không có quyền");
  });

  it("rejects feedback on non-advisor interaction types", async () => {
    mockDb.existingLog.requestType = "explain_lesson";

    const req = new NextRequest("http://localhost/api/ai/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logId: 101,
        vote: "down",
        reason: "Sai trình độ",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Không được phép gửi phản hồi");
  });

  it("preserves diagnostic errorMessage when appending feedback", async () => {
    mockDb.existingLog.errorMessage = "Diagnostic: Model timed out after 30s";

    const req = new NextRequest("http://localhost/api/ai/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logId: 101,
        vote: "down",
        reason: "Khó hiểu",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockDb.existingLog.errorMessage).toBe(
      "Diagnostic: Model timed out after 30s | [Feedback: down - Khó hiểu]"
    );
  });

  it("accepts valid feedback from the owner", async () => {
    mockDb.existingLog.userId = "user-owner";
    mockSession.current = { user: { id: "user-owner" } };

    const req = new NextRequest("http://localhost/api/ai/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logId: 101,
        vote: "up",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockDb.existingLog.errorMessage).toBe("[Feedback: up]");
  });
});
