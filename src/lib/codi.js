/**
 * Codi runtime store — the React port of the mockup's window.Codi (docs/mockup/js/core.js).
 *
 * The mockup's business logic is synchronous and mutates Codi.db() in place. The port keeps that contract so
 * feature code can be translated almost line by line:
 *
 *   import { Codi, useCodi } from '../lib/codi';
 *   function Page() {
 *     useCodi();                         // subscribe: re-render after every Codi.set()
 *     const course = Codi.course(slug);  // selectors read the live db
 *     const buy = () => Codi.set((s) => { s.db.orders.push(order); });   // mutate, re-render, persist
 *   }
 *
 * STATE
 *  Codi.state = { currentUserId, carts, scenario, db, ...module slices }
 *  Codi.set(fnOrPatch, { render:false })   fn(state) mutates in place, or an object is merged. Re-renders subscribers
 *                                          (unless render:false) and schedules a debounced sync to Postgres.
 *  Codi.ensure(key, defaultFn)             lazily creates a persisted module slice (stored in kv as slice:<key>).
 *  Codi.db()                               the live data (users, courses, orders, vouchers, submissions, questions,
 *                                          reviews, enrolments, learnerProgress, learnerSeed, knowledgeMaps,
 *                                          notifications, bankInfo, categories, levels, codeAttempts, analytics, …).
 *  Codi.reset()                            server reseeds from the mockup data, then the client reloads it.
 *
 * Persistence: db + slices → Postgres via /api/sync (diffed per entity). currentUserId and scenario → localStorage
 * (they describe this browser session, not shared data).
 *
 * NAVIGATION  Codi.go(path) (react-router navigate), Codi.path(), Codi.query()
 * AUTH        Codi.requireAuth(intentFn, { reason }) runs now or opens the sign-in modal and runs after success.
 *             Codi.signIn(userId), Codi.signOut()
 * UI          Codi.ui.toast / confirm / modal / sheet … — see src/components/ui/overlay-host.jsx (registered there).
 */
import { useSyncExternalStore } from 'react';
import { fmt } from './format';

const SESSION_KEY = 'codi-rebuild-session';
const DEFAULT_SCENARIO = { paymentOutcome: 'success', pathAI: 'ok', materials: 'ok', aiAssistant: 'ok', kmap: 'ok', theme: 'light' };
const RESERVED = new Set(['currentUserId', 'scenario', 'db']);

// ───────────────────────── subscription ─────────────────────────
let version = 0;
const listeners = new Set();
const emit = () => { version += 1; listeners.forEach((l) => l()); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

/** Subscribe a component to every store change. Returns Codi for convenience. */
export function useCodi() {
  useSyncExternalStore(subscribe, () => version);
  return Codi;
}

// ───────────────────────── persistence ─────────────────────────
let docCollections = new Set();
let lastSaved = new Map(); // "d|collection|id" | "k|kvKey" → JSON string
let syncTimer = null;
let syncing = Promise.resolve();
export const syncStatus = { error: null };

function snapshotEntries(state) {
  const out = new Map();
  const db = state.db || {};
  for (const [key, value] of Object.entries(db)) {
    if (docCollections.has(key) && Array.isArray(value)) {
      for (const item of value) if (item && item.id) out.set(`d|${key}|${item.id}`, JSON.stringify(item));
    } else {
      out.set(`k|db:${key}`, JSON.stringify(value === undefined ? null : value));
    }
  }
  for (const [key, value] of Object.entries(state)) {
    if (RESERVED.has(key) || value === undefined) continue;
    out.set(`k|slice:${key}`, JSON.stringify(value));
  }
  return out;
}

function persistSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ currentUserId: Codi.state.currentUserId, scenario: Codi.state.scenario }));
  } catch { /* storage blocked: session lasts for this tab only */ }
}

function flush() {
  syncTimer = null;
  const now = snapshotEntries(Codi.state);
  const body = { upserts: [], deletes: [], kv: {}, kvDelete: [] };
  for (const [k, json] of now) {
    if (lastSaved.get(k) === json) continue;
    const [kind, a, b] = k.split('|');
    if (kind === 'd') body.upserts.push({ collection: a, id: b, data: JSON.parse(json) });
    else body.kv[a] = JSON.parse(json);
  }
  for (const k of lastSaved.keys()) {
    if (now.has(k)) continue;
    const [kind, a, b] = k.split('|');
    if (kind === 'd') body.deletes.push({ collection: a, id: b });
    else body.kvDelete.push(a);
  }
  if (!body.upserts.length && !body.deletes.length && !Object.keys(body.kv).length && !body.kvDelete.length) return syncing;
  lastSaved = now;
  // keepalive lets the last write finish when the tab reloads or closes right after a change
  syncing = syncing.then(() => fetch('/api/sync', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); syncStatus.error = null; })
    .catch((e) => {
      syncStatus.error = e.message;
      lastSaved = new Map(); // resend everything on the next change (upserts are idempotent)
      Codi.ui.toast('Không lưu được thay đổi lên máy chủ. Kiểm tra API rồi thử lại.', { type: 'danger' });
    }));
  return syncing;
}
const scheduleSync = () => { if (!syncTimer) syncTimer = setTimeout(flush, 250); };
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (syncTimer) { clearTimeout(syncTimer); flush(); } });
}

