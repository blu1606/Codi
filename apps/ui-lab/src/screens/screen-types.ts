import type { ReactNode } from "react";
import type { HttpHandler } from "msw";
import type { ActionResult, LabRoute } from "../shims/lab-runtime";

export type LabRole = "guest" | "learner" | "lecturer" | "admin";

/** Which real layout wraps the screen: root header, lecturer or admin workspace sidebar, or none (e.g. /settings). */
export type LabLayout = "app" | "lecturer" | "admin" | "bare";

/** One forced state of a screen, as listed in PRODUCT.md §6. */
export type ScreenState = {
  label: string;
  route?: LabRoute;
  /** Mocked /api responses for screens that fetch from the browser. */
  handlers?: HttpHandler[];
  /** Stubbed server-action answers, keyed by the exported action name. */
  actions?: Record<string, ActionResult | ((args: unknown[]) => ActionResult)>;
  /** Overrides the screen role, e.g. a guest view of a learner page. */
  role?: LabRole;
  /** Mockup scenario flags to force in the side-by-side view (Codi.state.scenario). */
  mockupScenario?: Record<string, string>;
  /** Overrides the screen-level mockupSetup for this state. */
  mockupSetup?: MockupSetup;
  render: () => ReactNode;
};

/** The mockup runtime (`window.Codi` in docs/mockup) as the lab uses it. */
export type MockupCodi = {
  state: { currentUserId: string | null; scenario: Record<string, string>; carts: Record<string, string[]>; db: Record<string, any[]> };
  go: (path: string) => void;
};

/**
 * Seeds the mockup so it shows the same situation as the code side
 * (cart items, a pending order…). May return a hash path that replaces mockupHash.
 */
export type MockupSetup = (codi: MockupCodi) => string | void;

export type Screen = {
  /** Screen id from PRODUCT.md §6, e.g. "S05". */
  id: string;
  title: string;
  group: "Khách & học viên" | "Học tập" | "Giảng viên" | "Quản trị";
  role: LabRole;
  layout?: LabLayout;
  /** Hash route in docs/mockup/index.html for the side-by-side view, e.g. "#/cart". */
  mockupHash: string;
  mockupSetup?: MockupSetup;
  states: Record<string, ScreenState>;
};
