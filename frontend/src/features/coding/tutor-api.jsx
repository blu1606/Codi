/**
 * Codi AI tutor — React port of the real tutor (apps/web components/ai-tutor/*, lib/ai-tutor-contract.ts) on the
 * backend: GET/POST /api/learn/:courseId/lessons/:lessonId/tutor (TutorView; "ask" streams text/plain) and
 * GET /api/learn/:courseId/tutor/threads. The server owns the thread (max 40 messages), the 3-step hint ladder, the
 * 8-per-minute limit, votes, the ≤3-line diff suggestions and the escalation to the lecturer. Installs Codi.tutor and
 * Codi.aiFeedbackRow.
 *
 * PUBLIC API
 *   Codi.tutor.open(courseId, lessonId, ctx?) → sheet handle | null
 *       Docked "Trợ lý AI" panel beside the lesson. ctx: { selection?: string, testId?: number|string, ask?: string } —
 *       `ask` is sent once the thread has loaded. Opening again on the same lesson merges the new context.
 *   Codi.tutor.explainError(courseId, lessonId, testId)   opens the panel and asks why that test failed
 *   Codi.tutor.explainRunError(courseId, lessonId)        opens the panel and asks about the last syntax/runtime/timeout error
 *   Codi.tutor.embed(courseId, lessonId, opts?) → element  the thread as a non-floating panel inside the host's own
 *       scroll area (mark the scroller with data-tutor-scroll). While it is mounted, open()/explainError()/
 *       explainRunError() for that lesson go to it and call opts.onActivate() so the host can show it (lesson tab).
 *   Codi.tutor.rules()                                     "Lưu ý khi dùng trợ lý AI" dialog
 *   Codi.tutor.pageHref(courseId, lessonId?) → '/learn/:courseId/tutor[?lesson=…]'
 *   Codi.aiFeedbackRow(prefix, message, index, opts?) → element
 *       Quiet 👍/👎 row; after 👎 a one-tap reason. Clicking mutates `message.vote` / `message.reason` in place and then
 *       calls opts.onChange(). opts.before / opts.after: extra nodes rendered at the start / end of the row.
 *
 * Context sent with a question is exactly what the chips show: the lesson, and on code lessons the task, the code in
 * the editor, the failing test and the run error (Codi.code.bridge), plus a text/code selection. Chips can be removed.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Codi } from '../../lib/codi';
import { Icon, Md, Alert } from '../../components/ui/primitives';
import { setEditorValue } from './code-api';

const HINT_MAX = 3;
const HINT_NAMES = ['Hướng nghĩ', 'Chỗ cần xem lại', 'Khung cách làm'];
const DOWN_REASONS = ['Chưa đúng', 'Khó hiểu', 'Lộ lời giải', 'Không liên quan bài'];
export const MODES = ['simple', 'step', 'review'];
export const MODE_LABELS = { simple: 'Giải thích đơn giản', step: 'Gợi ý từng bước', review: 'Ôn lại khái niệm' };
// Context the learner sees as chips is exactly what the answer reads; longer values are cut ("đã rút gọn").
const LIMITS = { task: 3000, selection: 1200, code: 12000, error: 1000, test: 600 };
const ESCALATE_MIN = 10;
const UNAVAILABLE = 'AI trợ lý tạm thời không khả dụng';
const wide = () => window.matchMedia('(min-width: 1024px)').matches;
const clip = (v, max) => { const s = String(v == null ? '' : v); return s.length > max ? `${s.slice(0, max - 1)}…` : s; };
const short = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 60 ? s.slice(0, 57) + '…' : String(s); };
const errText = (e, fallback) => (e && typeof e.message === 'string' && e.message) || fallback;
const tutorUrl = (p) => `/api/learn/${encodeURIComponent(p.courseId)}/lessons/${encodeURIComponent(p.lessonId)}/tutor`;

export const starters = (isCode) => (isCode
  ? ['Vì sao code của mình chưa chạy đúng?', 'Giải thích lại yêu cầu của bài', 'Lỗi hay gặp ở bài này là gì?']
  : ['Tóm tắt ý chính của bài', 'Cho mình một ví dụ khác', 'Lỗi hay gặp ở bài này là gì?']);
/** First name in Vietnamese order, where the given name is the last word ("Nguyễn Minh Anh" → "Anh"). */
export const firstNameOf = (name) => { const parts = String(name || '').trim().split(/\s+/).filter(Boolean); return parts.length ? parts[parts.length - 1] : null; };

// Repaint for tutor views (panel, page): a local version the components subscribe to.
let ver = 0;
const subs = new Set();
const refresh = () => { ver += 1; subs.forEach((f) => f()); };
export const useTutorVersion = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => ver);

