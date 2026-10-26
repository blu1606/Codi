import { describe, expect, it, vi } from "vitest";
import { studentActivities, studentEnrollments } from "@codi-1/db";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  ADVISOR_NO_MATCH,
  advisorCatalogSlice,
  advisorPrompt,
  toAdvisorAnswer,
  formatVnd,
  levelLabel,
  getLearnerProgressContext,
  syncLearnerIntakeGoalDraft,
  logAdvisorInteraction,
  type AdvisorCourseItem,
  type AdvisorModelOutput,
} from "./ai-advisor-service";

const mockCatalog: AdvisorCourseItem[] = [
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
    description: "Học React từ con số 0",
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
    description: "Xây dựng REST API với Node.js",
  },
  {
    id: "course-dsa-003",
    slug: "cau-truc-du-lieu",
    title: "Cấu trúc dữ liệu & Giải thuật",
    level: "Advanced",
    price: 0,
    rating: 4.7,
    lessonCount: 20,
    enrollmentCount: 210,
    coverImageUrl: null,
    description: "Ôn thi phỏng vấn thuật toán",
  },
];

describe("ai-advisor-service business logic", () => {
  it("formats VND properly", () => {
    expect(formatVnd(0)).toBe("Miễn phí");
    expect(formatVnd(1290000)).toMatch(/1\.290\.000\s?₫/);
  });

  it("maps level labels to Vietnamese standard", () => {
    expect(levelLabel("Beginner")).toBe("Cơ bản");
    expect(levelLabel("Intermediate")).toBe("Trung cấp");
    expect(levelLabel("Advanced")).toBe("Nâng cao");
  });

  const answer = (output: Partial<AdvisorModelOutput>) =>
    toAdvisorAnswer(
      {
        text: "Gợi ý cho bạn",
        courses: [],
        compare: false,
        order: [],
        followups: [],
        noMatch: false,
        ...output,
      },
      mockCatalog,
    );

  it("keeps only real catalogue courses, once each, at most 3, best match first", () => {
    const res = answer({
      courses: [
        { id: "course-node-002", reason: "Hợp mục tiêu làm backend" },
        { id: "fake-course", reason: "Không có trong danh mục" },
        { id: "course-node-002", reason: "Trùng" },
        { id: "course-react-001", reason: "Nền tảng" },
        { id: "course-dsa-003", reason: "Phỏng vấn" },
      ],
    });
    expect(res.courses.map((c) => c.id)).toEqual([
      "course-node-002",
      "course-react-001",
      "course-dsa-003",
    ]);
    expect(res.courses.map((c) => c.isBestMatch)).toEqual([true, false, false]);
  });

  it("takes card and table values from the catalogue, not the model", () => {
    const res = answer({
      courses: [
        { id: "course-react-001", reason: "Bạn mới bắt đầu" },
        { id: "course-dsa-003", reason: "Bạn ôn phỏng vấn" },
      ],
      compare: true,
    });
    expect(res.courses[0]).toMatchObject({
      title: "React cơ bản",
      level: "Cơ bản",
      price: 590000,
      lessonCount: 12,
      learnersCount: 120,
      reason: "Bạn mới bắt đầu",
    });
    expect(res.table).toEqual({
      headers: ["Khoá học", "Trình độ", "Số bài", "Học phí", "Phù hợp khi"],
      rows: [
        ["React cơ bản", "Cơ bản", "12", formatVnd(590000), "Bạn mới bắt đầu"],
        ["Cấu trúc dữ liệu & Giải thuật", "Nâng cao", "20", "Miễn phí", "Bạn ôn phỏng vấn"],
      ],
    });
  });

  it("only builds a comparison table for at least 2 real courses", () => {
    expect(
      answer({ courses: [{ id: "course-react-001", reason: "x" }], compare: true }).table,
    ).toBeNull();
  });

  it("maps the suggested order to real courses with catalogue titles", () => {
    const res = answer({
      order: [
        { id: "course-react-001", reason: "Học trước" },
        { id: "nope", reason: "x" },
        { id: "course-node-002", reason: "Sau đó" },
      ],
    });
    expect(res.order).toEqual([
      { id: "course-react-001", slug: "react-co-ban", title: "React cơ bản", reason: "Học trước" },
      { id: "course-node-002", slug: "nodejs-backend", title: "Node.js & Express", reason: "Sau đó" },
    ]);
  });

  it("states 'Codi chưa có khoá' on no match and caps follow-ups at 3", () => {
    const res = answer({
      text: "Bạn có thể bắt đầu với khoá gần nhất.",
      noMatch: true,
      courses: [{ id: "course-react-001", reason: "Gần nhất" }],
      followups: ["A", " ", "B", "C", "D"],
    });
    expect(res.noMatch).toBe(true);
    expect(res.text).toBe(`${ADVISOR_NO_MATCH}. Bạn có thể bắt đầu với khoá gần nhất.`);
    expect(res.followups).toEqual(["A", "B", "C"]);
    expect(answer({ text: `${ADVISOR_NO_MATCH} về Elixir.`, noMatch: true }).text).toBe(
      `${ADVISOR_NO_MATCH} về Elixir.`,
    );
  });

  it("gives the model the catalogue by id, what Codi knows about the learner and recent turns", () => {
    const { system, prompt } = advisorPrompt({
      prompt: "So sánh 2 khoá vừa rồi",
      catalog: mockCatalog,
      intake: { goal: "Làm được dự án", level: "Mới bắt đầu", hoursPerWeek: "5-10 giờ", skipped: [] },
      ownedCourseIds: ["course-react-001"],
      currentCourse: { id: "course-react-001", slug: "react-co-ban", title: "React cơ bản", doneLessons: 4, totalLessons: 12 },
      history: [
        { role: "user", text: "Mình muốn làm web" },
        { role: "ai", text: "Gợi ý React và Node" },
      ],
    });
    expect(system).toContain("Chỉ đề xuất khoá có trong <catalog>");
    expect(prompt).toContain('"id":"course-node-002"');
    expect(prompt).toContain('"id":"course-react-001","title":"React cơ bản","level":"Cơ bản"');
    expect(prompt).toMatch(/"id":"course-react-001"[^\n]*"owned":true/);
    expect(prompt).toMatch(/"id":"course-node-002"[^\n]*"owned":false/);
    expect(prompt).toContain("Mục tiêu: Làm được dự án");
    expect(prompt).toContain("Thời gian: 5-10 giờ/tuần");
    expect(prompt).toContain("Đang học: React cơ bản (4/12 bài)");
    expect(prompt).toContain("Học viên: Mình muốn làm web\nCodi: Gợi ý React và Node");
    expect(prompt.endsWith("Câu hỏi: So sánh 2 khoá vừa rồi")).toBe(true);
  });

  it("generates and verifies guest capability tokens securely", async () => {
    const { generateGuestFeedbackToken, verifyGuestFeedbackToken } = await import(
      "./ai-advisor-service"
    );
    const secret = "test-auth-secret-123";
    const token = generateGuestFeedbackToken(42, secret);

    expect(typeof token).toBe("string");
    expect(verifyGuestFeedbackToken(42, token, secret)).toBe(true);
    expect(verifyGuestFeedbackToken(42, "tampered-token", secret)).toBe(false);
    expect(verifyGuestFeedbackToken(99, token, secret)).toBe(false);
    expect(verifyGuestFeedbackToken(42, token, "wrong-secret")).toBe(false);
  });
});

