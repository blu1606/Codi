import { createHash, randomUUID } from "node:crypto";
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
  quizTransition,
  assignmentTransition,
  requireEditableAssignment,
  requireQuizQuestions,
  requireUpload,
  type AssessmentCommand,
  type AssessmentView,
  type AssignmentDraft,
  type PreparedUpload,
} from "./assessment-contract";
import {
  signUploadTicket,
  verifyUploadTicket,
} from "./assessment-upload-ticket";

type Store = Pick<Database, "select" | "insert" | "update" | "delete">;
type Scope = {
  userId: string;
  courseId: string;
  lessonId: string;
  assessmentId: number;
};
export type FileStore = {
  presign: (key: string, size: number, expiresIn: number) => Promise<string>;
  head: (key: string) => Promise<{ size: number; etag: string }>;
  copy: (source: string, key: string, etag: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
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
    previousQuizPercent:
      ctx.submissions.find((x) => x.status === "graded" && x.id !== s?.id)
        ?.quizPercent ?? null,
    unavailableReason: a.type === "quiz" ? quizUnavailable(questions) : null,
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
  const [saved] = ctx.submission
    ? await store
        .update(assessmentSubmissions)
        .set({ assignmentDraft: draft, savedAt: new Date() })
        .where(eq(assessmentSubmissions.id, ctx.submission.id))
        .returning()
    : await store
        .insert(assessmentSubmissions)
        .values({
          assessmentId: ctx.assessment.id,
          enrollmentId: ctx.enrollment.id,
          attempt: 1,
          assignmentDraft: draft,
        })
        .returning();
  return saved!;
}
function quizUnavailable(questions: Context["questions"]) {
  try {
    requireQuizQuestions(questions);
    return null;
  } catch (error) {
    return error instanceof LearningPathError
      ? error.message
      : "Quiz chưa sẵn sàng.";
  }
}
const versionOf = (ctx: Context) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        ctx.submission
          ? [
              ctx.submission.id,
              ctx.submission.status,
              ctx.submission.savedAt?.toISOString(),
              ctx.submission.submittedAt?.toISOString(),
              ctx.submission.fileUrl,
              ctx.submission.assignmentDraft,
            ]
          : null,
      ),
    )
    .digest("hex");
function requireFileAssignment(ctx: Context) {
  if (
    ctx.assessment.type !== "assignment" ||
    !["file", "file_or_link"].includes(ctx.assessment.submissionFormat ?? "")
  )
    throw new LearningPathError("Bài tập không nhận tệp.", 400);
  requireEditableAssignment(ctx.submission?.status);
}
const referencedKeys = (ctx: Context) =>
  [ctx.submission?.fileUrl, ctx.submission?.assignmentDraft?.fileKey].filter(
    (key): key is string => !!key,
  );
