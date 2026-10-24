import { and, asc, desc, eq, inArray, like } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { studentActivities, studentEnrollments } from "@codi-1/db/schema/student-profile";
import { courses } from "@codi-1/db/schema/courses";
import {
  assessments,
  assessmentAnswers,
  assessmentSubmissions,
  quizOptions,
  quizQuestions,
} from "@codi-1/db/schema/assessments";
import {
  courseChapters,
  courseLessons,
} from "@codi-1/db/schema/course-content";
import {
  enrollmentSkillMastery,
  pathItems,
  personalizedLearningPaths,
} from "@codi-1/db/schema/learning";
import { loadConfirmedKnowledgeMap, lockKnowledgeMap } from "./confirmed-knowledge-map";
import type { ConfirmedKnowledgeMap } from "@codi-1/db/schema/confirmed-knowledge-map";
import {
  assertOnboardingAccess,
  canRequestDiagnosticPath,
  diagnosticPolicy,
  goalTransition,
  OnboardingError,
  updateBkt,
  type Enrollment,
  type OnboardingCommand,
  type OnboardingView,
} from "./onboarding-contract";

type Store = Pick<Database, "select" | "insert" | "update" | "execute">;

async function context(
  store: Store,
  userId: string,
  courseId: string,
  lock = false,
) {
  const query = store
    .select()
    .from(studentEnrollments)
    .where(
      and(
        eq(studentEnrollments.userId, userId),
        eq(studentEnrollments.courseId, courseId),
      ),
    );
  const [row] = await (lock ? query.for("update") : query);
  const enrollment = assertOnboardingAccess(row);

  // If enrollment goal is not set and draft is empty, check for persisted advisor intake
  if (!enrollment.goalSetAt && (!enrollment.goalDraft || Object.keys(enrollment.goalDraft).length === 0)) {
    try {
      const [activity] = await store
        .select({ metadata: studentActivities.metadata })
        .from(studentActivities)
        .where(
          and(
            eq(studentActivities.userId, userId),
            eq(studentActivities.type, "course_view"),
            like(studentActivities.metadata, "%advisor_intake%")
          )
        )
        .orderBy(desc(studentActivities.occurredAt))
        .limit(1);

      if (activity?.metadata) {
        const parsed = JSON.parse(activity.metadata);
        if (parsed?.draft && Object.keys(parsed.draft).length > 0) {
          enrollment.goalDraft = parsed.draft;
          // Only persist back to enrollment if running inside an exclusive writable transaction
          if (lock) {
            await store
              .update(studentEnrollments)
              .set({ goalDraft: parsed.draft })
              .where(eq(studentEnrollments.id, enrollment.id));
          }
        }
      }
    } catch {
      // Ignore background hydration failures
    }
  }

  if (lock) await lockKnowledgeMap(store, courseId, "read");
  const [course] = await store
    .select()
    .from(courses)
    .where(eq(courses.id, courseId));
  if (!course) throw new OnboardingError("Không tìm thấy khoá học.", 404);
  const publication = await loadConfirmedKnowledgeMap(store, course);
  const diagnosticQuery = store
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.courseId, courseId),
        eq(assessments.isDiagnostic, true),
        eq(assessments.status, "published"),
      ),
    );
  // Enrollment -> assessment is the same lock order as ordinary quiz writers.
  // A publisher's UPDATE lock serializes with this read through attempt creation.
  const [diagnostic] = await (lock ? diagnosticQuery.for("share") : diagnosticQuery);
  const [attempt] = diagnostic
    ? await store
        .select()
        .from(assessmentSubmissions)
        .where(
          and(
            eq(assessmentSubmissions.enrollmentId, enrollment.id),
            eq(assessmentSubmissions.assessmentId, diagnostic.id),
          ),
        )
        .orderBy(desc(assessmentSubmissions.attempt))
        .limit(1)
    : [];
  const pinnedAttempt = attempt && ["in-progress", "done"].includes(enrollment.diagnosticStatus);
  const quizRevision = pinnedAttempt ? attempt.quizRevision : diagnostic?.currentQuizRevision;
  if (diagnostic && (!Number.isInteger(quizRevision) || quizRevision! < 1)) {
    throw new OnboardingError("Không tìm thấy phiên bản bài kiểm tra. Vui lòng liên hệ quản trị viên.");
  }
  const questions = diagnostic
    ? await store
        .select()
        .from(quizQuestions)
        .where(and(eq(quizQuestions.assessmentId, diagnostic.id), eq(quizQuestions.quizRevision, quizRevision!)))
        .orderBy(asc(quizQuestions.position), asc(quizQuestions.id))
    : [];
  const options = questions.length
    ? await store
        .select()
        .from(quizOptions)
        .where(
          inArray(
            quizOptions.questionId,
            questions.map((q) => q.id),
          ),
        )
        .orderBy(asc(quizOptions.position), asc(quizOptions.id))
    : [];
  const answers = attempt
    ? await store
        .select()
        .from(assessmentAnswers)
        .where(eq(assessmentAnswers.submissionId, attempt.id))
    : [];
  const [activePath] = await store
    .select()
    .from(personalizedLearningPaths)
    .where(
      and(
        eq(personalizedLearningPaths.enrollmentId, enrollment.id),
        eq(personalizedLearningPaths.status, "active"),
      ),
    );
  return {
    enrollment,
    course,
    publication,
    diagnostic,
    hasDiagnostic: !!diagnostic,
    questions,
    options,
    attempt,
    answers,
    activePath,
  };
}
type Context = Awaited<ReturnType<typeof context>>;