// ───────────────────────── feedback row (shared with the /ai advisor) ─────────────────────────
function feedbackRow(prefix, m, i, opts) {
  const save = (opts && opts.onChange) || refresh;
  const vote = (v) => {
    m.vote = m.vote === v ? null : v; m.reason = null;
    save();
    if (m.vote === 'up') Codi.ui.toast('Cảm ơn phản hồi của bạn.');
  };
  const reason = (r) => {
    m.reason = r; save();
    Codi.ui.toast('Cảm ơn, góp ý của bạn giúp Codi trả lời tốt hơn.');
  };
  return (
    <div className="ai-feedback">
      {opts && opts.before}
      <button type="button" className="ai-feedback-btn" aria-pressed={String(m.vote === 'up')} aria-label="Câu trả lời hữu ích" onClick={() => vote('up')}><Icon name="thumbs-up" className="icon-sm" /></button>
      <button type="button" className="ai-feedback-btn" aria-pressed={String(m.vote === 'down')} aria-label="Câu trả lời chưa tốt" onClick={() => vote('down')}><Icon name="thumbs-down" className="icon-sm" /></button>
      {m.vote === 'down' && !m.reason ? (
        <span className="ai-feedback-reasons">
          <span className="xsmall muted">Chưa tốt ở điểm nào?</span>
          {DOWN_REASONS.map((r) => <button key={r} type="button" className="ai-chip ai-chip-sm" onClick={() => reason(r)}>{r}</button>)}
        </span>
      ) : null}
      {m.reason ? <span className="xsmall muted">Đã ghi nhận: {m.reason}</span> : null}
      {opts && opts.after}
    </div>
  );
}

