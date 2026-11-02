/**
 * Global search (command palette) for every role.
 *
 *  <SearchTrigger compact? />  field-looking button in the header ("Tìm khoá học, bài học, trang…  Ctrl K"); the
 *                              compact variant is an icon button (header ≤ 1024 px).
 *  <GlobalSearch />            mounted once by the header: owns the Ctrl/Cmd+K and "/" shortcuts and the dialog.
 *  openSearch()                opens the dialog from anywhere (mobile drawer).
 *
 * Dialog: role="dialog" aria-modal, labelled combobox input driving a grouped listbox through
 * aria-activedescendant. ArrowUp/Down/Home/End move, Enter opens, Esc closes, focus returns to where it was.
 * Matching ignores Vietnamese diacritics (nav-config normalize). Groups: Khoá học, Bài học, Trang, role data
 * (lecturer: bài nộp, câu hỏi; admin: người dùng, đơn hàng, voucher, khoá học chờ duyệt) and Hành động; at most six
 * per group, groups ordered by their best match. An empty query shows recent picks (localStorage) and suggested pages.
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Codi, ROLE_LABEL, useCodi } from '../../lib/codi';
import { api } from '../../lib/api';
import { useApi } from '../../lib/use-api';
import { Icon, courseStatusLabel, orderStatusLabel } from '../../components/ui/primitives';
import { ShellIcon } from './shell-ui';
import { normalize, pagesFor } from './nav-config';
import { endSession } from './account-store';

const PER_GROUP = 6;
const RECENT_MAX = 5;
const RECENT_KEY = 'codi-search-recent';

// ───────────────────────── open state (tiny external store) ─────────────────────────
let isOpen = false;
let returnTarget = null; // element focused when search opened; focus goes back there on close
const subs = new Set();
const setOpen = (v) => {
  if (isOpen === v) return;
  if (v && typeof document !== 'undefined') returnTarget = document.activeElement;
  isOpen = v;
  subs.forEach((f) => f());
};
export const openSearch = () => setOpen(true);
const useOpen = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => isOpen);

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
export const SHORTCUT_LABEL = isMac ? '⌘ K' : 'Ctrl K';

// ───────────────────────── recent picks ─────────────────────────
const recentKey = () => `${RECENT_KEY}:${Codi.state.currentUserId || 'guest'}`;
const validRecent = (x) => x && typeof x.title === 'string' && typeof x.href === 'string' && x.href.startsWith('/') && !x.href.startsWith('//');
function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(recentKey()) || '[]');
    return Array.isArray(list) ? list.filter(validRecent).slice(0, RECENT_MAX) : [];
  } catch {
    return []; // storage blocked or corrupt: no history this session
  }
}
function writeRecent(list) {
  try { localStorage.setItem(recentKey(), JSON.stringify(list.slice(0, RECENT_MAX))); } catch { /* history is optional */ }
}
function pushRecent(item) {
  const entry = { id: item.id, title: item.title, subtitle: item.subtitle || '', href: item.href, icon: item.icon, type: item.type };
  writeRecent([entry, ...readRecent().filter((r) => r.href !== entry.href)]);
}

// ───────────────────────── matching ─────────────────────────
const tokensOf = (q) => normalize(q).trim().split(/\s+/).filter(Boolean);

/** Lower score = better. null when not every token matches. */
function score(item, tokens, full) {
  const title = normalize(item.title);
  const hay = item._hay || (item._hay = normalize(`${item.title} ${item.subtitle || ''} ${item.keywords || ''}`));
  if (!tokens.every((t) => hay.includes(t))) return null;
  if (title.startsWith(full)) return 0;
  if (title.includes(full)) return 1;
  if (tokens.every((t) => title.includes(t))) return 2;
  return 3;
}

