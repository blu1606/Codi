import type {
  ConversationDetailDto,
  ConversationListItemDto,
  LecturerQuestionsDataDto,
  QuestionDetailDto,
  QuestionListItemDto,
} from "@/app/dashboard/lecturer/questions/actions";

/** Q&A inbox (S27) and AI conversations, shaped like getLecturerQuestionsData. */

const unansweredQuestions: QuestionListItemDto[] = [
  {
    id: 501, courseId: "course-react-001", courseTitle: "React dự án thực tế",
    lessonId: "22222222-2222-4222-8222-222222222202", lessonTitle: "Bài 2: Props và state",
    authorId: "usr-learner-001", authorName: "Nguyễn Minh An", authorAvatar: null,
    body: "Em truyền hàm xuống component con thì có cần useCallback không ạ?",
    status: "unanswered", createdAt: "2026-10-25T08:30:00.000Z", repliesCount: 0,
  },
  {
    id: 502, courseId: "course-node-001", courseTitle: "Node.js & Express xây dựng REST API",
    lessonId: null, lessonTitle: "Chung cả khoá",
    authorId: "usr-learner-002", authorName: "Phạm Thu Hà", authorAvatar: null,
    body: "Refresh token nên lưu ở cookie hay localStorage?",
    status: "unanswered", createdAt: "2026-10-26T02:15:00.000Z", repliesCount: 0,
  },
];

const answeredQuestion: QuestionListItemDto = {
  id: 480, courseId: "course-react-001", courseTitle: "React dự án thực tế",
  lessonId: "22222222-2222-4222-8222-222222222203", lessonTitle: "Bài 3: Hooks cơ bản",
  authorId: "usr-learner-003", authorName: "Lê Đức Anh", authorAvatar: null,
  body: "useEffect chạy mấy lần vậy ạ?",
  status: "answered", createdAt: "2026-10-20T06:00:00.000Z", repliesCount: 1,
};

const questionDetail: QuestionDetailDto = {
  ...unansweredQuestions[0],
  replies: [],
};

const answeredDetail: QuestionDetailDto = {
  ...answeredQuestion,
  replies: [
    {
      id: 1, authorId: "usr-lecturer-001", authorName: "Trần Minh Khoa", authorAvatar: null,
      isLecturer: true, body: "Effect chạy sau mỗi lần render có dependency thay đổi; trong dev StrictMode sẽ chạy thêm một lần.",
      createdAt: "2026-10-20T07:00:00.000Z",
    },
  ],
};

const aiConversations: ConversationListItemDto[] = [
  {
    id: 701, courseId: "course-node-001", courseTitle: "Node.js & Express xây dựng REST API",
    lessonId: null, lessonTitle: "Bài tập: Xây dựng REST API",
    learnerId: "usr-learner-001", learnerName: "Nguyễn Minh An", learnerAvatar: null,
    status: "open", fromAi: true,
    aiContext: { summary: "Học viên không hiểu vì sao test xác thực báo 401.", failingTest: "POST /login trả 500" },
    createdAt: "2026-10-26T03:00:00.000Z", messagesCount: 3,
  },
];

const aiConversationDetail: ConversationDetailDto = {
  ...aiConversations[0],
  messages: [
    { id: 1, authorId: "usr-learner-001", authorName: "Nguyễn Minh An", authorAvatar: null, isLecturer: false, body: "Vì sao route login trả 500 dù em đã kiểm tra mật khẩu?", createdAt: "2026-10-26T03:00:00.000Z" },
    { id: 2, authorId: "ai", authorName: "Trợ lý AI", authorAvatar: null, isLecturer: false, body: "Có vẻ lỗi nằm ở bước tạo token. Em thử log lỗi từ jwt.sign.", createdAt: "2026-10-26T03:01:00.000Z" },
    { id: 3, authorId: "usr-learner-001", authorName: "Nguyễn Minh An", authorAvatar: null, isLecturer: false, body: "Em làm theo rồi nhưng vẫn không rõ. Thầy xem giúp em với ạ.", createdAt: "2026-10-26T03:05:00.000Z" },
  ],
};

const base: LecturerQuestionsDataDto = {
  view: "questions",
  status: "unanswered",
  counts: { unanswered: unansweredQuestions.length, answered: 1, aiConversations: aiConversations.length },
  questions: unansweredQuestions,
  conversations: [],
  selectedQuestion: null,
  selectedConversation: null,
};

export const lecturerQuestionsUnanswered: LecturerQuestionsDataDto = { ...base, selectedQuestion: questionDetail };

export const lecturerQuestionsAnswered: LecturerQuestionsDataDto = {
  ...base,
  status: "answered",
  questions: [answeredQuestion],
  selectedQuestion: answeredDetail,
};

export const lecturerQuestionsEmptyUnanswered: LecturerQuestionsDataDto = { ...base, questions: [] };

export const lecturerQuestionsEmptyAnswered: LecturerQuestionsDataDto = { ...base, status: "answered", questions: [] };

export const lecturerConversations: LecturerQuestionsDataDto = {
  ...base,
  view: "conversations",
  questions: [],
  conversations: aiConversations,
  selectedConversation: aiConversationDetail,
};

export const lecturerConversationsEmpty: LecturerQuestionsDataDto = {
  ...base,
  view: "conversations",
  counts: { ...base.counts, aiConversations: 0 },
  questions: [],
  conversations: [],
};
