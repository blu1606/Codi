"use client";

import { useEffect, useState } from "react";

// A tab preference scoped to the authenticated session, never a permanent enrollment change.
export function useDiagnosticCardDismissal(scope: string, courseId: string) {
  const key = `codi:diagnostic-card:${scope}:${courseId}`;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  useEffect(() => {
    try {
      setDismissedKey(sessionStorage.getItem(key) === "1" ? key : null);
    } catch {
      setDismissedKey(null);
    }
  }, [key]);
  function dismiss() {
    setDismissedKey(key);
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* Keep the current-page preference when storage is unavailable. */
    }
  }
  return { dismissed: dismissedKey === key, dismiss };
}
