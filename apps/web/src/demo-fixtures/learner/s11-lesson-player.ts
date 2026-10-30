import type { AssessmentView } from "@/lib/assessment-contract";
import type { CodingView } from "@/lib/coding-contract";
import type { ChecklistItem, LessonMaterial, LessonPlayerView } from "@/lib/lesson-player-contract";
import type { AdjustmentOffer, CoursePathView } from "@/lib/learning-path-contract";
import { coursePathReady, coursePathSoftLocked, coursePathUpdated } from "./s10-course-home";
import lessonPlayerSnapshot from "../snapshot/lesson-player.json";

export const LESSON_COURSE_ID = "course-js-001";
export const LESSON_ID = "lesson-js-005";
export const QUIZ_ASSESSMENT_ID = 51;
export const ASSIGNMENT_ASSESSMENT_ID = 52;
export const CODING_ASSESSMENT_ID = 61;

const lesson: LessonPlayerView["lesson"] = {
  id: LESSON_ID,
  title: "Chọn và thay đổi phần tử DOM",
  chapterTitle: "Trình duyệt và DOM",
  description: "Dùng querySelector để tìm phần tử, rồi đổi nội dung và thuộc tính của nó.",
  body: [
    "## Tìm phần tử trong trang",
    "",
    "`document.querySelector(\"#tieu-de\")` trả về phần tử đầu tiên khớp CSS selector. Nếu không tìm thấy, kết quả là `null`.",
    "",
    "```js",
    "const tieuDe = document.querySelector(\"#tieu-de\");",
    "tieuDe.textContent = \"Xin chào\";",
    "```",
    "",
    "Luôn kiểm tra `null` trước khi thao tác với phần tử.",
  ].join("\n"),
  durationSeconds: 1140,
};

const videoMaterial: LessonMaterial = {
  id: 1, type: "video", title: "Video: Chọn phần tử DOM", url: "https://www.youtube.com/watch?v=Ua0pLpVEvEo", durationSeconds: 1140,
};

const brokenVideoMaterial: LessonMaterial = { ...videoMaterial, url: null };

const checklistStudy: ChecklistItem = { key: "study", label: "Học xong nội dung", done: false, note: "Xem ít nhất 90% video hoặc đánh dấu đã học xong." };
const checklistQuiz = (done: boolean): ChecklistItem => ({
  key: "quiz", label: "Làm quiz", done, note: "Đạt từ 70% để hoàn thành.", assessmentId: QUIZ_ASSESSMENT_ID,
});
const checklistAssignment = (done: boolean): ChecklistItem => ({
  key: "assignment", label: "Nộp bài tập", done, note: "Nộp file .js hoặc đường dẫn GitHub.", assessmentId: ASSIGNMENT_ASSESSMENT_ID,
});
const checklistCode = (done: boolean): ChecklistItem => ({
  key: "code", label: "Hoàn thành bài code", done, note: "Đạt tất cả test để hoàn thành.", assessmentId: CODING_ASSESSMENT_ID,
});

type LessonOverrides = Partial<Omit<LessonPlayerView, "lesson">>;

/** Lesson player data; the path sidebar is the ready course path from S10. */
export function lessonPlayerView(overrides: LessonOverrides = {}): LessonPlayerView {
  return {
    lesson,
    materials: [videoMaterial],
    media: {},
    positionSeconds: 0,
    studied: false,
    completed: false,
    checklist: [checklistStudy, checklistQuiz(false)],
    path: coursePathReady,
    ...overrides,
  };
}

