import type { FeedbackSnippetItem } from "@/app/dashboard/lecturer/snippets/actions";
import type { GradingQueueDataDto, SubmissionDetailDto, SubmissionListItemDto } from "@/app/dashboard/lecturer/grading/actions";

/** Grading queue (S26) and feedback snippets (S26 phụ). Shapes follow the loader DTOs. */

const pendingItems: SubmissionListItemDto[] = [
  {
    id: 101, studentName: "Nguyễn Minh An", studentEmail: "an.learner@codi.vn", studentAvatar: null,
    courseId: "course-node-001", courseTitle: "Node.js & Express xây dựng REST API",
    lessonId: null, lessonTitle: "Bài tập: Xây dựng REST API", status: "pending", score: null, maxScore: 10,
    submittedAt: "2026-10-25T08:20:00.000Z", gradedAt: null,
  },
  {
    id: 102, studentName: "Phạm Thu Hà", studentEmail: "ha.pham@codi.vn", studentAvatar: null,
    courseId: "course-node-001", courseTitle: "Node.js & Express xây dựng REST API",
    lessonId: null, lessonTitle: "Bài tập: Xây dựng REST API", status: "pending", score: null, maxScore: 10,
    submittedAt: "2026-10-25T09:45:00.000Z", gradedAt: null,
  },
  {
    id: 103, studentName: "Lê Đức Anh", studentEmail: "anh.le@codi.vn", studentAvatar: null,
    courseId: "course-react-001", courseTitle: "React dự án thực tế",
    lessonId: null, lessonTitle: "Bài tập: Quản lý giỏ hàng", status: "pending", score: null, maxScore: 10,
    submittedAt: "2026-10-26T01:10:00.000Z", gradedAt: null,
  },
];

const gradedItem: SubmissionListItemDto = {
  id: 90, studentName: "Võ Thảo Nhi", studentEmail: "nhi.vo@codi.vn", studentAvatar: null,
  courseId: "course-node-001", courseTitle: "Node.js & Express xây dựng REST API",
  lessonId: null, lessonTitle: "Bài tập: Xây dựng REST API", status: "graded", score: 8.5, maxScore: 10,
  submittedAt: "2026-10-18T07:00:00.000Z", gradedAt: "2026-10-19T03:30:00.000Z",
};

const courseOptions = [
  { id: "course-node-001", title: "Node.js & Express xây dựng REST API" },
  { id: "course-react-001", title: "React dự án thực tế" },
];
const assignmentOptions = [{ id: 1, title: "Bài tập: Xây dựng REST API", courseId: "course-node-001" }];

const baseQueue: GradingQueueDataDto = {
  courses: courseOptions,
  assignments: assignmentOptions,
  counts: { pending: pendingItems.length, graded: 1 },
  currentStatus: "pending",
  selectedCourseId: "all",
  selectedAssignmentId: "all",
  selectedDate: "all",
  submissions: pendingItems,
  selectedSubmission: null,
};

export const lecturerGradingQueue: GradingQueueDataDto = baseQueue;

export const lecturerGradingEmptyPending: GradingQueueDataDto = {
  ...baseQueue,
  counts: { pending: 0, graded: 1 },
  submissions: [],
};

export const lecturerGradingEmptyGraded: GradingQueueDataDto = {
  ...baseQueue,
  currentStatus: "graded",
  counts: { pending: 0, graded: 0 },
  submissions: [],
};

export const lecturerGradingGradedTab: GradingQueueDataDto = {
  ...baseQueue,
  currentStatus: "graded",
  submissions: [gradedItem],
};

const pendingDetail: SubmissionDetailDto = {
  id: 101,
  studentUserId: "usr-learner-001",
  studentName: "Nguyễn Minh An",
  studentEmail: "an.learner@codi.vn",
  studentAvatar: null,
  courseId: "course-node-001",
  courseTitle: "Node.js & Express xây dựng REST API",
  lessonId: null,
  lessonTitle: "Bài tập: Xây dựng REST API",
  instructions: "Xây dựng REST API quản lý danh sách công việc với đầy đủ CRUD và xác thực JWT.",
  maxScore: 10,
  passingScore: 5,
  rubric: [
    { id: "routes", name: "Định tuyến và CRUD", points: 4 },
    { id: "auth", name: "Xác thực JWT", points: 4 },
    { id: "errors", name: "Xử lý lỗi", points: 2 },
  ],
  rubricScores: null,
  answerText: "Em đã tách router, controller và middleware xác thực. Phần refresh token em chưa làm.",
  fileUrl: null,
  fileName: null,
  linkUrl: "https://github.com/an-nguyen/todo-api",
  submittedAt: "2026-10-25T08:20:00.000Z",
  status: "pending",
  score: null,
  feedback: "",
  history: [],
  viewToken: "lab-view-token-101",
  nextPendingId: 102,
};

export const lecturerGradingDetail: GradingQueueDataDto = {
  ...baseQueue,
  selectedSubmission: pendingDetail,
};

/** Last pending submission: nextPendingId is null. */
export const lecturerGradingLastPending: GradingQueueDataDto = {
  ...baseQueue,
  submissions: [pendingItems[2]],
  counts: { pending: 1, graded: 1 },
  selectedSubmission: { ...pendingDetail, id: 103, studentName: "Lê Đức Anh", studentEmail: "anh.le@codi.vn", courseId: "course-react-001", courseTitle: "React dự án thực tế", nextPendingId: null },
};

/** A graded submission with history, so the edit-grade dialog has a previous score. */
export const lecturerGradingEditGraded: GradingQueueDataDto = {
  ...baseQueue,
  currentStatus: "graded",
  submissions: [gradedItem],
  selectedSubmission: {
    ...pendingDetail,
    id: 90,
    studentName: "Võ Thảo Nhi",
    studentEmail: "nhi.vo@codi.vn",
    status: "graded",
    score: 8.5,
    feedback: "Bài làm tốt, cần bổ sung xử lý lỗi cho route.",
    history: [{ oldScore: 7, newScore: 8.5, feedback: "Bài làm tốt.", reason: "Chấm lại sau khi bổ sung xử lý lỗi", at: "2026-10-19T03:30:00.000Z", gradedBy: "usr-lecturer-001" }],
    nextPendingId: null,
  },
};

export const lecturerFeedbackSnippets: FeedbackSnippetItem[] = [
  { id: 1, title: "Nhận xét chung", body: "Bài làm đúng yêu cầu chính. Hãy chú ý đặt tên biến rõ nghĩa hơn.", createdAt: "2026-10-01T02:00:00.000Z" },
  { id: 2, title: "Cần cải thiện", body: "Chưa xử lý trường hợp dữ liệu rỗng ở {{tên học viên}}. Bổ sung kiểm tra đầu vào.", createdAt: "2026-10-02T02:00:00.000Z" },
  { id: 3, title: "Rất tốt", body: "Tuyệt vời! Cấu trúc code rõ ràng và dễ mở rộng.", createdAt: "2026-10-03T02:00:00.000Z" },
];

export const lecturerSnippetsEmpty: FeedbackSnippetItem[] = [];
