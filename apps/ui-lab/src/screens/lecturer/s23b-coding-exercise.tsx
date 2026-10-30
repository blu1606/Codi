import { CodingBuilderClient } from "@/app/dashboard/lecturer/courses/[courseId]/code/[lessonId]/coding-builder-client";
import { CodingExercisePreviewClient } from "@/app/dashboard/lecturer/courses/[courseId]/code/[lessonId]/preview/preview-client";
import {
  CODING_COURSE_ID,
  CODING_LESSON_ID,
  lecturerCodingBuilder,
  lecturerCodingLocked,
  lecturerCodingPreview,
  lecturerCodingSaved,
  lecturerCodingVerifyFailed,
} from "@/demo-fixtures/lecturer/coding-exercise";
import type { Screen } from "../screen-types";

const builderRoute = { pathname: `/dashboard/lecturer/courses/${CODING_COURSE_ID}/code/${CODING_LESSON_ID}` };
const previewRoute = { pathname: `/dashboard/lecturer/courses/${CODING_COURSE_ID}/code/${CODING_LESSON_ID}/preview` };

function builder(initialData: typeof lecturerCodingBuilder) {
  return <CodingBuilderClient courseId={CODING_COURSE_ID} lessonId={CODING_LESSON_ID} initialData={initialData} />;
}

export const lecturerCodingExerciseScreen: Screen = {
  id: "S23b",
  title: "Bài tập coding và xem trước",
  group: "Giảng viên",
  role: "lecturer",
  layout: "lecturer",
  mockupHash: `#/teach/courses/${CODING_COURSE_ID}/code/${CODING_LESSON_ID}`,
  states: {
    editing: { label: "Đang soạn", route: builderRoute, render: () => builder(lecturerCodingBuilder) },
    "verify-failed": {
      label: "Lời giải mẫu không đạt",
      route: builderRoute,
      actions: { verifySolutionCode: { ok: lecturerCodingVerifyFailed } },
      render: () => builder(lecturerCodingBuilder),
    },
    "save-error": {
      label: "Lưu lỗi",
      route: builderRoute,
      actions: { saveCodingExercise: { error: "Không thể lưu bài tập. Vui lòng thử lại." } },
      render: () => builder(lecturerCodingBuilder),
    },
    saved: { label: "Đã lưu", route: builderRoute, render: () => builder(lecturerCodingSaved) },
    locked: { label: "Chờ duyệt (chỉ đọc)", route: builderRoute, render: () => builder(lecturerCodingLocked) },
    preview: {
      label: "Xem trước",
      route: previewRoute,
      render: () => <CodingExercisePreviewClient courseId={CODING_COURSE_ID} lessonId={CODING_LESSON_ID} data={lecturerCodingPreview} />,
    },
    "preview-run-error": {
      label: "Xem trước: chạy lỗi",
      route: previewRoute,
      actions: { runPreviewCode: { error: "Bộ chạy mã đang bận. Vui lòng thử lại sau ít phút." } },
      render: () => <CodingExercisePreviewClient courseId={CODING_COURSE_ID} lessonId={CODING_LESSON_ID} data={lecturerCodingPreview} />,
    },
  },
};