/** The seed learner's resume lesson as the real player returns it (snapshot). */
export const lessonVideoDefault = lessonPlayerSnapshot as unknown as LessonPlayerView;
export const lessonMaterialError = lessonPlayerView({ materials: [brokenVideoMaterial] });
export const lessonReading = lessonPlayerView({ materials: [], checklist: [checklistStudy] });
export const lessonChecklistPartial = lessonPlayerView({
  materials: [],
  studied: true,
  checklist: [{ ...checklistStudy, done: true, note: "Đã học xong nội dung" }, checklistQuiz(false)],
});
export const lessonCompleted = lessonPlayerView({
  materials: [],
  studied: true,
  completed: true,
  checklist: [{ ...checklistStudy, done: true, note: "Đã học xong nội dung" }, checklistQuiz(true)],
  path: coursePathUpdated,
});
export const lessonAssignmentPending = lessonPlayerView({
  materials: [],
  checklist: [{ ...checklistStudy, done: true, note: "Đã học xong nội dung" }, checklistAssignment(false)],
});
export const lessonCodeBase = lessonPlayerView({
  materials: [],
  checklist: [{ ...checklistStudy, done: true, note: "Đã học xong nội dung" }, checklistCode(false)],
});

const questions: AssessmentView["questions"] = [
  { id: 1, text: "Phương thức nào trả về phần tử đầu tiên khớp CSS selector?", codeSnippet: null, options: [{ id: 1, text: "getElementById" }, { id: 2, text: "querySelector" }, { id: 3, text: "getElementsByClassName" }] },
  { id: 2, text: "Điều gì xảy ra nếu querySelector không tìm thấy phần tử?", codeSnippet: null, options: [{ id: 4, text: "Trả về chuỗi rỗng" }, { id: 5, text: "Trả về null" }, { id: 6, text: "Ném lỗi" }] },
  { id: 3, text: "Thuộc tính nào đổi nội dung văn bản của phần tử?", codeSnippet: "el.___ = \"Xin chào\";", options: [{ id: 7, text: "innerText" }, { id: 8, text: "value" }] },
];

const quizBase: AssessmentView = {
  id: QUIZ_ASSESSMENT_ID,
  type: "quiz",
  title: "Quiz: Chọn và thay đổi phần tử DOM",
  instructions: null,
  maxScore: 100,
  passingScore: 70,
  submissionFormat: null,
  maxFileSizeMb: 0,
  rubric: null,
  dueDays: null,
  questions,
  submission: null,
  previousScore: null,
  previousQuizPercent: null,
  unavailableReason: null,
};

export const quizAnswering: AssessmentView = quizBase;

export const quizPassed: AssessmentView = {
  ...quizBase,
  previousScore: 100,
  previousQuizPercent: 100,
  submission: {
    id: 901, attempt: 1, status: "graded", score: 100, quizPercent: 100, isPassed: true,
    submittedAt: "2026-10-25T13:10:00.000Z", gradedAt: "2026-10-25T13:10:00.000Z", feedback: null,
    fileName: null, fileUrl: null, linkUrl: null, answerText: null, draft: null,
    answers: [{ questionId: 1, optionId: 2 }, { questionId: 2, optionId: 5 }, { questionId: 3, optionId: 7 }],
    review: [
      { questionId: 1, correctOptionId: 2, isCorrect: true, explanation: null },
      { questionId: 2, correctOptionId: 5, isCorrect: true, explanation: null },
      { questionId: 3, correctOptionId: 7, isCorrect: true, explanation: null },
    ],
  },
};

export const quizFailed: AssessmentView = {
  ...quizBase,
  previousScore: 67,
  previousQuizPercent: 67,
  submission: {
    id: 902, attempt: 2, status: "graded", score: 67, quizPercent: 67, isPassed: false,
    submittedAt: "2026-10-25T13:20:00.000Z", gradedAt: "2026-10-25T13:20:00.000Z", feedback: null,
    fileName: null, fileUrl: null, linkUrl: null, answerText: null, draft: null,
    answers: [{ questionId: 1, optionId: 3 }, { questionId: 2, optionId: 5 }, { questionId: 3, optionId: 7 }],
    review: [
      { questionId: 1, correctOptionId: 2, isCorrect: false, explanation: "getElementById chỉ tìm theo id, không nhận CSS selector." },
      { questionId: 2, correctOptionId: 5, isCorrect: true, explanation: null },
      { questionId: 3, correctOptionId: 7, isCorrect: true, explanation: null },
    ],
  },
};