// Picking an item in a menu closes it; clicking outside an open menu closes it too.
document.addEventListener('click', (e) => {
  const item = e.target.closest && e.target.closest('.tutor-menu-list [role="menuitem"]');
  if (item) { const d = item.closest('details'); if (d) d.open = false; return; }
  document.querySelectorAll('.tutor-menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
});

// ───────────────────────── data ─────────────────────────
/** The lesson's code editor on screen (learner workspace keys lc:<course>:<lesson>:<assessment>[:step]). */
function editorEl(p) {
  return document.querySelector(`[data-cp-input^="lc:${p.courseId}:${p.lessonId}:"]`);
}
/** What the lesson's code workspace lends the tutor: null on the full Tutor page and outside code lessons. */
function bridge(p) {
  if (p.variant === 'page' || !Codi.code || typeof Codi.code.bridge !== 'function') return null;
  return Codi.code.bridge(p.courseId, p.lessonId, p.ctx.testId);
}
/** TutorContext for the server: only the chips the learner kept. */
function contextOf(p) {
  const use = (id) => !p.removed[id];
  const b = bridge(p);
  const ctx = {};
  if (p.ctx.selection && use('sel')) ctx.selection = clip(p.ctx.selection, LIMITS.selection);
  if (b) {
    if (use('task') && b.task) ctx.task = clip(b.task.text, LIMITS.task);
    if (use('code') && b.code) ctx.code = clip(b.code, LIMITS.code);
    if (use('err') && b.runError) ctx.error = clip(b.runError, LIMITS.error);
    if (use('test') && b.failing) ctx.failingTest = { name: clip(b.failing.name, 200), input: b.failing.input == null ? null : clip(b.failing.input, LIMITS.test), expected: clip(b.failing.expected, LIMITS.test), actual: b.failing.actual == null ? null : clip(b.failing.actual, LIMITS.test) };
  }
  return ctx;
}

// ───────────────────────── sessions ─────────────────────────
// A session is one open thread view: the docked panel ('sidebar'), the lesson tab ('embed') or the Tutor page ('page').
function session(courseId, lessonId, variant) {
  return { courseId, lessonId, variant, ctx: {}, removed: {}, busy: false, mode: 'simple', failure: null, loaded: false, loadError: null, convOpen: false, view: null, pendingUser: null, streaming: null, abort: null, queued: null, originals: {} };
}
let panel = null; // the docked sidebar session
function load(p) {
  p.loaded = false; p.loadError = null; refresh();
  api.get(tutorUrl(p))
    .then((view) => { p.view = view; p.loaded = true; })
    .catch((e) => { p.loadError = errText(e, 'Chưa tải được AI trợ lý.'); })
    .finally(() => {
      refresh();
      if (p.loaded && p.queued) { const q = p.queued; p.queued = null; ask(p, q); }
    });
}
const reloadView = (p) => api.get(tutorUrl(p)).then((view) => { p.view = view; refresh(); }).catch(() => {});
/** Applies a JSON reply or error body: a TutorView replaces the thread; an error without a view becomes a failure. */
function applyBody(p, body, status, retry) {
  if (body && body.messages) { p.view = body; return; }
  if (body && body.view) { p.view = body.view; return; }
  p.failure = { message: (body && body.error) || (status === 429 ? 'Bạn đã hỏi quá nhiều trong thời gian ngắn' : UNAVAILABLE), retry };
}

/** Runs one "ask" turn: thinking → streaming text → saved answer | stopped | error | rate limited. */
async function ask(p, text, retryOf) {
  const q = String(text || '').trim().slice(0, 2000);
  if (!p || !q) return;
  // Sent once the thread has loaded and no turn is running (real panel queues contextual questions).
  if (!p.loaded || p.busy) { p.queued = q; return; }
  const ctrl = new AbortController();
  p.abort = ctrl; p.failure = null; p.pendingUser = q; p.busy = 'thinking'; p.streaming = null; refresh();
  const body = { type: 'ask', question: q, mode: p.mode, context: contextOf(p), ...(retryOf ? { retryOf } : {}) };
  try {
    const res = await fetch(tutorUrl(p), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'text/plain, application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || type.includes('application/json')) {
      const data = await res.json().catch(() => null);
      applyBody(p, data, res.status, () => ask(p, q));
    } else {
      p.busy = 'streaming'; p.streaming = { text: '' }; refresh();
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        p.streaming.text += dec.decode(value, { stream: true });
        refresh();
      }
      await reloadView(p);
    }
  } catch (e) {
    if (e && e.name === 'AbortError') {
      // The server saves the stop ("Bạn đã dừng câu trả lời này."); read the thread once it has.
      setTimeout(() => reloadView(p), 400);
    } else {
      p.failure = { message: 'Câu hỏi chưa được gửi. Bạn vẫn học tiếp bình thường.', retry: () => ask(p, q) };
    }
  } finally {
    p.busy = false; p.abort = null; p.pendingUser = null; p.streaming = null; refresh();
  }
}
function stopAction(p) { if (p && p.abort) p.abort.abort(); }
/** POST a JSON command; the TutorView reply replaces the thread. */
async function command(p, body, fallback) {
  try {
    p.view = await api.post(tutorUrl(p), body);
    return true;
  } catch (e) {
    if (e && e.body && e.body.view) p.view = e.body.view;
    else Codi.ui.toast(errText(e, fallback), { type: 'danger' });
    return false;
  } finally { refresh(); }
}
function retryRow(p, i) {
  if (!p || p.busy || !p.view) return;
  const log = p.view.messages; const m = log[i];
  if (!m || m.role !== 'error') return;
  const q = m.text || (log[i - 1] && log[i - 1].role === 'user' ? log[i - 1].text : '');
  if (q) ask(p, q, m.id);
}
async function hintAction(p) {
  if (!p || p.busy || !p.view || !p.view.isCode) return;
  const level = p.view.hintLevel + 1;
  if (level > HINT_MAX) return;
  p.busy = 'thinking'; p.failure = null; p.pendingUser = `Cho mình gợi ý ${level}/${HINT_MAX}`; refresh();
  try {
    p.view = await api.post(tutorUrl(p), { type: 'hint', context: contextOf(p) });
  } catch (e) {
    if (e && e.body && e.body.view) p.view = e.body.view;
    else p.failure = { message: errText(e, UNAVAILABLE), retry: () => hintAction(p) };
  } finally { p.busy = false; p.pendingUser = null; refresh(); }
}
async function clearAction(p) {
  if (!p || p.busy) return;
  const r = await Codi.ui.confirm({ title: 'Xoá cuộc trò chuyện của bài này?', consequence: 'Các câu hỏi và câu trả lời của AI trợ lý trong bài học này sẽ bị xoá. Cuộc trò chuyện ở các bài khác giữ nguyên.', reversible: false, confirmLabel: 'Xoá cuộc trò chuyện', danger: true });
  if (!r.ok) return;
  p.failure = null;
  if (await command(p, { type: 'clear' }, 'Chưa xoá được cuộc trò chuyện.')) Codi.ui.toast('Đã xoá cuộc trò chuyện.');
}
const voteAction = (p, m) => command(p, { type: 'vote', messageId: m.id, vote: m.vote || null, ...(m.vote === 'down' && m.reason ? { reason: m.reason } : {}) }, 'Chưa lưu được phản hồi.');
// "Xem dòng N": select the line in the editor (on phones the sheet closes first so the editor is visible).
function lineAction(p, n) {
  const ta = editorEl(p);
  if (!ta) { Codi.ui.toast('Mở phần code của bài để xem dòng này.', { type: 'info' }); return; }
  if (!wide() && p.handle) p.handle.close();
  const lines = ta.value.split('\n'); const idx = Math.min(Math.max(n, 1), lines.length) - 1;
  const start = lines.slice(0, idx).reduce((s, x) => s + x.length + 1, 0);
  ta.focus({ preventScroll: true }); ta.setSelectionRange(start, start + lines[idx].length);
  ta.scrollTop = Math.max(0, idx * (parseFloat(getComputedStyle(ta).lineHeight) || 20) - ta.clientHeight / 2);
  ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
// ≤3-line suggestion: apply inserts the lines into the editor, undo restores the exact previous code.
async function diffAction(p, m, op) {
  const d = m.diff; if (!d) return;
  const ta = editorEl(p);
  if (op === 'skip') { await command(p, { type: 'diff', messageId: m.id, state: 'skipped' }, 'Chưa lưu được lựa chọn.'); return; }
  if (!ta) { Codi.ui.toast('Mở phần code của bài để áp dụng đề xuất.', { type: 'warn' }); return; }
  if (op === 'apply') {
    p.originals[m.id] = ta.value;
    const lines = ta.value.split('\n'); lines.splice(Math.min(d.at - 1, lines.length), 0, ...d.add);
    setEditorValue(ta, lines.join('\n')); // the editor saves the draft on input
    Codi.ui.toast(`Đã thêm ${d.add.length} dòng vào code. Bấm “Hoàn tác” nếu muốn bỏ.`, { type: 'success' });
    await command(p, { type: 'diff', messageId: m.id, state: 'applied' }, 'Chưa lưu được lựa chọn.');
  } else if (op === 'undo') {
    const original = p.originals[m.id];
    if (original == null) { Codi.ui.toast('Không còn bản code trước khi áp dụng để hoàn tác.'); return; }
    setEditorValue(ta, original); delete p.originals[m.id];
    Codi.ui.toast('Đã hoàn tác, code trở lại như trước.');
    await command(p, { type: 'diff', messageId: m.id, state: null }, 'Chưa lưu được lựa chọn.');
  }
}
function rerunAction(p) {
  if (!wide() && p.handle) p.handle.close();
  if (Codi.code && Codi.code.runTests) Codi.code.runTests(p.courseId, p.lessonId);
}
async function copyAction(text) {
  try { await navigator.clipboard.writeText(text); Codi.ui.toast('Đã sao chép câu trả lời.'); }
  catch { Codi.ui.toast('Hãy chọn và sao chép nội dung câu trả lời.'); }
}

// S11h — private question to the lecturer, pre-filled with the tutor context (shown in the lecturer inbox).
function EscalateForm({ handle, p, defaultText, lecturerName, code, failing }) {
  const [text, setText] = useState(defaultText);
  const [withCode, setWithCode] = useState(!!code);
  const [withTest, setWithTest] = useState(!!failing);
  const [withSummary, setWithSummary] = useState(true);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const tooShort = text.trim().length < ESCALATE_MIN;
  const onSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (tooShort || pending) return;
    setPending(true); setError(null);
    try {
      p.view = await api.post(tutorUrl(p), {
        type: 'escalate', text: text.trim().slice(0, 4000), withSummary,
        ...(code && withCode ? { code: clip(code, LIMITS.code) } : {}),
        ...(failing && withTest ? { failingTest: clip(failing.name, 200) } : {}),
      });
      handle.close(); refresh();
      Codi.ui.toast('Đã gửi câu hỏi cho giảng viên. Bạn sẽ nhận thông báo khi có trả lời.', { type: 'success' });
    } catch (err) {
      setError(errText(err, 'Chưa gửi được câu hỏi. Vui lòng thử lại.'));
    } finally {
      setPending(false);
    }
  };
  const options = [
    code && { key: 'code', label: 'Code hiện tại của bạn', checked: withCode, set: setWithCode },
    failing && { key: 'test', label: `Test chưa đạt: ${failing.name}`, checked: withTest, set: setWithTest },
    { key: 'summary', label: 'Tóm tắt trao đổi với AI trợ lý', checked: withSummary, set: setWithSummary },
  ].filter(Boolean);
  return (
    <form className="stack-4" noValidate onSubmit={onSubmit}>
      <p className="small muted">Chỉ bạn và {lecturerName || 'giảng viên của khoá'} xem được cuộc trao đổi này.</p>
      <div className={`field ${touched && tooShort ? 'is-invalid' : ''}`.trim()}>
        <label htmlFor="tl-text">Câu hỏi của bạn</label>
        <textarea id="tl-text" name="text" rows={4} maxLength={4000} value={text} disabled={pending} aria-invalid={touched && tooShort ? 'true' : undefined} aria-describedby="tl-text-help"
          onChange={(e) => setText(e.target.value)} onBlur={() => setTouched(true)} />
        <span id="tl-text-help" className={touched && tooShort ? 'field-error' : 'field-help'}>{touched && tooShort ? `Câu hỏi cần ít nhất ${ESCALATE_MIN} ký tự để giảng viên hiểu rõ.` : `Ít nhất ${ESCALATE_MIN} ký tự.`}</span>
      </div>
      <fieldset className="stack-1">
        <legend className="small"><strong>Gửi kèm</strong></legend>
        {options.map((o) => <label key={o.key} className="check"><input type="checkbox" checked={o.checked} disabled={pending} onChange={(e) => o.set(e.target.checked)} /> {o.label}</label>)}
      </fieldset>
      {error ? <Alert type="danger" body={error} /> : null}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => handle.close()}>Huỷ</button>
        <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending ? 'true' : undefined}>Gửi cho giảng viên</button>
      </div>
    </form>
  );
}
function escalateAction(p) {
  if (!p) return;
  const b = bridge(p);
  const lastQ = ((p.view && p.view.messages) || []).filter((m) => m.role === 'user').pop();
  const props = { p, defaultText: lastQ ? lastQ.text : '', lecturerName: p.view ? p.view.lecturerName : null, code: b ? b.code : '', failing: b && !p.removed.test ? b.failing : null };
  Codi.ui.modal({ title: 'Hỏi riêng giảng viên', body: (handle) => <EscalateForm handle={handle} {...props} /> });
}

