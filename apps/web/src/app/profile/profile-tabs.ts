export const PROFILE_TABS = [
  { id: "overview", label: "Tổng quan", learnerOnly: false },
  { id: "courses", label: "Khóa học", learnerOnly: false },
  { id: "transactions", label: "Giao dịch", learnerOnly: false },
  { id: "nang-luc", label: "Hồ sơ năng lực", learnerOnly: true },
] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number]["id"];

/** Unknown or unauthorised tab values fall back to the overview. */
export function resolveProfileTab(value: unknown, isLearner: boolean): ProfileTab {
  if (value === "nang-luc") return isLearner ? "nang-luc" : "overview";
  if (value === "courses" || value === "transactions") return value;
  return "overview";
}

export function profileTabHref(id: ProfileTab) {
  return id === "overview" ? "/profile" : `/profile?tab=${id}`;
}