const assignmentBase: AssessmentView = {
  id: ASSIGNMENT_ASSESSMENT_ID,
  type: "assignment",
  title: "Bài tập: Đổi nội dung danh sách bằng DOM",
  instructions: "Viết hàm renderTodos(list, items) tạo một thẻ li cho mỗi phần tử trong items và gắn vào ul. Nộp tệp .js hoặc đường dẫn GitHub.",
  maxScore: 10,
  passingScore: 5,
  submissionFormat: "file_or_link",
  maxFileSizeMb: 5,
  rubric: "Đúng logic (4 điểm) · Dùng DOM API đúng cách (3 điểm) · Xử lý mảng rỗng (3 điểm)",
  dueDays: 7,
  questions: [],
  submission: null,
  previousScore: null,
  unavailableReason: null,
};

export const assignmentNotSubmitted: AssessmentView = assignmentBase;

export const assignmentSubmitted: AssessmentView = {
  ...assignmentBase,
  submission: {
    id: 931, attempt: 1, status: "pending", score: null, quizPercent: null, isPassed: null,
    submittedAt: "2026-10-24T20:00:00.000Z", gradedAt: null, feedback: null,
    fileName: "render-todos.js", fileUrl: null, linkUrl: null, answerText: "Em dùng createElement và append.", draft: null,
    answers: [], review: [],
  },
};

export const assignmentGraded: AssessmentView = {
  ...assignmentBase,
  previousScore: 8.5,
  submission: {
    id: 932, attempt: 1, status: "graded", score: 8.5, quizPercent: null, isPassed: true,
    submittedAt: "2026-10-24T20:00:00.000Z", gradedAt: "2026-10-25T09:00:00.000Z",
    feedback: "Làm tốt! Nên thêm kiểm tra mảng rỗng để tránh lỗi khi render.",
    fileName: "render-todos.js", fileUrl: null, linkUrl: null, answerText: null, draft: null,
    answers: [], review: [],
  },
};

const codingBase: CodingView = {
  id: CODING_ASSESSMENT_ID,
  title: "Thử thách: Thêm phần tử vào danh sách",
  instructions: "Viết hàm addItem(list, item) trả về mảng mới có thêm item ở cuối, không sửa mảng gốc.",
  language: "javascript",
  available: true,
  starterCode: "function addItem(list, item) {\n  // Viết code ở đây\n}\n",
  code: "function addItem(list, item) {\n  return [...list, item];\n}\n",
  hints: ["Dùng spread để tạo mảng mới thay vì push vào mảng gốc."],
  lockedHints: 1,
  solution: null,
  solutionAvailable: false,
  solutionViewed: false,
  runs: 0,
  submits: 0,
  failedSubmits: 0,
  passed: false,
  score: null,
  tests: [
    { id: 1, name: "Thêm vào danh sách rỗng", input: "[], 1", expectedOutput: "[1]" },
    { id: 2, name: "Không sửa mảng gốc", input: "[1, 2], 3", expectedOutput: "[1, 2, 3]" },
    { id: 3, name: "Thêm chuỗi", input: "[\"a\"], \"b\"", expectedOutput: "[\"a\", \"b\"]" },
  ],
  lastRun: null,
};

