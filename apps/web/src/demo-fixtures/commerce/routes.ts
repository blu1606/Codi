import type { FixtureRoute } from "../fixture-route";
import { catalogResponse } from "./s01-catalog";
import { courseDetail } from "./s02-course-detail";
import { advisorInitWithIntake } from "./s17-ai-advisor";
import { adminInsightsFixture } from "./s36-admin-insights";
import { adminFinanceFixture } from "./s37-admin-finance";
import { learnerStats } from "./s13b-learner-stats";
import { inboxUnread } from "./s40-notifications";
import { studentProfile, studentProfileActivities } from "./s04b-profile";

const fixturePeriod = (url: URL) => {
  const period = url.searchParams.get("period");
  return period === "7" || period === "90" ? period : "30";
};

/** GET endpoints of this area answered from demo data. */
export const commerceRoutes: FixtureRoute[] = [
  { path: "/api/courses", body: () => catalogResponse() },
  {
    path: /\/api\/courses\/[^/]+$/,
    body: (url) => courseDetail(decodeURIComponent(url.pathname.split("/").pop() ?? "")),
  },
  { path: "/api/ai", body: () => advisorInitWithIntake() },
  { path: "/api/admin/insights/overview", body: (url) => adminInsightsFixture(fixturePeriod(url)) },
  { path: "/api/admin/finance/overview", body: (url) => adminFinanceFixture(fixturePeriod(url)) },
  { path: "/api/insights/stats", body: () => learnerStats },
  { path: "/api/notifications", body: () => inboxUnread },
  {
    path: "/api/student/profile",
    body: (url) => {
      const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
      return url.searchParams.get("scope") === "activities" ? studentProfileActivities(year) : studentProfile(year);
    },
  },
];

