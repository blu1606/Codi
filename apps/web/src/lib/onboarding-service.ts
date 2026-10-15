import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { courses } from "@codi-1/db/schema/courses";
import { assessments, assessmentAnswers, assessmentSubmissions, quizOptions, quizQuestions } from "@codi-1/db/schema/assessments";
import { courseChapters, courseLessons } from "@codi-1/db/schema/course-content";
import { enrollmentSkillMastery, pathItems, personalizedLearningPaths } from "@codi-1/db/schema/learning";
import { lessonSkills, skills } from "@codi-1/db/schema/knowledge-map";
import { assertOnboardingAccess, goalTransition, OnboardingError, requireDiagnosticState, updateBkt, type Enrollment, type OnboardingCommand, type OnboardingView } from "./onboarding-contract";

type Store = Pick<Database, "select" | "insert" | "update">;

async function context(store: Store, userId: string, courseId: string, lock = false) {
  const query = store.select().from(studentEnrollments).where(and(eq(studentEnrollments.userId, userId), eq(studentEnrollments.courseId, courseId)));
  const [row] = await (lock ? query.for("update") : query);
  const enrollment = assertOnboardingAccess(row);
  const [course] = await store.select({ id: courses.id, title: courses.title }).from(courses).where(eq(courses.id, courseId));
  if (!course) throw new OnboardingError("Không tìm thấy khoá học.", 404);
  const [diagnostic] = await store.select().from(assessments).where(and(eq(assessments.courseId, courseId), eq(assessments.isDiagnostic, true), eq(assessments.status, "published")));
  const questions = diagnostic ? await store.select().from(quizQuestions).where(eq(quizQuestions.assessmentId, diagnostic.id)).orderBy(asc(quizQuestions.position), asc(quizQuestions.id)) : [];
  const options = questions.length ? await store.select().from(quizOptions).where(inArray(quizOptions.questionId, questions.map((q) => q.id))).orderBy(asc(quizOptions.position), asc(quizOptions.id)) : [];
  const [attempt] = diagnostic ? await store.select().from(assessmentSubmissions).where(and(eq(assessmentSubmissions.enrollmentId, enrollment.id), eq(assessmentSubmissions.assessmentId, diagnostic.id))).orderBy(desc(assessmentSubmissions.attempt)).limit(1) : [];
  const answers = attempt ? await store.select().from(assessmentAnswers).where(eq(assessmentAnswers.submissionId, attempt.id)) : [];
  return { enrollment, course, diagnostic, questions, options, attempt, answers };
}
type Context = Awaited<ReturnType<typeof context>>;

async function view(store: Store, ctx: Context): Promise<OnboardingView> {
  const { enrollment: e, course, diagnostic, questions, options, attempt, answers } = ctx;
  let result: OnboardingView["result"] = null;
  if (e.diagnosticStatus === "done" && attempt?.status === "graded") {
    const testedLessons = questions.flatMap((q) => q.lessonId ? [q.lessonId] : []);
    const concepts = testedLessons.length ? await store.select({ id: skills.id, name: skills.name, probability: enrollmentSkillMastery.pMastery, evidenceCount: enrollmentSkillMastery.evidenceCount })
      .from(skills).innerJoin(lessonSkills, eq(lessonSkills.skillId, skills.id))
      .leftJoin(enrollmentSkillMastery, and(eq(enrollmentSkillMastery.skillId, skills.id), eq(enrollmentSkillMastery.enrollmentId, e.id)))
      .where(and(eq(skills.courseId, course.id), inArray(skills.review, ["accepted", "edited"]), inArray(lessonSkills.lessonId, testedLessons))).orderBy(asc(skills.id)) : [];
    result = { right: 0, wrong: 0, unknown: 0, concepts: [...new Map(concepts.map((c) => [c.id, { ...c, probability: c.evidenceCount ? c.probability : null, evidenceCount: c.evidenceCount ?? 0 }])).values()] };
    for (const q of questions) {
      const answer = answers.find((a) => a.questionId === q.id);
      if (!answer || answer.isUnknown) result.unknown++;
      else if (answer.isCorrect) result.right++;
      else result.wrong++;
    }
  }
  return {
    enrollment: { learningGoal: e.learningGoal, selfAssessedLevel: e.selfAssessedLevel, weeklyGoalMinutes: e.weeklyGoalMinutes,
      goalSet: !!e.goalSetAt, goalDraft: e.goalDraft, goalStep: e.goalStep, goalEditing: e.goalEditing,
      diagnosticStatus: e.diagnosticStatus, diagnosticQuestionIndex: e.diagnosticQuestionIndex, pathStatus: e.pathStatus, pathSource: e.pathSource },
    course, diagnostic: diagnostic ? { id: diagnostic.id, title: diagnostic.title, questions: questions.map((q) => ({ id: q.id, text: q.text, codeSnippet: q.codeSnippet, options: options.filter((o) => o.questionId === q.id).map((o) => ({ id: o.id, text: o.text })) })) } : null,
    attemptId: attempt?.id ?? null,
    answers: answers.map((a) => ({ questionId: a.questionId, optionId: a.selectedOptionId, unknown: a.isUnknown })), result,
  };
}

