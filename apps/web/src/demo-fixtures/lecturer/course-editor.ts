import type { CourseEditor } from "@/app/dashboard/lecturer/courses/[courseId]/course-editor";
import type { PublicationDataDto } from "@/app/dashboard/lecturer/courses/[courseId]/publish/actions";
import type { KnowledgeMapConceptDto, KnowledgeMapDataDto, KnowledgeMapEdgeDto } from "@/app/dashboard/lecturer/courses/[courseId]/kmap/actions";
import type { ReadinessResult, ReviewRoundDto } from "@/lib/publication-service";

/** Course editor fixtures (S22 content/info, S24 knowledge map, S25 publish). */

type EditorData = Parameters<typeof CourseEditor>[0]["data"];

const COURSE_ID = "course-react-001";
const lessonId = (n: number) => `22222222-2222-4222-8222-2222222222${String(n).padStart(2, "0")}`;
const chapterId = (n: number) => `11111111-1111-4111-8111-1111111111${String(n).padStart(2, "0")}`;

const lesson = (n: number, chapter: number, position: number, title: string) => ({
  id: lessonId(n),
  chapterId: chapterId(chapter),
  title,
  description: null,
  durationSeconds: 900,
  position,
  isPublished: true,
  body: "## Nội dung bài học\n\nGiới thiệu khái niệm và ví dụ thực hành.",
  isFreePreview: n === 1,
  isRemedial: false,
});

export const reactChapters: EditorData["chapters"] = [
  {
    id: chapterId(1), courseId: COURSE_ID, title: "Chương 1: Nền tảng React", position: 0, isPublished: true,
    lessons: [
      lesson(1, 1, 0, "Bài 1: JSX và component"),
      lesson(2, 1, 1, "Bài 2: Props và state"),
      lesson(3, 1, 2, "Bài 3: Hooks cơ bản"),
    ],
  },
  {
    id: chapterId(2), courseId: COURSE_ID, title: "Chương 2: Quản lý trạng thái", position: 1, isPublished: true,
    lessons: [
      lesson(4, 2, 0, "Bài 4: useReducer"),
      lesson(5, 2, 1, "Bài 5: Context API"),
    ],
  },
];

const editorCourse = {
  id: COURSE_ID, slug: "react-du-an-thuc-te", title: "React dự án thực tế",
  description: "Xây dựng ứng dụng React hoàn chỉnh từ đầu, từ component đến quản lý trạng thái.",
  category: "Frontend", level: "Intermediate", status: "draft", price: 0, proposedPrice: 990000,
  knowledgeMapStatus: "empty", rejectReason: null, hiddenReason: null,
};

export function lecturerEditorData(overrides: Partial<EditorData> = {}): EditorData {
  return {
    course: editorCourse,
    details: {
      learningOutcomes: ["Viết component có props và state", "Dùng hooks để quản lý side effect"],
      requirements: ["Biết HTML, CSS và JavaScript cơ bản"],
      targetAudience: "Lập trình viên mới bắt đầu với React",
      coverImageUrl: null,
      introVideoUrl: null,
    },
    chapters: reactChapters,
    entryTest: null,
    isLocked: false,
    ...overrides,
  };
}

type KmapStatus = KnowledgeMapDataDto["course"]["knowledgeMapStatus"];

const kmapLessons = reactChapters.flatMap((ch) =>
  ch.lessons.map((l: { id: string; title: string; chapterId: string }) => ({ id: l.id, title: l.title, chapterId: l.chapterId })),
);
const kmapChapters = reactChapters.map((ch) => ({ id: ch.id, title: ch.title }));

const concepts: KnowledgeMapConceptDto[] = [
  { id: 1, name: "JSX", description: "Cú pháp mô tả giao diện trong JavaScript.", source: "ai", review: "accepted", lessonIds: [lessonId(1)] },
  { id: 2, name: "Component và props", description: "Đơn vị giao diện tái sử dụng và dữ liệu truyền vào.", source: "ai", review: "suggested", lessonIds: [lessonId(1), lessonId(2)] },
  { id: 3, name: "State", description: "Dữ liệu thay đổi theo tương tác người dùng.", source: "ai", review: "suggested", lessonIds: [lessonId(2)] },
  { id: 4, name: "Hooks", description: null, source: "lecturer", review: "edited", lessonIds: [lessonId(3)] },
  { id: 5, name: "Context", description: "Chia sẻ state giữa nhiều component.", source: "ai", review: "declined", lessonIds: [lessonId(5)] },
];

const edges: KnowledgeMapEdgeDto[] = [
  { from: 1, to: 2, source: "ai", review: "accepted" },
  { from: 2, to: 3, source: "ai", review: "suggested" },
  { from: 3, to: 4, source: "lecturer", review: "edited" },
];

/** Graph with a loop 3 -> 4 -> 3, named by KnowledgeMapDataDto.cycle. */
export const kmapCycleEdges: KnowledgeMapEdgeDto[] = [...edges, { from: 4, to: 3, source: "ai", review: "suggested" }];

