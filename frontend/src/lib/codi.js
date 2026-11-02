/**
 * Codi runtime — the React port of the mockup's window.Codi (docs/mockup/js/core.js), minus its data store.
 * Domain data (courses, orders, progress …) always comes from the backend through src/lib/api.js and
 * src/lib/use-api.js; this module only holds the signed-in session, browser-only UI state and shared helpers.
 *
 *   import { Codi, useCodi } from '../lib/codi';
 *   function Page() {
 *     useCodi();                    // re-render after every Codi.set() / session change
 *     const me = Codi.currentUser(); // backend session user (or null)
 *   }
 *
 * STATE (browser only, never domain data)
 *  Codi.state = { currentUserId, scenario }   scenario = Alt+K test flags + resolved theme, kept in localStorage.
 *  Codi.set(fnOrPatch, { render:false })      fn(state) mutates in place, or an object is merged; re-renders.
 *
 * SESSION     Codi.session = { user, roles } from GET /api/auth/get-session + /api/user/roles (Better Auth cookie).
 *             Codi.currentUser(), Codi.role(), Codi.signIn(email, password), Codi.signOut(), Codi.refreshSession().
 * NAVIGATION  Codi.go(path) (react-router navigate), Codi.path(), Codi.query()
 * AUTH        Codi.requireAuth(intentFn, { reason }) runs now or opens the sign-in modal and runs after success.
 * UI          Codi.ui.toast / confirm / modal / sheet … — see src/components/ui/overlay-host.jsx (registered there).
 */
import { useSyncExternalStore } from 'react';
import { api } from './api';
import { fmt } from './format';

const SESSION_KEY = 'codi-rebuild-session';
const DEFAULT_SCENARIO = { paymentOutcome: 'success', aiAssistant: 'ok', theme: 'light' };

// ───────────────────────── subscription ─────────────────────────
let version = 0;
const listeners = new Set();
const emit = () => { version += 1; listeners.forEach((l) => l()); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

/** Subscribe a component to every Codi change. Returns Codi for convenience. */
export function useCodi() {
  useSyncExternalStore(subscribe, () => version);
  return Codi;
}

// The dev scenario is browser-local; who is signed in comes from the backend session cookie.
function persistScenario() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ scenario: Codi.state.scenario }));
  } catch { /* storage blocked: scenario lasts for this tab only */ }
}

function readScenario() {
  try {
    const local = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}') || {};
    return { ...DEFAULT_SCENARIO, ...(local.scenario || {}) };
  } catch {
    return { ...DEFAULT_SCENARIO };
  }
}

function applyTheme() {
  const html = document.documentElement;
  if (Codi.state.scenario.theme === 'dark') html.setAttribute('data-theme', 'dark');
  else html.removeAttribute('data-theme');
}

// ───────────────────────── backend session (Better Auth) ─────────────────────────
const ROLE_FROM_SERVER = { ADMIN: 'admin', LECTURER: 'lecturer', LEARNER: 'learner' };
const primaryRole = (roles) => ['ADMIN', 'LECTURER', 'LEARNER'].map((r) => (roles.includes(r) ? ROLE_FROM_SERVER[r] : null)).find(Boolean) || null;

/** Reads the signed-in user and roles from the backend. Returns { user, roles } with user null when signed out. */
async function fetchSession() {
  const session = await api('/api/auth/get-session');
  if (!session || !session.user) return { user: null, roles: [] };
  const { roles = [] } = await api('/api/user/roles');
  return { user: session.user, roles };
}

function applySession(session) {
  Codi.session = session;
  Codi.state.currentUserId = session.user ? session.user.id : null;
}

/**
 * Loads the backend session once before the app renders. Throws when the API is unreachable. Concurrent and
 * repeated calls share the same load (StrictMode runs effects twice); a failed load can be retried.
 */
let loading = null;
export function loadSession() {
  if (!loading) loading = loadSessionOnce().catch((e) => { loading = null; throw e; });
  return loading;
}

