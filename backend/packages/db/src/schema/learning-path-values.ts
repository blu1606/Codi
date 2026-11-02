export const PATH_CHANGE_TYPES = [
  "moved-up",
  "now-skippable",
  "unlocked",
] as const;
export type PathChange = {
  lessonId: string;
  type: (typeof PATH_CHANGE_TYPES)[number];
  text: string;
};
