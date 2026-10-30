import type { PathChange } from "@codi-1/db/schema/learning-path-values";
import {
  constrainPath,
  levelOf,
  type AdjustmentOffer,
  type AdjustmentOption,
  type PathInput,
  type PathItem,
} from "./learning-path-contract";

// Deterministic adaptation after a completion. AI never grades or chooses these changes.
// Every plan is re-derived from the current path, so a stale offer is simply not applicable.

export type AdjustmentFacts = {
  afterLessonId: string;
  codingLessonIds: ReadonlySet<string>;
  remedialLessonIds: ReadonlySet<string>;
  quizPercent: number | null;
};

export type AdjustmentPlan = {
  items: PathItem[];
  changes: PathChange[];
  message: string;
  summary: string;
};

const MASTERED = 3; // BKT level 3 = pMastery >= 0.60 (decision D16)
const WEAK = [1, 2]; // evidence exists but pMastery < 0.60

const conceptName = (input: PathInput, id: number) =>
  input.concepts.find((c) => c.id === id)?.name ?? "Khái niệm";
const joinNames = (names: string[]) => names.join(", ");
const isOpen = (input: PathInput, lessonId: string) =>
  input.lessons.find((l) => l.id === lessonId)?.progress !== "completed";
const titleOf = (input: PathInput, lessonId: string) =>
  input.lessons.find((l) => l.id === lessonId)?.title ?? "Bài học";

export function isMasteredLesson(input: PathInput, lessonId: string) {
  const lesson = input.lessons.find((l) => l.id === lessonId);
  return (
    !!lesson &&
    lesson.skillIds.length > 0 &&
    lesson.skillIds.every(
      (id) => levelOf(input.concepts.find((c) => c.id === id)) >= MASTERED,
    )
  );
}

export function weakConceptIds(input: PathInput): number[] {
  return input.concepts
    .filter(
      (c) =>
        c.evidenceCount > 0 && WEAK.includes(levelOf(c)),
    )
    .map((c) => c.id);
}

// Mirrors selectPath: items keep their order; lessons missing from the path are appended.
function orderOf(input: PathInput, items: PathItem[]): PathItem[] {
  const known = new Set(input.lessons.map((l) => l.id));
  const base = items.filter((item) => known.has(item.lessonId));
  return [
    ...base,
    ...input.lessons
      .filter((l) => !base.some((item) => item.lessonId === l.id))
      .map((l) => ({
        lessonId: l.id,
        isSkippable: false,
        reason: "Bài mới được thêm vào khoá học.",
      })),
  ];
}

// Scheduler owns prerequisites: any order it returns is prerequisite-safe.
function rebuild(
  input: PathInput,
  current: PathItem[],
  order: string[],
  overrides: Map<string, Partial<PathItem>>,
): PathItem[] {
  return constrainPath(
    { ...input, previous: current },
    {
      rationale: "Điều chỉnh theo kết quả học tập.",
      lessons: order.map((lessonId) => {
        const base = current.find((item) => item.lessonId === lessonId)!;
        const override = overrides.get(lessonId);
        return {
          lessonId,
          reason: override?.reason ?? base.reason,
          isSkippable: override?.isSkippable ?? base.isSkippable,
        };
      }),
    },
  );
}

const sameItems = (a: PathItem[], b: PathItem[]) =>
  a.length === b.length &&
  a.every(
    (item, index) =>
      item.lessonId === b[index]!.lessonId &&
      item.isSkippable === b[index]!.isSkippable,
  );

// Moves the given open lessons to just after the lesson just completed, keeping their order.
// Only lessons currently after that point are moved, so nothing is pushed later.
function moveAfterCompleted(
  input: PathInput,
  items: PathItem[],
  afterLessonId: string,
  lessonIds: string[],
  reason: string,
) {
  const current = orderOf(input, items);
  const afterIndex = current.findIndex((i) => i.lessonId === afterLessonId);
  if (afterIndex < 0) return null;
  const targets = lessonIds.filter((id) => {
    const index = current.findIndex((i) => i.lessonId === id);
    return index > afterIndex && isOpen(input, id);
  });
  if (!targets.length) return null;
  const rest = current
    .map((i) => i.lessonId)
    .filter((id) => !targets.includes(id));
  const insertAt = rest.indexOf(afterLessonId) + 1;
  const order = [
    ...rest.slice(0, insertAt),
    ...targets,
    ...rest.slice(insertAt),
  ];
  const overrides = new Map(
    targets.map((id) => [id, { reason, isSkippable: false }] as const),
  );
  const next = rebuild(input, current, order, overrides);
  const moved = targets.filter(
    (id) =>
      next.findIndex((i) => i.lessonId === id) <
      current.findIndex((i) => i.lessonId === id),
  );
  if (!moved.length) return null;
  return { next, moved };
}

