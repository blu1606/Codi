import { CourseEditor } from "@/app/dashboard/lecturer/courses/[courseId]/course-editor";
import {
  blockedReadiness,
  lecturerEditorData,
  lecturerPublishStates,
  publicationData,
  readyReadiness,
} from "@/demo-fixtures/lecturer/course-editor";
import type { Screen } from "../screen-types";

const route = { pathname: "/dashboard/lecturer/courses/course-react-001/publish" };

function publishTab(data: ReturnType<typeof publicationData>) {
  const base = lecturerEditorData();
  const course = { ...base.course, status: data.course.status };
  return <CourseEditor courseId="course-react-001" activeTab="publish" data={lecturerEditorData({ course, publicationData: data, isLocked: data.isLocked })} />;
}

export const lecturerPublishScreen: Screen = {
  id: "S25",
  title: "Xuất bản khoá học",
  group: "Giảng viên",
  role: "lecturer",
  layout: "lecturer",
  mockupHash: "#/teach/courses/course-react-001/publish",
  states: {
    draft: { label: "Bản nháp: chưa đủ điều kiện", route, render: () => publishTab(publicationData("draft", { readiness: blockedReadiness })) },
    "draft-ready": { label: "Bản nháp: đủ điều kiện gửi", route, render: () => publishTab(publicationData("draft", { readiness: readyReadiness })) },
    pending: { label: "Chờ duyệt", route, render: () => publishTab(lecturerPublishStates.pending) },
    rejected: { label: "Bị từ chối", route, render: () => publishTab(lecturerPublishStates.rejected) },
    "changes-requested": { label: "Yêu cầu sửa", route, render: () => publishTab(lecturerPublishStates.changesRequested) },
    published: { label: "Đã xuất bản", route, render: () => publishTab(lecturerPublishStates.published) },
    hidden: { label: "Đã ẩn", route, render: () => publishTab(lecturerPublishStates.hidden) },
  },
};