export const codingIdle: CodingView = codingBase;
export const codingSandboxDown: CodingView = { ...codingBase, available: false };
export const codingSomeFailed: CodingView = {
  ...codingBase,
  runs: 2,
  lastRun: {
    mode: "run", phase: "done", durationMs: 38, logs: [], passed: 2, total: 3, hiddenPassed: 0, hiddenTotal: 0,
    outcomes: [
      { id: 1, passed: true, actual: "[1]", error: null, line: null },
      { id: 2, passed: false, actual: "[1, 2]", error: null, line: 2 },
      { id: 3, passed: true, actual: "[\"a\", \"b\"]", error: null, line: null },
    ],
  },
};
export const codingAllPassed: CodingView = {
  ...codingBase,
  runs: 3, submits: 1, passed: true, score: 100,
  code: codingBase.code,
  lastRun: {
    mode: "submit", phase: "done", durationMs: 41, logs: [], passed: 3, total: 3, hiddenPassed: 0, hiddenTotal: 0,
    outcomes: [
      { id: 1, passed: true, actual: "[1]", error: null, line: null },
      { id: 2, passed: true, actual: "[1, 2, 3]", error: null, line: null },
      { id: 3, passed: true, actual: "[\"a\", \"b\"]", error: null, line: null },
    ],
  },
};
export const codingRuntimeError: CodingView = {
  ...codingBase,
  runs: 1,
  lastRun: {
    mode: "run", phase: "runtime", durationMs: 12, logs: ["ReferenceError: list is not defined"], passed: 0, total: 3, hiddenPassed: 0, hiddenTotal: 0,
    outcomes: [],
  },
};
export const codingTimeout: CodingView = {
  ...codingBase,
  runs: 1,
  lastRun: {
    mode: "run", phase: "timeout", durationMs: 5000, logs: [], passed: 0, total: 3, hiddenPassed: 0, hiddenTotal: 0,
    outcomes: [],
  },
};

/** Soft lock: the lesson opens, with the advisory warning and a locked row in the path. */
export const lessonSoftLocked = lessonPlayerView({ path: coursePathSoftLocked, materials: [] });

/** All checklist items done, so completion is enabled and the completion offer can follow it. */
export const lessonReadyToComplete = lessonPlayerView({
  materials: [],
  studied: true,
  checklist: [{ ...checklistStudy, done: true, note: "Đã học xong nội dung" }],
});

/** Lesson with the video, quiz and assignment all still open: the task list is what the learner sees first. */
export const lessonTasksAtTop = lessonPlayerView({
  checklist: [checklistStudy, checklistQuiz(false), checklistAssignment(false)],
});

/** Lesson 005 has just been completed: its row is done and lesson 006 is the next node the map moves to. */
export const coursePathAfterCompletion: CoursePathView = (() => {
  const rows = coursePathReady.rows.map((row) => {
    if (row.id === LESSON_ID) return { ...row, status: "done" as const, progress: "completed" as const, studied: true };
    if (row.id === "lesson-js-006") return { ...row, status: "next" as const };
    return row;
  });
  const done = rows.filter((row) => row.status === "done").length;
  return { ...coursePathReady, rows, currentLessonId: "lesson-js-006", done, percent: Math.round((done / rows.length) * 100) };
})();

export const lessonAfterCompletion = lessonPlayerView({
  materials: [],
  studied: true,
  completed: true,
  checklist: [{ ...checklistStudy, done: true, note: "Đã học xong nội dung" }, checklistQuiz(true)],
  path: coursePathAfterCompletion,
});

const keepOption = { type: "keep" as const, label: "Giữ nguyên lộ trình", description: "Thứ tự các bài còn lại không đổi." };
const OFFER_BASE = {
  afterLessonId: LESSON_ID,
  insight: "Bài quiz gần nhất đạt 85%. Codi thấy bạn đã nắm vững Hàm. Bạn còn chưa chắc về Mảng.",
};
const skipOption = { type: "skip-mastered" as const, label: "Bỏ qua các bài đã nắm vững", description: "Đánh dấu 1 bài có thể bỏ qua." };
const practiceOption = { type: "practice" as const, label: "Ôn lại trước khi học tiếp", description: "Thêm 1 bài ôn ngay sau bài vừa học." };
const harderOption = { type: "harder" as const, label: "Làm bài code sớm hơn", description: "Đưa 1 bài code lên sớm hơn." };

/** Completion offers: each shape lists only the options that would change the path, then keep. */
export const offerSkipMastered: AdjustmentOffer = { ...OFFER_BASE, options: [skipOption, keepOption] };
export const offerPractice: AdjustmentOffer = { ...OFFER_BASE, options: [practiceOption, keepOption] };
export const offerHarder: AdjustmentOffer = { ...OFFER_BASE, options: [harderOption, keepOption] };
export const offerAll: AdjustmentOffer = { ...OFFER_BASE, options: [skipOption, practiceOption, harderOption, keepOption] };
