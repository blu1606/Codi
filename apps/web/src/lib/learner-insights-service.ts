// Learner Insights Service for S13b (Thống kê học tập C1..C6)
// Source of truth: docs/mockup/js/learner-insights.js

import {
  ANALYTICS_AS_OF,
  SEED_CODE_ATTEMPTS,
  SEED_COURSES,
  SEED_LEARNER,
  SEED_LEARNER_STUDY_DAYS,
  type CourseAnalyticsMeta,
  type LearnerStudyDayRecord,
} from "./analytics-seed-data";
import { getMasteryLabel } from "@codi-1/ui/components/charts";

export interface LearnerStatsWindow {
  len: number;
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
}

const DAY_MS = 86400000;
const PASS_THRESHOLD = 70;

export function getLearnerWindows(period: "7" | "month" | "30" = "30"): LearnerStatsWindow {
  const end = new Date(ANALYTICS_AS_OF + "T00:00:00Z");
  const len = period === "7" ? 7 : period === "month" ? end.getUTCDate() : 30;
  const startMs = end.getTime() - (len - 1) * DAY_MS;
  const prevStartMs = startMs - len * DAY_MS;
  const prevEndMs = startMs - DAY_MS;

  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

  return {
    len,
    start: iso(startMs),
    end: ANALYTICS_AS_OF,
    prevStart: iso(prevStartMs),
    prevEnd: iso(prevEndMs),
  };
}

export function calculateStreak(days: LearnerStudyDayRecord[]): { cur: number; best: number } {
  const studied = new Set(days.filter((d) => d.minutes > 0).map((d) => d.date));
  let cur = 0;
  let t = new Date(ANALYTICS_AS_OF + "T00:00:00Z").getTime();
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  if (!studied.has(iso(t))) t -= DAY_MS; // today not studied yet
  while (studied.has(iso(t))) {
    cur += 1;
    t -= DAY_MS;
  }

  let best = 0;
  let run = 0;
  days
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .forEach((d) => {
      run = d.minutes > 0 ? run + 1 : 0;
      best = Math.max(best, run);
    });

  return { cur, best };
}

