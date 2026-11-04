/**
 * Lesson Q&A and Lecturer Conversations Contract & Client-Safe Types
 * Adheres to STATE-MACHINES.md §14, §15, and Mockup specifications.
 */

export interface LessonQuestionReply {
  id: number;
  userId: string;
  name: string;
  avatar: string | null;
  isLecturer: boolean;
  text: string;
  at: string;
}

export interface LessonQuestion {
  id: number;
  courseId: string;
  lessonId: string;
  userId: string;
  name: string;
  avatar: string | null;
  text: string;
  status: "unanswered" | "answered";
  createdAt: string;
  replies: LessonQuestionReply[];
}

export interface LearnerConversationMessage {
  id: number;
  authorId: string;
  isLecturer: boolean;
  text: string;
  at: string;
}

export interface LearnerConversationView {
  id: number;
  courseId: string;
  lessonId: string;
  lecturerName: string;
  status: "open" | "resolved";
  fromAi: boolean;
  aiContext: {
    summary?: string;
    code?: string;
    failingTest?: string | null;
  } | null;
  messages: LearnerConversationMessage[];
  lastMessageText?: string;
  hasLecturerReply: boolean;
  createdAt: string;
}

/**
 * Validate question text: min 10 characters (STATE-MACHINES.md §14.1 & §14.2)
 */
export function validateQuestionText(text: string | null | undefined): {
  valid: boolean;
  error?: string;
} {
  const trimmed = (text || "").trim();
  if (trimmed.length < 10) {
    return {
      valid: false,
      error: "Câu hỏi cần ít nhất 10 ký tự để giảng viên hiểu rõ.",
    };
  }
  if (trimmed.length > 5000) {
    return {
      valid: false,
      error: "Câu hỏi không được vượt quá 5000 ký tự.",
    };
  }
  return { valid: true };
}
