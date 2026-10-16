import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import type { Database } from "@codi-1/db";
import { courses } from "@codi-1/db/schema/courses";
import { courseChapters, courseLessons } from "@codi-1/db/schema/course-content";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { enrollmentSkillMastery, lessonProgress, pathItems, personalizedLearningPaths } from "@codi-1/db/schema/learning";
import { learningPathCompletions, learningPathEvidence, learningPathJobs } from "@codi-1/db/schema/learning-path-runtime";
import { lessonSkills, skillPrerequisites, skills } from "@codi-1/db/schema/knowledge-map";
import { assessmentAnswers, assessmentSubmissions, assessments, quizQuestions } from "@codi-1/db/schema/assessments";
import { aiInteractionLogs } from "@codi-1/db/schema/ai-interaction-logs";
import { courseReviews } from "@codi-1/db/schema/interaction";
import { updateBkt } from "./onboarding-contract";
import { saveCourseReview } from "./course-review-service";
import { constrainPath, defaultPathItems as defaultItems, generationOutcome, graphLayers, LearningPathError, levelOf, lockInfo, pathDiff, pathProposal, selectPath, type CoursePathView, type KnowledgeMapView, type LearningPathCommand, type PathInput, type PathItem, type PathProposal } from "./learning-path-contract";

type Store = Pick<Database, "select" | "insert" | "update">;
type GenerationResult = { proposal: PathProposal; model: string; promptTokens?: number; completionTokens?: number };
export type PathGenerator = (input: PathInput, signal: AbortSignal) => Promise<GenerationResult>;
const inputHash = (input: PathInput) => createHash("sha256").update(JSON.stringify(input)).digest("hex");

async function requireLearner(store: Store, userId: string) {
  if (!(await getActiveRoles(store as Database, userId)).includes(ROLE.LEARNER)) throw new LearningPathError("Bạn không có quyền học viên đang hoạt động.", 403);
}
async function context(store: Store, userId: string, courseId: string, lock = false) {
  await requireLearner(store, userId);
  const query = store.select().from(studentEnrollments).where(and(eq(studentEnrollments.userId, userId), eq(studentEnrollments.courseId, courseId)));
  const [enrollment] = await (lock ? query.for("update") : query);
  if (!enrollment || enrollment.status === "suspended") throw new LearningPathError("Bạn chưa có quyền học khoá học này.", 403);
  const [course] = await store.select().from(courses).where(eq(courses.id, courseId));
  if (!course) throw new LearningPathError("Không tìm thấy khoá học.", 404);
  const lessons = await store.select({ lesson: courseLessons, chapter: courseChapters, progress: lessonProgress }).from(courseLessons)
    .innerJoin(courseChapters, eq(courseLessons.chapterId, courseChapters.id))
    .leftJoin(lessonProgress, and(eq(lessonProgress.lessonId, courseLessons.id), eq(lessonProgress.enrollmentId, enrollment.id)))
    .where(and(eq(courseChapters.courseId, courseId), eq(courseChapters.isPublished, true), eq(courseLessons.isPublished, true)))
    .orderBy(asc(courseChapters.position), asc(courseChapters.id), asc(courseLessons.position), asc(courseLessons.id));
  const concepts = await store.select({ skill: skills, mastery: enrollmentSkillMastery }).from(skills)
    .leftJoin(enrollmentSkillMastery, and(eq(enrollmentSkillMastery.skillId, skills.id), eq(enrollmentSkillMastery.enrollmentId, enrollment.id)))
    .where(and(eq(skills.courseId, courseId), inArray(skills.review, ["accepted", "edited"]))).orderBy(asc(skills.id));
  const conceptIds = concepts.map((c) => c.skill.id);
  const edges = conceptIds.length ? await store.select().from(skillPrerequisites).where(and(inArray(skillPrerequisites.skillId, conceptIds), inArray(skillPrerequisites.prerequisiteSkillId, conceptIds), inArray(skillPrerequisites.review, ["accepted", "edited"]))).orderBy(asc(skillPrerequisites.skillId), asc(skillPrerequisites.prerequisiteSkillId)) : [];
  const links = lessons.length && conceptIds.length ? await store.select().from(lessonSkills).where(and(inArray(lessonSkills.lessonId, lessons.map((l) => l.lesson.id)), inArray(lessonSkills.skillId, conceptIds))).orderBy(asc(lessonSkills.skillId)) : [];
  const [path] = await store.select().from(personalizedLearningPaths).where(and(eq(personalizedLearningPaths.enrollmentId, enrollment.id), eq(personalizedLearningPaths.status, "active")));
  const items = path ? await store.select().from(pathItems).where(eq(pathItems.pathId, path.id)).orderBy(asc(pathItems.position)) : [];
  const input: PathInput = {
    goal: enrollment.learningGoal, level: enrollment.selfAssessedLevel, hours: enrollment.weeklyGoalMinutes ? enrollment.weeklyGoalMinutes / 60 : null,
    lessons: lessons.map(({ lesson, chapter, progress }) => ({ id: lesson.id, title: lesson.title, chapterId: chapter.id, chapterTitle: chapter.title, durationSeconds: lesson.durationSeconds, skillIds: links.filter((l) => l.lessonId === lesson.id).map((l) => l.skillId), progress: progress?.status ?? "not_started", studied: !!progress?.studiedAt })),
    concepts: concepts.map(({ skill, mastery }) => ({ id: skill.id, name: skill.name, probability: mastery?.evidenceCount ? mastery.pMastery : null, evidenceCount: mastery?.evidenceCount ?? 0 })),
    edges: edges.map((e) => ({ from: e.prerequisiteSkillId, to: e.skillId })),
    previous: items.map((p) => ({ lessonId: p.lessonId, reason: p.reason ?? "Theo thứ tự bài học tiên quyết.", isSkippable: p.isSkippable })),
  };
  return { enrollment, course, path, input, skills: concepts.map((c) => c.skill) };
}
type Context = Awaited<ReturnType<typeof context>>;

