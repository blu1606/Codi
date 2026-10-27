import { CourseCreateForm } from "@/app/dashboard/lecturer/new/course-create-form";
import { CoursesListView } from "@/app/dashboard/lecturer/courses/courses-list-view";
import type { Screen } from "../screen-types";
import { lecturerCounts as counts, lecturerCourses as courses } from "@/demo-fixtures/lecturer/courses";

const rejected = courses.filter((c) => c.status === "rejected");

export const lecturerCoursesScreen: Screen = {
  id: "S21",
  title: "Khoá học và tạo khoá học",
  group: "Giảng viên",
  role: "lecturer",
  layout: "lecturer",
  mockupHash: "#/teach/courses",
  states: {
    list: {
      label: "Danh sách",
      route: { pathname: "/dashboard/lecturer/courses" },
      render: () => <CoursesListView counts={counts} currentStatus="all" courses={courses} />,
    },
    "list-empty": {
      label: "Chưa có khoá học",
      route: { pathname: "/dashboard/lecturer/courses" },
      render: () => (
        <CoursesListView
          counts={{ ...counts, byStatus: { draft: 0, pending: 0, rejected: 0, published: 0, hidden: 0 } }}
          currentStatus="all"
          courses={[]}
        />
      ),
    },
    "list-filtered-empty": {
      label: "Lọc: không có khoá",
      route: { pathname: "/dashboard/lecturer/courses", search: { status: "hidden" } },
      render: () => <CoursesListView counts={counts} currentStatus="hidden" courses={[]} />,
    },
    "list-filtered": {
      label: "Lọc: bị từ chối",
      route: { pathname: "/dashboard/lecturer/courses", search: { status: "rejected" } },
      render: () => <CoursesListView counts={counts} currentStatus="rejected" courses={rejected} />,
    },
    "new-form": {
      label: "Tạo khoá: form trống",
      route: { pathname: "/dashboard/lecturer/new" },
      render: () => <CourseCreateForm />,
    },
    "new-field-error": {
      label: "Tạo khoá: lỗi trường",
      route: { pathname: "/dashboard/lecturer/new" },
      actions: {
        createCourseDraft: { ok: { success: false, errors: { title: "Tiêu đề này đã có trong khoá học của bạn.", category: "Vui lòng chọn danh mục." } } },
      },
      render: () => <CourseCreateForm />,
    },
    "new-server-error": {
      label: "Tạo khoá: lỗi máy chủ",
      route: { pathname: "/dashboard/lecturer/new" },
      actions: { createCourseDraft: { error: "Không thể tạo khoá học lúc này. Vui lòng thử lại." } },
      render: () => <CourseCreateForm />,
    },
  },
};
