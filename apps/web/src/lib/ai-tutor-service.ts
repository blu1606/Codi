import { and, asc, desc, eq, inArray, lt, max, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { assessments } from "@codi-1/db/schema/assessments";
import { courses } from "@codi-1/db/schema/courses";
import { lessonMaterials } from "@codi-1/db/schema/course-content";
import { aiInteractionLogs } from "@codi-1/db/schema/ai-interaction-logs";
import { aiTutorMessages } from "@codi-1/db/schema/ai-tutor";
import {
  conversationMessages,
  courseConversations,
} from "@codi-1/db/schema/interaction";
import { LearningPathError } from "./learning-path-contract";
import { loadLearningLessonAccess } from "./learning-path-service";
import { createNotificationService } from "./notification-service";
import {
  escalationSummary,
  nextHintLevel,
  retryRows,
  TUTOR_LOG_MAX,
  TUTOR_STOPPED_TEXT,
  type TutorCommand,
  type TutorDiff,
  type TutorLessonContext,
  type TutorMessage,
  type TutorTurnCommand,
  type TutorView,
} from "./ai-tutor-contract";

type Store = Pick<
  Database,
  "select" | "insert" | "update" | "delete" | "execute"
>;
export type TutorScope = {
  userId: string;
  courseId: string;
  lessonId: string;
  enrollmentId: number;
  lesson: TutorLessonContext;
  instructorId: string | null;
  lecturerName: string | null;
};
export type TurnOutcome =
  | { kind: "answer"; text: string; lines: number[]; diff: TutorDiff | null }
  | { kind: "stopped"; text: string }
  | { kind: "error"; message: string };
export type TurnLog = {
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
};

const owned = (scope: TutorScope) =>
  and(
    eq(aiTutorMessages.userId, scope.userId),
    eq(aiTutorMessages.lessonId, scope.lessonId),
  );

function toMessage(row: typeof aiTutorMessages.$inferSelect): TutorMessage {
  return {
    id: row.id,
    role: row.role,
    text: row.body,
    lines: row.lines,
    diff: row.diff ?? null,
    stopped: row.stopped,
    vote: row.vote,
    reason: row.voteReason,
    at: row.createdAt.toISOString(),
  };
}

async function thread(store: Store, scope: TutorScope) {
  const rows = await store
    .select()
    .from(aiTutorMessages)
    .where(owned(scope))
    .orderBy(asc(aiTutorMessages.id));
  return rows.map(toMessage);
}

// Hint usage lives in ai_interaction_logs (hint_level) so the lecturer can read it; clearing the thread keeps it.
async function hintLevel(store: Store, scope: TutorScope) {
  const [row] = await store
    .select({ level: max(aiInteractionLogs.hintLevel) })
    .from(aiInteractionLogs)
    .where(
      and(
        eq(aiInteractionLogs.userId, scope.userId),
        eq(aiInteractionLogs.lessonId, scope.lessonId),
        eq(aiInteractionLogs.requestType, "ask_assistant"),
      ),
    );
  return row?.level ?? 0;
}

async function prune(store: Store, scope: TutorScope) {
  const [edge] = await store
    .select({ id: aiTutorMessages.id })
    .from(aiTutorMessages)
    .where(owned(scope))
    .orderBy(desc(aiTutorMessages.id))
    .offset(TUTOR_LOG_MAX - 1)
    .limit(1);
  if (edge)
    await store
      .delete(aiTutorMessages)
      .where(and(owned(scope), lt(aiTutorMessages.id, edge.id)));
}

async function insertMessage(
  store: Store,
  scope: TutorScope,
  values: Omit<
    typeof aiTutorMessages.$inferInsert,
    "enrollmentId" | "userId" | "courseId" | "lessonId"
  >,
) {
  await store.insert(aiTutorMessages).values({
    ...values,
    enrollmentId: scope.enrollmentId,
    userId: scope.userId,
    courseId: scope.courseId,
    lessonId: scope.lessonId,
  });
}

// One turn at a time per learner + lesson: hint levels and pruning must not race.
const lockThread = (store: Store, scope: TutorScope) =>
  store.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`tutor:${scope.userId}:${scope.lessonId}`}))`,
  );

export function createTutorService(db: Database) {
  async function view(store: Store, scope: TutorScope): Promise<TutorView> {
    const [messages, level, [conversation]] = await Promise.all([
      thread(store, scope),
      hintLevel(store, scope),
      store
        .select({
          id: courseConversations.id,
          status: courseConversations.status,
        })
        .from(courseConversations)
        .where(
          and(
            eq(courseConversations.learnerId, scope.userId),
            eq(courseConversations.lessonId, scope.lessonId),
          ),
        )
        .orderBy(desc(courseConversations.id))
        .limit(1),
    ]);
    const [reply] = conversation
      ? await store
          .select({ body: conversationMessages.body })
          .from(conversationMessages)
          .where(
            and(
              eq(conversationMessages.conversationId, conversation.id),
              eq(conversationMessages.isLecturer, true),
            ),
          )
          .orderBy(desc(conversationMessages.id))
          .limit(1)
      : [];
    return {
      lessonTitle: scope.lesson.title,
      isCode: scope.lesson.isCode,
      hintLevel: level,
      lecturerName: scope.lecturerName,
      messages,
      conversation: conversation
        ? {
            id: conversation.id,
            replied: !!reply,
            resolved: conversation.status === "resolved",
            lastReply: reply?.body ?? null,
          }
        : null,
    };
  }

  return {
    /** Same role / ownership / prerequisite gate as the lesson player; every tutor call goes through it. */
    async scope(
      userId: string,
      courseId: string,
      lessonId: string,
    ): Promise<TutorScope> {
      return db.transaction(
        async (tx) => {
          const { accessible, enrollment, lesson } =
            await loadLearningLessonAccess(tx, userId, courseId, lessonId);
          const [course] = await tx
            .select({ instructorId: courses.instructorId, name: user.name })
            .from(courses)
            .leftJoin(user, eq(user.id, courses.instructorId))
            .where(eq(courses.id, courseId))
            .limit(1);
          const [coding] = await tx
            .select({ id: assessments.id })
            .from(assessments)
            .where(
              and(
                eq(assessments.courseId, courseId),
                eq(assessments.lessonId, lessonId),
                eq(assessments.type, "coding"),
                eq(assessments.status, "published"),
                eq(assessments.isDiagnostic, false),
              ),
            )
            .limit(1);
          const materials = await tx
            .select({
              title: lessonMaterials.title,
              type: lessonMaterials.type,
            })
            .from(lessonMaterials)
            .where(eq(lessonMaterials.lessonId, lessonId))
            .orderBy(asc(lessonMaterials.position));
          return {
            userId,
            courseId,
            lessonId,
            enrollmentId: enrollment.id,
            lesson: {
              title: lesson.title,
              chapterTitle: accessible.chapterTitle ?? null,
              description: lesson.description,
              body: lesson.body,
              materials: materials.map((m) => `${m.title} (${m.type})`),
              isCode: !!coding,
            },
            instructorId: course?.instructorId ?? null,
            lecturerName: course?.name ?? null,
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    get(scope: TutorScope) {
      return view(db, scope);
    },
    /**
     * idle → thinking: records the learner message (and the hint step) before the model runs,
     * so a reload mid-turn still shows the question. Returns the prior turns for the prompt.
     */
    async beginTurn(scope: TutorScope, command: TutorTurnCommand) {
      return db.transaction(async (tx) => {
        await lockThread(tx, scope);
        let history = await thread(tx, scope);
        if (command.type === "ask" && command.retryOf) {
          const ids = retryRows(history, command.retryOf);
          await tx
            .delete(aiTutorMessages)
            .where(and(owned(scope), inArray(aiTutorMessages.id, ids)));
          history = history.filter((m) => !ids.includes(m.id));
        }
        let level: number | null = null;
        let logId: number | null = null;
        let question: string;
        if (command.type === "hint") {
          level = nextHintLevel(
            await hintLevel(tx, scope),
            scope.lesson.isCode,
          );
          question = `Cho mình gợi ý ${level}/3`;
          const [log] = await tx
            .insert(aiInteractionLogs)
            .values({
              userId: scope.userId,
              enrollmentId: scope.enrollmentId,
              courseId: scope.courseId,
              lessonId: scope.lessonId,
              requestType: "ask_assistant",
              hintLevel: level,
              userPrompt: question,
              isSuccess: false,
            })
            .returning({ id: aiInteractionLogs.id });
          logId = log!.id;
        } else question = command.question;
        await insertMessage(tx, scope, { role: "user", body: question });
        await prune(tx, scope);
        return { history, question, level, logId };
      });
    },
    /** thinking/streaming → answered | stopped | error, plus the audit row in ai_interaction_logs. */
    async finishTurn(
      scope: TutorScope,
      turn: { question: string; logId: number | null },
      outcome: TurnOutcome,
      log: TurnLog,
    ) {
      await db.transaction(async (tx) => {
        await lockThread(tx, scope);
        const audit = {
          model: log.model,
          aiResponse: outcome.kind === "error" ? null : outcome.text,
          promptTokens: log.promptTokens,
          completionTokens: log.completionTokens,
          latencyMs: Math.max(0, Math.round(log.latencyMs)),
          isSuccess: outcome.kind !== "error",
          errorMessage:
            outcome.kind === "error"
              ? outcome.message.slice(0, 500)
              : outcome.kind === "stopped"
                ? "stopped by learner"
                : null,
        };
        let logId = turn.logId;
        if (logId)
          await tx
            .update(aiInteractionLogs)
            .set(audit)
            .where(eq(aiInteractionLogs.id, logId));
        else {
          const [row] = await tx
            .insert(aiInteractionLogs)
            .values({
              ...audit,
              userId: scope.userId,
              enrollmentId: scope.enrollmentId,
              courseId: scope.courseId,
              lessonId: scope.lessonId,
              requestType: "ask_assistant",
              userPrompt: turn.question,
            })
            .returning({ id: aiInteractionLogs.id });
          logId = row!.id;
        }
        if (outcome.kind === "error")
          await insertMessage(tx, scope, {
            role: "error",
            body: turn.question,
            logId,
          });
        else
          await insertMessage(tx, scope, {
            role: "ai",
            body: outcome.text.trim() || TUTOR_STOPPED_TEXT,
            stopped: outcome.kind === "stopped",
            lines: outcome.kind === "answer" ? outcome.lines : [],
            diff: outcome.kind === "answer" ? outcome.diff : null,
            logId,
          });
        await prune(tx, scope);
      });
      return view(db, scope);
    },
    /** → rate_limited: the question stays visible with the warning, nothing is sent to the model. */
    async recordLimit(scope: TutorScope, question: string) {
      await db.transaction(async (tx) => {
        await lockThread(tx, scope);
        await insertMessage(tx, scope, { role: "user", body: question });
        await insertMessage(tx, scope, { role: "limit", body: "" });
        await prune(tx, scope);
      });
      return view(db, scope);
    },
    async execute(
      scope: TutorScope,
      command: Exclude<TutorCommand, TutorTurnCommand>,
    ) {
      if (command.type === "vote") {
        const updated = await db
          .update(aiTutorMessages)
          .set({
            vote: command.vote,
            voteReason:
              command.vote === "down" ? (command.reason ?? null) : null,
          })
          .where(
            and(
              owned(scope),
              eq(aiTutorMessages.id, command.messageId),
              eq(aiTutorMessages.role, "ai"),
            ),
          )
          .returning({ id: aiTutorMessages.id });
        if (!updated.length)
          throw new LearningPathError("Không tìm thấy câu trả lời.", 404);
      } else if (command.type === "diff") {
        const [row] = await db
          .select({ diff: aiTutorMessages.diff })
          .from(aiTutorMessages)
          .where(and(owned(scope), eq(aiTutorMessages.id, command.messageId)));
        if (!row?.diff)
          throw new LearningPathError("Không tìm thấy đề xuất thay đổi.", 404);
        await db
          .update(aiTutorMessages)
          .set({ diff: { ...row.diff, state: command.state } })
          .where(and(owned(scope), eq(aiTutorMessages.id, command.messageId)));
      } else if (command.type === "clear") {
        await db.delete(aiTutorMessages).where(owned(scope));
      } else {
        // S11h / Flow L6d: private conversation with the course lecturer, AI context per the learner's checkboxes.
        await db.transaction(async (tx) => {
          const messages = await thread(tx, scope);
          const [conversation] = await tx
            .insert(courseConversations)
            .values({
              courseId: scope.courseId,
              lessonId: scope.lessonId,
              learnerId: scope.userId,
              lecturerId: scope.instructorId,
              fromAi: true,
              aiContext: {
                summary: command.withSummary ? escalationSummary(messages) : "",
                code: scope.lesson.isCode ? (command.code ?? "") : "",
                failingTest: command.failingTest ?? null,
              },
            })
            .returning({ id: courseConversations.id });
          await tx.insert(conversationMessages).values({
            conversationId: conversation!.id,
            authorId: scope.userId,
            isLecturer: false,
            body: command.text,
          });
          if (scope.instructorId)
            await createNotificationService(tx).notify(
              scope.instructorId,
              "Câu hỏi riêng từ học viên",
              `Bài "${scope.lesson.title}"`,
              `/dashboard/lecturer/questions?view=conversations&id=${conversation!.id}`,
            );
        });
      }
      return view(db, scope);
    },
  };
}
