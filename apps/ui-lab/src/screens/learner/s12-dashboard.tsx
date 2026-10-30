import { delay, http, HttpResponse } from "msw";
import LearnerWorkspace from "@/components/learner-workspace";
import {
  learnerOverviewDefault,
  learnerOverviewEmpty,
  learnerOverviewSetup,
} from "@/demo-fixtures/learner/s12-dashboard";
import { githubProfileReady } from "@/demo-fixtures/learner/github-profile";
import type { LearnerOverview } from "@/lib/learner-overview-contract";
import type { Screen } from "../screen-types";

const overviewResponse = (body: LearnerOverview) => http.get("/api/learner/overview", () => HttpResponse.json(body));

/** The GitHub card reads the stored profile: a profile means connected, null shows the connect card. */
const githubResponse = (profile: unknown) => http.get("/api/github-profile", () => HttpResponse.json({ profile }));
const githubConnected = githubResponse(githubProfileReady);

const render = () => <LearnerWorkspace />;

export const s12DashboardScreen: Screen = {
  id: "S12",
  title: "Bàn làm việc học viên",
  group: "Học tập",
  role: "learner",
  mockupHash: "#/dashboard",
  states: {
    default: {
      label: "Đang học",
      route: { pathname: "/dashboard" },
      handlers: [overviewResponse(learnerOverviewDefault), githubConnected],
      mockupScenario: { pathAI: "ok" },
      render,
    },
    "github-not-connected": {
      label: "GitHub chưa kết nối",
      route: { pathname: "/dashboard" },
      handlers: [overviewResponse(learnerOverviewDefault), githubResponse(null)],
      render,
    },
    setup: {
      label: "Cần thiết lập lộ trình",
      route: { pathname: "/dashboard" },
      handlers: [overviewResponse(learnerOverviewSetup), githubConnected],
      render,
    },
    empty: {
      label: "Chưa có khoá học",
      route: { pathname: "/dashboard" },
      handlers: [overviewResponse(learnerOverviewEmpty), githubConnected],
      render,
    },
    loading: {
      label: "Đang tải",
      route: { pathname: "/dashboard" },
      handlers: [
        http.get("/api/learner/overview", async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
        githubConnected,
      ],
      render,
    },
    error: {
      label: "Lỗi tải",
      route: { pathname: "/dashboard" },
      handlers: [
        http.get("/api/learner/overview", () => HttpResponse.json({ error: "Không thể tải bàn làm việc." }, { status: 500 })),
        githubConnected,
      ],
      render,
    },
  },
};
