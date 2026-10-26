import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createDb, type Database } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { courseChapters, courseLessons } from "@codi-1/db/schema/course-content";
import { assessments, assessmentSubmissions } from "@codi-1/db/schema/assessments";
import { lessonProgress } from "@codi-1/db/schema/learning";
import { studentActivities, studentEnrollments } from "@codi-1/db/schema/student-profile";
import { studentStudyDays } from "@codi-1/db/schema/study-activity";
import { mockupLessonUuid } from "./seed-mockup-mapping";

// Adds study time, activity and lesson-completion history for the seed learner (minhanh@codi.vn,
// mockup usr-learner-001) so the S13b statistics page has data for every chart. Idempotent: study days
// and activities are inserted with ON CONFLICT DO NOTHING (existing app rows are kept), the tutorial
// completion is inserted only when absent, and the enrollment progress is recomputed from lesson_progress.
// Only this learner and their course-js-001 enrollment are read or written. No schema change.
// Days are GMT+7 calendar dates. Usage: cd apps/web && npx varlock run -- tsx scripts/seed-learner-stats.ts

const LEARNER_ID = "usr-learner-001";
const LEARNER_EMAIL = "minhanh@codi.vn";
const COURSE_ID = "course-js-001";
const TUTORIAL_LESSON = "lesson-js-p01";
const TUTORIAL_COMPLETED_AT = "2026-10-03T13:40:00.000Z"; // 20:40 GMT+7
const SEED_FROM = "2026-08-16"; // enrollment day; earlier study would precede the account's enrollment
const SEED_TO = "2026-10-26"; // inclusive, GMT+7
const TZ_OFFSET = "+07:00";
const CHUNK = 200;
// Forced ranges give a 9-day run in September, a gap before today, and a 6-day streak ending today.
const FORCED_STUDY = [["2026-09-01", "2026-09-09"], ["2026-10-21", "2026-10-26"]] as const;
const FORCED_GAPS = ["2026-09-10", "2026-10-20"] as const;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const localDate = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
const dateFromString = (day: string) => Date.parse(`${day}T00:00:00Z`);
const addDays = (day: string, n: number) => new Date(dateFromString(day) + n * 86_400_000).toISOString().slice(0, 10);
const inRange = (day: string, [from, to]: readonly [string, string]) => day >= from && day <= to;

function eachDay(from: string, to: string) {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
}

