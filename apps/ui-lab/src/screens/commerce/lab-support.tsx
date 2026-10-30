import { useEffect, type ReactNode } from "react";
import { http, HttpResponse } from "msw";
import { commerceRoutes } from "@/demo-fixtures/commerce/routes";

/** Every commerce GET fixture as an MSW handler, so states only add overrides. */
export const fixtureHandlers = commerceRoutes.map((route) =>
  http.get(route.path, ({ request }) => jsonBody(route.body(new URL(request.url)))),
);

/** Type into a field the way a user does, so React's onChange runs. */
export function typeInto(selector: string, value: string) {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!el) throw new Error(`[lab] missing field ${selector}`);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Click the first button or menu item whose visible text equals `label`. */
export function clickButton(label: string) {
  const el = [...document.querySelectorAll<HTMLElement>("button, [role=menuitem], [role=option]")]
    .find((b) => b.textContent?.trim() === label);
  if (!el) throw new Error(`[lab] missing button "${label}"`);
  el.click();
}

/** Runs a user-like script once the screen mounted, to reach states that need input. */
export function Scripted({ script, children }: { script: () => void; children: ReactNode }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { script(); } catch (error) { console.error(error); }
    }, 700);
    return () => window.clearTimeout(timer);
  }, []);
  return <>{children}</>;
}

/** Wrap a props object in a resolved promise, the shape Next passes to page components. */
export function asSearchParams<T extends object>(params: T): Promise<T> {
  return Promise.resolve(params);
}

/** Set query params on the frame URL before the page mounts (pages that read window.location). */
export function seedQuery(query: Record<string, string>) {
  return () => {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    history.replaceState(null, "", url);
  };
}

/** Submit the first form on the page, the way pressing its submit button does. */
export function submitForm() {
  const button = document.querySelector<HTMLButtonElement>('form button[type="submit"]');
  if (!button) throw new Error("[lab] missing submit button");
  button.click();
}

/** Click the table row that contains `text` (row click opens a detail drawer). */
export function clickRowContaining(text: string) {
  const cell = [...document.querySelectorAll<HTMLElement>("td")].find((td) => td.textContent?.includes(text));
  if (!cell) throw new Error(`[lab] missing row "${text}"`);
  cell.closest("tr")!.click();
}

/** JSON response for fixture bodies, which are typed unknown at the route boundary. */
export function jsonBody(body: unknown, init?: ResponseInit) {
  return HttpResponse.json(body as Record<string, unknown>, init);
}
