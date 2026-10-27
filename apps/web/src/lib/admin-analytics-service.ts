import "server-only";
import { and, count, eq, exists, gte, isNull, lt, lte, sql } from "drizzle-orm";
import {
  courseDiscussions,
  courseReviews,
  courses,
  lessonProgress,
  orders,
  studentEnrollments,
  studentStudyDays,
  user,
  type Database,
} from "@codi-1/db";
import { analyticsWindow, type AdminInsightsData, type AdminMetric, type CountData } from "./analytics-contract";
import { adminDayRows, adminTotals, cohortFunnel, gmt7DayKey, previousWindowOf, windowDayKeys } from "./analytics-formulas";

// These are creation counts across all statuses, not active-user or paid-order metrics.
export async function getAdminCount(
  db: Database, metric: AdminMetric, period: string, now = new Date(),
): Promise<CountData> {
  const window = analyticsWindow(period, now);
  const table = { users: user, courses, orders }[metric];
  const [row] = await db.select({ value: count() }).from(table).where(and(
    gte(table.createdAt, new Date(window.start)),
    lt(table.createdAt, new Date(window.end)),
  ));
  return { value: Number(row?.value ?? 0), window };
}

const UNANSWERED_AFTER_MS = 48 * 3_600_000;

/** S36 overview: daily series for the current and previous window, cohort funnel, course status, completion, operations. Read-only. */
export async function getAdminInsightsOverview(db: Database, period: string, now = new Date()): Promise<AdminInsightsData> {
  const window = analyticsWindow(period, now);
  const previousWindow = previousWindowOf(window);
  const wideStart = new Date(previousWindow.start);
  const end = new Date(window.end);
  const dayKeys = windowDayKeys(previousWindow);

  const [signups, enrolments, lessons, studyDays, cohort, statusRows, publishedRows, enrolmentRows, unanswered, unreplied] = await Promise.all([
    db.select({ at: user.createdAt }).from(user).where(and(gte(user.createdAt, wideStart), lt(user.createdAt, end))),
    db.select({ at: studentEnrollments.enrolledAt }).from(studentEnrollments)
      .where(and(gte(studentEnrollments.enrolledAt, wideStart), lt(studentEnrollments.enrolledAt, end))),
    db.select({ at: lessonProgress.completedAt }).from(lessonProgress).where(and(
      eq(lessonProgress.status, "completed"),
      gte(lessonProgress.completedAt, wideStart),
      lt(lessonProgress.completedAt, end),
    )),
    // Study days are per learner, keyed by GMT+7 calendar date; only days with recorded study time count as active.
    db.select({ date: studentStudyDays.date }).from(studentStudyDays).where(and(
      gte(studentStudyDays.date, dayKeys[0]!),
      lte(studentStudyDays.date, gmt7DayKey(end.getTime() - 1)),
      sql`${studentStudyDays.seconds} > 0`,
    )),
    db.select({
      verified: user.emailVerified,
      purchased: exists(db.select({ one: sql`1` }).from(orders)
        .where(and(eq(orders.userId, user.id), eq(orders.status, "paid")))),
      firstLesson: exists(db.select({ one: sql`1` }).from(lessonProgress)
        .innerJoin(studentEnrollments, eq(lessonProgress.enrollmentId, studentEnrollments.id))
        .where(and(eq(studentEnrollments.userId, user.id), eq(lessonProgress.status, "completed")))),
    }).from(user).where(and(gte(user.createdAt, new Date(window.start)), lt(user.createdAt, end))),
    db.select({ status: courses.status, value: count() }).from(courses).groupBy(courses.status),
    db.select({ id: courses.id, title: courses.title }).from(courses).where(eq(courses.status, "published")),
    db.select({
      courseId: studentEnrollments.courseId,
      learners: count(),
      completed: sql<number>`count(*) filter (where ${studentEnrollments.status} = 'completed')`,
    }).from(studentEnrollments).groupBy(studentEnrollments.courseId),
    db.select({ value: count() }).from(courseDiscussions).where(and(
      isNull(courseDiscussions.parentId),
      eq(courseDiscussions.status, "unanswered"),
      eq(courseDiscussions.isHidden, false),
      lt(courseDiscussions.createdAt, new Date(now.getTime() - UNANSWERED_AFTER_MS)),
    )),
    db.select({ value: count() }).from(courseReviews).where(and(
      isNull(courseReviews.lecturerReply),
      eq(courseReviews.isVisible, true),
    )),
  ]);

  const series = {
    signups: signups.map((row) => row.at),
    newEnrolments: enrolments.map((row) => row.at),
    lessonsCompleted: lessons.map((row) => row.at!),
    activeDays: studyDays.map((row) => row.date),
  };
  const daily = adminDayRows(window, series);
  const previousDaily = adminDayRows(previousWindow, series);

  const statusCounts = { draft: 0, pending: 0, rejected: 0, published: 0, hidden: 0 };
  for (const row of statusRows) statusCounts[row.status as keyof typeof statusCounts] = Number(row.value);
  const enrolmentByCourse = new Map(enrolmentRows.map((row) => [row.courseId, row]));

  return {
    window,
    previousWindow,
    daily,
    previousDaily,
    totals: adminTotals(daily),
    previousTotals: adminTotals(previousDaily),
    publishedCourses: statusCounts.published,
    funnel: cohortFunnel(cohort.map((row) => ({
      verified: row.verified,
      purchased: Boolean(row.purchased),
      firstLesson: Boolean(row.firstLesson),
    }))),
    courseStatus: statusCounts,
    completion: publishedRows
      .map((course) => {
        const agg = enrolmentByCourse.get(course.id);
        return { courseId: course.id, title: course.title, learners: Number(agg?.learners ?? 0), completed: Number(agg?.completed ?? 0) };
      })
      .sort((a, b) => b.learners - a.learners || a.title.localeCompare(b.title)),
    operations: {
      unansweredQuestions: Number(unanswered[0]?.value ?? 0),
      unrepliedReviews: Number(unreplied[0]?.value ?? 0),
    },
  };
}
