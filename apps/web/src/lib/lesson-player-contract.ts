import { z } from "zod";
import type { CoursePathView } from "./learning-path-contract";
import { LearningPathError } from "./learning-path-contract";

const materialId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const lessonPlayerCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open") }).strict(),
  z.object({ type: z.literal("study") }).strict(),
  z
    .object({
      type: z.literal("video"),
      materialId,
      seconds: z.number().int().min(0).max(864000),
      ended: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("pdf-page"),
      materialId,
      page: z.number().int().min(1).max(2000),
      pages: z.number().int().min(1).max(2000),
    })
    .strict(),
  z.object({ type: z.literal("complete") }).strict(),
]);
export type LessonPlayerCommand = z.infer<typeof lessonPlayerCommand>;
export type MediaProgress = Record<
  string,
  { seconds?: number; pages?: number[]; pageCount?: number; lastPage?: number }
>;
export type LessonMaterial = {
  id: number;
  type: "video" | "pdf" | "slide" | "document" | "link";
  title: string;
  url: string | null;
  durationSeconds: number | null;
};
export type ChecklistAssessment = {
  id: number;
  type: "quiz" | "assignment" | "coding";
  title: string;
  passingScore: number | null;
  maxScore: number;
};
export type ChecklistSubmission = {
  assessmentId: number;
  attempt: number;
  mode: "run" | "submit" | null;
  status: "draft" | "pending" | "graded";
  score: number | null;
  quizPercent?: number | null;
  isPassed: boolean | null;
  submittedAt: Date | string | null;
};
export type ChecklistItem = {
  key: "study" | "quiz" | "assignment" | "code";
  label: string;
  done: boolean;
  note: string;
  assessmentId?: number;
};

// D6/D7: latest quiz attempt and latest coding *submission*, never best score or a run.
export function lessonChecklist(
  studied: boolean,
  assessments: ChecklistAssessment[],
  submissions: ChecklistSubmission[],
): ChecklistItem[] {
  const latest = (id: number, coding = false) =>
    submissions
      .filter((s) => s.assessmentId === id && (!coding || s.mode === "submit"))
      .sort((a, b) => b.attempt - a.attempt)[0];
  const code = assessments.filter((a) => a.type === "coding");
  const items: ChecklistItem[] = code.length
    ? code.map((a) => {
        const s = latest(a.id, true);
        return {
          key: "code",
          assessmentId: a.id,
          label: "Hoàn thành bài code",
          done:
            s?.status === "graded" && !!s.submittedAt && s.isPassed === true,
          note: s
            ? s.isPassed && s.status === "graded"
              ? "Đạt tất cả test"
              : "Lần nộp gần nhất chưa đạt"
            : "Nộp bài để chấm",
        };
      })
    : [
        {
          key: "study",
          label: "Học nội dung",
          done: studied,
          note: studied
            ? "Đã học xong nội dung"
            : "Xem nội dung hoặc đánh dấu đã học xong",
        },
      ];
  for (const a of assessments.filter((a) => a.type === "quiz")) {
    const s = latest(a.id);
    const percent = s?.quizPercent ?? (s?.score == null ? null : (s.score / a.maxScore) * 100);
    const done =
      s?.status === "graded" &&
      !!s.submittedAt &&
      percent !== null &&
      percent >= (a.passingScore ?? 70);
    items.push({
      key: "quiz",
      assessmentId: a.id,
      label: `Đạt quiz (≥ ${a.passingScore ?? 70}%)`,
      done,
      note:
        s?.status === "draft"
          ? "Lần làm hiện tại chưa nộp"
          : percent === null
            ? "Chưa làm quiz"
            : `${Number(percent.toFixed(2))}%${done ? " · Đạt" : " · Chưa đạt, làm lại"}`,
    });
  }
  for (const a of assessments.filter((a) => a.type === "assignment")) {
    const submitted = submissions
      .filter(
        (s) =>
          s.assessmentId === a.id && s.status !== "draft" && !!s.submittedAt,
      )
      .sort((a, b) => b.attempt - a.attempt)[0];
    items.push({
      key: "assignment",
      assessmentId: a.id,
      label: "Nộp bài tập",
      done: !!submitted,
      note: submitted
        ? submitted.status === "graded"
          ? `Đã chấm ${submitted.score}/${a.maxScore}`
          : "Chờ chấm"
        : "Chưa nộp bài tập",
    });
  }
  return items;
}

export function requireLessonChecklist(items: ChecklistItem[]) {
  const missing = items.filter((item) => !item.done);
  if (!items.length || missing.length)
    throw new LearningPathError(
      `Còn thiếu: ${missing.map((item) => item.label).join(", ") || "nội dung bài học"}.`,
    );
}

// Render URLs authored in the database, never executable protocols or protocol-relative URLs.
export function lessonMaterialUrl(value: string): string | null {
  if (/[\\\u0000-\u0020\u007f]/.test(value) || value.startsWith("//"))
    return null;
  if (value.startsWith("/")) return value;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export function recordPdfPage(
  previous: MediaProgress[string] | undefined,
  page: number,
  pages: number,
) {
  if (page > pages)
    throw new LearningPathError("Trang tài liệu không hợp lệ.", 400);
  const seen = previous?.pageCount === pages ? (previous.pages ?? []) : [];
  const visited = [...new Set([...seen, page])].sort((a, b) => a - b);
  return {
    progress: { pages: visited, pageCount: pages, lastPage: page },
    studied: visited.length === pages,
  };
}

export type LessonPlayerView = {
  lesson: {
    id: string;
    title: string;
    chapterTitle: string;
    description: string | null;
    body: string | null;
    durationSeconds: number;
  };
  materials: LessonMaterial[];
  media: MediaProgress;
  positionSeconds: number;
  studied: boolean;
  completed: boolean;
  checklist: ChecklistItem[];
  path: CoursePathView;
};

export type LessonMediaUpdate = Pick<
  LessonPlayerView,
  "media" | "positionSeconds" | "studied" | "completed"
> & { kind: "media-progress" };
export type LessonPlayerResponse<C extends LessonPlayerCommand> = C extends {
  type: "video" | "pdf-page";
}
  ? LessonMediaUpdate
  : LessonPlayerView;

export function videoPosition(
  seconds: number,
  duration: number | null,
  ended: boolean,
) {
  const position =
    duration && duration > 0 ? Math.min(seconds, duration) : seconds;
  if (ended && duration && duration > 0 && position < duration - 2)
    throw new LearningPathError("Video chưa được xem hết.");
  return position;
}