/** Text with every query token highlighted, matched on the normalized form but rendered from the original. */
function Highlight({ text, tokens }) {
  const src = String(text || '');
  if (!tokens.length) return src;
  let norm = '';
  const map = []; // normalized index → original index
  for (let i = 0; i < src.length; i += 1) {
    const n = normalize(src[i]);
    for (let k = 0; k < n.length; k += 1) { norm += n[k]; map.push(i); }
  }
  const marked = new Array(src.length).fill(false);
  tokens.forEach((t) => {
    let at = norm.indexOf(t);
    while (at !== -1) {
      for (let k = at; k < at + t.length; k += 1) marked[map[k]] = true;
      at = norm.indexOf(t, at + t.length);
    }
  });
  // combining marks typed in decomposed form follow their base letter
  for (let i = 1; i < src.length; i += 1) if (!normalize(src[i]) && marked[i - 1]) marked[i] = true;
  const out = [];
  let i = 0;
  while (i < src.length) {
    let j = i;
    while (j < src.length && marked[j] === marked[i]) j += 1;
    out.push(marked[i] ? <mark key={i}>{src.slice(i, j)}</mark> : src.slice(i, j));
    i = j;
  }
  return out;
}

// ───────────────────────── sources ─────────────────────────

const LEVEL_LABEL = { Beginner: 'Cơ bản', Intermediate: 'Trung cấp', Advanced: 'Nâng cao' };

/**
 * Backend data for the palette, read each time it opens: published courses (GET /api/courses), the learner's
 * enrolled courses with lesson UUIDs (GET /api/learner/overview) and orders (GET /api/student/profile/summary), the
 * lecturer's own courses with their lessons, pending submissions and learner questions (lecturer actions). Admin
 * groups still read the transitional store.
 */
async function loadLecturerData() {
  const mine = await api.action('dashboard/lecturer', 'getLecturerCourses', 'all');
  const [editors, grading, open, answered] = await Promise.all([
    Promise.all(mine.map((c) => api.action('dashboard/lecturer/courses/courseId', 'getCourseEditorData', c.id))),
    api.action('dashboard/lecturer/grading', 'getGradingQueueData', { status: 'pending' }),
    api.action('dashboard/lecturer/questions', 'getLecturerQuestionsData', { view: 'questions', status: 'unanswered' }),
    api.action('dashboard/lecturer/questions', 'getLecturerQuestionsData', { view: 'questions', status: 'answered' }),
  ]);
  return {
    mine,
    lessons: editors.flatMap((ed) => (ed.chapters || []).flatMap((ch) => (ch.lessons || []).map((l) => ({ ...l, courseId: ed.course.id, courseTitle: ed.course.title, chapterTitle: ch.title })))),
    submissions: grading.submissions || [],
    questions: [...(open.questions || []), ...(answered.questions || [])],
  };
}

async function loadAdminData() {
  const [orders, queue] = await Promise.all([
    api.action('dashboard/admin', 'getAdminOrdersExportAction', { range: 'all' }),
    api.action('dashboard/admin/publication', 'getAdminPublicationQueue', 'pending'),
  ]);
  return { adminOrders: orders || [], pendingReviews: (queue && queue.items) || [] };
}

const ROLE_LOADERS = { lecturer: loadLecturerData, admin: loadAdminData };
const EMPTY_ROLE_DATA = { mine: [], lessons: [], submissions: [], questions: [], adminOrders: [], pendingReviews: [] };

function useSearchData(role) {
  const courses = useApi('/api/courses?limit=100');
  const overview = useApi(role === 'learner' ? '/api/learner/overview' : null);
  const summary = useApi(role === 'learner' ? '/api/student/profile/summary' : null);
  const loader = ROLE_LOADERS[role];
  const [extra, setExtra] = useState({ data: null, error: null, loading: !!loader });
  useEffect(() => {
    if (!loader) return undefined;
    let alive = true;
    loader()
      .then((data) => { if (alive) setExtra({ data, error: null, loading: false }); })
      .catch((error) => { if (alive) setExtra({ data: null, error, loading: false }); });
    return () => { alive = false; };
  }, [loader]);
  return {
    published: (courses.data && courses.data.courses) || [],
    enrolled: (overview.data && overview.data.courses) || [],
    orders: (summary.data && summary.data.orders) || [],
    ...EMPTY_ROLE_DATA,
    ...(extra.data || {}),
    loading: courses.loading || overview.loading || summary.loading || (!!loader && extra.loading),
    failed: !!(courses.error || overview.error || summary.error || extra.error),
  };
}

