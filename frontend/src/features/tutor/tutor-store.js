/**
 * The one Tutor's shared state (port of Codi develop's components/ai-chat/ai-chat-provider.tsx): where the Tutor is
 * open, which chat is on screen, the viewer's chat history, the lesson's code bridge and the pending contextual
 * request. The rebuild has two Tutor surfaces and never shows both at once: the lesson's Tutor tab and the full page
 * /ai. Codi's floating bubble is not used (DESIGN.md refuses a chat bubble over the lesson).
 *
 *   const ai = useTutor();   // re-renders on every change; ai.page, ai.active, ai.chats, ai.signedIn, ai.request …
 *
 * - page: the lesson while the lesson tab is mounted (setPage), otherwise where /ai was opened from (an in-app link to
 *   /ai records the screen it was clicked on, like Codi's "Đang hỏi về: …"); a lesson page keeps one thread.
 * - active: { id, stored, key } — a draft (client-picked UUID, stored on its first answer) or a chat from the history.
 *   The last chat per context ("general" / "lesson:<id>") is kept per tab (sessionStorage).
 * - A different signed-in learner (or a sign-out) drops the list, the open chat and any queued request.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../../lib/api';
import { Codi, useCodi } from '../../lib/codi';
import { pathPage } from './tutor-contract';

const ACTIVE_KEY = 'codi:tutor-chats';

let ver = 0;
const subs = new Set();
const bump = () => { ver += 1; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

const s = {
  override: null, // the lesson tab's page while it is mounted
  origin: { kind: 'general', label: 'Codi', href: null }, // where /ai was opened from (null: no screen to go back to)
  active: { id: '', stored: false, key: '' },
  chats: null,
  request: null,
  code: null, // the lesson's code bridge (see tutor-lesson-tab.jsx)
  codeVersion: 0,
  activate: null, // shows the lesson tab when a contextual request targets its lesson
  userId: undefined,
};

const pageKey = (page) => (page.kind === 'lesson' ? `lesson:${page.lessonId}` : 'general');
const chatKey = (chat) => (chat.kind === 'lesson' ? `lesson:${chat.lessonId}` : 'general');
const draft = (key) => ({ id: crypto.randomUUID(), stored: false, key });
const currentPage = () => s.override || s.origin;
const signedIn = () => !!(Codi.session && Codi.session.user);

function readSaved() {
  try { return JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || 'null') || {}; } catch { return {}; }
}
function writeSaved(value) {
  try {
    if (value === null) sessionStorage.removeItem(ACTIVE_KEY);
    else sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(value));
  } catch { /* storage unavailable: the next visit starts a new chat */ }
}
function setActive(next) {
  s.active = next;
  if (next.stored) writeSaved({ ...readSaved(), [next.key]: next.id });
}
const forget = (id) => writeSaved(Object.fromEntries(Object.entries(readSaved()).filter(([, value]) => value !== id)));

// A lesson keeps one thread: a lesson with a saved thread opens it, even from another tab or device.
function adoptLessonThread() {
  const key = s.active.key;
  if (!s.chats || s.active.stored || !key.startsWith('lesson:')) return;
  const lessonId = key.slice('lesson:'.length);
  const existing = s.chats.find((chat) => chat.kind === 'lesson' && chat.lessonId === lessonId);
  if (existing) setActive({ id: existing.id, stored: true, key });
}
// A conversation belongs to one lesson (or to the general screens): another lesson has its own.
function syncKey() {
  const key = pageKey(currentPage());
  if (s.active.key === key) return;
  const id = readSaved()[key];
  setActive(id ? { id, stored: true, key } : draft(key));
  adoptLessonThread();
}

async function refreshChats() {
  const uid = s.userId;
  if (uid === undefined) return;
  if (!uid) { s.chats = []; bump(); return; }
  try {
    const r = await api.get('/api/ai/chats');
    // A reply for a learner who has since changed is dropped.
    if (s.userId !== uid) return;
    s.chats = (r && r.chats) || [];
    adoptLessonThread();
    bump();
  } catch { /* the list keeps what it had; the thread itself still works */ }
}

