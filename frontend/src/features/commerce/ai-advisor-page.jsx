/**
 * S17 AI course advisor '/ai' (Flow L13), matching the real app's components/ai/ai-advisor-view.tsx; answers come
 * from the backend. One column, two modes on one route:
 * - Empty: header (title, catalogue caption, personal subtitle) → large composer → guest sign-in line →
 *   "Codi đang hiểu về bạn" → "Thử hỏi" suggestions → AI caveat.
 * - Conversation: header with "Cuộc trò chuyện mới", intake row, the thread, and a composer docked to the bottom
 *   of the window with a jump-to-latest button above it.
 * Guided intake asks only what is missing (every question skippable); structured answers carry course cards,
 * a comparison table or a suggested order; per-answer 👍/👎 feedback; follow-up chips.
 *
 * Data: the shared Tutor (Codi develop): POST /api/ai/chat streams the answer (general context; course cards and the
 * comparison table come from its search_courses / compare_courses tool outputs), GET/PATCH /api/ai/intake holds the
 * signed-in learner's intake (their goal draft), PATCH /api/ai/chats/:id records votes on stored chats. The catalogue
 * (/api/courses) and the current course (/api/learner/overview) feed the empty state and deep links. Guests have no
 * stored chat: their recent turns and intake go along with each question, and they cannot vote. The thread lives in
 * this tab (sessionStorage). scenario.aiAssistant forces the async states without calling the model:
 * thinking (stays until "Dừng") | ratelimit | error; ok asks the backend (a real 429 / failure shows the same states).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { api } from '../../lib/api';
import { newChatId, streamAiChat } from '../../lib/ai-chat';
import { Alert, Icon, Md, Thumb } from '../../components/ui/primitives';
import { addToCart, enrollFree, levelLabel, useOwnership } from './commerce-api';

const fmt = Codi.fmt;
const QUESTION_MAX = 2000; // the backend keeps up to 4000 characters of each earlier turn
const STOPPED_TEXT = 'Bạn đã dừng câu trả lời này.';

// ───────────────────────── state & helpers ─────────────────────────
// Intake + thread for this tab, per signed-in user (or guest). Changes re-render through useAdvisor().
const blank = () => ({ goal: null, level: null, hoursPerWeek: null, skipped: [], chat: { id: null, messages: [], busy: false, pending: null } });
const storageKey = () => 'codi-advisor:' + (Codi.session.user ? Codi.session.user.id : 'guest');
let state = null;
let stateKey = null;
let version = 0;
const subs = new Set();
function store() {
  const key = storageKey();
  if (!state || stateKey !== key) {
    stateKey = key;
    try { state = { ...blank(), ...(JSON.parse(sessionStorage.getItem(key) || 'null') || {}) }; } catch { state = blank(); }
  }
  return state;
}
function save() {
  try { sessionStorage.setItem(stateKey, JSON.stringify(state)); } catch { /* storage blocked: thread lasts for this page */ }
  version += 1;
  subs.forEach((f) => f());
}
const useAdvisor = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version);

// Page context (catalogue, current course, saved intake), shared with the action handlers below.
let ctx = { user: null, currentCourse: null, catalog: [], savedIntake: null };

// Intake answers are stored as the onboarding goal draft (lib/learner-intake-contract.ts); the chips show its labels.
const INTAKE_VALUES = {
  goal: { 'Làm được dự án': 'project', 'Hoàn thành khoá học': 'finish', 'Chuẩn bị phỏng vấn': 'interview' },
  level: { 'Mới bắt đầu': 'new', 'Có kinh nghiệm cơ bản': 'basic', 'Trung cấp': 'solid' },
  hours: { '< 5 giờ': 2, '5-10 giờ': 5, '> 10 giờ': 10 },
};
const intakeLabel = (key, value) => Object.keys(INTAKE_VALUES[key]).find((label) => INTAKE_VALUES[key][label] === value) || null;
/** Saves one intake answer for a signed-in learner (null clears it); guests keep it in this tab only. */
function saveIntake(key, label) {
  if (!Codi.session.user) return;
  const value = label == null ? null : INTAKE_VALUES[key][label];
  if (value === undefined) return;
  api.patch('/api/ai/intake', { [key]: value }).catch((e) => Codi.ui.toast('Chưa lưu được thông tin của bạn: ' + e.message, { type: 'danger' }));
}

