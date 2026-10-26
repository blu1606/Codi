"use client";

import { useCallback, useEffect, useState } from "react";

export type AnalyticsQuery<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: T };

/** Loads one analytics payload per URL, ignoring responses for superseded URLs. `retry` refetches the same URL. */
export function useAnalyticsQuery<T>(url: string): { query: AnalyticsQuery<T>; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; query: AnalyticsQuery<T> }>();
  const key = `${url}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    void (async () => {
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Analytics request failed");
        const data = (await response.json()) as T;
        if (current) setResult({ key, query: { status: "ready", data } });
      } catch {
        if (current && !controller.signal.aborted) setResult({ key, query: { status: "error" } });
      }
    })();
    return () => {
      current = false;
      controller.abort();
    };
  }, [url, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const query: AnalyticsQuery<T> = result?.key === key ? result.query : { status: "loading" };
  return { query, retry };
}
