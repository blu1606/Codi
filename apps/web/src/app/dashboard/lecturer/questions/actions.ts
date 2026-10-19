"use server";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import {
  conversationMessages,
  courseConversations,
  courseDiscussions,
  courseLessons,
  courses,
  user as userTable,
} from "@codi-1/db";
import { db } from "@/services";
import { verifyLecturerSession } from "@/lib/lecturer-auth";
import { createNotificationService } from "@/lib/notification-service";
import {
  canResolveConversation,
  validateReplyText,
} from "@/lib/qa-reviews-service";

export interface QuestionReplyDto {
  id: number;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  isLecturer: boolean;
  body: string;
  createdAt: string;
}

export interface QuestionListItemDto {
  id: number;
  courseId: string;
  courseTitle: string;
  lessonId: string | null;
  lessonTitle: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  body: string;
  status: "unanswered" | "answered";
  createdAt: string;
  repliesCount: number;
}

export interface QuestionDetailDto extends QuestionListItemDto {
  replies: QuestionReplyDto[];
}

export interface ConversationMessageDto {
  id: number;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  isLecturer: boolean;
  body: string;
  createdAt: string;
}

export interface ConversationListItemDto {
  id: number;
  courseId: string;
  courseTitle: string;
  lessonId: string | null;
  lessonTitle: string;
  learnerId: string;
  learnerName: string;
  learnerAvatar: string | null;
  status: "open" | "resolved";
  fromAi: boolean;
  aiContext: {
    summary?: string;
    code?: string;
    failingTest?: string;
  } | null;
  createdAt: string;
  messagesCount: number;
}

export interface ConversationDetailDto extends ConversationListItemDto {
  messages: ConversationMessageDto[];
}

export interface LecturerQuestionsDataDto {
  view: "questions" | "conversations";
  status: "unanswered" | "answered";
  counts: {
    unanswered: number;
    answered: number;
    aiConversations: number;
  };
  questions: QuestionListItemDto[];
  conversations: ConversationListItemDto[];
  selectedQuestion: QuestionDetailDto | null;
  selectedConversation: ConversationDetailDto | null;
}

/**
 * Lấy dữ liệu cho hộp thư hỏi đáp và cuộc hội thoại AI của giảng viên (Screen S27).
 */
