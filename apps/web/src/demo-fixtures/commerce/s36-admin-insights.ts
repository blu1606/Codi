import { analyticsWindow, type AdminDayRow, type AdminInsightsData, type AnalyticsPeriod } from "@/lib/analytics-contract";
import { adminTotals, previousWindowOf, windowDayKeys } from "@/lib/analytics-formulas";

/** Fixed "as of" instant so the lab shows the same dates on every run (GMT+7, 26/10/2026). */
export const LAB_NOW = new Date("2026-10-26T05:00:00Z");

const DAY_SHAPE = (i: number, seed: number) => 0.5 + 0.5 * Math.sin((i + seed) / 3);

function dailyRows(window: ReturnType<typeof analyticsWindow>, seed: number, quiet: boolean): AdminDayRow[] {
  return windowDayKeys(window).map((date, i) => {
    if (quiet) return { date, signups: 0, newEnrolments: 0, lessonsCompleted: 0, activeLearners: 0 };
    const wave = DAY_SHAPE(i, seed);
    return {
      date,
      signups: Math.round(1 + wave * 5),
      newEnrolments: Math.round(2 + wave * 7),
      lessonsCompleted: Math.round(18 + wave * 36),
      activeLearners: Math.round(10 + wave * 16),
    };
  });
}

/** S36 overview payload for one period. `quiet` returns the "no activity in period" variant. */
export function adminInsightsFixture(period: AnalyticsPeriod = "30", quiet = false): AdminInsightsData {
  const window = analyticsWindow(period === "month" ? "30" : period, LAB_NOW);
  const previousWindow = previousWindowOf(window);
  const daily = dailyRows(window, 0, quiet);
  const previousDaily = dailyRows(previousWindow, 5, quiet);
  const totals = adminTotals(daily);
  const signups = totals.signups;
  return {
    window,
    previousWindow,
    daily,
    previousDaily,
    totals,
    previousTotals: adminTotals(previousDaily),
    publishedCourses: quiet ? 0 : 6,
    funnel: quiet
      ? { signups: 0, verified: 0, purchased: 0, firstLesson: 0 }
      : { signups, verified: Math.round(signups * 0.84), purchased: Math.round(signups * 0.31), firstLesson: Math.round(signups * 0.22) },
    courseStatus: quiet
      ? { draft: 0, pending: 0, rejected: 0, published: 0, hidden: 0 }
      : { draft: 4, pending: 2, rejected: 1, published: 6, hidden: 1 },
    completion: quiet
      ? []
      : [
          { courseId: "course-react-001", title: "React dự án thực tế", learners: 84, completed: 27 },
          { courseId: "course-node-001", title: "Node.js & Express xây dựng REST API", learners: 51, completed: 19 },
          { courseId: "course-ts-002", title: "TypeScript cho người viết JavaScript", learners: 33, completed: 9 },
          { courseId: "course-sql-003", title: "SQL và thiết kế cơ sở dữ liệu", learners: 12, completed: 2 },
        ],
    operations: quiet ? { unansweredQuestions: 0, unrepliedReviews: 0 } : { unansweredQuestions: 3, unrepliedReviews: 2 },
  };
}
