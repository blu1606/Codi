import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";
import { findFixtureRoute } from "@/demo-fixtures";
import { labWriteHandlers } from "./shell/write-handlers";
import { Toaster } from "@codi-1/ui/components/sonner";
import { findScreen } from "./screens";
import { AppChrome } from "./shell/app-chrome";
import { sessionHandlers } from "./shell/session-handlers";
import { lab } from "./shims/lab-runtime";
import "./styles.css";

const query = new URLSearchParams(location.search);
const screen = findScreen(query.get("screen"));
const state = screen ? (screen.states[query.get("state") ?? ""] ?? Object.values(screen.states)[0] ?? null) : null;
const theme = query.get("theme") === "dark" ? "dark" : "light";

async function main() {
  const root = createRoot(document.getElementById("root")!);
  // ?list=1 dumps every screen/state key, for scripts that walk the whole lab.
  if (query.get("list")) {
    const { screens } = await import("./screens");
    const list = screens.map((s) => ({ id: s.id, states: Object.keys(s.states) }));
    root.render(<pre id="lab-list">{JSON.stringify(list)}</pre>);
    return;
  }
  if (!screen || !state) {
    root.render(<p className="p-6 text-sm text-muted-foreground">Chọn một màn hình ở thanh bên trái.</p>);
    return;
  }

  lab.route = state.route ?? { pathname: "/" };
  lab.actions = state.actions ?? {};
  // MSW answers with the first matching handler: state overrides, then session
  // defaults, then the happy-path demo fixtures the app's demo fallback also uses.
  // Matched by pathname through the same lookup the app's demo fallback uses
  // (MSW would test a RegExp against the full URL, so anchored paths never hit).
  const fixtures = [http.get("/api/*", ({ request }) => {
    const url = new URL(request.url);
    const route = findFixtureRoute(url);
    return route ? HttpResponse.json(route.body(url) as never) : undefined;
  })];
  // Anything else under /api answers like a real missing route. Without it Vite's SPA
  // fallback returns index.html with 200 and screens crash parsing it as JSON.
  const unmocked = http.all("/api/*", ({ request }) => {
    console.warn(`[lab] chưa mock ${request.method} ${new URL(request.url).pathname}`);
    return HttpResponse.json({ error: "Chưa có dữ liệu mẫu cho API này (ui-lab)." }, { status: 404 });
  });
  await setupWorker(...(state.handlers ?? []), ...sessionHandlers(state.role ?? screen.role), ...fixtures, ...labWriteHandlers, unmocked)
    .start({ onUnhandledRequest: "warn", quiet: true });

  // next-themes injects an inline <script> that React 19 rejects on client-only
  // render, so the lab sets the theme class itself.
  document.documentElement.classList.toggle("dark", theme === "dark");
  root.render(
    <StrictMode>
      <AppChrome layout={screen.layout ?? "app"}>{state.render()}</AppChrome>
      <Toaster richColors />
    </StrictMode>,
  );
}

void main();
