import {
  ONBOARDING_GOALS,
  ONBOARDING_LEVELS,
  WEEKLY_HOURS,
  type GoalDraft,
} from "@codi-1/db/schema/onboarding-values";

// S17 guided intake (Flow L13): the Tutor asks goal, level and weekly hours only when they are unknown.
// The answers are the onboarding goal draft, so course onboarding (Flow L4) reuses them and never asks twice.
export const INTAKE_FIELDS = ["goal", "level", "hours"] as const;
export type IntakeField = (typeof INTAKE_FIELDS)[number];

type Option<T> = { value: T; label: string };

export const INTAKE_QUESTIONS: {
  goal: { text: string; options: Option<(typeof ONBOARDING_GOALS)[number]>[] };
  level: { text: string; options: Option<(typeof ONBOARDING_LEVELS)[number]>[] };
  hours: { text: string; options: Option<(typeof WEEKLY_HOURS)[number]>[] };
} = {
  goal: {
    text: "Mục tiêu của bạn là gì?",
    options: [
      { value: "project", label: "Làm được dự án" },
      { value: "finish", label: "Hoàn thành khoá học" },
      { value: "interview", label: "Chuẩn bị phỏng vấn" },
    ],
  },
  level: {
    text: "Trình độ hiện tại của bạn?",
    options: [
      { value: "new", label: "Mới bắt đầu" },
      { value: "basic", label: "Có kinh nghiệm cơ bản" },
      { value: "solid", label: "Trung cấp" },
    ],
  },
  hours: {
    text: "Bạn có thể dành bao nhiêu giờ/tuần để học?",
    options: [
      { value: 2, label: "< 5 giờ" },
      { value: 5, label: "5-10 giờ" },
      { value: 10, label: "> 10 giờ" },
    ],
  },
};

/** The chat's summary row: each known answer with its label. */
export function intakeLabels(draft: GoalDraft): { field: IntakeField; label: string }[] {
  const out: { field: IntakeField; label: string }[] = [];
  if (draft.goal) out.push({ field: "goal", label: optionLabel("goal", draft.goal) });
  if (draft.level) out.push({ field: "level", label: optionLabel("level", draft.level) });
  if (draft.hours) out.push({ field: "hours", label: `${optionLabel("hours", draft.hours)}/tuần` });
  return out;
}

/** What the Tutor is told about the learner's answers, empty when none are known. */
export function intakeNote(draft: GoalDraft): string {
  const labels = intakeLabels(draft).map((item) => item.label);
  return labels.length ? `Hồ sơ học viên: ${labels.join(", ")}` : "";
}

function optionLabel(field: IntakeField, value: string | number) {
  const options: Option<string | number>[] = INTAKE_QUESTIONS[field].options;
  return options.find((option) => option.value === value)?.label ?? String(value);
}

/** Fields still unknown and not skipped in this conversation, in the order the Tutor asks them. */
export function missingIntake(draft: GoalDraft, skipped: readonly IntakeField[]): IntakeField[] {
  return INTAKE_FIELDS.filter((field) => !draft[field] && !skipped.includes(field));
}

/** Set the answers that are given; a null clears that answer. Unknown keys never reach the draft. */
export function applyIntakePatch(
  draft: GoalDraft,
  patch: Partial<Record<IntakeField, string | number | null>>,
): GoalDraft {
  const next: Record<string, unknown> = { ...draft };
  for (const field of INTAKE_FIELDS) {
    if (!(field in patch)) continue;
    const value = patch[field];
    if (value === null || value === undefined) delete next[field];
    else next[field] = value;
  }
  return sanitizeIntake(next);
}

/** Keep only values the onboarding draft accepts. */
export function sanitizeIntake(input: Record<string, unknown>): GoalDraft {
  const out: GoalDraft = {};
  const goal = ONBOARDING_GOALS.find((value) => value === input.goal);
  const level = ONBOARDING_LEVELS.find((value) => value === input.level);
  const hours = WEEKLY_HOURS.find((value) => value === input.hours);
  if (goal) out.goal = goal;
  if (level) out.level = level;
  if (hours) out.hours = hours;
  return out;
}