export async function assertLearningLessonAccess(store: Store, userId: string, courseId: string, lessonId: string, lockEnrollment = false) {
  const ctx = await context(store, userId, courseId, lockEnrollment);
  if (ctx.enrollment.pathStatus === "none") throw new LearningPathError("Hãy thiết lập lộ trình trước khi học.");
  const lesson = ctx.input.lessons.find((l) => l.id === lessonId);
  if (!lesson) throw new LearningPathError("Không tìm thấy bài học.", 404);
  const lock = lockInfo(ctx.input, lesson);
  if (lesson.progress !== "completed" && lock) throw new LearningPathError(`Cần học trước: ${lock.concept} (${lock.lessonTitle}).`, 403);
  return lesson;
}

async function view(store: Store, ctx: Context): Promise<CoursePathView> {
  const { enrollment: e, course, input, path } = ctx;
  const selected = selectPath(input, path ? input.previous : defaultItems(input), e.pathSource);
  const [review] = await store.select({ rating: courseReviews.rating, text: courseReviews.text }).from(courseReviews).where(eq(courseReviews.enrollmentId, e.id));
  const [pending] = await store.select({ id: learningPathJobs.id }).from(learningPathJobs).where(and(eq(learningPathJobs.enrollmentId, e.id), isNull(learningPathJobs.finishedAt))).limit(1);
  const owned = await store.select({ courseId: studentEnrollments.courseId }).from(studentEnrollments).where(eq(studentEnrollments.userId, e.userId));
  const [recommendation] = selected.complete ? await store.select({ title: courses.title, slug: courses.slug }).from(courses).where(and(eq(courses.status, "published"), ne(courses.id, course.id), ...owned.map((o) => ne(courses.id, o.courseId)))).orderBy(desc(courses.rating), asc(courses.id)).limit(1) : [];
  return { ...selected, course: { id: course.id, title: course.title, slug: course.slug }, status: e.pathStatus, source: e.pathSource,
    goal: e.learningGoal, hours: input.hours, goalEditing: e.goalEditing, diagnosticStatus: e.diagnosticStatus,
    showDiagnosticCard: e.pathSource === "default" && e.pathStatus === "ready" && e.diagnosticStatus === "skipped" && !e.diagnosticCardDismissedAt,
    pathId: path?.id ?? null, rationale: path?.aiRationale ?? null, updating: !!pending,
    highlights: path?.highlightsSeenAt ? [] : path?.updateSummary?.changes.map((c) => c.lessonId) ?? [],
    update: path?.updateDismissedAt ? null : path?.updateSummary ?? null,
    review: review ?? null, recommendation: recommendation ?? null };
}

