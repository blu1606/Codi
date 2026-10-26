import "server-only";
import { and, count, eq, gte, lt } from "drizzle-orm";
import { lessonProgress, studentEnrollments, type Database } from "@codi-1/db";
import { analyticsWindow, type LearnerStatsData } from "./analytics-contract";

export async function getLearnerStatsData(
  db: Database, userId: string, period: string, courseId = "all", now = new Date(),
): Promise<LearnerStatsData> {
  if (!userId.trim()) throw new Error("Learner identity required");
  const window = analyticsWindow(period, now);
  const owner = and(
    eq(studentEnrollments.userId, userId),
    courseId === "all" ? undefined : eq(studentEnrollments.courseId, courseId),
  );
  const [enrollments, completed, studied] = await Promise.all([
    // Current ownership snapshot (all enrollment statuses); not new enrollments in the period.
    db.select({ value: count() }).from(studentEnrollments).where(owner),
    db.select({ value: count() }).from(lessonProgress)
      .innerJoin(studentEnrollments, eq(lessonProgress.enrollmentId, studentEnrollments.id))
      .where(and(owner, eq(lessonProgress.status, "completed"),
        gte(lessonProgress.completedAt, new Date(window.start)),
        lt(lessonProgress.completedAt, new Date(window.end)))),
    // A persisted attestation per lesson, not duration, sessions, or mastery.
    db.select({ value: count() }).from(lessonProgress)
      .innerJoin(studentEnrollments, eq(lessonProgress.enrollmentId, studentEnrollments.id))
      .where(and(owner, gte(lessonProgress.studiedAt, new Date(window.start)),
        lt(lessonProgress.studiedAt, new Date(window.end)))),
  ]);
  return {
    enrollments: Number(enrollments[0]?.value ?? 0),
    completedLessons: Number(completed[0]?.value ?? 0),
    studiedLessons: Number(studied[0]?.value ?? 0),
    studyMinutes: null,
    window,
  };
}
