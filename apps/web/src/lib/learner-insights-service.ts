import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import {
  assessmentAnswers,
  assessmentSubmissions,
  assessments,
  courses,
  enrollmentSkillMastery,
  lessonProgress,
  skills,
  studentEnrollments,
  studentStudyDays,
  type Database,
} from "@codi-1/db";
import { analyticsWindow, type LearnerStatsData, type LearnerStatsDay, type LearnerStatsQuiz, type LearnerStatsScore, type LearnerStatsSkill, type LearnerStatsWeek } from "./analytics-contract";

// Study days, lesson completions and assessments are read from existing tables only. Days are GMT+7
// calendar dates (the window from analyticsWindow); instants are compared with the window's exact bounds.
const DAY = 86_400_000;
const GMT7_MS = 7 * 3_600_000;
const DEFAULT_WEEKLY_GOAL_MINUTES = 300;
const MASTERED_LEVEL = 3;
const CALENDAR_MIN_DAYS = 28;
const WEEKS_SHOWN = 6;

export interface LearnerEnrollmentRow {
  id: number;
  courseId: string;
  courseTitle: string;
  diagnosticStatus: string;
  weeklyGoalMinutes: number | null;
}
export interface LearnerStudyDayRow { date: string; seconds: number }
export interface LearnerCompletionRow { enrollmentId: number; completedAt: Date | null }
export interface LearnerSkillRow { id: number; name: string; courseId: string; pMastery: number | null; evidenceCount: number | null }
export interface LearnerSubmissionRow {
  submissionId: number; assessmentId: number; attempt: number; type: "quiz" | "assignment" | "coding";
  mode: "run" | "submit" | null; isDiagnostic: boolean; title: string; courseId: string; maxScore: number;
  score: number | null; quizPercent: number | null; submittedAt: Date | null;
}
export interface LearnerAnswerRow { submissionId: number; isCorrect: boolean | null; isUnknown: boolean }
export interface LearnerStatsRows {
  enrollments: LearnerEnrollmentRow[];
  studyDays: LearnerStudyDayRow[];
  completions: LearnerCompletionRow[];
  skills: LearnerSkillRow[];
  submissions: LearnerSubmissionRow[];
  answers: LearnerAnswerRow[];
}

const localDate = (ms: number) => new Date(ms + GMT7_MS).toISOString().slice(0, 10);
const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) - GMT7_MS;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekStartOf = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
const roundMinutes = (seconds: number) => Math.round(seconds / 60);

/** Mastery level on the 5-stop scale (learning.ts comment: 0 no evidence, 1 <0.40, 2 <0.60, 3 <0.85, 4 >=0.85). */
export function masteryLevel(pMastery: number | null, evidenceCount: number | null): LearnerStatsSkill["level"] {
  if (!evidenceCount || pMastery == null) return 0;
  if (pMastery < 0.4) return 1;
  if (pMastery < 0.6) return 2;
  if (pMastery < 0.85) return 3;
  return 4;
}

function percentOf(row: LearnerSubmissionRow) {
  if (row.quizPercent != null) return row.quizPercent;
  return row.score != null && row.maxScore > 0 ? Math.round((row.score / row.maxScore) * 100) : 0;
}

/** The most recent attempt per assessment (attempt numbers increase per learner and assessment). */
function latestPerAssessment(rows: LearnerSubmissionRow[]) {
  const latest = new Map<number, LearnerSubmissionRow>();
  for (const row of rows) {
    const current = latest.get(row.assessmentId);
    if (!current || row.attempt > current.attempt) latest.set(row.assessmentId, row);
  }
  return [...latest.values()];
}