async function persistPath(store: Store, ctx: Context, items: PathItem[], options: {
  generatedBy: "ai" | "system"; trigger: typeof personalizedLearningPaths.$inferInsert.trigger;
  failed?: boolean; model?: string; rationale?: string; afterLessonId?: string | null;
}) {
  const { enrollment: e, input, path } = ctx;
  const [latest] = await store.select({ version: personalizedLearningPaths.version }).from(personalizedLearningPaths).where(eq(personalizedLearningPaths.enrollmentId, e.id)).orderBy(desc(personalizedLearningPaths.version)).limit(1);
  if (path) await store.update(personalizedLearningPaths).set({ status: "superseded", supersededAt: new Date() }).where(eq(personalizedLearningPaths.id, path.id));
  const changes = pathDiff(input, items);
  // Completion can unlock rows even when their relative order does not change.
  if (options.afterLessonId) {
    const priorInput = { ...input, lessons: input.lessons.map((l) => l.id === options.afterLessonId ? { ...l, progress: "in_progress" as const } : l) };
    for (const lesson of input.lessons) {
      if (lesson.progress !== "completed" && lockInfo(priorInput, lesson) && !lockInfo(input, lesson)) changes.push({ lessonId: lesson.id, type: "unlocked", text: `${lesson.title} đã mở khoá sau khi hoàn thành bài tiên quyết.` });
    }
  }
  const summary = options.trigger === "lesson_completed" || path && changes.length ? { afterLessonId: options.afterLessonId ?? null, changes,
    message: changes.length ? "Codi đã điều chỉnh các bài chưa hoàn thành theo tiến độ của bạn." : options.generatedBy === "ai" ? "Thứ tự các bài còn lại giữ nguyên vì vẫn phù hợp với mức thành thạo của bạn." : "Bạn đang học theo thứ tự mặc định của khoá học. Mức thành thạo đã được cập nhật từ kết quả làm bài." } : null;
  const [created] = await store.insert(personalizedLearningPaths).values({ enrollmentId: e.id, version: (latest?.version ?? 0) + 1, generatedBy: options.generatedBy, trigger: options.trigger, aiModel: options.model, aiRationale: options.rationale, masterySnapshotHash: inputHash(input), updateSummary: summary }).returning();
  if (!created) throw new LearningPathError("Không thể lưu lộ trình.", 500);
  if (items.length) await store.insert(pathItems).values(items.map((item, index) => ({ ...item, pathId: created.id, position: index + 1, estimatedMinutes: Math.ceil((input.lessons.find((l) => l.id === item.lessonId)?.durationSeconds ?? 0) / 60) })));
  const selected = selectPath(input, items, options.generatedBy === "ai" ? "ai" : "default");
  await store.update(studentEnrollments).set({ pathStatus: options.failed ? "failed" : "ready", pathSource: options.generatedBy === "ai" ? "ai" : "default", progress: selected.percent,
    ...(selected.complete ? { status: "completed" as const, completedAt: e.completedAt ?? new Date() } : {}) }).where(eq(studentEnrollments.id, e.id));
  return created;
}

