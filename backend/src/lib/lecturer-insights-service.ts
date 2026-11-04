import type { LecturerRevenueData } from "./analytics-contract";

/** S29b state. "no-courses" and "no-published" are real states; "ready" carries revenue for the lecturer's own courses only. */
export type LecturerInsightsDto =
  | { state: "no-courses" }
  | { state: "no-published" }
  | ({ state: "ready" } & LecturerRevenueData);
