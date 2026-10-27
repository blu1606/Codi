import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import {
  conversationMessages,
  courseConversations,
  courseDiscussions,
  courseLessons,
  courses,
  user as userTable,
} from "@codi-1/db";
import { createNotificationService } from "./notification-service";

import {
  validateQuestionText,
  type LessonQuestionReply,
  type LessonQuestion,
  type LearnerConversationMessage,
  type LearnerConversationView,
} from "./lesson-qa-contract";

export {
  validateQuestionText,
  type LessonQuestionReply,
  type LessonQuestion,
  type LearnerConversationMessage,
  type LearnerConversationView,
};

/**
 * List public questions for a lesson (S11b)
 */
export async function listLessonQuestions(
  store: Database,
  courseId: string,
  lessonId: string,
): Promise<LessonQuestion[]> {
  const rootQuestions = await store
    .select({
      id: courseDiscussions.id,
      courseId: courseDiscussions.courseId,
      lessonId: courseDiscussions.lessonId,
      userId: courseDiscussions.authorId,
      name: userTable.name,
      avatar: userTable.image,
      body: courseDiscussions.body,
      status: courseDiscussions.status,
      createdAt: courseDiscussions.createdAt,
    })
    .from(courseDiscussions)
    .innerJoin(userTable, eq(userTable.id, courseDiscussions.authorId))
    .where(
      and(
        eq(courseDiscussions.courseId, courseId),
        eq(courseDiscussions.lessonId, lessonId),
        isNull(courseDiscussions.parentId),
        eq(courseDiscussions.isHidden, false),
      ),
    )
    .orderBy(desc(courseDiscussions.createdAt), desc(courseDiscussions.id))
    .limit(50);

  if (!rootQuestions.length) return [];

  const parentIds = rootQuestions.map((q) => q.id);
  const replies = await store
    .select({
      id: courseDiscussions.id,
      parentId: courseDiscussions.parentId,
      userId: courseDiscussions.authorId,
      name: userTable.name,
      avatar: userTable.image,
      isLecturer: courseDiscussions.isLecturerReply,
      body: courseDiscussions.body,
      createdAt: courseDiscussions.createdAt,
    })
    .from(courseDiscussions)
    .innerJoin(userTable, eq(userTable.id, courseDiscussions.authorId))
    .where(
      and(
        inArray(courseDiscussions.parentId, parentIds),
        eq(courseDiscussions.isHidden, false),
      ),
    )
    .orderBy(courseDiscussions.createdAt);

  const replyMap = new Map<number, LessonQuestionReply[]>();
  for (const r of replies) {
    if (!r.parentId) continue;
    const list = replyMap.get(r.parentId) || [];
    list.push({
      id: r.id,
      userId: r.userId,
      name: r.name,
      avatar: r.avatar,
      isLecturer: r.isLecturer,
      text: r.body,
      at: r.createdAt.toISOString(),
    });
    replyMap.set(r.parentId, list);
  }

  return rootQuestions.map((q) => ({
    id: q.id,
    courseId: q.courseId,
    lessonId: q.lessonId || lessonId,
    userId: q.userId,
    name: q.name,
    avatar: q.avatar,
    text: q.body,
    status: (q.status as "unanswered" | "answered") || "unanswered",
    createdAt: q.createdAt.toISOString(),
    replies: replyMap.get(q.id) || [],
  }));
}

/**
 * Post a public lesson question (S11b)
 */
export async function postLessonQuestion(
  store: Database,
  userId: string,
  courseId: string,
  lessonId: string,
  text: string,
): Promise<LessonQuestion> {
  const check = validateQuestionText(text);
  if (!check.valid) {
    throw new Error(check.error);
  }

  const [inserted] = await store
    .insert(courseDiscussions)
    .values({
      courseId,
      lessonId,
      parentId: null,
      authorId: userId,
      body: text.trim(),
      status: "unanswered",
      isLecturerReply: false,
    })
    .returning();

  if (!inserted) {
    throw new Error("Không thể gửi câu hỏi.");
  }

  const [u] = await store
    .select({ name: userTable.name, avatar: userTable.image })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  return {
    id: inserted.id,
    courseId,
    lessonId,
    userId,
    name: u?.name || "Học viên",
    avatar: u?.avatar || null,
    text: inserted.body,
    status: "unanswered",
    createdAt: inserted.createdAt.toISOString(),
    replies: [],
  };
}

/**
 * Get latest private conversation for learner in this lesson (S11a/S11h)
 */
export async function getLearnerLessonConversation(
  store: Database,
  userId: string,
  courseId: string,
  lessonId: string,
): Promise<LearnerConversationView | null> {
  const convs = await store
    .select({
      id: courseConversations.id,
      courseId: courseConversations.courseId,
      lessonId: courseConversations.lessonId,
      lecturerId: courseConversations.lecturerId,
      lecturerName: userTable.name,
      status: courseConversations.status,
      fromAi: courseConversations.fromAi,
      aiContext: courseConversations.aiContext,
      createdAt: courseConversations.createdAt,
    })
    .from(courseConversations)
    .leftJoin(userTable, eq(userTable.id, courseConversations.lecturerId))
    .where(
      and(
        eq(courseConversations.courseId, courseId),
        eq(courseConversations.lessonId, lessonId),
        eq(courseConversations.learnerId, userId),
      ),
    )
    .orderBy(desc(courseConversations.createdAt), desc(courseConversations.id))
    .limit(1);

  if (!convs.length || !convs[0]) return null;
  const c = convs[0];

  const messages = await store
    .select({
      id: conversationMessages.id,
      authorId: conversationMessages.authorId,
      isLecturer: conversationMessages.isLecturer,
      body: conversationMessages.body,
      createdAt: conversationMessages.createdAt,
    })
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, c.id))
    .orderBy(conversationMessages.createdAt);

  const msgs: LearnerConversationMessage[] = messages.map((m) => ({
    id: m.id,
    authorId: m.authorId,
    isLecturer: m.isLecturer,
    text: m.body,
    at: m.createdAt.toISOString(),
  }));

  const hasLecturerReply = msgs.some((m) => m.isLecturer);
  const lastMsg = msgs[msgs.length - 1];

  return {
    id: c.id,
    courseId: c.courseId,
    lessonId: c.lessonId || lessonId,
    lecturerName: c.lecturerName || "Giảng viên",
    status: c.status as "open" | "resolved",
    fromAi: c.fromAi,
    aiContext: (c.aiContext as LearnerConversationView["aiContext"]) || null,
    messages: msgs,
    lastMessageText: lastMsg?.text,
    hasLecturerReply,
    createdAt: c.createdAt.toISOString(),
  };
}