async function defaultPath(store: Store, enrollment: Enrollment, keepAi: boolean) {
  const [active] = await store.select().from(personalizedLearningPaths).where(and(eq(personalizedLearningPaths.enrollmentId, enrollment.id), eq(personalizedLearningPaths.status, "active")));
  // D11: preserve the last actual AI path, including a pending re-plan's previous version.
  if (keepAi && active?.generatedBy === "ai") return { pathStatus: "ready" as const, pathSource: "ai" as const };
  if (active?.generatedBy === "system") return { pathStatus: "ready" as const, pathSource: "default" as const };
  if (active) await store.update(personalizedLearningPaths).set({ status: "superseded", supersededAt: new Date() }).where(eq(personalizedLearningPaths.id, active.id));
  const [latest] = await store.select({ version: personalizedLearningPaths.version }).from(personalizedLearningPaths).where(eq(personalizedLearningPaths.enrollmentId, enrollment.id)).orderBy(desc(personalizedLearningPaths.version)).limit(1);
  const [path] = await store.insert(personalizedLearningPaths).values({ enrollmentId: enrollment.id, version: (latest?.version ?? 0) + 1, generatedBy: "system", trigger: "default_order" }).returning();
  const lessons = await store.select({ id: courseLessons.id, duration: courseLessons.durationSeconds }).from(courseLessons).innerJoin(courseChapters, eq(courseChapters.id, courseLessons.chapterId)).where(and(eq(courseChapters.courseId, enrollment.courseId), eq(courseChapters.isPublished, true), eq(courseLessons.isPublished, true))).orderBy(asc(courseChapters.position), asc(courseChapters.id), asc(courseLessons.position), asc(courseLessons.id));
  if (!path) throw new Error("Default path insert failed");
  if (lessons.length) await store.insert(pathItems).values(lessons.map((lesson, index) => ({ pathId: path.id, lessonId: lesson.id, position: index + 1, isSkippable: false, estimatedMinutes: Math.ceil(lesson.duration / 60), reason: "Theo thứ tự mặc định của giảng viên." })));
  return { pathStatus: "ready" as const, pathSource: "default" as const };
}

function activeAttempt(ctx: Context, attemptId: number) {
  requireDiagnosticState(ctx.enrollment, "in-progress");
  if (!ctx.attempt || ctx.attempt.id !== attemptId || ctx.attempt.status !== "draft") throw new OnboardingError("Lần làm bài đã thay đổi. Vui lòng tải lại.");
  return ctx.attempt;
}
function currentQuestion(ctx: Context, questionId: number) {
  const question = ctx.questions[ctx.enrollment.diagnosticQuestionIndex];
  if (!question || question.id !== questionId) throw new OnboardingError("Câu hỏi đã thay đổi. Vui lòng tải lại.");
  return question;
}

