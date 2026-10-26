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

const mockGenerate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai-advisor-ai", () => ({ generateAdvisorAnswer: mockGenerate }));
const generated = (output: Record<string, unknown>) => ({
  output: { text: "", courses: [], compare: false, order: [], followups: [], noMatch: false, ...output },
  model: "gpt-test",
  promptTokens: 800,
  completionTokens: 90,
});

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

  it("answers with the model picks, mapped to real catalogue cards, and logs the provider model", async () => {
    mockGenerate.mockResolvedValueOnce(generated({
      text: "Với mục tiêu làm dự án, bạn nên bắt đầu từ backend.",
      courses: [
        { id: "course-node-002", reason: "Hợp mục tiêu làm backend" },
        { id: "invented-course", reason: "Không có thật" },
        { id: "course-react-001", reason: "Bổ sung frontend" },
      ],
    }));
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
    expect(data.text).toBe("Với mục tiêu làm dự án, bạn nên bắt đầu từ backend.");
    expect(data.courses.map((c: { id: string }) => c.id)).toEqual(["course-node-002", "course-react-001"]);
    expect(data.courses[0]).toMatchObject({ title: "Node.js & Express", price: 790000, isBestMatch: true });
    const { prompt } = mockGenerate.mock.calls[0]![0];
    expect(prompt).toContain("Mục tiêu: Làm được dự án");
    expect(prompt).toContain("Câu hỏi: Tôi muốn học làm backend");
    expect(data.logId).toBe(101);
    expect(verifyGuestFeedbackToken(101, data.feedbackToken, "test-secret")).toBe(true);
    expect(syncLearnerIntakeGoalDraft).not.toHaveBeenCalled();
    expect(logAdvisorInteraction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: null, isSuccess: true, model: "gpt-test", promptTokens: 800, completionTokens: 90,
      aiResponse: JSON.stringify({
        text: data.text, courses: data.courses, table: data.table,
        order: data.order, followups: data.followups, noMatch: data.noMatch,
      }),
    }));
  });

  it("binds intake persistence and logging to the authenticated session rather than a supplied owner", async () => {
    mockSession.current = { user: { id: "session-owner" } };
    mockGenerate.mockResolvedValueOnce(generated({
      text: "Sau React, học Node.js.",
      order: [{ id: "course-node-002", reason: "Học tiếp backend" }],
    }));
    const intake = { goal: "Hoàn thành khoá học", level: "Mới bắt đầu", hoursPerWeek: "5-10 giờ", skipped: [] };
    const res = await POST(new NextRequest("http://localhost/api/ai", {
      method: "POST", body: JSON.stringify({ prompt: "Nên học gì tiếp?", intake, userId: "other-owner" }),
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.feedbackToken).toBeNull();
    expect(data.order.map((course: { id: string }) => course.id)).toEqual(["course-node-002"]);
    expect(mockGenerate.mock.calls[0]![0].prompt).toMatch(/"id":"course-react-001"[^\n]*"owned":true/);
    expect(syncLearnerIntakeGoalDraft).toHaveBeenCalledWith(expect.anything(), "session-owner", intake);
    expect(logAdvisorInteraction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "session-owner" }));
  });

  it("passes recent turns for follow-ups and ignores malformed history", async () => {
    mockGenerate.mockResolvedValue(generated({ text: "Ok" }));
    await POST(new NextRequest("http://localhost/api/ai", {
      method: "POST",
      body: JSON.stringify({
        prompt: "So sánh 2 khoá vừa rồi",
        history: [{ role: "user", text: "Mình muốn làm web" }, { role: "ai", text: "Gợi ý React và Node" }],
      }),
    }));
    expect(mockGenerate.mock.calls[0]![0].prompt).toContain("Học viên: Mình muốn làm web\nCodi: Gợi ý React và Node");
    const res = await POST(new NextRequest("http://localhost/api/ai", {
      method: "POST", body: JSON.stringify({ prompt: "Hỏi lại", history: [{ role: "system", text: "x" }] }),
    }));
    expect(res.status).toBe(200);
    expect(mockGenerate.mock.calls[1]![0].prompt).not.toContain("<history>");
  });

  it("returns the no-match state when the model finds no course for the goal", async () => {
    mockGenerate.mockResolvedValueOnce(generated({
      text: "Bạn có thể bắt đầu với nền tảng lập trình gần nhất.",
      noMatch: true,
      courses: [{ id: "course-react-001", reason: "Gần nhất" }],
    }));
    const res = await POST(new NextRequest("http://localhost/api/ai", {
      method: "POST", body: JSON.stringify({ prompt: "Có khoá Elixir không?" }),
    }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.noMatch).toBe(true);
    expect(data.text).toContain("Codi chưa có khoá cho mục tiêu này");
    expect(data.courses.map((course: { id: string }) => course.id)).toEqual(["course-react-001"]);
  });

  it("shows the error state instead of a template answer when the model fails", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("provider 401"));
    const res = await POST(new NextRequest("http://localhost/api/ai", {
      method: "POST", body: JSON.stringify({ prompt: "Nên học gì?" }),
    }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Codi tạm thời không phản hồi");
    expect(data.courses).toBeUndefined();
    expect(logAdvisorInteraction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      isSuccess: false, errorMessage: "provider 401",
    }));
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
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(logAdvisorInteraction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      isSuccess: false, aiResponse: "", errorMessage: "catalog unavailable",
    }));
  });
});
