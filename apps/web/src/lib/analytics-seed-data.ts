// Deterministic Seed Data Generator for Platform & Learner Analytics
// Source of truth: docs/mockup/js/data.js (lines 791-886)
// ANALYTICS_AS_OF: 2026-10-12

export const ANALYTICS_AS_OF = "2026-10-12";

export interface AnalyticsDailyRecord {
  date: string;
  dau: number;
  wau: number;
  signups: number;
  verified: number;
  firstPurchase: number;
  firstLesson: number;
  newEnrolments: number;
  lessonsCompleted: number;
  diagnosticTaken: number;
  startFromLesson1: number;
  aiRequests: number;
  aiErrors: number;
  pathRequests: number;
  pathErrors: number;
  rateLimitHits: number;
  p95Latency: number;
  cartAdds: number;
  buyNow: number;
  ordersCreated: number;
  ordersFromCart: number;
  ordersPaid: number;
  ordersExpired: number;
  ordersUnderpaid: number;
  ordersCancelled: number;
  ordersPending: number;
  revenue: number;
  discount: number;
  refunds: number;
  refundAmount: number;
  voucherUsage: number;
  payLt1: number;
  pay1to5: number;
  pay5to15: number;
  pay15to30: number;
}

export interface LearnerStudyDayRecord {
  userId: string;
  date: string;
  minutes: number;
}

export interface CourseAnalyticsMeta {
  id: string;
  title: string;
  categoryId: string;
  lecturerId: string;
  status: "draft" | "pending" | "published" | "hidden" | "rejected";
  price: number;
  learnersCount: number;
  submittedAt?: string | null;
  concepts?: { id: string; name: string }[];
  prerequisites?: { from: string; to: string }[];
  chapters?: { id: string; title: string; lessons: { id: string; title: string; quiz?: { questions: any[] } }[] }[];
}

export interface SubmissionAnalyticsMeta {
  id: string;
  courseId: string;
  lessonId: string;
  userId: string;
  status: "pending" | "graded";
  submittedAt: string;
  gradedAt: string | null;
}

export interface QuestionAnalyticsMeta {
  id: string;
  courseId: string;
  lessonId: string;
  userId: string;
  status: "unanswered" | "answered";
  createdAt: string;
}

export interface ReviewAnalyticsMeta {
  id: string;
  courseId: string;
  userId: string;
  stars: number;
  reply: { text: string; at: string } | null;
  createdAt: string;
}

export interface OrderAnalyticsMeta {
  code: string;
  status: "pending" | "paid" | "failed" | "cancelled" | "refunded" | "refund_requested";
  total: number;
  received: number;
  createdAt: string;
}

export interface VoucherAnalyticsMeta {
  id: string;
  code: string;
  type: "percent" | "amount";
  value: number;
  minOrder: number;
  usageLimit: number | null;
  used: number;
  expiresAt: string | null;
  active: boolean;
  scope: string;
}

export interface LearnerSeedCourseMeta {
  goal: { goal: string; level: string; hours: number };
  diagnostic: { status: string; right: number; wrong: number; unknown: number };
  pathStatus: string;
  completed: string[];
  currentLessonId: string;
  quizScores: Record<string, number>;
  mastery: Record<string, number>;
}

export interface CodeAttemptMeta {
  userId: string;
  courseId: string;
  lessonId: string;
  submits: number;
  passed: boolean;
  bestScore: number;
}

