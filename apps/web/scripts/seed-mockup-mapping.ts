import { createHash } from "node:crypto";
import { z } from "zod";
import { ONBOARDING_GOALS, ONBOARDING_LEVELS, WEEKLY_HOURS } from "@codi-1/db/schema/onboarding-values";
import { canonical } from "../src/lib/coding-contract";
import type { TutorialStep } from "@codi-1/db/schema/coding-tutorial";
import type { ConfirmedKnowledgeMap } from "@codi-1/db/schema/confirmed-knowledge-map";
import { findCycle } from "../src/lib/knowledge-map-runner";

// Pure mapping for seed-mockup.ts: the mockup snapshot schema (validated at the boundary) and the
// rules that turn prototype values into database values. No database access in this module.

// Same derivation as the private helper in onboarding-fixture.ts, so ids stay stable across runs.
export function stableUuid(input: string) {
  const hex = createHash("sha256").update(input).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export const mockupChapterUuid = (chapterId: string) => stableUuid(`mockup:chapter:${chapterId}`);
export const mockupLessonUuid = (lessonId: string) => stableUuid(`mockup:lesson:${lessonId}`);

// ---------------------------------------------------------------- snapshot schema
const id = z.string().min(1);
const instant = z.iso.datetime();
const review = z.enum(["suggested", "accepted", "edited", "declined"]);

const quizQuestion = z
  .object({ id, conceptId: z.string().nullish(), text: z.string().min(1), options: z.array(z.string()).min(2), correctIndex: z.number().int().nonnegative(), explanation: z.string().optional() })
  .refine((q) => q.correctIndex < q.options.length, { message: "correctIndex nằm ngoài danh sách đáp án" });
export type MockupQuestion = z.infer<typeof quizQuestion>;

const codeTest = z.object({ id, name: z.string().min(1), call: z.string().min(1), expected: z.unknown(), hidden: z.boolean().optional() });
const challengeCode = z.object({
  kind: z.literal("challenge"),
  fileName: z.string().optional(),
  language: z.string().min(1),
  instructions: z.array(z.string()),
  starter: z.string(),
  solution: z.string().optional(),
  tests: z.array(codeTest).min(1),
  hints: z.array(z.string()).default([]),
  solutionCheck: z.object({ ok: z.boolean(), at: instant }).optional(),
});
const tutorialCode = z.object({
  kind: z.literal("tutorial"),
  fileName: z.string().optional(),
  language: z.string().min(1),
  steps: z.array(z.object({ title: z.string(), body: z.string(), starter: z.string(), tests: z.array(codeTest).max(100).optional(), isSolution: z.boolean().optional() })).min(1).max(100),
});
const mockupCode = z.discriminatedUnion("kind", [challengeCode, tutorialCode]);
export type MockupCode = z.infer<typeof mockupCode>;

const rubricItem = z.object({ name: z.string().min(1), points: z.number().nonnegative(), desc: z.string() });
const assignment = z.object({
  maxScore: z.number().positive(),
  passScore: z.number().nonnegative(),
  acceptedTypes: z.string(),
  dueDays: z.number().int().positive().nullable().optional(),
  rubric: z.array(rubricItem),
  instructions: z.string(),
  requiresFile: z.boolean(),
  requiresLink: z.boolean(),
});

const lesson = z.object({
  id,
  title: z.string().min(1),
  type: z.string(),
  durationMin: z.number().int().nonnegative(),
  conceptIds: z.array(id),
  reading: z.string().nullable(),
  quiz: z.object({ passingScore: z.number().int().min(0).max(100), questions: z.array(quizQuestion).min(1) }).nullable(),
  assignment: assignment.nullable(),
  code: mockupCode.nullable(),
});
export type MockupLesson = z.infer<typeof lesson>;

const course = z.object({
  id,
  slug: id,
  title: z.string().min(1),
  summary: z.string(),
  categoryId: id,
  level: z.string().min(1),
  lecturerId: id,
  price: z.number().int().nonnegative(),
  status: z.enum(["draft", "pending", "rejected", "published", "hidden"]),
  submittedAt: instant.optional(),
  hideReason: z.string().optional(),
  rating: z.number().min(0).max(5),
  ratingCount: z.number().int().nonnegative(),
  outcomes: z.array(z.string()),
  requirements: z.array(z.string()),
  concepts: z.array(z.object({ id, name: z.string().min(1) })),
  prerequisites: z.array(z.object({ from: id, to: id })),
  entryTest: z.object({ title: z.string().min(1), questions: z.array(quizQuestion).min(1) }).nullable(),
  aiPath: z.array(z.object({ lessonId: id, skippable: z.boolean(), reason: z.string() })),
  chapters: z.array(z.object({ id, title: z.string().min(1), lessons: z.array(lesson) })),
});
export type MockupCourse = z.infer<typeof course>;

const assignmentState = z.object({
  status: z.enum(["pending", "graded"]),
  submittedAt: instant,
  link: z.string().nullable().optional(),
  fileName: z.string().nullable().optional(),
  note: z.string().optional(),
  score: z.number().nullable().optional(),
  feedback: z.string().optional(),
  gradedAt: instant.nullable().optional(),
});

export const mockupSnapshot = z.object({
  users: z.array(z.object({ id, name: z.string().min(1), email: z.email(), role: z.enum(["learner", "lecturer", "admin"]), status: z.enum(["active", "inactive"]), createdAt: instant })),
  categories: z.array(z.object({ id, name: z.string().min(1) })),
  courses: z.array(course),
  knowledgeMaps: z.record(
    z.string(),
    z.object({
      status: z.enum(["empty", "analysing", "ready", "confirmed", "failed", "stale"]),
      updatedAt: instant,
      concepts: z.array(z.object({ id, name: z.string().min(1), review, lessonIds: z.array(id) })),
      edges: z.array(z.object({ from: id, to: id, review })),
    }),
  ),
  orders: z.array(
    z.object({
      code: z.string().min(1),
      userId: id,
      items: z.array(z.object({ courseId: id, price: z.number().int().nonnegative() })).min(1),
      voucherCode: z.string().nullable(),
      discount: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
      status: z.enum(["pending", "paid", "failed", "cancelled", "refunded"]),
      createdAt: instant,
      paidAt: instant.nullable(),
      timeline: z.array(z.object({ at: instant, label: z.string().min(1) })),
    }),
  ),
  vouchers: z.array(
    z.object({ code: z.string().min(1), type: z.enum(["percent", "amount"]), value: z.number().int().positive(), minOrder: z.number().int().nonnegative(), usageLimit: z.number().int().positive().nullable(), used: z.number().int().nonnegative(), expiresAt: z.iso.date().nullable(), active: z.boolean() }),
  ),
  submissions: z.array(assignmentState.extend({ courseId: id, lessonId: id, userId: id })),
  questions: z.array(
    z.object({ courseId: id, lessonId: id.nullable().optional(), userId: id, text: z.string().min(1), createdAt: instant, status: z.enum(["unanswered", "answered"]), replies: z.array(z.object({ userId: id, isLecturer: z.boolean(), text: z.string().min(1), at: instant })) }),
  ),
  reviews: z.array(z.object({ courseId: id, userId: id, stars: z.number().int().min(1).max(5), text: z.string(), createdAt: instant, reply: z.object({ text: z.string().min(1), at: instant }).nullable() })),
  enrolments: z.array(z.object({ userId: id, courseId: id, enrolledAt: instant })),
  learnerProgress: z.array(z.object({ userId: id, courseId: id, completed: z.array(id), quizScores: z.record(z.string(), z.number().min(0).max(100)), answers: z.record(z.string(), z.boolean()), lastActive: instant })),
  learnerSeed: z.object({
    userId: id,
    courses: z.record(
      z.string(),
      z.object({
        goal: z.object({ goal: z.enum(ONBOARDING_GOALS), level: z.enum(ONBOARDING_LEVELS), hours: z.literal([...WEEKLY_HOURS]) }),
        diagnostic: z.object({ status: z.literal("done"), right: z.number().int().nonnegative(), wrong: z.number().int().nonnegative(), unknown: z.number().int().nonnegative() }),
        pathStatus: z.enum(["none", "generating", "ready", "failed"]),
        completed: z.array(id),
        currentLessonId: id.nullable().optional(),
        quizScores: z.record(z.string(), z.number().min(0).max(100)),
        assignments: z.record(z.string(), assignmentState),
        mastery: z.record(z.string(), z.number().int().min(0).max(4)),
      }),
    ),
  }),
  notifications: z.array(z.object({ userId: id, title: z.string().min(1), body: z.string().nullable().optional(), link: z.string().nullable().optional(), read: z.boolean(), createdAt: instant })),
  codeAttempts: z.array(
    z.object({ userId: id, courseId: id, lessonId: id, submits: z.number().int().nonnegative(), runs: z.number().int().nonnegative(), passed: z.boolean(), bestScore: z.number().min(0).max(100), solutionViewed: z.boolean(), failedTests: z.record(z.string(), z.number().int().nonnegative()), updatedAt: instant }),
  ),
  conversations: z.array(
    z.object({ courseId: id, lessonId: id.nullable(), learnerId: id, lecturerId: id.nullable(), status: z.enum(["open", "resolved"]), fromAI: z.boolean(), aiContext: z.unknown(), messages: z.array(z.object({ from: z.enum(["learner", "lecturer"]), text: z.string().min(1), at: instant })).min(1), createdAt: instant }),
  ),
  feedbackSnippets: z.array(z.object({ lecturerId: id, title: z.string().min(1), text: z.string().min(1) })),
  courseReviews: z.array(
    z.object({
      courseId: id,
      round: z.number().int().positive(),
      status: z.enum(["in_review", "changes_requested", "rejected", "approved"]),
      submittedAt: instant,
      decidedAt: instant.nullable(),
      reviewerId: id.nullable(),
      note: z.string(),
      criteria: z.record(z.string(), z.object({ status: z.enum(["pass", "fix", "na"]), note: z.string() })),
      flags: z.array(
        z.object({ target: z.object({ type: z.string().min(1), lessonId: id.optional(), label: z.string().min(1) }), severity: z.enum(["must", "should"]), comment: z.string().min(1), status: z.enum(["open", "fixed", "closed"]), reply: z.string(), source: z.enum(["admin", "ai"]), at: instant }),
      ),
    }),
  ),
  hintUsage: z.array(z.object({ userId: id, courseId: id, lessonId: id, level: z.number().int().min(1).max(3), at: instant })),
});
export type MockupSnapshot = z.infer<typeof mockupSnapshot>;

// Contract from plans/261019-1349-mockup-seed-and-complete-js-course/plan.md (phase 2 → phase 1).
export const jsCourseContent = z.object({
  lessons: z.record(
    z.string(),
    z.object({
      videos: z.array(z.object({ youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/), title: z.string().min(1), durationSeconds: z.number().int().nonnegative() })).default([]),
      body: z.string().min(1).optional(),
    }),
  ),
});
export type JsCourseContent = z.infer<typeof jsCourseContent>;
export const youtubeWatchUrl = (youtubeId: string) => `https://www.youtube.com/watch?v=${youtubeId}`;