// ───────────────────────── rendering ─────────────────────────
function chipsFor(p, title) {
  const b = bridge(p);
  const sel = p.ctx.selection;
  return [
    { id: 'lesson', label: `Bài: ${title}`, fixed: true },
    b && b.task ? { id: 'task', label: `Yêu cầu: ${short(b.task.label)}` } : null,
    b ? { id: 'code', label: `Code bạn đang viết${b.code.length > LIMITS.code ? ' · đã rút gọn' : ''}` } : null,
    b && b.failing ? { id: 'test', label: `Test chưa đạt: ${b.failing.name}` } : null,
    b && b.runError ? { id: 'err', label: `Lỗi: ${short(b.runError)}` } : null,
    sel ? { id: 'sel', label: `Đoạn đã chọn · ${sel.split('\n').length} dòng${sel.length > LIMITS.selection ? ' · đã rút gọn' : ''}` } : null,
  ].filter(Boolean);
}
const escalateBtn = (p, cls = 'btn-secondary') => (
  <button type="button" className={`btn ${cls} btn-sm`} onClick={() => escalateAction(p)}><Icon name="message-circle" className="icon-sm" /> Hỏi giảng viên</button>
);
function diffView(p, m) {
  const d = m.diff; if (!d) return null;
  const applied = d.state === 'applied';
  return (
    <div className="tutor-diff2" role="group" aria-label={`Đề xuất thay đổi${applied ? ' (đã áp dụng)' : ''}`}>
      <div className="tutor-diff2-head"><span>Đề xuất thêm {d.add.length} dòng · trước dòng {d.at}</span>{applied ? <span className="badge badge-success">Đã áp dụng</span> : d.state === 'skipped' ? <span className="badge badge-neutral">Đã bỏ qua</span> : null}</div>
      <pre className="tutor-diff2-code">{d.add.map((line, k) => <span key={k} className="is-add">+ {line}{'\n'}</span>)}<span className="is-ctx">  {d.context}</span></pre>
      {d.state === 'skipped' ? null : (
        <div className="tutor-diff2-actions">
          {applied ? (
            <>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => rerunAction(p)}><Icon name="play" className="icon-sm" /> Chạy lại test</button>
              {p.originals[m.id] != null ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => diffAction(p, m, 'undo')}><Icon name="rotate-ccw" className="icon-sm" /> Hoàn tác</button> : null}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => diffAction(p, m, 'apply')}>Áp dụng</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => diffAction(p, m, 'skip')}>Bỏ qua</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
function msgView(p, m, i, codeOpen) {
  const key = m.id || i;
  if (m.role === 'user') return <div key={key} className="msg msg-user">{m.text}</div>;
  if (m.role === 'limit') {
    return <Alert key={key} type="warn" title="Bạn đã hỏi quá nhiều trong thời gian ngắn" body="Thử lại sau ít phút, hoặc hỏi riêng giảng viên." actions={escalateBtn(p)} />;
  }
  if (m.role === 'error') {
    return <Alert key={key} type="danger" title="AI trợ lý tạm thời không khả dụng" body="Câu hỏi chưa được trả lời. Bạn vẫn học tiếp bình thường."
      actions={<><button type="button" className="btn btn-secondary btn-sm" disabled={!!p.busy} onClick={() => retryRow(p, i)}><Icon name="rotate-ccw" className="icon-sm" /> Thử lại</button>{escalateBtn(p, 'btn-ghost')}</>} />;
  }
  return (
    <div key={key} className="msg msg-ai msg-md">
      <Md text={m.text} />{m.stopped ? <p className="xsmall muted">Đã dừng câu trả lời.</p> : null}
      {codeOpen && (m.lines || []).length ? (
        <span className="tutor-lines">
          {m.lines.map((n) => <button key={n} type="button" className="tutor-lineref" onClick={() => lineAction(p, n)}><Icon name="code" className="icon-sm" /> Xem dòng {n}</button>)}
        </span>
      ) : null}
      {codeOpen ? diffView(p, m) : null}
      {feedbackRow('tutor', m, i, {
        onChange: () => { refresh(); voteAction(p, m); },
        before: <button type="button" className="ai-feedback-btn" aria-label="Sao chép câu trả lời" onClick={() => copyAction(m.text)}><Icon name="copy" className="icon-sm" /></button>,
        after: m.vote === 'down' ? <span className="tutor-feedback-escalate">{escalateBtn(p, 'btn-ghost')}</span> : null,
      })}
    </div>
  );
}
function convStatus(p) {
  const c = p.view && p.view.conversation; if (!c) return null;
  return (
    <div className="tutor-status">
      <button type="button" className="tutor-status-row" aria-expanded={String(!!p.convOpen)} onClick={() => { p.convOpen = !p.convOpen; refresh(); }}>
        <span className={`tutor-status-dot ${c.replied || c.resolved ? 'is-done' : 'is-wait'}`} aria-hidden="true" />
        <span className="tutor-status-text">Câu hỏi riêng cho giảng viên · {c.resolved ? 'Đã giải quyết' : c.replied ? 'Đã có trả lời' : 'Đang chờ trả lời'}</span>
        <Icon name={p.convOpen ? 'chevron-down' : 'chevron-right'} className="icon-sm" />
      </button>
      {p.convOpen ? <div className="tutor-status-body"><p className={c.replied ? '' : 'muted'}>{c.replied && c.lastReply ? c.lastReply : 'Bạn sẽ nhận thông báo khi giảng viên trả lời.'}</p></div> : null}
    </div>
  );
}

/**
 * The thread. variant 'sidebar' is the docked panel inside a lesson, 'embed' the lesson tab; 'page' is the full Tutor
 * page, which renders the same thread without code context. onPickLesson (page only) adds "Chọn bài khác…".
 */
export function TutorPanel({ p, onPickLesson, placeholder, title: fallbackTitle }) {
  const v = useTutorVersion();
  const rootRef = useRef(null); const inputRef = useRef(null); const menuRef = useRef(null); const addRef = useRef(null);
  const [q, setQ] = useState('');
  const busy = p.busy;

  // Keep the log scrolled to the end after every repaint.
  useLayoutEffect(() => {
    const scroller = rootRef.current && rootRef.current.closest('.sheet-body, .tutor-page-scroll, [data-tutor-scroll]');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [v]);
  // Re-focus the composer when it becomes enabled again, if the learner was typing there.
  const hadFocus = useRef(false);
  useEffect(() => { if (!busy && hadFocus.current && inputRef.current) inputRef.current.focus(); }, [busy]);
  useEffect(() => { if (!busy && p.loaded && p.queued) { const next = p.queued; p.queued = null; ask(p, next); } });

  const view = p.view;
  const title = (view && view.lessonTitle) || fallbackTitle || 'bài học';
  const log = (view && view.messages) || [];
  const isCode = !!(view && view.isCode);
  const level = isCode ? view.hintLevel : 0;
  const all = chipsFor(p, title);
  const chips = all.filter((c) => !p.removed[c.id]);
  const addable = all.filter((c) => p.removed[c.id]);
  const codeOpen = !!bridge(p);
  const closeMenus = () => { [menuRef, addRef].forEach((r) => { if (r.current) r.current.open = false; }); };
  const onSubmit = (e) => {
    e.preventDefault();
    const t = q.trim();
    if (!t || busy || !p.loaded) return;
    hadFocus.current = document.activeElement === inputRef.current;
    setQ('');
    ask(p, t);
  };
  const empty = p.loaded && !log.length && !busy && !p.failure;

  return (
    <div className={`ai-panel tutor ${p.variant === 'page' ? 'is-page' : p.variant === 'embed' ? 'is-embed' : ''}`.trim()} ref={rootRef}>
      <div className="tutor-bar">
        <ul className="tutor-chips" aria-label="Ngữ cảnh gửi kèm câu hỏi">
          {chips.map((c) => (
            <li key={c.id} className="tutor-chip"><span className="tutor-chip-label">{c.label}</span>{c.fixed ? null : (
              <button type="button" aria-label={`Bỏ “${c.label}” khỏi ngữ cảnh`} onClick={() => { p.removed[c.id] = true; refresh(); }}><Icon name="x" className="icon-sm" /></button>
            )}</li>
          ))}
        </ul>
        {p.variant !== 'page' ? (
          <Link to={pageHref(p.courseId, p.lessonId)} className="btn btn-ghost btn-icon btn-sm" aria-label="Mở trang Tutor" title="Mở trang Tutor"><Icon name="external-link" className="icon-sm" /></Link>
        ) : null}
        <details className="tutor-menu" ref={menuRef}>
          <summary className="btn btn-ghost btn-icon btn-sm" aria-label="Thêm thao tác"><Icon name="more-horizontal" className="icon-sm" /></summary>
          <div className="tutor-menu-list" role="menu">
            <button type="button" role="menuitem" onClick={() => { closeMenus(); escalateAction(p); }}><Icon name="message-circle" className="icon-sm" /> Hỏi riêng giảng viên</button>
            <button type="button" role="menuitem" className="is-danger" disabled={!log.length || !!busy} onClick={() => { closeMenus(); clearAction(p); }}><Icon name="trash" className="icon-sm" /> Xoá cuộc trò chuyện</button>
          </div>
        </details>
      </div>
      {convStatus(p)}
      <div className="ai-panel-log">
        {p.loadError ? (
          <Alert type="danger" title="Chưa tải được AI trợ lý" body={p.loadError}
            actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => load(p)}><Icon name="rotate-ccw" className="icon-sm" /> Thử lại</button>} />
        ) : null}
        {!p.loaded && !p.loadError ? <p className="row muted small" role="status"><Icon name="loader" className="icon-sm cp-spin" /> Đang tải AI trợ lý…</p> : null}
        {empty ? (
          <div className="ai-panel-empty">
            <span className="ai-panel-empty-title">Hỏi về bài “{title}”</span>
            <ul className="ai-panel-prompts">
              {starters(isCode).map((t) => <li key={t}><button type="button" className="ai-panel-prompt" onClick={() => ask(p, t)}><span>{t}</span><Icon name="arrow-right" className="icon-sm" /></button></li>)}
            </ul>
            <p className="ai-disclaimer">{isCode ? 'AI chỉ ra hướng và chỗ cần xem, không viết sẵn lời giải. ' : ''}AI có thể trả lời sai, hãy đối chiếu với tài liệu bài học.</p>
            <button type="button" className="btn-link xsmall tutor-rules-link" onClick={rules}>Lưu ý khi dùng trợ lý AI</button>
          </div>
        ) : null}
        {p.loaded ? (
          <div className="chat-log" aria-live="polite">
            {log.map((m, i) => msgView(p, m, i, codeOpen))}
            {p.pendingUser ? <div className="msg msg-user">{p.pendingUser}</div> : null}
            {busy === 'streaming' && p.streaming ? (
              <div className="msg msg-ai msg-md" aria-busy="true">
                <Md text={p.streaming.text} />
                <div className="ai-thinking-row"><button type="button" className="btn btn-ghost btn-sm" onClick={() => stopAction(p)}><Icon name="x" className="icon-sm" /> Dừng</button></div>
              </div>
            ) : null}
            {busy === 'thinking' ? (
              <div className="ai-thinking-row" aria-busy="true">
                <span className="typing" aria-hidden="true"><i /><i /><i /></span><span>Codi đang suy nghĩ…</span>
                {p.abort ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => stopAction(p)}><Icon name="x" className="icon-sm" /> Dừng</button> : null}
              </div>
            ) : null}
            {p.failure ? (
              <Alert type="danger" title={UNAVAILABLE} body={p.failure.message}
                actions={<>{p.failure.retry ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => { const f = p.failure; p.failure = null; f.retry(); }}><Icon name="rotate-ccw" className="icon-sm" /> Thử lại</button> : null}{escalateBtn(p, 'btn-ghost')}</>} />
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="ai-panel-composer">
        {isCode ? (
          <div className="tutor-hintbar">
            {level < HINT_MAX
              ? <button type="button" className="tutor-hint-btn" disabled={!!busy || !p.loaded} onClick={() => hintAction(p)}><Icon name="lightbulb" className="icon-sm" /><span>Gợi ý {level + 1}/{HINT_MAX} · {HINT_NAMES[level]}</span></button>
              : <span className="xsmall muted">Đã dùng hết 3 gợi ý. Cần thêm trợ giúp? Hỏi riêng giảng viên.</span>}
            {level > 0 ? <span className="xsmall muted">Đã dùng {level}/{HINT_MAX} gợi ý</span> : null}
            {level >= HINT_MAX ? escalateBtn(p, 'btn-ghost') : null}
          </div>
        ) : null}
        <div className="tutor-modes" role="radiogroup" aria-label="Cách trả lời">
          {MODES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={p.mode === m} className="ai-chip ai-chip-sm" onClick={() => { p.mode = m; refresh(); }}>{MODE_LABELS[m]}</button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="tutor-form">
          <details className="tutor-menu tutor-add" ref={addRef}>
            <summary className="btn btn-secondary btn-icon" aria-label="Thêm ngữ cảnh"><Icon name="plus" className="icon-sm" /></summary>
            <div className="tutor-menu-list is-up" role="menu">
              {addable.map((c) => <button key={c.id} type="button" role="menuitem" onClick={() => { delete p.removed[c.id]; refresh(); }}>{c.label}</button>)}
              {onPickLesson ? <button type="button" role="menuitem" onClick={onPickLesson}>Chọn bài khác…</button> : null}
              {!addable.length && !onPickLesson ? <button type="button" role="menuitem" disabled>Không có ngữ cảnh nào để thêm</button> : null}
            </div>
          </details>
          <label className="sr-only" htmlFor={`tutor-q-${p.variant}`}>Câu hỏi cho AI trợ lý</label>
          <input ref={inputRef} id={`tutor-q-${p.variant}`} name="q" className="input" placeholder={placeholder || 'Hỏi trợ lý về bài học…'} autoComplete="off" maxLength={2000}
            disabled={!!busy || !p.loaded} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-primary btn-icon" type="submit" aria-label="Gửi câu hỏi" disabled={!!busy || !p.loaded || !q.trim()}><Icon name="send" className="icon-sm" /></button>
        </form>
      </div>
    </div>
  );
}

function rules() {
  Codi.ui.modal({
    title: 'Lưu ý khi dùng trợ lý AI',
    body: (
      <div className="stack-3">
        <p className="muted">Trợ lý AI giúp bạn hiểu bài, không thay bạn làm bài.</p>
        <ul className="tutor-rules">
          <li>Trợ lý có thể trả lời sai. Hãy đối chiếu với tài liệu bài học.</li>
          <li>Trợ lý không chấm điểm và không đổi điểm của bạn.</li>
          <li>Với bài code, trợ lý chỉ gợi ý hướng làm, không viết sẵn lời giải.</li>
          <li>Câu trả lời dùng nội dung bài học và phần code, lỗi, test bạn đang mở. Bạn có thể bỏ bớt từng phần trong khung ngữ cảnh.</li>
          <li>Cần người thật giúp, hãy hỏi riêng giảng viên.</li>
        </ul>
      </div>
    ),
  });
}

// ───────────────────────── embedded panel (lesson page tab) ─────────────────────────
// While a lesson page shows the tutor inside its own tab, every open() for that lesson (explain error, selection
// toolbar, "Hỏi AI trợ lý") lands in that tab instead of a docked sheet: the host is asked to show the tab.
let embedded = null; // { p, activate, handle }
function TutorEmbed({ courseId, lessonId, onActivate, title }) {
  const [p] = useState(() => session(courseId, lessonId, 'embed'));
  const activate = useRef(onActivate);
  activate.current = onActivate;
  useEffect(() => {
    const host = {
      p,
      activate: () => { if (typeof activate.current === 'function') activate.current(); },
      handle: { embedded: true, close() { /* the tab belongs to the page; nothing to close */ } },
    };
    embedded = host;
    load(p);
    return () => { stopAction(p); if (embedded === host) embedded = null; };
  }, [p]);
  return <TutorPanel p={p} title={title} />;
}
const focusComposer = (id) => setTimeout(() => { const q = document.getElementById(id); if (q && !q.disabled && wide()) q.focus(); }, 350);

// ───────────────────────── public API ─────────────────────────
function pageHref(courseId, lessonId) {
  return `/learn/${encodeURIComponent(courseId)}/tutor${lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : ''}`;
}
const tutor = {
  open(courseId, lessonId, ctx) {
    if (!courseId || !lessonId) return null;
    ctx = ctx || {};
    if (embedded && embedded.p.courseId === courseId && embedded.p.lessonId === lessonId) {
      const p = embedded.p;
      p.ctx = { selection: ctx.selection || p.ctx.selection, testId: ctx.testId || p.ctx.testId }; p.removed = {};
      refresh();
      embedded.activate();
      if (ctx.ask) ask(p, ctx.ask);
      else focusComposer('tutor-q-embed');
      return embedded.handle;
    }
    if (panel && panel.handle && panel.lessonId === lessonId) {
      // already open on this lesson: add the new context, removed chips come back
      panel.ctx = { selection: ctx.selection || panel.ctx.selection, testId: ctx.testId || panel.ctx.testId }; panel.removed = {};
      refresh();
    } else {
      if (panel) stopAction(panel);
      Codi.ui.closeAll();
      const p = session(courseId, lessonId, 'sidebar');
      p.ctx = { selection: ctx.selection, testId: ctx.testId };
      panel = p;
      p.handle = Codi.ui.sheet({ docked: true, title: 'Trợ lý AI', body: () => <TutorPanel p={p} />, onClose: () => { stopAction(p); if (panel === p) panel = null; } });
      load(p);
    }
    if (ctx.ask) ask(panel, ctx.ask);
    else focusComposer('tutor-q-sidebar');
    return panel && panel.handle;
  },
  explainError(courseId, lessonId, testId) {
    const b = Codi.code && Codi.code.bridge ? Codi.code.bridge(courseId, lessonId, testId) : null;
    const ft = b ? b.failing : null;
    tutor.open(courseId, lessonId, { testId, ask: ft ? `Giải thích giúp mình vì sao test “${ft.name}” chưa đạt?` : 'Giải thích giúp mình lỗi ở lần chạy gần nhất?' });
  },
  // Syntax / runtime / timeout error from the console: the error text, code and line go along as context.
  explainRunError(courseId, lessonId) {
    const b = Codi.code && Codi.code.bridge ? Codi.code.bridge(courseId, lessonId) : null;
    const err = b ? b.runError : null;
    tutor.open(courseId, lessonId, { ask: err ? `Code của mình báo lỗi “${err.slice(0, 80)}”. Lỗi này nghĩa là gì và mình nên xem chỗ nào?` : 'Giải thích giúp mình lỗi ở lần chạy gần nhất?' });
  },
  embed(courseId, lessonId, opts) {
    return <TutorEmbed key={`${courseId}:${lessonId}`} courseId={courseId} lessonId={lessonId} onActivate={opts && opts.onActivate} title={opts && opts.title} />;
  },
  rules,
  pageHref,
};

Object.assign(Codi, { tutor, aiFeedbackRow: feedbackRow });

/** Internals the full Tutor page reuses (same feature folder). */
export const tutorInternals = { session, load, pageHref, stopAction };

// ───────────────────────── S11a' selection toolbar ─────────────────────────
// Selecting lesson text or code shows a small toolbar that opens the tutor with that selection.
let selText = '';
const bar = document.createElement('div');
bar.className = 'tutor-seltool'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Hỏi AI về đoạn đã chọn'); bar.hidden = true;
const SEL_ACTIONS = {
  code: [['Giải thích đoạn này', 'Giải thích giúp mình đoạn code này.'], ['Vì sao lỗi?', 'Vì sao đoạn code này bị lỗi hoặc cho kết quả sai?']],
  text: [['Giải thích', 'Giải thích giúp mình đoạn này.'], ['Cho ví dụ', 'Cho mình một ví dụ khác về đoạn này.'], ['Hỏi thêm', '']],
};
function paintBar(kind) {
  bar.textContent = '';
  SEL_ACTIONS[kind].forEach(([label, q], n) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `btn ${n === 0 ? 'btn-primary' : 'btn-ghost'} btn-sm`; b.textContent = label; b.dataset.ask = q;
    bar.appendChild(b);
  });
}
const lessonRoute = () => { const m = /^\/learn\/([^/?]+)\/([^/?]+)/.exec(window.location.pathname || ''); return m && m[2] !== 'tutor' && m[2] !== 'onboarding' ? m : null; };
const hideBar = () => { bar.hidden = true; selText = ''; };
function readSelection(ev) {
  if (!lessonRoute()) return hideBar();
  const a = document.activeElement;
  let text = ''; let rect = null; let kind = 'text';
  if (a && a.classList && a.classList.contains('cp-textarea') && a.selectionEnd > a.selectionStart) {
    text = a.value.slice(a.selectionStart, a.selectionEnd); kind = 'code';
    const r = a.getBoundingClientRect();
    rect = ev && ev.clientX ? { left: ev.clientX, top: ev.clientY - 12 } : { left: r.left + 80, top: r.top };
  } else {
    const s = window.getSelection();
    const node = s && s.rangeCount ? s.anchorNode : null;
    const host = node && (node.nodeType === 1 ? node : node.parentElement);
    if (host && host.closest('#app-main') && !host.closest('.overlay, .tutor-seltool, input, textarea, button, [role="dialog"]')) {
      text = s.toString();
      const r = s.getRangeAt(0).getBoundingClientRect(); rect = { left: r.left + r.width / 2, top: r.top };
    }
  }
  text = text.trim();
  if (text.length < 3 || !rect) return hideBar();
  selText = text.slice(0, LIMITS.selection);
  paintBar(kind);
  bar.hidden = false;
  const w = bar.offsetWidth || 270;
  bar.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left - w / 2)) + 'px';
  bar.style.top = Math.max(8, rect.top - 52) + 'px';
}
if (document.body) document.body.appendChild(bar);
else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(bar));
const onUp = (e) => { if (!bar.contains(e.target)) setTimeout(() => readSelection(e instanceof MouseEvent ? e : null), 0); };
document.addEventListener('mouseup', onUp);
document.addEventListener('touchend', onUp);
document.addEventListener('keyup', (e) => { if (e.key === 'Escape') hideBar(); else if (e.shiftKey) readSelection(null); });
window.addEventListener('popstate', hideBar);
window.addEventListener('scroll', hideBar, true);
bar.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection while clicking
bar.addEventListener('click', (e) => {
  const b = e.target.closest('button'); const m = lessonRoute();
  if (!b || !m || !selText) return;
  const text = selText; hideBar();
  tutor.open(decodeURIComponent(m[1]), decodeURIComponent(m[2]), { selection: text, ask: b.dataset.ask || undefined });
});