async function grade(store: Store, ctx: Context) {
  const { enrollment, questions, options, answers, attempt } = ctx;
  if (!attempt) throw new OnboardingError("Không tìm thấy lần làm bài.");
  const bySkill = new Map<number, { params: typeof skills.$inferSelect; probability: number; evidence: number; correct: number }>();
  let points = 0;
  for (const question of questions) {
    const answer = answers.find((a) => a.questionId === question.id);
    if (!answer) throw new OnboardingError("Vui lòng trả lời mọi câu hoặc chọn Tôi chưa biết.", 400);
    const questionOptions = options.filter((o) => o.questionId === question.id);
    const selected = questionOptions.find((o) => o.id === answer.selectedOptionId);
    if (!answer.isUnknown && !selected) throw new OnboardingError("Nội dung bài kiểm tra đã thay đổi. Vui lòng tải lại.");
    const correct = !answer.isUnknown && !!selected?.isCorrect;
    const earnedPoints = correct ? question.points : 0;
    points += earnedPoints;
    await store.update(assessmentAnswers).set({ isCorrect: answer.isUnknown ? null : correct, earnedPoints }).where(and(eq(assessmentAnswers.submissionId, attempt.id), eq(assessmentAnswers.questionId, question.id)));
    const concepts = question.lessonId ? await store.select({ skill: skills }).from(skills).innerJoin(lessonSkills, eq(lessonSkills.skillId, skills.id)).where(and(eq(lessonSkills.lessonId, question.lessonId), eq(skills.courseId, enrollment.courseId), inArray(skills.review, ["accepted", "edited"]))) : [];
    for (const { skill } of concepts) {
      let state = bySkill.get(skill.id);
      if (!state) {
        const [prior] = await store.select().from(enrollmentSkillMastery).where(and(eq(enrollmentSkillMastery.enrollmentId, enrollment.id), eq(enrollmentSkillMastery.skillId, skill.id)));
        state = { params: skill, probability: prior?.pMastery ?? skill.bktPInit, evidence: prior?.evidenceCount ?? 0, correct: prior?.correctCount ?? 0 };
        bySkill.set(skill.id, state);
      }
      // Unknown is persisted separately; it supplies no correct/incorrect likelihood evidence (D16).
      if (!answer.isUnknown) { state.probability = updateBkt(state.probability, correct, skill); state.evidence++; if (correct) state.correct++; }
    }
  }
  for (const [skillId, state] of bySkill) {
    const values = { pMastery: state.probability, evidenceCount: state.evidence, correctCount: state.correct, lastAssessedAt: new Date(), updatedAt: new Date() };
    await store.insert(enrollmentSkillMastery).values({ enrollmentId: enrollment.id, skillId, ...values }).onConflictDoUpdate({ target: [enrollmentSkillMastery.enrollmentId, enrollmentSkillMastery.skillId], set: values });
  }
  // An internal score satisfies the quiz record constraint; this diagnostic never counts toward a lesson grade.
  await store.update(assessmentSubmissions).set({ status: "graded", score: points, isPassed: null, submittedAt: new Date(), gradedAt: new Date() }).where(eq(assessmentSubmissions.id, attempt.id));
}

