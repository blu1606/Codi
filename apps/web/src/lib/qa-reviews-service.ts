/**
 * Pure domain rules and validation guards for Q&A questions, conversations, and reviews.
 * Adheres to STATE-MACHINES.md §14 and §15, and Decision D8 / D9.
 */

export interface ConversationMessageItem {
  id?: number;
  authorId: string;
  isLecturer: boolean;
  body: string;
  createdAt: string | Date;
}

/** Private replies from staff other than the course lecturer are admin replies. */
export function getConversationMessageRoleLabel(
  message: Pick<ConversationMessageItem, "authorId" | "isLecturer">,
  learnerId: string
): "Giảng viên" | "Quản trị viên" | null {
  if (message.authorId === learnerId) return null;
  return message.isLecturer ? "Giảng viên" : "Quản trị viên";
}

/**
 * Validate lecturer reply text (min 5 characters per §14.1 & §14.2).
 */
export function validateReplyText(text: string | null | undefined): {
  isValid: boolean;
  error?: string;
} {
  const trimmed = (text || "").trim();
  if (trimmed.length < 5) {
    return {
      isValid: false,
      error: "Câu trả lời cần ít nhất 5 ký tự.",
    };
  }
  if (trimmed.length > 5000) {
    return {
      isValid: false,
      error: "Câu trả lời không được vượt quá 5000 ký tự.",
    };
  }
  return { isValid: true };
}

/**
 * Decision D8 / D9:
 * Only allow resolving a conversation if at least one lecturer reply exists.
 */
export function canResolveConversation(messages: Array<{ isLecturer: boolean }>): {
  canResolve: boolean;
  error?: string;
} {
  const hasLecturerReply = messages.some((m) => m.isLecturer);
  if (!hasLecturerReply) {
    return {
      canResolve: false,
      error: "Hãy trả lời học viên trước khi đánh dấu đã giải quyết.",
    };
  }
  return { canResolve: true };
}

/**
 * STATE-MACHINES.md §14.2:
 * Conversations only accept new messages when status is "open".
 * When "resolved", no further messages can be posted until reopened.
 */
export function canPostMessageToConversation(status: string | null | undefined): {
  canPost: boolean;
  error?: string;
} {
  if (status !== "open") {
    return {
      canPost: false,
      error: "Cuộc hội thoại đã được giải quyết. Vui lòng mở lại cuộc hội thoại để tiếp tục trao đổi.",
    };
  }
  return { canPost: true };
}

/**
 * Validate course review reply text (non-empty per §15).
 */
export function validateReviewReply(text: string | null | undefined): {
  isValid: boolean;
  error?: string;
} {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: "Nhập nội dung phản hồi.",
    };
  }
  if (trimmed.length > 3000) {
    return {
      isValid: false,
      error: "Phản hồi không được vượt quá 3000 ký tự.",
    };
  }
  return { isValid: true };
}

/**
 * Format relative time in Vietnamese (matches S27 / S28 mockup).
 */
export function formatRelativeTime(
  dateInput: Date | string | number | null | undefined
): string {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";

  const diffSec = (Date.now() - d.getTime()) / 1000;
  if (diffSec < 60) return "Vừa xong";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)} ngày trước`;

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Format date in Vietnamese format: DD/MM/YYYY.
 */
export function formatDate(
  dateInput: Date | string | number | null | undefined
): string {
  if (!dateInput) return "—";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "—";

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