// Only graded, persisted observations count. Neither "studied" nor an LLM judgement is evidence.
async function consumeEvidence(store: Store, ctx: Context) {
  const { enrollment: e } = ctx;
  const submissions = await store.select({ submission: assessmentSubmissions, assessment: assessments }).from(assessmentSubmissions)
    .innerJoin(assessments, eq(assessments.id, assessmentSubmissions.assessmentId))
    .where(and(eq(assessmentSubmissions.enrollmentId, e.id), eq(assessmentSubmissions.status, "graded"), eq(assessments.courseId, e.courseId), eq(assessments.isDiagnostic, false), inArray(assessments.type, ["quiz", "coding"])))
    .orderBy(asc(assessmentSubmissions.submittedAt), asc(assessmentSubmissions.id));
  for (const { submission: s, assessment: a } of submissions) {
    if (!a.lessonId || !ctx.input.lessons.some((l) => l.id === a.lessonId) || a.type === "coding" && (s.mode !== "submit" || s.isPassed === null)) continue;
    const answers = a.type === "quiz" ? await store.select({ answer: assessmentAnswers, question: quizQuestions }).from(assessmentAnswers).innerJoin(quizQuestions, eq(quizQuestions.id, assessmentAnswers.questionId))
      .where(and(eq(assessmentAnswers.submissionId, s.id), eq(quizQuestions.assessmentId, a.id))).orderBy(asc(quizQuestions.position), asc(quizQuestions.id)) : [];
    const observations = a.type === "coding" ? [{ key: "code", lessonId: a.lessonId, correct: s.isPassed! }] : answers.filter(({ answer }) => !answer.isUnknown && answer.isCorrect !== null).map(({ answer, question }) => ({ key: `question:${question.id}`, lessonId: a.lessonId!, correct: answer.isCorrect! }));
    for (const observation of observations) {
      const inserted = await store.insert(learningPathEvidence).values({ submissionId: s.id, observationKey: observation.key }).onConflictDoNothing().returning();
      if (!inserted.length) continue;
      for (const skillId of ctx.input.lessons.find((l) => l.id === observation.lessonId)?.skillIds ?? []) {
        const skill = ctx.skills.find((s) => s.id === skillId)!;
        const [prior] = await store.select().from(enrollmentSkillMastery).where(and(eq(enrollmentSkillMastery.enrollmentId, e.id), eq(enrollmentSkillMastery.skillId, skillId)));
        const values = { pMastery: updateBkt(prior?.pMastery ?? skill.bktPInit, observation.correct, skill), evidenceCount: (prior?.evidenceCount ?? 0) + 1, correctCount: (prior?.correctCount ?? 0) + Number(observation.correct), lastAssessedAt: new Date(), updatedAt: new Date() };
        await store.insert(enrollmentSkillMastery).values({ enrollmentId: e.id, skillId, ...values }).onConflictDoUpdate({ target: [enrollmentSkillMastery.enrollmentId, enrollmentSkillMastery.skillId], set: values });
      }
    }
  }
}

async function queue(store: Store, ctx: Context, trigger: typeof learningPathJobs.$inferInsert.trigger, afterLessonId?: string | null) {
  const hash = inputHash(ctx.input);
  const pending = await store.select().from(learningPathJobs).where(and(eq(learningPathJobs.enrollmentId, ctx.enrollment.id), isNull(learningPathJobs.finishedAt)));
  if (pending.some((job) => job.inputHash === hash)) return;
  // Superseded requests cannot publish over a newer goal, result, or curriculum.
  await store.update(learningPathJobs).set({ finishedAt: new Date() }).where(and(eq(learningPathJobs.enrollmentId, ctx.enrollment.id), isNull(learningPathJobs.finishedAt)));
  await store.insert(learningPathJobs).values({ enrollmentId: ctx.enrollment.id, inputHash: hash, trigger, afterLessonId });
}