// ---------------------------------------------------------------- value rules
export function formatCourseDuration(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} phút`;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

// Mockup mastery is the 5-stop UI scale. Each stop maps to the midpoint of its BKT band in
// @codi-1/ui/lib/mastery (1 < 0.40 · 2 < 0.60 · 3 < 0.85 · 4 ≥ 0.85); stop 0 means no evidence.
const MASTERY_SEED = [
  { pMastery: 0.1, evidenceCount: 0, correctCount: 0 },
  { pMastery: 0.2, evidenceCount: 4, correctCount: 1 },
  { pMastery: 0.5, evidenceCount: 4, correctCount: 2 },
  { pMastery: 0.725, evidenceCount: 4, correctCount: 3 },
  { pMastery: 0.925, evidenceCount: 4, correctCount: 4 },
] as const;
export function masterySeed(level: number) {
  const seed = MASTERY_SEED[level];
  if (!Number.isInteger(level) || !seed) throw new RangeError(`Mức thành thạo không hợp lệ: ${level}`);
  return seed;
}

// Uses the recorded per-question answers when they reproduce the recorded score; otherwise the
// first round(score × n) questions are taken as correct so the score stays authoritative.
export function quizAnswerPattern(questionIds: string[], answers: Record<string, boolean>, score: number) {
  const n = questionIds.length;
  if (!n) return [];
  const recorded = questionIds.map((qid) => answers[qid]);
  if (recorded.every((a) => a !== undefined) && Math.round((100 * recorded.filter(Boolean).length) / n) === Math.round(score)) return recorded as boolean[];
  const correct = Math.round((score / 100) * n);
  return questionIds.map((_, i) => i < correct);
}

export type DiagnosticOutcome = "right" | "wrong" | "unknown";
// Strongest concepts get the right answers, weakest end up as "Tôi chưa biết" (stable order on ties).
export function diagnosticPattern(conceptIds: (string | null | undefined)[], mastery: Record<string, number>, counts: { right: number; wrong: number }) {
  const order = conceptIds.map((c, i) => ({ i, m: c ? (mastery[c] ?? 0) : 0 })).sort((a, b) => b.m - a.m || a.i - b.i);
  const result: DiagnosticOutcome[] = Array.from({ length: conceptIds.length }, () => "unknown");
  order.forEach(({ i }, rank) => {
    result[i] = rank < counts.right ? "right" : rank < counts.right + counts.wrong ? "wrong" : "unknown";
  });
  return result;
}

// Every submit fails except the last when the attempt passed; a test that failed k times is taken
// to have failed the first k submits. The last submit always carries the recorded score.
export function codingSubmitPlan(input: { submits: number; passed: boolean; bestScore: number; failedTests: Record<string, number>; testIds: string[] }) {
  const total = input.testIds.length;
  return Array.from({ length: input.submits }, (_, i) => {
    if (i === input.submits - 1) return { score: input.bestScore, isPassed: input.passed };
    const failing = Math.max(1, input.testIds.filter((t) => (input.failedTests[t] ?? 0) > i).length);
    return { score: total ? Math.round((100 * (total - Math.min(failing, total))) / total) : 0, isPassed: false };
  });
}

export function assignmentFormat(requiresFile: boolean, requiresLink: boolean) {
  if (requiresFile && requiresLink) return "file_or_link" as const;
  if (requiresFile) return "file" as const;
  if (requiresLink) return "link" as const;
  return "text" as const;
}
export function rubricText(items: { name: string; points: number; desc: string }[]) {
  return items.length ? items.map((r) => `- ${r.name} (${r.points} điểm): ${r.desc}`).join("\n") : null;
}

// Mockup voucher expiry is a calendar date; it stays valid through the end of that day in Vietnam.
export const endOfVietnamDay = (date: string) => new Date(`${date}T23:59:59+07:00`);
export const PAYMENT_WINDOW_MINUTES = 30;
export const paymentDeadline = (createdAt: Date) => new Date(createdAt.getTime() + PAYMENT_WINDOW_MINUTES * 60_000);

// n timestamps strictly between start and end, evenly spaced; one minute apart when the window is empty.
export function spreadTimestamps(start: Date, end: Date, n: number) {
  const span = end.getTime() - start.getTime();
  return Array.from({ length: n }, (_, i) => new Date(span > 0 ? start.getTime() + ((i + 1) * span) / (n + 1) : start.getTime() + (i + 1) * 60_000));
}

export type SeedCodingExercise = {
  fileName: string | null;
  tutorialSteps: TutorialStep[];
  title: string;
  instructions: string;
  language: string;
  starterCode: string;
  solutionCode: string | null;
  solutionVerifiedAt: Date | null;
  hints: string[];
  tests: { mockupId: string; name: string; input: string; expectedOutput: string; isSample: boolean }[];
};
// Preserve tutorial steps, starter files and solution gates independently of challenges.
export function codingExerciseFromMockup(lessonTitle: string, code: MockupCode): SeedCodingExercise {
  const toTest = (t: z.infer<typeof codeTest>, isSample: boolean) => ({ mockupId: t.id, name: t.name, input: t.call, expectedOutput: canonical(t.expected ?? null), isSample });
  if (code.kind === "challenge") {
    return {
      fileName: code.fileName ?? null,
      tutorialSteps: [],
      title: `Bài tập code: ${lessonTitle}`,
      instructions: code.instructions.map((step, i) => `${i + 1}. ${step}`).join("\n"),
      language: code.language,
      starterCode: code.starter,
      solutionCode: code.solution ?? null,
      solutionVerifiedAt: code.solution && code.solutionCheck?.ok ? new Date(code.solutionCheck.at) : null,
      hints: code.hints,
      tests: code.tests.map((t) => toTest(t, !t.hidden)),
    };
  }
  const steps = code.steps.filter((s) => !s.isSolution);
  const graded = steps.filter((s) => s.tests?.length);
  return {
    fileName: code.fileName ?? "main.js",
    tutorialSteps: code.steps.map((s) => ({ ...s, tests: s.tests?.map((t) => ({ name: t.name, input: t.call, expectedOutput: canonical(t.expected ?? null) })) })),
    title: `Hướng dẫn code: ${lessonTitle}`,
    instructions: "Đi hết các bước hướng dẫn để hoàn thành bài học.",
    language: code.language,
    starterCode: code.steps[0]!.starter,
    solutionCode: code.steps.find((s) => s.isSolution)?.starter ?? null,
    solutionVerifiedAt: null,
    hints: [],
    tests: graded.flatMap((s) => s.tests!.map((t) => toTest(t, true))),
  };
}

// The published knowledge map that learners read (courses.confirmed_knowledge_map). Mirrors the
// lecturer confirm action: declined items are dropped, pending suggestions block publication and the
// prerequisite graph must be acyclic. The publication id is derived from the content so re-runs keep
// the same id, which learner paths reference.
type KnowledgeReview = "suggested" | "accepted" | "edited" | "declined";
export function buildConfirmedKnowledgeMap(input: {
  courseId: string;
  contentGeneration: number;
  publishedAt: string;
  skills: { id: number; name: string; review: KnowledgeReview; bktPInit: number; bktPLearn: number; bktPGuess: number; bktPSlip: number }[];
  edges: { skillId: number; prerequisiteSkillId: number; review: KnowledgeReview }[];
  links: { lessonId: string; skillId: number }[];
}): ConfirmedKnowledgeMap {
  const pending = input.skills.filter((s) => s.review === "suggested").length + input.edges.filter((e) => e.review === "suggested").length;
  if (pending) throw new Error(`${input.courseId}: còn ${pending} đề xuất chưa xem lại, chưa thể xuất bản bản đồ.`);
  const live = input.skills.filter((s) => s.review !== "declined").sort((a, b) => a.id - b.id);
  if (!live.length) throw new Error(`${input.courseId}: cần ít nhất một khái niệm để xuất bản bản đồ.`);
  const liveIds = new Set(live.map((s) => s.id));
  const edges = input.edges
    .filter((e) => e.review !== "declined" && liveIds.has(e.skillId) && liveIds.has(e.prerequisiteSkillId))
    .map((e) => ({ from: e.prerequisiteSkillId, to: e.skillId }))
    .sort((a, b) => a.from - b.from || a.to - b.to);
  if (findCycle([...liveIds], edges)) throw new Error(`${input.courseId}: bản đồ còn vòng lặp, chưa thể xuất bản.`);
  const links = input.links
    .filter((l) => liveIds.has(l.skillId))
    .map(({ lessonId, skillId }) => ({ lessonId, skillId }))
    .sort((a, b) => a.lessonId.localeCompare(b.lessonId) || a.skillId - b.skillId);
  const content = {
    skills: live.map(({ id, name, bktPInit, bktPLearn, bktPGuess, bktPSlip }) => ({ id, name, bktPInit, bktPLearn, bktPGuess, bktPSlip })),
    edges,
    links,
  };
  return {
    version: 1,
    publicationId: stableUuid(`mockup:publication:${input.courseId}:${JSON.stringify(content)}`),
    contentGeneration: input.contentGeneration,
    publishedAt: input.publishedAt,
    ...content,
  };
}
