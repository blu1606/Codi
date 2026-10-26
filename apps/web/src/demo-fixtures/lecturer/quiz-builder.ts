import type { QuizBuilderClient } from "@/app/dashboard/lecturer/courses/[courseId]/quiz/[lessonId]/quiz-builder-client";
import type { AiQuizGenerationResult, QuizQuestionInput } from "@/app/dashboard/lecturer/courses/[courseId]/actions";

/** Quiz builder loader data (S23), typed with the client's own initialData prop. */
export type LecturerQuizBuilderData = Parameters<typeof QuizBuilderClient>[0]["initialData"];

const COURSE_ID = "course-react-001";
const LESSON_ID = "22222222-2222-4222-8222-222222222202";

const course = { id: COURSE_ID, title: "React dự án thực tế", status: "draft" };

const lesson = {
  id: LESSON_ID,
  chapterId: "11111111-1111-4111-8111-111111111101",
  title: "Bài 2: Props và state",
  position: 1,
  isPublished: true,
};

export const lecturerQuizQuestions: LecturerQuizBuilderData["questions"] = [
  {
    id: 1,
    text: "Props là gì trong React?",
    explanation: "Props là dữ liệu truyền từ component cha xuống component con và là bất biến trong component con.",
    correctIndex: 1,
    options: ["Trạng thái nội bộ của component", "Dữ liệu truyền từ cha xuống con", "Hàm xử lý sự kiện", "Biến toàn cục"],
    optionIds: [101, 102, 103, 104],
  },
  {
    id: 2,
    text: "Hook nào dùng để lưu state trong function component?",
    explanation: null,
    correctIndex: 0,
    options: ["useState", "useEffect"],
    optionIds: [201, 202],
  },
];

export const lecturerQuizBuilder: LecturerQuizBuilderData = {
  course,
  lesson,
  isEntry: false,
  isLocked: false,
  passingScore: 70,
  questions: lecturerQuizQuestions,
};

/** A lesson quiz with no questions yet. */
export const lecturerQuizEmpty: LecturerQuizBuilderData = { ...lecturerQuizBuilder, questions: [] };

/** Locked while the course is pending review (read-only). */
export const lecturerQuizLocked: LecturerQuizBuilderData = {
  ...lecturerQuizBuilder,
  course: { ...course, status: "pending" },
  isLocked: true,
};

/** Entry test (lessonId "entry"): questions tied to lessons and the entry flag on. */
export const lecturerQuizEntry: LecturerQuizBuilderData = {
  course,
  lesson: null,
  isEntry: true,
  isLocked: false,
  passingScore: 60,
  questions: lecturerQuizQuestions.map((q, i) => ({ ...q, lessonId: i === 0 ? LESSON_ID : null })),
  allCourseLessons: [
    { id: LESSON_ID, title: "Bài 2: Props và state", chapterTitle: "Chương 1: Nền tảng React" },
    { id: "22222222-2222-4222-8222-222222222203", title: "Bài 3: Hooks cơ bản", chapterTitle: "Chương 1: Nền tảng React" },
  ],
};

/** Pasted into the import dialog: two valid questions and one with no correct answer (inline error). */
export const lecturerQuizImportSample = `Props là gì trong React?
A. Trạng thái nội bộ
* B. Dữ liệu truyền từ cha xuống con
- Hàm xử lý sự kiện
Giải thích: Props là dữ liệu bất biến trong component con.

Hook nào lưu state trong function component?
* useState
- useEffect

Hook nào chạy sau mỗi lần render?
A. useState
B. useEffect`;

/** Drafts the AI returns for a lesson; each one still needs the lecturer's review. */
export const lecturerAiQuizQuestions: QuizQuestionInput[] = [
  {
    text: "Component con có sửa trực tiếp props nhận từ cha không?",
    options: ["Có, bằng cách gán giá trị mới", "Không, props là bất biến trong component con", "Có, nếu dùng useState", "Chỉ khi component là class"],
    correctIndex: 1,
    explanation: "Props do component cha truyền xuống và là bất biến trong component con.",
    aiGenerated: true,
    aiReviewed: false,
  },
  {
    text: "Khi state của một component thay đổi, điều gì xảy ra?",
    options: ["Component cha bị render lại", "Component được render lại để cập nhật giao diện", "Props của component bị xoá", "Không có gì xảy ra"],
    correctIndex: 1,
    explanation: "Thay đổi state khiến component render lại với giá trị mới.",
    aiGenerated: true,
    aiReviewed: false,
  },
  {
    text: "Hook nào dùng để khai báo state trong function component?",
    options: ["useEffect", "useState", "useRef", "useMemo"],
    correctIndex: 1,
    explanation: "useState trả về giá trị state hiện tại và hàm cập nhật state.",
    aiGenerated: true,
    aiReviewed: false,
  },
];

export const lecturerAiResult: AiQuizGenerationResult = { success: true, questions: lecturerAiQuizQuestions };

export const lecturerAiRateLimited: AiQuizGenerationResult = {
  success: false,
  code: "rate_limited",
  message: "AI đang quá tải hoặc đã hết lượt tạo trong thời gian ngắn. Đợi một lúc rồi thử lại.",
  retryable: true,
};
