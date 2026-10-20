import { describe, expect, it } from "vitest";
import {
  buildAdvisorAnswer,
  formatVnd,
  levelLabel,
  type AdvisorCourseItem,
} from "./ai-advisor-service";
import type { IntakeState } from "./ai-advisor-contract";

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

  it("recommends courses based on goal and beginner intake", () => {
    const intake: IntakeState = {
      goal: "Làm được dự án",
      level: "Mới bắt đầu",
      hoursPerWeek: "5-10 giờ",
      skipped: [],
    };

    const res = buildAdvisorAnswer({
      prompt: "Tôi nên học khoá nào?",
      catalog: mockCatalog,
      intake,
      ownedCourseIds: [],
    });

    expect(res.text).toContain("Làm được dự án, Mới bắt đầu, 5-10 giờ/tuần");
    expect(res.courses.length).toBeGreaterThan(0);
    expect(res.courses[0].id).toBe("course-react-001");
    expect(res.courses[0].isBestMatch).toBe(true);
    expect(res.table).toBeNull();
    expect(res.noMatch).toBe(false);
  });

  it("generates a comparison table when prompt asks for comparison (so sánh)", () => {
    const intake: IntakeState = {
      goal: "Chuẩn bị phỏng vấn",
      level: "Trung cấp",
      hoursPerWeek: "> 10 giờ",
      skipped: [],
    };

    const res = buildAdvisorAnswer({
      prompt: "So sánh các khoá học phù hợp",
      catalog: mockCatalog,
      intake,
      ownedCourseIds: [],
    });

    expect(res.text).toContain("Đây là bảng so sánh các khoá phù hợp nhất với bạn");
    expect(res.table).not.toBeNull();
    expect(res.table?.headers).toEqual([
      "Khoá học",
      "Trình độ",
      "Số bài",
      "Học phí",
      "Phù hợp khi",
    ]);
    expect(res.table?.rows.length).toBe(3);
    expect(res.courses.length).toBe(3);
  });

  it("generates a roadmap order when prompt asks for course order or roadmap (thứ tự / lộ trình)", () => {
    const intake: IntakeState = {
      goal: "Làm được dự án",
      level: "Mới bắt đầu",
      hoursPerWeek: "5-10 giờ",
      skipped: [],
    };

    const res = buildAdvisorAnswer({
      prompt: "Nên học theo thứ tự nào?",
      catalog: mockCatalog,
      intake,
      ownedCourseIds: ["course-react-001"],
    });

    expect(res.text).toContain("Lộ trình gợi ý với 5-10 giờ/tuần");
    expect(res.order.length).toBeGreaterThan(0);
    // Unowned courses only in order recommendations
    expect(res.order.some((o) => o.id === "course-react-001")).toBe(false);
    expect(res.order[0].reason).toContain("nền tảng");
  });

  it("gives guidance when learner reports falling behind (chậm tiến độ)", () => {
    const res = buildAdvisorAnswer({
      prompt: "Mình bị chậm tiến độ, nên làm gì?",
      catalog: mockCatalog,
      intake: { skipped: [] },
      ownedCourseIds: [],
    });

    expect(res.text).toContain("Bàn làm việc");
    expect(res.text).toContain("Tìm điểm bắt đầu của tôi");
    expect(res.courses).toHaveLength(0);
  });

  it("handles no matching course gracefully with nearest alternatives", () => {
    const res = buildAdvisorAnswer({
      prompt: "Có khoá nào về blockchain solidity không?",
      catalog: mockCatalog,
      intake: { skipped: [] },
      ownedCourseIds: [],
    });

    expect(res.noMatch).toBe(true);
    expect(res.text).toContain("Codi chưa có khoá cho mục tiêu này");
    expect(res.courses.length).toBeGreaterThan(0);
  });

  it("matches requested subject rather than requiring the whole query string in course title", () => {
    const res = buildAdvisorAnswer({
      prompt: "Codi có khoá học Flutter cho người mới không?",
      catalog: mockCatalog,
      intake: { skipped: [] },
      ownedCourseIds: [],
    });

    expect(res.noMatch).toBe(true);
    expect(res.text).toContain("Codi chưa có khoá cho mục tiêu này");
    expect(res.courses.length).toBe(2);
  });

  it("detects absent subject outside the original whitelist (e.g. Python)", () => {
    const res = buildAdvisorAnswer({
      prompt: "Có khoá Python không?",
      catalog: mockCatalog,
      intake: { skipped: [] },
      ownedCourseIds: [],
    });

    expect(res.noMatch).toBe(true);
    expect(res.text).toContain("Codi chưa có khoá cho mục tiêu này");
    expect(res.courses.length).toBe(2);
  });

  it("does not trigger noMatch when requested subject is present in catalog (e.g. React)", () => {
    const res = buildAdvisorAnswer({
      prompt: "Có khoá React không?",
      catalog: mockCatalog,
      intake: { skipped: [] },
      ownedCourseIds: [],
    });

    expect(res.noMatch).toBe(false);
    expect(res.courses.length).toBeGreaterThan(0);
    expect(res.courses[0].id).toBe("course-react-001");
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
