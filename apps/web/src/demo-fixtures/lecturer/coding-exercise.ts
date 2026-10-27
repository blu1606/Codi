import type { CodingBuilderClient } from "@/app/dashboard/lecturer/courses/[courseId]/code/[lessonId]/coding-builder-client";
import type { CodingExercisePreviewClient } from "@/app/dashboard/lecturer/courses/[courseId]/code/[lessonId]/preview/preview-client";

/** Coding exercise loader data (S23b builder) and preview data, typed with the client props. */
export type LecturerCodingBuilderData = Parameters<typeof CodingBuilderClient>[0]["initialData"];
export type LecturerCodingPreviewData = Parameters<typeof CodingExercisePreviewClient>[0]["data"];

export const CODING_COURSE_ID = "course-react-001";
export const CODING_LESSON_ID = "22222222-2222-4222-8222-222222222203";

const course = { id: CODING_COURSE_ID, title: "React dự án thực tế", status: "draft" };
const lesson = { id: CODING_LESSON_ID, chapterId: "11111111-1111-4111-8111-111111111101", title: "Bài 3: Hooks cơ bản", position: 2, isPublished: true };

const exercise: LecturerCodingBuilderData["exercise"] = {
  id: 1,
  assessmentId: 1,
  title: "Viết hàm đếm số lần bấm",
  durationMinutes: 20,
  language: "javascript",
  starterCode: "export function createCounter() {\n  // TODO: trả về { value, increment }\n}\n",
  solutionCode: "export function createCounter() {\n  let value = 0;\n  return { get value() { return value; }, increment() { value += 1; return value; } };\n}\n",
  solutionVerifiedAt: null,
  instructions: ["Viết hàm createCounter trả về object có thuộc tính value và phương thức increment.", "increment tăng value thêm 1 và trả về giá trị mới."],
  hints: ["Dùng closure để giữ biến value."],
  tests: [
    { id: 1, name: "Khởi tạo bằng 0", call: "createCounter().value", expected: 0, expectedText: "0", isSample: true, hidden: false },
    { id: 2, name: "Tăng một lần", call: "(() => { const c = createCounter(); c.increment(); return c.value; })()", expected: 1, expectedText: "1", isSample: true, hidden: false },
    { id: 3, name: "Tăng nhiều lần", call: "(() => { const c = createCounter(); c.increment(); c.increment(); return c.increment(); })()", expected: 3, expectedText: "3", isSample: false, hidden: true },
  ],
};

export const lecturerCodingBuilder: LecturerCodingBuilderData = {
  course,
  lesson,
  isLocked: false,
  exercise,
};

export const lecturerCodingSaved: LecturerCodingBuilderData = {
  ...lecturerCodingBuilder,
  exercise: { ...exercise, solutionVerifiedAt: new Date("2026-10-24T03:00:00.000Z") },
};

export const lecturerCodingLocked: LecturerCodingBuilderData = {
  ...lecturerCodingBuilder,
  course: { ...course, status: "pending" },
  isLocked: true,
};

/** A verify run in which the reference solution fails the hidden test (used by the verify action answer). */
export const lecturerCodingVerifyFailed = {
  ok: false,
  total: 3,
  passed: 2,
  phase: "done",
  error: null,
  logs: [],
  outcomes: [
    { id: 1, name: "Khởi tạo bằng 0", call: "createCounter().value", pass: true, expected: "0", actual: "0", error: null, phase: "done", durationMs: 3, hidden: false },
    { id: 2, name: "Tăng một lần", call: "(() => { const c = createCounter(); c.increment(); return c.value; })()", pass: true, expected: "1", actual: "1", error: null, phase: "done", durationMs: 2, hidden: false },
    { id: 3, name: "Tăng nhiều lần", call: "(() => { const c = createCounter(); c.increment(); c.increment(); return c.increment(); })()", pass: false, expected: "3", actual: "2", error: null, phase: "done", durationMs: 2, hidden: true },
  ],
};

export const lecturerCodingPreview: LecturerCodingPreviewData = {
  course: { id: CODING_COURSE_ID, title: "React dự án thực tế" },
  lesson: { id: CODING_LESSON_ID, title: "Bài 3: Hooks cơ bản" },
  exercise: {
    title: exercise.title,
    durationMinutes: exercise.durationMinutes,
    language: exercise.language,
    starterCode: exercise.starterCode,
    solutionCode: exercise.solutionCode,
    instructions: exercise.instructions,
    hints: exercise.hints,
    tests: exercise.tests,
  },
};
