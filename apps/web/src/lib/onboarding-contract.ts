import { z } from "zod";
import { ONBOARDING_GOALS, ONBOARDING_LEVELS, WEEKLY_HOURS } from "@codi-1/db/schema/onboarding-values";
import type { studentEnrollments } from "@codi-1/db/schema/student-profile";

export { ONBOARDING_GOALS, ONBOARDING_LEVELS, WEEKLY_HOURS };
export const GOAL_LABELS = { project: "Làm được dự án", finish: "Hoàn thành khóa học", interview: "Chuẩn bị phỏng vấn" } as const;
export const LEVEL_LABELS = { new: "Mới bắt đầu", basic: "Đã biết cơ bản", solid: "Khá vững" } as const;
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const step = z.number().int().min(0).max(2);
export const onboardingCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("goal-pick"), step, value: z.union([z.enum(ONBOARDING_GOALS), z.enum(ONBOARDING_LEVELS), z.literal(2), z.literal(5), z.literal(10)]) }).strict(),
  z.object({ type: z.literal("goal-next"), step }).strict(),
  z.object({ type: z.literal("goal-back"), step }).strict(),
  z.object({ type: z.literal("goal-skip") }).strict(),
  z.object({ type: z.literal("goal-edit") }).strict(),
  z.object({ type: z.literal("fork-default") }).strict(),
  z.object({ type: z.literal("fork-diagnostic") }).strict(),
  z.object({ type: z.literal("diagnostic-start") }).strict(),
  z.object({ type: z.literal("diagnostic-postpone") }).strict(),
  z.object({ type: z.literal("diagnostic-retake") }).strict(),
  z.object({ type: z.literal("answer"), attemptId: id, questionId: id, optionId: id.nullable(), unknown: z.boolean() }).strict().refine((v) => v.unknown ? v.optionId === null : v.optionId !== null),
  z.object({ type: z.literal("previous"), attemptId: id, questionId: id }).strict(),
  z.object({ type: z.literal("next"), attemptId: id, questionId: id }).strict(),
  z.object({ type: z.literal("submit"), attemptId: id }).strict(),
  z.object({ type: z.literal("request-path") }).strict(),
]);
export type OnboardingCommand = z.infer<typeof onboardingCommand>;
export type Enrollment = typeof studentEnrollments.$inferSelect;
export class OnboardingError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); }
}
export function assertOnboardingAccess(enrollment: Enrollment | undefined) {
  if (!enrollment) throw new OnboardingError("Bạn chưa đăng ký khoá học này.", 403);
  if (enrollment.status === "suspended") throw new OnboardingError("Quyền học khoá học này đang tạm ngưng.", 403);
  return enrollment;
}
export function requireDiagnosticState(enrollment: Enrollment, ...allowed: Enrollment["diagnosticStatus"][]) {
  if (enrollment.goalEditing || !enrollment.goalSetAt || !allowed.includes(enrollment.diagnosticStatus)) {
    throw new OnboardingError("Trạng thái đã thay đổi. Vui lòng tải lại để tiếp tục.");
  }
}

