/**
 * S17 AI course advisor '/ai' (Flow L13) — ported from docs/mockup/js/ai-advisor.js.
 * Two layouts on one route. Empty: heading → large composer → "Codi đang hiểu về bạn" → 4 suggestion cards →
 * guest sign-in line. Conversation: compact header, intake chip row, the thread, composer pinned to the bottom.
 * Guided intake asks only what is missing (every question skippable); structured answers carry course cards,
 * a comparison table or a suggested order; per-message 👍/👎 feedback. scenario.aiAssistant drives the async
 * states: ok | thinking (stays until "Dừng") | ratelimit | error.
 *
 * Intake answers are stored in Codi.ensure('advisorIntake') for reuse by onboarding (Flow L4).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Icon, Md, Thumb, stream } from '../../components/ui/primitives';

const fmt = Codi.fmt;

// ───────────────────────── state & helpers ─────────────────────────
const uid = () => Codi.state.currentUserId;
const store = () => Codi.ensure('advisorIntake', () => ({ goal: null, level: null, hoursPerWeek: null, chat: { messages: [], busy: false } }));
const save = (render) => Codi.set(() => {}, { render: render !== false });

// Simulated streaming: the answer text is revealed word by word; only the final text is persisted.
let live = null; // { id, text }
const liveSubs = new Set();
const setLive = (v) => { live = v; liveSubs.forEach((f) => f()); };
const useLive = () => useSyncExternalStore((f) => { liveSubs.add(f); return () => liveSubs.delete(f); }, () => live);

function ownedCourses() {
  if (!uid()) return [];
  return Codi.db().enrolments.filter((e) => e.userId === uid()).map((e) => Codi.course(e.courseId)).filter(Boolean);
}

// ───────────────────────── asking (simulated) ─────────────────────────
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
const catalog = () => Codi.db().courses.filter((c) => c.status === 'published');

// Builds a structured answer from the real catalog: cards, comparison table or suggested order.
function respond(prompt) {
  const intake = store();
  const owned = new Set(ownedCourses().map((c) => c.id));
  const beginner = !intake.level || intake.level === 'Mới bắt đầu' || /mới bắt đầu|người mới/i.test(prompt);
  const rank = { Beginner: 0, Intermediate: 1, Advanced: 2 };
  const list = catalog().slice().sort((a, b) => (owned.has(a.id) - owned.has(b.id)) || ((rank[a.level] || 0) - (rank[b.level] || 0)) * (beginner ? 1 : -1) || (b.rating || 0) - (a.rating || 0));
  const pick = list.slice(0, 3);
  if (!pick.length) return { text: 'Codi chưa có khoá cho mục tiêu này.', followups: [] };
  const why = (c) => `${Codi.levelLabel(c.level)} · ${c.rating ? c.rating + '★ · ' : ''}${(c.learnersCount || 0).toLocaleString('vi-VN')} học viên`;
  if (/so sánh/i.test(prompt)) {
    const cs = pick.slice(0, 3);
    return {
      text: 'Đây là bảng so sánh các khoá phù hợp nhất với bạn. Cột cuối là gợi ý của Codi.',
      table: { headers: ['Khoá học', 'Trình độ', 'Số bài', 'Học phí', 'Phù hợp khi'], rows: cs.map((c) => [c.title, Codi.levelLabel(c.level), String(Codi.lessons(c).length), c.price ? fmt.vnd(c.price) : 'Miễn phí', (rank[c.level] || 0) === 0 ? 'Bạn mới bắt đầu' : 'Bạn đã nắm nền tảng']) },
      courses: cs.map((c) => c.id), courseReasons: Object.fromEntries(cs.map((c) => [c.id, why(c)])),
      followups: ['Nên học theo thứ tự nào?', 'Khoá nào hợp với 5 giờ/tuần?'],
    };
  }
  if (/thứ tự|lộ trình|tiếp theo|nên học gì tiếp/i.test(prompt)) {
    const order = list.filter((c) => !owned.has(c.id)).sort((a, b) => (rank[a.level] || 0) - (rank[b.level] || 0)).slice(0, 3);
    return {
      text: `Lộ trình gợi ý${intake.hoursPerWeek ? ` với ${intake.hoursPerWeek}/tuần` : ''}: học lần lượt, khoá sau dựa trên kiến thức khoá trước.`,
      order: order.map((c) => c.id), orderReasons: Object.fromEntries(order.map((c, i) => [c.id, i === 0 ? ' — nền tảng, học trước' : ' — dựa trên khoá trước'])),
      followups: ['So sánh các khoá này', 'Mình bị chậm tiến độ, nên làm gì?'],
    };
  }
  if (/chậm tiến độ/i.test(prompt)) {
    return { text: 'Một vài cách lấy lại nhịp:\n- Đặt mục tiêu tuần nhỏ hơn ở **Bàn làm việc**\n- Học 15 phút mỗi ngày thay vì dồn cuối tuần\n- Dùng **Tìm điểm bắt đầu của tôi** để bỏ qua phần đã biết', followups: ['Nên học gì tiếp?'] };
  }
  return {
    text: `Dựa trên ${[intake.goal, intake.level, intake.hoursPerWeek].filter(Boolean).join(', ') || 'câu hỏi của bạn'}, đây là các khoá phù hợp:`,
    courses: pick.map((c) => c.id), courseReasons: Object.fromEntries(pick.map((c) => [c.id, why(c)])),
    followups: ['So sánh các khoá này', 'Nên học theo thứ tự nào?'],
  };
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
  intake.chat.busy = true;
  const m = { role: 'ai', text: '', streaming: true, id: `msg-${Date.now()}` };
  messages.push(m);
  save();
  if (flag === 'thinking') return; // stays in the thinking state; "Dừng" ends it
  setTimeout(() => {
    if (!m.streaming) return; // stopped meanwhile
    if (flag === 'error') { m.role = 'error'; m.question = q; m.streaming = false; intake.chat.busy = false; save(); return; }
    Object.assign(m, respond(q), { streaming: false, vote: null });
    setLive({ id: m.id, text: '' });
    save(); // persists the full answer; the thread reveals it progressively
    stream(m.text, (t) => setLive({ id: m.id, text: t })).then(() => {
      setLive(null);
      intake.chat.busy = false;
      save();
    });
  }, 1200);
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
  intake.chat.messages = [];
  intake.chat.busy = false;
  intake.chat.pending = null;
  save();
}
function vote(i, v) {
  const m = store().chat.messages[i];
  if (!m) return;
  m.vote = m.vote === v ? null : v; m.reason = null;
  save();
  if (m.vote === 'up') Codi.ui.toast('Cảm ơn phản hồi của bạn.');
}
function giveReason(i, reason) {
  const m = store().chat.messages[i];
  if (!m) return;
  m.reason = reason;
  save();
  Codi.ui.toast('Cảm ơn, góp ý của bạn giúp Codi trả lời tốt hơn.');
}
function retry(i) {
  const intake = store();
  const m = intake.chat.messages[i];
  if (!m || intake.chat.busy) return;
  intake.chat.messages.splice(i, 1);
  if (m.question) askAI(m.question); else save();
}
function addCart(c) {
  Codi.requireAuth(() => {
    if (Codi.role() !== 'learner') { Codi.ui.toast('Chỉ tài khoản học viên mới mua được khoá học.', { type: 'warn' }); return; }
    if (Codi.ownership(c.id) !== 'not-owned') { save(); return; } // owned / pending / already in cart → CTA updates on re-render
    Codi.set(() => { if (!Codi.cart().includes(c.id)) Codi.setCart(Codi.cart().concat(c.id)); });
    Codi.ui.toast(`Đã thêm “${c.title}” vào giỏ hàng.`, { type: 'success', action: { label: 'Xem giỏ hàng', onClick: () => Codi.go('/cart') } });
  }, { reason: 'Đăng nhập để thêm khoá học vào giỏ', courseTitle: c.title });
}
function enrollFree(c) {
  Codi.requireAuth(() => {
    if (Codi.role() !== 'learner') { Codi.ui.toast('Chỉ tài khoản học viên mới đăng ký được khoá học.', { type: 'warn' }); return; }
    if (!Codi.isEnrolled(c.id)) Codi.set(() => Codi.enroll(c.id));
    Codi.ui.toast(`Đã đăng ký "${c.title}"`, { type: 'success', action: { label: 'Học ngay', onClick: () => Codi.go(`/learn/${c.id}`) } });
  }, { reason: 'Đăng nhập để đăng ký khoá học miễn phí', courseTitle: c.title });
}

// ───────────────────────── view pieces ─────────────────────────
function CourseCta({ course: c }) {
  const own = Codi.ownership(c.id);
  const role = Codi.role();
  if (own === 'owned') return <Link className="btn btn-primary btn-sm" to={`/learn/${c.id}`}>Tiếp tục học</Link>;
  if (role === 'lecturer' || role === 'admin') return <Link className="btn btn-secondary btn-sm" to={`/courses/${c.slug}`}>Xem chi tiết</Link>;
  if (own === 'in-cart') return <Link className="btn btn-secondary btn-sm" to="/cart">Đã có trong giỏ · Xem giỏ hàng</Link>;
  if (own === 'pending-payment') {
    const o = Codi.pendingOrderFor(c.id);
    return <Link className="btn btn-secondary btn-sm" to={o ? `/checkout?order=${o.id}` : '/checkout'}>Tiếp tục thanh toán</Link>;
  }
  if (!c.price) return <button type="button" className="btn btn-primary btn-sm" onClick={() => enrollFree(c)}>Đăng ký miễn phí</button>;
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

  const courses = (m.courses || []).map((id) => Codi.course(id)).filter(Boolean);
  return (
    <div className="msg msg-ai msg-md">
      {m.text && <Md text={m.text} />}
      {m.table && (
        <div className="table-wrap ai-table"><table className="table"><caption className="sr-only">So sánh khoá học</caption>
          <thead><tr>{m.table.headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{m.table.rows.map((row, r) => <tr key={r}>{row.map((cell, k) => (k === 0 ? <th key={k} scope="row">{cell}</th> : <td key={k}>{cell}</td>))}</tr>)}</tbody>
        </table></div>
      )}
      {courses.length > 0 && (
        <ul className="ai-courses">{courses.map((c, k) => (
          <li key={c.id} className="ai-course">
            <Thumb course={c} small />
            <div className="ai-course-main">
              <Link className="ai-course-title" to={`/courses/${c.slug}`}>{c.title}</Link>
              <span className="ai-course-meta">{Codi.levelLabel(c.level)} · {Codi.lessons(c).length} bài · <span className="od-nowrap">{c.price ? fmt.vnd(c.price) : 'Miễn phí'}</span></span>
              {m.courseReasons && m.courseReasons[c.id] && <span className="ai-course-why">{m.courseReasons[c.id]}</span>}
            </div>
            <div className="ai-course-cta">{k === 0 && courses.length > 1 && <span className="badge badge-accent">Phù hợp nhất</span>}<CourseCta course={c} /></div>
          </li>
        ))}</ul>
      )}
      {m.order && (
        <ol className="ai-order">{m.order.map((cid) => {
          const c = Codi.course(cid);
          return c ? <li key={cid}><Link to={`/courses/${c.slug}`}>{c.title}</Link><span className="ai-course-why">{((m.orderReasons && m.orderReasons[cid]) || '').replace(/^ — /, '')}</span></li> : null;
        })}</ol>
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

// First visit shows the loading skeleton once per session (real AiAdvisorSkeleton while /api/ai context loads).
let advisorLoaded = false;
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
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(advisorLoaded);
  useEffect(() => {
    if (loaded) return undefined;
    const t = setTimeout(() => { advisorLoaded = true; setLoaded(true); }, 500);
    return () => clearTimeout(t);
  }, [loaded]);
  const liveMsg = useLive();
  const intake = store();
  const user = Codi.currentUser();
  const owned = ownedCourses();
  const currentCourse = owned.length ? owned[0] : null;
  const { messages, busy } = intake.chat;
  const [draft, setDraft] = useState(() => (query.topic ? `Mình muốn tìm hiểu về ${query.topic}` : ''));
  const threadRef = useRef(null);

  useEffect(() => {
    const chat = store().chat;
    // A reload during a reveal leaves busy set with nothing in flight; recover so the composer is usable.
    if (chat.busy && !live && !chat.messages.some((m) => m.streaming)) { chat.busy = false; save(); }
  }, []);

  // Deep links (real app/ai/page.tsx): ?prompt= sends the question; ?action=add-cart|enroll-free&courseId= replays
  // the gated action (after sign-in when needed). Handled params are removed from the URL.
  useEffect(() => {
    const { prompt, action, courseId } = query;
    if (!prompt && !(action && courseId)) return undefined;
    const t = setTimeout(() => {
      const rest = { ...query }; delete rest.prompt; delete rest.action; delete rest.courseId;
      const qs = new URLSearchParams(rest).toString();
      navigate('/ai' + (qs ? '?' + qs : ''), { replace: true });
      if (prompt) askAI(prompt);
      const c = courseId ? Codi.course(courseId) : null;
      if (c && action === 'add-cart') addCart(c);
      else if (c && action === 'enroll-free') enrollFree(c);
    }, 0);
    return () => clearTimeout(t);
  }, [query.prompt, query.action, query.courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const last = threadRef.current && threadRef.current.lastElementChild;
    if (last) last.scrollIntoView({ block: 'end' });
  }, [messages.length, liveMsg && liveMsg.text]);

  if (!loaded) return <AdvisorSkeleton />;

  if (!messages.length) {
    const p = user && currentCourse ? Codi.courseProgress(currentCourse.id) : null;
    const sub = p
      ? `Bạn đang học ${currentCourse.title} (${p.done}/${p.total} bài). Hỏi Codi nên học gì tiếp, hoặc so sánh các khoá trước khi mua.`
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
          <ul className="ai-suggest">{suggestions(user, currentCourse).map((s) => (
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