/** Catalogue, the course the learner is studying and their saved intake. Only the catalogue is required. */
async function loadContext(signal) {
  const signedIn = !!Codi.session.user;
  const optional = (url) => (signedIn ? api.get(url, { signal }).catch((e) => { if (e && e.name === 'AbortError') throw e; return null; }) : Promise.resolve(null));
  const [list, intake, overview] = await Promise.all([api.get('/api/courses', { signal }), optional('/api/ai/intake'), optional('/api/learner/overview')]);
  const draft = intake && intake.draft;
  const cur = overview && overview.courses && overview.courses.find((c) => c.id === overview.continueCourseId);
  return {
    user: Codi.session.user || null,
    catalog: (list && list.courses) || [],
    currentCourse: cur ? { id: cur.id, slug: cur.slug, title: cur.title, doneLessons: cur.done, totalLessons: cur.total } : null,
    savedIntake: draft ? { goal: intakeLabel('goal', draft.goal), level: intakeLabel('level', draft.level), hoursPerWeek: intakeLabel('hours', draft.hours) } : null,
  };
}
function usePageContext(userId) {
  const [st, setSt] = useState({ data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setSt((s) => ({ ...s, error: null }));
    loadContext(c.signal)
      .then((data) => { if (!c.signal.aborted) setSt({ data, error: null }); })
      .catch((error) => { if (!c.signal.aborted && !(error && error.name === 'AbortError')) setSt((s) => ({ ...s, error })); });
    return () => c.abort();
  }, [userId, tick]);
  return { ...st, reload: () => setTick((t) => t + 1) };
}

// Streaming: the answer text shows as it arrives (POST /api/ai/chat); only the final text is persisted.
// `revealId` invalidates a running answer when the learner stops it or starts a new chat.
let live = null; // { id, text }
let revealId = 0;
const liveSubs = new Set();
const setLive = (v) => { live = v; liveSubs.forEach((f) => f()); };
const useLive = () => useSyncExternalStore((f) => { liveSubs.add(f); return () => liveSubs.delete(f); }, () => live);
let inflight = null; // AbortController of the running POST /api/ai/chat

// ───────────────────────── asking ─────────────────────────
// The question that triggered the intake is kept in chat.pending and answered as soon as the last intake chip
// is picked or skipped.
const INTAKE = [
  { key: 'goal', text: 'Mục tiêu của bạn là gì?', options: ['Làm được dự án', 'Hoàn thành khoá học', 'Chuẩn bị phỏng vấn'] },
  { key: 'level', text: 'Trình độ hiện tại của bạn?', options: ['Mới bắt đầu', 'Có kinh nghiệm cơ bản', 'Trung cấp'] },
  { key: 'hours', text: 'Bạn có thể dành bao nhiêu giờ/tuần để học?', options: ['< 5 giờ', '5-10 giờ', '> 10 giờ'] },
];
const EDIT_INTAKE = [
  { key: 'goal', text: 'Mục tiêu của bạn?', options: ['Làm được dự án', 'Hoàn thành khoá học', 'Chuẩn bị phỏng vấn'] },
  { key: 'level', text: 'Trình độ hiện tại?', options: ['Mới bắt đầu', 'Có kinh nghiệm cơ bản', 'Trung cấp'] },
  { key: 'hours', text: 'Thời gian/tuần?', options: ['< 5 giờ', '5-10 giờ', '> 10 giờ'] },
];
const intakeValue = (intake, key) => (key === 'goal' ? intake.goal : key === 'level' ? intake.level : intake.hoursPerWeek);
const missingIntake = (intake) => INTAKE.filter((q) => !intakeValue(intake, q.key) && !(intake.skipped || []).includes(q.key));

/**
 * Guests only (signed-in chats are stored on the server): recent turns for follow-ups, without the question being
 * asked now or stopped answers, led by the intake the guest gave (the server reads a signed-in learner's own).
 */
function guestHistory(intake, question) {
  const turns = intake.chat.messages.filter((m) => (m.role === 'user' || (m.role === 'ai' && !m.streaming && !m.stopped)) && m.text);
  if (turns.length && turns[turns.length - 1].role === 'user' && turns[turns.length - 1].text === question) turns.pop();
  const known = [intake.goal, intake.level, intake.hoursPerWeek && `${intake.hoursPerWeek}/tuần`].filter(Boolean);
  const out = turns.slice(-11).map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', text: String(m.text).slice(0, 4000) }));
  return known.length ? [{ role: 'user', text: `Hồ sơ học viên: ${known.join(', ')}` }, ...out] : out;
}
/** Course cards (search_courses, newest first, no duplicates) and the comparison table (compare_courses) of a turn. */
function answerBlocks(tools) {
  const seen = new Set();
  const courses = [];
  for (const r of (tools.search_courses || []).slice().reverse()) {
    for (const c of (r.output && r.output.courses) || []) {
      if (seen.has(c.id) || courses.length >= 6) continue;
      seen.add(c.id); courses.push(c);
    }
  }
  const tables = (tools.compare_courses || []).map((r) => r.output).filter((t) => t && Array.isArray(t.headers) && t.rows && t.rows.length);
  return { courses, table: tables.length ? tables[tables.length - 1] : null };
}

function finishWith(m, patch) {
  Object.assign(m, patch, { streaming: false });
  store().chat.busy = false;
  inflight = null;
  save();
}