function generateAnalyticsDaily(): AnalyticsDailyRecord[] {
  let aSeed = 20261012;
  const ar = () => ((aSeed = (aSeed * 16807) % 2147483647) / 2147483647);
  const DOW = [0.82, 1.0, 1.04, 1.06, 1.02, 0.93, 0.78];
  const list: AnalyticsDailyRecord[] = [];
  const asOf = new Date(ANALYTICS_AS_OF + "T00:00:00Z");

  for (let i = 179; i >= 0; i--) {
    const d = new Date(asOf);
    d.setUTCDate(d.getUTCDate() - i);
    const k = DOW[d.getUTCDay()]! * (1 + 0.0028 * (179 - i)) * (0.9 + 0.2 * ar());
    const dau = Math.round(210 * k);
    const signups = Math.round(18 * k * (0.9 + 0.2 * ar()));
    const verified = Math.round(signups * (0.76 + 0.1 * ar()));
    const firstPurchase = Math.round(verified * (0.3 + 0.08 * ar()));
    const firstLesson = Math.round(firstPurchase * (0.68 + 0.15 * ar()));
    const newEnrolments = Math.round(firstPurchase * 1.35 + 8 * k);
    const diagnosticTaken = Math.round(newEnrolments * (0.52 + 0.12 * ar()));
    const ordersCreated = Math.round(firstPurchase * 1.5 + 3 * k);
    const ordersPaid = Math.round(ordersCreated * (0.76 + 0.1 * ar()));
    const unpaid = ordersCreated - ordersPaid;
    const ordersExpired = Math.round(unpaid * 0.55);
    const ordersUnderpaid = Math.round(unpaid * 0.12);
    const ordersCancelled = unpaid - ordersExpired - ordersUnderpaid;
    const aov = 760000 + Math.round(ar() * 220) * 1000;
    const revenue = ordersPaid * aov;
    const discount = Math.round((revenue * (0.05 + 0.05 * ar())) / 1000) * 1000;
    const refunds = ar() > 0.86 ? 1 : 0;
    const voucherUsage = Math.round(ordersPaid * (0.28 + 0.14 * ar()));
    const aiRequests = Math.round(dau * (1.5 + 0.4 * ar()));
    const latencySpike = i < 9 ? 260 : 0;
    const p1 = Math.round(ordersPaid * 0.18);
    const p2 = Math.round(ordersPaid * 0.46);
    const p3 = Math.round(ordersPaid * 0.24);

    list.push({
      date: d.toISOString().slice(0, 10),
      dau,
      wau: Math.round(dau * 3.1),
      signups,
      verified,
      firstPurchase,
      firstLesson,
      newEnrolments,
      lessonsCompleted: Math.round(dau * (1.4 + 0.4 * ar())),
      diagnosticTaken,
      startFromLesson1: newEnrolments - diagnosticTaken,
      aiRequests,
      aiErrors: Math.round(aiRequests * (0.004 + 0.008 * ar())),
      pathRequests: Math.round(newEnrolments * 0.9),
      pathErrors: Math.round(newEnrolments * 0.9 * (0.01 + 0.03 * ar())),
      rateLimitHits: Math.round(aiRequests * 0.006 * ar()),
      p95Latency: 1180 + Math.round(ar() * 320) + latencySpike,
      cartAdds: Math.round(ordersCreated * 2.3),
      buyNow: Math.round(ordersCreated * 0.55),
      ordersCreated,
      ordersFromCart: Math.round(ordersCreated * 0.64),
      ordersPaid,
      ordersExpired,
      ordersUnderpaid,
      ordersCancelled,
      ordersPending: i < 1 ? 2 : 0,
      revenue,
      discount,
      refunds,
      refundAmount: refunds * aov,
      voucherUsage,
      payLt1: p1,
      pay1to5: p2,
      pay5to15: p3,
      pay15to30: ordersPaid - p1 - p2 - p3,
    });
  }
  return list;
}

function generateLearnerStudyDays(): LearnerStudyDayRecord[] {
  let aSeed = 20261012;
  const ar = () => ((aSeed = (aSeed * 16807) % 2147483647) / 2147483647);
  const list: LearnerStudyDayRecord[] = [];
  const asOf = new Date(ANALYTICS_AS_OF + "T00:00:00Z");

  for (let i = 119; i >= 0; i--) {
    const d = new Date(asOf);
    d.setUTCDate(d.getUTCDate() - i);
    const recent = i < 6;
    const studied = recent || ar() > 0.42;
    list.push({
      userId: "usr-learner-001",
      date: d.toISOString().slice(0, 10),
      minutes: studied ? 15 + Math.round(ar() * 70) : 0,
    });
  }
  return list;
}

export const SEED_ANALYTICS_DAILY = generateAnalyticsDaily();
export const SEED_LEARNER_STUDY_DAYS = generateLearnerStudyDays();

