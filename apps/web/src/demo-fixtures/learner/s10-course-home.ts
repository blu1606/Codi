import type { CoursePathView } from "@/lib/learning-path-contract";
import snapshot from "../snapshot/learning-path.json";

export const COURSE_HOME_COURSE_ID = "course-js-001";

type Row = CoursePathView["rows"][number];
type RowSeed = {
  id: string;
  title: string;
  chapterId: string;
  chapterTitle: string;
  durationSeconds: number;
  skillIds: number[];
  progress: Row["progress"];
  studied: boolean;
  status: Row["status"];
  reason: string;
  lock?: Row["lock"];
  isSkippable?: boolean;
};

const chapter1 = { id: "js-ch1", title: "Làm quen JavaScript" };
const chapter2 = { id: "js-ch2", title: "Dữ liệu có cấu trúc" };
const chapter3 = { id: "js-ch3", title: "Trình duyệt và DOM" };

const MASTERY_NAMES: Record<number, string> = { 1: "Biến & kiểu dữ liệu", 2: "Hàm", 3: "Mảng", 4: "Đối tượng", 5: "DOM & sự kiện" };
const MASTERY_LEVELS: Record<number, Row["mastery"][number]["level"]> = { 1: 4, 2: 3, 3: 2, 4: 3, 5: 1 };

function row(seed: RowSeed): Row {
  return {
    id: seed.id,
    title: seed.title,
    chapterId: seed.chapterId,
    chapterTitle: seed.chapterTitle,
    durationSeconds: seed.durationSeconds,
    skillIds: seed.skillIds,
    progress: seed.progress,
    studied: seed.studied,
    status: seed.status,
    reason: seed.reason,
    lessonId: seed.id,
    isSkippable: seed.isSkippable ?? false,
    lock: seed.lock ?? null,
    mastery: seed.skillIds.map((id) => ({ id, name: MASTERY_NAMES[id] ?? "Khái niệm", level: MASTERY_LEVELS[id] ?? 0 })),
  };
}

const lessons: RowSeed[] = [
  { id: "lesson-js-001", title: "Biến, hằng và kiểu dữ liệu", chapterId: chapter1.id, chapterTitle: chapter1.title, durationSeconds: 960, skillIds: [1], progress: "completed", studied: true, status: "done", reason: "Nền tảng cho mọi bài sau." },
  { id: "lesson-js-002", title: "Hàm và phạm vi", chapterId: chapter1.id, chapterTitle: chapter1.title, durationSeconds: 1200, skillIds: [2], progress: "completed", studied: true, status: "done", reason: "Cần cho bài về mảng và đối tượng." },
  { id: "lesson-js-003", title: "Làm việc với mảng", chapterId: chapter2.id, chapterTitle: chapter2.title, durationSeconds: 1080, skillIds: [3], progress: "completed", studied: true, status: "done", reason: "Bạn đã làm quen với hàm nên có thể học ngay." },
  { id: "lesson-js-004", title: "Đối tượng và destructuring", chapterId: chapter2.id, chapterTitle: chapter2.title, durationSeconds: 1020, skillIds: [4], progress: "completed", studied: true, status: "done", reason: "Đã hoàn thành bài tập tính tổng đơn hàng." },
  { id: "lesson-js-005", title: "Chọn và thay đổi phần tử DOM", chapterId: chapter3.id, chapterTitle: chapter3.title, durationSeconds: 1140, skillIds: [5], progress: "in_progress", studied: true, status: "active", reason: "Bài tiếp theo phù hợp với mục tiêu làm dự án của bạn." },
  { id: "lesson-js-006", title: "Sự kiện click và form", chapterId: chapter3.id, chapterTitle: chapter3.title, durationSeconds: 1320, skillIds: [5], progress: "not_started", studied: false, status: "todo", reason: "Sau khi nắm DOM, bạn sẽ xử lý được form." },
  {
    id: "lesson-js-007", title: "Gọi API với fetch", chapterId: chapter3.id, chapterTitle: chapter3.title, durationSeconds: 1500, skillIds: [6], progress: "not_started", studied: false,
    status: "locked", reason: "Nên học xong bài trước để hiểu rõ hơn.",
    lock: { concept: "Bất đồng bộ", lessonId: "lesson-js-006", lessonTitle: "Sự kiện click và form" },
  },
];