const unavailable = async (): Promise<never> => {
  throw new LearningPathError(
    "Kho tệp bài tập chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
    503,
  );
};
const unavailableFiles: FileStore = {
  presign: unavailable,
  head: unavailable,
  copy: unavailable,
  delete: unavailable,
  get: unavailable,
};
export function createAssessmentService(
  db: Database,
  files: FileStore = unavailableFiles,
  uploadSecret = "",
) {
  async function cleanup(keys: string[]) {
    for (const key of new Set(keys)) {
      try {
        await files.delete(key);
      } catch {
        console.error(
          "Assignment object cleanup failed; run the documented storage sweep.",
        );
      }
    }
  }
  return {
    async get(scope: Scope) {
      return db.transaction(
        async (tx) => project(await context(tx, scope), scope),
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async execute(scope: Scope, input: AssessmentCommand) {
      const command = assessmentCommand.parse(input);
      const obsolete: string[] = [];
      const view = await db.transaction(async (tx) => {
        const ctx = await context(tx, scope, true);
        const { assessment: a, submission: s, questions } = ctx;
        const now = new Date();
        if (
          command.type === "quiz-open" ||
          command.type === "quiz-retake" ||
          command.type === "quiz-answer" ||
          command.type === "quiz-submit"
        ) {
          const transition = quizTransition(
            {
              type: a.type,
              submission: s,
              questions,
              answers: ctx.answers,
              maxScore: a.maxScore,
              passingScore: a.passingScore ?? 70,
            },
            command,
          );
          if (transition.type === "create") {
            const [created] = await tx
              .insert(assessmentSubmissions)
              .values({
                assessmentId: a.id,
                enrollmentId: ctx.enrollment.id,
                attempt: transition.attempt,
              })
              .returning();
            ctx.submission = created!;
            ctx.submissions = [created!, ...ctx.submissions];
            ctx.answers = [];
          } else if (transition.type === "answer") {
            const values = {
              submissionId: transition.submissionId,
              questionId: transition.questionId,
              selectedOptionId: transition.optionId,
              isCorrect: null,
              earnedPoints: 0,
            };
            const [answer] = await tx
              .insert(assessmentAnswers)
              .values(values)
              .onConflictDoUpdate({
                target: [
                  assessmentAnswers.submissionId,
                  assessmentAnswers.questionId,
                ],
                set: {
                  selectedOptionId: transition.optionId,
                  isCorrect: null,
                  earnedPoints: 0,
                },
              })
              .returning();
            ctx.answers = [
              ...ctx.answers.filter(
                (x) => x.questionId !== transition.questionId,
              ),
              answer!,
            ];
          } else if (transition.type === "grade") {
            const result = transition.result;
            const values = result.review.map((r) => ({
              submissionId: transition.submissionId,
              questionId: r.questionId,
              selectedOptionId:
                ctx.answers.find((x) => x.questionId === r.questionId)
                  ?.selectedOptionId ?? null,
              isCorrect: r.isCorrect,
              earnedPoints: r.isCorrect
                ? questions.find((q) => q.id === r.questionId)!.points
                : 0,
            }));
            // Enrollment/submission locks serialize answers, so replace the attempt's answers in one batch.
            await tx
              .delete(assessmentAnswers)
              .where(
                eq(assessmentAnswers.submissionId, transition.submissionId),
              );
            ctx.answers = await tx
              .insert(assessmentAnswers)
              .values(values)
              .returning();
            const [graded] = await tx
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
              .where(eq(assessmentSubmissions.id, transition.submissionId))
              .returning();
            ctx.submission = graded!;
          }
        } else {
          const before = referencedKeys(ctx);
          const transition = assignmentTransition(
            {
              type: a.type,
              submission: s,
              draft: draftOf(ctx),
              format: a.submissionFormat,
            },
            command,
          );
          if (transition.type === "cancel") {
            const [updated] = await tx
              .update(assessmentSubmissions)
              .set({ assignmentDraft: null, savedAt: now })
              .where(eq(assessmentSubmissions.id, s!.id))
              .returning();
            ctx.submission = updated!;
          } else if (transition.type === "draft") {
            ctx.submission = await saveDraft(tx, ctx, transition.draft);
          } else {
            const draft = transition.draft;
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
            const [updated] = s
              ? await tx
                  .update(assessmentSubmissions)
                  .set(values)
                  .where(eq(assessmentSubmissions.id, s.id))
                  .returning()
              : await tx
                  .insert(assessmentSubmissions)
                  .values({
                    assessmentId: a.id,
                    enrollmentId: ctx.enrollment.id,
                    attempt: 1,
                    ...values,
                  })
                  .returning();
            ctx.submission = updated!;
          }
          obsolete.push(
            ...before.filter((key) => !referencedKeys(ctx).includes(key)),
          );
        }
        // Reuse the authorized context: no second learning-path load while holding enrollment lock.
        return project(ctx, scope);
      });
      await cleanup(obsolete);
      return view;
    },
    async prepareUpload(
      scope: Scope,
      name: string,
      size: number,
    ): Promise<PreparedUpload> {
      const ctx = await context(db, scope);
      requireFileAssignment(ctx);
      requireUpload(
        size,
        name,
        assignmentFileLimit(ctx.assessment.maxFileSizeMb),
      );
      const expiresIn = 300;
      if (!uploadSecret)
        throw new LearningPathError(
          "Kho tệp bài tập chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
          503,
        );
      const key = `assignment-uploads/${randomUUID()}`;
      const url = await files.presign(key, size, expiresIn);
      const token = signUploadTicket(
        {
          ...scope,
          key,
          name,
          size,
          version: versionOf(ctx),
          expiresAt: Date.now() + expiresIn * 1000,
        },
        uploadSecret,
      );
      return { url, token, expiresIn };
    },
    async confirmUpload(scope: Scope, token: string) {
      const ticket = verifyUploadTicket(token, uploadSecret);
      if (
        ticket.userId !== scope.userId ||
        ticket.courseId !== scope.courseId ||
        ticket.lessonId !== scope.lessonId ||
        ticket.assessmentId !== scope.assessmentId
      )
        throw new LearningPathError(
          "Phiên tải tệp không thuộc bài làm này.",
          403,
        );
      // Check ownership before accessing storage, then recheck it with locks before writing.
      const access = await context(db, scope);
      requireFileAssignment(access);
      if (ticket.version !== versionOf(access))
        throw new LearningPathError(
          "Bài làm đã thay đổi. Hãy tải lại trước khi tải tệp lên.",
          409,
        );
      const head = await files.head(ticket.key);
      requireUpload(
        head.size,
        ticket.name,
        assignmentFileLimit(access.assessment.maxFileSizeMb),
      );
      if (head.size !== ticket.size)
        throw new LearningPathError(
          "Kích thước tệp đã thay đổi. Hãy tải lên lại.",
          400,
        );
      const key = `assignments/${randomUUID()}`;
      const obsolete: string[] = [];
      let committed = false;
      try {
        const view = await db.transaction(async (tx) => {
          const ctx = await context(tx, scope, true);
          requireFileAssignment(ctx);
          if (ticket.version !== versionOf(ctx))
            throw new LearningPathError(
              "Bài làm đã thay đổi. Hãy tải lại trước khi tải tệp lên.",
              409,
            );
          requireUpload(
            head.size,
            ticket.name,
            assignmentFileLimit(ctx.assessment.maxFileSizeMb),
          );
          // Copy with If-Match to an immutable key: reusing a presigned PUT cannot mutate submitted work.
          await files.copy(ticket.key, key, head.etag);
          const before = referencedKeys(ctx);
          ctx.submission = await saveDraft(tx, ctx, {
            ...draftOf(ctx),
            fileKey: key,
            fileName: ticket.name,
          });
          obsolete.push(
            ...before.filter((old) => !referencedKeys(ctx).includes(old)),
          );
          return project(ctx, scope);
        });
        committed = true;
        await cleanup([ticket.key, ...obsolete]);
        return view;
      } finally {
        if (!committed) await cleanup([key]);
      }
    },
    async download(scope: Scope, draft: boolean) {
      const ctx = await context(db, scope);
      const s = ctx.submission;
      const key = draft ? s?.assignmentDraft?.fileKey : s?.fileUrl;
      const name = draft ? s?.assignmentDraft?.fileName : s?.fileName;
      if (!key?.startsWith("assignments/") || !name)
        throw new LearningPathError("Không tìm thấy tệp bài làm.", 404);
      return { ...(await files.get(key)), name };
    },
  };
}