async function view(store: Store, ctx: Context): Promise<OnboardingView> {
  const {
    enrollment: e,
    course,
    diagnostic,
    questions,
    options,
    attempt,
    answers,
  } = ctx;
  let result: OnboardingView["result"] = null;
  if (e.diagnosticStatus === "done" && attempt?.status === "graded") {
    const testedLessons = questions.flatMap((q) =>
      q.lessonId ? [q.lessonId] : [],
    );
    const tested = new Set(testedLessons);
    const ids = new Set(ctx.publication?.links.filter((link) => tested.has(link.lessonId)).map((link) => link.skillId));
    const mastery = ids.size ? await store.select().from(enrollmentSkillMastery)
      .where(and(eq(enrollmentSkillMastery.enrollmentId, e.id),
        inArray(enrollmentSkillMastery.skillId, [...ids]))) : [];
    const concepts = (ctx.publication?.skills ?? []).filter((skill) => ids.has(skill.id))
      .map((skill) => {
        const row = mastery.find((entry) => entry.skillId === skill.id);
        return { id: skill.id, name: skill.name, probability: row?.pMastery ?? null,
          evidenceCount: row?.evidenceCount ?? 0 };
      });
    result = {
      right: 0,
      wrong: 0,
      unknown: 0,
      concepts: [
        ...new Map(
          concepts.map((c) => [
            c.id,
            {
              ...c,
              probability: c.evidenceCount ? c.probability : null,
              evidenceCount: c.evidenceCount ?? 0,
            },
          ]),
        ).values(),
      ],
    };
    for (const q of questions) {
      const answer = answers.find((a) => a.questionId === q.id);
      if (!answer || answer.isUnknown) result.unknown++;
      else if (answer.isCorrect) result.right++;
      else result.wrong++;
    }
  }
  return {
    canRequestPath: canRequestDiagnosticPath(ctx),
    enrollment: {
      learningGoal: e.learningGoal,
      selfAssessedLevel: e.selfAssessedLevel,
      weeklyGoalMinutes: e.weeklyGoalMinutes,
      goalSet: !!e.goalSetAt,
      goalDraft: e.goalDraft,
      goalStep: e.goalStep,
      goalEditing: e.goalEditing,
      diagnosticStatus: e.diagnosticStatus,
      diagnosticQuestionIndex: e.diagnosticQuestionIndex,
      pathStatus: e.pathStatus,
      pathSource: e.pathSource,
    },
    course: { id: course.id, title: course.title },
    diagnostic: diagnostic
      ? {
          id: diagnostic.id,
          title: diagnostic.title,
          questions: questions.map((q) => ({
            id: q.id,
            text: q.text,
            codeSnippet: q.codeSnippet,
            options: options
              .filter((o) => o.questionId === q.id)
              .map((o) => ({ id: o.id, text: o.text })),
          })),
        }
      : null,
    attemptId: attempt?.id ?? null,
    answers: answers.map((a) => ({
      questionId: a.questionId,
      optionId: a.selectedOptionId,
      unknown: a.isUnknown,
    })),
    result,
  };
}

