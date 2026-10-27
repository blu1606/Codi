import { z } from "zod";
import { masteryLevel, type MasteryLevel } from "@codi-1/ui/lib/mastery";
import type { pathStatus, pathSource } from "@codi-1/db/schema/student-profile";
import type { PathChange } from "@codi-1/db/schema/learning-path-values";

export class LearningPathError extends Error {
  constructor(
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "LearningPathError";
  }
}
export const LESSON_PATH_STATES = [
  "done",
  "active",
  "next",
  "skippable",
  "locked",
  "todo",
] as const;
export type LessonPathState = (typeof LESSON_PATH_STATES)[number];
export const LESSON_PATH_LABELS: Record<LessonPathState, string> = {
  done: "Đã học",
  active: "Đang học",
  next: "Tiếp theo",
  skippable: "Có thể bỏ qua",
  locked: "Bị khoá",
  todo: "Chưa học",
};
const pathId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const learningPathCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sync") }).strict(),
  z.object({ type: z.literal("retry") }).strict(),
  z.object({ type: z.literal("ack-highlights"), pathId }).strict(),
  z.object({ type: z.literal("dismiss-update"), pathId }).strict(),
  z
    .object({
      type: z.literal("review"),
      rating: z.number().int().min(1).max(5),
      text: z.string().trim().max(2000),
    })
    .strict(),
]);
export type LearningPathCommand = z.infer<typeof learningPathCommand>;
export const pathProposal = z
  .object({
    rationale: z.string().trim().min(1).max(2000),
    lessons: z
      .array(
        z
          .object({
            lessonId: z.string().uuid(),
            reason: z.string().trim().min(1).max(600),
            isSkippable: z.boolean(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export type PathProposal = z.infer<typeof pathProposal>;
// Gemini documents maxItems, but not UUID/string-length constraints. Validate those locally.
export const pathProposalOutput = pathProposal.extend({
  rationale: z.string(),
  lessons: z
    .array(
      pathProposal.shape.lessons.element.extend({
        lessonId: z.string(),
        reason: z.string(),
      }),
    )
    .max(1000),
});
export type PathLesson = {
  kind?: import("./lesson-kind").LessonKind;
  id: string;
  title: string;
  chapterId: string;
  chapterTitle: string;
  durationSeconds: number;
  skillIds: number[];
  progress: "not_started" | "in_progress" | "completed";
  studied: boolean;
};
export type PathConcept = {
  id: number;
  name: string;
  probability: number | null;
  evidenceCount: number;
};
export type PathEdge = { from: number; to: number };
export type PathItem = {
  lessonId: string;
  isSkippable: boolean;
  reason: string;
};
export type PathInput = {
  publicationId?: string | null;
  contentGeneration?: number;
  lessons: PathLesson[];
  concepts: PathConcept[];
  edges: PathEdge[];
  previous: PathItem[];
  goal: string | null;
  hours: number | null;
  level: string | null;
};
export const levelOf = (concept: PathConcept | undefined): MasteryLevel =>
  masteryLevel(concept?.evidenceCount ? concept.probability : null);

export function lockInfo(input: PathInput, lesson: PathLesson) {
  for (const edge of input.edges) {
    if (
      !lesson.skillIds.includes(edge.to) ||
      lesson.skillIds.includes(edge.from)
    )
      continue;
    const teachers = input.lessons.filter(
      (l) => l.id !== lesson.id && l.skillIds.includes(edge.from),
    );
    if (
      !teachers.length ||
      teachers.some((l) => l.progress === "completed") ||
      levelOf(input.concepts.find((c) => c.id === edge.from)) >= 3
    )
      continue;
    return {
      concept:
        input.concepts.find((c) => c.id === edge.from)?.name ??
        "Khái niệm tiên quyết",
      lessonId: teachers[0]!.id,
      lessonTitle: teachers[0]!.title,
    };
  }
  return null;
}

// AI chooses preferences and explanations; this scheduler owns the hard constraints.
// Completed rows keep their order. Only unfinished lessons are replanned.
export function constrainPath(
  input: PathInput,
  proposal?: PathProposal,
): PathItem[] {
  const proposed = proposal?.lessons ?? [];
  const ids = new Set(input.lessons.map((l) => l.id));
  if (
    proposed.some((p) => !ids.has(p.lessonId)) ||
    new Set(proposed.map((p) => p.lessonId)).size !== proposed.length
  )
    throw new LearningPathError("AI trả về bài học không hợp lệ.");
  const order = [
    ...new Set([
      ...input.previous.map((p) => p.lessonId),
      ...input.lessons.map((l) => l.id),
    ]),
  ].filter((id) => ids.has(id));
  const done = order.filter(
    (id) => input.lessons.find((l) => l.id === id)!.progress === "completed",
  );
  const preference = [
    ...new Set([
      ...proposed.map((p) => p.lessonId),
      ...input.lessons.map((l) => l.id),
    ]),
  ];
  const remaining = preference.filter((id) => !done.includes(id));
  const result = [...done];
  while (remaining.length) {
    const index = remaining.findIndex((id) => {
      const lesson = input.lessons.find((l) => l.id === id)!;
      return input.edges.every((edge) => {
        if (
          !lesson.skillIds.includes(edge.to) ||
          lesson.skillIds.includes(edge.from)
        )
          return true;
        const teachers = input.lessons.filter((l) =>
          l.skillIds.includes(edge.from),
        );
        return (
          !teachers.length ||
          teachers.some((l) => result.includes(l.id)) ||
          levelOf(input.concepts.find((c) => c.id === edge.from)) >= 3
        );
      });
    });
    if (index < 0)
      throw new LearningPathError(
        "Các điều kiện tiên quyết không có thứ tự hợp lệ.",
      );
    result.push(remaining.splice(index, 1)[0]!);
  }
  return result.map((id) => {
    const lesson = input.lessons.find((l) => l.id === id)!;
    const suggestion = proposed.find((p) => p.lessonId === id);
    const previous = input.previous.find((p) => p.lessonId === id);
    if (lesson.progress === "completed" && previous) return previous;
    return {
      lessonId: id,
      reason:
        suggestion?.reason ??
        "Theo thứ tự mặc định của khoá học (thứ tự bài học tiên quyết).",
      isSkippable:
        !!suggestion?.isSkippable &&
        lesson.skillIds.length > 0 &&
        lesson.skillIds.every(
          (skillId) =>
            levelOf(input.concepts.find((c) => c.id === skillId)) >= 3,
        ),
    };
  });
}

export function defaultPathItems(input: PathInput): PathItem[] {
  const plain = {
    ...input,
    previous: input.previous.map((p) => ({ ...p, isSkippable: false })),
  };
  try {
    return constrainPath(plain);
  } catch {
    // Invalid authored cycles still fall back promptly; lesson access stays guarded.
    return input.lessons.map((l) => ({
      lessonId: l.id,
      isSkippable: false,
      reason:
        "Theo thứ tự mặc định của giảng viên; điều kiện tiên quyết vẫn áp dụng.",
    }));
  }
}

export function generationOutcome(
  input: PathInput,
  proposal: unknown,
  providerFailed = false,
  preserveAiOnFailure = false,
) {
  try {
    if (providerFailed) throw new Error("Provider unavailable");
    const parsed = pathProposal.parse(proposal);
    if (preserveAiOnFailure && !parsed.lessons.length)
      throw new LearningPathError("AI không trả về bài học.");
    const ai = parsed.lessons.length > 0;
    return {
      status: "ready" as const,
      source: ai ? ("ai" as const) : ("default" as const),
      generatedBy: ai ? ("ai" as const) : ("system" as const),
      items: ai ? constrainPath(input, parsed) : defaultPathItems(input),
    };
  } catch {
    if (preserveAiOnFailure) {
      const previous = input.previous.filter((item) =>
        input.lessons.some((lesson) => lesson.id === item.lessonId),
      );
      return {
        status: "ready" as const,
        source: "ai" as const,
        generatedBy: "ai" as const,
        items: constrainPath(input, {
          rationale: "Giữ lộ trình cá nhân hoá hiện tại.",
          lessons: previous,
        }),
      };
    }
    return {
      status: "failed" as const,
      source: "default" as const,
      generatedBy: "system" as const,
      items: defaultPathItems(input),
    };
  }
}

export function selectPath(
  input: PathInput,
  items: PathItem[],
  source: "ai" | "default" | null,
) {
  const order = [
    ...items,
    ...input.lessons
      .filter((l) => !items.some((p) => p.lessonId === l.id))
      .map((l) => ({
        lessonId: l.id,
        isSkippable: false,
        reason: "Bài mới được thêm vào khoá học.",
      })),
  ];
  const open = (item: PathItem) => {
    const lesson = input.lessons.find((l) => l.id === item.lessonId);
    return (
      !!lesson && lesson.progress !== "completed" && !lockInfo(input, lesson)
    );
  };
  const current =
    order.find((p) => open(p) && !(source === "ai" && p.isSkippable)) ??
    order.find(open);
  const rows = order.flatMap((item) => {
    const lesson = input.lessons.find((l) => l.id === item.lessonId);
    if (!lesson) return [];
    const lock = lockInfo(input, lesson);
    const status: LessonPathState =
      lesson.progress === "completed"
        ? "done"
        : lock
          ? "locked"
          : lesson.id === current?.lessonId
            ? lesson.progress === "in_progress" || lesson.studied
              ? "active"
              : "next"
            : source === "ai" && item.isSkippable
              ? "skippable"
              : "todo";
    return [
      {
        ...lesson,
        ...item,
        status,
        lock,
        mastery: lesson.skillIds.map((id) => ({
          id,
          name: input.concepts.find((c) => c.id === id)?.name ?? "Khái niệm",
          level: levelOf(input.concepts.find((c) => c.id === id)),
        })),
      },
    ];
  });
  const required = rows.filter((r) => !(source === "ai" && r.isSkippable));
  const done = rows.filter((r) => r.status === "done").length;
  return {
    rows,
    currentLessonId: current?.lessonId ?? null,
    done,
    total: rows.length,
    percent: rows.length ? Math.round((done / rows.length) * 100) : 0,
    complete: rows.length > 0 && required.every((r) => r.status === "done"),
  };
}

export function pathDiff(input: PathInput, next: PathItem[]) {
  const changes: PathChange[] = [];
  for (const [index, item] of next.entries()) {
    const lesson = input.lessons.find((l) => l.id === item.lessonId)!;
    if (lesson.progress === "completed") continue;
    const oldIndex = input.previous.findIndex(
      (p) => p.lessonId === item.lessonId,
    );
    if (oldIndex > index)
      changes.push({
        lessonId: item.lessonId,
        type: "moved-up",
        text: `${lesson.title} được đưa lên trước để phù hợp với phần bạn cần học.`,
      });
    if (item.isSkippable && !input.previous[oldIndex]?.isSkippable)
      changes.push({
        lessonId: item.lessonId,
        type: "now-skippable",
        text: `${lesson.title}: có thể bỏ qua vì bạn đã nắm vững các khái niệm.`,
      });
  }
  return changes;
}

export type CoursePathView = {
  course: { id: string; title: string; slug: string };
  status: (typeof pathStatus.enumValues)[number];
  source: (typeof pathSource.enumValues)[number] | null;
  goal: string | null;
  hours: number | null;
  goalEditing: boolean;
  diagnosticStatus: string;
  showDiagnosticCard: boolean;
  pathId: number | null;
  rationale: string | null;
  highlights: string[];
  updating: boolean;
  update: null | {
    afterLessonId: string | null;
    changes: ReturnType<typeof pathDiff>;
    message: string;
  };
  review: null | { rating: number; text: string | null };
  recommendation: null | { title: string; slug: string };
} & ReturnType<typeof selectPath>;
export type KnowledgeMapView = {
  courses: { id: string; title: string }[];
  courseId: string | null;
  title: string | null;
  confirmed: boolean;
  nodes: (PathConcept & {
    level: MasteryLevel;
    locked: boolean;
    recommended: boolean;
    lessons: { id: string; title: string; locked: boolean }[];
  })[];
  edges: PathEdge[];
};

// Kahn layers also protect the learner UI from a malformed/cyclic accepted graph.
export function graphLayers(ids: number[], edges: PathEdge[]): number[][] {
  const remaining = new Set(ids);
  const layers: number[][] = [];
  while (remaining.size) {
    const layer = [...remaining].filter(
      (id) => !edges.some((e) => e.to === id && remaining.has(e.from)),
    );
    if (!layer.length)
      throw new LearningPathError(
        "Bản đồ kiến thức đang cần giảng viên kiểm tra.",
      );
    layers.push(layer);
    layer.forEach((id) => remaining.delete(id));
  }
  return layers;
}
