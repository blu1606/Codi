import { and, asc, desc, eq, max, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { assessments } from "@codi-1/db/schema/assessments";
import { courses } from "@codi-1/db/schema/courses";
import { lessonMaterials } from "@codi-1/db/schema/course-content";
import { aiInteractionLogs } from "@codi-1/db/schema/ai-interaction-logs";
import {
  conversationMessages,
  courseConversations,
} from "@codi-1/db/schema/interaction";
import { loadLearningLessonAccess } from "./learning-path-service";
import { createNotificationService } from "./notification-service";
import {
  nextHintLevel,
  type TutorEscalation,
  type TutorLessonContext,
  type TutorLessonMeta,
} from "./ai-tutor-contract";

type Store = Pick<Database, "select" | "insert" | "update" | "execute">;
export type TutorScope = {
  userId: string;
  courseId: string;
  lessonId: string;
  enrollmentId: number;
  lesson: TutorLessonContext;
  instructorId: string | null;
  lecturerName: string | null;
};
export type TurnLog = {
  model: string | null;
  question: string;
  answer: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
  error: string | null;
};

// Hint usage lives in ai_interaction_logs (hint_level) so the lecturer can read it; deleting a chat keeps it.
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

export function createTutorService(db: Database) {
  return {
    /** Same role / ownership / prerequisite gate as the lesson player; every lesson-chat call goes through it. */
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
    /** What the panel shows around a lesson chat: hint ladder, lecturer and the private conversation status. */
    async meta(scope: TutorScope): Promise<TutorLessonMeta> {
      const [level, [conversation]] = await Promise.all([
        hintLevel(db, scope),
        db
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
        ? await db
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
        courseId: scope.courseId,
        lessonId: scope.lessonId,
        lessonTitle: scope.lesson.title,
        isCode: scope.lesson.isCode,
        hintLevel: level,
        lecturerName: scope.lecturerName,
        conversation: conversation
          ? {
              id: conversation.id,
              replied: !!reply,
              resolved: conversation.status === "resolved",
              lastReply: reply?.body ?? null,
            }
          : null,
      };
    },
    /**
     * idle → thinking (hint): records the next ladder step before the model runs (§13 guard: code lessons,
     * level ≤ 3). One step at a time per learner + lesson, so two tabs cannot both take step 2.
     */
    async beginHint(scope: TutorScope, question: string) {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`tutor-hint:${scope.userId}:${scope.lessonId}`}))`,
        );
        const level = nextHintLevel(
          await hintLevel(tx, scope),
          scope.lesson.isCode,
        );
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
        return { level, logId: log!.id };
      });
    },
    /**
     * A retry of a hint step that was already begun: the same level and its log row, never a new step.
     * Null when no row exists for that level (the caller then begins one).
     */
    async resumeHint(scope: TutorScope, level: number) {
      const [log] = await db
        .select({ id: aiInteractionLogs.id })
        .from(aiInteractionLogs)
        .where(
          and(
            eq(aiInteractionLogs.userId, scope.userId),
            eq(aiInteractionLogs.lessonId, scope.lessonId),
            eq(aiInteractionLogs.requestType, "ask_assistant"),
            eq(aiInteractionLogs.hintLevel, level),
          ),
        )
        .orderBy(desc(aiInteractionLogs.id))
        .limit(1);
      return log ? { level, logId: log.id } : null;
    },
    /** The audit row for a lesson turn (the hint step's row when there is one). */
    async logTurn(scope: TutorScope, logId: number | null, log: TurnLog) {
      const audit = {
        model: log.model,
        aiResponse: log.answer,
        promptTokens: log.promptTokens,
        completionTokens: log.completionTokens,
        latencyMs: Math.max(0, Math.round(log.latencyMs)),
        isSuccess: !log.error,
        errorMessage: log.error?.slice(0, 500) ?? null,
      };
      if (logId)
        await db
          .update(aiInteractionLogs)
          .set(audit)
          .where(eq(aiInteractionLogs.id, logId));
      else
        await db.insert(aiInteractionLogs).values({
          ...audit,
          userId: scope.userId,
          enrollmentId: scope.enrollmentId,
          courseId: scope.courseId,
          lessonId: scope.lessonId,
          requestType: "ask_assistant",
          userPrompt: log.question,
        });
    },
    /** S11h / Flow L6d: private conversation with the course lecturer, AI context per the learner's checkboxes. */
    async escalate(scope: TutorScope, command: TutorEscalation, summary: string) {
      await db.transaction(async (tx) => {
        const [conversation] = await tx
          .insert(courseConversations)
          .values({
            courseId: scope.courseId,
            lessonId: scope.lessonId,
            learnerId: scope.userId,
            lecturerId: scope.instructorId,
            fromAi: true,
            aiContext: {
              summary: command.withSummary ? summary : "",
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
      return this.meta(scope);
    },
  };
}
