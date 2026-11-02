/**
 * S17 AI course advisor '/ai' (Flow L13) — ported from docs/mockup/js/ai-advisor.js, answers from the backend.
 * Two layouts on one route. Empty: heading → large composer → "Codi đang hiểu về bạn" → 4 suggestion cards →
 * guest sign-in line. Conversation: compact header, intake chip row, the thread, composer pinned to the bottom.
 * Guided intake asks only what is missing (every question skippable); structured answers carry course cards,
 * a comparison table or a suggested order; per-message 👍/👎 feedback.
 *
 * Data: GET /api/ai (catalog, current course, saved intake), POST /api/ai (answer; the backend also saves the
 * intake as the learner's goal draft), POST /api/ai/feedback (votes). The thread lives in this tab
 * (sessionStorage), like the real app. scenario.aiAssistant forces the async states without calling the model:
 * thinking (stays until "Dừng") | ratelimit | error; ok asks the backend (a real 429 / failure shows the same states).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { api } from '../../lib/api';
import { useApi } from '../../lib/use-api';
import { Alert, Icon, Md, Thumb, stream } from '../../components/ui/primitives';
import { addToCart, enrollFree, levelLabel, useOwnership } from './commerce-api';

const fmt = Codi.fmt;

// ───────────────────────── state & helpers ─────────────────────────
// Intake + thread for this tab, per signed-in user (or guest). Changes re-render through useAdvisor().
const blank = () => ({ goal: null, level: null, hoursPerWeek: null, skipped: [], chat: { messages: [], busy: false, pending: null } });
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

// GET /api/ai context, shared with the action handlers below.
let ctx = { user: null, currentCourse: null, catalog: [], savedIntake: null };

// Simulated streaming: the answer text is revealed word by word; only the final text is persisted.
let live = null; // { id, text }
const liveSubs = new Set();
const setLive = (v) => { live = v; liveSubs.forEach((f) => f()); };
const useLive = () => useSyncExternalStore((f) => { liveSubs.add(f); return () => liveSubs.delete(f); }, () => live);
let inflight = null; // AbortController of the running POST /api/ai

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

/** Recent turns for follow-ups (POST /api/ai history, ≤ 20), without the question being asked now. */
function historyFor(messages, question) {
  const turns = messages.filter((m) => (m.role === 'user' || (m.role === 'ai' && !m.streaming)) && m.text);
  if (turns.length && turns[turns.length - 1].role === 'user' && turns[turns.length - 1].text === question) turns.pop();
  return turns.slice(-20).map((m) => ({
    role: m.role, text: String(m.text).slice(0, 4000),
    ...(m.role === 'ai' && m.courses && m.courses.length ? { courseIds: m.courses.map((c) => c.id).slice(0, 12) } : {}),
  }));
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
  const history = historyFor(messages, q);
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
  const body = { prompt: q, intake: { goal: intake.goal, level: intake.level, hoursPerWeek: intake.hoursPerWeek, skipped: intake.skipped || [] }, history };
  api.post('/api/ai', body, { signal: ctrl.signal }).then((r) => {
    if (!m.streaming) return; // stopped meanwhile
    Object.assign(m, {
      text: r.text, courses: r.courses || [], table: r.table || null, order: r.order || [], followups: r.followups || [],
      noMatch: !!r.noMatch, logId: r.logId || null, feedbackToken: r.feedbackToken || null, streaming: false, vote: null,
    });
    inflight = null;
    setLive({ id: m.id, text: '' });
    save(); // persists the full answer; the thread reveals it progressively
    stream(m.text, (t) => setLive({ id: m.id, text: t })).then(() => {
      setLive(null);
      store().chat.busy = false;
      save();
    });
  }).catch((e) => {
    if (ctrl.signal.aborted || (e && e.name === 'AbortError') || !m.streaming) return;
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
function stopAnswer() {
  const intake = store();
  if (inflight) { inflight.abort(); inflight = null; }
  const m = intake.chat.messages.find((x) => x.streaming);
  if (m) { m.streaming = false; m.text = 'Bạn đã dừng câu trả lời này.'; m.stopped = true; }
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
  save();
}
function newChat() {
  const intake = store();
  if (inflight) { inflight.abort(); inflight = null; }
  intake.chat.messages = [];
  intake.chat.busy = false;
  intake.chat.pending = null;
  save();
}

/** POST /api/ai/feedback for an answer (signed-in owner by logId, guests by feedbackToken). */
async function sendFeedback(m) {
  if (!m.logId) return true;
  try {
    await api.post('/api/ai/feedback', { logId: m.logId, feedbackToken: m.feedbackToken || null, vote: m.vote || null, reason: m.reason || null });
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
  if (!own) return <span className="skeleton" style={{ display: 'inline-block', width: 120, height: 32 }} aria-hidden="true" />;
  if (own === 'owned') return <Link className="btn btn-primary btn-sm" to={`/learn/${c.id}`}>Tiếp tục học</Link>;
  if (role === 'lecturer' || role === 'admin') return <Link className="btn btn-secondary btn-sm" to={`/courses/${c.slug}`}>Xem chi tiết</Link>;
  if (own === 'in-cart') return <Link className="btn btn-secondary btn-sm" to="/cart">Đã có trong giỏ · Xem giỏ hàng</Link>;
  if (own === 'pending-payment') {
    return <Link className="btn btn-secondary btn-sm" to={pendingOrderId ? `/checkout?order=${pendingOrderId}` : '/cart'}>Tiếp tục thanh toán</Link>;
  }
  if (!c.price) return <button type="button" className="btn btn-primary btn-sm" onClick={() => enrollFree(c, { stay: true })}>Đăng ký miễn phí</button>;
  return <button type="button" className="btn btn-primary btn-sm" onClick={() => addCart(c)}>Thêm vào giỏ</button>;
}

// Same quiet feedback row as the lesson tutor: 👍/👎, and after 👎 a one-tap reason.
// Advisor 👎 reasons (real lib/ai-advisor-contract.ts DOWN_VOTE_REASONS); the tutor keeps its own list.
const DOWN_REASONS = ['Sai trình độ', 'Không hợp mục tiêu', 'Thông tin khoá sai', 'Chưa đúng', 'Khó hiểu'];
function FeedbackRow({ m, i }) {
  return (
    <div className="ai-feedback">
      <button type="button" className="ai-feedback-btn" onClick={() => vote(i, 'up')} aria-pressed={m.vote === 'up'} aria-label="Câu trả lời hữu ích"><Icon name="thumbs-up" className="icon-sm" /></button>
      <button type="button" className="ai-feedback-btn" onClick={() => vote(i, 'down')} aria-pressed={m.vote === 'down'} aria-label="Câu trả lời chưa tốt"><Icon name="thumbs-down" className="icon-sm" /></button>
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
    <ul className="ai-courses">{courses.map((c, k) => (
      <li key={c.id} className="ai-course">
        <Thumb course={c} small />
        <div className="ai-course-main">
          <Link className="ai-course-title" to={`/courses/${c.slug}`}>{c.title}</Link>
          <span className="ai-course-meta">{levelLabel(c.level)} · {c.lessonCount} bài · <span className="od-nowrap">{c.price ? fmt.vnd(c.price) : 'Miễn phí'}</span></span>
          {c.reason && <span className="ai-course-why">{c.reason}</span>}
        </div>
        <div className="ai-course-cta">
          {(c.isBestMatch || (k === 0 && !courses.some((x) => x.isBestMatch))) && courses.length > 1 && <span className="badge badge-accent">Phù hợp nhất</span>}
          <CourseCta course={c} own={ownership.of(c.id)} pendingOrderId={ownership.pendingOrderId(c.id)} />
        </div>
      </li>
    ))}</ul>
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
      <div className="msg msg-ai msg-md"><p>{m.text}</p>
        <div className="ai-chips" role="group" aria-label={m.text}>
          {m.options.map((opt) => <button key={opt} type="button" className="ai-chip" onClick={() => answerIntake(m.key, opt)}>{opt}</button>)}
          {m.canSkip && <button type="button" className="ai-chip is-quiet" onClick={() => skipIntake(m.key)}>Bỏ qua</button>}
        </div>
      </div>
    );
  }
  if (m.streaming) {
    return (
      <div className="ai-thinking-row" aria-busy="true">
        <span className="typing" aria-hidden="true"><i /><i /><i /></span><span>Codi đang suy nghĩ…</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={stopAnswer}><Icon name="x" className="icon-sm" /> Dừng</button>
      </div>
    );
  }
  if (liveText !== null) return <div className="msg msg-ai msg-md" aria-busy="true">{liveText ? <Md text={liveText} /> : null}</div>;

  const courses = m.courses || [];
  return (
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
        <ol className="ai-order">{m.order.map((o) => (
          <li key={o.id}><Link to={`/courses/${o.slug}`}>{o.title}</Link><span className="ai-course-why">{o.reason}</span></li>
        ))}</ol>
      )}
      {!m.stopped && <FeedbackRow m={m} i={i} />}
      {m.followups && m.followups.length > 0 && (
        <div className="ai-chips" role="group" aria-label="Hỏi tiếp">
          {m.followups.map((t) => <button key={t} type="button" className="ai-chip" onClick={() => askAI(t)}>{t}</button>)}
        </div>
      )}
    </div>
  );
}

// "Codi đang hiểu về bạn": one quiet row of removable chips + "Sửa"; hidden until something is known.
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

function Composer({ busy, big, draft, setDraft }) {
  const onSubmit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (text) { askAI(text); setDraft(''); }
  };
  return (
    <form className={`ai-composer ${big ? 'is-big' : 'is-sticky'}`} onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="advisor-q">Câu hỏi cho Codi</label>
      <input id="advisor-q" type="text" name="text" className="ai-composer-input" placeholder={big ? 'Ví dụ: Mình muốn làm web, nên học khoá nào trước?' : 'Hỏi tiếp…'}
        autoComplete="off" disabled={busy} value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button type="submit" className="btn btn-primary ai-composer-send" disabled={busy} aria-label="Gửi câu hỏi"><Icon name="send" className="icon-sm" />{big && <span>Hỏi Codi</span>}</button>
    </form>
  );
}

