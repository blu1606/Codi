import type { LearnerCourse, LearnerOverview } from "@/lib/learner-overview-contract";
import snapshot from "../snapshot/learner-overview.json";

/**
 * Real overview of the seed learner, written by `pnpm demo:snapshot`. JSON widens the contract's
 * literal unions (goal, status) to string, so the cast restates what the exporter already produced.
 */
export const learnerOverviewDefault = snapshot as unknown as LearnerOverview;

export const jsCourse: LearnerCourse = learnerOverviewDefault.courses.find((c) => c.id === "course-js-001")!;

export const soliCourse: LearnerCourse = {
  id: "course-solid-001", title: "Clean Code & SOLID trong JavaScript", slug: "clean-code-solid-javascript", cover: null, hidden: false,
  goal: "finish", goalSetAt: null, weeklyGoalMinutes: null,
  lastActiveAt: "2026-10-20T09:00:00.000Z", pathStatus: "none", showDiagnostic: true, complete: false,
  done: 0, total: 9, percent: 0, nextLessonId: null, lessons: [], skills: [],
};

const week = (studied: boolean[]): LearnerOverview["weekly"]["days"] =>
  ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"].map((date, i) => ({
    date, studied: studied[i]!, today: date === "2026-10-26",
  }));

const noWeek = week([false, false, false, false, false, false, false]);

/** Only a course that still needs its path set up (hand-written edge state, based on the snapshot). */
export const learnerOverviewSetup: LearnerOverview = {
  ...learnerOverviewDefault,
  courses: [soliCourse],
  continueCourseId: soliCourse.id,
  weekly: { minutes: 0, goalMinutes: 0, assumed: true, courseId: null, streak: 0, days: noWeek },
  stats: { active: 1, completed: 0, lessons: 0, pending: 0, answered: 0, feedback: 0 },
  latestFeedback: null,
};

export const learnerOverviewEmpty: LearnerOverview = {
  ...learnerOverviewDefault,
  courses: [],
  continueCourseId: null,
  weekly: { minutes: 0, goalMinutes: 0, assumed: true, courseId: null, streak: 0, days: noWeek },
  stats: { active: 0, completed: 0, lessons: 0, pending: 0, answered: 0, feedback: 0 },
  latestFeedback: null,
};