/** Pure aggregate over the learner's rows. The DB loader scopes rows to the learner; this filters by course. */
export function buildLearnerStats(rows: LearnerStatsRows, period: string, courseId: string, now: Date): LearnerStatsData {
  const window = analyticsWindow(period, now);
  const startMs = Date.parse(window.start);
  const endMs = Date.parse(window.end);
  const lengthMs = endMs - startMs;
  const startDate = localDate(startMs);
  const endDate = localDate(endMs - 1);

  const scope = courseId === "all" ? rows.enrollments : rows.enrollments.filter((enrollment) => enrollment.courseId === courseId);
  const scopeIds = new Set(scope.map((enrollment) => enrollment.id));
  const scopeCourseIds = new Set(scope.map((enrollment) => enrollment.courseId));
  const titleOf = new Map(rows.enrollments.map((enrollment) => [enrollment.courseId, enrollment.courseTitle]));

  const secondsByDate = new Map(rows.studyDays.map((day) => [day.date, day.seconds]));
  const secondsBetween = (from: string, to: string) => {
    let total = 0;
    for (const [date, seconds] of secondsByDate) if (date >= from && date <= to) total += seconds;
    return total;
  };
  const studied = new Set([...secondsByDate].filter(([, seconds]) => seconds > 0).map(([date]) => date));

  const days: LearnerStatsDay[] = [];
  for (let day = startDate; day <= endDate; day = addDays(day, 1)) days.push({ date: day, minutes: roundMinutes(secondsByDate.get(day) ?? 0) });

  const previousStartDate = localDate(startMs - lengthMs);
  const previousEndDate = localDate(startMs - 1);
  const completedIn = (from: number, to: number) => rows.completions.filter((row) =>
    scopeIds.has(row.enrollmentId) && row.completedAt != null && row.completedAt.getTime() >= from && row.completedAt.getTime() < to).length;

  // Streak: consecutive study days ending today; if today has no study yet, it ends yesterday (mockup rule).
  let current = 0;
  let cursor = studied.has(endDate) ? endDate : addDays(endDate, -1);
  while (studied.has(cursor)) { current += 1; cursor = addDays(cursor, -1); }
  let best = 0;
  let run = 0;
  let previousDay = "";
  for (const day of [...studied].sort()) {
    run = previousDay && day === addDays(previousDay, 1) ? run + 1 : 1;
    best = Math.max(best, run);
    previousDay = day;
  }

  const thisWeek = weekStartOf(endDate);
  const weeks: LearnerStatsWeek[] = [];
  for (let i = WEEKS_SHOWN - 1; i >= 0; i -= 1) {
    const weekStart = addDays(thisWeek, -7 * i);
    const weekEnd = addDays(weekStart, 6);
    weeks.push({ weekStart, minutes: roundMinutes(secondsBetween(weekStart, weekEnd < endDate ? weekEnd : endDate)) });
  }

  const sparseFrom = addDays(endDate, -(CALENDAR_MIN_DAYS - 1));
  const calendarFrom = sparseFrom < startDate ? sparseFrom : startDate;
  const calendar: LearnerStatsDay[] = [...secondsByDate]
    .filter(([date, seconds]) => seconds > 0 && date >= calendarFrom && date <= endDate)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, seconds]) => ({ date, minutes: roundMinutes(seconds) }));

  const goalSource = rows.enrollments.find((enrollment) => enrollment.weeklyGoalMinutes != null);
  const skillItems: LearnerStatsSkill[] = rows.skills
    .filter((skill) => scopeCourseIds.has(skill.courseId))
    .map((skill) => ({
      id: skill.id, name: skill.name, courseId: skill.courseId, courseTitle: titleOf.get(skill.courseId) ?? "",
      level: masteryLevel(skill.pMastery, skill.evidenceCount),
    }))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "vi"));

  const scoped = rows.submissions.filter((submission) => scopeCourseIds.has(submission.courseId));
  const answerTotals = new Map<number, { correct: number; unknown: number; total: number }>();
  for (const answer of rows.answers) {
    const totals = answerTotals.get(answer.submissionId) ?? { correct: 0, unknown: 0, total: 0 };
    totals.total += 1;
    if (answer.isCorrect === true) totals.correct += 1;
    if (answer.isUnknown) totals.unknown += 1;
    answerTotals.set(answer.submissionId, totals);
  }
  const latestQuizzes = latestPerAssessment(scoped.filter((submission) => submission.type === "quiz"));
  const latestCoding = latestPerAssessment(scoped.filter((submission) => submission.type === "coding" && submission.mode === "submit"));
  const byDate = (a: LearnerSubmissionRow, b: LearnerSubmissionRow) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0);
  const scores: LearnerStatsScore[] = [
    ...latestQuizzes.filter((submission) => !submission.isDiagnostic).map((submission) => ({ submission, kind: "Quiz" as const })),
    ...latestCoding.map((submission) => ({ submission, kind: "Bài code" as const })),
  ]
    .sort((a, b) => byDate(a.submission, b.submission))
    .map(({ submission, kind }) => ({
      id: submission.assessmentId, label: submission.title, kind, percent: percentOf(submission),
      date: localDate(submission.submittedAt!.getTime()),
    }));
  const quizzes: LearnerStatsQuiz[] = latestQuizzes.sort(byDate).map((submission) => {
    const totals = answerTotals.get(submission.submissionId) ?? { correct: 0, unknown: 0, total: 0 };
    return {
      id: `${submission.courseId}:${submission.assessmentId}`,
      label: submission.isDiagnostic ? `Bài kiểm tra đầu vào · ${titleOf.get(submission.courseId) ?? ""}` : submission.title,
      correct: totals.correct,
      unknown: totals.unknown,
      wrong: totals.total - totals.correct - totals.unknown,
    };
  });

  return {
    enrollments: scope.length,
    completedLessons: completedIn(startMs, endMs),
    previousCompletedLessons: completedIn(startMs - lengthMs, startMs),
    studyMinutes: roundMinutes(secondsBetween(startDate, endDate)),
    previousStudyMinutes: roundMinutes(secondsBetween(previousStartDate, previousEndDate)),
    streak: { current, best },
    weeklyGoalMinutes: goalSource?.weeklyGoalMinutes ?? DEFAULT_WEEKLY_GOAL_MINUTES,
    weeklyGoalSet: goalSource != null,
    days,
    weeks,
    calendar,
    skills: { total: skillItems.length, mastered: skillItems.filter((skill) => skill.level >= MASTERED_LEVEL).length, items: skillItems },
    diagnosticSkipped: scope.length > 0 && scope.some((enrollment) => enrollment.diagnosticStatus === "skipped")
      && scope.every((enrollment) => enrollment.diagnosticStatus !== "done"),
    courses: rows.enrollments.map((enrollment) => ({ id: enrollment.courseId, title: enrollment.courseTitle })),
    scores,
    quizzes,
    window,
  };
}

