import { CourseActionsClient } from "@/app/dashboard/admin/courses/course-actions-client";
import { adminCourses, adminCoursesEmpty } from "@/demo-fixtures/commerce/s33-admin-courses";
import type { Screen } from "../screen-types";
import { Scripted, clickButton, fixtureHandlers } from "./lab-support";

const route = { pathname: "/dashboard/admin/courses" };

export const adminCoursesScreen: Screen = {
  id: "S33",
  title: "Khoá học đã xuất bản",
  group: "Quản trị",
  role: "admin",
  layout: "admin",
  mockupHash: "#/admin/courses",
  states: {
    default: { label: "Danh sách", route, handlers: fixtureHandlers, render: () => <CourseActionsClient courses={adminCourses} /> },
    empty: { label: "Trống", route, handlers: fixtureHandlers, render: () => <CourseActionsClient courses={adminCoursesEmpty} /> },
    "hide-error": {
      label: "Lỗi khi ẩn khoá",
      route,
      actions: { hideCourseAction: { error: "Không thể ẩn khoá học. Vui lòng thử lại." } },
      handlers: fixtureHandlers,
      render: () => <Scripted script={() => { clickButton("Ẩn khóa học"); window.setTimeout(() => clickButton("Ẩn khoá học"), 400); }}><CourseActionsClient courses={adminCourses} /></Scripted>,
    },
  },
};
