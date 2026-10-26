import type { AdminCourseReviewDetailDto, AdminPublicationQueueDto } from "@/app/dashboard/admin/publication/actions";
import type {
  AutoCriterionResult,
  CourseDataForReview,
  ReviewCriterionId,
  ReviewRoundDto,
} from "@/lib/publication-service";

/** Admin publication review (S32) and learner preview (S32b) fixtures, shaped like the admin loaders. */

const TS_COURSE_ID = "course-ts-001";
const NEXT_COURSE_ID = "course-next-001";

export const adminPublicationPending: AdminPublicationQueueDto = {
  tab: "pending",
  counts: { pending: 2, changes: 1, approved: 1 },
  items: [
    {
      id: TS_COURSE_ID, title: "TypeScript chuyên sâu", instructorId: "usr-lecturer-001", instructorName: "Trần Minh Khoa",
      category: "Frontend", level: "Advanced", price: 0, status: "pending", round: 1, openFlagsCount: 0,
      submittedAt: "2026-10-24T09:10:00.000Z",
    },
    {
      id: NEXT_COURSE_ID, title: "Next.js App Router thực chiến", instructorId: "usr-lecturer-002", instructorName: "Lê Thu Hà",
      category: "Frontend", level: "Intermediate", price: 0, status: "pending", round: 2, openFlagsCount: 1,
      submittedAt: "2026-10-25T02:40:00.000Z",
    },
  ],
};

export const adminPublicationChanges: AdminPublicationQueueDto = {
  tab: "changes",
  counts: { pending: 2, changes: 1, approved: 1 },
  items: [
    {
      id: "course-node-001", title: "Node.js & Express xây dựng REST API", instructorId: "usr-lecturer-001", instructorName: "Trần Minh Khoa",
      category: "Backend", level: "Beginner", price: 0, status: "draft", round: 1, openFlagsCount: 2,
      submittedAt: "2026-10-22T08:30:00.000Z",
    },
  ],
};

export const adminPublicationApproved: AdminPublicationQueueDto = {
  tab: "approved",
  counts: { pending: 2, changes: 1, approved: 1 },
  items: [
    {
      id: "course-react-001", title: "React dự án thực tế", instructorId: "usr-lecturer-001", instructorName: "Trần Minh Khoa",
      category: "Frontend", level: "Intermediate", price: 990000, status: "published", round: 1, openFlagsCount: 0,
      submittedAt: "2026-10-10T03:00:00.000Z",
    },
  ],
};

export const adminPublicationEmpty = (tab: AdminPublicationQueueDto["tab"]): AdminPublicationQueueDto => ({
  tab,
  counts: { pending: 0, changes: 0, approved: 0 },
  items: [],
});

const reviewCourse: CourseDataForReview = {
  id: TS_COURSE_ID,
  title: "TypeScript chuyên sâu",
  summary: "Generic, conditional types và thiết kế kiểu an toàn cho dự án lớn.",
  description: "Khoá học đi sâu vào hệ thống kiểu của TypeScript qua các ví dụ thực tế.",
  category: "Frontend",
  level: "Advanced",
  price: 0,
  proposedPrice: 1290000,
  knowledgeMapStatus: "confirmed",
  chapters: [
    {
      id: "11111111-1111-4111-8111-111111111301",
      title: "Chương 1: Kiểu cơ bản",
      lessons: [
        {
          id: "22222222-2222-4222-8222-222222222301", title: "Bài 1: Kiểu nguyên thuỷ và union", type: "video", durationSeconds: 900,
          materials: [{ id: 1, type: "video", title: "Video bài 1", url: "https://cdn.codi.vn/ts/bai1.mp4" }],
          quiz: { passingScore: 70, questions: [{ id: 1, text: "string | number là gì?", explanation: "Kiểu hợp.", correctIndex: 0, options: ["Kiểu hợp", "Kiểu giao"] }] },
        },
        {
          id: "22222222-2222-4222-8222-222222222302", title: "Bài 2: Generic", type: "reading", durationSeconds: 1200,
          body: "## Generic\n\nGeneric giúp viết hàm dùng lại cho nhiều kiểu.",
          materials: [],
          quiz: null,
        },
        {
          id: "22222222-2222-4222-8222-222222222303", title: "Bài 3: Thực hành kiểu", type: "code", durationSeconds: 1800,
          code: {
            kind: "challenge",
            tests: [{ id: 1, name: "Kiểu trả về", call: "pick(1, 'a')", expected: 1, hidden: false }],
            instructions: ["Viết hàm pick trả về phần tử đầu tiên."],
            starterCode: "export function pick(a, b) {}",
            solutionCheck: { ok: true, passed: 1, total: 1 },
          },
        },
      ],
    },
  ],
  entryTest: null,
};

