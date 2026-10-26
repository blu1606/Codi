import { CourseEditor } from "@/app/dashboard/lecturer/courses/[courseId]/course-editor";
import { lecturerEditorData } from "@/demo-fixtures/lecturer/course-editor";
import type { Screen } from "../screen-types";

const route = (tab: string) => ({ pathname: `/dashboard/lecturer/courses/course-react-001/${tab}` });

export const lecturerCourseEditorScreen: Screen = {
  id: "S22",
  title: "Soạn khoá học: nội dung và thông tin",
  group: "Giảng viên",
  role: "lecturer",
  layout: "lecturer",
  mockupHash: "#/teach/courses/course-react-001/content",
  states: {
    content: {
      label: "Nội dung: đang soạn",
      route: route("content"),
      render: () => <CourseEditor courseId="course-react-001" activeTab="content" data={lecturerEditorData()} />,
    },
    "content-empty": {
      label: "Nội dung: khoá trống",
      route: route("content"),
      render: () => <CourseEditor courseId="course-react-001" activeTab="content" data={lecturerEditorData({ chapters: [] })} />,
    },
    "content-locked": {
      label: "Nội dung: chờ duyệt (chỉ đọc)",
      route: route("content"),
      render: () => {
        const base = lecturerEditorData();
        return <CourseEditor courseId="course-react-001" activeTab="content" data={lecturerEditorData({ isLocked: true, course: { ...base.course, status: "pending" } })} />;
      },
    },
    "content-published": {
      label: "Nội dung: đã xuất bản",
      route: route("content"),
      render: () => {
        const base = lecturerEditorData();
        return <CourseEditor courseId="course-react-001" activeTab="content" data={lecturerEditorData({ course: { ...base.course, status: "published" } })} />;
      },
    },
    info: {
      label: "Thông tin",
      route: route("info"),
      render: () => <CourseEditor courseId="course-react-001" activeTab="info" data={lecturerEditorData()} />,
    },
  },
};