function courseItems(role, data) {
  const meta = (c) => [c.category, LEVEL_LABEL[c.level] || c.level, c.instructorName].filter(Boolean).join(' · ');
  const base = (c) => ({ id: `course-${c.id}`, icon: 'book-open', type: 'Khoá học', title: c.title, subtitle: meta(c), keywords: `${c.description || ''} ${(c.topics || []).join(' ')}` });
  const published = data.published;
  if (role === 'learner') {
    const owned = new Set(data.enrolled.map((c) => c.id));
    return [
      ...published.filter((c) => owned.has(c.id)).map((c) => ({ ...base(c), href: `/learn/${c.id}`, badge: 'Đang học', rank: -1 })),
      // enrolled but no longer listed (hidden by an admin) still opens from the learner's own list
      ...data.enrolled.filter((c) => !published.some((p) => p.id === c.id)).map((c) => ({ id: `course-${c.id}`, icon: 'book-open', type: 'Khoá học', title: c.title, subtitle: '', href: `/learn/${c.id}`, badge: 'Đang học', rank: -1 })),
      ...published.filter((c) => !owned.has(c.id)).map((c) => ({ ...base(c), href: `/courses/${c.slug}` })),
    ];
  }
  if (role === 'lecturer') {
    const mine = new Set(data.mine.map((c) => c.id));
    return [
      ...data.mine.map((c) => ({ ...base(c), href: `/teach/courses/${c.id}`, badge: courseStatusLabel(c.status), rank: -1 })),
      ...published.filter((c) => !mine.has(c.id)).map((c) => ({ ...base(c), href: `/courses/${c.slug}` })),
    ];
  }
  return published.map((c) => ({ ...base(c), href: `/courses/${c.slug}` }));
}

function lessonItems(role, data) {
  if (role === 'learner') {
    return data.enrolled.flatMap((c) => (c.lessons || []).map((l) => ({
      id: `lesson-${c.id}-${l.id}`, icon: 'file-text', type: 'Bài học', title: l.title, subtitle: c.title, href: `/learn/${c.id}/${l.id}`,
    })));
  }
  if (role !== 'lecturer') return [];
  return data.lessons.map((l) => ({
    id: `lesson-${l.courseId}-${l.id}`, icon: 'file-text', type: 'Bài học', title: l.title,
    subtitle: `${l.courseTitle} · ${l.chapterTitle}`, href: `/teach/courses/${l.courseId}/content`,
  }));
}

function lecturerItems(data) {
  const lessonTitle = (x) => [x.lessonTitle, x.courseTitle].filter(Boolean).join(' · ');
  const grading = data.submissions.map((s) => ({
    id: `sub-${s.id}`, icon: 'clipboard-check', type: 'Bài nộp', badge: 'Chờ chấm',
    title: s.studentName, subtitle: lessonTitle(s), keywords: 'cham bai bai nop', href: `/teach/grading/${s.id}`,
  }));
  const questions = data.questions.map((q) => ({
    id: `qa-${q.id}`, icon: 'message-circle', type: 'Câu hỏi', badge: q.status === 'unanswered' ? 'Chưa trả lời' : 'Đã trả lời',
    title: q.body, subtitle: `${q.authorName} · ${lessonTitle(q)}`, keywords: 'hoi dap cau hoi',
    href: `/teach/questions?status=${q.status === 'unanswered' ? 'unanswered' : 'answered'}&id=${encodeURIComponent(q.id)}`,
  }));
  return [{ id: 'grading', label: 'Bài cần chấm', items: grading }, { id: 'questions', label: 'Câu hỏi của học viên', items: questions }];
}

