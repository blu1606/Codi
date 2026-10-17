import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import {
  assessments,
  assessmentSubmissions,
  assessmentAnswers,
  quizQuestions,
  quizOptions,
} from "@codi-1/db/schema/assessments";
import { loadLearningLessonAccess } from "./learning-path-service";
import { LearningPathError } from "./learning-path-contract";
import {
  assessmentCommand,
  assignmentFileLimit,
  gradeQuiz,
  requireAssignment,
  requireEditableAssignment,
  requireQuizQuestions,
  requireUpload,
  type AssessmentCommand,
  type AssessmentView,
  type AssignmentDraft,
} from "./assessment-contract";

type Store = Pick<Database, "select" | "insert" | "update" | "delete">;
type Scope = {
  userId: string;
  courseId: string;
  lessonId: string;
  assessmentId: number;
};
type FileStore = {
  put: (key: string, buffer: Buffer) => Promise<void>;
  get: (key: string) => Promise<{ body: ReadableStream; size?: number }>;
};
const emptyDraft = (): AssignmentDraft => ({
  linkUrl: "",
  answerText: "",
  fileKey: null,
  fileName: null,
});

async function context(store: Store, scope: Scope, lock = false) {
  const { enrollment } = await loadLearningLessonAccess(
    store,
    scope.userId,
    scope.courseId,
    scope.lessonId,
    lock,
  );
  const query = store
    .select()
    .from(assessments)
    .where(
      and(
        eq(assessments.id, scope.assessmentId),
        eq(assessments.courseId, scope.courseId),
        eq(assessments.lessonId, scope.lessonId),
        eq(assessments.isDiagnostic, false),
        eq(assessments.status, "published"),
      ),
    );
  const [assessment] = await (lock ? query.for("share") : query);
  if (!assessment || !["quiz", "assignment"].includes(assessment.type))
    throw new LearningPathError("Không tìm thấy quiz hoặc bài tập.", 404);
  const submissions = await store
    .select()
    .from(assessmentSubmissions)
    .where(
      and(
        eq(assessmentSubmissions.assessmentId, assessment.id),
        eq(assessmentSubmissions.enrollmentId, enrollment.id),
      ),
    )
    .orderBy(desc(assessmentSubmissions.attempt));
  // Lock the row as well as enrollment: a lecturer grading concurrently wins before a resubmission can write.
  const [submission] =
    lock && submissions[0]
      ? await store
          .select()
          .from(assessmentSubmissions)
          .where(eq(assessmentSubmissions.id, submissions[0].id))
          .for("update")
      : submissions;
  const questions =
    assessment.type === "quiz"
      ? await store
          .select()
          .from(quizQuestions)
          .where(eq(quizQuestions.assessmentId, assessment.id))
          .orderBy(asc(quizQuestions.position))
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
        .orderBy(asc(quizOptions.position))
    : [];
  const answers =
    submission && assessment.type === "quiz"
      ? await store
          .select()
          .from(assessmentAnswers)
          .where(eq(assessmentAnswers.submissionId, submission.id))
      : [];
  return {
    assessment,
    enrollment,
    submission,
    submissions,
    questions: questions.map((q) => ({
      ...q,
      options: options.filter((o) => o.questionId === q.id),
    })),
    answers,
  };
}
type Context = Awaited<ReturnType<typeof context>>;
const fileUrl = (s: Scope, draft = false) =>
  `/api/learn/${encodeURIComponent(s.courseId)}/lessons/${encodeURIComponent(s.lessonId)}/assessments/${s.assessmentId}/file${draft ? "?draft=1" : ""}`;