export const SEED_COURSES: CourseAnalyticsMeta[] = [
  {
    id: "course-js-001",
    title: "JavaScript nền tảng",
    categoryId: "cat-frontend",
    lecturerId: "usr-lecturer-001",
    status: "published",
    price: 499000,
    learnersCount: 1420,
    concepts: [
      { id: "j-var", name: "Biến và kiểu dữ liệu" },
      { id: "j-func", name: "Hàm và phạm vi" },
      { id: "j-array", name: "Mảng và phương thức lặp" },
      { id: "j-object", name: "Đối tượng và tham chiếu" },
      { id: "j-dom", name: "Thao tác DOM và sự kiện" },
      { id: "j-async", name: "Bất đồng bộ (Promise/async)" },
    ],
    prerequisites: [
      { from: "j-var", to: "j-func" },
      { from: "j-var", to: "j-array" },
      { from: "j-var", to: "j-object" },
      { from: "j-func", to: "j-dom" },
      { from: "j-object", to: "j-dom" },
      { from: "j-dom", to: "j-async" },
    ],
    chapters: [
      {
        id: "ch-js-1",
        title: "Cơ bản",
        lessons: [
          { id: "lesson-js-001", title: "Biến và cú pháp", quiz: { questions: [{}, {}, {}, {}] } },
          { id: "lesson-js-002", title: "Hàm trong JavaScript", quiz: { questions: [{}, {}, {}, {}] } },
          { id: "lesson-js-003", title: "Mảng và lặp", quiz: { questions: [{}, {}, {}, {}] } },
          { id: "lesson-js-004", title: "Đối tượng cơ bản", quiz: { questions: [{}, {}, {}, {}] } },
        ],
      },
    ],
  },
  {
    id: "course-react-001",
    title: "React từ cơ bản đến dự án thực tế",
    categoryId: "cat-frontend",
    lecturerId: "usr-lecturer-001",
    status: "published",
    price: 1290000,
    learnersCount: 890,
  },
  {
    id: "course-node-001",
    title: "Node.js & Express RESTful API",
    categoryId: "cat-backend",
    lecturerId: "usr-lecturer-002",
    status: "published",
    price: 890000,
    learnersCount: 650,
  },
  {
    id: "course-git-001",
    title: "Git & GitHub cho lập trình viên",
    categoryId: "cat-tools",
    lecturerId: "usr-lecturer-001",
    status: "published",
    price: 290000,
    learnersCount: 1100,
  },
  {
    id: "course-next-001",
    title: "Next.js App Router thực chiến",
    categoryId: "cat-frontend",
    lecturerId: "usr-lecturer-002",
    status: "pending",
    price: 1490000,
    learnersCount: 0,
    submittedAt: "2026-10-08T14:20:00Z",
  },
  {
    id: "course-solid-001",
    title: "Clean Code & SOLID trong JavaScript",
    categoryId: "cat-tools",
    lecturerId: "usr-lecturer-001",
    status: "rejected",
    price: 590000,
    learnersCount: 0,
  },
  {
    id: "course-draft-001",
    title: "TypeScript nâng cao",
    categoryId: "cat-frontend",
    lecturerId: "usr-lecturer-001",
    status: "draft",
    price: 790000,
    learnersCount: 0,
  },
];

export const SEED_VOUCHERS: VoucherAnalyticsMeta[] = [
  { id: "v-001", code: "WELCOME20", type: "percent", value: 20, minOrder: 500000, usageLimit: 500, used: 132, expiresAt: "2026-12-31", active: true, scope: "all" },
  { id: "v-002", code: "REACT10", type: "percent", value: 10, minOrder: 0, usageLimit: null, used: 41, expiresAt: null, active: true, scope: "all" },
  { id: "v-003", code: "GIAM100K", type: "amount", value: 100000, minOrder: 800000, usageLimit: 100, used: 100, expiresAt: "2026-11-30", active: true, scope: "all" },
  { id: "v-004", code: "SUMMER15", type: "percent", value: 15, minOrder: 0, usageLimit: 300, used: 287, expiresAt: "2026-08-31", active: false, scope: "all" },
  { id: "v-005", code: "BACKEND50K", type: "amount", value: 50000, minOrder: 0, usageLimit: null, used: 12, expiresAt: "2027-01-31", active: true, scope: "all" },
];

