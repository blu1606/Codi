/**
 * In-browser stand-ins for the real app's Better Auth backend (sessions, passwords, email OTP) and the
 * student activity log that feeds the profile heatmap.
 *
 *  Passwords      Codi.state.shellAuth.passwords[userId]  (prototype only; default demo password Codi@12345)
 *  Sessions       Codi.db().userSessions  [{ id, userId, userAgent, createdAt }]  — seeded by patches/10-shell.js.
 *                 This browser's session id is kept in localStorage so "Phiên hiện tại" survives reloads.
 *  Activity       Codi.db().studentActivities [{ id, userId, type: 'login', occurredAt }] (seeded + every sign-in),
 *                 merged at read time with enrolments, learnerStudyDays (owned by learning) and submissions.
 *  OTP            Fixed demo codes: 123456 valid, 000000 expired. Codes live 2 minutes (client timer).
 */
import { Codi } from '../../lib/codi';

export const DEMO_PASSWORD = 'Codi@12345';
export const OTP_VALID = '123456';
export const OTP_EXPIRED = '000000';
export const OTP_TTL_S = 120;
export const OTP_RESEND_AFTER_S = 30;
export const OTP_MAX_TRIES = 3;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCAL_SESSION_KEY = 'codi-rebuild-device-session';

const authSlice = () => Codi.ensure('shellAuth', () => ({ passwords: {} }));
const list = (key) => { const db = Codi.db(); if (!Array.isArray(db[key])) db[key] = []; return db[key]; };

// ───────────────────────── passwords ─────────────────────────
export const passwordOf = (userId) => authSlice().passwords[userId] || DEMO_PASSWORD;
export const checkPassword = (userId, password) => password === passwordOf(userId);
export function setPassword(userId, password) {
  Codi.set(() => { authSlice().passwords[userId] = password; }, { render: false });
}

// ───────────────────────── sessions ─────────────────────────
const readLocalSession = () => { try { return localStorage.getItem(LOCAL_SESSION_KEY); } catch { return null; } };
const writeLocalSession = (id) => { try { if (id) localStorage.setItem(LOCAL_SESSION_KEY, id); else localStorage.removeItem(LOCAL_SESSION_KEY); } catch { /* storage blocked */ } };

export const sessionsOf = (userId) => list('userSessions').filter((s) => s.userId === userId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

/** This browser's session for the signed-in user; created on demand (e.g. after a dev-drawer role switch). */
export function currentSessionId(userId) {
  const id = readLocalSession();
  const rows = list('userSessions');
  if (id && rows.some((s) => s.id === id && s.userId === userId)) return id;
  const row = { id: Codi.uid('ses'), userId, userAgent: navigator.userAgent, createdAt: new Date().toISOString() };
  Codi.set((s) => { s.db.userSessions = [...list('userSessions'), row]; }, { render: false });
  writeLocalSession(row.id);
  return row.id;
}

export function revokeSession(sessionId) {
  Codi.set((s) => { s.db.userSessions = list('userSessions').filter((x) => x.id !== sessionId); });
}
export function revokeOtherSessions(userId) {
  const keep = currentSessionId(userId);
  Codi.set((s) => { s.db.userSessions = list('userSessions').filter((x) => x.userId !== userId || x.id === keep); });
}
export function revokeAllSessions(userId) {
  Codi.set((s) => { s.db.userSessions = list('userSessions').filter((x) => x.userId !== userId); }, { render: false });
  writeLocalSession(null);
}

/** Real describeDevice() from components/settings/session-settings.tsx. */
export function describeDevice(userAgent) {
  if (!userAgent) return 'Thiết bị không xác định';
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox' : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Trình duyệt';
  const system = /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iOS' : /Windows/.test(userAgent) ? 'Windows' : /Mac/.test(userAgent) ? 'macOS' : /Linux/.test(userAgent) ? 'Linux' : 'Thiết bị khác';
  return `${browser} · ${system}`;
}
export const isMobileAgent = (ua) => /Android|iPhone|iPad/.test(ua || '');

// ───────────────────────── sign-in / sign-out ─────────────────────────
/** Starts a new device session, logs the "login" activity and signs the user in. */
export function startSession(userId) {
  const now = new Date().toISOString();
  const row = { id: Codi.uid('ses'), userId, userAgent: navigator.userAgent, createdAt: now };
  Codi.set((s) => {
    s.db.userSessions = [...list('userSessions'), row];
    s.db.studentActivities = [...list('studentActivities'), { id: Codi.uid('act'), userId, type: 'login', occurredAt: now }];
    const u = s.db.users.find((x) => x.id === userId);
    if (u) u.lastActive = now;
    s.currentUserId = userId;
  });
  writeLocalSession(row.id);
}

/** Ends this device's session (row removed like Better Auth revokeSession), then the runtime sign-out. */
export function endSession() {
  const id = readLocalSession();
  if (id) Codi.set((s) => { s.db.userSessions = list('userSessions').filter((x) => x.id !== id); }, { render: false });
  writeLocalSession(null);
  Codi.signOut();
}

// ───────────────────────── password recovery grant ─────────────────────────
// "Quên mật khẩu hiện tại?" verifies an email OTP, then /reset-password?source=account may set a new password
// for 10 minutes. Module memory only, like the server-side grant cookie.
let resetGrant = null;
export const grantReset = (userId, email) => { resetGrant = { userId, email, expiresAt: Date.now() + 10 * 60000 }; };
export const readResetGrant = () => (resetGrant && resetGrant.expiresAt > Date.now() && resetGrant.userId === Codi.state.currentUserId ? resetGrant : null);
export const clearResetGrant = () => { resetGrant = null; };

// ───────────────────────── OTP check ─────────────────────────
/** 'ok' | 'expired' | 'wrong'. expiresAt is the client deadline from <OtpInput>. */
export function checkOtp(code, expiresAt) {
  if (code === OTP_EXPIRED || (expiresAt && Date.now() > expiresAt)) return 'expired';
  return code === OTP_VALID ? 'ok' : 'wrong';
}

// ───────────────────────── activity (profile heatmap) ─────────────────────────
// Day keys use the Vietnam calendar (Asia/Bangkok = GMT+7), as the real study-day credits do.
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayKey = (iso) => dayFmt.format(new Date(iso));

/**
 * Activity entries for a user: [{ day: 'YYYY-MM-DD', type }]. Real types: login, course_view, lesson_complete,
 * course_enrolled. Derived from live data so other features' writes show up without coupling:
 * sign-ins (studentActivities), enrolments, study days with minutes (course_view) and submissions.
 */
export function activitiesOf(userId) {
  const db = Codi.db();
  const out = [];
  (db.studentActivities || []).forEach((a) => { if (a.userId === userId && a.occurredAt) out.push({ day: dayKey(a.occurredAt), type: a.type }); });
  (db.enrolments || []).forEach((e) => { if (e.userId === userId && e.enrolledAt) out.push({ day: dayKey(e.enrolledAt), type: 'course_enrolled' }); });
  (db.learnerStudyDays || []).forEach((d) => { if (d.userId === userId && (d.minutes || d.seconds) > 0 && d.date) out.push({ day: d.date, type: 'course_view' }); });
  (db.submissions || []).forEach((s) => { if (s.userId === userId && s.submittedAt) out.push({ day: dayKey(s.submittedAt), type: 'lesson_complete' }); });
  return out;
}