function askAI(prompt) {
  const intake = store();
  const { messages } = intake.chat;
  if (intake.chat.busy) return;
  if (prompt) messages.push({ role: 'user', text: prompt, at: new Date().toISOString() });
  const missing = missingIntake(intake);
  if (prompt && missing.length) {
    intake.chat.pending = prompt;
    missing.forEach((q) => { if (!messages.some((m) => m.role === 'intake-question' && m.key === q.key)) messages.push({ role: 'intake-question', canSkip: true, ...q }); });
    save();
    return;
  }
  const q = prompt || intake.chat.pending; intake.chat.pending = null;
  if (!q) { save(); return; }
  const flag = Codi.state.scenario.aiAssistant;
  if (flag === 'ratelimit') { messages.push({ role: 'ratelimit', question: q }); save(); return; }
  const signedIn = !!Codi.session.user;
  const history = signedIn ? undefined : guestHistory(intake, q);
  if (!intake.chat.id) intake.chat.id = newChatId();
  const chatId = intake.chat.id;
  intake.chat.busy = true;
  const m = { role: 'ai', text: '', streaming: true, id: `msg-${Date.now()}` };
  messages.push(m);
  save();
  if (flag === 'thinking') return; // stays in the thinking state; "Dừng" ends it
  if (flag === 'error') {
    setTimeout(() => { if (m.streaming) finishWith(m, { role: 'error', question: q }); }, 1200);
    return;
  }
  const ctrl = new AbortController();
  inflight = ctrl;
  const id = ++revealId;
  const current = () => id === revealId && !ctrl.signal.aborted; // false once stopped or replaced by a new chat
  const onText = (t) => {
    if (!current()) return;
    if (m.streaming) { m.streaming = false; save(); } // thinking → the text as it arrives
    setLive({ id: m.id, text: t });
  };
  const context = { kind: 'general', label: 'Tư vấn khoá học', href: '/ai' };
  streamAiChat({ chatId, context, text: q, history, signal: ctrl.signal, onText }).then((turn) => {
    if (!current()) return;
    setLive(null);
    if (!turn.text) { finishWith(m, { role: 'error', question: q }); return; }
    const { courses, table } = answerBlocks(turn.tools);
    finishWith(m, {
      text: turn.text, courses, table, order: [], followups: [], noMatch: false,
      // Votes go to the stored chat message; guests' chats are not stored.
      logId: signedIn ? turn.messageId : null, chatId, vote: null,
    });
  }).catch((e) => {
    if (!current() || (e && e.name === 'AbortError')) return;
    setLive(null);
    finishWith(m, { role: e.status === 429 ? 'ratelimit' : 'error', question: q });
  });
}

// After an intake chip: answer the waiting question once nothing is missing.
function afterIntake() {
  const intake = store();
  if (!missingIntake(intake).length && intake.chat.pending) askAI(null); else save();
}

// ───────────────────────── actions ─────────────────────────
function answerIntake(q, a) {
  const intake = store();
  if (q === 'goal') intake.goal = a;
  else if (q === 'level') intake.level = a;
  else if (q === 'hours') intake.hoursPerWeek = a;
  intake.skipped = (intake.skipped || []).filter((k) => k !== q);
  saveIntake(q, a);
  // the answered question turns into a normal user reply in the thread
  const i = intake.chat.messages.findIndex((m) => m.role === 'intake-question' && m.key === q);
  if (i >= 0) intake.chat.messages.splice(i, 1, { role: 'user', text: a, at: new Date().toISOString() });
  afterIntake();
}
function skipIntake(q) {
  const intake = store();
  intake.skipped = (intake.skipped || []).concat(q); // not asked again until the learner edits the summary
  intake.chat.messages = intake.chat.messages.filter((m) => !(m.role === 'intake-question' && m.key === q));
  afterIntake();
}
/**
 * "Dừng": while waiting, the answer is dropped (the real app's stopped message). While the text is being revealed,
 * what was already shown stays and the rest is cut, so the learner keeps what they read.
 */
function stopAnswer() {
  const intake = store();
  if (inflight) { inflight.abort(); inflight = null; }
  const waiting = intake.chat.messages.find((x) => x.streaming);
  if (waiting) Object.assign(waiting, { streaming: false, text: STOPPED_TEXT, stopped: true });
  if (live) {
    const shown = intake.chat.messages.find((x) => x.id === live.id);
    const partial = live.text.trim();
    revealId += 1;
    setLive(null);
    if (shown) {
      Object.assign(shown, {
        text: partial || STOPPED_TEXT, stopped: true, partial: !!partial,
        courses: [], table: null, order: [], followups: [], logId: null,
      });
    }
  }
  intake.chat.busy = false;
  save();
}
function editIntake() {
  const intake = store();
  intake.skipped = [];
  for (const q of EDIT_INTAKE) {
    if (!intake.chat.messages.some((m) => m.role === 'intake-question' && m.key === q.key)) {
      intake.chat.messages.push({ role: 'intake-question', key: q.key, text: q.text, options: q.options, canSkip: true });
    }
  }
  save();
}
function clearIntake(field) {
  const intake = store();
  if (field === 'goal') intake.goal = null;
  else if (field === 'level') intake.level = null;
  else if (field === 'hours') intake.hoursPerWeek = null;
  saveIntake(field, null);
  save();
}
function newChat() {
  const intake = store();
  if (inflight) { inflight.abort(); inflight = null; }
  revealId += 1;
  if (live) setLive(null);
  intake.chat.messages = [];
  intake.chat.id = null;
  intake.chat.busy = false;
  intake.chat.pending = null;
  save();
}