// Public integration hook for #98: invoke inside the same lesson-completion transaction.
// It consumes actual progress; the client cannot forge a completion through this module.
export async function reconcileLearningPath(store: Store, userId: string, courseId: string) {
  let ctx = await context(store, userId, courseId, true);
  await consumeEvidence(store, ctx);
  const completed: string[] = [];
  for (const lesson of ctx.input.lessons.filter((l) => l.progress === "completed")) {
    const inserted = await store.insert(learningPathCompletions).values({ enrollmentId: ctx.enrollment.id, lessonId: lesson.id }).onConflictDoNothing().returning();
    if (inserted.length) completed.push(lesson.id);
  }
  ctx = await context(store, userId, courseId);
  const [existingJob] = await store.select().from(learningPathJobs).where(and(eq(learningPathJobs.enrollmentId, ctx.enrollment.id), isNull(learningPathJobs.finishedAt))).orderBy(desc(learningPathJobs.createdAt)).limit(1);
  if (ctx.enrollment.pathStatus === "generating") {
    await queue(store, ctx, ctx.path ? "goal_changed" : "diagnostic_completed", completed.at(-1));
  } else if (completed.length && ctx.enrollment.pathStatus !== "none") {
    if (ctx.enrollment.pathSource === "ai") await queue(store, ctx, "lesson_completed", completed.at(-1));
    else await persistPath(store, ctx, defaultItems(ctx.input), { generatedBy: "system", trigger: "lesson_completed", failed: ctx.enrollment.pathStatus === "failed", afterLessonId: completed.at(-1) });
  } else if (existingJob && existingJob.inputHash !== inputHash(ctx.input)) {
    await queue(store, ctx, existingJob.trigger, existingJob.afterLessonId);
  }
  // The progress and terminal enrollment state follow durable lesson records, never AI text.
  const fresh = await context(store, userId, courseId);
  const progress = selectPath(fresh.input, fresh.path ? fresh.input.previous : defaultItems(fresh.input), fresh.enrollment.pathSource);
  await store.update(studentEnrollments).set({ progress: progress.percent, ...(progress.complete ? { status: "completed" as const, completedAt: fresh.enrollment.completedAt ?? new Date() } : {}) }).where(eq(studentEnrollments.id, fresh.enrollment.id));
}