/** The learner's own orders (code, courses) → the profile's transactions tab. */
function learnerItems(data) {
  const orders = data.orders.map((o) => ({
    id: `my-order-${o.id}`, icon: 'receipt', type: 'Đơn hàng', badge: orderStatusLabel(o.status),
    title: o.code, subtitle: `${o.items.map((i) => i.title).join(', ')} · ${Codi.fmt.vnd(o.totalAmount)}`, keywords: 'don hang giao dich bien lai', href: '/profile?tab=transactions',
  }));
  return [{ id: 'my-orders', label: 'Đơn hàng của tôi', items: orders }];
}

// Users and vouchers still come from the transitional store (no list route in the backend contract yet).
function adminItems(data) {
  const db = Codi.db();
  const users = db.users.map((u) => ({
    id: `user-${u.id}`, icon: 'user', type: ROLE_LABEL[u.role] || 'Người dùng', badge: u.status === 'inactive' ? 'Vô hiệu hoá' : null,
    title: u.name, subtitle: u.email, href: `/admin/users?q=${encodeURIComponent(u.email)}`,
  }));
  const orders = data.adminOrders.map((o) => ({
    id: `order-${o.id}`, icon: 'receipt', type: 'Đơn hàng', badge: o.needsReconciliation ? 'Cần đối soát' : orderStatusLabel(o.status),
    title: o.code, subtitle: `${o.buyerName} · ${Codi.fmt.vnd(o.totalAmount)}`, keywords: `${o.buyerEmail || ''} ${o.coursesText || ''}`,
    href: `/admin/orders?range=all&id=${encodeURIComponent(o.id)}`,
  }));
  const vouchers = db.vouchers.map((v) => ({
    id: `voucher-${v.id}`, icon: 'ticket', type: 'Voucher', badge: v.active ? 'Đang bật' : 'Đã tắt',
    title: v.code, subtitle: v.type === 'percent' ? `Giảm ${v.value}%` : `Giảm ${Codi.fmt.vnd(v.value)}`, keywords: 'voucher ma giam gia', href: '/admin/vouchers',
  }));
  const pending = data.pendingReviews.map((c) => ({
    id: `review-${c.id}`, icon: 'clipboard-check', type: 'Chờ duyệt', badge: 'Chờ duyệt',
    title: c.title, subtitle: c.instructorName, keywords: 'duyet xuat ban', href: `/admin/publication?tab=pending&id=${encodeURIComponent(c.id)}`,
  }));
  return [
    { id: 'review', label: 'Khoá học chờ duyệt', items: pending },
    { id: 'users', label: 'Người dùng', items: users, more: (q, n) => ({ title: `Xem tất cả ${n} người dùng khớp “${q}”`, href: `/admin/users?q=${encodeURIComponent(q)}` }) },
    { id: 'orders', label: 'Đơn hàng', items: orders, more: (q, n) => ({ title: `Xem tất cả ${n} đơn hàng khớp “${q}”`, href: `/admin/orders?range=all&q=${encodeURIComponent(q)}` }) },
    { id: 'vouchers', label: 'Voucher', items: vouchers },
  ];
}

function actionItems(role, query) {
  const dark = Codi.theme ? Codi.theme.resolved() === 'dark' : false;
  const list = [{
    id: 'act-theme', icon: dark ? 'sun' : 'moon', type: 'Hành động', title: `Đổi giao diện sang ${dark ? 'sáng' : 'tối'}`,
    keywords: 'doi giao dien sang toi theme dark light che do hien thi', run: () => Codi.theme && Codi.theme.set(dark ? 'light' : 'dark'),
  }];
  if (role !== 'guest') list.push({ id: 'act-logout', icon: 'log-out', type: 'Hành động', title: 'Đăng xuất', keywords: 'dang xuat logout sign out thoat', run: () => endSession() });
  const ai = query.trim() ? {
    id: 'act-ai', icon: 'sparkles', type: 'AI', title: `Hỏi AI Codi: ${query.trim()}`, subtitle: 'Mở AI tư vấn với câu hỏi này',
    href: `/ai?prompt=${encodeURIComponent(query.trim())}`, always: true,
  } : null;
  return { list, ai };
}

