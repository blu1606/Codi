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

vi.mock("@/lib/ai-advisor-service", () => ({
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
  buildAdvisorAnswer: vi.fn((params: any) => ({
    text: `Gợi ý cho ${params.prompt}`,
    courses: [
      {
        id: "course-node-002",
        slug: "nodejs-backend",
        title: "Node.js & Express",
        level: "Trung cấp",
        lessonCount: 16,
        price: 790000,
        rating: 4.9,
        learnersCount: 85,
        isBestMatch: true,
      },
    ],
    table: null,
    order: [],
    followups: ["Nên học gì tiếp?"],
    noMatch: false,
  })),
  logAdvisorInteraction: vi.fn(async () => 101),
  syncLearnerIntakeGoalDraft: vi.fn(async () => {}),
}));

import { GET, POST } from "./route";

describe("GET /api/ai advisor context", () => {
  beforeEach(() => {
    mockSession.current = null;
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
    expect(data.text).toContain("Gợi ý cho Tôi muốn học làm backend");
    expect(data.courses).toHaveLength(1);
    expect(data.courses[0].id).toBe("course-node-002");
    expect(data.logId).toBe(101);
  });
});