export function planAdjustment(
  input: PathInput,
  items: PathItem[],
  facts: AdjustmentFacts,
  option: AdjustmentOption,
): AdjustmentPlan | null {
  if (option === "keep") return null;
  const current = orderOf(input, items);
  if (option === "skip-mastered") {
    const targets = current
      .map((i) => i.lessonId)
      .filter(
        (id) =>
          isOpen(input, id) &&
          isMasteredLesson(input, id) &&
          !current.find((i) => i.lessonId === id)!.isSkippable,
      );
    if (!targets.length) return null;
    const overrides = new Map(
      targets.map((id) => {
        const lesson = input.lessons.find((l) => l.id === id)!;
        return [
          id,
          {
            isSkippable: true,
            reason: `Bạn đã nắm vững ${joinNames(lesson.skillIds.map((s) => conceptName(input, s)))}, nên bài này có thể bỏ qua.`,
          },
        ] as const;
      }),
    );
    const next = rebuild(
      input,
      current,
      current.map((i) => i.lessonId),
      overrides,
    );
    if (sameItems(current, next)) return null;
    return {
      items: next,
      changes: targets.map((id) => ({
        lessonId: id,
        type: "now-skippable" as const,
        text: `${titleOf(input, id)}: có thể bỏ qua vì bạn đã nắm vững các khái niệm.`,
      })),
      message: "Codi đã đánh dấu các bài bạn đã nắm vững là có thể bỏ qua.",
      summary: `Đánh dấu ${targets.length} bài có thể bỏ qua.`,
    };
  }
  if (option === "practice") {
    const weak = new Set(weakConceptIds(input));
    // Remedial lessons are preferred; otherwise any open lesson that teaches a weak concept.
    const teaching = input.lessons.filter(
      (l) => isOpen(input, l.id) && l.skillIds.some((id) => weak.has(id)),
    );
    const remedial = teaching.filter((l) => facts.remedialLessonIds.has(l.id));
    const candidates = (remedial.length ? remedial : teaching).map((l) => l.id);
    const weakNames = joinNames(
      [...weak].slice(0, 2).map((id) => conceptName(input, id)),
    );
    const moved = moveAfterCompleted(
      input,
      items,
      facts.afterLessonId,
      candidates,
      `Bài ôn: bạn còn chưa chắc về ${weakNames}, nên ôn trước khi học tiếp.`,
    );
    if (!moved) return null;
    return {
      items: moved.next,
      changes: moved.moved.map((id) => ({
        lessonId: id,
        type: "moved-up" as const,
        text: `${titleOf(input, id)} được đưa lên ngay sau bài vừa học để ôn ${weakNames}.`,
      })),
      message: "Codi đã thêm bài ôn ngay sau bài vừa học.",
      summary: `Thêm ${moved.moved.length} bài ôn ngay sau bài vừa học.`,
    };
  }
  // harder
  const candidates = input.lessons
    .filter((l) => facts.codingLessonIds.has(l.id) && isOpen(input, l.id))
    .map((l) => l.id);
  const moved = moveAfterCompleted(
    input,
    items,
    facts.afterLessonId,
    candidates,
    "Bạn đã nắm vững kiến thức của bài vừa học, nên làm bài code này sớm hơn.",
  );
  if (!moved) return null;
  return {
    items: moved.next,
    changes: moved.moved.map((id) => ({
      lessonId: id,
      type: "moved-up" as const,
      text: `${titleOf(input, id)} được đưa lên sớm hơn để bạn luyện code khi đã nắm vững kiến thức.`,
    })),
    message: "Codi đã đưa bài code lên sớm hơn.",
    summary: `Đưa ${moved.moved.length} bài code lên sớm hơn.`,
  };
}

const LABELS: Record<Exclude<AdjustmentOption, "keep">, string> = {
  "skip-mastered": "Bỏ qua các bài đã nắm vững",
  practice: "Ôn lại trước khi học tiếp",
  harder: "Làm bài code sớm hơn",
};

// Null means nothing to offer: no card is shown for a completion that changes nothing.
export function suggestAdjustment(
  input: PathInput,
  items: PathItem[],
  facts: AdjustmentFacts,
): AdjustmentOffer | null {
  const lesson = input.lessons.find((l) => l.id === facts.afterLessonId);
  if (!lesson || lesson.progress !== "completed") return null;
  const options: AdjustmentOffer["options"] = [];
  for (const option of ["skip-mastered", "practice", "harder"] as const) {
    const plan = planAdjustment(input, items, facts, option);
    if (plan)
      options.push({
        type: option,
        label: LABELS[option],
        description: plan.summary,
      });
  }
  if (!options.length) return null;
  const mastered = lesson.skillIds
    .filter((id) => levelOf(input.concepts.find((c) => c.id === id)) >= MASTERED)
    .map((id) => conceptName(input, id));
  const weak = weakConceptIds(input).map((id) => conceptName(input, id));
  const parts = [
    facts.quizPercent === null
      ? null
      : `Bài quiz gần nhất đạt ${Math.round(facts.quizPercent)}%.`,
    mastered.length
      ? `Codi thấy bạn đã nắm vững ${joinNames(mastered)}.`
      : null,
    weak.length ? `Bạn còn chưa chắc về ${joinNames(weak.slice(0, 2))}.` : null,
  ].filter((part): part is string => !!part);
  options.push({
    type: "keep",
    label: "Giữ nguyên lộ trình",
    description: "Thứ tự các bài còn lại không đổi.",
  });
  return {
    afterLessonId: facts.afterLessonId,
    insight: parts.join(" ") || "Codi sẽ tiếp tục theo dõi tiến độ của bạn.",
    options,
  };
}