export function getLearnerStatsData(
  period: "7" | "month" | "30" = "30",
  courseIdFilter: string = "all",
  _userId?: string | null,
) {
  const allEnrolled: CourseAnalyticsMeta[] = SEED_COURSES.filter((c) => c.id === "course-js-001");
  const filteredCourses =
    courseIdFilter === "all" ? allEnrolled : allEnrolled.filter((c) => c.id === courseIdFilter);

  const w = getLearnerWindows(period);
  const days = SEED_LEARNER_STUDY_DAYS;

  const inRange = (d: LearnerStudyDayRecord, a: string, b: string) => d.date >= a && d.date <= b;
  const curDays = days.filter((d) => inRange(d, w.start, w.end));
  const prevDays = days.filter((d) => inRange(d, w.prevStart, w.prevEnd));

  const totalCurMinutes = curDays.reduce((s, d) => s + d.minutes, 0);
  const totalPrevMinutes = prevDays.reduce((s, d) => s + d.minutes, 0);
  const activeDays = curDays.filter((d) => d.minutes > 0).length;

  const streak = calculateStreak(days);

  // Completed lessons
  const completedLessons = SEED_LEARNER.completed;
  const doneCount = completedLessons.length;

  // Concepts and mastery
  const concepts = filteredCourses.flatMap((c) =>
    (c.concepts || []).map((k) => ({
      k,
      c,
      lv: SEED_LEARNER.mastery[k.id] || 0,
    })),
  );
  const masteredCount = concepts.filter((x) => x.lv >= 3).length;

  // Goal
  const goalHours = SEED_LEARNER.goal?.hours ?? 5;

  // C1: KPI Row
  const c1 = {
    studyHours: totalCurMinutes / 60,
    prevHours: totalPrevMinutes / 60,
    spark: curDays.slice(-12).map((d) => d.minutes),
    streakCur: streak.cur,
    streakBest: streak.best,
    completedLessons: doneCount,
    masteredRatio: `${masteredCount}/${concepts.length || 6}`,
  };

  // C2: Study hours per week / minutes per day
  let c2;
  const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  if (w.len <= 7) {
    const items = curDays.map((d) => {
      const dow = new Date(d.date + "T00:00:00Z").getUTCDay();
      const wdName = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][dow];
      return {
        label: `${wdName} ${dm(d.date)}`,
        value: d.minutes,
      };
    });
    c2 = {
      isDaily: true,
      title: "Phút học mỗi ngày",
      question: "Mỗi ngày bạn học bao lâu so với mục tiêu?",
      items,
      goal: Math.round((goalHours * 60) / 7),
      goalLabel: "Mục tiêu/ngày",
      unit: "phút",
      note: "Mục tiêu tính trên trung bình ngày.",
      table: {
        headers: ["Ngày", "Phút"],
        rows: curDays.map((d) => [dm(d.date), d.minutes]),
      },
    };
  } else {
    const wkMap: Record<string, number> = {};
    days
      .filter((d) => d.date <= w.end)
      .slice(-56)
      .forEach((d) => {
        const dt = new Date(d.date + "T00:00:00Z");
        const dow = (dt.getUTCDay() + 6) % 7;
        const mon = new Date(dt.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
        wkMap[mon] = (wkMap[mon] || 0) + d.minutes;
      });
    const items = Object.entries(wkMap)
      .slice(-6)
      .map(([start, m]) => ({
        label: "Tuần " + dm(start),
        value: Math.round((m / 60) * 10) / 10,
      }));
    c2 = {
      isDaily: false,
      title: "Giờ học mỗi tuần",
      question: "Bạn có đạt mục tiêu giờ học hằng tuần?",
      items,
      goal: goalHours,
      goalLabel: "Mục tiêu tuần",
      unit: "giờ",
      note: "Tuần gần nhất có thể chưa kết thúc.",
      table: {
        headers: ["Tuần", "Giờ học"],
        rows: items.map((i) => [i.label, i.value]),
      },
    };
  }

  // C3: Calendar
  const calStart = w.len < 28 ? new Date(new Date(w.end).getTime() - 27 * DAY_MS).toISOString().slice(0, 10) : w.start;
  const calDays = days.filter((d) => inRange(d, calStart, w.end));
  const c3 = {
    title: "Lịch học",
    question: `Chuỗi hiện tại: ${streak.cur} ngày liên tiếp`,
    days: calDays.map((d) => ({ date: d.date, value: d.minutes })),
    today: ANALYTICS_AS_OF,
    table: {
      headers: ["Ngày", "Phút"],
      rows: calDays.map((d) => [dm(d.date), d.minutes]),
    },
  };

  // C4: Mastery
  const skipped = SEED_LEARNER.diagnostic.status !== "done";
  const c4items = concepts.map((x) => ({
    label: x.k.name,
    value: x.lv,
    max: 4,
    text: getMasteryLabel(x.lv),
    marker: !skipped && x.lv > 0 ? Math.max(0, x.lv - 1 - (x.k.id.length % 2)) : null,
    markerLabel: "Lúc làm bài đầu vào",
    markerText: getMasteryLabel(Math.max(0, x.lv - 1 - (x.k.id.length % 2))),
    tip: `Mức ${x.lv}/4`,
  }));

  const c4 = {
    title: "Mức thành thạo theo kỹ năng",
    question: "Kỹ năng nào vững, kỹ năng nào cần ôn?",
    items: c4items,
    skipped,
    note: skipped
      ? "Bạn đã bỏ qua bài kiểm tra đầu vào nên không có mốc so sánh. Có thể làm lại từ trang lộ trình."
      : "Mốc đầu vào được suy ra từ kết quả bài kiểm tra đầu vào.",
    table: {
      headers: ["Kỹ năng", "Mức hiện tại", "Lúc làm bài đầu vào"],
      rows: c4items.map((i) => [i.label, i.text, i.marker != null ? i.markerText : "—"]),
    },
  };

  // C5: Scores over time
  const scores: { label: string; kind: string; y: number }[] = [];
  Object.keys(SEED_LEARNER.quizScores).forEach((lid) => {
    scores.push({ label: lid, kind: "Quiz", y: SEED_LEARNER.quizScores[lid] ?? 100 });
  });
  SEED_CODE_ATTEMPTS.forEach((a) => {
    scores.push({ label: a.lessonId, kind: "Bài code", y: a.bestScore });
  });

  const avgScore = scores.length ? Math.round(scores.reduce((s, x) => s + x.y, 0) / scores.length) : 0;
  const maxScore = scores.length ? Math.max(...scores.map((s) => s.y)) : 0;
  const passRate = scores.length ? Math.round((scores.filter((s) => s.y >= PASS_THRESHOLD).length / scores.length) * 100) : 0;

  const pts = scores.map((s, i) => ({ x: i, y: s.y, label: `#${i + 1}`, note: `${s.kind}: ${s.label}` }));

  const c5 = {
    title: "Điểm quiz & bài code theo thời gian",
    question: "Điểm của bạn có ổn định trên ngưỡng đạt?",
    sample: scores.length,
    scores,
    avgScore,
    maxScore,
    passRate,
    pts,
    passThreshold: PASS_THRESHOLD,
    table: {
      headers: ["Lượt", "Loại", "Bài", "Điểm"],
      rows: scores.map((s, i) => [`#${i + 1}`, s.kind, s.label, s.y + "%"]),
    },
  };

  // C6: Quiz Donut
  const quizzes = [
    {
      id: "course-js-001:diag",
      label: "Bài kiểm tra đầu vào · JavaScript nền tảng",
      correct: SEED_LEARNER.diagnostic.right,
      wrong: SEED_LEARNER.diagnostic.wrong,
      unknown: SEED_LEARNER.diagnostic.unknown,
    },
    {
      id: "course-js-001:lesson-js-001",
      label: "Biến và cú pháp",
      correct: 4,
      wrong: 0,
      unknown: 0,
    },
    {
      id: "course-js-001:lesson-js-002",
      label: "Hàm trong JavaScript",
      correct: 2,
      wrong: 2,
      unknown: 0,
    },
  ];

  const c6 = {
    title: "Kết quả một bài quiz",
    question: "Bạn đúng, sai bao nhiêu câu ở bài đã chọn?",
    quizzes,
  };

  return {
    courses: allEnrolled,
    period,
    courseIdFilter,
    w,
    activeDays,
    littleData: activeDays > 0 && activeDays < 3,
    noActivity: totalCurMinutes === 0 && !concepts.some((x) => x.lv > 0),
    c1,
    c2,
    c3,
    c4,
    c5,
    c6,
  };
}