/**
 * Escalate from AI Tutor to Lecturer (S11h)
 * Creates conversation + message + notification for lecturer.
 * Decision D9: Learner CANNOT resolve or reopen conversation.
 */
export async function escalateToLecturer(
  store: Database,
  userId: string,
  courseId: string,
  lessonId: string,
  payload: {
    text: string;
    withCode?: boolean;
    withTest?: boolean;
    withAi?: boolean;
    code?: string;
    failingTest?: string | null;
    aiSummary?: string;
  },
): Promise<LearnerConversationView> {
  const check = validateQuestionText(payload.text);
  if (!check.valid) {
    throw new Error(check.error);
  }

  // Lookup course and lesson details
  const [c] = await store
    .select({
      id: courses.id,
      title: courses.title,
      instructorId: courses.instructorId,
    })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (!c) {
    throw new Error("Không tìm thấy khóa học.");
  }

  const [l] = await store
    .select({ id: courseLessons.id, title: courseLessons.title })
    .from(courseLessons)
    .where(eq(courseLessons.id, lessonId))
    .limit(1);

  const lessonTitle = l?.title || "Bài học";

  const aiContext = {
    summary: payload.withAi ? payload.aiSummary || "" : "",
    code: payload.withCode ? payload.code || "" : "",
    failingTest: payload.withTest ? payload.failingTest || null : null,
  };

  // Insert conversation
  const [conv] = await store
    .insert(courseConversations)
    .values({
      courseId,
      lessonId,
      learnerId: userId,
      lecturerId: c.instructorId,
      status: "open",
      fromAi: true,
      aiContext,
    })
    .returning();

  if (!conv) {
    throw new Error("Không thể tạo cuộc trao đổi với giảng viên.");
  }

  // Insert initial message
  const [msg] = await store
    .insert(conversationMessages)
    .values({
      conversationId: conv.id,
      authorId: userId,
      isLecturer: false,
      body: payload.text.trim(),
    })
    .returning();

  // Notify lecturer
  if (c.instructorId) {
    try {
      const notifService = createNotificationService(store);
      await notifService.notify(
        c.instructorId,
        "Câu hỏi riêng từ học viên",
        `Bài "${lessonTitle}"`,
        `/dashboard/lecturer/questions?view=conversations&id=${conv.id}`,
      );
    } catch {
      // Non-blocking notification error
    }
  }

  return {
    id: conv.id,
    courseId: conv.courseId,
    lessonId: conv.lessonId || lessonId,
    lecturerName: "Giảng viên",
    status: "open",
    fromAi: true,
    aiContext,
    messages: [
      {
        id: msg?.id || 1,
        authorId: userId,
        isLecturer: false,
        text: payload.text.trim(),
        at: (msg?.createdAt || new Date()).toISOString(),
      },
    ],
    lastMessageText: payload.text.trim(),
    hasLecturerReply: false,
    createdAt: conv.createdAt.toISOString(),
  };
}

/**
 * Learner posts reply to existing conversation
 * Guard: only when status is 'open'. Learner cannot resolve/reopen (D9).
 */
export async function postLearnerConversationReply(
  store: Database,
  userId: string,
  conversationId: number,
  text: string,
): Promise<LearnerConversationMessage> {
  const check = validateQuestionText(text);
  if (!check.valid) {
    throw new Error(check.error);
  }

  const [conv] = await store
    .select({
      id: courseConversations.id,
      learnerId: courseConversations.learnerId,
      lecturerId: courseConversations.lecturerId,
      status: courseConversations.status,
      courseId: courseConversations.courseId,
      lessonId: courseConversations.lessonId,
    })
    .from(courseConversations)
    .where(eq(courseConversations.id, conversationId))
    .limit(1);

  if (!conv || conv.learnerId !== userId) {
    throw new Error("Không tìm thấy cuộc trao đổi.");
  }

  if (conv.status !== "open") {
    throw new Error(
      "Cuộc trao đổi đã được giải quyết. Vui lòng liên hệ giảng viên nếu cần mở lại.",
    );
  }

  const [msg] = await store
    .insert(conversationMessages)
    .values({
      conversationId: conv.id,
      authorId: userId,
      isLecturer: false,
      body: text.trim(),
    })
    .returning();

  if (!msg) {
    throw new Error("Không thể gửi tin nhắn.");
  }

  if (conv.lecturerId) {
    try {
      const notifService = createNotificationService(store);
      await notifService.notify(
        conv.lecturerId,
        "Phản hồi mới từ học viên",
        text.trim().slice(0, 100),
        `/dashboard/lecturer/questions?view=conversations&id=${conv.id}`,
      );
    } catch {
      // Non-blocking
    }
  }

  return {
    id: msg.id,
    authorId: userId,
    isLecturer: false,
    text: msg.body,
    at: msg.createdAt.toISOString(),
  };
}