// Pure transition policy; SQL writes run under an owner-scoped enrollment row lock.
export function goalTransition(enrollment: Enrollment, command: OnboardingCommand): Partial<Enrollment> {
  const { goalStep: current, goalDraft: draft } = enrollment;
  if (command.type === "goal-edit") {
    if (!enrollment.goalSetAt || enrollment.goalEditing) throw new OnboardingError("Chưa thể chỉnh mục tiêu.");
    const legacyGoal = ONBOARDING_GOALS.find((goal) => goal === enrollment.learningGoal) ?? "finish";
    const hours = WEEKLY_HOURS.find((value) => value * 60 === enrollment.weeklyGoalMinutes) ?? 5;
    return { goalEditing: true, goalStep: 0, goalDraft: { goal: legacyGoal, level: enrollment.selfAssessedLevel ?? "new", hours } };
  }
  if (enrollment.goalSetAt && !enrollment.goalEditing) throw new OnboardingError("Mục tiêu đã lưu. Chọn Chỉnh mục tiêu để thay đổi.");
  if (command.type === "goal-skip") return saveGoal(enrollment, { goal: "finish", level: "new", hours: 5 });
  if (!("step" in command) || command.step !== current) throw new OnboardingError("Bước thiết lập đã thay đổi.");
  if (command.type === "goal-back") {
    if (current === 0) throw new OnboardingError("Bạn đang ở bước đầu tiên.");
    return { goalStep: current - 1 };
  }
  if (command.type === "goal-pick") {
    if (current === 0) return { goalDraft: { ...draft, goal: z.enum(ONBOARDING_GOALS).parse(command.value) } };
    if (current === 1) return { goalDraft: { ...draft, level: z.enum(ONBOARDING_LEVELS).parse(command.value) } };
    return { goalDraft: { ...draft, hours: z.union([z.literal(2), z.literal(5), z.literal(10)]).parse(command.value) } };
  }
  if (command.type !== "goal-next") throw new OnboardingError("Hành động không hợp lệ.", 400);
  if ([draft.goal, draft.level, draft.hours][current] === undefined) throw new OnboardingError("Vui lòng chọn một câu trả lời.", 400);
  if (current < 2) return { goalStep: current + 1 };
  return saveGoal(enrollment, draft);
}
function saveGoal(enrollment: Enrollment, draft: Enrollment["goalDraft"]): Partial<Enrollment> {
  const goal = z.enum(ONBOARDING_GOALS).parse(draft.goal);
  const level = z.enum(ONBOARDING_LEVELS).parse(draft.level);
  const hours = z.union([z.literal(2), z.literal(5), z.literal(10)]).parse(draft.hours);
  return { learningGoal: goal, targetSkillId: null, selfAssessedLevel: level, weeklyGoalMinutes: hours * 60,
    goalSetAt: new Date(), goalStep: 0, goalDraft: {}, goalEditing: false,
    ...(enrollment.goalEditing ? { pathStatus: "generating" as const } : { diagnosticStatus: "fork" as const }) };
}

export type BktParameters = { bktPInit: number; bktPLearn: number; bktPGuess: number; bktPSlip: number };
export function updateBkt(prior: number, correct: boolean, params: BktParameters): number {
  const values = [prior, params.bktPInit, params.bktPLearn, params.bktPGuess, params.bktPSlip];
  if (values.some((p) => !Number.isFinite(p) || p < 0 || p > 1) || params.bktPGuess + params.bktPSlip >= 1) {
    throw new OnboardingError("Tham số BKT của khái niệm không hợp lệ.");
  }
  const knows = prior * (correct ? 1 - params.bktPSlip : params.bktPSlip);
  const guesses = (1 - prior) * (correct ? params.bktPGuess : 1 - params.bktPGuess);
  // A zero-likelihood observation leaves the prior unchanged before the learning step.
  const posterior = knows + guesses === 0 ? prior : knows / (knows + guesses);
  return Math.min(1, Math.max(0, posterior + (1 - posterior) * params.bktPLearn));
}

export type OnboardingView = {
  enrollment: Pick<Enrollment, "learningGoal" | "selfAssessedLevel" | "weeklyGoalMinutes" | "goalDraft" | "goalStep" | "goalEditing" | "diagnosticStatus" | "diagnosticQuestionIndex" | "pathStatus" | "pathSource"> & { goalSet: boolean };
  course: { id: string; title: string };
  diagnostic: null | { id: number; title: string; questions: { id: number; text: string; codeSnippet: string | null; options: { id: number; text: string }[] }[] };
  attemptId: number | null;
  answers: { questionId: number; optionId: number | null; unknown: boolean }[];
  result: null | { right: number; wrong: number; unknown: number; concepts: { id: number; name: string; probability: number | null; evidenceCount: number }[] };
};
