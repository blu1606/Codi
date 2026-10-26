import { jsonBody } from "./lab-support";
import { LearnerStatsView } from "@/app/insights/stats/learner-stats-view";
import {
  learnerStats,
  learnerStatsDiagnosticSkipped,
  learnerStatsLittleData,
  learnerStatsNoActivity,
} from "@/demo-fixtures/commerce/s13b-learner-stats";
import { http } from "msw";
import type { Screen } from "../screen-types";
import { fixtureHandlers } from "./lab-support";

const route = { pathname: "/insights/stats" };
const stats = (body: unknown) => http.get("/api/insights/stats", () => jsonBody(body));
const page = () => <main className="mx-auto w-full max-w-6xl p-4 sm:p-6"><LearnerStatsView initialPeriod="30" initialCourse="all" /></main>;

export const learnerStatsScreen: Screen = {
  id: "S13b",
  title: "Thống kê học tập",
  group: "Học tập",
  role: "learner",
  mockupHash: "#/insights/stats",
  states: {
    default: { label: "Có dữ liệu", route, handlers: [stats(learnerStats), ...fixtureHandlers], render: page },
    "no-activity": { label: "Chưa có hoạt động", route, handlers: [stats(learnerStatsNoActivity), ...fixtureHandlers], render: page },
    "little-data": { label: "Ít dữ liệu", route, handlers: [stats(learnerStatsLittleData), ...fixtureHandlers], render: page },
    "diagnostic-skipped": { label: "Bỏ qua bài đầu vào", route, handlers: [stats(learnerStatsDiagnosticSkipped), ...fixtureHandlers], render: page },
    error: { label: "Lỗi tải", route, handlers: [http.get("/api/insights/stats", () => jsonBody({ error: "Lỗi" }, { status: 500 }))], render: page },
  },
};
