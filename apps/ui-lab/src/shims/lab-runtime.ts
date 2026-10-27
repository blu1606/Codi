import { toast } from "sonner";

/** Per-frame context set by the active screen state before rendering. */
export type LabRoute = {
  pathname: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
};

/** How a stubbed server action answers: a value, or a thrown error message. */
export type ActionResult = { ok: unknown } | { error: string };

type Runtime = {
  route: LabRoute;
  actions: Record<string, ActionResult | ((args: unknown[]) => ActionResult)>;
  actionDelayMs: number;
};

export const lab: Runtime = { route: { pathname: "/" }, actions: {}, actionDelayMs: 600 };

/** Surface navigation the screen tried to do instead of leaving the frame. */
export function reportNavigation(kind: string, href?: string) {
  toast.message(`[lab] ${kind}${href ? ` → ${href}` : ""}`);
}
