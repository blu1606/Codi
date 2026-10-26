import { QuestionsInboxClient } from "@/app/dashboard/lecturer/questions/questions-inbox-client";
import {
  lecturerConversations,
  lecturerConversationsEmpty,
  lecturerQuestionsAnswered,
  lecturerQuestionsEmptyAnswered,
  lecturerQuestionsEmptyUnanswered,
  lecturerQuestionsUnanswered,
} from "@/demo-fixtures/lecturer/questions";
import type { Screen } from "../screen-types";

const route = { pathname: "/dashboard/lecturer/questions" };

export const lecturerQuestionsScreen: Screen = {
  id: "S27",
  title: "Hỏi đáp",
  group: "Giảng viên",
  role: "lecturer",
  layout: "lecturer",
  mockupHash: "#/teach/questions",
  states: {
    unanswered: { label: "Chưa trả lời", route, render: () => <QuestionsInboxClient initialData={lecturerQuestionsUnanswered} /> },
    answered: {
      label: "Đã trả lời",
      route: { pathname: "/dashboard/lecturer/questions", search: { status: "answered" } },
      render: () => <QuestionsInboxClient initialData={lecturerQuestionsAnswered} />,
    },
    "unanswered-empty": { label: "Hết câu hỏi", route, render: () => <QuestionsInboxClient initialData={lecturerQuestionsEmptyUnanswered} /> },
    "answered-empty": {
      label: "Chưa có câu đã trả lời",
      route: { pathname: "/dashboard/lecturer/questions", search: { status: "answered" } },
      render: () => <QuestionsInboxClient initialData={lecturerQuestionsEmptyAnswered} />,
    },
    "reply-error": {
      label: "Trả lời lỗi",
      route,
      actions: { replyToPublicQuestion: { error: "Không thể gửi câu trả lời. Vui lòng thử lại." } },
      render: () => <QuestionsInboxClient initialData={lecturerQuestionsUnanswered} />,
    },
    "ai-conversations": {
      label: "Hội thoại AI",
      route: { pathname: "/dashboard/lecturer/questions", search: { view: "conversations" } },
      render: () => <QuestionsInboxClient initialData={lecturerConversations} />,
    },
    "ai-conversations-empty": {
      label: "Hội thoại AI: trống",
      route: { pathname: "/dashboard/lecturer/questions", search: { view: "conversations" } },
      render: () => <QuestionsInboxClient initialData={lecturerConversationsEmpty} />,
    },
  },
};
