import { InsightsClient } from "@/app/dashboard/lecturer/insights/insights-client";
import {
  lecturerInsightsNoCourses,
  lecturerInsightsNoPublished,
  lecturerInsightsReady,
} from "@/demo-fixtures/lecturer/insights";
import type { Screen } from "../screen-types";

/** S29b states. Each state renders the same DTO shape the server action returns. */
export const lecturerInsightsScreen: Screen = {
  id: "S29b",
  title: "Doanh thu khoá học",
  group: "Giảng viên",
  role: "lecturer",
  layout: "lecturer",
  mockupHash: "#/teach/insights",
  states: {
    ready: {
      label: "Có doanh thu",
      route: { pathname: "/dashboard/lecturer/insights" },
      render: () => <InsightsClient data={lecturerInsightsReady("30")} period="30" />,
    },
    "no-revenue": {
      label: "Không có doanh thu trong kỳ",
      route: { pathname: "/dashboard/lecturer/insights" },
      render: () => <InsightsClient data={lecturerInsightsReady("30", true)} period="30" />,
    },
    "no-courses": {
      label: "Chưa có khoá học",
      route: { pathname: "/dashboard/lecturer/insights" },
      render: () => <InsightsClient data={lecturerInsightsNoCourses} period="30" />,
    },
    "no-published": {
      label: "Chưa có khoá xuất bản",
      route: { pathname: "/dashboard/lecturer/insights" },
      render: () => <InsightsClient data={lecturerInsightsNoPublished} period="30" />,
    },
  },
};