describe("advisor intake owner storage", () => {
  it("logs the provider model and token usage of an answer", async () => {
    const values = vi.fn(() => ({ returning: async () => [{ id: 42 }] }));
    const db: any = { insert: () => ({ values }) };
    expect(await logAdvisorInteraction(db, {
      userId: null, userPrompt: "So sánh khoá học", aiResponse: "answer", latencyMs: 5, isSuccess: true,
      model: "gpt-6-luna", promptTokens: 900, completionTokens: 120,
    })).toBe(42);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-6-luna", promptTokens: 900, completionTokens: 120, isSuccess: true, requestType: "ask_advisor",
    }));
  });
  it("records intake for the session owner even before any enrollment exists", async () => {
    const values = vi.fn().mockResolvedValue([]);
    const insert = vi.fn(() => ({ values }));
    const where = vi.fn().mockResolvedValue([]);
    const db: any = { insert, select: () => ({ from: () => ({ where }) }), update: vi.fn() };
    await syncLearnerIntakeGoalDraft(db, "owner-before-enrollment", {
      goal: "Hoàn thành khoá học", level: "Trung cấp", hoursPerWeek: "5-10 giờ", skipped: [],
    });
    expect(insert).toHaveBeenCalledWith(studentActivities);
    const activity = values.mock.calls[0][0];
    expect(activity.userId).toBe("owner-before-enrollment");
    expect(JSON.parse(activity.metadata)).toMatchObject({
      type: "advisor_intake", draft: { goal: "finish", level: "solid", hours: 5 },
    });
    const predicate = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(predicate.params).toEqual(["owner-before-enrollment", "active"]);
    expect(predicate.sql).toContain('"student_enrollments"."user_id"');
    expect(db.update).not.toHaveBeenCalled();
  });

  it("loads only the requested owner's saved activity when there are no enrollments", async () => {
    const intake = { goal: "Làm được dự án", level: "Mới bắt đầu", hoursPerWeek: "< 5 giờ" };
    const predicates: unknown[] = [];
    const db: any = { select: () => ({ from: (table: unknown) => ({
      innerJoin() { return this; },
      where(predicate: unknown) { predicates.push(predicate); return this; },
      orderBy() { return table === studentEnrollments ? Promise.resolve([]) : this; },
      limit: async () => [{ metadata: JSON.stringify({ type: "advisor_intake", intake }) }],
    }) }) };
    expect(await getLearnerProgressContext(db, "saved-owner")).toEqual({
      currentCourse: null, ownedCourseIds: [], savedIntake: intake,
    });
    const activityQuery = new PgDialect().sqlToQuery(predicates[1] as any);
    expect(activityQuery.params).toEqual(["saved-owner", "course_view", "%advisor_intake%"]);
    expect(activityQuery.sql).toContain('"student_activities"."user_id"');
  });
});