const base = {
  course: { id: COURSE_HOME_COURSE_ID, title: "JavaScript nền tảng", slug: "javascript-nen-tang" },
  goal: "project",
  hours: 5,
  goalEditing: false,
  diagnosticStatus: "done",
  showDiagnosticCard: false,
  pathId: 12,
  rationale: null,
  highlights: [] as string[],
  updating: false,
  update: null,
  review: null,
  recommendation: null,
  source: "ai" as CoursePathView["source"],
  status: "ready" as CoursePathView["status"],
};

function pathView(overrides: { rows?: RowSeed[] } & Partial<Omit<CoursePathView, "rows" | "done" | "total" | "percent" | "complete" | "currentLessonId">> = {}): CoursePathView {
  const { rows: rowSeeds = lessons, ...rest } = overrides;
  const rows = rowSeeds.map(row);
  const done = rows.filter((r) => r.status === "done").length;
  const current = rows.find((r) => r.status === "active") ?? rows.find((r) => r.status === "next") ?? null;
  return {
    ...base,
    rows,
    currentLessonId: current?.id ?? null,
    done,
    total: rows.length,
    percent: rows.length ? Math.round((done / rows.length) * 100) : 0,
    complete: rows.length > 0 && rows.every((r) => r.status === "done"),
    ...rest,
  };
}

/** Soft lock: lesson 005 is advisory-locked behind 002, which is not finished yet. 005 stays openable. */
export const coursePathSoftLocked: CoursePathView = pathView({
  rows: lessons.map((l) => {
    if (l.id === "lesson-js-002") return { ...l, progress: "not_started" as const, studied: false, status: "next" as const, reason: "Nền tảng để mở bài DOM." };
    if (l.id === "lesson-js-005")
      return {
        ...l,
        progress: "not_started" as const,
        studied: false,
        status: "locked" as const,
        reason: "Bài DOM là bước tiếp theo sau hàm.",
        lock: { concept: "Hàm", lessonId: "lesson-js-002", lessonTitle: "Hàm và phạm vi" },
      };
    return l;
  }),
});

/** Personalised path, AI-ordered, with one locked lesson and the current lesson highlighted. */
export const coursePathReady: CoursePathView = pathView({
  rationale: "Bạn đã nắm chắc biến và hàm, nên Codi đưa phần DOM lên trước để phù hợp với mục tiêu làm dự án.",
});

/** Course home before personalisation: the seed learner's real default path (snapshot), with the personalise card. */
export const coursePathDefault = snapshot as unknown as CoursePathView;

export const coursePathNone: CoursePathView = pathView({
  status: "none",
  source: null,
  rows: [],
});

export const coursePathGenerating: CoursePathView = pathView({
  status: "generating",
  source: null,
  rows: lessons.slice(0, 4),
});

export const coursePathFailed: CoursePathView = pathView({
  status: "failed",
  source: "default",
  rationale: null,
});

export const coursePathUpdated: CoursePathView = pathView({
  updating: false,
  highlights: ["lesson-js-005", "lesson-js-006"],
  update: {
    afterLessonId: "lesson-js-004",
    message: "Codi vừa xếp lại lộ trình sau khi bạn hoàn thành bài đối tượng.",
    changes: [
      { lessonId: "lesson-js-005", type: "moved-up", text: "Chọn và thay đổi phần tử DOM được đưa lên trước để phù hợp với phần bạn cần học." },
      { lessonId: "lesson-js-006", type: "now-skippable", text: "Sự kiện click và form: có thể bỏ qua vì bạn đã nắm vững các khái niệm." },
    ],
  },
});

export const coursePathCompleted: CoursePathView = pathView({
  rows: lessons.map((l) => ({ ...l, status: "done" as const, progress: "completed" as const, studied: true, lock: null })),
  review: null,
});

export const coursePathReview: CoursePathView = pathView({
  review: { rating: 4, text: "Lộ trình rõ ràng, bài DOM hơi dài." },
  rows: lessons.map((l) => ({ ...l, status: "done" as const, progress: "completed" as const, studied: true, lock: null })),
});
