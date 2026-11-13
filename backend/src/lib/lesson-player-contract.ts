import { z } from "zod";
import type {
  AdjustmentOffer,
  CoursePathView,
} from "./learning-path-contract";
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
      // Stretches the learner actually played (seconds), so skipping ahead is not counted as watching.
      watched: z
        .array(z.tuple([z.number().min(0).max(864000), z.number().min(0).max(864000)]))
        .max(500)
        .optional(),
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
  {
    seconds?: number;
    watched?: WatchedRange[];
    pages?: number[];
    pageCount?: number;
    lastPage?: number;
  }
>;
export type LessonMaterial = {
  id: number;
  type: "video" | "pdf" | "slide" | "document" | "link";
  title: string;
  url: string | null;
  durationSeconds: number | null;
  // Video transcript cues (seconds), or null when the material has none.
  transcript: TranscriptCue[] | null;
};
export type TranscriptCue = { start: number; end?: number; text: string };
export type ChecklistAssessment = {
  id: number;
  type: "quiz" | "assignment" | "coding";
  title: string;
  passingScore: number | null;
  maxScore: number;
  isTutorial?: boolean;
  tutorialDone?: boolean;
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
  tutorial?: boolean;
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
        if (a.isTutorial)
          return {
            key: "code" as const,
            assessmentId: a.id,
            tutorial: true,
            label: "Đi hết các bước hướng dẫn",
            done: a.tutorialDone === true,
            note: a.tutorialDone
              ? "Đã đi hết hướng dẫn"
              : "Đi tới bước cuối để hoàn thành hướng dẫn",
          };
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
    const percent =
      s?.quizPercent ??
      (s?.score == null ? null : (s.score / a.maxScore) * 100);
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

const MAX_TRANSCRIPT_CUES = 5000;
const MAX_CUE_TEXT = 2000;
const MAX_CUE_SECONDS = 24 * 60 * 60;

/**
 * The stored transcript (jsonb, written outside this service) as cues the reader can trust: only cues with a finite
 * start in [0, 24 h] and non-empty text, an end kept only when it follows the start, sorted by start. Returns null
 * when nothing usable remains.
 */
export function lessonTranscript(value: unknown): TranscriptCue[] | null {
  if (!Array.isArray(value)) return null;
  const cues: TranscriptCue[] = [];
  for (const raw of value.slice(0, MAX_TRANSCRIPT_CUES)) {
    if (!raw || typeof raw !== "object") continue;
    const { start, end, text } = raw as Record<string, unknown>;
    if (typeof start !== "number" || !Number.isFinite(start) || start < 0 || start > MAX_CUE_SECONDS) continue;
    if (typeof text !== "string") continue;
    const line = text.replace(/\s+/g, " ").trim().slice(0, MAX_CUE_TEXT);
    if (!line) continue;
    const cue: TranscriptCue = { start, text: line };
    if (typeof end === "number" && Number.isFinite(end) && end > start && end <= MAX_CUE_SECONDS) cue.end = end;
    cues.push(cue);
  }
  cues.sort((a, b) => a.start - b.start);
  return cues.length ? cues : null;
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
  // Present only in the response to a completion that was just recorded.
  adjustment?: AdjustmentOffer | null;
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

// A video counts as studied once the learner has watched 90% of it (owner decision).
export const VIDEO_STUDY_RATIO = 0.9;

// Without duration metadata there is nothing to measure, so the native ended event decides.
export function videoStudied(
  seconds: number,
  duration: number | null,
  ended: boolean,
) {
  return duration && duration > 0
    ? seconds >= duration * VIDEO_STUDY_RATIO
    : ended;
}

export type WatchedRange = [number, number];
const MAX_WATCHED_RANGES = 200;

/**
 * Union of the stretches a learner played, clamped to the video, sorted and merged (gaps under 1 s join). Watching is
 * tracked for the "you have not watched enough" reminder only; it never blocks completion.
 */
export function mergeWatched(
  stored: unknown,
  added: WatchedRange[] | undefined,
  duration: number | null,
): WatchedRange[] {
  const end = duration && duration > 0 ? duration : Number.POSITIVE_INFINITY;
  const all = [...(Array.isArray(stored) ? stored : []), ...(added ?? [])]
    .filter((r): r is WatchedRange => Array.isArray(r) && r.length === 2 && r.every((x) => Number.isFinite(x)))
    .map(([a, b]) => [Math.max(0, Math.min(a, end)), Math.max(0, Math.min(b, end))] as WatchedRange)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const out: WatchedRange[] = [];
  for (const [a, b] of all) {
    const prev = out[out.length - 1];
    if (prev && a <= prev[1] + 1) prev[1] = Math.max(prev[1], b);
    else out.push([a, b]);
  }
  // A pathological client cannot grow the row: keep the longest stretches.
  return out.length > MAX_WATCHED_RANGES
    ? out.sort((x, y) => y[1] - y[0] - (x[1] - x[0])).slice(0, MAX_WATCHED_RANGES).sort((x, y) => x[0] - y[0])
    : out.map(([a, b]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]);
}

export function videoPosition(
  seconds: number,
  duration: number | null,
  ended: boolean,
) {
  const position =
    duration && duration > 0 ? Math.min(seconds, duration) : seconds;
  if (ended && !videoStudied(position, duration, ended))
    throw new LearningPathError("Video chưa được xem đủ 90% thời lượng.");
  return position;
}