describe("advisor context sent to the model", () => {
  it("names the courses an earlier answer showed, so follow-ups can refer to them", () => {
    const { prompt } = advisorPrompt({
      prompt: "So sánh 2 khoá vừa rồi",
      catalog: mockCatalog,
      intake: { skipped: [] },
      ownedCourseIds: [],
      currentCourse: null,
      history: [
        { role: "user", text: "Mình muốn làm web" },
        { role: "ai", text: "Đây là 2 khoá hợp với bạn", courseIds: ["course-react-001", "fake", "course-node-002"] },
      ],
    });
    expect(prompt).toContain(
      "Codi: Đây là 2 khoá hợp với bạn (khoá đã gợi ý: React cơ bản [course-react-001], Node.js & Express [course-node-002])",
    );
    expect(prompt).not.toContain("fake");
  });

  it("keeps a large catalogue relevant: ranks by the question and keeps mentioned courses", () => {
    const many: AdvisorCourseItem[] = Array.from({ length: 100 }, (_, i) => ({
      ...mockCatalog[0]!,
      id: `c-${i}`,
      slug: `khoa-${i}`,
      title: `Khoá ${String(i).padStart(3, "0")}`,
      description: i === 95 ? "Lập trình Elixir và Phoenix" : "Nền tảng lập trình",
    }));
    const picked = advisorCatalogSlice(many, "Có khoá Elixir không?", new Set(["c-99"]), 10);
    expect(picked).toHaveLength(10);
    expect(picked.map((c) => c.id)).toEqual(expect.arrayContaining(["c-95", "c-99"]));
    expect(advisorCatalogSlice(mockCatalog, "bất kỳ", new Set(), 10)).toBe(mockCatalog);
  });
});