// 👎 reasons the stored chat accepts (lib/ai-tutor-contract.ts TUTOR_DOWN_REASONS); other reasons stay in this tab.
const SERVER_REASONS = ['Chưa đúng', 'Khó hiểu', 'Lộ lời giải', 'Không liên quan bài'];
/** PATCH /api/ai/chats/:id vote for an answer of a stored (signed-in) chat; logId is the answer's message id. */
async function sendFeedback(m) {
  if (!m.logId || !m.chatId) return true;
  try {
    const reason = m.vote === 'down' && SERVER_REASONS.includes(m.reason) ? { reason: m.reason } : {};
    await api.patch(`/api/ai/chats/${encodeURIComponent(m.chatId)}`, { type: 'vote', messageId: m.logId, vote: m.vote || null, ...reason });
    return true;
  } catch (e) {
    Codi.ui.toast('Chưa gửi được phản hồi: ' + e.message, { type: 'danger' });
    return false;
  }
}
async function vote(i, v) {
  const m = store().chat.messages[i];
  if (!m) return;
  m.vote = m.vote === v ? null : v; m.reason = null;
  save();
  if (await sendFeedback(m) && m.vote === 'up') Codi.ui.toast('Cảm ơn phản hồi của bạn.');
}
async function giveReason(i, reason) {
  const m = store().chat.messages[i];
  if (!m) return;
  m.reason = reason;
  save();
  if (await sendFeedback(m)) Codi.ui.toast('Cảm ơn, góp ý của bạn giúp Codi trả lời tốt hơn.');
}
function retry(i) {
  const intake = store();
  const m = intake.chat.messages[i];
  if (!m || intake.chat.busy) return;
  intake.chat.messages.splice(i, 1);
  if (m.question) askAI(m.question); else save();
}
function addCart(c) {
  Codi.requireAuth(() => { addToCart(c); }, { reason: 'Đăng nhập để thêm khoá học vào giỏ', courseTitle: c.title });
}

// ───────────────────────── view pieces ─────────────────────────
function CourseCta({ course: c, own, pendingOrderId }) {
  const role = Codi.role();
  if (!own) return <span className="skeleton" style={{ display: 'inline-block', width: 120, height: 36 }} aria-hidden="true" />;
  if (own === 'owned') return <Link className="btn btn-secondary btn-sm" to={`/learn/${c.id}`}>Tiếp tục học</Link>;
  if (role === 'lecturer' || role === 'admin') return <Link className="btn btn-secondary btn-sm" to={`/courses/${c.slug}`}>Xem chi tiết</Link>;
  if (own === 'in-cart') return <Link className="btn btn-secondary btn-sm" to="/cart">Đã có trong giỏ · Xem giỏ hàng</Link>;
  if (own === 'pending-payment') {
    return <Link className="btn btn-secondary btn-sm" to={pendingOrderId ? `/checkout?order=${pendingOrderId}` : '/cart'}>Tiếp tục thanh toán</Link>;
  }
  if (!c.price) return <button type="button" className="btn btn-secondary btn-sm" onClick={() => enrollFree(c, { stay: true })}>Đăng ký miễn phí</button>;
  return <button type="button" className="btn btn-secondary btn-sm" onClick={() => addCart(c)}>Thêm vào giỏ</button>;
}

// Same quiet feedback row as the lesson tutor: 👍/👎, and after 👎 a one-tap reason.
// Advisor 👎 reasons (real lib/ai-advisor-contract.ts DOWN_VOTE_REASONS); the tutor keeps its own list.
const DOWN_REASONS = ['Sai trình độ', 'Không hợp mục tiêu', 'Thông tin khoá sai', 'Chưa đúng', 'Khó hiểu'];
function FeedbackRow({ m, i }) {
  return (
    <div className="ai-feedback">
      <button type="button" className="ai-feedback-btn" onClick={() => vote(i, 'up')} aria-pressed={m.vote === 'up'} aria-label="Câu trả lời hữu ích" title="Hữu ích"><Icon name="thumbs-up" className="icon-sm" /></button>
      <button type="button" className="ai-feedback-btn" onClick={() => vote(i, 'down')} aria-pressed={m.vote === 'down'} aria-label="Câu trả lời chưa tốt" title="Chưa tốt"><Icon name="thumbs-down" className="icon-sm" /></button>
      {m.vote === 'down' && !m.reason && (
        <span className="ai-feedback-reasons"><span className="xsmall muted">Chưa tốt ở điểm nào?</span>
          {DOWN_REASONS.map((r) => <button key={r} type="button" className="ai-chip ai-chip-sm" onClick={() => giveReason(i, r)}>{r}</button>)}
        </span>
      )}
      {m.reason && <span className="xsmall muted">Đã ghi nhận: {m.reason}</span>}
    </div>
  );
}

