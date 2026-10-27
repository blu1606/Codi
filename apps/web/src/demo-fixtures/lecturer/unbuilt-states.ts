import type { QuizQuestionInput } from "@/app/dashboard/lecturer/courses/[courseId]/actions";
import type { CodingTestCaseInput } from "@/app/dashboard/lecturer/courses/[courseId]/code/actions";

/**
 * Data for PRODUCT §6 states that the current components cannot render (no backend
 * service, action or prop yet). Kept ready so a later change can wire them without new data.
 * Nothing here is rendered by the lab; see the reply of the lab task for the skip list.
 */

/** S21: AI course draft. The action exists (saveAiCourseDraft) but no UI calls it. TODO(contract): type the draft. */
export const lecturerAiCourseDraft = {
  status: "ready" as "generating" | "ready" | "failed",
  title: "Lập trình Python cho người mới",
  summary: "Khoá học nhập môn Python: biến, hàm, danh sách và xử lý tệp.",
  category: "Backend",
  level: "Beginner",
  // TODO(contract): outline shape is not defined by any DTO yet.
  outline: [
    { chapter: "Chương 1: Làm quen với Python", lessons: ["Cài đặt môi trường", "Biến và kiểu dữ liệu"] },
  ],
};

/** S22: lesson material upload progress and failure. Component has URL-only materials. TODO(contract): upload action + storage. */
export const lecturerLessonUploadStates = {
  uploading: { fileName: "bai-2-slide.pdf", fileSizeKb: 4820, percent: 20 },
  error: { fileName: "bai-2-video.mp4", fileSizeKb: 212000, reason: "Tệp vượt quá 200MB. Vui lòng nén hoặc tách video." },
};

/** S23: AI quiz suggestions with the reviewed flag. Real question type; the AI panel is not built. */
export const lecturerQuizAiSuggestions: QuizQuestionInput[] = [
  {
    aiGenerated: true,
    aiReviewed: false,
    text: "Hook nào dùng để chạy side effect sau khi render?",
    explanation: "useEffect chạy sau render và có thể huỷ bằng hàm cleanup.",
    correctIndex: 1,
    options: ["useState", "useEffect", "useMemo"],
  },
  {
    aiGenerated: true,
    aiReviewed: true,
    text: "Props có thể bị thay đổi trực tiếp trong component con không?",
    explanation: "Props là bất biến trong component con.",
    correctIndex: 1,
    options: ["Có", "Không"],
  },
];

/** S23: AI panel status machine (limit / loading / error / done). TODO(contract): status enum is not typed in the component. */
export const lecturerQuizAiPanelStates = ["limit", "loading", "error", "done"] as const;

/** S23b: AI test suggestions, real test-case type. Generation is heuristic and not wired to a visible panel yet. */
export const lecturerCodingAiTestSuggestions: CodingTestCaseInput[] = [
  { name: "Gọi nhiều lần", call: "(() => { const c = createCounter(); c.increment(); return c.increment(); })()", expected: 2, expectedText: "2", isSample: false, hidden: true },
];

/** S26: AI grading draft. The action always fails today (getAiGradingDraft). TODO(contract): draft DTO is not defined. */
export const lecturerGradingAiDraft = {
  status: "ready" as "loading" | "ready" | "failed" | "stale",
  suggestedScore: 7.5,
  maxScore: 10,
  feedback: "Logic xác thực đúng. Nên bổ sung kiểm tra token hết hạn.",
  error: "AI chấm bài chưa khả dụng",
};