export async function getLearnerStatsData(
  db: Database, userId: string, period: string, courseId = "all", now = new Date(),
): Promise<LearnerStatsData> {
  if (!userId.trim()) throw new Error("Learner identity required");
  analyticsWindow(period, now);
  const [enrollments, studyDays] = await Promise.all([
    db.select({
      id: studentEnrollments.id,
      courseId: studentEnrollments.courseId,
      courseTitle: courses.title,
      diagnosticStatus: studentEnrollments.diagnosticStatus,
      weeklyGoalMinutes: studentEnrollments.weeklyGoalMinutes,
    }).from(studentEnrollments)
      .innerJoin(courses, eq(courses.id, studentEnrollments.courseId))
      .where(eq(studentEnrollments.userId, userId)),
    db.select({ date: studentStudyDays.date, seconds: studentStudyDays.seconds })
      .from(studentStudyDays).where(eq(studentStudyDays.userId, userId)),
  ]);
  const scoped = enrollments.filter((enrollment) => courseId === "all" || enrollment.courseId === courseId);
  const scopeIds = scoped.map((enrollment) => enrollment.id);
  const scopeCourseIds = scoped.map((enrollment) => enrollment.courseId);
  const none = <T,>() => Promise.resolve([] as T[]);
  const [completions, skillRows, submissions, answers] = await Promise.all([
    scopeIds.length ? db.select({ enrollmentId: lessonProgress.enrollmentId, completedAt: lessonProgress.completedAt })
      .from(lessonProgress)
      .where(and(inArray(lessonProgress.enrollmentId, scopeIds), eq(lessonProgress.status, "completed")))
      : none<LearnerCompletionRow>(),
    scopeIds.length ? db.select({
      id: skills.id, name: skills.name, courseId: skills.courseId,
      pMastery: enrollmentSkillMastery.pMastery, evidenceCount: enrollmentSkillMastery.evidenceCount,
    }).from(skills)
      .leftJoin(enrollmentSkillMastery, and(
        eq(enrollmentSkillMastery.skillId, skills.id),
        inArray(enrollmentSkillMastery.enrollmentId, scopeIds),
      ))
      .where(and(inArray(skills.courseId, scopeCourseIds), inArray(skills.review, ["accepted", "edited"])))
      : none<LearnerSkillRow>(),
    scopeIds.length ? db.select({
      submissionId: assessmentSubmissions.id, assessmentId: assessmentSubmissions.assessmentId,
      attempt: assessmentSubmissions.attempt, type: assessments.type, mode: assessmentSubmissions.mode,
      isDiagnostic: assessments.isDiagnostic, title: assessments.title, courseId: assessments.courseId,
      maxScore: assessments.maxScore, score: assessmentSubmissions.score,
      quizPercent: assessmentSubmissions.quizPercent, submittedAt: assessmentSubmissions.submittedAt,
    }).from(assessmentSubmissions)
      .innerJoin(assessments, eq(assessments.id, assessmentSubmissions.assessmentId))
      .where(and(
        inArray(assessmentSubmissions.enrollmentId, scopeIds),
        eq(assessmentSubmissions.status, "graded"),
        inArray(assessments.type, ["quiz", "coding"]),
      ))
      : none<LearnerSubmissionRow>(),
    scopeIds.length ? db.select({
      submissionId: assessmentAnswers.submissionId, isCorrect: assessmentAnswers.isCorrect, isUnknown: assessmentAnswers.isUnknown,
    }).from(assessmentAnswers)
      .innerJoin(assessmentSubmissions, eq(assessmentSubmissions.id, assessmentAnswers.submissionId))
      .innerJoin(assessments, eq(assessments.id, assessmentSubmissions.assessmentId))
      .where(and(
        inArray(assessmentSubmissions.enrollmentId, scopeIds),
        eq(assessmentSubmissions.status, "graded"),
        eq(assessments.type, "quiz"),
      ))
      : none<LearnerAnswerRow>(),
  ]);
  return buildLearnerStats({
    enrollments,
    studyDays,
    completions,
    skills: skillRows,
    submissions,
    answers,
  }, period, courseId, now);
}