/**
 * Loads the snapshot from the API once. Throws when the API or database is unreachable.
 * Concurrent and repeated calls share the same load, so a second call (StrictMode runs effects twice)
 * can never replace a store that pages have already written to. A failed load can be retried.
 */
let loading = null;
export function loadStore() {
  if (!loading) loading = loadStoreOnce().catch((e) => { loading = null; throw e; });
  return loading;
}

async function loadStoreOnce() {
  const r = await fetch('/api/snapshot');
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
  const snap = await r.json();
  docCollections = new Set(snap.docCollections || []);
  let session = {};
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}') || {}; } catch { session = {}; }
  Codi.state = {
    carts: {},
    ...snap.slices,
    currentUserId: session.currentUserId || null,
    scenario: { ...DEFAULT_SCENARIO, ...(session.scenario || {}) },
    db: snap.db,
  };
  if (Codi.state.currentUserId && !Codi.state.db.users.some((u) => u.id === Codi.state.currentUserId)) Codi.state.currentUserId = null;
  lastSaved = snapshotEntries(Codi.state);
  applyTheme();
  emit();
}

function applyTheme() {
  const html = document.documentElement;
  if (Codi.state.scenario.theme === 'dark') html.setAttribute('data-theme', 'dark');
  else html.removeAttribute('data-theme');
}

// ───────────────────────── navigation bridge ─────────────────────────
const nav = { navigate: null, location: { pathname: '/', search: '' } };
/** Called by <RouterBridge/> inside the router. */
export function bindRouter(navigate, location) { nav.navigate = navigate; nav.location = location; }

// ───────────────────────── Codi object ─────────────────────────
const db = () => Codi.state.db;
const currentUser = () => (Codi.state.currentUserId ? db().users.find((u) => u.id === Codi.state.currentUserId) || null : null);

export const ROLE_LABEL = { guest: 'Khách', learner: 'Học viên', lecturer: 'Giảng viên', admin: 'Quản trị viên' };

