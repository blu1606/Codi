import { GradingQueueClient } from "@/app/dashboard/lecturer/grading/grading-queue-client";
import {
  lecturerFeedbackSnippets,
  lecturerGradingDetail,
  lecturerGradingEditGraded,
  lecturerGradingEmptyGraded,
  lecturerGradingEmptyPending,
  lecturerGradingGradedTab,
  lecturerGradingLastPending,
  lecturerGradingQueue,
} from "@/demo-fixtures/lecturer/grading";
import type { Screen } from "../screen-types";

const queueRoute = { pathname: "/dashboard/lecturer/grading" };
const detailRoute = { pathname: "/dashboard/lecturer/grading/101" };
const gradeError = { gradeSubmission: { error: "Không thể lưu điểm. Vui lòng thử lại." } };

export const lecturerGradingScreen: Screen = {
  id: "S26",
  title: "Chấm bài",
  group: "Giảng viên",
  role: "lecturer",
  layout: "lecturer",
  mockupHash: "#/teach/grading",
  states: {
    queue: {
      label: "Hàng đợi chờ chấm",
      route: queueRoute,
      render: () => <GradingQueueClient data={lecturerGradingQueue} snippets={lecturerFeedbackSnippets} />,
    },
    "queue-empty": {
      label: "Không có bài chờ chấm",
      route: queueRoute,
      render: () => <GradingQueueClient data={lecturerGradingEmptyPending} snippets={lecturerFeedbackSnippets} />,
    },
    "graded-empty": {
      label: "Chưa có bài đã chấm",
      route: { pathname: "/dashboard/lecturer/grading", search: { status: "graded" } },
      render: () => <GradingQueueClient data={lecturerGradingEmptyGraded} snippets={lecturerFeedbackSnippets} />,
    },
    graded: {
      label: "Tab đã chấm",
      route: { pathname: "/dashboard/lecturer/grading", search: { status: "graded" } },
      render: () => <GradingQueueClient data={lecturerGradingGradedTab} snippets={lecturerFeedbackSnippets} />,
    },
    detail: {
      label: "Chấm chi tiết",
      route: detailRoute,
      render: () => <GradingQueueClient data={lecturerGradingDetail} snippets={lecturerFeedbackSnippets} />,
    },
    "detail-save-error": {
      label: "Chấm: lưu lỗi",
      route: detailRoute,
      actions: gradeError,
      render: () => <GradingQueueClient data={lecturerGradingDetail} snippets={lecturerFeedbackSnippets} />,
    },
    "detail-last": {
      label: "Bài cuối cùng",
      route: { pathname: "/dashboard/lecturer/grading/103" },
      render: () => <GradingQueueClient data={lecturerGradingLastPending} snippets={lecturerFeedbackSnippets} />,
    },
    "edit-graded": {
      label: "Sửa điểm đã chấm",
      route: { pathname: "/dashboard/lecturer/grading/90", search: { status: "graded" } },
      actions: { gradeSubmission: { ok: { success: true } } },
      render: () => <GradingQueueClient data={lecturerGradingEditGraded} snippets={lecturerFeedbackSnippets} />,
    },
  },
};
