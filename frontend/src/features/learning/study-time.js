/**
 * Study time (port of real components/study-activity-tracker.tsx + lib/learner-overview-contract.ts).
 *
 * While a lesson tab is visible and focused, a heartbeat every STUDY_HEARTBEAT_MS credits the elapsed seconds to the
 * learner's day in db.learnerStudyDays. A gap longer than STUDY_MAX_GAP_MS is never credited (sleep, closed laptop).
 * Days are Vietnam calendar dates (GMT+7) and weeks run Monday to Sunday.
 *
 * Seed rows carry `minutes` only; credited rows also carry `seconds`, and `minutes` is kept as the rounded value so
 * every reader of learnerStudyDays sees the same total.
 */
import { useEffect } from 'react';
import { Codi } from '../../lib/codi';

export const STUDY_HEARTBEAT_MS = 30000;
export const STUDY_MAX_GAP_MS = 45000;
const DAY = 86400000;
const VIETNAM_OFFSET = 7 * 3600000;

export const studyDate = (time) => new Date(time.getTime() + VIETNAM_OFFSET).toISOString().slice(0, 10);
export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const today = () => studyDate(new Date());
/** Monday-to-Sunday dates of the Vietnam calendar week containing `date`. */
export function weekDates(date) {
  const sinceMonday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(date, -sinceMonday);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
/** Seconds per GMT+7 date between two instants; nothing when the gap is not a live session. */
export function studyCredits(previous, now) {
  if (!previous) return [];
  const elapsed = now.getTime() - previous.getTime();
  if (elapsed <= 0 || elapsed > STUDY_MAX_GAP_MS) return [];
  const end = Math.floor(now.getTime() / 1000) * 1000;
  const start = Math.floor(previous.getTime() / 1000) * 1000;
  const credits = new Map();
  for (let t = start; t < end; t += 1000) {
    const d = studyDate(new Date(t));
    credits.set(d, (credits.get(d) || 0) + 1);
  }
  return Array.from(credits, ([date, seconds]) => ({ date, seconds }));
}

export const secondsOf = (row) => (row.seconds != null ? row.seconds : (row.minutes || 0) * 60);
export const studyRows = (userId) => (Codi.db().learnerStudyDays || []).filter((d) => d.userId === userId);
/** Map date → seconds for one learner. */
export function secondsByDate(userId) {
  const m = new Map();
  studyRows(userId).forEach((d) => m.set(d.date, (m.get(d.date) || 0) + secondsOf(d)));
  return m;
}
/** Real streakDays: consecutive study days ending today, or yesterday when today has no study yet. */
export function streakDays(userId, endDate = today()) {
  const studied = new Set(Array.from(secondsByDate(userId)).filter(([, s]) => s > 0).map(([d]) => d));
  let day = studied.has(endDate) ? endDate : addDays(endDate, -1);
  let count = 0;
  while (studied.has(day)) { count++; day = addDays(day, -1); }
  return count;
}
export const roundMinutes = (seconds) => Math.round(seconds / 60);

function credit(userId, credits) {
  if (!credits.length) return;
  Codi.set((s) => {
    if (!Array.isArray(s.db.learnerStudyDays)) s.db.learnerStudyDays = [];
    credits.forEach(({ date, seconds }) => {
      let row = s.db.learnerStudyDays.find((d) => d.userId === userId && d.date === date);
      if (!row) { row = { userId, date, minutes: 0, seconds: 0 }; s.db.learnerStudyDays.push(row); }
      row.seconds = Math.min(86400, secondsOf(row) + seconds);
      row.minutes = roundMinutes(row.seconds);
    });
  }, { render: false });
}

/** Mount in the lesson player: credits focused study time for the signed-in learner. */
export function useStudyHeartbeat(courseId, lessonId, enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const userId = Codi.state.currentUserId;
    if (!userId) return undefined;
    let lastSeen = null; // instant of the last heartbeat of the current focus session
    const focused = () => document.visibilityState === 'visible' && document.hasFocus();
    const tick = () => {
      const now = new Date();
      if (lastSeen) credit(userId, studyCredits(lastSeen, now));
      lastSeen = focused() ? now : null;
    };
    tick();
    const timer = setInterval(tick, STUDY_HEARTBEAT_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    window.addEventListener('blur', tick);
    window.addEventListener('pagehide', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
      window.removeEventListener('blur', tick);
      window.removeEventListener('pagehide', tick);
      if (lastSeen) credit(userId, studyCredits(lastSeen, new Date()));
      lastSeen = null;
    };
  }, [courseId, lessonId, enabled]);
}
