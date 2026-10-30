import { delay, http, HttpResponse } from "msw";
import LearnerWorkspace from "@/components/learner-workspace";
import {
  progressOverviewActive,
  progressOverviewDone,
  progressOverviewNoneDone,
} from "@/demo-fixtures/learner/s13-progress";
import type { LearnerOverview } from "@/lib/learner-overview-contract";
import type { Screen, ScreenState } from "../screen-types";

const overview = (body: LearnerOverview) => http.get("/api/learner/overview", () => HttpResponse.json(body));

const tabState = (label: string, tab: "active" | "done", body: LearnerOverview): ScreenState => ({
  label,
  route: { pathname: "/progress", search: { tab } },
  handlers: [overview(body)],
  render: () => <LearnerWorkspace mode="progress" tab={tab} />,
});

export const s13ProgressScreen: Screen = {
  id: "S13",
  title: "Tiến độ & kết quả",
  group: "Học tập",
  role: "learner",
  mockupHash: "#/progress",
  states: {
    active: tabState("Đang học", "active", progressOverviewActive),
    done: tabState("Đã hoàn thành", "done", progressOverviewDone),
    "done-empty": tabState("Chưa có khoá hoàn thành", "done", progressOverviewNoneDone),
    loading: {
      label: "Đang tải",
      route: { pathname: "/progress" },
      handlers: [http.get("/api/learner/overview", async () => { await delay("infinite"); return HttpResponse.json({}); })],
      render: () => <LearnerWorkspace mode="progress" tab="active" />,
    },
    error: {
      label: "Lỗi tải",
      route: { pathname: "/progress" },
      handlers: [http.get("/api/learner/overview", () => HttpResponse.json({ error: "Không thể tải kết quả." }, { status: 500 }))],
      render: () => <LearnerWorkspace mode="progress" tab="active" />,
    },
  },
};
