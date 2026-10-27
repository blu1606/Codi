import type { LecturerCounts } from "@/app/dashboard/lecturer/actions";
import { LecturerDashboardView } from "@/app/dashboard/lecturer/lecturer-dashboard-view";
import type { Screen } from "../screen-types";
import { lecturerCounts as counts, lecturerCourses as courses, lecturerRejectedCourseAlert as rejectedCourseAlert } from "@/demo-fixtures/lecturer/courses";

const emptyCounts: LecturerCounts = { grading: 0, questions: 0, reviews: 0, byStatus: { draft: 0, pending: 0, rejected: 0, published: 0, hidden: 0 } };

export const lecturerHomeScreen: Screen = {
  id: "S20",
  title: "Tổng quan giảng viên",
  group: "Giảng viên",
  role: "lecturer",
  layout: "lecturer",
  mockupHash: "#/teach",
  states: {
    default: {
      label: "Có khoá học",
      route: { pathname: "/dashboard/lecturer" },
      render: () => <LecturerDashboardView userName="Trần Minh Khoa" counts={counts} rejectedCourseAlert={rejectedCourseAlert} courses={courses} />,
    },
    empty: {
      label: "Giảng viên mới",
      route: { pathname: "/dashboard/lecturer" },
      render: () => (
        <LecturerDashboardView
          userName="Trần Minh Khoa"
          counts={emptyCounts}
          rejectedCourseAlert={null}
          courses={[]}
        />
      ),
    },
  },
};
