import { z } from "zod";
import type { MasteryLevel } from "@codi-1/ui/lib/mastery";
import type { LessonPathState } from "./learning-path-contract";
import type {
  assessments,
  assessmentSubmissions,
} from "@codi-1/db/schema/assessments";

export class LearnerOverviewError extends Error {
  constructor(
    message: string,
    public readonly status = 409,
  ) {
    super(message);
  }
}
export const studyHeartbeat = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("start"),
      trackerId: z.uuid(),
      expectedOwner: z.uuid().nullable(),
    })
    .strict(),
  z
    .object({
      action: z.enum(["prepare", "heartbeat", "stop"]),
      trackerId: z.uuid(),
    })
    .strict(),
]);
export type StudyActivityAction = z.infer<typeof studyHeartbeat>["action"];
export const overviewCommand = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("dismiss-diagnostic"),
      courseId: z.string().min(1).max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal("restore-diagnostic"),
      courseId: z.string().min(1).max(200),
      dismissedAt: z.iso.datetime(),
    })
    .strict(),
]);
export const STUDY_HEARTBEAT_MS = 30000;
export const STUDY_MAX_GAP_MS = 45000;
const DAY = 86400000;
const VIETNAM_OFFSET = 7 * 3600000;
export const studyDate = (time: Date) =>
  new Date(time.getTime() + VIETNAM_OFFSET).toISOString().slice(0, 10);
export function dateBefore(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * DAY)
    .toISOString()
    .slice(0, 10);
}
// Calendar week in Vietnam, Monday to Sunday. Avoid the server's local timezone.
export function weekDates(now: Date) {
  const today = studyDate(now);
  const sinceMonday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = dateBefore(today, sinceMonday);
  return Array.from({ length: 7 }, (_, i) => dateBefore(monday, -i));
}
export function studyCredits(previous: Date | null, now: Date) {
  if (!previous) return [];
  const elapsed = now.getTime() - previous.getTime();
  if (elapsed <= 0 || elapsed > STUDY_MAX_GAP_MS) return [];
  const end = Math.floor(now.getTime() / 1000) * 1000;
  const start = Math.floor(previous.getTime() / 1000) * 1000;
  const credits = new Map<string, number>();
  for (let t = start; t < end; t += 1000) {
    const date = studyDate(new Date(t));
    credits.set(date, (credits.get(date) ?? 0) + 1);
  }
  return [...credits].map(([date, seconds]) => ({ date, seconds }));
}
export function streakDays(dates: string[], now: Date) {
  const days = new Set(dates);
  const today = studyDate(now);
  let day = days.has(today) ? today : dateBefore(today, 1);
  let count = 0;
  while (days.has(day)) {
    count++;
    day = dateBefore(day, 1);
  }
  return count;
}
export function resultView(
  a: Pick<
    typeof assessments.$inferSelect,
    "id" | "type" | "title" | "maxScore" | "passingScore"
  >,
  s?: typeof assessmentSubmissions.$inferSelect,
) {
  return {
    id: a.id,
    title: a.title,
    type: a.type,
    maxScore: a.maxScore,
    passingScore: a.passingScore ?? 70,
    status: s?.status ?? null,
    score: s?.status === "graded" ? s.score : null,
    percent:
      s?.status === "graded" && s.score !== null
        ? (s.quizPercent ?? Math.round((s.score / a.maxScore) * 100))
        : null,
    passed: s?.status === "graded" ? s.isPassed : null,
    feedback: s?.status === "graded" ? s.feedback : null,
    gradedAt:
      s?.status === "graded" ? (s.gradedAt?.toISOString() ?? null) : null,
  };
}
export type LearnerResult = ReturnType<typeof resultView>;
export type LearnerCourse = {
  id: string;
  title: string;
  slug: string;
  cover: string | null;
  hidden: boolean;
  goal: string | null;
  weeklyGoalMinutes: number | null;
  lastActiveAt: string;
  pathStatus: string;
  showDiagnostic: boolean;
  complete: boolean;
  done: number;
  total: number;
  percent: number;
  nextLessonId: string | null;
  lessons: {
    id: string;
    title: string;
    status: LessonPathState;
    lock: string | null;
    results: LearnerResult[];
  }[];
  skills: { id: number; name: string; level: MasteryLevel }[];
};
export type LearnerOverview = {
  name: string;
  courses: LearnerCourse[];
  continueCourseId: string | null;
  weekly: {
    minutes: number;
    goalMinutes: number;
    assumed: boolean;
    courseId: string | null;
    streak: number;
    days: { date: string; studied: boolean; today: boolean }[];
  };
  stats: {
    active: number;
    completed: number;
    lessons: number;
    pending: number;
    answered: number;
    feedback: number;
  };
  latestFeedback: {
    courseId: string;
    courseTitle: string;
    lessonTitle: string;
    score: number;
    maxScore: number;
    text: string;
  } | null;
  recommendations: {
    id: string;
    slug: string;
    title: string;
    level: string;
    price: number;
    cover: string | null;
  }[];
};
