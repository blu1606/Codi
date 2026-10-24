import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSession = vi.hoisted(() => ({ current: null as any }));

vi.mock("@/services", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => mockSession.current),
    },
  },
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

const mockCatalog = [
  {
    id: "course-react-001",
    slug: "react-co-ban",
    title: "React cơ bản",
    level: "Beginner",
    price: 590000,
    rating: 4.8,
    lessonCount: 12,
    enrollmentCount: 120,
    coverImageUrl: null,
    description: "Học React",
  },
  {
    id: "course-node-002",
    slug: "nodejs-backend",
    title: "Node.js & Express",
    level: "Intermediate",
    price: 790000,
    rating: 4.9,
    lessonCount: 16,
    enrollmentCount: 85,
    coverImageUrl: null,
    description: "Xây dựng REST API",
  },
];

vi.mock("@/lib/ai-advisor-service", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/ai-advisor-service")>(),
  getPublishedCatalog: vi.fn(async () => mockCatalog),
  getLearnerProgressContext: vi.fn(async () => ({
    currentCourse: mockSession.current
      ? {
          id: "course-react-001",
          slug: "react-co-ban",
          title: "React cơ bản",
          doneLessons: 4,
          totalLessons: 12,
        }
      : null,
    ownedCourseIds: mockSession.current ? ["course-react-001"] : [],
  })),
  logAdvisorInteraction: vi.fn(async () => 101),
  syncLearnerIntakeGoalDraft: vi.fn(async () => {}),
}));

vi.mock("@/env", () => ({
  ENV: {
    BETTER_AUTH_SECRET: "test-secret",
  },
}));

import { GET, POST } from "./route";
import { getPublishedCatalog, logAdvisorInteraction, syncLearnerIntakeGoalDraft, verifyGuestFeedbackToken } from "@/lib/ai-advisor-service";

describe("GET /api/ai advisor context", () => {
  beforeEach(() => {
    mockSession.current = null;
    vi.clearAllMocks();
  });

  it("returns guest context when not logged in", async () => {
    const req = new NextRequest("http://localhost/api/ai");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toBeNull();
    expect(data.currentCourse).toBeNull();
    expect(data.catalog).toHaveLength(2);
  });

  it("returns personalized context when logged in", async () => {
    mockSession.current = { user: { id: "user-1", name: "Nguyễn Văn A" } };
    const req = new NextRequest("http://localhost/api/ai");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toEqual({ id: "user-1", name: "Nguyễn Văn A" });
    expect(data.currentCourse).toMatchObject({
      id: "course-react-001",
      doneLessons: 4,
      totalLessons: 12,
    });
  });
});

describe("POST /api/ai advisor answers", () => {
  beforeEach(() => {
    mockSession.current = null;
    vi.clearAllMocks();
  });

  it("rejects empty prompt with 400", async () => {
    const req = new NextRequest("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "   " }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns structured course card recommendations and logs interaction", async () => {
    const req = new NextRequest("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Tôi muốn học làm backend",
        intake: { goal: "Làm được dự án", level: "Có kinh nghiệm cơ bản" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.text).toContain("Làm được dự án, Có kinh nghiệm cơ bản");
    expect(data.courses).toHaveLength(2);
    expect(data.courses[0].id).toBe("course-node-002");
    expect(data.logId).toBe(101);
    expect(verifyGuestFeedbackToken(101, data.feedbackToken, "test-secret")).toBe(true);
    expect(syncLearnerIntakeGoalDraft).not.toHaveBeenCalled();
    expect(logAdvisorInteraction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: null, isSuccess: true, aiResponse: JSON.stringify({
        text: data.text, courses: data.courses, table: data.table,
        order: data.order, followups: data.followups, noMatch: data.noMatch,
      }),
    }));
  });

  it("binds intake persistence and logging to the authenticated session rather than a supplied owner", async () => {
    mockSession.current = { user: { id: "session-owner" } };
    const intake = { goal: "Hoàn thành khoá học", level: "Mới bắt đầu", hoursPerWeek: "5-10 giờ", skipped: [] };
    const res = await POST(new NextRequest("http://localhost/api/ai", {
      method: "POST", body: JSON.stringify({ prompt: "Nên học gì tiếp?", intake, userId: "other-owner" }),
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.feedbackToken).toBeNull();
    expect(data.order.map((course: { id: string }) => course.id)).toEqual(["course-node-002"]);
    expect(syncLearnerIntakeGoalDraft).toHaveBeenCalledWith(expect.anything(), "session-owner", intake);
    expect(logAdvisorInteraction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "session-owner" }));
  });

  it("returns explicit absent-subject alternatives using the real catalog answer builder", async () => {
    const res = await POST(new NextRequest("http://localhost/api/ai", {
      method: "POST", body: JSON.stringify({ prompt: "Có khoá Elixir không?" }),
    }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.noMatch).toBe(true);
    expect(data.text).toContain("Codi chưa có khoá");
    expect(data.courses.map((course: { id: string }) => course.id)).toEqual(mockCatalog.map(course => course.id));
  });

  it("does not fabricate a successful answer when catalog retrieval fails", async () => {
    vi.mocked(getPublishedCatalog).mockRejectedValueOnce(new Error("catalog unavailable"));
    const res = await POST(new NextRequest("http://localhost/api/ai", {
      method: "POST", body: JSON.stringify({ prompt: "Nên học gì?" }),
    }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeTruthy();
    expect(data.courses).toBeUndefined();
    expect(logAdvisorInteraction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      isSuccess: false, aiResponse: "", errorMessage: "catalog unavailable",
    }));
  });
});