/** Course cards of one answer, with ownership-aware CTAs. */
function AnswerCourses({ courses }) {
  const ownership = useOwnership(courses);
  return (
    <ul className="ai-courses">{courses.map((c) => (
      <li key={c.id} className="ai-course">
        <Thumb course={c} small />
        <div className="ai-course-main">
          <span className="ai-course-head">
            <Link className="ai-course-title" to={`/courses/${c.slug}`}>{c.title}</Link>
            {c.isBestMatch && <span className="badge badge-accent">Phù hợp nhất</span>}
          </span>
          <span className="ai-course-meta">{levelLabel(c.level)} · {c.lessonCount} bài · <span className="ai-course-price">{c.price ? fmt.vnd(c.price) : 'Miễn phí'}</span></span>
          {c.reason && <span className="ai-course-why">{c.reason}</span>}
        </div>
        <div className="ai-course-cta">
          <CourseCta course={c} own={ownership.of(c.id)} pendingOrderId={ownership.pendingOrderId(c.id)} />
        </div>
      </li>
    ))}</ul>
  );
}

/** The assistant's side of the thread: Codi's mark beside the content. */
function Turn({ children, busy }) {
  return (
    <div className="ai-turn" aria-busy={busy ? 'true' : undefined}>
      <span className="ai-mark" aria-hidden="true"><Icon name="sparkles" className="icon-sm" /></span>
      <div className="ai-turn-body">{children}</div>
    </div>
  );
}

function Message({ m, i, liveText }) {
  if (m.role === 'user') return <div className="msg msg-user">{m.text}</div>;
  if (m.role === 'error') {
    return <Alert type="danger" title="Codi tạm thời không phản hồi" body="Câu hỏi chưa được trả lời. Bạn có thể thử lại hoặc tự xem danh mục khoá học."
      actions={<><button type="button" className="btn btn-secondary btn-sm" onClick={() => retry(i)}><Icon name="rotate-ccw" className="icon-sm" /> Thử lại</button><Link className="btn btn-ghost btn-sm" to="/courses">Xem danh mục</Link></>} />;
  }
  if (m.role === 'ratelimit') {
    return <Alert type="warn" title="Bạn đã hỏi quá nhiều trong thời gian ngắn" body="Đợi vài phút rồi thử lại."
      actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => retry(i)}><Icon name="rotate-ccw" className="icon-sm" /> Thử lại</button>} />;
  }
  if (m.role === 'intake-question') {
    return (
      <Turn>
        <div className="ai-ask" data-intake={m.key}>
          <p className="ai-ask-q">{m.text}</p>
          <div className="ai-chips" role="group" aria-label={m.text}>
            {m.options.map((opt) => <button key={opt} type="button" className="ai-chip" onClick={() => answerIntake(m.key, opt)}>{opt}</button>)}
            {m.canSkip && <button type="button" className="ai-chip is-quiet" onClick={() => skipIntake(m.key)}>Bỏ qua</button>}
          </div>
        </div>
      </Turn>
    );
  }
  if (m.streaming) {
    return (
      <Turn busy>
        <p className="ai-thinking-row"><span className="typing" aria-hidden="true"><i /><i /><i /></span>Codi đang suy nghĩ…</p>
      </Turn>
    );
  }
  if (liveText !== null) {
    return <Turn busy><div className="msg msg-ai msg-md is-streaming">{liveText ? <Md text={liveText} /> : <span className="ai-caret" aria-hidden="true" />}</div></Turn>;
  }
  if (m.stopped) {
    return (
      <Turn>
        <div className="msg msg-ai msg-md">
          {m.partial && <Md text={m.text} />}
          <p className="ai-stopped"><Icon name="x-circle" className="icon-sm" />{STOPPED_TEXT}</p>
        </div>
      </Turn>
    );
  }

  const courses = m.courses || [];
  return (
    <Turn>
      <div className="msg msg-ai msg-md">
        {m.text && <Md text={m.text} />}
        {m.table && (
          <div className="table-wrap ai-table"><table className="table"><caption className="sr-only">So sánh khoá học</caption>
            <thead><tr>{m.table.headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{m.table.rows.map((row, r) => <tr key={r}>{row.map((cell, k) => (k === 0 ? <th key={k} scope="row">{cell}</th> : <td key={k}>{cell}</td>))}</tr>)}</tbody>
          </table></div>
        )}
        {courses.length > 0 && <AnswerCourses courses={courses} />}
        {m.order && m.order.length > 0 && (
          <ol className="ai-order" aria-label="Thứ tự nên học">{m.order.map((o) => (
            <li key={o.id}><Link to={`/courses/${o.slug}`}>{o.title}</Link><span className="ai-course-why">{o.reason}</span></li>
          ))}</ol>
        )}
        <FeedbackRow m={m} i={i} />
        {m.followups && m.followups.length > 0 && (
          <div className="ai-chips ai-followups" role="group" aria-label="Hỏi tiếp">
            {m.followups.map((t) => <button key={t} type="button" className="ai-chip" onClick={() => askAI(t)}><Icon name="arrow-right" className="icon-sm" />{t}</button>)}
          </div>
        )}
      </div>
    </Turn>
  );
}

