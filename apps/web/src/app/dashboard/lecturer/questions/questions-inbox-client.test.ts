import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ConversationDetailDto, LecturerQuestionsDataDto } from "./actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("./actions", () => ({
  reopenConversation: vi.fn(),
  replyToPrivateConversation: vi.fn(),
  replyToPublicQuestion: vi.fn(),
  resolveConversation: vi.fn(),
}));

import { QuestionsInboxClient } from "./questions-inbox-client";

describe("private conversation sender badges", () => {
  const conversation: ConversationDetailDto = {
    id: 5,
    courseId: "course-1",
    courseTitle: "Course",
    lessonId: "lesson-1",
    lessonTitle: "Lesson",
    learnerId: "learner-1",
    learnerName: "Learner",
    learnerAvatar: null,
    status: "open",
    fromAi: true,
    aiContext: null,
    createdAt: "2026-10-20T00:00:00Z",
    messagesCount: 1,
    messages: [],
  };

  it.each([
    { authorId: "admin-1", isLecturer: false, label: "Quản trị viên" },
    { authorId: "lecturer-1", isLecturer: true, label: "Giảng viên" },
    { authorId: "learner-1", isLecturer: false, label: null },
  ])("renders the correct badge for $authorId", ({ authorId, isLecturer, label }) => {
    const selectedConversation: ConversationDetailDto = {
      ...conversation,
      messages: [{
        id: 1, authorId, authorName: "Sender", authorAvatar: null,
        isLecturer, body: "A real conversation reply", createdAt: conversation.createdAt,
      }],
    };
    const initialData: LecturerQuestionsDataDto = {
      view: "conversations", status: "unanswered",
      counts: { unanswered: 0, answered: 0, aiConversations: 1 },
      questions: [], conversations: [conversation], selectedQuestion: null,
      selectedConversation,
    };

    const html = renderToStaticMarkup(createElement(QuestionsInboxClient, { initialData }));
    if (label) expect(html).toContain(`>${label}</span>`);
    if (label !== "Giảng viên") expect(html).not.toContain(">Giảng viên</span>");
    if (label !== "Quản trị viên") expect(html).not.toContain(">Quản trị viên</span>");
  });
});
