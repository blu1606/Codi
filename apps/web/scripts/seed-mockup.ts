import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, asc, eq, gte, inArray, isNull, like } from "drizzle-orm";
import { hashPassword } from "@codi-1/auth";
import { createDb, type Database } from "@codi-1/db";
import { account, user } from "@codi-1/db/schema/auth";
import { roles, userRoles } from "@codi-1/db/schema/roles";
import { courses } from "@codi-1/db/schema/courses";
import { courseChapters, courseDetails, courseLessons, lessonMaterials } from "@codi-1/db/schema/course-content";
import { lessonSkills, skillPrerequisites, skills } from "@codi-1/db/schema/knowledge-map";
import { orderEvents, orderItems, orders, vouchers } from "@codi-1/db/schema/commerce";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { assessmentAnswers, assessmentSubmissions, assessments, feedbackSnippets } from "@codi-1/db/schema/assessments";
import { seedQuizRevision } from "./seed-quiz-revision";
import { codingExercises, codingTestCases, codingWorkspaces } from "@codi-1/db/schema/coding-exercises";
import { enrollmentSkillMastery, lessonProgress, pathItems, personalizedLearningPaths } from "@codi-1/db/schema/learning";
import { learningPathCompletions } from "@codi-1/db/schema/learning-path-runtime";
import { conversationMessages, courseConversations, courseDiscussions, courseReviews, notifications } from "@codi-1/db/schema/interaction";
import { coursePublicationRequests, publicationReviewCriteria, publicationReviewFlags } from "@codi-1/db/schema/publication";
import { aiInteractionLogs } from "@codi-1/db/schema/ai-interaction-logs";
import {
  assignmentFormat,
  codingExerciseFromMockup,
  codingSubmitPlan,
  diagnosticPattern,
  endOfVietnamDay,
  formatCourseDuration,
  jsCourseContent,
  masterySeed,
  mockupChapterUuid,
  mockupLessonUuid,
  mockupSnapshot,
  paymentDeadline,
  quizAnswerPattern,
  rubricText,
  spreadTimestamps,
  youtubeWatchUrl,
  type MockupCourse,
  type MockupQuestion,
  type MockupSnapshot,
} from "./seed-mockup-mapping";

// Loads every seedable entity of the HTML prototype (scripts/data/mockup-seed.json, produced by
// export-mockup-data.mjs) into the development database. Idempotent: mockup ids are kept for users
// and courses, chapters/lessons get UUIDs derived from mockup ids, everything else is matched on a
// unique or natural key. Authored content is upserted; learner activity (orders, enrollments,
// progress, submissions, reviews, messages) is inserted only when absent so re-runs never overwrite
// what a demo account did in the app. Rows the seed did not create are never touched.
// Usage: pnpm db:seed-mockup            (everything)
//        pnpm db:seed-mockup --js-content-only   (re-apply scripts/data/js-course-content.json)

type Store = Pick<Database, "select" | "insert" | "update" | "delete">;
class SeedError extends Error {}

const SCRIPTS_DIR = resolve(process.cwd(), "scripts");
const SNAPSHOT_FILE = resolve(SCRIPTS_DIR, "data/mockup-seed.json");
const JS_CONTENT_FILE = resolve(SCRIPTS_DIR, "data/js-course-content.json");
const JS_COURSE_ID = "course-js-001";
const ROLE_IDS = { learner: "LEARNER", lecturer: "LECTURER", admin: "ADMIN" } as const;
const QUIZ_MAX_SCORE = 100;
const MINUTE = 60_000;

type QuestionRef = { id: number; conceptId?: string; options: { id: number; isCorrect: boolean }[] };
type LessonRef = {
  uuid: string;
  courseId: string;
  durationMin: number;
  quiz?: { id: number; quizRevision: number; passingScore: number; questions: QuestionRef[]; mockupIds: string[] };
  assignment?: { id: number; maxScore: number; passingScore: number };
  coding?: { assessmentId: number; exerciseId: number; starterCode: string; testIds: string[] };
};
type CourseRef = { course: MockupCourse; lessonIds: string[]; diagnostic?: { id: number; quizRevision: number; questions: QuestionRef[] }; skillIds: Map<string, number> };
type CatalogIndex = { courses: Map<string, CourseRef>; lessons: Map<string, LessonRef> };

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new SeedError(`Thiếu biến môi trường ${name}.`);
  return value;
}