async function defaultPath(
  store: Store,
  enrollment: Enrollment,
  keepAi: boolean,
) {
  const [active] = await store
    .select()
    .from(personalizedLearningPaths)
    .where(
      and(
        eq(personalizedLearningPaths.enrollmentId, enrollment.id),
        eq(personalizedLearningPaths.status, "active"),
      ),
    );
  // D11: preserve the last actual AI path, including a pending re-plan's previous version.
  if (keepAi && active?.generatedBy === "ai")
    return { pathStatus: "ready" as const, pathSource: "ai" as const };
  if (active?.generatedBy === "system")
    return { pathStatus: "ready" as const, pathSource: "default" as const };
  if (active)
    await store
      .update(personalizedLearningPaths)
      .set({ status: "superseded", supersededAt: new Date() })
      .where(eq(personalizedLearningPaths.id, active.id));
  const [latest] = await store
    .select({ version: personalizedLearningPaths.version })
    .from(personalizedLearningPaths)
    .where(eq(personalizedLearningPaths.enrollmentId, enrollment.id))
    .orderBy(desc(personalizedLearningPaths.version))
    .limit(1);
  const [path] = await store
    .insert(personalizedLearningPaths)
    .values({
      enrollmentId: enrollment.id,
      version: (latest?.version ?? 0) + 1,
      generatedBy: "system",
      trigger: "default_order",
    })
    .returning();
  const lessons = await store
    .select({ id: courseLessons.id, duration: courseLessons.durationSeconds })
    .from(courseLessons)
    .innerJoin(courseChapters, eq(courseChapters.id, courseLessons.chapterId))
    .where(
      and(
        eq(courseChapters.courseId, enrollment.courseId),
        eq(courseChapters.isPublished, true),
        eq(courseLessons.isPublished, true),
      ),
    )
    .orderBy(
      asc(courseChapters.position),
      asc(courseChapters.id),
      asc(courseLessons.position),
      asc(courseLessons.id),
    );
  if (!path) throw new Error("Default path insert failed");
  if (lessons.length)
    await store
      .insert(pathItems)
      .values(
        lessons.map((lesson, index) => ({
          pathId: path.id,
          lessonId: lesson.id,
          position: index + 1,
          isSkippable: false,
          estimatedMinutes: Math.ceil(lesson.duration / 60),
          reason: "Theo thứ tự mặc định của giảng viên.",
        })),
      );
  return { pathStatus: "ready" as const, pathSource: "default" as const };
}

async function grade(store: Store, ctx: Context) {
  const { enrollment, questions, options, answers, attempt } = ctx;
  if (!attempt) throw new OnboardingError("Không tìm thấy lần làm bài.");
  const bySkill = new Map<
    number,
    {
      params: ConfirmedKnowledgeMap["skills"][number];
      probability: number;
      evidence: number;
      correct: number;
    }
  >();
  let points = 0;
  for (const question of questions) {
    const answer = answers.find((a) => a.questionId === question.id);
    if (!answer)
      throw new OnboardingError(
        "Vui lòng trả lời mọi câu hoặc chọn Tôi chưa biết.",
        400,
      );
    const questionOptions = options.filter((o) => o.questionId === question.id);
    const selected = questionOptions.find(
      (o) => o.id === answer.selectedOptionId,
    );
    if (!answer.isUnknown && !selected)
      throw new OnboardingError(
        "Nội dung bài kiểm tra đã thay đổi. Vui lòng tải lại.",
      );
    const correct = !answer.isUnknown && !!selected?.isCorrect;
    const earnedPoints = correct ? question.points : 0;
    points += earnedPoints;
    await store
      .update(assessmentAnswers)
      .set({ isCorrect: answer.isUnknown ? null : correct, earnedPoints })
      .where(
        and(
          eq(assessmentAnswers.submissionId, attempt.id),
          eq(assessmentAnswers.questionId, question.id),
        ),
      );
    const ids = new Set(ctx.publication?.links.filter((link) => link.lessonId === question.lessonId)
      .map((link) => link.skillId));
    const concepts = (ctx.publication?.skills ?? []).filter((skill) => ids.has(skill.id)).map((skill) => ({ skill }));
    for (const { skill } of concepts) {
      let state = bySkill.get(skill.id);
      if (!state) {
        const [prior] = await store
          .select()
          .from(enrollmentSkillMastery)
          .where(
            and(
              eq(enrollmentSkillMastery.enrollmentId, enrollment.id),
              eq(enrollmentSkillMastery.skillId, skill.id),
            ),
          );
        state = {
          params: skill,
          probability: prior?.pMastery ?? skill.bktPInit,
          evidence: prior?.evidenceCount ?? 0,
          correct: prior?.correctCount ?? 0,
        };
        bySkill.set(skill.id, state);
      }
      // Unknown is persisted separately; it supplies no correct/incorrect likelihood evidence (D16).
      if (!answer.isUnknown) {
        state.probability = updateBkt(state.probability, correct, skill);
        state.evidence++;
        if (correct) state.correct++;
      }
    }
  }
  for (const [skillId, state] of bySkill) {
    const values = {
      pMastery: state.probability,
      evidenceCount: state.evidence,
      correctCount: state.correct,
      lastAssessedAt: new Date(),
      updatedAt: new Date(),
    };
    await store
      .insert(enrollmentSkillMastery)
      .values({ enrollmentId: enrollment.id, skillId, ...values })
      .onConflictDoUpdate({
        target: [
          enrollmentSkillMastery.enrollmentId,
          enrollmentSkillMastery.skillId,
        ],
        set: values,
      });
  }
  // An internal score satisfies the quiz record constraint; this diagnostic never counts toward a lesson grade.
  await store
    .update(assessmentSubmissions)
    .set({
      status: "graded",
      score: points,
      isPassed: null,
      submittedAt: new Date(),
      gradedAt: new Date(),
    })
    .where(eq(assessmentSubmissions.id, attempt.id));
}

