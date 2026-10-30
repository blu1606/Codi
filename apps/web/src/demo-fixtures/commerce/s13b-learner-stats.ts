import { analyticsWindow, type LearnerStatsData, type LearnerStatsDay, type LearnerStatsSkill, type LearnerStatsWeek } from "@/lib/analytics-contract";

// Demo payloads for S13b in the ui-lab. Shapes match LearnerStatsData; the default state mirrors the seeded
// learner (usr-learner-001, course "JavaScript nền tảng") with 30 days of study time.
const COURSE = { id: "course-js-001", title: "JavaScript nền tảng" };
const SKILL_NAMES = ["Biến & kiểu dữ liệu", "Hàm", "Mảng", "Đối tượng", "DOM & sự kiện", "Bất đồng bộ",
  "Closure", "Module & ES6", "Regular Expression", "Spread & Destructuring", "Template Literal", "Xử lý lỗi"];
const DAY_MS = 86_400_000;
const window = analyticsWindow("30");
const today = new Date(Date.parse(window.end) - 1 + 7 * 3_600_000).toISOString().slice(0, 10);

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBefore = (date: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS);

/** Minutes studied on a date: a weekly rhythm with a few rest days, deterministic. */
function minutesOn(date: string) {
  const back = daysBefore(date);
  if (back < 0 || back === 5 || (back > 0 && back % 9 === 0) || back % 7 === 6) return 0;
  return 35 + ((back * 37) % 70);
}
const dayRow = (date: string): LearnerStatsDay => ({ date, minutes: minutesOn(date) });
const sumMinutes = (dates: string[]) => dates.reduce((total, date) => total + minutesOn(date), 0);
const datesFrom = (from: string, count: number) => Array.from({ length: count }, (_, i) => addDays(from, i));

const startDate = addDays(today, -29);
const windowDates = datesFrom(startDate, 30);
const previousDates = datesFrom(addDays(startDate, -30), 30);
const todayMonday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
const weeks: LearnerStatsWeek[] = Array.from({ length: 6 }, (_, i) => {
  const weekStart = addDays(todayMonday, -7 * (5 - i));
  const dates = datesFrom(weekStart, 7).filter((date) => date <= today);
  return { weekStart, minutes: sumMinutes(dates) };
});
const calendarFrom = addDays(today, -27);
const calendar: LearnerStatsDay[] = datesFrom(calendarFrom, 28).map(dayRow).filter((day) => day.minutes > 0);

const skillLevels = [4, 3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0];
const skills: LearnerStatsSkill[] = SKILL_NAMES.map((name, i) => ({
  id: 158 + i, name, courseId: COURSE.id, courseTitle: COURSE.title, level: skillLevels[i] as LearnerStatsSkill["level"],
})).sort((a, b) => b.level - a.level);

/** Learner stats with activity in the period (S13b default). */
export const learnerStats: LearnerStatsData = {
  enrollments: 1,
  completedLessons: 2,
  previousCompletedLessons: 2,
  studyMinutes: sumMinutes(windowDates),
  previousStudyMinutes: sumMinutes(previousDates),
  streak: { current: 5, best: 9 },
  weeklyGoalMinutes: 300,
  weeklyGoalSet: true,
  days: windowDates.map(dayRow),
  weeks,
  calendar,
  skills: { total: skills.length, mastered: skills.filter((skill) => skill.level >= 3).length, items: skills },
  diagnosticSkipped: false,
  courses: [COURSE],
  scores: [
    { id: 131, label: "Quiz: Biến, hằng và kiểu dữ liệu", kind: "Quiz", percent: 100, date: "2026-08-27" },
    { id: 132, label: "Quiz: Hàm và phạm vi", kind: "Quiz", percent: 50, date: "2026-09-06" },
    { id: 134, label: "Quiz: Làm việc với mảng", kind: "Quiz", percent: 100, date: "2026-09-16" },
    { id: 135, label: "Quiz: Đối tượng và destructuring", kind: "Quiz", percent: 100, date: "2026-09-27" },
  ],
  quizzes: [
    { id: "course-js-001:144", label: "Bài kiểm tra đầu vào · JavaScript nền tảng", correct: 3, wrong: 1, unknown: 2 },
    { id: "course-js-001:131", label: "Quiz: Biến, hằng và kiểu dữ liệu", correct: 2, wrong: 0, unknown: 0 },
    { id: "course-js-001:132", label: "Quiz: Hàm và phạm vi", correct: 1, wrong: 1, unknown: 0 },
    { id: "course-js-001:134", label: "Quiz: Làm việc với mảng", correct: 2, wrong: 0, unknown: 0 },
    { id: "course-js-001:135", label: "Quiz: Đối tượng và destructuring", correct: 2, wrong: 0, unknown: 0 },
  ],
  window,
};

/** No activity in the period (S13b "no activity" state). */
export const learnerStatsNoActivity: LearnerStatsData = {
  enrollments: 1,
  completedLessons: 0,
  previousCompletedLessons: 0,
  studyMinutes: 0,
  previousStudyMinutes: 0,
  streak: { current: 0, best: 0 },
  weeklyGoalMinutes: 300,
  weeklyGoalSet: false,
  days: windowDates.map((date) => ({ date, minutes: 0 })),
  weeks: weeks.map((week) => ({ ...week, minutes: 0 })),
  calendar: [],
  skills: { total: skills.length, mastered: 0, items: skills.map((skill) => ({ ...skill, level: 0 })) },
  diagnosticSkipped: false,
  courses: [COURSE],
  scores: [],
  quizzes: [],
  window,
};

/** Two study days in the period: the "little data" warning and no trend claims. */
export const learnerStatsLittleData: LearnerStatsData = {
  enrollments: 1,
  completedLessons: 1,
  previousCompletedLessons: 0,
  studyMinutes: 95,
  previousStudyMinutes: 0,
  streak: { current: 1, best: 1 },
  weeklyGoalMinutes: 300,
  weeklyGoalSet: true,
  days: windowDates.map((date) => ({ date, minutes: daysBefore(date) === 1 ? 40 : daysBefore(date) === 3 ? 55 : 0 })),
  weeks: weeks.map((week, i) => ({ ...week, minutes: i === 5 ? 95 : 0 })),
  calendar: [{ date: addDays(today, -1), minutes: 40 }, { date: addDays(today, -3), minutes: 55 }],
  skills: { total: skills.length, mastered: 0, items: skills.map((skill, i) => ({ ...skill, level: i === 0 ? 1 : 0 })) },
  diagnosticSkipped: false,
  courses: [COURSE],
  scores: [{ id: 131, label: "Quiz: Biến, hằng và kiểu dữ liệu", kind: "Quiz", percent: 100, date: addDays(today, -3) }],
  quizzes: [{ id: "course-js-001:131", label: "Quiz: Biến, hằng và kiểu dữ liệu", correct: 2, wrong: 0, unknown: 0 }],
  window,
};

/** Diagnostic skipped: no baseline in C4 and the skipped note; quizzes without the diagnostic. */
export const learnerStatsDiagnosticSkipped: LearnerStatsData = {
  ...learnerStats,
  diagnosticSkipped: true,
  quizzes: learnerStats.quizzes.slice(1),
};