function loadSnapshot(): MockupSnapshot {
  if (!existsSync(SNAPSHOT_FILE)) throw new SeedError("Không tìm thấy scripts/data/mockup-seed.json. Chạy lệnh từ apps/web và tạo lại bằng node scripts/export-mockup-data.mjs.");
  const parsed = mockupSnapshot.safeParse(JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8")));
  if (!parsed.success) throw new SeedError(`Dữ liệu mockup không hợp lệ: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

// Report the database's own reason (constraint, code) without echoing query parameters.
function describe(error: unknown): string {
  let current: unknown = error;
  while (current instanceof Error) {
    const pg = current as Error & { code?: string; constraint?: string };
    if (typeof pg.code === "string") return `${pg.message}${pg.constraint ? ` (ràng buộc ${pg.constraint})` : ""} [${pg.code}]`;
    if (!current.cause) break;
    current = current.cause;
  }
  if (error instanceof SeedError) return error.message;
  return error instanceof Error ? error.message.split("\n")[0]!.slice(0, 200) : "lỗi không xác định";
}

async function step<T>(label: string, run: () => Promise<T>): Promise<T> {
  console.log(`→ ${label}...`);
  try {
    return await run();
  } catch (error) {
    throw new SeedError(`Bước "${label}" thất bại: ${describe(error)}`);
  }
}

const lessonUuidOf = (mockupId: string | null | undefined) => (mockupId ? mockupLessonUuid(mockupId) : null);
const allLessons = (course: MockupCourse) => course.chapters.flatMap((chapter) => chapter.lessons);

// ---------------------------------------------------------------- users
async function seedUsers(db: Database, data: MockupSnapshot, password: string) {
  const ids = new Set(data.users.map((u) => u.id));
  const taken = await db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.email, data.users.map((u) => u.email)));
  const foreign = taken.filter((row) => !ids.has(row.id));
  if (foreign.length) throw new SeedError(`Email mẫu đã thuộc tài khoản khác, dừng để không ghi đè: ${foreign.map((row) => row.email).join(", ")}`);
  const hashed = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.insert(roles).values([{ roleId: "LEARNER", roleName: "Learner" }, { roleId: "LECTURER", roleName: "Lecturer" }, { roleId: "ADMIN", roleName: "Admin" }]).onConflictDoNothing();
    for (const u of data.users) {
      const banned = u.status === "inactive";
      const profile = { name: u.name, email: u.email, emailVerified: true, banned, banReason: banned ? "Tài khoản ngừng hoạt động (dữ liệu mẫu)." : null };
      await tx.insert(user).values({ id: u.id, ...profile, createdAt: new Date(u.createdAt) }).onConflictDoUpdate({ target: user.id, set: { ...profile, updatedAt: new Date() } });
      // Demo sign-in uses the shared seed password; emails are pre-verified so no OTP mail is sent.
      const [credential] = await tx.select({ id: account.id }).from(account).where(and(eq(account.userId, u.id), eq(account.providerId, "credential")));
      if (credential) await tx.update(account).set({ password: hashed, updatedAt: new Date() }).where(eq(account.id, credential.id));
      else await tx.insert(account).values({ id: `mockup-credential-${u.id}`, accountId: u.id, providerId: "credential", userId: u.id, password: hashed });
      await tx.insert(userRoles).values({ userId: u.id, roleId: ROLE_IDS[u.role], grantedAt: new Date(u.createdAt) }).onConflictDoNothing();
    }
  });
  console.log(`  ${data.users.length} tài khoản (đăng nhập bằng SEED_ACCOUNT_PASSWORD).`);
}

// ---------------------------------------------------------------- catalog
async function upsertAssessment(tx: Store, key: { courseId: string; lessonId: string | null; type: "quiz" | "assignment" | "coding" }, values: Omit<typeof assessments.$inferInsert, "courseId" | "lessonId" | "type" | "isDiagnostic">) {
  const isDiagnostic = key.lessonId === null;
  const where = isDiagnostic
    ? and(eq(assessments.courseId, key.courseId), eq(assessments.isDiagnostic, true))
    : and(eq(assessments.lessonId, key.lessonId!), eq(assessments.type, key.type), eq(assessments.isDiagnostic, false));
  const [existing] = await tx.select({ id: assessments.id }).from(assessments).where(where).orderBy(asc(assessments.id)).limit(1);
  if (existing) {
    await tx.update(assessments).set({ ...values, updatedAt: new Date() }).where(eq(assessments.id, existing.id));
    return existing.id;
  }
  const [created] = await tx.insert(assessments).values({ ...key, isDiagnostic, ...values }).returning({ id: assessments.id });
  return created!.id;
}

// Re-runs reuse identical content; changed mockup content publishes a complete immutable revision.
async function upsertQuestions(tx: Store, assessmentId: number, questions: MockupQuestion[], lessonFor: (q: MockupQuestion) => string | null) {
  const seeded = await seedQuizRevision(tx, assessmentId, questions.map((q) => ({
    lessonId: lessonFor(q), text: q.text, explanation: q.explanation ?? null,
    options: q.options.map((text, index) => ({ text, isCorrect: index === q.correctIndex })),
  })));
  return { quizRevision: seeded.quizRevision, questions: seeded.questions.map((question, index) => ({
    id: question.id, conceptId: questions[index]?.conceptId ?? undefined,
    options: question.options.map((option) => ({ id: option.id, isCorrect: option.isCorrect })),
  })) };
}

async function seedCourse(tx: Store, data: MockupSnapshot, course: MockupCourse, index: CatalogIndex) {
  const category = data.categories.find((c) => c.id === course.categoryId);
  if (!category) throw new SeedError(`Khoá ${course.id} trỏ tới danh mục không tồn tại ${course.categoryId}.`);
  const lessons = allLessons(course);
  const map = data.knowledgeMaps[course.id];
  const authored = {
    slug: course.slug,
    title: course.title,
    category: category.name,
    level: course.level,
    duration: formatCourseDuration(lessons.reduce((sum, l) => sum + l.durationMin, 0)),
    description: course.summary,
    price: course.price,
    instructorId: course.lecturerId,
    rating: course.rating,
    reviewCount: course.ratingCount,
    status: course.status,
    hiddenReason: course.status === "hidden" ? (course.hideReason ?? "Khoá học đang tạm ẩn.") : null,
    publishedAt: course.status === "published" && course.submittedAt ? new Date(course.submittedAt) : null,
    knowledgeMapStatus: map?.status ?? (course.concepts.length ? ("confirmed" as const) : ("empty" as const)),
    knowledgeMapGeneratedAt: map ? new Date(map.updatedAt) : null,
  };
  await tx.insert(courses).values({ id: course.id, ...authored }).onConflictDoUpdate({ target: courses.id, set: { ...authored, updatedAt: new Date() } });
  const details = { learningOutcomes: course.outcomes, requirements: course.requirements };
  await tx.insert(courseDetails).values({ courseId: course.id, ...details }).onConflictDoUpdate({ target: courseDetails.courseId, set: details });

  for (const [chapterPosition, chapter] of course.chapters.entries()) {
    const chapterId = mockupChapterUuid(chapter.id);
    const chapterValues = { courseId: course.id, title: chapter.title, position: chapterPosition, isPublished: true };
    await tx.insert(courseChapters).values({ id: chapterId, ...chapterValues }).onConflictDoUpdate({ target: courseChapters.id, set: chapterValues });
    for (const [position, lesson] of chapter.lessons.entries()) {
      const lessonValues = { chapterId, title: lesson.title, durationSeconds: lesson.durationMin * 60, position, isPublished: true, body: lesson.reading };
      await tx.insert(courseLessons).values({ id: mockupLessonUuid(lesson.id), ...lessonValues }).onConflictDoUpdate({ target: courseLessons.id, set: lessonValues });
    }
  }

  // Concepts: the course list plus the knowledge-map review state (the map wins on name/review).
  const concepts = new Map<string, { name: string; review: "suggested" | "accepted" | "edited" | "declined"; source: "ai" | "lecturer"; lessonIds: string[] }>();
  for (const c of course.concepts) concepts.set(c.id, { name: c.name, review: "accepted", source: "lecturer", lessonIds: [] });
  for (const c of map?.concepts ?? []) concepts.set(c.id, { name: c.name, review: c.review, source: "ai", lessonIds: c.lessonIds });
  const skillIds = new Map<string, number>();
  for (const [conceptId, c] of concepts) {
    const [row] = await tx.insert(skills).values({ courseId: course.id, name: c.name, review: c.review, source: c.source }).onConflictDoUpdate({ target: [skills.courseId, skills.name], set: { review: c.review, source: c.source, updatedAt: new Date() } }).returning({ id: skills.id });
    skillIds.set(conceptId, row!.id);
  }
  const edges = new Map<string, { from: string; to: string; review: "suggested" | "accepted" | "edited" | "declined" }>();
  for (const e of course.prerequisites) edges.set(`${e.from}>${e.to}`, { ...e, review: "accepted" });
  for (const e of map?.edges ?? []) edges.set(`${e.from}>${e.to}`, e);
  for (const e of edges.values()) {
    const skillId = skillIds.get(e.to);
    const prerequisiteSkillId = skillIds.get(e.from);
    if (!skillId || !prerequisiteSkillId || skillId === prerequisiteSkillId) continue;
    const source = concepts.get(e.to)!.source;
    await tx.insert(skillPrerequisites).values({ skillId, prerequisiteSkillId, review: e.review, source }).onConflictDoUpdate({ target: [skillPrerequisites.skillId, skillPrerequisites.prerequisiteSkillId], set: { review: e.review } });
  }
  const courseLessonIds = new Set(lessons.map((l) => l.id));
  const links = new Set<string>();
  for (const l of lessons) for (const c of l.conceptIds) links.add(`${l.id}|${c}`);
  for (const [conceptId, c] of concepts) for (const l of c.lessonIds) links.add(`${l}|${conceptId}`);
  for (const link of links) {
    const [lessonId, conceptId] = link.split("|") as [string, string];
    const skillId = skillIds.get(conceptId);
    if (skillId && courseLessonIds.has(lessonId)) await tx.insert(lessonSkills).values({ lessonId: mockupLessonUuid(lessonId), skillId }).onConflictDoNothing();
  }

  for (const lesson of lessons) {
    const lessonId = mockupLessonUuid(lesson.id);
    const ref: LessonRef = { uuid: lessonId, courseId: course.id, durationMin: lesson.durationMin };
    if (lesson.quiz) {
      const quizId = await upsertAssessment(tx, { courseId: course.id, lessonId, type: "quiz" }, { title: `Quiz: ${lesson.title}`, instructions: "Chọn một đáp án đúng cho mỗi câu.", maxScore: QUIZ_MAX_SCORE, passingScore: lesson.quiz.passingScore, status: "published" });
      ref.quiz = { id: quizId, passingScore: lesson.quiz.passingScore, mockupIds: lesson.quiz.questions.map((q) => q.id), ...await upsertQuestions(tx, quizId, lesson.quiz.questions, () => lessonId) };
    }
    if (lesson.assignment) {
      const a = lesson.assignment;
      const passingScore = Math.round((100 * a.passScore) / a.maxScore);
      const instructions = a.acceptedTypes ? `${a.instructions}\n\nĐịnh dạng tệp chấp nhận: ${a.acceptedTypes}.` : a.instructions;
      const assignmentId = await upsertAssessment(tx, { courseId: course.id, lessonId, type: "assignment" }, { title: `Bài tập: ${lesson.title}`, instructions, maxScore: a.maxScore, passingScore, dueDays: a.dueDays ?? null, submissionFormat: assignmentFormat(a.requiresFile, a.requiresLink), rubric: rubricText(a.rubric), status: "published" });
      ref.assignment = { id: assignmentId, maxScore: a.maxScore, passingScore };
    }
    if (lesson.code) {
      const exercise = codingExerciseFromMockup(lesson.title, lesson.code);
      const assessmentId = await upsertAssessment(tx, { courseId: course.id, lessonId, type: "coding" }, { title: exercise.title, instructions: exercise.instructions, maxScore: 100, status: "published" });
      const content = { language: exercise.language, fileName: exercise.fileName, tutorialSteps: exercise.tutorialSteps, starterCode: exercise.starterCode, hints: exercise.hints, solutionCode: exercise.solutionCode, solutionVerifiedAt: exercise.solutionVerifiedAt };
      const [row] = await tx.insert(codingExercises).values({ assessmentId, ...content }).onConflictDoUpdate({ target: codingExercises.assessmentId, set: { ...content, updatedAt: new Date() } }).returning({ id: codingExercises.id });
      for (const [position, t] of exercise.tests.entries()) {
        const test = { name: t.name, input: t.input, expectedOutput: t.expectedOutput, isSample: t.isSample };
        await tx.insert(codingTestCases).values({ exerciseId: row!.id, position, ...test }).onConflictDoUpdate({ target: [codingTestCases.exerciseId, codingTestCases.position], set: test });
      }
      ref.coding = { assessmentId, exerciseId: row!.id, starterCode: exercise.starterCode, testIds: exercise.tests.map((t) => t.mockupId) };
    }
    index.lessons.set(lesson.id, ref);
  }

  const courseRef: CourseRef = { course, lessonIds: lessons.map((l) => l.id), skillIds };
  if (course.entryTest) {
    // Diagnostic questions are evidence for the first lesson teaching their concept (BKT reads its skills).
    const lessonForConcept = (q: MockupQuestion) => lessonUuidOf(lessons.find((l) => q.conceptId && l.conceptIds.includes(q.conceptId))?.id);
    const diagnosticId = await upsertAssessment(tx, { courseId: course.id, lessonId: null, type: "quiz" }, { title: course.entryTest.title, instructions: "Trả lời để Codi xếp lộ trình phù hợp. Chọn \"Tôi chưa biết\" nếu bạn chưa học phần này.", maxScore: QUIZ_MAX_SCORE, status: "published" });
    courseRef.diagnostic = { id: diagnosticId, ...await upsertQuestions(tx, diagnosticId, course.entryTest.questions, lessonForConcept) };
  }
  index.courses.set(course.id, courseRef);
}

async function seedCatalog(db: Database, data: MockupSnapshot) {
  const index: CatalogIndex = { courses: new Map(), lessons: new Map() };
  for (const course of data.courses) {
    await db.transaction((tx) => seedCourse(tx, data, course, index));
    console.log(`  ${course.id}: ${course.chapters.length} chương, ${allLessons(course).length} bài.`);
  }
  return index;
}

// ---------------------------------------------------------------- commerce
async function seedCommerce(db: Database, data: MockupSnapshot) {
  const adminId = data.users.find((u) => u.role === "admin")?.id ?? null;
  const titles = new Map(data.courses.map((c) => [c.id, c.title]));
  await db.transaction(async (tx) => {
    for (const v of data.vouchers) {
      await tx.insert(vouchers).values({ code: v.code, type: v.type, value: v.value, minOrderAmount: v.minOrder, usageLimit: v.usageLimit, usedCount: v.used, expiresAt: v.expiresAt ? endOfVietnamDay(v.expiresAt) : null, isActive: v.active, createdBy: adminId }).onConflictDoNothing();
    }
    const voucherIds = new Map((await tx.select({ id: vouchers.id, code: vouchers.code }).from(vouchers).where(inArray(vouchers.code, data.vouchers.map((v) => v.code)))).map((v) => [v.code, v.id]));
    for (const o of data.orders) {
      const subtotal = o.items.reduce((sum, item) => sum + item.price, 0);
      if (subtotal - o.discount !== o.total) throw new SeedError(`Đơn ${o.code}: tổng tiền không khớp (${subtotal} - ${o.discount} ≠ ${o.total}).`);
      const createdAt = new Date(o.createdAt);
      const last = o.timeline.at(-1);
      const settled = o.status === "paid" || o.status === "refunded";
      await tx.insert(orders).values({
        code: o.code,
        userId: o.userId,
        voucherId: o.voucherCode ? (voucherIds.get(o.voucherCode) ?? null) : null,
        subtotal,
        discountAmount: o.discount,
        totalAmount: o.total,
        receivedAmount: settled ? o.total : 0,
        status: o.status,
        failReason: o.status === "failed" || o.status === "cancelled" ? (last?.label ?? null) : null,
        paymentDeadline: paymentDeadline(createdAt),
        createdAt,
        updatedAt: last ? new Date(last.at) : createdAt,
        paidAt: o.paidAt ? new Date(o.paidAt) : null,
        cancelledAt: o.status === "cancelled" && last ? new Date(last.at) : null,
      }).onConflictDoNothing();
      const [order] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.code, o.code));
      for (const item of o.items) {
        await tx.insert(orderItems).values({ orderId: order!.id, courseId: item.courseId, courseTitle: titles.get(item.courseId) ?? item.courseId, unitPrice: item.price }).onConflictDoNothing();
      }
      const events = await tx.select({ label: orderEvents.label, createdAt: orderEvents.createdAt }).from(orderEvents).where(eq(orderEvents.orderId, order!.id));
      const missing = o.timeline.filter((t) => !events.some((e) => e.label === t.label && e.createdAt.getTime() === new Date(t.at).getTime()));
      if (missing.length) await tx.insert(orderEvents).values(missing.map((t) => ({ orderId: order!.id, label: t.label, createdAt: new Date(t.at) })));
    }
  });
  console.log(`  ${data.vouchers.length} voucher, ${data.orders.length} đơn hàng.`);
}

// ---------------------------------------------------------------- learning
async function seedEnrollment(tx: Store, data: MockupSnapshot, index: CatalogIndex, e: MockupSnapshot["enrolments"][number]) {
  const courseRef = index.courses.get(e.courseId);
  if (!courseRef) throw new SeedError(`Ghi danh trỏ tới khoá không tồn tại ${e.courseId}.`);
  const { course } = courseRef;
  const seed = data.learnerSeed.userId === e.userId ? data.learnerSeed.courses[e.courseId] : undefined;
  const progress = data.learnerProgress.find((p) => p.userId === e.userId && p.courseId === e.courseId);
  const enrolledAt = new Date(e.enrolledAt);
  const lastActive = progress ? new Date(progress.lastActive) : enrolledAt;
  const completed = (seed?.completed ?? progress?.completed ?? []).filter((id) => index.lessons.get(id)?.courseId === e.courseId);
  const quizScores = seed?.quizScores ?? progress?.quizScores ?? {};
  const completedAt = new Map(completed.map((id, i) => [id, spreadTimestamps(enrolledAt, lastActive, completed.length)[i]!]));
  const allDone = completed.length === courseRef.lessonIds.length && completed.length > 0;
  const goalSetAt = new Date(enrolledAt.getTime() + 2 * MINUTE);
  const diagnosticAt = new Date(enrolledAt.getTime() + 10 * MINUTE);

  const [paidItem] = await tx.select({ id: orderItems.id }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.userId, e.userId), eq(orderItems.courseId, e.courseId), eq(orders.status, "paid"))).orderBy(asc(orders.createdAt)).limit(1);
  await tx.insert(studentEnrollments).values({
    userId: e.userId,
    courseId: e.courseId,
    enrolledAt,
    orderItemId: paidItem?.id ?? null,
    progress: courseRef.lessonIds.length ? Math.round((100 * completed.length) / courseRef.lessonIds.length) : 0,
    status: allDone ? "completed" : "active",
    completedAt: allDone ? lastActive : null,
    lastActiveAt: lastActive,
    lastLessonId: lessonUuidOf(seed?.currentLessonId ?? completed.at(-1)),
    ...(seed
      ? {
          learningGoal: seed.goal.goal,
          selfAssessedLevel: seed.goal.level,
          weeklyGoalMinutes: seed.goal.hours * 60,
          goalSetAt,
          diagnosticStatus: seed.diagnostic.status,
          diagnosticQuestionIndex: Math.max(0, (courseRef.diagnostic?.questions.length ?? 1) - 1),
          pathStatus: seed.pathStatus,
          pathSource: course.aiPath.length ? ("ai" as const) : ("default" as const),
        }
      : {}),
  }).onConflictDoNothing();
  const [enrollment] = await tx.select({ id: studentEnrollments.id }).from(studentEnrollments).where(and(eq(studentEnrollments.userId, e.userId), eq(studentEnrollments.courseId, e.courseId)));
  const enrollmentId = enrollment!.id;

  if (completed.length) {
    await tx.insert(lessonProgress).values(completed.map((id) => ({ enrollmentId, lessonId: mockupLessonUuid(id), status: "completed" as const, studiedAt: completedAt.get(id)!, firstStartedAt: completedAt.get(id)!, lastAccessedAt: completedAt.get(id)!, completedAt: completedAt.get(id)! }))).onConflictDoNothing();
    // Marks completions as processed so the path runtime does not replay them on first visit.
    await tx.insert(learningPathCompletions).values(completed.map((id) => ({ enrollmentId, lessonId: mockupLessonUuid(id), processedAt: completedAt.get(id)! }))).onConflictDoNothing();
  }

  for (const [lessonKey, score] of Object.entries(quizScores)) {
    const quiz = index.lessons.get(lessonKey)?.quiz;
    if (!quiz) { console.warn(`  Bỏ qua điểm quiz ${lessonKey}: bài không có quiz.`); continue; }
    const at = completedAt.get(lessonKey) ?? lastActive;
    const percent = Math.round(score);
    const [submission] = await tx.insert(assessmentSubmissions).values({ assessmentId: quiz.id, quizRevision: quiz.quizRevision, enrollmentId, attempt: 1, status: "graded", score: (QUIZ_MAX_SCORE * percent) / 100, quizPercent: percent, isPassed: percent >= quiz.passingScore, submittedAt: at, gradedAt: at, savedAt: at, createdAt: at }).onConflictDoNothing().returning({ id: assessmentSubmissions.id });
    if (!submission) continue;
    const pattern = quizAnswerPattern(quiz.mockupIds, progress?.answers ?? {}, score);
    await tx.insert(assessmentAnswers).values(quiz.questions.map((q, i) => {
      const correct = pattern[i]!;
      return { submissionId: submission.id, questionId: q.id, selectedOptionId: q.options.find((o) => o.isCorrect === correct)?.id ?? null, isCorrect: correct, earnedPoints: correct ? 1 : 0 };
    }));
  }

  if (seed) {
    let diagnosticSubmissionId: number | null = null;
    if (courseRef.diagnostic) {
      const questions = courseRef.diagnostic.questions;
      const outcomes = diagnosticPattern(questions.map((q) => q.conceptId), seed.mastery, seed.diagnostic);
      const right = outcomes.filter((o) => o === "right").length;
      const [created] = await tx.insert(assessmentSubmissions).values({ assessmentId: courseRef.diagnostic.id, quizRevision: courseRef.diagnostic.quizRevision, enrollmentId, attempt: 1, status: "graded", score: right, isPassed: null, submittedAt: diagnosticAt, gradedAt: diagnosticAt, savedAt: diagnosticAt, createdAt: diagnosticAt }).onConflictDoNothing().returning({ id: assessmentSubmissions.id });
      if (created) {
        await tx.insert(assessmentAnswers).values(questions.map((q, i) => {
          const outcome = outcomes[i]!;
          return { submissionId: created.id, questionId: q.id, selectedOptionId: outcome === "unknown" ? null : (q.options.find((o) => o.isCorrect === (outcome === "right"))?.id ?? null), isUnknown: outcome === "unknown", isCorrect: outcome === "unknown" ? null : outcome === "right", earnedPoints: outcome === "right" ? 1 : 0 };
        }));
      }
      const [existing] = await tx.select({ id: assessmentSubmissions.id }).from(assessmentSubmissions).where(and(eq(assessmentSubmissions.assessmentId, courseRef.diagnostic.id), eq(assessmentSubmissions.enrollmentId, enrollmentId), eq(assessmentSubmissions.attempt, 1)));
      diagnosticSubmissionId = existing?.id ?? null;
    }
    for (const [conceptId, level] of Object.entries(seed.mastery)) {
      const skillId = courseRef.skillIds.get(conceptId);
      if (!skillId) { console.warn(`  Bỏ qua mức thành thạo ${conceptId}: khái niệm không thuộc ${e.courseId}.`); continue; }
      await tx.insert(enrollmentSkillMastery).values({ enrollmentId, skillId, ...masterySeed(level), lastAssessedAt: level ? diagnosticAt : null }).onConflictDoNothing();
    }
    if (seed.pathStatus === "ready") {
      const ai = course.aiPath.length > 0;
      const [path] = await tx.insert(personalizedLearningPaths).values({ enrollmentId, version: 1, status: "active", trigger: ai ? "diagnostic_completed" : "default_order", sourceSubmissionId: diagnosticSubmissionId, generatedBy: ai ? "ai" : "system", aiRationale: ai ? "Lộ trình được sắp theo mục tiêu học và kết quả bài kiểm tra đầu vào của bạn." : null, createdAt: diagnosticAt }).onConflictDoNothing().returning({ id: personalizedLearningPaths.id });
      if (path) {
        const steps = ai ? course.aiPath : courseRef.lessonIds.map((lessonId) => ({ lessonId, skippable: false, reason: "Theo thứ tự mặc định của giảng viên." }));
        const known = steps.filter((s) => index.lessons.get(s.lessonId)?.courseId === e.courseId);
        if (known.length) await tx.insert(pathItems).values(known.map((s, i) => ({ pathId: path.id, lessonId: mockupLessonUuid(s.lessonId), position: i + 1, isSkippable: s.skippable, reason: s.reason, estimatedMinutes: index.lessons.get(s.lessonId)!.durationMin })));
      }
    }
  }

  // Assignment submissions: learnerSeed wins over the shared submissions list for the same lesson.
  const seeded = Object.entries(seed?.assignments ?? {}).map(([lessonId, s]) => ({ ...s, lessonId }));
  const shared = data.submissions.filter((s) => s.userId === e.userId && s.courseId === e.courseId && !seed?.assignments[s.lessonId]);
  const byLesson = new Map<string, typeof seeded>();
  for (const s of [...shared, ...seeded]) byLesson.set(s.lessonId, [...(byLesson.get(s.lessonId) ?? []), s]);
  for (const [lessonKey, list] of byLesson) {
    const assignment = index.lessons.get(lessonKey)?.assignment;
    if (!assignment) { console.warn(`  Bỏ qua bài nộp ${lessonKey}: bài không có bài tập.`); continue; }
    for (const [i, s] of list.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).entries()) {
      const graded = s.status === "graded";
      if (graded && (s.score === null || s.score === undefined)) { console.warn(`  Bỏ qua bài nộp ${lessonKey}: đã chấm nhưng thiếu điểm.`); continue; }
      const submittedAt = new Date(s.submittedAt);
      await tx.insert(assessmentSubmissions).values({
        assessmentId: assignment.id,
        enrollmentId,
        attempt: i + 1,
        status: s.status,
        answerText: s.note || null,
        linkUrl: s.link ?? null,
        fileName: s.fileName ?? null,
        score: graded ? s.score! : null,
        isPassed: graded ? (100 * s.score!) / assignment.maxScore >= assignment.passingScore : null,
        gradedBy: graded ? course.lecturerId : null,
        gradedAt: graded && s.gradedAt ? new Date(s.gradedAt) : null,
        feedback: s.feedback || null,
        submittedAt,
        savedAt: submittedAt,
        createdAt: submittedAt,
      }).onConflictDoNothing();
    }
  }

  for (const attempt of data.codeAttempts.filter((a) => a.userId === e.userId && a.courseId === e.courseId)) {
    const coding = index.lessons.get(attempt.lessonId)?.coding;
    if (!coding) { console.warn(`  Bỏ qua lượt code ${attempt.lessonId}: bài không có bài tập code.`); continue; }
    // The app counts every run and submit as a run, so only the remainder become "run" rows.
    const runRows = Math.max(0, attempt.runs - attempt.submits);
    const submits = codingSubmitPlan({ submits: attempt.submits, passed: attempt.passed, bestScore: attempt.bestScore, failedTests: attempt.failedTests, testIds: coding.testIds });
    const times = spreadTimestamps(enrolledAt, new Date(attempt.updatedAt), runRows + submits.length);
    const rows = [
      ...Array.from({ length: runRows }, () => ({ mode: "run" as const, score: 0, isPassed: null })),
      ...submits.map((s) => ({ mode: "submit" as const, score: s.score, isPassed: s.isPassed })),
    ];
    if (rows.length) {
      await tx.insert(assessmentSubmissions).values(rows.map((r, i) => ({ assessmentId: coding.assessmentId, enrollmentId, attempt: i + 1, mode: r.mode, answerText: coding.starterCode, status: "graded" as const, score: r.score, isPassed: r.isPassed, codingRun: { phase: "done" as const, logs: [], durationMs: 0, line: null }, submittedAt: times[i]!, gradedAt: times[i]!, savedAt: times[i]!, createdAt: times[i]! }))).onConflictDoNothing();
    }
    if (attempt.solutionViewed) await tx.insert(codingWorkspaces).values({ exerciseId: coding.exerciseId, enrollmentId, draft: coding.starterCode, solutionViewed: true }).onConflictDoNothing();
  }
}

async function seedLearning(db: Database, data: MockupSnapshot, index: CatalogIndex) {
  for (const e of data.enrolments) await db.transaction((tx) => seedEnrollment(tx, data, index, e));
  console.log(`  ${data.enrolments.length} ghi danh kèm tiến độ, bài nộp và lộ trình.`);
}

// ---------------------------------------------------------------- interactions
async function enrollmentIdOf(tx: Store, userId: string, courseId: string) {
  const [row] = await tx.select({ id: studentEnrollments.id }).from(studentEnrollments).where(and(eq(studentEnrollments.userId, userId), eq(studentEnrollments.courseId, courseId)));
  return row?.id ?? null;
}

async function seedInteractions(db: Database, data: MockupSnapshot) {
  const lecturerOf = new Map(data.courses.map((c) => [c.id, c.lecturerId]));
  await db.transaction(async (tx) => {
    for (const r of data.reviews) {
      const enrollmentId = await enrollmentIdOf(tx, r.userId, r.courseId);
      if (!enrollmentId) { console.warn(`  Bỏ qua đánh giá của ${r.userId}: chưa ghi danh ${r.courseId}.`); continue; }
      const createdAt = new Date(r.createdAt);
      await tx.insert(courseReviews).values({ courseId: r.courseId, enrollmentId, rating: r.stars, text: r.text || null, lecturerReply: r.reply?.text ?? null, repliedBy: r.reply ? (lecturerOf.get(r.courseId) ?? null) : null, repliedAt: r.reply ? new Date(r.reply.at) : null, createdAt }).onConflictDoNothing();
    }

    for (const q of data.questions) {
      const createdAt = new Date(q.createdAt);
      const [existing] = await tx.select({ id: courseDiscussions.id }).from(courseDiscussions).where(and(eq(courseDiscussions.courseId, q.courseId), eq(courseDiscussions.authorId, q.userId), eq(courseDiscussions.body, q.text), isNull(courseDiscussions.parentId)));
      const rootId = existing?.id ?? (await tx.insert(courseDiscussions).values({ courseId: q.courseId, lessonId: lessonUuidOf(q.lessonId), authorId: q.userId, body: q.text, status: q.status, createdAt }).returning({ id: courseDiscussions.id }))[0]!.id;
      for (const reply of q.replies) {
        const [found] = await tx.select({ id: courseDiscussions.id }).from(courseDiscussions).where(and(eq(courseDiscussions.parentId, rootId), eq(courseDiscussions.authorId, reply.userId), eq(courseDiscussions.body, reply.text)));
        if (!found) await tx.insert(courseDiscussions).values({ courseId: q.courseId, lessonId: lessonUuidOf(q.lessonId), parentId: rootId, authorId: reply.userId, body: reply.text, isLecturerReply: reply.isLecturer, createdAt: new Date(reply.at) });
      }
    }

    for (const c of data.conversations) {
      const createdAt = new Date(c.createdAt);
      const lastLecturer = c.messages.filter((m) => m.from === "lecturer").at(-1);
      const resolved = c.status === "resolved" && c.lecturerId && lastLecturer;
      if (c.status === "resolved" && !resolved) console.warn(`  Hội thoại ${c.courseId}/${c.learnerId} chưa có trả lời của giảng viên, lưu ở trạng thái mở.`);
      const [existing] = await tx.select({ id: courseConversations.id }).from(courseConversations).where(and(eq(courseConversations.courseId, c.courseId), eq(courseConversations.learnerId, c.learnerId), eq(courseConversations.createdAt, createdAt)));
      const conversationId = existing?.id ?? (await tx.insert(courseConversations).values({
        courseId: c.courseId,
        lessonId: lessonUuidOf(c.lessonId),
        learnerId: c.learnerId,
        lecturerId: c.lecturerId,
        status: resolved ? "resolved" : "open",
        fromAi: c.fromAI,
        aiContext: c.aiContext ?? null,
        resolvedBy: resolved ? c.lecturerId : null,
        resolvedAt: resolved ? new Date(lastLecturer.at) : null,
        createdAt,
        updatedAt: new Date(c.messages.at(-1)!.at),
      }).returning({ id: courseConversations.id }))[0]!.id;
      const stored = await tx.select({ authorId: conversationMessages.authorId, createdAt: conversationMessages.createdAt }).from(conversationMessages).where(eq(conversationMessages.conversationId, conversationId));
      for (const m of c.messages) {
        const authorId = m.from === "lecturer" ? c.lecturerId : c.learnerId;
        if (!authorId) { console.warn("  Bỏ qua tin nhắn giảng viên: hội thoại chưa gán giảng viên."); continue; }
        const at = new Date(m.at);
        if (stored.some((s) => s.authorId === authorId && s.createdAt.getTime() === at.getTime())) continue;
        await tx.insert(conversationMessages).values({ conversationId, authorId, isLecturer: m.from === "lecturer", body: m.text, createdAt: at });
      }
    }

    for (const f of data.feedbackSnippets) {
      const [existing] = await tx.select({ id: feedbackSnippets.id }).from(feedbackSnippets).where(and(eq(feedbackSnippets.lecturerId, f.lecturerId), eq(feedbackSnippets.title, f.title)));
      if (!existing) await tx.insert(feedbackSnippets).values({ lecturerId: f.lecturerId, title: f.title, body: f.text });
    }

    for (const n of data.notifications) {
      const createdAt = new Date(n.createdAt);
      const [existing] = await tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, n.userId), eq(notifications.title, n.title), eq(notifications.createdAt, createdAt)));
      if (!existing) await tx.insert(notifications).values({ userId: n.userId, title: n.title, body: n.body ?? null, link: n.link ?? null, readAt: n.read ? createdAt : null, createdAt });
    }

    for (const h of data.hintUsage) {
      const createdAt = new Date(h.at);
      const lessonId = mockupLessonUuid(h.lessonId);
      const [existing] = await tx.select({ id: aiInteractionLogs.id }).from(aiInteractionLogs).where(and(eq(aiInteractionLogs.userId, h.userId), eq(aiInteractionLogs.lessonId, lessonId), eq(aiInteractionLogs.requestType, "ask_assistant"), eq(aiInteractionLogs.createdAt, createdAt)));
      if (!existing) await tx.insert(aiInteractionLogs).values({ userId: h.userId, enrollmentId: await enrollmentIdOf(tx, h.userId, h.courseId), courseId: h.courseId, lessonId, requestType: "ask_assistant", hintLevel: h.level, createdAt });
    }
  });
  console.log(`  ${data.reviews.length} đánh giá, ${data.questions.length} câu hỏi, ${data.conversations.length} hội thoại, ${data.feedbackSnippets.length} mẫu nhận xét, ${data.notifications.length} thông báo, ${data.hintUsage.length} lượt gợi ý AI.`);
}

// ---------------------------------------------------------------- publication review rounds
async function seedPublication(db: Database, data: MockupSnapshot) {
  const lecturerOf = new Map(data.courses.map((c) => [c.id, c.lecturerId]));
  await db.transaction(async (tx) => {
    for (const r of data.courseReviews) {
      const requestedBy = lecturerOf.get(r.courseId);
      if (!requestedBy) throw new SeedError(`Vòng duyệt trỏ tới khoá không tồn tại ${r.courseId}.`);
      const decided = r.status !== "in_review";
      if (decided && (!r.reviewerId || !r.decidedAt)) throw new SeedError(`Vòng duyệt ${r.courseId}#${r.round} đã quyết định nhưng thiếu người duyệt hoặc thời điểm.`);
      const requestedAt = new Date(r.submittedAt);
      await tx.insert(coursePublicationRequests).values({
        courseId: r.courseId,
        round: r.round,
        requestedBy,
        reviewedBy: decided ? r.reviewerId : null,
        validationStatus: "passed",
        validatedAt: requestedAt,
        status: r.status,
        reviewNote: r.note || (r.status === "changes_requested" || r.status === "rejected" ? "Cần chỉnh sửa theo các ghi chú." : null),
        requestedAt,
        reviewedAt: decided ? new Date(r.decidedAt!) : null,
      }).onConflictDoNothing();
      const [request] = await tx.select({ id: coursePublicationRequests.id }).from(coursePublicationRequests).where(and(eq(coursePublicationRequests.courseId, r.courseId), eq(coursePublicationRequests.round, r.round)));
      if (!request) { console.warn(`  Bỏ qua vòng duyệt ${r.courseId}#${r.round}: khoá đã có vòng đang mở khác.`); continue; }
      const criteria = Object.entries(r.criteria);
      if (criteria.length) await tx.insert(publicationReviewCriteria).values(criteria.map(([criterionId, c]) => ({ requestId: request.id, criterionId, status: c.status, note: c.note || null }))).onConflictDoNothing();
      for (const f of r.flags) {
        const [existing] = await tx.select({ id: publicationReviewFlags.id }).from(publicationReviewFlags).where(and(eq(publicationReviewFlags.requestId, request.id), eq(publicationReviewFlags.comment, f.comment)));
        if (!existing) await tx.insert(publicationReviewFlags).values({ requestId: request.id, targetType: f.target.type, lessonId: lessonUuidOf(f.target.lessonId), targetLabel: f.target.label, severity: f.severity, comment: f.comment, status: f.status, lecturerReply: f.reply || null, source: f.source, createdAt: new Date(f.at), updatedAt: new Date(f.at) });
      }
    }
  });
  console.log(`  ${data.courseReviews.length} vòng duyệt xuất bản.`);
}

