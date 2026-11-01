/**
 * Codi AI tutor — React port of the real tutor (apps/web components/ai-tutor/*, lib/ai-tutor-contract.ts), with the
 * mockup's ai-tutor.js filling the gaps. Answers stay simulated (rule-based, never a full solution); every real UI
 * state is kept. Installs Codi.tutor and Codi.aiFeedbackRow.
 *
 * PUBLIC API
 *   Codi.tutor.open(courseId, lessonId, ctx?) → sheet handle | null
 *       Docked "Trợ lý AI" panel beside the lesson. ctx: { selection?: string, testId?: string, ask?: string } — `ask`
 *       is sent once the thread has loaded. Opening again on the same lesson merges the new context (removed chips
 *       come back).
 *   Codi.tutor.explainError(courseId, lessonId, testId)   opens the panel and asks why that test failed
 *   Codi.tutor.explainRunError(courseId, lessonId)        opens the panel and asks about the last syntax/runtime/timeout error
 *   Codi.tutor.launcher(courseId, lessonId) → element     round AI button + compact popup (real TutorLauncher)
 *   Codi.tutor.rules()                                     "Lưu ý khi dùng trợ lý AI" dialog
 *   Codi.tutor.threads(courseId, userId?) → [{lessonId, lessonTitle, firstQuestion, lastAt, messageCount}] newest first
 *   Codi.tutor.pageHref(courseId, lessonId?) → '/learn/:courseId/tutor[?lesson=…]'
 *   Codi.aiFeedbackRow(prefix, message, index, opts?) → element
 *       Quiet 👍/👎 row; after 👎 a one-tap reason. Clicking mutates `message.vote` / `message.reason` in place and then
 *       calls opts.onChange() — default `Codi.set(null)` (persist + re-render). opts.before / opts.after: extra nodes
 *       rendered at the start / end of the row.
 *
 * Rules the panel follows (STATE-MACHINES §13, real contract):
 *  - Never writes a full solution. The hint ladder has 3 steps (Hướng nghĩ → Chỗ cần xem lại → Khung cách làm), only
 *    on code lessons; every step taken is recorded in db.hintUsage.
 *  - Three answer modes: Giải thích đơn giản · Gợi ý từng bước · Ôn lại khái niệm.
 *  - A code change suggestion is at most 3 lines and is applied only on "Áp dụng"; "Hoàn tác" restores the exact code.
 *  - 8 questions per 60 s per learner, then a stored "limit" row. Scenario flag aiAssistant forces the async states:
 *    ok | thinking (stays until "Dừng") | ratelimit | error | loadfail (thread cannot load).
 *  - One thread per learner + lesson in db.tutorThreads (id `tt-<userId>-<lessonId>`, max 40 messages). Rows from the
 *    old per-session slice state.aiLessonChats are moved over on first write.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Icon, Md, Alert, stream } from '../../components/ui/primitives';
import { setEditorValue } from './code-api';

const uid = () => Codi.state.currentUserId;
const LOG_MAX = 40;
const HINT_MAX = 3;
const HINT_NAMES = ['Hướng nghĩ', 'Chỗ cần xem lại', 'Khung cách làm'];
const DOWN_REASONS = ['Chưa đúng', 'Khó hiểu', 'Lộ lời giải', 'Không liên quan bài'];
export const MODES = ['simple', 'step', 'review'];
export const MODE_LABELS = { simple: 'Giải thích đơn giản', step: 'Gợi ý từng bước', review: 'Ôn lại khái niệm' };
// Context the learner sees as chips is exactly what the answer reads; longer values are cut ("đã rút gọn").
const LIMITS = { task: 3000, selection: 1200, code: 12000, error: 1000, test: 600 };
const RATE_MAX = 8;
const RATE_WINDOW_MS = 60000;
const ESCALATE_MIN = 10;
const STOPPED_TEXT = 'Bạn đã dừng câu trả lời này.';
const LOAD_MS = 300;
const wide = () => window.matchMedia('(min-width: 1024px)').matches;
const now = () => new Date().toISOString();
const clip = (v, max) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);
const short = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 60 ? s.slice(0, 57) + '…' : String(s); };

export const starters = (isCode) => (isCode
  ? ['Vì sao code của mình chưa chạy đúng?', 'Giải thích lại yêu cầu của bài', 'Lỗi hay gặp ở bài này là gì?']
  : ['Tóm tắt ý chính của bài', 'Cho mình một ví dụ khác', 'Lỗi hay gặp ở bài này là gì?']);
/** First name in Vietnamese order, where the given name is the last word ("Nguyễn Minh Anh" → "Anh"). */
export const firstNameOf = (name) => { const parts = String(name || '').trim().split(/\s+/).filter(Boolean); return parts.length ? parts[parts.length - 1] : null; };

// Repaint for tutor views (panel, page, launcher): a local version the components subscribe to.
let ver = 0;
const subs = new Set();
const refresh = () => { ver += 1; subs.forEach((f) => f()); };
export const useTutorVersion = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => ver);