// "Codi đang hiểu về bạn": one quiet panel of removable chips + "Sửa"; hidden until something is known.
function IntakeRow() {
  const intake = store();
  const items = [['goal', intake.goal], ['level', intake.level], ['hours', intake.hoursPerWeek && `${intake.hoursPerWeek}/tuần`]].filter((x) => x[1]);
  if (!items.length) return null;
  return (
    <div className="ai-intake" role="group" aria-label="Codi đang hiểu về bạn">
      <span className="ai-intake-label">Codi đang hiểu về bạn</span>
      {items.map(([k, v]) => (
        <span key={k} className="ai-chip ai-chip-sm is-static">{v}<button type="button" onClick={() => clearIntake(k)} aria-label={`Bỏ “${v}”`}><Icon name="x" className="icon-sm" /></button></span>
      ))}
      <button type="button" className="btn-link" onClick={editIntake}>Sửa</button>
    </div>
  );
}

/**
 * Composer: a growing textarea. Enter sends, Shift + Enter breaks the line (ignored while an IME is composing,
 * so Vietnamese Telex input is never sent half-typed). While Codi answers, the send button becomes "Dừng".
 */
function Composer({ busy, big, draft, setDraft, autoFocus }) {
  const ref = useRef(null);
  const text = draft.trim();
  const fit = () => {
    const node = ref.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  };
  useEffect(fit, [draft]);
  useEffect(() => {
    // Keep typing after the thread opens; skip touch screens so the keyboard does not jump up.
    if (autoFocus && ref.current && window.matchMedia('(pointer: fine)').matches) ref.current.focus();
  }, [autoFocus]);
  const send = () => {
    if (!text || busy) return;
    askAI(text);
    setDraft('');
  };
  return (
    <form className={`ai-composer ${big ? 'is-big' : 'is-dock'}`} onSubmit={(e) => { e.preventDefault(); send(); }}>
      <label className="sr-only" htmlFor="advisor-q">Câu hỏi cho Codi</label>
      <textarea id="advisor-q" ref={ref} name="text" rows={1} className="ai-composer-input" maxLength={QUESTION_MAX}
        placeholder={big ? 'Ví dụ: Mình muốn làm web, nên học khoá nào trước?' : 'Hỏi tiếp…'}
        autoComplete="off" value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
        }} />
      <div className="ai-composer-actions">
        {big && <span className="ai-composer-hint" aria-hidden="true">Enter để gửi · Shift + Enter để xuống dòng</span>}
        {busy ? (
          <button type="button" className="btn btn-secondary ai-composer-send is-stop" onClick={stopAnswer} aria-label="Dừng câu trả lời" title="Dừng">
            <span className="ai-stop-glyph" aria-hidden="true" />
          </button>
        ) : (
          <button type="submit" className="btn btn-primary ai-composer-send" disabled={!text} aria-label="Gửi câu hỏi" title="Gửi (Enter)">
            <Icon name={big ? 'send' : 'arrow-up'} className="icon-sm" />{big && <span>Hỏi Codi</span>}
          </button>
        )}
      </div>
    </form>
  );
}

