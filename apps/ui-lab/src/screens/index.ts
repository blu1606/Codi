import type { Screen } from "./screen-types";
import { commerceScreens } from "./commerce";
import { learnerScreens } from "./learner";
import { lecturerScreens } from "./lecturer";

/** Every screen the lab can render, grouped by workstream folder. */
export const screens: Screen[] = [...commerceScreens, ...learnerScreens, ...lecturerScreens];

export function findScreen(id: string | null) {
  return screens.find((s) => s.id === id) ?? null;
}