export function createLearningPathService(db: Database, generator?: PathGenerator) {
  return {
    async get(userId: string, courseId: string) {
      return db.transaction(async (tx) => view(tx, await context(tx, userId, courseId)), { isolationLevel: "repeatable read", accessMode: "read only" });
    },
    async execute(userId: string, courseId: string, command: LearningPathCommand) {
      return db.transaction(async (tx) => {
        const ctx = await context(tx, userId, courseId, true);
        const { enrollment: e, path } = ctx;
        if (command.type === "sync") await reconcileLearningPath(tx, userId, courseId);
        else if (command.type === "retry") {
          if (e.pathStatus !== "failed" || !e.goalSetAt || e.goalEditing) throw new LearningPathError("Chỉ có thể thử lại lộ trình đang thất bại.");
          await tx.update(studentEnrollments).set({ pathStatus: "generating" }).where(eq(studentEnrollments.id, e.id));
          await queue(tx, ctx, "manual");
        } else if (command.type === "dismiss-diagnostic") {
          if (e.diagnosticStatus !== "skipped" || e.pathSource !== "default" || e.pathStatus !== "ready") throw new LearningPathError("Thông báo đã thay đổi.");
          await tx.update(studentEnrollments).set({ diagnosticCardDismissedAt: new Date() }).where(eq(studentEnrollments.id, e.id));
        } else if (command.type === "ack-highlights" || command.type === "dismiss-update") {
          if (!path || path.id !== command.pathId) throw new LearningPathError("Lộ trình đã thay đổi. Vui lòng tải lại.");
          await tx.update(personalizedLearningPaths).set(command.type === "ack-highlights" ? { highlightsSeenAt: new Date() } : { updateDismissedAt: new Date() }).where(eq(personalizedLearningPaths.id, path.id));
        } else if (command.type === "review") {
          await saveCourseReview(tx, e.id, courseId, command.rating, command.text);
        }
        return view(tx, await context(tx, userId, courseId));
      });
    },
    async assertLessonAccess(userId: string, courseId: string, lessonId: string) {
      return db.transaction((tx) => assertLearningLessonAccess(tx, userId, courseId, lessonId), { isolationLevel: "repeatable read", accessMode: "read only" });
    },
    async getKnowledgeMap(userId: string, requestedCourseId?: string): Promise<KnowledgeMapView> {
      return db.transaction(async (tx) => {
        await requireLearner(tx, userId);
        const enrolled = await tx.select({ id: courses.id, title: courses.title }).from(studentEnrollments).innerJoin(courses, eq(courses.id, studentEnrollments.courseId))
          .where(and(eq(studentEnrollments.userId, userId), ne(studentEnrollments.status, "suspended"))).orderBy(asc(courses.title), asc(courses.id));
        const selected = requestedCourseId ? enrolled.find((c) => c.id === requestedCourseId) : enrolled[0];
        if (requestedCourseId && !selected) throw new LearningPathError("Bạn chưa có quyền xem bản đồ khoá học này.", 403);
        if (!selected) return { courses: enrolled, courseId: null, title: null, confirmed: false, nodes: [], edges: [] };
        const ctx = await context(tx, userId, selected.id);
        const base = { courses: enrolled, courseId: selected.id, title: selected.title };
        if (ctx.course.knowledgeMapStatus !== "confirmed") return { ...base, confirmed: false, nodes: [], edges: [] };
        graphLayers(ctx.input.concepts.map((c) => c.id), ctx.input.edges);
        return { ...base, confirmed: true, edges: ctx.input.edges, nodes: ctx.input.concepts.map((c) => ({ ...c, level: levelOf(c),
          locked: levelOf(c) === 0 && ctx.input.edges.some((e) => e.to === c.id && levelOf(ctx.input.concepts.find((p) => p.id === e.from)) < 1),
          lessons: ctx.input.lessons.filter((l) => l.skillIds.includes(c.id)).map((l) => ({ id: l.id, title: l.title, locked: l.progress !== "completed" && !!lockInfo(ctx.input, l) })) })) };
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
    },
    async runPending(userId: string, courseId: string) {
      // Bootstrap #96's durable generating marker; also recovers expired worker leases.
      await db.transaction((tx) => reconcileLearningPath(tx, userId, courseId));
      const claim = await db.transaction(async (tx) => {
        const ctx = await context(tx, userId, courseId, true);
        const [job] = await tx.select().from(learningPathJobs).where(and(eq(learningPathJobs.enrollmentId, ctx.enrollment.id), isNull(learningPathJobs.finishedAt))).orderBy(desc(learningPathJobs.createdAt)).limit(1).for("update");
        if (!job || job.leaseExpiresAt && job.leaseExpiresAt.getTime() > Date.now()) return null;
        const token = randomUUID();
        await tx.update(learningPathJobs).set({ leaseToken: token, leaseExpiresAt: new Date(Date.now() + 60_000) }).where(eq(learningPathJobs.id, job.id));
        return { job, token, input: ctx.input };
      });
      if (!claim) return;
      const started = Date.now();
      let result: GenerationResult | undefined;
      let failed = false;
      try {
        if (!generator) throw new Error("Path generator unavailable");
        result = await generator(claim.input, AbortSignal.timeout(20_000));
        result.proposal = pathProposal.parse(result.proposal);
        constrainPath(claim.input, result.proposal);
      } catch { failed = true; }
      await db.transaction(async (tx) => {
        const ctx = await context(tx, userId, courseId, true);
        const [job] = await tx.select().from(learningPathJobs).where(eq(learningPathJobs.id, claim.job.id)).for("update");
        // Fence late workers, including a request superseded while the provider was running.
        if (!job || job.finishedAt || job.leaseToken !== claim.token || inputHash(ctx.input) !== job.inputHash) return;
        const outcome = generationOutcome(ctx.input, result?.proposal, failed);
        const ai = outcome.source === "ai";
        failed = outcome.status === "failed";
        const path = await persistPath(tx, ctx, outcome.items, { generatedBy: outcome.generatedBy, trigger: job.trigger, failed, model: result?.model, rationale: ai ? result!.proposal.rationale : "Theo thứ tự mặc định của giảng viên.", afterLessonId: job.afterLessonId });
        await tx.insert(aiInteractionLogs).values({ userId, enrollmentId: ctx.enrollment.id, courseId, pathId: path.id, requestType: job.trigger === "lesson_completed" ? "update_path" : "generate_path", model: result?.model,
          userPrompt: JSON.stringify({ goal: ctx.input.goal, level: ctx.input.level, hours: ctx.input.hours, lessonIds: ctx.input.lessons.map((l) => l.id), concepts: ctx.input.concepts }),
          aiResponse: result ? JSON.stringify(result.proposal) : null, isSuccess: !failed, errorMessage: failed ? "Không tạo được lộ trình cá nhân hoá trong thời gian cho phép; đã dùng thứ tự mặc định." : null,
          promptTokens: result?.promptTokens, completionTokens: result?.completionTokens, latencyMs: Date.now() - started });
        await tx.update(learningPathJobs).set({ finishedAt: new Date() }).where(eq(learningPathJobs.id, job.id));
      });
    },
  };
}