// The GitHub card triggers an action (connect / view analysis) instead of sending a chat prompt. It is shown only
// when the GitHub feature (Codi.github) is installed.
function suggestions(user, currentCourse) {
  const gh = Codi.github;
  const ghCard = user && gh ? (gh.isConnected?.()
    ? { icon: 'github', title: 'Xem lại phân tích GitHub của mình', desc: 'Codi gợi ý khoá dựa trên repo và ngôn ngữ của bạn', run: () => Codi.go('/profile?tab=nang-luc') }
    : { icon: 'github', title: 'Phân tích GitHub của mình', desc: 'Kết nối GitHub để Codi gợi ý khoá sát với kỹ năng', run: () => Codi.github?.openConnect?.({ returnTo: '/ai' }) }) : null;
  const base = [
    currentCourse
      ? { icon: 'route', title: `Học gì sau “${currentCourse.title}”?`, desc: 'Gợi ý khoá tiếp theo dựa trên khoá bạn đang học', prompt: `Sau ${currentCourse.title} nên học gì tiếp?` }
      : { icon: 'book-open', title: 'Mới bắt đầu học lập trình', desc: 'Nên học ngôn ngữ và khoá nào trước', prompt: 'Mình mới bắt đầu học lập trình, nên học gì trước?' },
    { icon: 'search', title: 'Tìm khoá cho mục tiêu', desc: 'Làm dự án, đổi nghề hay chuẩn bị phỏng vấn', prompt: 'Dựa vào mục tiêu của tôi, nên học khoá nào?' },
    { icon: 'list', title: 'So sánh các khoá phù hợp', desc: 'Trình độ, số bài, học phí đặt cạnh nhau', prompt: 'So sánh các khoá học phù hợp với tôi' },
    user
      ? { icon: 'clock', title: 'Mình bị chậm tiến độ', desc: 'Cách lấy lại nhịp học mỗi tuần', prompt: 'Mình bị chậm tiến độ, nên làm gì?' }
      : { icon: 'git-branch', title: 'Lên lộ trình học', desc: 'Thứ tự các khoá để đi từ cơ bản đến dự án', prompt: 'Lộ trình học để trở thành fullstack developer theo thứ tự nào?' },
  ];
  if (ghCard) { base.splice(1, 0, ghCard); base.length = 4; }
  return base;
}

const CATALOG_NOTE = 'Codi chỉ gợi ý từ các khoá học đã xuất bản trên Codi.';
const CAVEAT = 'AI có thể trả lời sai. Hãy xem kỹ trang chi tiết khoá học trước khi mua.';

// Real AiAdvisorSkeleton while the /api/ai context loads.
function AdvisorSkeleton() {
  return (
    <div className="page ai-page is-empty" aria-busy="true"><div className="ai-col">
      <div className="ai-head-text">
        <div className="skeleton skeleton-line" style={{ width: '50%', height: 32 }} />
        <div className="skeleton skeleton-line" style={{ width: '70%' }} />
      </div>
      <div className="skeleton" style={{ height: 112, borderRadius: 12 }} />
      <div className="skeleton" style={{ height: 176, borderRadius: 12 }} />
      <p className="sr-only" role="status">Đang tải trợ lý AI…</p>
    </div></div>
  );
}

/** Watches whether the end of the thread is on screen, for auto-follow and the "jump to latest" button. */
function useAtBottom(ref, active) {
  const [atBottom, setAtBottom] = useState(true);
  useEffect(() => {
    const node = ref.current;
    if (!active || !node || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setAtBottom(entry.isIntersecting), { rootMargin: '0px 0px -40px 0px' });
    io.observe(node);
    return () => io.disconnect();
  }, [ref, active]);
  return atBottom;
}

const scrollToEnd = (smooth) => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth && !reduce ? 'smooth' : 'auto' });
};