// ───────────────────────── feedback row (shared with the /ai advisor) ─────────────────────────
function feedbackRow(prefix, m, i, opts) {
  const save = (opts && opts.onChange) || (() => Codi.set(null));
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
const threadId = (userId, lessonId) => `tt-${userId}-${lessonId}`;
function threadRows() { const db = Codi.db(); if (!db.tutorThreads) db.tutorThreads = []; return db.tutorThreads; }
const legacyLog = (lessonId) => { const all = Codi.state.aiLessonChats; return all && Array.isArray(all[uid() + ':' + lessonId]) ? all[uid() + ':' + lessonId] : null; };
/** Messages of the learner's thread on a lesson (read only; [] when none). */
function readLog(p) {
  const t = (Codi.db().tutorThreads || []).find((x) => x.id === threadId(uid(), p.lessonId));
  return t ? t.messages : legacyLog(p.lessonId) || [];
}
/** The thread's message array for writing (creates the row, moves a legacy slice thread over). */
function writeLog(p) {
  const id = threadId(uid(), p.lessonId);
  let t = threadRows().find((x) => x.id === id);
  if (!t) {
    const legacy = legacyLog(p.lessonId);
    t = { id, userId: uid(), courseId: p.courseId, lessonId: p.lessonId, messages: legacy ? legacy.map((m, n) => ({ id: m.id || `tm-legacy-${n}`, ...m })) : [], updatedAt: now() };
    threadRows().push(t);
    if (legacy) delete Codi.state.aiLessonChats[uid() + ':' + p.lessonId];
  }
  return t.messages;
}
function persist(p) {
  const t = threadRows().find((x) => x.id === threadId(uid(), p.lessonId));
  if (t) { if (t.messages.length > LOG_MAX) t.messages.splice(0, t.messages.length - LOG_MAX); t.updatedAt = now(); }
  Codi.set(null, { render: false });
}
const msgId = () => Codi.uid('tm');
const lessonOf = (p) => Codi.lesson(Codi.course(p.courseId), p.lessonId);

/** Thread summaries for the history list: one per lesson with at least one question, newest first. */
function threadsFor(courseId, userId) {
  const u = userId || uid(); const c = Codi.course(courseId);
  if (!c || !u) return [];
  return (Codi.db().tutorThreads || [])
    .filter((t) => t.userId === u && t.courseId === c.id)
    .map((t) => {
      const l = Codi.lesson(c, t.lessonId);
      const first = t.messages.find((m) => m.role === 'user');
      const last = t.messages[t.messages.length - 1];
      return l && first ? { lessonId: t.lessonId, lessonTitle: l.title, firstQuestion: first.text, lastAt: (last && last.at) || t.updatedAt, messageCount: t.messages.length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
}

function attempt(l) {
  return (Codi.db().codeAttempts || []).find((x) => x.userId === uid() && x.lessonId === l.id) || null;
}
function lastRun(l) {
  const e = attempt(l); if (!e) return null;
  return l.code.kind === 'tutorial' ? (e.stepRuns || {})[e.tutorialStep] : e.lastRun;
}
// The lesson's code editor on screen (challenge key ch:<course>:<lesson>, tutorial key tu:<course>:<lesson>:<step>).
function editorEl(p) {
  return document.querySelector(`[data-cp-input="ch:${p.courseId}:${p.lessonId}"], [data-cp-input^="tu:${p.courseId}:${p.lessonId}:"]`);
}
function currentCode(p, l) {
  const ta = editorEl(p); if (ta) return ta.value;
  const e = attempt(l);
  if (l.code.kind === 'tutorial') {
    const step = e ? e.tutorialStep || 0 : 0;
    return (e && e.stepDrafts && e.stepDrafts[step] !== undefined ? e.stepDrafts[step] : (l.code.steps[step] || {}).starter) || '';
  }
  return (e && e.draft !== null && e.draft !== undefined ? e.draft : l.code.starter) || '';
}
/**
 * What the lesson's code editor lends the tutor (real TutorCodeBridge): null on the full Tutor page, outside code
 * lessons and while the tutorial's solution step is still hidden.
 */
function bridge(p, l) {
  if (p.variant === 'page' || !l || !l.code || !Codi.code) return null;
  const task = Codi.code.task(l);
  if (l.code.kind === 'tutorial' && !task) return null;
  return {
    task,
    code: currentCode(p, l),
    failing: Codi.code.failingTest(l, p.ctx.testId),
    runError: Codi.code.runError(l),
    run: lastRun(l),
  };
}
// Line the hints point at: the first `return` (where wrong values usually surface), else the 2nd non-empty line.
function targetLine(code) {
  const lines = code.split('\n');
  let i = lines.findIndex((s) => /\breturn\b/.test(s));
  if (i < 0) i = lines.findIndex((s, n) => n > 0 && s.trim());
  if (i < 0) i = 0;
  return { n: i + 1, text: lines[i] || '', indent: (/^\s*/.exec(lines[i] || '') || [''])[0] };
}
// Where a run error most likely comes from: the line the runner reported, else the first line using the name the
// error mentions ("x is not defined", "x is not a function", "reading 'y'"), else the first loop for a timeout.
function errorLine(code, run) {
  const lines = code.split('\n'); const err = run.error || '';
  if (run.line && run.line <= lines.length) return { n: run.line, text: lines[run.line - 1] };
  const m = /ReferenceError: (\S+) is not defined/.exec(err) || /TypeError: (?:\S+\.)?([\w$]+) is not a function/.exec(err) || /reading '([\w$]+)'/.exec(err);
  if (m) { const re = new RegExp('(^|[^\\w$])' + m[1].replace(/\$/g, '\\$') + '([^\\w$]|$)'); const i = lines.findIndex((s) => re.test(s) && !/^\s*\/\//.test(s)); if (i >= 0) return { n: i + 1, text: lines[i], name: m[1] }; }
  if (run.phase === 'timeout') { const i = lines.findIndex((s) => /\b(while|for)\b/.test(s)); if (i >= 0) return { n: i + 1, text: lines[i], loop: true }; }
  return null;
}
function hintLevel(l) {
  return (Codi.db().hintUsage || []).filter((h) => h.userId === uid() && h.lessonId === l.id).reduce((m, h) => Math.max(m, h.level), 0);
}
function latestConversation(p) {
  const all = (Codi.db().conversations || []).filter((c) => c.learnerId === uid() && c.lessonId === p.lessonId);
  return all.length ? all[all.length - 1] : null;
}
function conceptNames(courseId, l) {
  const c = Codi.course(courseId);
  const ids = l.conceptIds || l.concepts || [];
  const fromCourse = ((c && c.concepts) || []).filter((k) => ids.includes(k.id)).map((k) => k.name);
  if (fromCourse.length) return fromCourse;
  const map = (Codi.db().knowledgeMaps || {})[courseId];
  return ((map && map.concepts) || []).filter((k) => (k.lessonIds || []).includes(l.id)).map((k) => k.name);
}

// ───────────────────────── answers (simulated, Socratic) ─────────────────────────
const SELF_CHECK = ['Với input của test, bạn tự tính tay thì ra kết quả gì?', 'Giá trị nào trong code khác với kết quả bạn tính tay?', 'Trường hợp đặc biệt (mảng rỗng, số âm) code đã xử lý chưa?'];
function modeLead(p, l) {
  if (p.mode === 'step') return 'Mình đi từng bước nhé. Trả lời câu hỏi kiểm tra bên dưới trước, rồi hỏi mình **bước tiếp theo**.';
  if (p.mode === 'review') {
    const concepts = conceptNames(p.courseId, l);
    return `**Ôn lại khái niệm.** ${concepts.length ? `Bài này dựa trên: ${concepts.join(', ')}.` : `Bài **${l.title}** dựa trên kiến thức của các bài trước trong chương.`} Thử nhắc lại bằng lời của bạn: khái niệm đó dùng để làm gì, và ví dụ nhỏ nhất bạn nghĩ ra là gì? Sau đó mình nối lại với câu hỏi của bạn.`;
  }
  return '';
}
const checklist = (p, items) => (p.mode === 'step' ? `**Câu hỏi kiểm tra:** ${items[0]}` : `Thử tự trả lời mấy câu này trước:\n${items.map((x) => `- ${x}`).join('\n')}`);
function answerFor(p, l) {
  const use = (id) => !p.removed[id];
  const sel = p.ctx.selection && use('sel') ? clip(p.ctx.selection, LIMITS.selection) : '';
  const b = bridge(p, l);
  const parts = []; const lines = [];
  const lead = modeLead(p, l); if (lead) parts.push(lead);
  if (sel) parts.push(`Về đoạn bạn chọn: \`${short(sel.split('\n')[0])}\``);
  if (b) {
    const ft = use('test') ? b.failing : null;
    const re = use('err') && b.run && b.run.phase && b.run.phase !== 'done' && b.run.error ? b.run : null;
    const code = use('code') ? clip(b.code, LIMITS.code) : '';
    const el = re && code ? errorLine(code, re) : null;
    if (ft) parts.push(`Ở test **${ft.name}**, kết quả mong đợi là \`${short(clip(String(ft.expected), LIMITS.test))}\` nhưng code đang trả về \`${short(clip(String(ft.actual), LIMITS.test))}\`.`);
    if (re) {
      // run-level error: say what kind it is, where it most likely is, and what to check — never the fix itself
      const kind = re.phase === 'syntax' ? 'Lỗi cú pháp — code chưa chạy được dòng nào' : re.phase === 'timeout' ? 'Code chạy quá lâu nên bị dừng' : 'Code bị dừng giữa chừng vì lỗi khi chạy';
      parts.push(`**${kind}.** Thông báo: \`${short(clip(re.error, LIMITS.error))}\``);
      if (Codi.code.explain(re.error)) parts.push(Codi.code.explain(re.error));
      if (el && el.name) parts.push(`Tên \`${el.name}\` xuất hiện lần đầu ở **dòng ${el.n}**: \`${short(el.text.trim())}\`. So tên này với chỗ bạn khai báo — sai chính tả, sai hoa/thường, hoặc khai báo sau khi dùng là các nguyên nhân hay gặp.`);
      else if (el && el.loop) parts.push(`Vòng lặp ở **dòng ${el.n}** có thể không bao giờ dừng. Kiểm tra điều kiện dừng và biến đếm có thay đổi sau mỗi vòng không.`);
      else if (el) parts.push(`Lỗi được báo ở **dòng ${el.n}**: \`${short(el.text.trim())}\`.`);
      else if (re.phase === 'syntax') parts.push('Đếm lại cặp ngoặc `(` `)` `{` `}` `[` `]`, dấu nháy và dấu phẩy giữa các phần tử — thường lỗi nằm ngay trước chỗ trình soạn báo.');
      if (el) lines.push(el.n);
    }
    if (!ft && !re) parts.push('Mình chưa thấy test nào chưa đạt ở lần chạy gần nhất. Bấm **Chạy** rồi hỏi lại nếu có test sai.');
    if (!re) parts.push(checklist(p, SELF_CHECK));
    if (code && !re) { const tl = targetLine(code); parts.push(`Bắt đầu từ **dòng ${tl.n}** — đặt một \`console.log\` ngay trước đó để xem giá trị thật.`); lines.push(tl.n); }
    if (use('task') && b.task && p.mode !== 'step') parts.push(`Đối chiếu lại với yêu cầu “${short(b.task.label)}”: kết quả của bạn đã đúng kiểu dữ liệu và đúng trường hợp đặc biệt mà yêu cầu nêu chưa?`);
    parts.push('Mình không viết sẵn lời giải. Cần thêm trợ giúp thì bấm **Gợi ý tiếp theo**.');
  } else if (l.code) {
    // Full Tutor page: no editor, so the answer is about the lesson only (real page passes no code bridge).
    parts.push(`Bài **${l.title}** là bài code. Ở trang này mình không đọc được code, test hay lỗi của bạn. Bấm **Mở đúng chỗ** để hỏi ngay trong bài, mình sẽ xem được code bạn đang viết.`);
    parts.push(checklist(p, ['Bạn đã hiểu yêu cầu cần trả về gì chưa? Viết ra 2–3 cặp input → output.', 'Chỗ nào trong yêu cầu bạn còn chưa chắc?', 'Bạn đã thử chạy test mẫu chưa, test nào chưa đạt?']));
    parts.push('Mình không viết sẵn lời giải.');
  } else {
    // Built from what the lesson really has; never a placeholder sentence that reads like a bug.
    const c = Codi.course(p.courseId); const ch = Codi.chapterOf(c, l.id);
    const idea = (l.reading || l.summary || '').toString().split('.')[0].trim();
    const concepts = conceptNames(p.courseId, l);
    if (idea) parts.push(`Ý chính của bài **${l.title}**: ${idea}.`);
    else parts.push(`Bài **${l.title}**${ch ? ` thuộc chương “${ch.title}”` : ''}${concepts.length ? `, tập trung vào ${concepts.join(', ')}` : ''}. Mình tóm tắt dựa trên tiêu đề và vị trí của bài, vì bài này chưa có phần đọc.`);
    parts.push(checklist(p, ['Nói lại bằng lời của bạn điều bài muốn bạn làm được', 'Làm lại ví dụ trong bài mà không nhìn tài liệu', 'Ghi ra một chỗ bạn còn chưa chắc rồi hỏi mình cụ thể chỗ đó']));
  }
  return { text: parts.join('\n\n'), lines };
}
function hintFor(p, l, level) {
  const b = bridge(p, l);
  const ft = b && !p.removed.test ? b.failing : null;
  if (level === 1) return { text: `**Gợi ý 1/3 · ${HINT_NAMES[0]}**\n\n${ft ? `Test **${ft.name}** đang sai. ` : ''}Đọc lại yêu cầu và tự hỏi: hàm cần trả về kiểu dữ liệu gì, và trong trường hợp nào? Viết ra 2–3 cặp input → output trước khi sửa code.` };
  if (!b || p.removed.code) {
    // Without the learner's code the ladder cannot point at a line.
    return level === 2
      ? { text: `**Gợi ý 2/3 · ${HINT_NAMES[1]}**\n\nMình cần xem code để chỉ ra dòng nhiều khả năng sai. Mở đúng bài hoặc thêm lại “Code bạn đang viết” vào ngữ cảnh, rồi xin gợi ý này lần nữa.` }
      : { text: `**Gợi ý 3/3 · ${HINT_NAMES[2]}**\n\nKhung cách làm: (1) chạy test mẫu, (2) in giá trị trung gian ngay trước dòng trả về, (3) so với kết quả bạn tính tay, (4) sửa từng chỗ rồi chạy lại. Phần sửa logic vẫn do bạn tự viết.` };
  }
  const tl = targetLine(clip(b.code, LIMITS.code));
  if (level === 2) return { text: `**Gợi ý 2/3 · ${HINT_NAMES[1]}**\n\nGiá trị sai nhiều khả năng hình thành ở **dòng ${tl.n}**. So sánh giá trị ở đó với kết quả bạn tính tay ở gợi ý 1.`, lines: [tl.n] };
  const ret = /\breturn\s+(.+?);?\s*$/.exec(tl.text);
  return {
    text: `**Gợi ý 3/3 · ${HINT_NAMES[2]}**\n\nThêm một dòng in giá trị ngay trước **dòng ${tl.n}**, chạy lại và đối chiếu với kết quả mong đợi. Phần sửa logic vẫn do bạn tự viết.`,
    lines: [tl.n],
    diff: { at: tl.n, ctx: tl.text, add: `${tl.indent}console.log('Kiểm tra trước dòng ${tl.n}:', ${ret ? ret[1] : 'arguments'});`, state: null, original: null },
  };
}

// ───────────────────────── sessions ─────────────────────────
// A session is one open thread view: the docked panel (variant 'sidebar') or the full Tutor page ('page').
function session(courseId, lessonId, variant) {
  return { courseId, lessonId, variant, ctx: {}, removed: {}, busy: false, mode: 'simple', failure: null, loaded: false, loadError: null, convOpen: false, current: null, queued: null };
}
let panel = null; // the docked sidebar session
const rateStamps = {}; // userId → start times of recent turns
function load(p) {
  p.loaded = false; p.loadError = null; refresh();
  setTimeout(() => {
    if (Codi.state.scenario.aiAssistant === 'loadfail') p.loadError = 'Chưa tải được AI trợ lý.';
    else p.loaded = true;
    refresh();
    if (p.loaded && p.queued) { const q = p.queued; p.queued = null; ask(p, q); }
  }, LOAD_MS);
}

// Runs one assistant turn: idle → thinking → streaming → answered | stopped | error | rate limited | failed.
function turn(p, userText, make, onAnswered) {
  if (!p || p.busy || !p.loaded) return;
  const log = writeLog(p);
  const flag = Codi.state.scenario.aiAssistant;
  const t = Date.now();
  const stamps = (rateStamps[uid()] = (rateStamps[uid()] || []).filter((s) => t - s < RATE_WINDOW_MS));
  p.failure = null;
  if (userText) log.push({ id: msgId(), role: 'user', text: userText, at: now() });
  if (flag === 'ratelimit' || stamps.length >= RATE_MAX) { log.push({ id: msgId(), role: 'limit', text: '', at: now() }); persist(p); refresh(); return; }
  stamps.push(t);
  persist(p);
  p.busy = 'thinking'; const token = (p.current = {}); refresh();
  if (flag === 'thinking') return; // stays "Codi đang suy nghĩ…" until the learner presses Dừng
  setTimeout(() => {
    if (p.current !== token) return;
    if (flag === 'error') { p.busy = false; log.push({ id: msgId(), role: 'error', text: userText || '', question: userText, at: now() }); persist(p); refresh(); return; }
    let a;
    try { a = make(); } catch (err) {
      // Transient failure: the question was not sent, so it leaves the thread and can be retried as is.
      console.error('[tutor] answer failed', err);
      const last = log[log.length - 1];
      if (userText && last && last.role === 'user' && last.text === userText) log.pop();
      p.busy = false; p.failure = { userText, make, onAnswered }; persist(p); refresh(); return;
    }
    if (onAnswered) onAnswered();
    const m = Object.assign({ id: msgId(), role: 'ai', text: '', lines: [], diff: null, vote: null, reason: null, at: now() }, a, { text: '', streaming: true });
    log.push(m); p.busy = 'streaming'; refresh();
    stream(a.text, (part) => {
      if (m.stopped || !m.streaming) return;
      m.text = part; refresh();
    }).then(() => {
      if (m.stopped || p.current !== token) return;
      m.text = a.text; delete m.streaming; p.busy = false; p.current = null; persist(p); refresh();
    });
  }, 900);
}
function ask(p, text) {
  const q = String(text || '').trim().slice(0, 2000);
  if (!p || !q) return;
  // Sent once the thread has loaded and no turn is running (real panel queues contextual questions).
  if (!p.loaded || p.busy) { p.queued = q; return; }
  turn(p, q, () => answerFor(p, lessonOf(p)));
}
function stopAction(p) {
  if (!p || !p.busy) return;
  p.current = null; p.busy = false;
  const log = writeLog(p); const m = log[log.length - 1];
  if (m && m.streaming) { m.stopped = true; delete m.streaming; if (!m.text) m.text = STOPPED_TEXT; }
  else log.push({ id: msgId(), role: 'ai', text: STOPPED_TEXT, stopped: true, lines: [], diff: null, at: now() });
  persist(p); refresh();
}
function retryRow(p, i) {
  if (!p || p.busy) return;
  const log = writeLog(p);
  if (!log[i] || log[i].role !== 'error') return;
  const q = log[i].question;
  const withUser = log[i - 1] && log[i - 1].role === 'user';
  log.splice(i - (withUser ? 1 : 0), withUser ? 2 : 1);
  if (q) ask(p, q); else { persist(p); refresh(); }
}
function retryFailure(p) {
  const f = p && p.failure; if (!f || p.busy) return;
  p.failure = null;
  turn(p, f.userText, f.make, f.onAnswered);
}
function hintAction(p) {
  if (!p || p.busy) return;
  const l = lessonOf(p); if (!l || !l.code) return;
  const level = hintLevel(l) + 1;
  if (level > HINT_MAX) return;
  turn(p, `Cho mình gợi ý ${level}/${HINT_MAX}`, () => hintFor(p, l, level), () => {
    const db = Codi.db(); if (!db.hintUsage) db.hintUsage = [];
    db.hintUsage.push({ userId: uid(), courseId: p.courseId, lessonId: p.lessonId, level, at: now() });
  });
}
async function clearAction(p) {
  if (!p || p.busy) return;
  const r = await Codi.ui.confirm({ title: 'Xoá cuộc trò chuyện của bài này?', consequence: 'Các câu hỏi và câu trả lời của AI trợ lý trong bài học này sẽ bị xoá. Cuộc trò chuyện ở các bài khác giữ nguyên.', reversible: false, confirmLabel: 'Xoá cuộc trò chuyện', danger: true });
  if (!r.ok) return;
  writeLog(p).length = 0; p.failure = null; persist(p); refresh();
  Codi.ui.toast('Đã xoá cuộc trò chuyện.');
}
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
// ≤3-line suggestion: apply inserts the line into the editor, undo restores the exact previous code.
function diffAction(p, i, op) {
  const m = writeLog(p)[i]; if (!m || !m.diff) return;
  const d = m.diff; const ta = editorEl(p);
  if (op === 'skip') { d.state = 'skipped'; persist(p); refresh(); return; }
  if (!ta) { Codi.ui.toast('Mở phần code của bài để áp dụng đề xuất.', { type: 'warn' }); return; }
  let next = null;
  if (op === 'apply') {
    d.original = ta.value;
    const lines = ta.value.split('\n'); lines.splice(Math.min(d.at - 1, lines.length), 0, d.add);
    next = lines.join('\n'); d.state = 'applied';
    Codi.ui.toast('Đã thêm 1 dòng vào code. Bấm “Hoàn tác” nếu muốn bỏ.', { type: 'success' });
  } else if (op === 'undo') {
    if (d.original === null || d.original === undefined) { Codi.ui.toast('Không còn bản code trước khi áp dụng để hoàn tác.'); return; }
    next = d.original; d.original = null; d.state = null;
    Codi.ui.toast('Đã hoàn tác, code trở lại như trước.');
  }
  if (next !== null) setEditorValue(ta, next); // the editor saves the draft on input
  persist(p); refresh();
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
function EscalateForm({ handle, p, defaultText, lecturerName, hasCode, failing }) {
  const [text, setText] = useState(defaultText);
  const [withCode, setWithCode] = useState(hasCode);
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
      await Codi.wait(500);
      const l = lessonOf(p); const c = Codi.course(p.courseId);
      if (!l || !c) throw new Error('Không tìm thấy bài học.');
      const summary = readLog(p).filter((m) => m.role === 'user').slice(-3).map((m) => m.text).join(' · ');
      const conv = {
        id: Codi.uid('conv'), courseId: p.courseId, lessonId: p.lessonId, learnerId: uid(), lecturerId: c.lecturerId,
        status: 'open', fromAI: true,
        aiContext: { summary: withSummary ? summary : '', code: hasCode && withCode ? clip(currentCode(p, l), LIMITS.code) : '', failingTest: failing && withTest ? failing.name : null },
        messages: [{ from: 'learner', text: text.trim().slice(0, 4000), at: now() }], createdAt: now(),
      };
      Codi.set((st) => { if (!st.db.conversations) st.db.conversations = []; st.db.conversations.push(conv); }, { render: false });
      if (Codi.notify) Codi.notify(c.lecturerId, { title: 'Câu hỏi riêng từ học viên', body: `Bài "${l.title}"`, link: '/teach/questions?view=conversations&id=' + conv.id });
      handle.close();
      Codi.set(null); refresh();
      Codi.ui.toast('Đã gửi câu hỏi cho giảng viên. Bạn sẽ nhận thông báo khi có trả lời.', { type: 'success' });
    } catch (err) {
      setError((err && err.message) || 'Chưa gửi được câu hỏi. Vui lòng thử lại.');
    } finally {
      setPending(false);
    }
  };
  const options = [
    hasCode && { key: 'code', label: 'Code hiện tại của bạn', checked: withCode, set: setWithCode },
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
  const l = lessonOf(p); const c = Codi.course(p.courseId);
  if (!l || !c) return;
  const b = bridge(p, l);
  const lastQ = readLog(p).filter((m) => m.role === 'user').pop();
  const lect = Codi.user(c.lecturerId);
  const props = { p, defaultText: lastQ ? lastQ.text : '', lecturerName: lect ? lect.name : null, hasCode: !!b, failing: b && !p.removed.test ? b.failing : null };
  Codi.ui.modal({ title: 'Hỏi riêng giảng viên', body: (handle) => <EscalateForm handle={handle} {...props} /> });
}

// ───────────────────────── rendering ─────────────────────────
function chipsFor(p, l) {
  const b = bridge(p, l);
  const sel = p.ctx.selection;
  return [
    { id: 'lesson', label: `Bài: ${l.title}`, fixed: true },
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
function diffView(p, m, i) {
  const d = m.diff; if (!d) return null;
  return (
    <div className="tutor-diff2" role="group" aria-label={`Đề xuất thay đổi${d.state === 'applied' ? ' (đã áp dụng)' : ''}`}>
      <div className="tutor-diff2-head"><span>Đề xuất thêm 1 dòng · trước dòng {d.at}</span>{d.state === 'applied' ? <span className="badge badge-success">Đã áp dụng</span> : d.state === 'skipped' ? <span className="badge badge-neutral">Đã bỏ qua</span> : null}</div>
      <pre className="tutor-diff2-code"><span className="is-add">+ {d.add}</span>{'\n'}<span className="is-ctx">  {d.ctx}</span></pre>
      {d.state === 'skipped' ? null : (
        <div className="tutor-diff2-actions">
          {d.state === 'applied' ? (
            <>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => rerunAction(p)}><Icon name="play" className="icon-sm" /> Chạy lại test</button>
              {d.original !== null && d.original !== undefined ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => diffAction(p, i, 'undo')}><Icon name="rotate-ccw" className="icon-sm" /> Hoàn tác</button> : null}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => diffAction(p, i, 'apply')}>Áp dụng</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => diffAction(p, i, 'skip')}>Bỏ qua</button>
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
  if (m.streaming && p.busy) {
    return (
      <div key={key} className="msg msg-ai msg-md" aria-busy="true">
        <Md text={m.text} />
        <div className="ai-thinking-row"><button type="button" className="btn btn-ghost btn-sm" onClick={() => stopAction(p)}><Icon name="x" className="icon-sm" /> Dừng</button></div>
      </div>
    );
  }
  return (
    <div key={key} className="msg msg-ai msg-md">
      <Md text={m.text} />{m.stopped ? <p className="xsmall muted">Đã dừng câu trả lời.</p> : null}
      {codeOpen && (m.lines || []).length ? (
        <span className="tutor-lines">
          {m.lines.map((n) => <button key={n} type="button" className="tutor-lineref" onClick={() => lineAction(p, n)}><Icon name="code" className="icon-sm" /> Xem dòng {n}</button>)}
        </span>
      ) : null}
      {codeOpen ? diffView(p, m, i) : null}
      {feedbackRow('tutor', m, i, {
        onChange: () => { persist(p); refresh(); },
        before: <button type="button" className="ai-feedback-btn" aria-label="Sao chép câu trả lời" onClick={() => copyAction(m.text)}><Icon name="copy" className="icon-sm" /></button>,
        after: m.vote === 'down' ? <span className="tutor-feedback-escalate">{escalateBtn(p, 'btn-ghost')}</span> : null,
      })}
    </div>
  );
}
function convStatus(p) {
  const c = latestConversation(p); if (!c) return null;
  const replies = c.messages.filter((m) => m.from === 'lecturer');
  const replied = replies.length > 0; const resolved = c.status === 'resolved';
  return (
    <div className="tutor-status">
      <button type="button" className="tutor-status-row" aria-expanded={String(!!p.convOpen)} onClick={() => { p.convOpen = !p.convOpen; refresh(); }}>
        <span className={`tutor-status-dot ${replied || resolved ? 'is-done' : 'is-wait'}`} aria-hidden="true" />
        <span className="tutor-status-text">Câu hỏi riêng cho giảng viên · {resolved ? 'Đã giải quyết' : replied ? 'Đã có trả lời' : 'Đang chờ trả lời'}</span>
        <Icon name={p.convOpen ? 'chevron-down' : 'chevron-right'} className="icon-sm" />
      </button>
      {p.convOpen ? <div className="tutor-status-body"><p className={replied ? '' : 'muted'}>{replied ? replies[replies.length - 1].text : 'Bạn sẽ nhận thông báo khi giảng viên trả lời.'}</p></div> : null}
    </div>
  );
}

/**
 * The thread. variant 'sidebar' is the docked panel inside a lesson; 'page' is the full Tutor page, which renders the
 * same thread without code context. onPickLesson (page only) adds "Chọn bài khác…" to the composer's + menu.
 */
export function TutorPanel({ p, onPickLesson, placeholder }) {
  useCodi();
  const v = useTutorVersion();
  const rootRef = useRef(null); const inputRef = useRef(null); const menuRef = useRef(null); const addRef = useRef(null);
  const [q, setQ] = useState('');
  const l = lessonOf(p);
  const busy = p.busy;

  // Keep the log scrolled to the end after every repaint.
  useLayoutEffect(() => {
    const scroller = rootRef.current && rootRef.current.closest('.sheet-body, .tutor-page-scroll');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [v]);
  // Re-focus the composer when it becomes enabled again, if the learner was typing there.
  const hadFocus = useRef(false);
  useEffect(() => { if (!busy && hadFocus.current && inputRef.current) inputRef.current.focus(); }, [busy]);
  useEffect(() => { if (!busy && p.loaded && p.queued) { const next = p.queued; p.queued = null; ask(p, next); } });

  if (!l) return <Alert type="warn" title="Không tìm thấy bài học" body="Bài học này không còn tồn tại." />;
  const log = readLog(p);
  const isCode = !!l.code;
  const level = isCode ? hintLevel(l) : 0;
  const all = chipsFor(p, l);
  const chips = all.filter((c) => !p.removed[c.id]);
  const addable = all.filter((c) => p.removed[c.id]);
  const codeOpen = !!bridge(p, l);
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
    <div className={`ai-panel tutor ${p.variant === 'page' ? 'is-page' : ''}`.trim()} ref={rootRef}>
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
            <span className="ai-panel-empty-title">Hỏi về bài “{l.title}”</span>
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
            {busy === 'thinking' ? (
              <div className="ai-thinking-row" aria-busy="true">
                <span className="typing" aria-hidden="true"><i /><i /><i /></span><span>Codi đang suy nghĩ…</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => stopAction(p)}><Icon name="x" className="icon-sm" /> Dừng</button>
              </div>
            ) : null}
            {p.failure ? (
              <Alert type="danger" title="AI trợ lý tạm thời không khả dụng" body="Câu hỏi chưa được gửi. Bạn vẫn học tiếp bình thường."
                actions={<><button type="button" className="btn btn-secondary btn-sm" onClick={() => retryFailure(p)}><Icon name="rotate-ccw" className="icon-sm" /> Thử lại</button>{escalateBtn(p, 'btn-ghost')}</>} />
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

// ───────────────────────── launcher (round AI button + popup) ─────────────────────────
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
function TutorLauncher({ courseId, lessonId }) {
  useCodi();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const c = Codi.course(courseId); const l = c ? Codi.lesson(c, lessonId) : null;
  const user = Codi.currentUser ? Codi.currentUser() : null;
  const firstName = firstNameOf(user && user.name);
  useEffect(() => { setOpen(false); }, [lessonId]);
  if (!l) return null;
  const go = (question) => { setOpen(false); tutor.open(courseId, lessonId, question ? { ask: question } : {}); };
  const onSubmit = (e) => { e.preventDefault(); const t = q.trim(); if (!t) return; setQ(''); go(t); };
  return (
    <>
      {open ? (
        <section className="tutor-pop" aria-label="Trợ lý AI" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
          <header className="tutor-pop-head">
            <div className="tutor-pop-title">
              <h2 className="row"><Icon name="sparkles" className="icon-sm" /> Trợ lý AI</h2>
              {firstName ? <span className="badge badge-neutral">Chào {firstName}</span> : null}
            </div>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Mở rộng thành thanh bên" title="Mở rộng thành thanh bên" onClick={() => go()}><Icon name="external-link" className="icon-sm" /></button>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Đóng trợ lý AI" onClick={() => setOpen(false)}><Icon name="x" className="icon-sm" /></button>
          </header>
          <div className="tutor-pop-body stack-3">
            <p className="small muted">Trợ lý đọc bài học và tài liệu của bài. Trợ lý không chấm, không đổi điểm thay bạn.</p>
            <p className="xsmall muted"><strong>Bạn có thể hỏi</strong></p>
            <ul className="ai-panel-prompts">
              {starters(!!l.code).map((t) => <li key={t}><button type="button" className="ai-panel-prompt" onClick={() => go(t)}><span>{t}</span><Icon name="arrow-right" className="icon-sm" /></button></li>)}
            </ul>
          </div>
          <div className="tutor-pop-foot stack-2">
            <form className="tutor-form" onSubmit={onSubmit}>
              <label className="sr-only" htmlFor="tutor-popup-question">Hỏi trợ lý về bài học</label>
              <input id="tutor-popup-question" className="input" value={q} maxLength={2000} autoComplete="off" placeholder="Hỏi trợ lý về bài học…" onChange={(e) => setQ(e.target.value)} />
              <button type="submit" className="btn btn-primary btn-icon" aria-label="Gửi câu hỏi" disabled={!q.trim()}><Icon name="send" className="icon-sm" /></button>
            </form>
            <button type="button" className="btn-link xsmall tutor-rules-link" onClick={rules}>Lưu ý khi dùng trợ lý AI</button>
          </div>
        </section>
      ) : null}
      <button type="button" className="btn btn-primary tutor-fab" aria-label={open ? 'Đóng trợ lý AI' : 'Mở trợ lý AI'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="sparkles" className="icon-lg" />
      </button>
    </>
  );
}

// ───────────────────────── public API ─────────────────────────
function pageHref(courseId, lessonId) {
  return `/learn/${encodeURIComponent(courseId)}/tutor${lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : ''}`;
}
const tutor = {
  open(courseId, lessonId, ctx) {
    const c = Codi.course(courseId); const l = c && Codi.lesson(c, lessonId);
    if (!l) return null;
    ctx = ctx || {};
    if (panel && panel.handle && panel.lessonId === lessonId) {
      // already open on this lesson: add the new context, removed chips come back
      panel.ctx = { selection: ctx.selection || panel.ctx.selection, testId: ctx.testId || panel.ctx.testId }; panel.removed = {};
      refresh();
    } else {
      if (panel) panel.current = null;
      Codi.ui.closeAll();
      const p = session(c.id, lessonId, 'sidebar');
      p.ctx = { selection: ctx.selection, testId: ctx.testId };
      panel = p;
      p.handle = Codi.ui.sheet({ docked: true, title: 'Trợ lý AI', body: () => <TutorPanel p={p} />, onClose: () => { p.current = null; if (panel === p) panel = null; } });
      load(p);
    }
    if (ctx.ask) ask(panel, ctx.ask);
    else setTimeout(() => { const q = document.getElementById('tutor-q-sidebar'); if (q && wide()) q.focus(); }, LOAD_MS + 50);
    return panel && panel.handle;
  },
  explainError(courseId, lessonId, testId) {
    const l = Codi.lesson(Codi.course(courseId), lessonId);
    const ft = l && Codi.code ? Codi.code.failingTest(l, testId) : null;
    tutor.open(courseId, lessonId, { testId, ask: ft ? `Giải thích giúp mình vì sao test “${ft.name}” chưa đạt?` : 'Giải thích giúp mình lỗi ở lần chạy gần nhất?' });
  },
  // Syntax / runtime / timeout error from the console: the error text, code and line go along as context.
  explainRunError(courseId, lessonId) {
    const l = Codi.lesson(Codi.course(courseId), lessonId);
    const err = l && Codi.code ? Codi.code.runError(l) : null;
    tutor.open(courseId, lessonId, { ask: err ? `Code của mình báo lỗi “${err.slice(0, 80)}”. Lỗi này nghĩa là gì và mình nên xem chỗ nào?` : 'Giải thích giúp mình lỗi ở lần chạy gần nhất?' });
  },
  launcher(courseId, lessonId) { return <TutorLauncher key={`${courseId}:${lessonId}`} courseId={courseId} lessonId={lessonId} />; },
  rules,
  threads: threadsFor,
  pageHref,
};

Object.assign(Codi, { tutor, aiFeedbackRow: feedbackRow });

/** Internals the full Tutor page reuses (same feature folder). */
export const tutorInternals = { session, load, threadsFor, pageHref };

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
  tutor.open(m[1], m[2], { selection: text, ask: b.dataset.ask || undefined });
});
