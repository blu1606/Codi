import { CourseEditor } from "@/app/dashboard/lecturer/courses/[courseId]/course-editor";
import { kmapCycleEdges, kmapData, kmapStaleCourse, lecturerEditorData } from "@/demo-fixtures/lecturer/course-editor";
import type { Screen } from "../screen-types";

const route = { pathname: "/dashboard/lecturer/courses/course-react-001/kmap" };

function kmapTab(data: ReturnType<typeof kmapData>) {
  const workerData = { ...data, course: { ...data.course, analysisAvailable: true } };
  return <CourseEditor courseId="course-react-001" activeTab="kmap" data={lecturerEditorData({ kmapData: workerData })} />;
}

export const lecturerKnowledgeMapScreen: Screen = {
  id: "S24",
  title: "Bản đồ kiến thức",
  group: "Giảng viên",
  role: "lecturer",
  layout: "lecturer",
  mockupHash: "#/teach/courses/course-react-001/kmap",
  states: {
    empty: { label: "Trống", route, mockupScenario: { kmap: "ok" }, render: () => kmapTab(kmapData("empty")) },
    analysing: { label: "Đang phân tích", route, mockupScenario: { kmap: "ok" }, render: () => kmapTab(kmapData("analysing")) },
    ready: { label: "Sẵn sàng xem lại", route, mockupScenario: { kmap: "ok" }, render: () => kmapTab(kmapData("ready")) },
    cycle: {
      label: "Có vòng lặp",
      route,
      mockupScenario: { kmap: "cycle" },
      render: () => kmapTab(kmapData("ready", { edges: kmapCycleEdges, cycle: [3, 4, 3] })),
    },
    confirmed: { label: "Đã xác nhận", route, mockupScenario: { kmap: "ok" }, render: () => kmapTab(kmapData("confirmed")) },
    stale: {
      label: "Nội dung đã đổi",
      route,
      mockupScenario: { kmap: "ok" },
      render: () => kmapTab(kmapData("stale", { course: kmapStaleCourse })),
    },
    failed: { label: "Phân tích lỗi", route, mockupScenario: { kmap: "fail" }, render: () => kmapTab(kmapData("failed")) },
  },
};