function draftOf(ctx: Context): AssignmentDraft {
  const s = ctx.submission;
  return (
    s?.assignmentDraft ??
    (s
      ? {
          linkUrl: s.linkUrl ?? "",
          answerText: s.answerText ?? "",
          fileKey: s.fileUrl,
          fileName: s.fileName,
        }
      : emptyDraft())
  );
}
function project(ctx: Context, scope: Scope): AssessmentView {
  const { assessment: a, submission: s, questions, answers } = ctx;
  const submitted = s?.status === "graded" && !!s.submittedAt;
  const draft = s?.assignmentDraft;
  return {
    id: a.id,
    type: a.type as AssessmentView["type"],
    title: a.title,
    instructions: a.instructions,
    maxScore: a.maxScore,
    passingScore: a.passingScore ?? (a.type === "assignment" ? 50 : 70),
    submissionFormat: a.submissionFormat,
    maxFileSizeMb: assignmentFileLimit(a.maxFileSizeMb) / 1024 / 1024,
    rubric: a.rubric,
    dueDays: a.dueDays,
    questions: questions.map((q) => ({
      id: q.id,
      text: q.text,
      codeSnippet: q.codeSnippet,
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
    })),
    previousScore:
      ctx.submissions.find((x) => x.status === "graded" && x.id !== s?.id)
        ?.score ?? null,
    submission: s
      ? {
          id: s.id,
          attempt: s.attempt,
          status: s.status,
          score: s.score,
          quizPercent: s.quizPercent,
          isPassed: s.isPassed,
          submittedAt: s.submittedAt?.toISOString() ?? null,
          gradedAt: s.gradedAt?.toISOString() ?? null,
          feedback: s.feedback,
          fileName: s.fileName,
          fileUrl: s.fileUrl ? fileUrl(scope) : null,
          linkUrl: s.linkUrl,
          answerText: s.answerText,
          draft: draft
            ? {
                linkUrl: draft.linkUrl,
                answerText: draft.answerText,
                fileName: draft.fileName,
                fileUrl: draft.fileKey ? fileUrl(scope, true) : null,
              }
            : null,
          answers: answers.map((x) => ({
            questionId: x.questionId,
            optionId: x.selectedOptionId,
          })),
          // Never release correct options or explanations until this attempt is submitted.
          review: submitted
            ? answers.map((x) => ({
                questionId: x.questionId,
                correctOptionId:
                  questions
                    .find((q) => q.id === x.questionId)
                    ?.options.find((o) => o.isCorrect)?.id ?? 0,
                isCorrect: x.isCorrect === true,
                explanation:
                  questions.find((q) => q.id === x.questionId)?.explanation ??
                  null,
              }))
            : [],
        }
      : null,
  };
}

