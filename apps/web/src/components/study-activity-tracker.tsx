"use client";
import { useEffect } from "react";
import { STUDY_HEARTBEAT_MS } from "@/lib/learner-overview-contract";

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
      started = false,
      ended = false,
      desired = false;
    const ping = async (active: boolean) => {
      desired = active;
      if (pending || (!active && !started)) return;
      pending = true;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ active }),
          keepalive: true,
        });
        if (response.ok) started = active;
      } catch {
        /* Metrics never interrupt the lesson. No duration is guessed offline. */
      } finally {
        pending = false;
        // A blur/unmount while a start request is in flight must still stop it.
        if (active && started && (!desired || ended)) void ping(false);
      }
    };
    const visible = () =>
      document.visibilityState === "visible" && document.hasFocus();
    const changed = () => {
      if (!ended) void ping(visible());
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
      desired = false;
      void ping(false);
    };
  }, [courseId, lessonId]);
  return null;
}
