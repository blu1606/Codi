/**
 * Study time (port of real components/study-activity-tracker.tsx). While a lesson tab is visible and focused, the
 * page holds a focus session on the server (POST .../lessons/:lessonId/activity: prepare → start → heartbeat every
 * 30 s → stop). The server credits the elapsed seconds to the learner's Vietnam calendar day and never credits a gap
 * longer than 45 s; metrics never interrupt the lesson, and no duration is guessed offline.
 */
import { useEffect } from 'react';
import { api } from '../../lib/api';
import { lessonBase } from './learning-store';

export const STUDY_HEARTBEAT_MS = 30000;

const newTrackerId = () => (window.crypto && typeof window.crypto.randomUUID === 'function'
  ? window.crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r % 4) + 8).toString(16); }));

/** Mount in the lesson player: holds the focused study session for this lesson on the server. */
export function useStudyHeartbeat(courseId, lessonId, enabled) {
  useEffect(() => {
    if (!enabled || !courseId || !lessonId) return undefined;
    const endpoint = `${lessonBase(courseId, lessonId)}/activity`;
    let pending = false; let ended = false;
    let started = null; let desired = null;
    const ping = async () => {
      const trackerId = desired || started;
      if (pending || !trackerId) return;
      const action = !desired ? 'stop' : started === desired ? 'heartbeat' : 'start';
      pending = true;
      let succeeded = false;
      try {
        let expectedOwner;
        if (action === 'start') {
          const prep = await api.post(endpoint, { action: 'prepare', trackerId });
          if (prep.owner !== null && typeof prep.owner !== 'string') return;
          expectedOwner = prep.owner;
          // A delayed preparation must never authorize a focus session that ended while it was in flight.
          if (desired !== trackerId) { succeeded = true; return; }
        }
        const res = await api.post(endpoint, { action, trackerId, ...(action === 'start' ? { expectedOwner } : {}) });
        // Retry a rejected acquisition on the next tick while still focused.
        if (action === 'start' && !res.recorded && desired === trackerId) return;
        started = action === 'stop' ? null : trackerId;
        succeeded = true;
      } catch {
        /* Metrics never interrupt the lesson. No duration is guessed offline. */
      } finally {
        pending = false;
        if (succeeded && started !== desired) ping();
      }
    };
    const focused = () => document.visibilityState === 'visible' && document.hasFocus();
    const changed = () => {
      if (ended) return;
      desired = focused() ? (desired || newTrackerId()) : null;
      ping();
    };
    changed();
    const timer = setInterval(changed, STUDY_HEARTBEAT_MS);
    document.addEventListener('visibilitychange', changed);
    window.addEventListener('focus', changed);
    window.addEventListener('blur', changed);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', changed);
      window.removeEventListener('focus', changed);
      window.removeEventListener('blur', changed);
      ended = true;
      desired = null;
      ping();
    };
  }, [courseId, lessonId, enabled]);
}
