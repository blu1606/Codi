// Persisted onboarding choices from STATE-MACHINES.md §7, shared by schema and UI.
export const ONBOARDING_GOALS = ["project", "finish", "interview"] as const;
export const ONBOARDING_LEVELS = ["new", "basic", "solid"] as const;
export const WEEKLY_HOURS = [2, 5, 10] as const;
export type GoalDraft = {
  goal?: (typeof ONBOARDING_GOALS)[number];
  level?: (typeof ONBOARDING_LEVELS)[number];
  hours?: (typeof WEEKLY_HOURS)[number];
};