export const SEED_ORDERS: OrderAnalyticsMeta[] = [
  { code: "CODI10234", status: "pending", total: 499000, received: 450000, createdAt: "2026-10-12T08:00:00Z" },
  { code: "CODI10235", status: "pending", total: 1290000, received: 0, createdAt: "2026-10-12T06:00:00Z" },
  { code: "CODI10212", status: "refund_requested", total: 890000, received: 890000, createdAt: "2026-10-11T14:00:00Z" },
];

export const SEED_SUBMISSIONS: SubmissionAnalyticsMeta[] = [
  { id: "sub-001", courseId: "course-react-001", lessonId: "lesson-react-005", userId: "usr-learner-005", status: "pending", submittedAt: "2026-10-10T22:10:00Z", gradedAt: null },
  { id: "sub-002", courseId: "course-react-001", lessonId: "lesson-react-005", userId: "usr-learner-006", status: "pending", submittedAt: "2026-10-09T18:30:00Z", gradedAt: null },
  { id: "sub-004", courseId: "course-react-001", lessonId: "lesson-react-012", userId: "usr-learner-003", status: "graded", submittedAt: "2026-10-06T09:00:00Z", gradedAt: "2026-10-07T08:00:00Z" },
  { id: "sub-008", courseId: "course-js-001", lessonId: "lesson-js-002", userId: "usr-learner-001", status: "graded", submittedAt: "2026-08-25T20:00:00Z", gradedAt: "2026-08-27T09:00:00Z" },
];

export const SEED_QUESTIONS: QuestionAnalyticsMeta[] = [
  { id: "qa-001", courseId: "course-react-001", lessonId: "lesson-react-005", userId: "usr-learner-005", status: "unanswered", createdAt: "2026-10-10T20:00:00Z" },
  { id: "qa-002", courseId: "course-react-001", lessonId: "lesson-react-008", userId: "usr-learner-002", status: "unanswered", createdAt: "2026-10-09T14:00:00Z" },
  { id: "qa-003", courseId: "course-react-001", lessonId: "lesson-react-003", userId: "usr-learner-006", status: "answered", createdAt: "2026-10-05T10:00:00Z" },
];

export const SEED_REVIEWS: ReviewAnalyticsMeta[] = [
  { id: "rv-001", courseId: "course-react-001", userId: "usr-learner-003", stars: 5, reply: { text: "Cảm ơn bạn!", at: "2026-10-07T15:00:00Z" }, createdAt: "2026-10-07T09:00:00Z" },
  { id: "rv-002", courseId: "course-react-001", userId: "usr-learner-002", stars: 4, reply: null, createdAt: "2026-10-03T21:00:00Z" },
];

export const SEED_LEARNER: LearnerSeedCourseMeta = {
  goal: { goal: "project", level: "basic", hours: 5 },
  diagnostic: { status: "done", right: 3, wrong: 1, unknown: 2 },
  pathStatus: "ready",
  completed: ["lesson-js-001", "lesson-js-002", "lesson-js-003", "lesson-js-004"],
  currentLessonId: "lesson-js-005",
  quizScores: {
    "lesson-js-001": 100,
    "lesson-js-002": 50,
    "lesson-js-003": 100,
    "lesson-js-004": 100,
  },
  mastery: { "j-var": 4, "j-func": 3, "j-array": 3, "j-object": 2, "j-dom": 1, "j-async": 0 },
};

export const SEED_CODE_ATTEMPTS: CodeAttemptMeta[] = [
  { userId: "usr-learner-001", courseId: "course-js-001", lessonId: "lesson-js-p01", submits: 2, passed: true, bestScore: 90 },
  { userId: "usr-learner-001", courseId: "course-js-001", lessonId: "lesson-js-p02", submits: 3, passed: true, bestScore: 85 },
];