async function saveDraft(store: Store, ctx: Context, draft: AssignmentDraft) {
  requireEditableAssignment(ctx.submission?.status);
  if (ctx.submission)
    await store
      .update(assessmentSubmissions)
      .set({ assignmentDraft: draft, savedAt: new Date() })
      .where(eq(assessmentSubmissions.id, ctx.submission.id));
  else
    await store
      .insert(assessmentSubmissions)
      .values({
        assessmentId: ctx.assessment.id,
        enrollmentId: ctx.enrollment.id,
        attempt: 1,
        assignmentDraft: draft,
      });
}
export function createAssessmentService(db: Database, files?: FileStore) {
  return {
    async get(scope: Scope) {
      return db.transaction(
        async (tx) => project(await context(tx, scope), scope),
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async execute(scope: Scope, input: AssessmentCommand) {
      const command = assessmentCommand.parse(input);
      return db.transaction(async (tx) => {
        const ctx = await context(tx, scope, true);
        const { assessment: a, submission: s, questions } = ctx;
        const now = new Date();
        if (command.type.startsWith("quiz-")) {
          if (a.type !== "quiz")
            throw new LearningPathError("Đây không phải quiz.", 400);
          requireQuizQuestions(questions);
          if (command.type === "quiz-open" || command.type === "quiz-retake") {
            if (
              command.type === "quiz-retake" &&
              (!s || s.id !== command.submissionId || s.status !== "graded")
            )
              throw new LearningPathError(
                "Lần làm đã thay đổi. Hãy tải lại.",
                409,
              );
            if (!s || command.type === "quiz-retake")
              await tx
                .insert(assessmentSubmissions)
                .values({
                  assessmentId: a.id,
                  enrollmentId: ctx.enrollment.id,
                  attempt: (s?.attempt ?? 0) + 1,
                });
          } else if (
            command.type === "quiz-answer" ||
            command.type === "quiz-submit"
          ) {
            if (!s || s.id !== command.submissionId || s.status !== "draft")
              throw new LearningPathError(
                "Lần làm đã nộp hoặc đã thay đổi. Hãy tải lại.",
                409,
              );
            if (command.type === "quiz-answer") {
              const q = questions.find((q) => q.id === command.questionId);
              if (!q?.options.some((o) => o.id === command.optionId))
                throw new LearningPathError("Đáp án không thuộc câu hỏi.", 400);
              await tx
                .insert(assessmentAnswers)
                .values({
                  submissionId: s.id,
                  questionId: q.id,
                  selectedOptionId: command.optionId,
                })
                .onConflictDoUpdate({
                  target: [
                    assessmentAnswers.submissionId,
                    assessmentAnswers.questionId,
                  ],
                  set: {
                    selectedOptionId: command.optionId,
                    isCorrect: null,
                    earnedPoints: 0,
                  },
                });
            } else {
              const missing = questions.filter(
                (q) =>
                  !ctx.answers.some(
                    (x) => x.questionId === q.id && x.selectedOptionId !== null,
                  ),
              ).length;
              if (missing && !command.confirmUnanswered)
                throw new LearningPathError(
                  `Còn ${missing} câu chưa trả lời. Câu chưa trả lời sẽ được tính là sai.`,
                  409,
                );
              const result = gradeQuiz(
                questions,
                ctx.answers,
                a.maxScore,
                a.passingScore ?? 70,
              );
              for (const r of result.review) {
                await tx
                  .insert(assessmentAnswers)
                  .values({
                    submissionId: s.id,
                    questionId: r.questionId,
                    selectedOptionId:
                      ctx.answers.find((x) => x.questionId === r.questionId)
                        ?.selectedOptionId ?? null,
                    isCorrect: r.isCorrect,
                    earnedPoints: r.isCorrect
                      ? questions.find((q) => q.id === r.questionId)!.points
                      : 0,
                  })
                  .onConflictDoUpdate({
                    target: [
                      assessmentAnswers.submissionId,
                      assessmentAnswers.questionId,
                    ],
                    set: {
                      isCorrect: r.isCorrect,
                      earnedPoints: r.isCorrect
                        ? questions.find((q) => q.id === r.questionId)!.points
                        : 0,
                    },
                  });
              }
              await tx
                .update(assessmentSubmissions)
                .set({
                  status: "graded",
                  score: result.score,
                  quizPercent: result.percent,
                  isPassed: result.isPassed,
                  submittedAt: now,
                  gradedAt: now,
                  savedAt: now,
                })
                .where(eq(assessmentSubmissions.id, s.id));
            }
          }
        } else {
          if (a.type !== "assignment")
            throw new LearningPathError("Đây không phải bài tập.", 400);
          requireEditableAssignment(s?.status);
          if (command.type === "assignment-cancel") {
            if (s)
              await tx
                .update(assessmentSubmissions)
                .set({ assignmentDraft: null })
                .where(eq(assessmentSubmissions.id, s.id));
          } else if (
            command.type === "assignment-draft" ||
            command.type === "assignment-submit"
          ) {
            const draft = {
              ...draftOf(ctx),
              linkUrl: command.linkUrl,
              answerText: command.answerText,
            };
            if (command.type === "assignment-draft")
              await saveDraft(tx, ctx, draft);
            else {
              requireAssignment(a.submissionFormat, draft);
              const values = {
                status: "pending" as const,
                answerText: draft.answerText,
                linkUrl: draft.linkUrl || null,
                fileUrl: draft.fileKey,
                fileName: draft.fileName,
                assignmentDraft: null,
                savedAt: now,
                submittedAt: now,
              };
              if (s)
                await tx
                  .update(assessmentSubmissions)
                  .set(values)
                  .where(eq(assessmentSubmissions.id, s.id));
              else
                await tx
                  .insert(assessmentSubmissions)
                  .values({
                    assessmentId: a.id,
                    enrollmentId: ctx.enrollment.id,
                    attempt: 1,
                    ...values,
                  });
            }
          }
        }
        return project(await context(tx, scope), scope);
      });
    },
    async uploadLimit(scope: Scope) {
      const ctx = await context(db, scope);
      if (
        ctx.assessment.type !== "assignment" ||
        !["file", "file_or_link"].includes(
          ctx.assessment.submissionFormat ?? "",
        )
      )
        throw new LearningPathError("Bài tập không nhận tệp.", 400);
      requireEditableAssignment(ctx.submission?.status);
      return assignmentFileLimit(ctx.assessment.maxFileSizeMb);
    },
    async upload(scope: Scope, name: string, buffer: Buffer) {
      const limit = await this.uploadLimit(scope);
      requireUpload(buffer.length, name, limit);
      if (!files)
        throw new LearningPathError(
          "Chưa thể tải tệp lên. Vui lòng thử lại sau.",
          503,
        );
      const key = `assignments/${randomUUID()}`;
      await files.put(key, buffer);
      return db.transaction(async (tx) => {
        const ctx = await context(tx, scope, true);
        if (
          !["file", "file_or_link"].includes(
            ctx.assessment.submissionFormat ?? "",
          )
        )
          throw new LearningPathError("Bài tập không nhận tệp.", 400);
        requireUpload(
          buffer.length,
          name,
          assignmentFileLimit(ctx.assessment.maxFileSizeMb),
        );
        await saveDraft(tx, ctx, {
          ...draftOf(ctx),
          fileKey: key,
          fileName: name,
        });
        return project(await context(tx, scope), scope);
      });
    },
    async download(scope: Scope, draft: boolean) {
      const ctx = await context(db, scope);
      const s = ctx.submission;
      const key = draft ? s?.assignmentDraft?.fileKey : s?.fileUrl;
      const name = draft ? s?.assignmentDraft?.fileName : s?.fileName;
      if (!key?.startsWith("assignments/") || !name)
        throw new LearningPathError("Không tìm thấy tệp bài làm.", 404);
      if (!files)
        throw new LearningPathError(
          "Chưa thể tải tệp. Vui lòng thử lại sau.",
          503,
        );
      return { ...(await files.get(key)), name };
    },
  };
}
