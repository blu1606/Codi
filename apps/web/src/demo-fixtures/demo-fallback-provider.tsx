"use client";

import { useEffect, useState } from "react";
import { findFixtureRoute } from "./index";
import { DEMO_FALLBACK } from "./demo-mode";

const DEMO_EVENT = "codi:demo-data";

/** Tells the badge that something on screen is demo data. */
export function announceDemoData() {
  window.dispatchEvent(new Event(DEMO_EVENT));
}

/**
 * When NEXT_PUBLIC_DEMO_FALLBACK is on, a failing same-origin GET /api request
 * that has a demo fixture is answered from it. Writes and auth are never faked.
 */
function installFetchFallback() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const eligible = request.method === "GET" && url.origin === location.origin
      && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/");
    const route = eligible ? findFixtureRoute(url) : undefined;
    if (!route) return realFetch(input, init);
    try {
      const response = await realFetch(input, init);
      if (response.ok || response.status === 401 || response.status === 403) return response;
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
    }
    announceDemoData();
    return Response.json(route.body(url), { headers: { "x-codi-demo": "1" } });
  };
  return () => { window.fetch = realFetch; };
}

export function DemoFallbackProvider() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!DEMO_FALLBACK) return;
    const restore = installFetchFallback();
    const onDemo = () => setActive(true);
    window.addEventListener(DEMO_EVENT, onDemo);
    return () => { restore(); window.removeEventListener(DEMO_EVENT, onDemo); };
  }, []);
  return active ? <DemoDataBadge /> : null;
}

/** Owner-only marker: a small dot, with a hover hint, that this screen shows demo data. */
export function DemoDataBadge() {
  return (
    <span
      aria-hidden="true"
      title="Demo data (NEXT_PUBLIC_DEMO_FALLBACK)"
      className="fixed right-2 bottom-2 z-50 size-1.5 rounded-full bg-foreground opacity-60"
    />
  );
}