async function main() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production") throw new Error("Development DATABASE_URL required");
  const db: Database = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  try {
    const summary = await db.transaction(async (tx) => {
      const [learner] = await tx.select({ id: user.id, email: user.email }).from(user).where(eq(user.id, LEARNER_ID));
      if (!learner || learner.email !== LEARNER_EMAIL) throw new Error("Seed learner identity mismatch; nothing written.");
      const [enrollment] = await tx.select().from(studentEnrollments)
        .where(and(eq(studentEnrollments.userId, LEARNER_ID), eq(studentEnrollments.courseId, COURSE_ID)));
      if (!enrollment) throw new Error("Seed learner has no course-js-001 enrollment; nothing written.");
      const enrollmentId = enrollment.id;

      const tutorialId = mockupLessonUuid(TUTORIAL_LESSON);
      const [tutorial] = await tx.select({ id: courseLessons.id }).from(courseLessons).where(eq(courseLessons.id, tutorialId));
      if (!tutorial) throw new Error("Tutorial lesson not found in catalog; nothing written.");

      // 1. Lesson completion: attestation for a lesson without a quiz (tutorial), only when absent.
      const [existingTutorial] = await tx.select({ id: lessonProgress.id }).from(lessonProgress)
        .where(and(eq(lessonProgress.enrollmentId, enrollmentId), eq(lessonProgress.lessonId, tutorialId)));
      const tutorialInserted = !existingTutorial;
      if (tutorialInserted) {
        const completed = new Date(TUTORIAL_COMPLETED_AT);
        await tx.insert(lessonProgress).values({
          enrollmentId, lessonId: tutorialId, status: "completed", studiedAt: completed,
          firstStartedAt: new Date(completed.getTime() - 20 * 60_000), lastAccessedAt: completed, completedAt: completed,
        }).onConflictDoNothing();
      }

      const completions = await tx.select({ completedAt: lessonProgress.completedAt }).from(lessonProgress)
        .where(and(eq(lessonProgress.enrollmentId, enrollmentId), eq(lessonProgress.status, "completed")))
        .orderBy(asc(lessonProgress.completedAt));
      const quizSubmissions = await tx.select({ submittedAt: assessmentSubmissions.submittedAt }).from(assessmentSubmissions)
        .innerJoin(assessments, eq(assessments.id, assessmentSubmissions.assessmentId))
        .where(and(eq(assessmentSubmissions.enrollmentId, enrollmentId), eq(assessmentSubmissions.status, "graded"), eq(assessments.type, "quiz")))
        .orderBy(asc(assessmentSubmissions.submittedAt));

      // 2. Enrollment progress is round(completed / lessons * 100), as the lecturer progress view computes it.
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(courseLessons)
        .innerJoin(courseChapters, eq(courseChapters.id, courseLessons.chapterId))
        .where(eq(courseChapters.courseId, COURSE_ID));
      const progressValue = total ? Math.round((completions.length / total) * 100) : 0;
      const progressUpdated = progressValue !== enrollment.progress;
      if (progressUpdated) await tx.update(studentEnrollments).set({ progress: progressValue }).where(eq(studentEnrollments.id, enrollmentId));

      // 3. Study days (GMT+7). Deterministic PRNG so re-runs produce identical rows.
      const rand = mulberry32(20261026);
      const eventDays = new Set([
        ...completions.map((c) => localDate(c.completedAt!.getTime())),
        ...quizSubmissions.map((q) => localDate(q.submittedAt!.getTime())),
        localDate(new Date(TUTORIAL_COMPLETED_AT).getTime()),
        localDate(enrollment.enrolledAt.getTime()),
      ]);
      const studyRows: { userId: string; date: string; seconds: number }[] = [];
      const loginRows: { userId: string; type: "login"; courseId: null; occurredAt: Date }[] = [];
      for (const day of eachDay(SEED_FROM, SEED_TO)) {
        const weekend = [0, 6].includes(new Date(dateFromString(day)).getUTCDay());
        const roll = rand();
        const minuteRoll = rand();
        const hourRoll = rand();
        const secondRoll = rand();
        const forcedOn = FORCED_STUDY.some((r) => inRange(day, r)) || eventDays.has(day);
        const forcedOff = FORCED_GAPS.includes(day as (typeof FORCED_GAPS)[number]);
        const studied = !forcedOff && (forcedOn || roll < (weekend ? 0.45 : 0.8));
        if (!studied) continue;
        const minutes = weekend ? 20 + Math.floor(minuteRoll * 90) : 35 + Math.floor(minuteRoll * 60);
        const finalMinutes = eventDays.has(day) || forcedOn ? Math.max(minutes, 35) : minutes;
        studyRows.push({ userId: LEARNER_ID, date: day, seconds: finalMinutes * 60 });
        const hour = 18 + Math.floor(hourRoll * 4); // 18:00 to 21:59 GMT+7
        const minute = Math.floor(minuteRoll * 60);
        const second = Math.floor(secondRoll * 60);
        loginRows.push({
          userId: LEARNER_ID, type: "login", courseId: null,
          occurredAt: new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}${TZ_OFFSET}`),
        });
      }
      await insertChunks(studyRows, (chunk) => tx.insert(studentStudyDays).values(chunk).onConflictDoNothing());

      // 4. Activities: enrollment, logins, lesson completions and quiz submissions (unique per user and instant).
      const activityRows = [
        { userId: LEARNER_ID, type: "course_enrolled" as const, courseId: COURSE_ID, occurredAt: enrollment.enrolledAt },
        ...loginRows,
        ...completions.map((c) => ({ userId: LEARNER_ID, type: "lesson_complete" as const, courseId: COURSE_ID, occurredAt: c.completedAt! })),
        ...quizSubmissions.map((q) => ({ userId: LEARNER_ID, type: "quiz_complete" as const, courseId: COURSE_ID, occurredAt: q.submittedAt! })),
      ];
      await insertChunks(activityRows, (chunk) => tx.insert(studentActivities).values(chunk).onConflictDoNothing());

      const [studyCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(studentStudyDays).where(eq(studentStudyDays.userId, LEARNER_ID));
      const [activityCount] = await tx.select({ n: sql<number>`count(*)::int` }).from(studentActivities).where(eq(studentActivities.userId, LEARNER_ID));
      return {
        tutorialInserted, progressUpdated, progress: progressValue, lessonsTotal: total,
        completedLessons: completions.length, quizSubmissions: quizSubmissions.length,
        studyDayCandidates: studyRows.length, activityCandidates: activityRows.length,
        studyDaysNow: studyCount?.n, activitiesNow: activityCount?.n,
      };
    });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await db.$client.end();
  }
}

void main().catch((error: unknown) => {
  console.error("Learner stats seed failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