/** Called with the session's user id: the first one is adopted, a change resets everything that was theirs. */
function syncUser(uid) {
  if (s.userId === uid) return;
  const first = s.userId === undefined;
  s.userId = uid;
  if (!first) {
    writeSaved(null);
    s.request = null;
    s.chats = null;
    setActive(draft(pageKey(currentPage())));
  }
  bump();
  refreshChats();
}

// An in-app link to the full page remembers the screen it was clicked on (the lesson while its tab is mounted).
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    const url = new URL(a.getAttribute('href'), window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== '/ai' || window.location.pathname === '/ai') return;
    s.origin = s.override || pathPage(window.location.pathname);
  }, true);
}

/** The Tutor's actions and state; read inside a component that called useTutor(). */
export const tutorStore = {
  get page() { return currentPage(); },
  get active() { return s.active; },
  get chats() { return s.chats; },
  get request() { return s.request; },
  get code() { return s.code; },
  get codeVersion() { return s.codeVersion; },
  get signedIn() { return signedIn(); },
  /** The lesson tab describes itself while mounted; null goes back to where /ai was opened from. */
  setPage(page, activate) {
    s.override = page;
    s.activate = page ? activate || null : null;
    // Leaving the lesson for the full page keeps the lesson as its context; leaving it for any other screen does not.
    if (page) s.origin = page;
    else if (window.location.pathname !== '/ai') s.origin = { kind: 'general', label: 'Codi', href: null };
    syncKey();
    bump();
  },
  /** /ai opened without a recorded origin (reload, typed address): its general context. */
  ensureKey() { if (s.active.key !== pageKey(currentPage())) { syncKey(); bump(); } },
  // A lesson keeps one thread: only the general screens start a new chat.
  startNew() {
    const page = currentPage();
    if (page.kind === 'lesson') return;
    forget(s.active.id);
    setActive(draft(pageKey(page)));
    bump();
  },
  select(chat) { setActive({ id: chat.id, stored: true, key: chatKey(chat) }); bump(); },
  /** Back from a chat of another context to this screen's own conversation ("Hỏi về trang này"). */
  backToPage() { s.active = { id: '', stored: false, key: '' }; syncKey(); bump(); },
  /** The draft just got its first answer, so it is now a stored chat. */
  markStored(id) { if (s.active.id === id && !s.active.stored) { setActive({ ...s.active, stored: true }); bump(); } },
  refreshChats,
  removeChat(id) {
    forget(id);
    if (s.chats) s.chats = s.chats.filter((chat) => chat.id !== id);
    if (s.active.id === id) setActive(draft(pageKey(currentPage())));
    bump();
  },
  registerCode(bridge) { s.code = bridge; s.codeVersion += 1; bump(); },
  /** The code workspace changed (run, edit, step): chips re-read it. */
  touchCode() { s.codeVersion += 1; bump(); },
  /** Contextual entry points (selection toolbar, failing test, console error) add context and maybe a question. */
  openWith(request) {
    s.request = { ...(request || {}), id: Date.now() };
    if (s.activate) s.activate();
    bump();
  },
  /** The pending request, handed out once: the first thread that takes it sends it. */
  takeRequest() {
    const taken = s.request;
    if (taken) { s.request = null; bump(); }
    return taken;
  },
  /** Navigating to /ai from code (not a link): remember where it was opened from. */
  rememberOrigin() { s.origin = s.override || pathPage(window.location.pathname); },
  /** Whether the lesson tab of this lesson is mounted (contextual requests go there). */
  hosts(lessonId) { return !!(s.override && s.override.kind === 'lesson' && s.override.lessonId === lessonId); },
};

export function useTutor() {
  useCodi();
  useSyncExternalStore(subscribe, () => ver);
  const uid = Codi.session && Codi.session.user ? Codi.session.user.id : null;
  useEffect(() => { syncUser(uid); }, [uid]);
  return tutorStore;
}