const autoCriteria: Record<ReviewCriterionId, AutoCriterionResult> = {
  info: { status: "pass", why: "Mô tả và giá đề xuất đầy đủ." },
  materials: { status: "fix", why: "Bài 2 chưa có tài liệu đính kèm." },
  quiz: { status: "pass", why: "Mọi quiz có đáp án đúng và giải thích." },
  entry: { status: "na", why: "Khoá học không có bài kiểm tra đầu vào." },
  code: { status: "pass", why: "Bài code có lời giải mẫu đã kiểm tra." },
  assignment: { status: "na", why: "Không có bài tập nộp." },
  rights: { status: null, why: "Chờ admin xác nhận." },
};

const reviewRound: ReviewRoundDto = {
  id: 11, courseId: TS_COURSE_ID, round: 1, status: "in_review", requestedBy: "usr-lecturer-001", reviewedBy: null,
  validationStatus: "passed", reviewNote: null, approvedPrice: null,
  requestedAt: "2026-10-24T09:10:00.000Z", reviewedAt: null,
  criteria: {
    info: { status: "pass" },
    materials: { status: null },
    quiz: { status: "pass" },
    entry: { status: "na" },
    code: { status: "pass" },
    assignment: { status: "na" },
    rights: { status: null },
  },
  flags: [],
};

const detail = (overrides: Partial<AdminCourseReviewDetailDto> = {}): AdminCourseReviewDetailDto => ({
  course: reviewCourse,
  instructor: { id: "usr-lecturer-001", name: "Trần Minh Khoa", email: "khoa.lecturer@codi.vn" },
  details: {
    learningOutcomes: ["Viết generic và conditional types", "Thiết kế kiểu cho API"],
    requirements: ["Đã biết TypeScript cơ bản"],
    targetAudience: "Lập trình viên đã dùng JavaScript",
  },
  round: reviewRound,
  roundsHistory: [
    { id: 11, round: 1, status: "in_review", requestedAt: "2026-10-24T09:10:00.000Z", reviewedAt: null, note: null, flagsCount: 0, closedFlagsCount: 0 },
  ],
  autoCriteria,
  blockingReasons: [],
  ...overrides,
});

/** Ready to approve: no blocking reasons. */
export const adminPublicationDetail: AdminCourseReviewDetailDto = detail({
  autoCriteria: { ...autoCriteria, materials: { status: "pass", why: "Mọi bài đều có tài liệu." } },
  round: { ...reviewRound, criteria: { ...reviewRound.criteria, materials: { status: "pass" }, rights: { status: "pass" } } },
});

/** Blocked: materials failing and a must-fix flag open. */
export const adminPublicationBlocked: AdminCourseReviewDetailDto = detail({
  blockingReasons: ["Tiêu chí “Video, slide và tài liệu đầy đủ” chưa đạt.", "Còn 1 cờ bắt buộc sửa chưa đóng."],
  round: {
    ...reviewRound,
    flags: [
      {
        id: 21, requestId: 11, targetType: "lesson", lessonId: "22222222-2222-4222-8222-222222222302",
        targetLabel: "Bài 2: Generic", severity: "must", comment: "Thiếu tài liệu đọc đính kèm.", status: "open",
        source: "admin", createdAt: "2026-10-25T03:00:00.000Z",
      },
    ],
  },
  roundsHistory: [
    { id: 11, round: 1, status: "in_review", requestedAt: "2026-10-24T09:10:00.000Z", reviewedAt: null, note: null, flagsCount: 1, closedFlagsCount: 0 },
  ],
});

/** Round 2 after changes were requested in round 1: history and closed flags shown. */
export const adminPublicationHistory: AdminCourseReviewDetailDto = detail({
  round: { ...reviewRound, id: 12, round: 2, reviewNote: null },
  roundsHistory: [
    { id: 11, round: 1, status: "changes_requested", requestedAt: "2026-10-20T09:10:00.000Z", reviewedAt: "2026-10-21T02:00:00.000Z", note: "Bổ sung tài liệu bài 2.", flagsCount: 2, closedFlagsCount: 2 },
    { id: 12, round: 2, status: "in_review", requestedAt: "2026-10-24T09:10:00.000Z", reviewedAt: null, note: null, flagsCount: 0, closedFlagsCount: 0 },
  ],
});

/** A course with no chapters, to show the empty content preview. */
export const adminPublicationEmptyCourse: CourseDataForReview = { ...reviewCourse, chapters: [] };