async function loadSessionOnce() {
  const auth = await fetchSession();
  Codi.state = { currentUserId: null, scenario: readScenario() };
  applySession(auth);
  applyTheme();
  emit();
}

// ───────────────────────── navigation bridge ─────────────────────────
const nav = { navigate: null, location: { pathname: '/', search: '' } };
/** Called by <RouterBridge/> inside the router. */
export function bindRouter(navigate, location) { nav.navigate = navigate; nav.location = location; }

// ───────────────────────── Codi object ─────────────────────────
const SESSION_FIELDS = ['id', 'name', 'email', 'emailVerified', 'image', 'createdAt'];
/** Signed-in user for rendering: the backend session user plus the primary role, or null. */
function currentUser() {
  const su = Codi.session && Codi.session.user;
  if (!su) return null;
  return { ...Object.fromEntries(SESSION_FIELDS.map((k) => [k, su[k] ?? null])), role: primaryRole(Codi.session.roles) || 'learner' };
}

export const ROLE_LABEL = { guest: 'Khách', learner: 'Học viên', lecturer: 'Giảng viên', admin: 'Quản trị viên' };

export const Codi = {
  state: { currentUserId: null, scenario: DEFAULT_SCENARIO },
  fmt,
  ROLE_LABEL,

  /** Browser-only UI state (scenario flags, theme). Never used for domain data. */
  set(fnOrPatch, opts) {
    if (typeof fnOrPatch === 'function') fnOrPatch(Codi.state);
    else if (fnOrPatch) Object.assign(Codi.state, fnOrPatch);
    persistScenario();
    applyTheme();
    if (!opts || opts.render !== false) emit();
  },

  // navigation
  go(path) { if (nav.navigate) nav.navigate(path); },
  path: () => nav.location.pathname.replace(/\/+$/, '') || '/',
  query: () => Object.fromEntries(new URLSearchParams(nav.location.search)),
  /** Re-render every subscriber without changing state (mockup Codi.rerender). */
  rerender: () => emit(),
  /** Run fn after the current render is committed (mockup Codi.onMount). Prefer useEffect in new code. */
  onMount: (fn) => { setTimeout(() => { try { fn(); } catch (e) { console.error(e); } }, 0); },

  // session selectors
  currentUser,
  role: () => { const u = currentUser(); return u ? u.role : 'guest'; },
  homeFor: (role) => ({ guest: '/', learner: '/dashboard', lecturer: '/teach', admin: '/admin' }[role] || '/'),

  // auth — openSignIn is registered by the auth feature (src/features/shell)
  openSignIn: (intent) => { Codi.go('/login'); if (intent) Codi._pendingIntent = intent; },
  requireAuth(intent, opts) {
    if (currentUser()) { intent(); return; }
    Codi.openSignIn(intent, opts);
  },
  /** Backend session: { user, roles } (Better Auth user, role ids LEARNER|LECTURER|ADMIN). */
  session: { user: null, roles: [] },
  /**
   * Email + password sign-in against the backend (sets the session cookie). Resolves the signed-in user id;
   * throws ApiError with the server message (401 wrong credentials or a disabled account).
   */
  async signIn(email, password) {
    await api.post('/api/auth/sign-in/email', { email, password, rememberMe: true });
    const session = await fetchSession();
    if (!session.user) throw new Error('Không đọc được phiên đăng nhập. Vui lòng thử lại.');
    applySession(session);
    emit();
    return session.user.id;
  },
  /** Re-reads the backend session (after a profile/email change, or when another tab signed out). */
  async refreshSession() {
    const session = await fetchSession();
    applySession(session);
    emit();
    return session;
  },
  async signOut({ quiet = false } = {}) {
    try {
      await api.post('/api/auth/sign-out', {});
    } catch (e) {
      if (!quiet) Codi.ui.toast('Không đăng xuất được trên máy chủ: ' + e.message, { type: 'danger' });
      return;
    }
    applySession({ user: null, roles: [] });
    emit();
    if (quiet) return;
    Codi.ui.closeAll();
    Codi.go('/');
    Codi.ui.toast('Bạn đã đăng xuất.');
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
