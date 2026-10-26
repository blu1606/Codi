import type { AdvisorCourseCard, AdvisorStructuredResponse } from "@/lib/ai-advisor-contract";

const cards: AdvisorCourseCard[] = [
  { id: "c-react", slug: "react-co-ban-nang-cao", title: "React từ cơ bản đến nâng cao", level: "Intermediate", lessonCount: 24, price: 1290000, rating: 4.8, learnersCount: 860, coverImageUrl: null, reason: "Phù hợp mục tiêu làm frontend.", isBestMatch: true },
  { id: "c-node", slug: "nodejs-rest-api", title: "Node.js & REST API thực chiến", level: "Beginner", lessonCount: 18, price: 990000, rating: 4.6, learnersCount: 412, coverImageUrl: null, reason: "Học backend từ đầu." },
];

/** GET /api/ai for a signed-in learner who has already answered the intake questions. */
export function advisorInitWithIntake() {
  return {
    user: { id: "usr-learner-001", name: "Nguyễn Minh An" },
    currentCourse: null,
    savedIntake: { goal: "Làm frontend", level: "Cơ bản", hoursPerWeek: "5-10" },
  };
}

/** GET /api/ai for a signed-in learner with no saved intake (intake chips visible). */
export function advisorInitNoIntake() {
  return { user: { id: "usr-learner-001", name: "Nguyễn Minh An" }, currentCourse: null, savedIntake: null };
}

/** GET /api/ai for a guest. */
export function advisorInitGuest() {
  return { user: null, currentCourse: null, savedIntake: null };
}

/** POST /api/ai answer with course cards and follow-ups. */
export const advisorAnswer: AdvisorStructuredResponse & { logId: number; feedbackToken: string } = {
  text: "Với mục tiêu làm frontend và thời gian 5–10 giờ mỗi tuần, bạn nên bắt đầu với lộ trình React.",
  courses: cards,
  table: null,
  order: [],
  followups: ["So sánh hai khoá học", "Lộ trình 3 tháng"],
  noMatch: false,
  logId: 101,
  feedbackToken: "fb-101",
};

/** POST /api/ai answer with a comparison table. */
export const advisorComparison: AdvisorStructuredResponse & { logId: number; feedbackToken: string } = {
  ...advisorAnswer,
  text: "Đây là bảng so sánh hai khoá học đang mở bán.",
  table: {
    headers: ["Tiêu chí", "React", "Node.js"],
    rows: [["Cấp độ", "Trung cấp", "Cơ bản"], ["Số bài", "24", "18"], ["Học phí", "1.290.000 ₫", "990.000 ₫"]],
  },
  courses: [],
  followups: [],
  logId: 102,
  feedbackToken: "fb-102",
};

/** POST /api/ai answer with no matching course (S17 no-match state). */
export const advisorNoMatch: AdvisorStructuredResponse & { logId: number; feedbackToken: string } = {
  text: "Hiện chưa có khoá học nào khớp với yêu cầu này. Bạn có thể thử mô tả mục tiêu khác.",
  courses: [],
  table: null,
  order: [],
  followups: ["Thử mục tiêu khác"],
  noMatch: true,
  logId: 103,
  feedbackToken: "fb-103",
};

/** Ownership map for the course cards in an advisor answer (POST /api/courses/ownership). */
export const advisorOwnerships = {
  ownerships: {
    "c-react": { ownership: "not-owned" },
    "c-node": { ownership: "not-owned" },
  },
};
