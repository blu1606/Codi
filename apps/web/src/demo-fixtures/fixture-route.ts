/**
 * A read endpoint that can be answered from demo data.
 * Shared by apps/ui-lab (as mock handlers) and the app's demo fallback
 * (NEXT_PUBLIC_DEMO_FALLBACK=1), which uses it only when the real GET fails.
 */
export type FixtureRoute = {
  /** Path under the app origin, e.g. "/api/student/cart" or /^\/api\/courses\/[^/]+$/. */
  path: string | RegExp;
  body: (url: URL) => unknown;
};