/** Grouped results for the query. Each group: { id, label, items }. */
function buildGroups(role, query, data) {
  const tokens = tokensOf(query);
  const full = tokens.join(' ');
  const pages = pagesFor(role).map((p) => ({ ...p, id: `page-${p.href}`, type: 'Trang' }));
  if (!tokens.length) {
    const recent = readRecent().map((r) => ({ ...r, id: `recent-${r.href}`, icon: r.icon || 'clock', type: r.type || 'Gần đây' }));
    const recentHrefs = new Set(recent.map((r) => r.href));
    return [
      { id: 'recent', label: 'Tìm gần đây', items: recent, recent: true },
      { id: 'suggest', label: 'Gợi ý', items: pages.filter((p) => !recentHrefs.has(p.href)).slice(0, PER_GROUP) },
    ].filter((g) => g.items.length);
  }
  const { list: actions, ai } = actionItems(role, query);
  const raw = [
    { id: 'courses', label: 'Khoá học', items: courseItems(role, data), more: (q, n) => ({ title: `Xem tất cả ${n} khoá học khớp “${q}”`, href: `/courses?q=${encodeURIComponent(q)}` }) },
    ...(role === 'learner' ? learnerItems(data) : []),
    { id: 'lessons', label: 'Bài học', items: lessonItems(role, data) },
    ...(role === 'lecturer' ? lecturerItems(data) : []),
    ...(role === 'admin' ? adminItems(data) : []),
    { id: 'pages', label: 'Trang', items: pages },
    { id: 'actions', label: 'Hành động', items: actions },
  ];
  const ranked = raw.map((g, order) => {
    const hits = [];
    g.items.forEach((it, i) => { const s = score(it, tokens, full); if (s !== null) hits.push({ it, s: s + (it.rank || 0) * 0.5, i }); });
    hits.sort((a, b) => a.s - b.s || a.i - b.i);
    return { ...g, order, total: hits.length, best: hits.length ? hits[0].s : Infinity, items: hits.slice(0, PER_GROUP).map((h) => h.it) };
  }).filter((g) => g.items.length);
  ranked.sort((a, b) => a.best - b.best || a.order - b.order);
  ranked.forEach((g) => {
    if (g.more && g.total > PER_GROUP) {
      const m = g.more(query.trim(), g.total);
      g.items.push({ id: `${g.id}-all`, icon: 'search', type: g.label, title: m.title, href: m.href });
    }
  });
  if (ai) ranked.push({ id: 'ai', label: 'Hỏi AI', items: [ai] });
  return ranked;
}

// ───────────────────────── trigger ─────────────────────────
export function SearchTrigger({ compact = false }) {
  if (compact) {
    return (
      <button type="button" className="btn btn-ghost btn-icon header-icon-btn hd-search-icon" onClick={openSearch}
        aria-haspopup="dialog" aria-label={`Tìm kiếm (${SHORTCUT_LABEL})`} title={`Tìm kiếm (${SHORTCUT_LABEL})`}>
        <Icon name="search" />
      </button>
    );
  }
  return (
    <button type="button" className="hd-search" onClick={openSearch} aria-haspopup="dialog" aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}>
      <Icon name="search" className="icon-sm" />
      <span className="hd-search-text">Tìm khoá học, bài học, trang…</span>
      <kbd className="hd-kbd" aria-hidden="true">{SHORTCUT_LABEL}</kbd>
    </button>
  );
}