export function createOnboardingService(db: Database) {
  return {
    async get(userId: string, courseId: string) {
      // A repeatable snapshot prevents mixing an old cursor with a concurrently submitted result.
      return db.transaction(async (tx) => view(tx, await context(tx, userId, courseId)), { isolationLevel: "repeatable read", accessMode: "read only" });
    },
    async execute(userId: string, courseId: string, command: OnboardingCommand) {
      return db.transaction(async (tx) => {
        const ctx = await context(tx, userId, courseId, true);
        const { enrollment: e, diagnostic, questions, attempt, answers } = ctx;
        let patch: Partial<Enrollment> = {};
        if (command.type === "goal-pick" || command.type === "goal-next" || command.type === "goal-back" || command.type === "goal-skip" || command.type === "goal-edit") {
          patch = goalTransition(e, command);
        } else if (command.type === "fork-default") {
          requireDiagnosticState(e, "fork");
          patch = { diagnosticStatus: "skipped", ...await defaultPath(tx, e, false) };
        } else if (command.type === "fork-diagnostic" || command.type === "diagnostic-retake") {
          requireDiagnosticState(e, ...(command.type === "fork-diagnostic" ? ["fork" as const] : ["done" as const, "skipped" as const]));
          patch = { diagnosticStatus: "intro", diagnosticQuestionIndex: 0 };
        } else if (command.type === "diagnostic-postpone") {
          requireDiagnosticState(e, "intro", "in-progress");
          patch = { diagnosticStatus: "skipped", ...await defaultPath(tx, e, true) };
        } else if (command.type === "diagnostic-start") {
          requireDiagnosticState(e, "intro", "in-progress");
          if (!diagnostic || !questions.length) throw new OnboardingError("Khoá học này chưa có bài kiểm tra đầu vào.", 400);
          // The reference diagnostic is single-choice. Refuse malformed authoring instead of mis-grading it.
          if (questions.some((q) => !["single_choice", "predict_output"].includes(q.type) || ctx.options.filter((o) => o.questionId === q.id && o.isCorrect).length !== 1 || ctx.options.filter((o) => o.questionId === q.id).length < 2)) throw new OnboardingError("Bài kiểm tra đầu vào đang được cập nhật. Bạn có thể chọn Để sau.", 409);
          if (e.diagnosticStatus === "intro") await tx.insert(assessmentSubmissions).values({ enrollmentId: e.id, assessmentId: diagnostic.id, attempt: (attempt?.attempt ?? 0) + 1 });
          patch = { diagnosticStatus: "in-progress" };
        } else if (command.type === "request-path") {
          requireDiagnosticState(e, "done");
          // Durable handoff: #97 consumes enrollment.path_status=generating, with the latest graded diagnostic.
          patch = { pathStatus: "generating" };
        } else {
          // Retried submit is idempotent and cannot apply BKT evidence twice.
          if (command.type === "submit" && e.diagnosticStatus === "done" && attempt?.id === command.attemptId && attempt.status === "graded") return view(tx, ctx);
          const draft = activeAttempt(ctx, command.attemptId);
          if (command.type === "answer") {
            currentQuestion(ctx, command.questionId);
            if (!command.unknown && !ctx.options.some((o) => o.questionId === command.questionId && o.id === command.optionId)) throw new OnboardingError("Lựa chọn không thuộc câu hỏi này.", 400);
            const values = { selectedOptionId: command.optionId, isUnknown: command.unknown, isCorrect: null, earnedPoints: 0 };
            await tx.insert(assessmentAnswers).values({ submissionId: draft.id, questionId: command.questionId, ...values }).onConflictDoUpdate({ target: [assessmentAnswers.submissionId, assessmentAnswers.questionId], set: values });
            await tx.update(assessmentSubmissions).set({ savedAt: new Date() }).where(eq(assessmentSubmissions.id, draft.id));
          } else if (command.type === "next" || command.type === "previous") {
            const question = currentQuestion(ctx, command.questionId);
            const next = e.diagnosticQuestionIndex + (command.type === "next" ? 1 : -1);
            if (next < 0 || next >= questions.length) throw new OnboardingError("Không thể chuyển đến câu hỏi này.", 400);
            if (command.type === "next" && !answers.some((a) => a.questionId === question.id)) throw new OnboardingError("Vui lòng chọn câu trả lời hoặc Tôi chưa biết.", 400);
            patch = { diagnosticQuestionIndex: next };
          } else if (command.type === "submit") {
            if (e.diagnosticQuestionIndex !== questions.length - 1) throw new OnboardingError("Vui lòng hoàn thành các câu hỏi trước.", 400);
            await grade(tx, ctx);
            patch = { diagnosticStatus: "done" };
          }
        }
        if (Object.keys(patch).length) await tx.update(studentEnrollments).set(patch).where(and(eq(studentEnrollments.id, e.id), eq(studentEnrollments.userId, userId)));
        return view(tx, await context(tx, userId, courseId));
      });
    },
  };
}
