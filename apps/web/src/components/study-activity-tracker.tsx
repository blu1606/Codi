"use client";
import { useEffect } from "react";
import {
  STUDY_HEARTBEAT_MS,
  type StudyActivityAction,
} from "@/lib/learner-overview-contract";

export default function StudyActivityTracker({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  useEffect(() => {
    const endpoint = `/api/learn/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/activity`;
    let pending = false,
      ended = false;
    let started: string | null = null,
      desired: string | null = null;
    const ping = async () => {
      const trackerId = desired ?? started;
      if (pending || !trackerId) return;
      const action: StudyActivityAction = !desired
        ? "stop"
        : started === desired
          ? "heartbeat"
          : "start";
      pending = true;
      let succeeded = false;
      try {
        let expectedOwner: string | null | undefined;
        if (action === "start") {
          const preparation = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "prepare", trackerId }),
            keepalive: true,
          });
          if (!preparation.ok) return;
          const { owner } = await preparation.json();
          if (owner !== null && typeof owner !== "string") return;
          expectedOwner = owner;
          // A delayed preparation must never authorize a focus session that ended
          // while it was in flight. Reconcile a newer desired session in finally.
          if (desired !== trackerId) {
            succeeded = true;
            return;
          }
        }
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            trackerId,
            ...(action === "start" ? { expectedOwner } : {}),
          }),
          keepalive: true,
        });
        if (response.ok) {
          const { recorded } = await response.json();
          // Retry a rejected acquisition on the next tick while still focused.
          // If focus ended, reconcile its queued stop (which the server can ignore).
          if (action === "start" && !recorded && desired === trackerId) return;
          // An ignored renewal still belongs to this session: never turn its next
          // timer tick into an acquisition that steals ownership back.
          started = action === "stop" ? null : trackerId;
          succeeded = true;
        }
      } catch {
        /* Metrics never interrupt the lesson. No duration is guessed offline. */
      } finally {
        pending = false;
        // Reconcile either focus transition after a successful pending request.
        // Failed requests wait for the next event/tick instead of retrying forever.
        if (succeeded && started !== desired) void ping();
      }
    };
    const visible = () =>
      document.visibilityState === "visible" && document.hasFocus();
    const changed = () => {
      if (ended) return;
      // Each focus acquisition has its own identity, even if a prior request is
      // still pending. Repeated focus/visibility events only renew that session.
      desired = visible() ? (desired ?? crypto.randomUUID()) : null;
      void ping();
    };
    changed();
    const timer = setInterval(changed, STUDY_HEARTBEAT_MS);
    document.addEventListener("visibilitychange", changed);
    window.addEventListener("focus", changed);
    window.addEventListener("blur", changed);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", changed);
      window.removeEventListener("focus", changed);
      window.removeEventListener("blur", changed);
      ended = true;
      desired = null;
      void ping();
    };
  }, [courseId, lessonId]);
  return null;
}