// ---------------------------------------------------------------- JavaScript course content
// Re-runnable on its own (--js-content-only): reading bodies and embedded YouTube videos from the
// phase-2 dataset replace the prototype placeholders of course-js-001.
export async function seedJsCourseContent(db: Database, data: MockupSnapshot) {
  if (!existsSync(JS_CONTENT_FILE)) {
    console.log("  Bỏ qua: chưa có scripts/data/js-course-content.json.");
    return;
  }
  const parsed = jsCourseContent.safeParse(JSON.parse(readFileSync(JS_CONTENT_FILE, "utf8")));
  if (!parsed.success) throw new SeedError(`js-course-content.json không hợp lệ: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const jsCourse = data.courses.find((c) => c.id === JS_COURSE_ID);
  if (!jsCourse) throw new SeedError(`Không tìm thấy ${JS_COURSE_ID} trong dữ liệu mockup.`);
  const lessonKeys = new Set(allLessons(jsCourse).map((l) => l.id));
  let bodies = 0;
  let videos = 0;
  await db.transaction(async (tx) => {
    for (const [lessonKey, entry] of Object.entries(parsed.data.lessons)) {
      if (!lessonKeys.has(lessonKey)) { console.warn(`  Bỏ qua ${lessonKey}: không thuộc ${JS_COURSE_ID}.`); continue; }
      const lessonId = mockupLessonUuid(lessonKey);
      const [lesson] = await tx.select({ id: courseLessons.id }).from(courseLessons).where(eq(courseLessons.id, lessonId));
      if (!lesson) throw new SeedError(`Bài ${lessonKey} chưa có trong cơ sở dữ liệu; chạy seed đầy đủ trước.`);
      if (entry.body) { await tx.update(courseLessons).set({ body: entry.body }).where(eq(courseLessons.id, lessonId)); bodies++; }
      for (const [position, video] of entry.videos.entries()) {
        const material = { type: "video" as const, title: video.title, url: youtubeWatchUrl(video.youtubeId), durationSeconds: video.durationSeconds };
        await tx.insert(lessonMaterials).values({ lessonId, position, ...material }).onConflictDoUpdate({ target: [lessonMaterials.lessonId, lessonMaterials.position], set: material });
        videos++;
      }
      // Only YouTube rows this seed wrote at positions the dataset no longer uses are removed.
      await tx.delete(lessonMaterials).where(and(eq(lessonMaterials.lessonId, lessonId), gte(lessonMaterials.position, entry.videos.length), like(lessonMaterials.url, "https://www.youtube.com/watch?v=%")));
    }
  });
  console.log(`  ${bodies} bài đọc, ${videos} video YouTube cho ${JS_COURSE_ID}.`);
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new SeedError("Không chạy seed dữ liệu mẫu trên môi trường production.");
  const databaseUrl = requireEnv("DATABASE_URL");
  const jsContentOnly = process.argv.includes("--js-content-only");
  const password = jsContentOnly ? "" : requireEnv("SEED_ACCOUNT_PASSWORD");
  const data = loadSnapshot();
  const db = createDb({ DATABASE_URL: databaseUrl });
  try {
    if (!jsContentOnly) {
      await step("Tài khoản mẫu", () => seedUsers(db, data, password));
      const index = await step("Khoá học, bài học, bản đồ kiến thức và bài kiểm tra", () => seedCatalog(db, data));
      await step("Voucher và đơn hàng", () => seedCommerce(db, data));
      await step("Ghi danh, tiến độ và lộ trình", () => seedLearning(db, data, index));
      await step("Đánh giá, hỏi đáp, hội thoại và thông báo", () => seedInteractions(db, data));
      await step("Vòng duyệt xuất bản", () => seedPublication(db, data));
    }
    await step("Nội dung khoá JavaScript", () => seedJsCourseContent(db, data));
    console.log("Đã nạp dữ liệu mockup. Có thể chạy lại an toàn.");
  } finally {
    await db.$client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof SeedError ? error.message : `Seed dữ liệu mockup thất bại: ${describe(error)}`);
  process.exitCode = 1;
});
