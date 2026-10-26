import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { screens } from "./screens";
import type { MockupCodi, Screen, ScreenState } from "./screens/screen-types";
import { MOCKUP_USER_ID } from "./shell/session-handlers";
import "./styles.css";

/**
 * Sign the mockup in as the screen's role, force its scenario like the Alt+K drawer
 * does, and run the state's seed so both sides show the same situation.
 */
function syncMockup(frame: HTMLIFrameElement, screen: Screen, state: ScreenState | undefined) {
  const win = frame.contentWindow as (Window & { Codi?: MockupCodi }) | null;
  const codi = win?.Codi;
  if (!codi) return;
  codi.state.currentUserId = MOCKUP_USER_ID[state?.role ?? screen.role];
  Object.assign(codi.state.scenario, state?.mockupScenario ?? {});
  const path = (state?.mockupSetup ?? screen.mockupSetup)?.(codi) || screen.mockupHash;
  try { win.localStorage.setItem("codi-proto-v8", JSON.stringify(codi.state)); } catch { /* preview only */ }
  codi.go(path.replace(/^#/, ""));
}

const WIDTHS = { "375": "375px", "768": "768px", "1280": "1280px", full: "100%" } as const;
type Width = keyof typeof WIDTHS;

function readQuery() {
  const q = new URLSearchParams(location.search);
  return {
    screen: q.get("screen") ?? screens[0]?.id ?? "",
    state: q.get("state") ?? "",
    theme: q.get("theme") === "dark" ? "dark" : "light",
    width: (q.get("w") ?? "full") as Width,
    mockup: q.get("mockup") !== "0",
  };
}

function Lab() {
  const [view, setView] = useState(readQuery);
  const activeState = (s: Screen) => (view.state in s.states ? view.state : Object.keys(s.states)[0] ?? "");
  const screen = screens.find((s) => s.id === view.screen) ?? screens[0];

  useEffect(() => {
    const q = new URLSearchParams({
      screen: view.screen, state: view.state, theme: view.theme, w: view.width, mockup: view.mockup ? "1" : "0",
    });
    history.replaceState(null, "", `?${q}`);
  }, [view]);

  const frameSrc = `/frame.html?${new URLSearchParams({ screen: view.screen, state: view.state, theme: view.theme })}`;
  const groups = [...new Set(screens.map((s) => s.group))];

  return (
    <div className="flex h-screen bg-background text-foreground">
      <nav className="w-60 shrink-0 overflow-y-auto border-r border-border p-3 text-sm">
        <p className="mb-3 font-semibold">Codi UI lab</p>
        {groups.map((group) => (
          <div key={group} className="mb-4">
            <p className="mb-1 text-xs text-muted-foreground">{group}</p>
            {screens.filter((s) => s.group === group).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setView((v) => ({ ...v, screen: s.id, state: Object.keys(s.states)[0] ?? "" }))}
                className={`block w-full rounded-md px-2 py-1 text-left hover:bg-muted ${s.id === screen?.id ? "bg-muted font-medium" : ""}`}
              >
                {s.id} · {s.title}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-2 text-xs">
          {screen && Object.entries(screen.states).map(([key, st]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView((v) => ({ ...v, state: key }))}
              className={`rounded-full border border-border px-2.5 py-1 ${screen && key === activeState(screen) ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {st.label}
            </button>
          ))}
          <span className="ml-auto" />
          <select
            value={view.width}
            onChange={(e) => setView((v) => ({ ...v, width: e.target.value as Width }))}
            className="rounded-md border border-border bg-background px-2 py-1"
          >
            {Object.keys(WIDTHS).map((w) => <option key={w} value={w}>{w === "full" ? "Toàn bộ" : `${w}px`}</option>)}
          </select>
          <button type="button" className="rounded-md border border-border px-2 py-1 hover:bg-muted"
            onClick={() => setView((v) => ({ ...v, theme: v.theme === "dark" ? "light" : "dark" }))}>
            {view.theme === "dark" ? "Tối" : "Sáng"}
          </button>
          <button type="button" className="rounded-md border border-border px-2 py-1 hover:bg-muted"
            onClick={() => setView((v) => ({ ...v, mockup: !v.mockup }))}>
            {view.mockup ? "Ẩn mockup" : "Hiện mockup"}
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 justify-center overflow-auto bg-muted/40">
            <iframe key={frameSrc} title="Bản code" src={frameSrc}
              style={{ width: WIDTHS[view.width] }} className="h-full border-x border-border bg-background" />
          </div>
          {view.mockup && screen && (
            <iframe key={`${screen.id}:${view.state}`} title="Mockup" src={`/mockup/index.html${screen.mockupHash}`}
              onLoad={(e) => syncMockup(e.currentTarget, screen, screen.states[activeState(screen)])}
              style={{ width: view.width === "full" ? "50%" : WIDTHS[view.width] }}
              className="h-full shrink-0 border-l border-border bg-background" />
          )}
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Lab /></StrictMode>);
