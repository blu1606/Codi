export type AnalyticsPeriod = "7" | "30" | "90" | "month";
export type AdminMetric = "users" | "courses" | "orders";

export function analyticsWindow(period: string, now = new Date()) {
  if (!["7", "30", "90", "month"].includes(period)) throw new Error("Invalid analytics period");
  const day = 86_400_000;
  const offset = 7 * 3_600_000;
  const local = new Date(now.getTime() + offset);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const days = period === "month" ? local.getUTCDate() : Number(period);
  return {
    start: new Date(midnight - offset - (days - 1) * day).toISOString(),
    end: new Date(midnight - offset + day).toISOString(),
    timeZone: "Asia/Ho_Chi_Minh" as const,
    period: period as AnalyticsPeriod,
  };
}

export interface CountData {
  value: number;
  window: ReturnType<typeof analyticsWindow>;
}
// Learner S13b (/insights/stats). Study time is per learner, not per course (no course on study days).
// Mastery levels use the 5-stop scale of enrollment_skill_mastery: 0 no evidence, 1 < 0.40, 2 < 0.60,
// 3 < 0.85 ("Thành thạo"), 4 >= 0.85 ("Thành thạo · vững"). Mastered = level >= 3.
export interface LearnerStatsDay { date: string; minutes: number }
export interface LearnerStatsWeek { weekStart: string; minutes: number }
export interface LearnerStatsCourse { id: string; title: string }
export interface LearnerStatsSkill { id: number; name: string; courseId: string; courseTitle: string; level: 0 | 1 | 2 | 3 | 4 }
export interface LearnerStatsScore { id: number; label: string; kind: "Quiz" | "Bài code"; percent: number; date: string }
export interface LearnerStatsQuiz { id: string; label: string; correct: number; wrong: number; unknown: number }

export interface LearnerStatsData {
  enrollments: number;
  completedLessons: number;
  previousCompletedLessons: number;
  studyMinutes: number;
  previousStudyMinutes: number;
  streak: { current: number; best: number };
  weeklyGoalMinutes: number;
  /** false when no enrollment set a goal: the UI shows the 5 h default as an assumption. */
  weeklyGoalSet: boolean;
  /** Every GMT+7 day of the window, zero-filled. */
  days: LearnerStatsDay[];
  /** Last six Monday-start weeks ending with the window's last day, zero-filled. */
  weeks: LearnerStatsWeek[];
  /** Study days (minutes > 0) covering the window or the last 28 days, whichever is longer. */
  calendar: LearnerStatsDay[];
  skills: { total: number; mastered: number; items: LearnerStatsSkill[] };
  diagnosticSkipped: boolean;
  courses: LearnerStatsCourse[];
  /** Latest graded quiz (non-diagnostic) and submitted coding exercise per item, oldest first. */
  scores: LearnerStatsScore[];
  /** Latest graded quiz per item, diagnostic included; answers by correctness. */
  quizzes: LearnerStatsQuiz[];
  window: ReturnType<typeof analyticsWindow>;
}

export const ANALYTICS_UNAVAILABLE = "Chưa khả dụng trong bản prototype: biểu đồ, so sánh, chi tiết và xuất CSV chưa có dữ liệu được xác minh.";
export const FINANCE_UNAVAILABLE = "Chưa khả dụng: chưa xác định cách ghi nhận doanh thu, giảm giá và hoàn tiền theo kỳ. Không ước tính số tiền hoặc số đơn cần đối soát.";

// ── Admin S36, finance S37, lecturer revenue S29b (issues #216, #233) ──
// Money is VND integer. Revenue basis: an order counts in a period by paidAt (paid or later refunded);
// gross = subtotal before voucher; discount = discountAmount; net = totalAmount (= gross − discount);
// refunds = totalAmount of refunded orders dated by updatedAt (no refundedAt column exists).
// Days are GMT+7 calendar days inside the window.
export type AnalyticsWindow = ReturnType<typeof analyticsWindow>;

export interface AdminDayRow {
  date: string;
  signups: number;
  newEnrolments: number;
  lessonsCompleted: number;
  /** Distinct learners with study time (seconds > 0) on that day. */
  activeLearners: number;
}

export interface AdminTotals {
  signups: number;
  newEnrolments: number;
  lessonsCompleted: number;
  activeLearnersAvg: number;
}

export interface AdminInsightsData {
  window: AnalyticsWindow;
  previousWindow: AnalyticsWindow;
  daily: AdminDayRow[];
  previousDaily: AdminDayRow[];
  totals: AdminTotals;
  previousTotals: AdminTotals;
  publishedCourses: number;
  /** Cohort = accounts created in the window. */
  funnel: { signups: number; verified: number; purchased: number; firstLesson: number };
  courseStatus: { draft: number; pending: number; rejected: number; published: number; hidden: number };
  /** Enrolment snapshot per published course (not period-bound). */
  completion: { courseId: string; title: string; learners: number; completed: number }[];
  operations: { unansweredQuestions: number; unrepliedReviews: number };
}

export interface RevenueTotals {
  gross: number;
  discount: number;
  net: number;
  paidOrders: number;
  averageOrderValue: number;
  refunds: number;
  refundCount: number;
}

export interface RevenueDayRow {
  date: string;
  gross: number;
  discount: number;
  net: number;
  refunds: number;
}

export interface CourseRevenueRow {
  courseId: string;
  title: string;
  gross: number;
  discount: number;
  net: number;
  refunds: number;
  paidOrders: number;
}

export type OrderStatusBucket = "paid" | "awaiting" | "underpaid" | "expired" | "failed" | "cancelled" | "refunded";

export interface ReconciliationItem {
  code: string;
  status: string;
  totalAmount: number;
  receivedAmount: number;
  createdAt: string;
  reasons: ("underpaid" | "stale" | "flagged")[];
}

export interface FinanceData {
  window: AnalyticsWindow;
  previousWindow: AnalyticsWindow;
  totals: RevenueTotals;
  previousTotals: RevenueTotals;
  daily: RevenueDayRow[];
  previousDaily: RevenueDayRow[];
  statusDistribution: { bucket: OrderStatusBucket; orders: number; amount: number }[];
  courses: CourseRevenueRow[];
  paymentTime: { buckets: { label: string; orders: number }[]; medianLabel: string | null };
  vouchers: { code: string; orders: number; discount: number; net: number }[];
  reconciliation: { underpaid: number; stalePending: number; flagged: number; items: ReconciliationItem[] };
}

export interface LecturerRevenueData {
  window: AnalyticsWindow;
  previousWindow: AnalyticsWindow;
  totals: RevenueTotals;
  previousTotals: RevenueTotals;
  daily: RevenueDayRow[];
  previousDaily: RevenueDayRow[];
  courses: CourseRevenueRow[];
}
