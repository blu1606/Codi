import { CourseProgressClient } from "@/app/dashboard/lecturer/progress/course-progress-client";
import { ProgressCourseMissingView, ProgressCoursesView } from "@/app/dashboard/lecturer/progress/progress-views";
import {
  lecturerCourseProgressDetail,
  lecturerCourseProgressNoLearners,
  lecturerProgressCourses,
  lecturerProgressCoursesEmpty,
} from "@/demo-fixtures/lecturer/progress";
import type { Screen } from "../screen-types";

const listRoute = { pathname: "/dashboard/lecturer/progress" };
const detailRoute = { pathname: "/dashboard/lecturer/progress/course-react-001" };

export const lecturerProgressScreen: Screen = {
  id: "S29",
  title: "Tiến độ học viên",
  group: "Giảng viên",
  role: "lecturer",
  layout: "lecturer",
  mockupHash: "#/teach/progress",
  states: {
    list: { label: "Danh sách khoá", route: listRoute, render: () => <ProgressCoursesView courses={lecturerProgressCourses} /> },
    "list-empty": { label: "Chưa có khoá đang bán", route: listRoute, render: () => <ProgressCoursesView courses={lecturerProgressCoursesEmpty} /> },
    detail: { label: "Chi tiết khoá", route: detailRoute, render: () => <CourseProgressClient data={lecturerCourseProgressDetail} /> },
    "detail-no-learners": {
      label: "Khoá chưa có học viên",
      route: { pathname: "/dashboard/lecturer/progress/course-jest-001" },
      render: () => <CourseProgressClient data={lecturerCourseProgressNoLearners} />,
    },
    missing: {
      label: "Khoá không tồn tại",
      route: { pathname: "/dashboard/lecturer/progress/course-unknown" },
      render: () => <ProgressCourseMissingView />,
    },
  },
};