// The GitHub card triggers an action (connect / view analysis) instead of sending a chat prompt. It is shown only
// when the GitHub feature (Codi.github) is installed.
function suggestions(user, currentCourse) {
  const gh = Codi.github;
  const ghCard = user && gh ? (gh.isConnected?.()
    ? { icon: 'github', title: 'Xem lại phân tích GitHub của mình', desc: 'Codi gợi ý khoá dựa trên repo và ngôn ngữ của bạn', run: () => Codi.go('/github/analysis') }
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

// Real AiAdvisorSkeleton while the /api/ai context loads.
function AdvisorSkeleton() {
  return (
    <div className="page ai-page is-empty" aria-busy="true"><div className="ai-col stack-4">
      <div className="skeleton skeleton-line" style={{ width: '55%', height: 32, margin: '0 auto' }} />
      <div className="skeleton skeleton-line" style={{ width: '75%', margin: '0 auto' }} />
      <div className="skeleton" style={{ height: 56 }} />
      <div className="grid-2">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}</div>
      <p className="sr-only" role="status">Đang tải trợ lý AI…</p>
    </div></div>
  );
}

// ───────────────────────── page ─────────────────────────
export default function AiAdvisorPage({ query }) {
  useCodi();
  useAdvisor();
  const navigate = useNavigate();
  const context = useApi('/api/ai');
  const loaded = !!context.data || !!context.error;
  if (context.data) ctx = context.data;
  const liveMsg = useLive();
  const intake = store();
  const user = Codi.currentUser();
  const currentCourse = context.data ? context.data.currentCourse : null;
  const { messages, busy } = intake.chat;
  const [draft, setDraft] = useState(() => (query.topic ? `Mình muốn tìm hiểu về ${query.topic}` : ''));
  const threadRef = useRef(null);

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

  // Context load failure: the advisor still answers (the backend loads its own catalog); say what is missing.
  useEffect(() => {
    if (context.error) Codi.ui.toast('Không tải được ngữ cảnh học tập của bạn. Codi vẫn trả lời, nhưng chưa cá nhân hoá.', { type: 'warn' });
  }, [context.error]);

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

  useEffect(() => {
    const last = threadRef.current && threadRef.current.lastElementChild;
    if (last) last.scrollIntoView({ block: 'end' });
  }, [messages.length, liveMsg && liveMsg.text]);

  if (!loaded) return <AdvisorSkeleton />;

  if (!messages.length) {
    const sub = user && currentCourse
      ? `Bạn đang học ${currentCourse.title} (${currentCourse.doneLessons}/${currentCourse.totalLessons} bài). Hỏi Codi nên học gì tiếp, hoặc so sánh các khoá trước khi mua.`
      : 'Kể mục tiêu của bạn, Codi gợi ý khoá học phù hợp, so sánh các lựa chọn và thứ tự nên học.';
    return (
      <div className="page ai-page is-empty"><div className="ai-col">
        <header className="ai-hero"><h1>Tư vấn khoá học cùng AI</h1><p>{sub}</p></header>
        <Composer busy={busy} big draft={draft} setDraft={setDraft} />
        {!user && (
          <p className="ai-guest-line">Bạn đang dùng với tư cách khách. <button type="button" className="btn-link" onClick={() => Codi.requireAuth(() => {}, { reason: 'Đăng nhập để nhận gợi ý cá nhân hoá' })}>Đăng nhập</button> để Codi gợi ý theo tiến độ học của bạn.</p>
        )}
        <IntakeRow />
        <section aria-labelledby="ai-suggest-title" className="ai-suggest-wrap">
          <h2 id="ai-suggest-title" className="ai-suggest-title">Thử hỏi</h2>
          <ul className="ai-suggest">{suggestions(user, user ? currentCourse : null).map((s) => (
            <li key={s.title}>
              <button type="button" className="ai-suggest-card" onClick={() => (s.run ? s.run() : askAI(s.prompt))}>
                <Icon name={s.icon} className="icon-sm" />
                <span className="ai-suggest-text"><span className="ai-suggest-name">{s.title}</span><span className="ai-suggest-desc">{s.desc}</span></span>
              </button>
            </li>
          ))}</ul>
        </section>
        <p className="ai-disclaimer">AI có thể trả lời sai. Hãy xem kỹ trang chi tiết khoá học trước khi mua.</p>
      </div></div>
    );
  }

  return (
    <div className="page ai-page is-chat"><div className="ai-col">
      <header className="ai-chat-head">
        <h1>Tư vấn khoá học cùng AI</h1>
        <button type="button" className="btn btn-secondary btn-sm" onClick={newChat} disabled={busy}><Icon name="plus" className="icon-sm" /> Cuộc trò chuyện mới</button>
      </header>
      <IntakeRow />
      <div className="ai-thread" role="log" aria-live="polite" aria-label="Cuộc trò chuyện với Codi" ref={threadRef}>
        {messages.map((m, i) => <Message key={m.id || `${m.role}-${m.key || ''}-${i}`} m={m} i={i} liveText={liveMsg && liveMsg.id === m.id ? liveMsg.text : null} />)}
      </div>
      <Composer busy={busy} big={false} draft={draft} setDraft={setDraft} />
    </div></div>
  );
}