export const Codi = {
  state: { db: {}, scenario: DEFAULT_SCENARIO, carts: {} },
  fmt,
  ROLE_LABEL,

  // state
  set(fnOrPatch, opts) {
    if (typeof fnOrPatch === 'function') fnOrPatch(Codi.state);
    else if (fnOrPatch) Object.assign(Codi.state, fnOrPatch);
    persistSession();
    applyTheme();
    scheduleSync();
    if (!opts || opts.render !== false) emit();
  },
  ensure(key, defaultFn) {
    if (Codi.state[key] === undefined) { Codi.state[key] = defaultFn(); scheduleSync(); }
    return Codi.state[key];
  },
  db,
  async reset() {
    await flush();
    const r = await fetch('/api/reset', { method: 'POST' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    Codi.ui.closeAll();
    const keepUser = Codi.state.currentUserId;
    await loadStore();
    Codi.state.currentUserId = keepUser && db().users.some((u) => u.id === keepUser) ? keepUser : null;
    Codi._onReset.forEach((fn) => fn());
    persistSession();
    emit();
  },
  _onReset: [],
  onReset(fn) { Codi._onReset.push(fn); },
  /** Forces pending changes to the server now (e.g. before navigating away). */
  flush: () => flush(),

  // navigation
  go(path) { if (nav.navigate) nav.navigate(path); },
  path: () => nav.location.pathname.replace(/\/+$/, '') || '/',
  query: () => Object.fromEntries(new URLSearchParams(nav.location.search)),
  /** Re-render every subscriber without changing state (mockup Codi.rerender). */
  rerender: () => emit(),
  /** Run fn after the current render is committed (mockup Codi.onMount). Prefer useEffect in new code. */
  onMount: (fn) => { setTimeout(() => { try { fn(); } catch (e) { console.error(e); } }, 0); },

  // selectors
  currentUser,
  role: () => { const u = currentUser(); return u ? u.role : 'guest'; },
  user: (id) => db().users.find((u) => u.id === id) || null,
  course: (idOrSlug) => db().courses.find((c) => c.id === idOrSlug || c.slug === idOrSlug) || null,
  lessons: (course) => (course ? course.chapters.flatMap((ch) => ch.lessons) : []),
  lesson: (course, lessonId) => Codi.lessons(course).find((l) => l.id === lessonId) || null,
  chapterOf: (course, lessonId) => (course ? course.chapters.find((ch) => ch.lessons.some((l) => l.id === lessonId)) : null),
  category: (id) => db().categories.find((c) => c.id === id) || { id, name: '' },
  levelLabel: (level) => db().levels[level] || level,
  homeFor: (role) => ({ guest: '/', learner: '/dashboard', lecturer: '/teach', admin: '/admin' }[role] || '/'),

  isEnrolled(courseId, userId) {
    const uid = userId || Codi.state.currentUserId;
    return !!uid && db().enrolments.some((e) => e.userId === uid && e.courseId === courseId);
  },
  enroll(courseId, userId) {
    const uid = userId || Codi.state.currentUserId;
    if (!uid || Codi.isEnrolled(courseId, uid)) return;
    db().enrolments.push({ userId: uid, courseId, enrolledAt: new Date().toISOString() });
    const c = Codi.course(courseId);
    if (c) c.learnersCount = (c.learnersCount || 0) + 1;
  },
  cart() { const uid = Codi.state.currentUserId; return uid ? (Codi.state.carts[uid] || []) : []; },
  setCart(ids) { const uid = Codi.state.currentUserId; if (uid) Codi.state.carts[uid] = ids.slice(); },
  pendingOrderFor(courseId, userId) {
    const uid = userId || Codi.state.currentUserId;
    return db().orders.find((o) => o.userId === uid && o.status === 'pending' && o.items.some((i) => i.courseId === courseId)) || null;
  },
  ownership(courseId) {
    const c = Codi.course(courseId);
    if (!c) return 'not-owned';
    if (!Codi.state.currentUserId) return c.price === 0 ? 'free' : 'not-owned';
    if (Codi.isEnrolled(courseId)) return 'owned';
    if (Codi.pendingOrderFor(courseId)) return 'pending-payment';
    if (Codi.cart().includes(courseId)) return 'in-cart';
    if (c.price === 0) return 'free';
    return 'not-owned';
  },
  // Default progress reads db.learnerProgress; the learning feature overrides this to read its own slice.
  courseProgress(courseId, userId) {
    const uid = userId || Codi.state.currentUserId;
    const c = Codi.course(courseId);
    const total = Codi.lessons(c).length;
    const rec = db().learnerProgress.find((p) => p.userId === uid && p.courseId === courseId);
    const done = rec ? rec.completed.length : 0;
    const next = c ? c.defaultOrder.find((id) => !(rec && rec.completed.includes(id))) : null;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0, completed: total > 0 && done >= total, currentLessonId: next || null };
  },

  // auth — openSignIn is registered by the auth feature (src/features/shell)
  openSignIn: (intent) => { Codi.go('/login'); if (intent) Codi._pendingIntent = intent; },
  requireAuth(intent, opts) {
    if (currentUser()) { intent(); return; }
    Codi.openSignIn(intent, opts);
  },
  signIn(userId) { Codi.set((s) => { s.currentUserId = userId; }); },
  signOut() {
    Codi.set((s) => { s.currentUserId = null; });
    Codi.ui.closeAll();
    Codi.go('/');
    Codi.ui.toast('Bạn đã đăng xuất.');
  },
  notify(userId, n) {
    db().notifications.push({ id: Codi.uid('n'), userId, title: n.title, body: n.body || '', link: n.link || '/', read: false, createdAt: new Date().toISOString() });
    scheduleSync();
  },
  wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  uid: (prefix) => (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),

  // UI bridge — real implementations are installed by <OverlayHost/> (src/components/ui/overlay-host.jsx)
  ui: {
    toast: (msg) => console.info('[toast]', msg),
    confirm: () => Promise.resolve({ ok: false }),
    modal: () => ({ close() {} }),
    sheet: () => ({ close() {} }),
    closeAll: () => {},
    copy: (text) => navigator.clipboard && navigator.clipboard.writeText(String(text)),
  },

  // Cross-feature contracts. Features overwrite these at import time (e.g. the AI tutor installs Codi.tutor.open).
  tutor: {
    open() { Codi.ui.toast('Trợ lý bài học chưa sẵn sàng.'); },
    explainError() { Codi.ui.toast('Giải thích lỗi chưa sẵn sàng.'); },
  },
};

if (typeof window !== 'undefined') window.Codi = Codi; // handy for debugging in the console