export async function getLecturerQuestionsData(filters?: {
  view?: "questions" | "conversations";
  status?: "unanswered" | "answered";
  id?: string;
}): Promise<LecturerQuestionsDataDto> {
  const user = await verifyLecturerSession();

  const view: "questions" | "conversations" =
    filters?.view === "conversations" ? "conversations" : "questions";
  const status: "unanswered" | "answered" =
    filters?.status === "answered" ? "answered" : "unanswered";
  const selectedId = filters?.id ? Number(filters.id) : null;

  // 1. Lấy danh sách khoá học của giảng viên
  const myCourses = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(eq(courses.instructorId, user.id));

  const myCourseIds = myCourses.map((c) => c.id);

  if (myCourseIds.length === 0) {
    return {
      view,
      status,
      counts: { unanswered: 0, answered: 0, aiConversations: 0 },
      questions: [],
      conversations: [],
      selectedQuestion: null,
      selectedConversation: null,
    };
  }

  // 2. Lấy danh sách câu hỏi công khai (courseDiscussions với parentId IS NULL)
  const rootQuestions = await db
    .select({
      id: courseDiscussions.id,
      courseId: courseDiscussions.courseId,
      courseTitle: courses.title,
      lessonId: courseDiscussions.lessonId,
      lessonTitle: sql<string>`coalesce(${courseLessons.title}, 'Khóa học')`,
      authorId: courseDiscussions.authorId,
      authorName: userTable.name,
      authorAvatar: userTable.image,
      body: courseDiscussions.body,
      status: courseDiscussions.status,
      createdAt: courseDiscussions.createdAt,
    })
    .from(courseDiscussions)
    .innerJoin(courses, eq(courseDiscussions.courseId, courses.id))
    .innerJoin(userTable, eq(courseDiscussions.authorId, userTable.id))
    .leftJoin(courseLessons, eq(courseDiscussions.lessonId, courseLessons.id))
    .where(
      and(
        inArray(courseDiscussions.courseId, myCourseIds),
        isNull(courseDiscussions.parentId),
        eq(courseDiscussions.isHidden, false)
      )
    )
    .orderBy(desc(courseDiscussions.createdAt));

  const countUnanswered = rootQuestions.filter((q) => q.status === "unanswered").length;
  const countAnswered = rootQuestions.filter((q) => q.status === "answered").length;

  // Filter list theo status hiện tại
  const filteredQuestions = rootQuestions.filter((q) => q.status === status);

  // 3. Lấy danh sách cuộc hội thoại AI (courseConversations với fromAi: true)
  const rawConversations = await db
    .select({
      id: courseConversations.id,
      courseId: courseConversations.courseId,
      courseTitle: courses.title,
      lessonId: courseConversations.lessonId,
      lessonTitle: sql<string>`coalesce(${courseLessons.title}, 'Khóa học')`,
      learnerId: courseConversations.learnerId,
      learnerName: userTable.name,
      learnerAvatar: userTable.image,
      status: courseConversations.status,
      fromAi: courseConversations.fromAi,
      aiContext: courseConversations.aiContext,
      createdAt: courseConversations.createdAt,
    })
    .from(courseConversations)
    .innerJoin(courses, eq(courseConversations.courseId, courses.id))
    .innerJoin(userTable, eq(courseConversations.learnerId, userTable.id))
    .leftJoin(courseLessons, eq(courseConversations.lessonId, courseLessons.id))
    .where(
      and(
        inArray(courseConversations.courseId, myCourseIds),
        eq(courseConversations.fromAi, true)
      )
    )
    .orderBy(desc(courseConversations.createdAt));

  const countAiConversations = rawConversations.length;

  const conversationList: ConversationListItemDto[] = rawConversations.map((c) => ({
    id: c.id,
    courseId: c.courseId,
    courseTitle: c.courseTitle,
    lessonId: c.lessonId,
    lessonTitle: c.lessonTitle,
    learnerId: c.learnerId,
    learnerName: c.learnerName || "Học viên Codi",
    learnerAvatar: c.learnerAvatar,
    status: c.status as "open" | "resolved",
    fromAi: c.fromAi,
    aiContext: c.aiContext as ConversationListItemDto["aiContext"],
    createdAt: c.createdAt.toISOString(),
    messagesCount: 0,
  }));

  const questionList: QuestionListItemDto[] = filteredQuestions.map((q) => ({
    id: q.id,
    courseId: q.courseId,
    courseTitle: q.courseTitle,
    lessonId: q.lessonId,
    lessonTitle: q.lessonTitle,
    authorId: q.authorId,
    authorName: q.authorName || "Học viên Codi",
    authorAvatar: q.authorAvatar,
    body: q.body,
    status: (q.status as "unanswered" | "answered") || "unanswered",
    createdAt: q.createdAt.toISOString(),
    repliesCount: 0,
  }));

  // 4. Lấy chi tiết câu hỏi được chọn nếu ở view questions
  let selectedQuestion: QuestionDetailDto | null = null;
  if (view === "questions" && filteredQuestions.length > 0) {
    const qTarget =
      selectedId !== null
        ? rootQuestions.find((q) => q.id === selectedId) || filteredQuestions[0]
        : filteredQuestions[0];

    if (qTarget) {
      // Lấy danh sách replies
      const repliesRes = await db
        .select({
          id: courseDiscussions.id,
          authorId: courseDiscussions.authorId,
          authorName: userTable.name,
          authorAvatar: userTable.image,
          isLecturer: courseDiscussions.isLecturerReply,
          body: courseDiscussions.body,
          createdAt: courseDiscussions.createdAt,
        })
        .from(courseDiscussions)
        .innerJoin(userTable, eq(courseDiscussions.authorId, userTable.id))
        .where(
          and(
            eq(courseDiscussions.parentId, qTarget.id),
            eq(courseDiscussions.isHidden, false)
          )
        )
        .orderBy(courseDiscussions.createdAt);

      selectedQuestion = {
        id: qTarget.id,
        courseId: qTarget.courseId,
        courseTitle: qTarget.courseTitle,
        lessonId: qTarget.lessonId,
        lessonTitle: qTarget.lessonTitle,
        authorId: qTarget.authorId,
        authorName: qTarget.authorName || "Học viên Codi",
        authorAvatar: qTarget.authorAvatar,
        body: qTarget.body,
        status: (qTarget.status as "unanswered" | "answered") || "unanswered",
        createdAt: qTarget.createdAt.toISOString(),
        repliesCount: repliesRes.length,
        replies: repliesRes.map((r) => ({
          id: r.id,
          authorId: r.authorId,
          authorName: r.authorName || "Người dùng",
          authorAvatar: r.authorAvatar,
          isLecturer: r.isLecturer,
          body: r.body,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    }
  }

  // 5. Lấy chi tiết cuộc hội thoại được chọn nếu ở view conversations
  let selectedConversation: ConversationDetailDto | null = null;
  if (view === "conversations" && conversationList.length > 0) {
    const cTarget =
      selectedId !== null
        ? rawConversations.find((c) => c.id === selectedId) || rawConversations[0]
        : rawConversations[0];

    if (cTarget) {
      const messagesRes = await db
        .select({
          id: conversationMessages.id,
          authorId: conversationMessages.authorId,
          authorName: userTable.name,
          authorAvatar: userTable.image,
          isLecturer: conversationMessages.isLecturer,
          body: conversationMessages.body,
          createdAt: conversationMessages.createdAt,
        })
        .from(conversationMessages)
        .innerJoin(userTable, eq(conversationMessages.authorId, userTable.id))
        .where(eq(conversationMessages.conversationId, cTarget.id))
        .orderBy(conversationMessages.createdAt);

      selectedConversation = {
        id: cTarget.id,
        courseId: cTarget.courseId,
        courseTitle: cTarget.courseTitle,
        lessonId: cTarget.lessonId,
        lessonTitle: cTarget.lessonTitle,
        learnerId: cTarget.learnerId,
        learnerName: cTarget.learnerName || "Học viên Codi",
        learnerAvatar: cTarget.learnerAvatar,
        status: cTarget.status as "open" | "resolved",
        fromAi: cTarget.fromAi,
        aiContext: cTarget.aiContext as ConversationDetailDto["aiContext"],
        createdAt: cTarget.createdAt.toISOString(),
        messagesCount: messagesRes.length,
        messages: messagesRes.map((m) => ({
          id: m.id,
          authorId: m.authorId,
          authorName: m.authorName || "Người dùng",
          authorAvatar: m.authorAvatar,
          isLecturer: m.isLecturer,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    }
  }

  return {
    view,
    status,
    counts: {
      unanswered: countUnanswered,
      answered: countAnswered,
      aiConversations: countAiConversations,
    },
    questions: questionList,
    conversations: conversationList,
    selectedQuestion,
    selectedConversation,
  };
}

/**
 * Trả lời câu hỏi công khai từ học viên (STATE-MACHINES.md §14.1).
 * Cập nhật status='answered', ghi nhận phản hồi của giảng viên, gửi thông báo học viên.
 */
export async function replyToPublicQuestion(input: {
  questionId: number;
  text: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await verifyLecturerSession();

  const validation = validateReplyText(input.text);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  // Kiểm tra câu hỏi gốc
  const [question] = await db
    .select({
      id: courseDiscussions.id,
      courseId: courseDiscussions.courseId,
      lessonId: courseDiscussions.lessonId,
      authorId: courseDiscussions.authorId,
      instructorId: courses.instructorId,
    })
    .from(courseDiscussions)
    .innerJoin(courses, eq(courseDiscussions.courseId, courses.id))
    .where(
      and(
        eq(courseDiscussions.id, input.questionId),
        isNull(courseDiscussions.parentId)
      )
    );

  if (!question) {
    return { success: false, error: "Câu hỏi không tồn tại." };
  }

  // Kiểm tra quyền: phải là giảng viên của khoá học hoặc admin
  const roles = await getActiveRoles(db, user.id);
  const isAdmin = roles.includes(ROLE.ADMIN);
  if (question.instructorId !== user.id && !isAdmin) {
    return {
      success: false,
      error: "Bạn không có quyền trả lời câu hỏi của khoá học này.",
    };
  }

  // Thêm phản hồi của giảng viên
  await db.insert(courseDiscussions).values({
    courseId: question.courseId,
    lessonId: question.lessonId,
    parentId: question.id,
    authorId: user.id,
    body: input.text.trim(),
    isLecturerReply: true,
  });

  // Cập nhật trạng thái câu hỏi gốc thành answered
  await db
    .update(courseDiscussions)
    .set({
      status: "answered",
      updatedAt: new Date(),
    })
    .where(eq(courseDiscussions.id, question.id));

  // Gửi thông báo đến học viên đặt câu hỏi
  try {
    const notif = createNotificationService(db);
    const link = `/learn/${question.courseId}${
      question.lessonId ? `/${question.lessonId}` : ""
    }`;
    await notif.notify(
      question.authorId,
      "Câu hỏi đã có trả lời",
      `${user.name || "Giảng viên"} đã trả lời câu hỏi của bạn.`,
      link
    );
  } catch {
    // Không chặn hành động chính nếu thông báo lỗi
  }

  revalidatePath("/dashboard/lecturer/questions");
  return { success: true };
}

/**
 * Trả lời cuộc hội thoại riêng với học viên từ AI trợ lý (STATE-MACHINES.md §14.2).
 */
export async function replyToPrivateConversation(input: {
  conversationId: number;
  text: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await verifyLecturerSession();

  const validation = validateReplyText(input.text);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  const [conv] = await db
    .select({
      id: courseConversations.id,
      courseId: courseConversations.courseId,
      lessonId: courseConversations.lessonId,
      learnerId: courseConversations.learnerId,
      instructorId: courses.instructorId,
    })
    .from(courseConversations)
    .innerJoin(courses, eq(courseConversations.courseId, courses.id))
    .where(eq(courseConversations.id, input.conversationId));

  if (!conv) {
    return { success: false, error: "Cuộc hội thoại không tồn tại." };
  }

  const roles = await getActiveRoles(db, user.id);
  const isAdmin = roles.includes(ROLE.ADMIN);
  if (conv.instructorId !== user.id && !isAdmin) {
    return {
      success: false,
      error: "Bạn không có quyền phản hồi cuộc hội thoại này.",
    };
  }

  // Thêm tin nhắn của giảng viên
  await db.insert(conversationMessages).values({
    conversationId: conv.id,
    authorId: user.id,
    isLecturer: true,
    body: input.text.trim(),
  });

  // Cập nhật updatedAt của cuộc hội thoại
  await db
    .update(courseConversations)
    .set({ updatedAt: new Date() })
    .where(eq(courseConversations.id, conv.id));

  // Gửi thông báo đến học viên
  try {
    const notif = createNotificationService(db);
    const link = `/learn/${conv.courseId}${
      conv.lessonId ? `/${conv.lessonId}` : ""
    }`;
    await notif.notify(
      conv.learnerId,
      "Có trả lời từ giảng viên",
      `${user.name || "Giảng viên"} đã trả lời cuộc hội thoại của bạn.`,
      link
    );
  } catch {
    // Không chặn hành động chính nếu thông báo lỗi
  }

  revalidatePath("/dashboard/lecturer/questions");
  return { success: true };
}

/**
 * Đánh dấu cuộc hội thoại đã giải quyết (Decision D8 / D9 & STATE-MACHINES.md §14.2).
 * Ràng buộc guard: Phải có ít nhất 1 câu trả lời từ giảng viên mới được resolve.
 */
export async function resolveConversation(input: {
  conversationId: number;
}): Promise<{ success: boolean; error?: string }> {
  const user = await verifyLecturerSession();

  const [conv] = await db
    .select({
      id: courseConversations.id,
      status: courseConversations.status,
      instructorId: courses.instructorId,
    })
    .from(courseConversations)
    .innerJoin(courses, eq(courseConversations.courseId, courses.id))
    .where(eq(courseConversations.id, input.conversationId));

  if (!conv) {
    return { success: false, error: "Cuộc hội thoại không tồn tại." };
  }

  const roles = await getActiveRoles(db, user.id);
  const isAdmin = roles.includes(ROLE.ADMIN);
  if (conv.instructorId !== user.id && !isAdmin) {
    return {
      success: false,
      error: "Bạn không có quyền cập nhật cuộc hội thoại này.",
    };
  }

  // Kiểm tra điều kiện: ít nhất 1 tin nhắn từ giảng viên
  const messages = await db
    .select({ isLecturer: conversationMessages.isLecturer })
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conv.id));

  const resolveCheck = canResolveConversation(messages);
  if (!resolveCheck.canResolve) {
    return { success: false, error: resolveCheck.error };
  }

  // Cập nhật trạng thái resolved
  await db
    .update(courseConversations)
    .set({
      status: "resolved",
      resolvedBy: user.id,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(courseConversations.id, conv.id));

  revalidatePath("/dashboard/lecturer/questions");
  return { success: true };
}

/**
 * Mở lại cuộc hội thoại đã giải quyết (Decision D8 / D9 & STATE-MACHINES.md §14.2).
 */
export async function reopenConversation(input: {
  conversationId: number;
}): Promise<{ success: boolean; error?: string }> {
  const user = await verifyLecturerSession();

  const [conv] = await db
    .select({
      id: courseConversations.id,
      status: courseConversations.status,
      instructorId: courses.instructorId,
    })
    .from(courseConversations)
    .innerJoin(courses, eq(courseConversations.courseId, courses.id))
    .where(eq(courseConversations.id, input.conversationId));

  if (!conv) {
    return { success: false, error: "Cuộc hội thoại không tồn tại." };
  }

  const roles = await getActiveRoles(db, user.id);
  const isAdmin = roles.includes(ROLE.ADMIN);
  if (conv.instructorId !== user.id && !isAdmin) {
    return {
      success: false,
      error: "Bạn không có quyền cập nhật cuộc hội thoại này.",
    };
  }

  await db
    .update(courseConversations)
    .set({
      status: "open",
      resolvedBy: null,
      resolvedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(courseConversations.id, conv.id));

  revalidatePath("/dashboard/lecturer/questions");
  return { success: true };
}