// ───────────────────────── page ─────────────────────────
export default function AiAdvisorPage({ query }) {
  useCodi();
  useAdvisor();
  const navigate = useNavigate();
  const context = usePageContext(Codi.session.user ? Codi.session.user.id : null);
  const loaded = !!context.data || !!context.error;
  if (context.data) ctx = context.data;
  const liveMsg = useLive();
  const intake = store();
  const user = Codi.currentUser();
  const currentCourse = context.data ? context.data.currentCourse : null;
  const { messages, busy } = intake.chat;
  const [draft, setDraft] = useState(() => (query.topic ? `Mình muốn tìm hiểu về ${query.topic}` : ''));
  const endRef = useRef(null);
  const chatting = messages.length > 0;
  const atBottom = useAtBottom(endRef, chatting && loaded);
  const followRef = useRef(true);
  followRef.current = atBottom;
  const lastRole = chatting ? messages[messages.length - 1].role : null;

  useEffect(() => {
    const chat = store().chat;
    // A reload during an answer leaves busy set with nothing in flight; recover so the composer is usable.
    if (chat.busy && !live && !inflight) {
      chat.messages = chat.messages.filter((m) => !m.streaming);
      chat.busy = false;
      save();
    }
  }, []);

  // The learner's saved intake (goal draft) seeds an empty intake once.
  useEffect(() => {
    const saved = context.data && context.data.savedIntake;
    const st = store();
    if (!saved || st.goal || st.level || st.hoursPerWeek) return;
    st.goal = saved.goal || null; st.level = saved.level || null; st.hoursPerWeek = saved.hoursPerWeek || null;
    save();
  }, [context.data]);

  // Deep links (real app/ai/page.tsx): ?prompt= sends the question; ?action=add-cart|enroll-free&courseId= replays
  // the gated action (after sign-in when needed). Handled params are removed from the URL.
  useEffect(() => {
    const { prompt, action, courseId } = query;
    if (!loaded || (!prompt && !(action && courseId))) return undefined;
    const t = setTimeout(() => {
      const rest = { ...query }; delete rest.prompt; delete rest.action; delete rest.courseId;
      const qs = new URLSearchParams(rest).toString();
      navigate('/ai' + (qs ? '?' + qs : ''), { replace: true });
      if (prompt) askAI(prompt);
      const c = courseId ? ctx.catalog.find((x) => x.id === courseId) : null;
      if (c && action === 'add-cart') addCart(c);
      else if (c && action === 'enroll-free') enrollFree(c, { stay: true });
    }, 0);
    return () => clearTimeout(t);
  }, [loaded, query.prompt, query.action, query.courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The learner's own question always brings the thread to the end; answers follow only while they are at the end,
  // so reading an earlier answer is never interrupted.
  useEffect(() => {
    if (!chatting) return;
    if (lastRole === 'user' || followRef.current) scrollToEnd(false);
  }, [messages.length, lastRole, liveMsg && liveMsg.text]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return <AdvisorSkeleton />;

  const contextAlert = context.error && (
    <Alert type="warn" title="Không tải được ngữ cảnh học tập của bạn" body="Codi vẫn trả lời, nhưng chưa cá nhân hoá theo tiến độ học của bạn."
      actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => context.reload()}><Icon name="rotate-ccw" className="icon-sm" /> Tải lại</button>} />
  );

  if (!chatting) {
    const sub = user && currentCourse
      ? `Bạn đang học ${currentCourse.title} (${currentCourse.doneLessons}/${currentCourse.totalLessons} bài). Hỏi Codi nên học gì tiếp, hoặc so sánh các khoá trước khi mua.`
      : 'Kể mục tiêu của bạn, Codi gợi ý khoá học phù hợp, so sánh các lựa chọn và thứ tự nên học.';
    return (
      <div className="page ai-page is-empty"><div className="ai-col">
        <header className="ai-head">
          <div className="ai-head-text">
            <h1>Tư vấn khoá học cùng AI</h1>
            <p className="ai-head-note">{CATALOG_NOTE}</p>
            <p className="ai-head-sub">{sub}</p>
          </div>
        </header>
        {contextAlert}
        <div className="ai-start">
          <Composer busy={busy} big draft={draft} setDraft={setDraft} />
          {!user && (
            <p className="ai-guest-line">Bạn đang dùng với tư cách khách. <button type="button" className="btn-link" onClick={() => Codi.requireAuth(() => {}, { reason: 'Đăng nhập để nhận gợi ý cá nhân hoá' })}>Đăng nhập</button> để Codi gợi ý theo tiến độ học của bạn.</p>
          )}
        </div>
        <IntakeRow />
        <section aria-labelledby="ai-suggest-title" className="ai-suggest-wrap">
          <h2 id="ai-suggest-title" className="ai-suggest-title">Thử hỏi</h2>
          <ul className="ai-suggest">{suggestions(user, user ? currentCourse : null).map((s) => (
            <li key={s.title}>
              <button type="button" className="ai-suggest-card" onClick={() => (s.run ? s.run() : askAI(s.prompt))}>
                <Icon name={s.icon} className="icon-sm" />
                <span className="ai-suggest-text"><span className="ai-suggest-name">{s.title}</span><span className="ai-suggest-desc">{s.desc}</span></span>
                <Icon name="arrow-right" className="icon-sm ai-suggest-go" />
              </button>
            </li>
          ))}</ul>
          <p className="ai-disclaimer">{CAVEAT}</p>
        </section>
      </div></div>
    );
  }

  return (
    <div className="page ai-page is-chat"><div className="ai-col">
      <header className="ai-head">
        <div className="ai-head-text">
          <h1>Tư vấn khoá học cùng AI</h1>
          <p className="ai-head-note">{CATALOG_NOTE}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={newChat} disabled={busy}><Icon name="plus" className="icon-sm" /> Cuộc trò chuyện mới</button>
      </header>
      {contextAlert}
      <IntakeRow />
      <div className="ai-thread" role="log" aria-live="polite" aria-label="Cuộc trò chuyện với Codi">
        {messages.map((m, i) => <Message key={m.id || `${m.role}-${m.key || ''}-${i}`} m={m} i={i} liveText={liveMsg && liveMsg.id === m.id ? liveMsg.text : null} />)}
      </div>
      <div ref={endRef} className="ai-end" aria-hidden="true" />
      <div className="ai-dock">
        {!atBottom && (
          <button type="button" className="ai-jump" onClick={() => scrollToEnd(true)} aria-label="Xuống câu trả lời mới nhất" title="Xuống cuối">
            <Icon name="arrow-down" className="icon-sm" />
          </button>
        )}
        <Composer busy={busy} big={false} draft={draft} setDraft={setDraft} autoFocus />
        <p className="ai-disclaimer">{CAVEAT}</p>
      </div>
    </div></div>
  );
}