export function createOnboardingService(db: Database) {
  return {
    async get(userId: string, courseId: string) {
      // A repeatable snapshot prevents mixing an old cursor with a concurrently submitted result.
      return db.transaction(
        async (tx) => view(tx, await context(tx, userId, courseId)),
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async execute(
      userId: string,
      courseId: string,
      command: OnboardingCommand,
    ) {
      return db.transaction(async (tx) => {
        const ctx = await context(tx, userId, courseId, true);
        const { enrollment: e, diagnostic, attempt } = ctx;
        let patch: Partial<Enrollment> = {};
        if (
          command.type === "goal-pick" ||
          command.type === "goal-next" ||
          command.type === "goal-back" ||
          command.type === "goal-skip" ||
          command.type === "goal-edit" ||
          command.type === "goal-cancel"
        ) {
          patch = goalTransition(e, command);
        } else {
          const decision = diagnosticPolicy(ctx, command);
          patch = decision.patch;
          if (decision.repeatedSubmit) return view(tx, ctx);
          if (
            decision.effect === "default-path" ||
            decision.effect === "preserve-path"
          ) {
            patch = {
              ...patch,
              ...(await defaultPath(
                tx,
                e,
                decision.effect === "preserve-path",
              )),
            };
          } else if (decision.effect === "create-attempt" && diagnostic) {
            await tx
              .insert(assessmentSubmissions)
              .values({
                enrollmentId: e.id,
                assessmentId: diagnostic.id,
                quizRevision: diagnostic.currentQuizRevision,
                attempt: (attempt?.attempt ?? 0) + 1,
              });
          } else if (
            decision.effect === "save-answer" &&
            command.type === "answer" &&
            attempt
          ) {
            const values = {
              selectedOptionId: command.optionId,
              isUnknown: command.unknown,
              isCorrect: null,
              earnedPoints: 0,
            };
            await tx
              .insert(assessmentAnswers)
              .values({
                submissionId: attempt.id,
                questionId: command.questionId,
                ...values,
              })
              .onConflictDoUpdate({
                target: [
                  assessmentAnswers.submissionId,
                  assessmentAnswers.questionId,
                ],
                set: values,
              });
            await tx
              .update(assessmentSubmissions)
              .set({ savedAt: new Date() })
              .where(eq(assessmentSubmissions.id, attempt.id));
          } else if (decision.effect === "grade") {
            await grade(tx, ctx);
          }
        }
        if (Object.keys(patch).length)
          await tx
            .update(studentEnrollments)
            .set(patch)
            .where(
              and(
                eq(studentEnrollments.id, e.id),
                eq(studentEnrollments.userId, userId),
              ),
            );
        return view(tx, await context(tx, userId, courseId));
      });
    },
  };
}
