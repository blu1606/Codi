import type { FixtureRoute } from "./fixture-route";
import { commerceRoutes } from "./commerce/routes";
import { learnerRoutes } from "./learner/routes";
import { lecturerRoutes } from "./lecturer/routes";

export type { FixtureRoute } from "./fixture-route";

export const fixtureRoutes: FixtureRoute[] = [...commerceRoutes, ...learnerRoutes, ...lecturerRoutes];

export function findFixtureRoute(url: URL) {
  return fixtureRoutes.find((r) => (typeof r.path === "string" ? r.path === url.pathname : r.path.test(url.pathname)));
}