export function kmapData(status: KmapStatus, overrides: Partial<KnowledgeMapDataDto> = {}): KnowledgeMapDataDto {
  const hasMap = status === "ready" || status === "confirmed" || status === "stale";
  return {
    course: {
      id: COURSE_ID, title: editorCourse.title, status: "draft", knowledgeMapStatus: status,
      knowledgeMapGeneratedAt: status === "empty" ? null : new Date("2026-10-24T03:00:00.000Z"),
    },
    isLocked: false,
    concepts: hasMap ? concepts : [],
    edges: hasMap ? edges : [],
    chapters: kmapChapters,
    lessons: kmapLessons,
    cycle: null,
    defaultOrder: hasMap ? kmapLessons.map((l) => ({ id: l.id, title: l.title })) : null,
    ...overrides,
  };
}

const readiness: ReadinessResult = {
  items: [
    { key: "info", ok: true, label: "Thông tin khoá học đầy đủ", hint: "Tên, mô tả, danh mục và trình độ đã có.", href: "info" },
    { key: "lessons", ok: true, label: "Mỗi chương có ít nhất một bài học", hint: "5 bài học trong 2 chương.", href: "content" },
    { key: "materials", ok: false, label: "Mọi bài học có tài liệu", hint: "Bài 3 chưa có video hoặc nội dung.", href: "content" },
    { key: "quiz", ok: true, label: "Bài kiểm tra theo chương", hint: "Đã có quiz cho 2 chương.", href: "content" },
    { key: "rights", ok: true, label: "Xác nhận quyền nội dung", hint: "Bạn xác nhận nội dung là của bạn.", href: "publish" },
  ],
  allOk: false,
};

export const readyReadiness: ReadinessResult = { items: readiness.items.map((i) => ({ ...i, ok: true })), allOk: true };
export const blockedReadiness = readiness;

export function publicationRound(status: ReviewRoundDto["status"], overrides: Partial<ReviewRoundDto> = {}): ReviewRoundDto {
  return {
    id: 1, courseId: COURSE_ID, round: 1, status, requestedBy: "usr-lecturer-001", reviewedBy: null,
    validationStatus: "passed", reviewNote: null, approvedPrice: null,
    requestedAt: "2026-10-24T09:10:00.000Z", reviewedAt: null, criteria: {}, flags: [],
    ...overrides,
  };
}

export function publicationData(
  status: string,
  overrides: { course?: Partial<PublicationDataDto["course"]>; readiness?: ReadinessResult; round?: ReviewRoundDto | null; isLocked?: boolean } = {},
): PublicationDataDto {
  return {
    course: {
      id: COURSE_ID, title: editorCourse.title, summary: editorCourse.description, description: editorCourse.description,
      status, price: 0, proposedPrice: 990000, rejectReason: null, reviewOutcome: null, publishedAt: null,
      hiddenReason: null, knowledgeMapStatus: "confirmed", ...overrides.course,
    },
    readiness: overrides.readiness ?? blockedReadiness,
    round: overrides.round ?? null,
    isLocked: overrides.isLocked ?? false,
  };
}

/** Course row for a knowledge map whose content changed after confirmation. */
export const kmapStaleCourse: KnowledgeMapDataDto["course"] = {
  id: COURSE_ID,
  title: editorCourse.title,
  status: "published",
  knowledgeMapStatus: "stale",
  knowledgeMapGeneratedAt: new Date("2026-10-24T03:00:00.000Z"),
  requiresReconfirmation: true,
};

const changesRound = publicationRound("changes_requested", {
  reviewedBy: "usr-admin-001",
  reviewedAt: "2026-10-25T02:00:00.000Z",
  reviewNote: "Cần sửa bài 3 trước khi duyệt.",
  flags: [
    {
      id: 1, targetType: "lesson", lessonId: lessonId(3), targetLabel: "Bài 3: Hooks cơ bản",
      severity: "must", comment: "Thiếu video hoặc nội dung đọc cho bài này.", status: "open", source: "admin",
    },
  ],
});

/** Publish tab data per review state (S25). */
export const lecturerPublishStates = {
  pending: publicationData("pending", {
    readiness: readyReadiness, isLocked: true,
    round: publicationRound("in_review"),
  }),
  rejected: publicationData("rejected", {
    course: { rejectReason: "Nội dung chương 2 chưa đủ chiều sâu so với mô tả khoá học." },
    readiness: readyReadiness,
    round: publicationRound("rejected", { reviewNote: "Nội dung chương 2 chưa đủ chiều sâu.", reviewedAt: "2026-10-25T02:00:00.000Z" }),
  }),
  changesRequested: publicationData("draft", { readiness: readyReadiness, round: changesRound }),
  published: publicationData("published", {
    course: { publishedAt: "2026-10-20T03:00:00.000Z", reviewOutcome: "approved" },
    readiness: readyReadiness,
    round: publicationRound("approved", { reviewedAt: "2026-10-20T03:00:00.000Z", approvedPrice: 990000 }),
  }),
  hidden: publicationData("hidden", {
    course: { hiddenReason: "Tạm ẩn để cập nhật nội dung bài kiểm tra.", publishedAt: "2026-10-20T03:00:00.000Z" },
    readiness: readyReadiness,
  }),
};