// ───────────────────────── dialog ─────────────────────────
const isEditable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest('[contenteditable="true"], .cm-editor, .monaco-editor'));
const otherModalOpen = () => !!document.querySelector('.overlay:not(.overlay-docked)');

function SearchDialog({ onClose }) {
  useCodi();
  const role = Codi.role();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [, setRecentRev] = useState(0); // bumped after clearing history to re-read it
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const uid = useId().replace(/:/g, '');
  const ids = { title: `gs-title-${uid}`, input: `gs-input-${uid}`, list: `gs-list-${uid}`, hint: `gs-hint-${uid}` };

  const data = useSearchData(role);
  const groups = buildGroups(role, query, data); // cheap (a few hundred records); recomputed on every store change
  const flat = groups.flatMap((g) => g.items);
  const tokens = tokensOf(query);
  const optionId = (i) => `gs-opt-${uid}-${i}`;
  const safeActive = flat.length ? Math.min(active, flat.length - 1) : -1;
  const realHits = groups.filter((g) => g.id !== 'ai').reduce((n, g) => n + g.items.length, 0);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);
  useEffect(() => {
    if (safeActive < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`#${optionId(safeActive)}`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [safeActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (item) => {
    if (!item) return;
    if (item.href && !item.run) pushRecent(item);
    onClose();
    if (item.run) {
      try { item.run(); } catch { Codi.ui.toast('Không thực hiện được thao tác. Vui lòng thử lại.', { type: 'danger' }); }
    } else if (item.href) Codi.go(item.href);
  };

  const onKeyDown = (e) => {
    const move = (to) => { e.preventDefault(); if (flat.length) setActive((to + flat.length) % flat.length); };
    if (e.key === 'ArrowDown') move(safeActive + 1);
    else if (e.key === 'ArrowUp') move(safeActive - 1);
    else if (e.key === 'Home' && e.ctrlKey) move(0);
    else if (e.key === 'End' && e.ctrlKey) move(flat.length - 1);
    else if (e.key === 'Enter') { e.preventDefault(); if (!e.nativeEvent.isComposing) choose(flat[safeActive]); }
    else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (query) setQuery(''); else onClose();
    }
  };
  // Tab stays inside the dialog (input ↔ the dialog's buttons).
  const onTrap = (e) => {
    if (e.key === 'Escape' && e.target !== inputRef.current) { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const items = Array.from(e.currentTarget.querySelectorAll('input, button:not([disabled]), [tabindex="0"]'));
    if (!items.length) return;
    const first = items[0]; const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const clearRecent = () => { writeRecent([]); setRecentRev((x) => x + 1); inputRef.current && inputRef.current.focus(); };

  let index = -1;
  const status = !tokens.length ? 'Nhập từ khoá để tìm.' : data.loading ? 'Đang tải khoá học…' : realHits ? `${realHits} kết quả.` : `Không có kết quả cho “${query.trim()}”.`;

  return (
    <div className="gs-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gs-dialog" role="dialog" aria-modal="true" aria-labelledby={ids.title} onKeyDown={onTrap}>
        <h2 id={ids.title} className="sr-only">Tìm kiếm trên Codi</h2>
        <div className="gs-field">
          <Icon name="search" className="gs-field-icon" />
          <label htmlFor={ids.input} className="sr-only">Tìm khoá học, bài học, trang</label>
          <input ref={inputRef} id={ids.input} className="gs-input" type="text" role="combobox" autoComplete="off" spellCheck={false}
            aria-expanded={flat.length > 0} aria-controls={ids.list} aria-autocomplete="list" aria-describedby={ids.hint}
            aria-activedescendant={safeActive >= 0 ? optionId(safeActive) : undefined}
            placeholder="Tìm khoá học, bài học, trang…" value={query} maxLength={120}
            onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown} />
          <button type="button" className="gs-close" onClick={onClose} aria-label="Đóng tìm kiếm"><kbd className="hd-kbd" aria-hidden="true">Esc</kbd><Icon name="x" className="icon-sm gs-close-x" /></button>
        </div>
        <div className="gs-body" ref={listRef} tabIndex={0} role="region" aria-label="Kết quả tìm kiếm (cuộn)">
          <p className="sr-only" role="status" aria-live="polite">{status}</p>
          {data.failed && <p className="gs-empty-body" role="alert">Không tải được khoá học và bài học từ máy chủ. Đóng rồi mở lại để thử lại.</p>}
          {tokens.length > 0 && realHits === 0 && !data.loading && (
            <div className="gs-empty">
              <span className="gs-empty-icon" aria-hidden="true"><Icon name="search" /></span>
              <p className="gs-empty-title">Không tìm thấy “{query.trim()}”</p>
              <p className="gs-empty-body">Thử từ khoá ngắn hơn hoặc tên khoá học, bài học, trang. Bạn cũng có thể hỏi AI Codi bên dưới.</p>
            </div>
          )}
          {!tokens.length && groups.some((g) => g.recent) && (
            <div className="gs-recent-tools"><button type="button" className="gs-link-btn" onClick={clearRecent}>Xoá lịch sử tìm kiếm</button></div>
          )}
          <div id={ids.list} role="listbox" aria-label="Kết quả tìm kiếm" className="gs-list">
            {groups.map((g) => (
              <div key={g.id} role="group" aria-labelledby={`gs-g-${uid}-${g.id}`} className="gs-group">
                <div id={`gs-g-${uid}-${g.id}`} className="gs-group-label" role="presentation">{g.label}</div>
                {g.items.map((it) => {
                  index += 1;
                  const i = index;
                  const on = i === safeActive;
                  return (
                    <div key={it.id} id={optionId(i)} role="option" aria-selected={on} className={`gs-option${on ? ' is-active' : ''}`}
                      onMouseMove={() => { if (!on) setActive(i); }} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(it)}>
                      <span className="gs-option-icon" aria-hidden="true"><ShellIcon name={it.icon || 'circle'} className="icon-sm" /></span>
                      <span className="gs-option-text">
                        <span className="gs-option-title"><Highlight text={it.title} tokens={tokens} /></span>
                        {it.subtitle && <span className="gs-option-sub"><Highlight text={it.subtitle} tokens={tokens} /></span>}
                      </span>
                      {it.badge && <span className="gs-option-badge">{it.badge}</span>}
                      <span className="gs-option-type">{it.type}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="gs-foot" id={ids.hint}>
          <span><kbd className="hd-kbd"><Icon name="arrow-up" className="gs-kbd-icon" /><span className="sr-only">Mũi tên lên</span></kbd><kbd className="hd-kbd"><Icon name="arrow-down" className="gs-kbd-icon" /><span className="sr-only">Mũi tên xuống</span></kbd> chọn</span>
          <span><kbd className="hd-kbd">Enter</kbd> mở</span>
          <span><kbd className="hd-kbd">Esc</kbd> đóng</span>
        </div>
      </div>
    </div>
  );
}

/** Shortcut owner + dialog host. Mount exactly once (the app header does). */
export function GlobalSearch() {
  const open = useOpen();

  useEffect(() => {
    const onKey = (e) => {
      const key = (e.key || '').toLowerCase();
      const combo = key === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target);
      if (!combo && !slash) return;
      if (isOpen) { if (combo) { e.preventDefault(); setOpen(false); } return; }
      if (otherModalOpen()) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      const el = returnTarget;
      // a route change moves focus to the new page's h1; otherwise go back to the element that opened search
      setTimeout(() => {
        const moved = document.activeElement && document.activeElement !== document.body;
        if (!moved && el && el.focus && document.contains(el)) el.focus();
      }, 0);
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(<SearchDialog onClose={() => setOpen(false)} />, document.body);
}
