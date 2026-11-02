/**
 * Learner coding workspace on the backend (port of real components/lesson-coding.tsx + lesson-tutorial.tsx).
 * Data: GET/POST /api/learn/:courseId/lessons/:lessonId/assessments/:assessmentId/coding (CodingView) and .../tutorial
 * (TutorialView). The server runs the code in its sandbox (JavaScript only), grades submits against every test (hidden
 * ones included), keeps the draft, unlocks hints and the solution, and enforces the 2 s run cooldown.
 *
 * Installs on Codi.code (next to the lecturer-side helpers of code-api.jsx):
 *   learner({courseId, lessonId, assessmentId, tutorial, part:'brief'|'work'|'all', onChange?, onContinue?}) → element
 *       The split lesson page renders 'brief' (requirements / guide + test results) and 'work' (editor, console,
 *       Chạy / Nộp bài) in two panes over one shared workspace state. onChange() runs after a submit or a tutorial step
 *       so the page reloads its checklist.
 *   bridge(courseId, lessonId) → {task:{label,text}, code, failing, runError, run} | null   what the AI tutor may read
 *   runTests(courseId, lessonId)            runs the sample tests (challenge) or the current step (tutorial)
 */
import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../../lib/api';
import { Codi } from '../../lib/codi';
import { Alert, Icon, Md, SpinnerBlock } from '../../components/ui/primitives';
import { editor, codeBlock, consoleView, logLines, FailureAlert, rememberFocus, restoreFocus, onInput, runErrorText, setEditorValue, LANG } from './code-api';
import { explain, syntaxError } from './code-runner';

const SAVE_DELAY_MS = 650;
const errText = (e, fallback) => (e && typeof e.message === 'string' && e.message) || fallback;

// ───────────────────────── shared workspace state ─────────────────────────
// One entry per workspace (course + lesson + assessment): the brief and work panes subscribe to the same entry.
const entries = new Map();
let ver = 0;
const subs = new Set();
const bump = () => { ver += 1; subs.forEach((f) => f()); };
const useVersion = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => ver);

const endpointOf = (a) => `/api/learn/${encodeURIComponent(a.courseId)}/lessons/${encodeURIComponent(a.lessonId)}/assessments/${encodeURIComponent(a.assessmentId)}/${a.tutorial ? 'tutorial' : 'coding'}`;
const keyOf = (a) => `${a.courseId}:${a.lessonId}:${a.assessmentId}`;
function entryFor(a) {
  const key = keyOf(a);
  let e = entries.get(key);
  if (!e) {
    e = { key, args: a, url: endpointOf(a), view: null, loading: false, error: null, running: false, failure: null, saving: false, timer: null, pendingCode: null, filter: 'all', tocOpen: false, onChange: null };
    entries.set(key, e);
  }
  return e;
}
function load(e) {
  if (e.loading) return;
  e.loading = true; e.error = null; bump();
  api.get(e.url)
    .then((view) => { e.view = view; })
    .catch((err) => { e.error = err; })
    .finally(() => { e.loading = false; bump(); });
}
const editorKey = (e) => `lc:${e.key}${e.args.tutorial && e.view ? `:${e.view.current}` : ''}`;
const editorEl = (e) => document.querySelector(`[data-cp-input="${editorKey(e)}"]`);
const currentCode = (e) => { const ta = editorEl(e); return ta ? ta.value : e.pendingCode != null ? e.pendingCode : (e.view && e.view.code) || ''; };

// Draft autosave ("Đang lưu nháp…" until the debounce flushes, then "Đã lưu nháp").
function flushDraft(e) {
  clearTimeout(e.timer); e.timer = null;
  if (e.pendingCode == null || !e.view) return Promise.resolve();
  const code = e.pendingCode; e.pendingCode = null;
  const body = e.args.tutorial ? { type: 'draft', step: e.view.current, code } : { type: 'draft', code };
  return api.post(e.url, body)
    .then(() => { if (e.view) e.view = { ...e.view, code }; })
    .catch((err) => { e.failure = { message: errText(err, 'Chưa lưu được code nháp. Vui lòng thử lại.'), retry: null }; })
    .finally(() => { e.saving = false; bump(); });
}
onInput('lc', (key, value) => {
  const e = entries.get(key.slice(3).split(':').slice(0, 3).join(':'));
  if (!e) return;
  e.pendingCode = value;
  if (!e.saving) { e.saving = true; bump(); }
  clearTimeout(e.timer);
  e.timer = setTimeout(() => flushDraft(e), SAVE_DELAY_MS);
});

/** Runs one workspace command; the reply replaces the view. Returns the new view or null. */
async function command(e, body, fallback) {
  if (e.running) return null;
  rememberFocus();
  e.running = true; e.failure = null; bump();
  clearTimeout(e.timer); e.timer = null; e.pendingCode = null; e.saving = false;
  try {
    const view = await api.post(e.url, body);
    e.view = view;
    return view;
  } catch (err) {
    const retry = body.type === 'run' || body.type === 'submit' ? () => runAction(e, body.type) : null;
    e.failure = { message: errText(err, fallback), retry };
    return null;
  } finally {
    e.running = false; bump();
  }
}
async function runAction(e, mode) {
  if (!e.view || e.running) return;
  const code = currentCode(e);
  if (e.args.tutorial) {
    await command(e, { type: 'run', step: e.view.current, code }, 'Sandbox chưa sẵn sàng. Code nháp của bạn vẫn được giữ; hãy thử lại.');
    return;
  }
  const wasPassed = e.view.passed;
  const view = await command(e, { type: mode, code }, 'Sandbox chưa sẵn sàng hoặc đang bận. Code của bạn vẫn được giữ; hãy thử lại.');
  if (view && mode === 'submit') {
    if (view.passed && !wasPassed) Codi.ui.toast('Bạn đã đạt tất cả test! Giờ có thể hoàn thành bài học.', { type: 'success' });
    if (e.onChange) e.onChange();
  }
}
async function resetAction(e) {
  const tut = e.args.tutorial;
  const r = await Codi.ui.confirm({
    title: 'Khôi phục code ban đầu?',
    body: tut ? 'Code bạn đang viết ở bước này sẽ được thay bằng code khởi đầu. Các bước khác vẫn được giữ.' : 'Code bạn đang viết sẽ được thay bằng code khởi đầu. Kết quả lần nộp gần nhất vẫn được giữ.',
    confirmLabel: 'Khôi phục',
  });
  if (!r.ok || !e.view) return;
  await command(e, tut ? { type: 'reset', step: e.view.current, confirmed: true } : { type: 'reset', confirmed: true }, 'Chưa thể khôi phục code.');
}
async function solutionAction(e) {
  const tut = e.args.tutorial;
  if (!tut) {
    const r = await Codi.ui.confirm({ title: 'Bạn chắc muốn xem lời giải?', body: 'Giảng viên sẽ thấy bạn đã xem lời giải trước khi đạt. Điểm năng lực của bài này được giới hạn ở 70%.', confirmLabel: 'Xem lời giải' });
    if (!r.ok) return;
  }
  if (!e.view) return;
  await command(e, tut ? { type: 'solution', step: e.view.current, confirmed: true } : { type: 'solution', confirmed: true }, 'Chưa thể mở lời giải.');
}
async function stepAction(e, n) {
  if (!e.view || n < 0 || n >= e.view.steps.length) return;
  await flushDraft(e);
  const wasDone = e.view.done;
  e.tocOpen = false;
  const view = await command(e, { type: 'step', step: n }, 'Chưa thể chuyển bước.');
  if (!view) return;
  if (view.done && !wasDone) Codi.ui.toast('Bạn đã đi hết hướng dẫn. Có thể hoàn thành bài học.', { type: 'success' });
  if (view.done !== wasDone && e.onChange) e.onChange();
  setTimeout(() => { const t = document.querySelector('.cp-tut-title'); if (t) t.focus({ preventScroll: false }); }, 0);
}
function formatAction(e) {
  const ta = editorEl(e);
  if (!ta || e.running) return;
  if (syntaxError(ta.value)) { e.failure = { message: 'Chưa thể định dạng. Hãy sửa lỗi cú pháp trước.', retry: () => formatAction(e) }; bump(); return; }
  rememberFocus();
  // Normalizes indentation by brace depth (2 spaces).
  let indent = 0;
  const formatted = ta.value.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (/^[}\])]/.test(trimmed)) indent = Math.max(0, indent - 1);
    const result = '  '.repeat(indent) + trimmed;
    if (/[{[(]$/.test(trimmed)) indent += 1;
    return result;
  }).join('\n');
  e.failure = null; bump();
  if (formatted !== ta.value) setEditorValue(ta, formatted);
  restoreFocus();
}

// ───────────────────────── run adapters ─────────────────────────
/** CodingView.lastRun → the run shape consoleView / phase labels read. */
function challengeRun(view) {
  const r = view && view.lastRun;
  if (!r) return null;
  const tests = new Map(view.tests.map((t) => [t.id, t]));
  const failed = r.outcomes.find((o) => o.error);
  return {
    mode: r.mode, phase: r.phase, durationMs: r.durationMs, logs: r.logs || [],
    error: r.phase !== 'done' && failed ? failed.error : null, line: (failed && failed.line) || (r.outcomes[0] && r.outcomes[0].line) || null,
    passed: r.passed, total: r.total, hiddenPassed: r.hiddenPassed, hiddenTotal: r.hiddenTotal,
    outcomes: r.outcomes.map((o) => ({ id: o.id, pass: o.passed, expected: tests.get(o.id) ? tests.get(o.id).expectedOutput : '', actual: o.actual, error: o.error })),
  };
}
const phaseLabel = (r) => (!r ? 'Chưa chạy' : r.phase === 'syntax' ? 'Lỗi cú pháp' : r.phase === 'runtime' ? 'Lỗi khi chạy' : r.phase === 'timeout' ? 'Quá thời gian'
  : `Đạt ${r.passed}/${r.total} test${r.mode === 'run' ? ' mẫu' : ''}`);
const phaseTone = (r, passed) => {
  if (passed) return ['badge-success', 'check-circle'];
  if (!r) return ['badge-neutral', 'clock'];
  if (r.phase === 'syntax' || r.phase === 'runtime' || r.phase === 'timeout') return ['badge-danger', 'alert-circle'];
  return r.total && r.passed === r.total ? ['badge-neutral', 'check-circle'] : ['badge-warn', 'x-circle'];
};

function failingOf(e, testId) {
  if (!e.view) return null;
  if (e.args.tutorial) {
    const r = e.view.lastRun; const o = r && (r.outcomes || []).find((x) => !x.passed);
    return o ? { id: o.name, name: o.name, input: null, expected: o.expected, actual: o.actual } : null;
  }
  const r = challengeRun(e.view);
  if (!r) return null;
  const o = r.outcomes.find((x) => (testId ? x.id === testId : !x.pass));
  const t = o ? e.view.tests.find((x) => x.id === o.id) : null;
  if (!o || o.pass || !t) return null;
  return { id: t.id, name: t.name, input: t.input, expected: t.expectedOutput, actual: o.error || o.actual };
}
function runErrorOf(e) {
  if (!e.view) return null;
  if (e.args.tutorial) { const r = e.view.lastRun; return r ? runErrorText(r) : null; }
  return runErrorText(challengeRun(e.view));
}

// ───────────────────────── views ─────────────────────────
const askTutor = (e, ctx) => { if (Codi.tutor && Codi.tutor.open) Codi.tutor.open(e.args.courseId, e.args.lessonId, ctx); };
function TestRow({ e, t, o }) {
  const state = !o ? 'idle' : o.pass ? 'pass' : 'fail';
  const io = [['Đầu vào', t.input || ''], ['Kết quả mong đợi', t.expectedOutput], ['Kết quả thực tế', o ? (o.error || o.actual || '') : 'Chưa chạy']];
  return (
    <li className={`cp-test is-${state}`}>
      <details className="cp-test-details">
        <summary className="cp-test-summary">
          <span className="cp-test-icon"><Icon name={state === 'pass' ? 'check-circle' : state === 'fail' ? 'x-circle' : 'circle'} className="icon-sm" /></span>
          <span className="cp-test-body"><span className="cp-test-name">{t.name}</span><span className="cp-test-state">{state === 'pass' ? 'Đạt' : state === 'fail' ? 'Chưa đạt' : 'Chưa chạy'}</span></span>
          <Icon name="chevron-down" className="icon-sm cp-test-chevron" />
        </summary>
        <dl className="cp-test-detail">
          {io.map(([label, text]) => (
            <div key={label} className={`cp-test-io ${state === 'fail' && label === 'Kết quả thực tế' ? 'is-fail' : ''}`.trim()}><dt>{label}</dt><dd><code>{text}</code></dd></div>
          ))}
        </dl>
        {state === 'fail' ? (
          <div className="cp-test-fail stack-2">
            <p className="xsmall text-danger">Khác kết quả mong đợi.</p>
            {Codi.tutor ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => askTutor(e, { testId: t.id, ask: `Giải thích giúp mình vì sao test “${t.name}” chưa đạt?` })}><Icon name="sparkles" className="icon-sm" /> Vì sao “{t.name}” chưa đạt?</button> : null}
          </div>
        ) : null}
      </details>
    </li>
  );
}
function LoadError({ e }) {
  return (
    <Alert type="danger" title={e.args.tutorial ? 'Không thể tải hướng dẫn code.' : 'Không thể tải bài tập code.'} body={errText(e.error, 'Vui lòng thử lại.')}
      actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => load(e)}><Icon name="rotate-ccw" className="icon-sm" /> Thử lại</button>} />
  );
}
/** "1. … 2. …" instructions → steps; anything else is one step. */
const instructionSteps = (text) => {
  const s = String(text || '').trim();
  if (!s) return ['Hoàn thành hàm để đạt tất cả kiểm thử.'];
  const parts = s.split(/\n(?=\s*\d+\.\s)/).map((x) => x.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean);
  return parts.length ? parts : [s];
};

function ChallengeView({ e, part, onContinue }) {
  const v = e.view;
  const r = challengeRun(v);
  const busy = e.running;
  const can = v.available;
  const outs = r ? r.outcomes : [];
  const oc = (id) => outs.find((o) => o.id === id);
  const f = e.filter;
  const shownTests = v.tests.filter((t) => f === 'all' || (oc(t.id) && oc(t.id).pass === (f === 'pass')));
  const aiCtx = { courseId: e.args.courseId, lessonId: e.args.lessonId };
  const key = editorKey(e);
  const scrollToChecklist = () => { if (typeof onContinue === 'function') { onContinue(); return; } const el = document.getElementById('checklist'); if (el) el.scrollIntoView({ behavior: 'smooth' }); };
  const focusEditor = () => { const ta = editorEl(e); if (ta) ta.focus(); };
  const [tone, toneIcon] = busy ? ['badge-neutral', 'loader'] : phaseTone(r, v.passed);
  const busyLine = <p className="row muted cp-busy"><Icon name="loader" className="icon-sm cp-spin" /> Đang chạy kiểm thử…</p>;

  if (part === 'brief') {
    return (
      <section className="cp-challenge cp-part-brief" aria-label="Yêu cầu bài code">
        <div className="cp-col cp-instr">
          <h2 className="cp-h">Yêu cầu</h2>
          <ol className="cp-steps">
            {instructionSteps(v.instructions).map((s, i) => (
              <li key={i} className={v.passed ? 'is-done' : ''}>
                <span className="cp-step-icon"><Icon name={v.passed ? 'check-circle' : 'circle'} className="icon-sm" /></span>
                <div className="cp-step-body"><span className="cp-step-n">Bước {i + 1}<span className="sr-only">{v.passed ? ' — đã đạt' : ' — chưa đạt'}</span></span><Md text={s} /></div>
              </li>
            ))}
          </ol>
          <div className="cp-hints stack-2">
            <h3 className="cp-h3"><Icon name="lightbulb" className="icon-sm" /> Bí rồi? Xem gợi ý</h3>
            {v.hints.map((h, i) => <details key={i} className="cp-hint"><summary>Gợi ý {i + 1}</summary><Md text={h} /></details>)}
            {v.lockedHints > 0 ? <p className="cp-hint-locked"><Icon name="lock" className="icon-sm" /> Còn {v.lockedHints} gợi ý mở dần sau mỗi lần nộp chưa đạt.</p> : null}
          </div>
          <details className="cp-solution">
            <summary className="cp-solution-summary"><Icon name="eye" className="icon-sm" /> Lời giải</summary>
            <div className="stack-2 cp-solution-body">
              {v.solution ? (
                <>{codeBlock(v.solution, v.language)}<p className="xsmall muted">Bạn vẫn cần tự nộp code đạt tất cả test để hoàn thành bài.</p></>
              ) : v.solutionAvailable ? (
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => solutionAction(e)}>Xem lời giải</button>
              ) : (
                <p className="small muted">Lời giải mở khi bạn đạt tất cả test hoặc sau 3 lần nộp chạy xong nhưng chưa đạt.</p>
              )}
            </div>
          </details>
        </div>
        <section className="cp-panel cp-tests-panel" aria-label="Kết quả kiểm thử" aria-live="polite">
          <h3 className="cp-h3"><Icon name="check-circle" className="icon-sm" /> Kết quả kiểm thử</h3>
          {busy ? busyLine : (
            <div className="stack-3">
              <div className="cp-tests-head">
                <p className="small"><strong>{r ? <><span className="cp-mono">{outs.filter((o) => o.pass).length}/{outs.length}</span> bài kiểm thử mẫu đạt</> : 'Bấm Chạy để thử với test mẫu, hoặc Nộp bài để chấm toàn bộ.'}</strong></p>
                {r ? (
                  <div className="cp-filter-tabs" aria-label="Lọc kiểm thử">
                    {[['all', 'Tất cả'], ['pass', 'Đạt'], ['fail', 'Chưa đạt']].map(([t, label]) => (
                      <button key={t} type="button" aria-pressed={f === t} className={`cp-filter-tab ${f === t ? 'is-active' : ''}`} onClick={() => { e.filter = t; bump(); }}>{label}</button>
                    ))}
                  </div>
                ) : null}
              </div>
              <ul className="cp-tests">{shownTests.map((t) => <TestRow key={t.id} e={e} t={t} o={oc(t.id)} />)}</ul>
              {r && r.mode === 'submit' && r.hiddenTotal
                ? <p className={`cp-hidden-sum ${r.hiddenPassed === r.hiddenTotal ? 'is-pass' : 'is-fail'}`}><Icon name={r.hiddenPassed === r.hiddenTotal ? 'check-circle' : 'x-circle'} className="icon-sm" /> Test ẩn: {r.hiddenPassed}/{r.hiddenTotal} đạt</p>
                : <p className="xsmall muted"><Icon name="lock" className="icon-sm" /> Test ẩn chỉ chạy khi nộp bài.</p>}
            </div>
          )}
        </section>
      </section>
    );
  }
  const codeEditor = editor({
    id: `cp-ed-${e.args.lessonId}`, key, value: v.code, fileName: v.language === 'javascript' ? 'bai-lam.js' : undefined, language: v.language, label: 'Code bài làm', minRows: 18, maxRows: 26,
    readonly: busy, errorLine: r ? r.line : null,
    barExtra: (
      <span className="cp-bar-tools">
        <span className="cp-lang" role="status">{e.saving ? 'Đang lưu nháp…' : 'Đã lưu nháp'}</span>
        <button type="button" className="btn btn-ghost btn-sm cp-bar-btn" data-cp-format="" disabled={busy || !can} title="Định dạng code (Shift+Alt+F)" aria-label="Định dạng code" onClick={() => formatAction(e)}><Icon name="code" className="icon-sm" /><span className="cp-bar-label">Định dạng code</span></button>
        <button type="button" className="btn btn-ghost btn-sm cp-bar-btn" disabled={busy} title="Khôi phục code ban đầu" aria-label="Đặt lại" onClick={() => resetAction(e)}><Icon name="rotate-ccw" className="icon-sm" /><span className="cp-bar-label">Đặt lại</span></button>
      </span>
    ),
  });
  return (
    <section className="cp-challenge cp-part-work" data-cp-workspace={key} aria-label="Bài code">
      <div className="cp-statusbar">
        <div className="cp-status" role="status">
          <span className={`badge ${tone}`}><Icon name={toneIcon} className={busy ? 'cp-spin' : undefined} />{busy ? 'Đang chạy…' : v.passed ? `Đã đạt tất cả test${v.solutionViewed ? ' · đã xem lời giải' : ''}` : phaseLabel(r)}</span>
          <span className="small muted">Đã nộp {v.submits || 0} lần</span>
          {v.score != null ? <span className="small muted">Điểm lần nộp gần nhất: <strong className="cp-num">{v.score}</strong></span> : null}
        </div>
      </div>
      <FailureAlert f={e.failure} busy={busy} />
      {!can ? <Alert type="info" title="Sandbox chưa sẵn sàng" body={`Dịch vụ chạy ${LANG[v.language] || v.language} chưa sẵn sàng. Bạn vẫn có thể đọc yêu cầu và lưu nháp.`} /> : null}
      {codeEditor}
      <div className="cp-meta xsmall muted">
        <p>Chỉ lần nộp gần nhất được tính.</p>
        <details className="cp-keys"><summary>Phím tắt</summary><p>Tab: thụt lề · Esc rồi Tab: rời editor · Shift+Alt+F: định dạng</p></details>
      </div>
      <section className="cp-panel cp-console" aria-label="Console">
        <h3 className="cp-h3"><Icon name="terminal" className="icon-sm" /> Console</h3>
        <div aria-live="polite">{busy ? busyLine : consoleView(r, aiCtx)}</div>
      </section>
      {v.passed && !busy ? (
        <Alert type="success" title="Đã đạt tất cả test!" body={`Bạn đã nộp ${v.submits} lần. Giờ có thể hoàn thành bài học.`}
          actions={<><button type="button" className="btn btn-primary btn-sm" onClick={scrollToChecklist}>Tiếp tục</button><button type="button" className="btn btn-secondary btn-sm" onClick={focusEditor}>Xem lại code</button></>} />
      ) : null}
      <div className="cp-dock">
        <div className="cp-actions">
          <button type="button" className="btn btn-secondary" data-action="cp-run" data-cp-run="" data-mode="run" disabled={busy || !can} aria-busy={busy ? 'true' : undefined} onClick={() => runAction(e, 'run')}>
            {busy ? null : <Icon name="play" className="icon-sm" />} Chạy <kbd className="cp-kbd">Ctrl/⌘ ↵</kbd>
          </button>
          <button type="button" className="btn btn-primary" data-action="cp-run" data-mode="submit" disabled={busy || !can} onClick={() => runAction(e, 'submit')}><Icon name="check" className="icon-sm" /> Nộp bài</button>
          <span className="xsmall muted">{v.tests.length} test mẫu · Chấm toàn bộ khi nộp</span>
        </div>
      </div>
    </section>
  );
}

function TutorialView({ e, part }) {
  const v = e.view;
  const steps = v.steps || [];
  const i = v.current;
  const busy = e.running;
  const can = v.available;
  const r = v.gated ? null : v.lastRun;
  const key = editorKey(e);
  const err = r ? runErrorText(r) : null;
  const failed = r ? (r.outcomes || []).find((o) => !o.passed) : null;
  const ask = () => {
    if (err) askTutor(e, { ask: `Code của mình báo lỗi “${err.slice(0, 80)}”. Lỗi này nghĩa là gì và mình nên xem chỗ nào?` });
    else askTutor(e, { testId: failed && failed.name, ask: `Giải thích giúp mình vì sao “${failed ? failed.name : ''}” chưa đạt?` });
  };
  const actions = (
    <div className="cp-actions">
      <button type="button" className="btn btn-primary" data-action="cp-run" data-cp-run="" data-mode="run" disabled={busy || !can || v.gated} aria-busy={busy ? 'true' : undefined} onClick={() => runAction(e, 'run')}>
        {busy ? null : <Icon name="play" className="icon-sm" />} Chạy <kbd className="cp-kbd">Ctrl/⌘ ↵</kbd>
      </button>
      <button type="button" className="btn btn-ghost btn-sm" data-cp-format="" disabled={busy || !can || v.gated} aria-label="Định dạng code" title="Định dạng code (Shift+Alt+F)" onClick={() => formatAction(e)}><Icon name="code" className="icon-sm" /> Định dạng</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy || v.gated} aria-label="Khôi phục code ban đầu" onClick={() => resetAction(e)}><Icon name="rotate-ccw" className="icon-sm" /> Đặt lại</button>
      <span className="xsmall muted" role="status">{e.saving ? 'Chưa lưu nháp' : 'Đã lưu nháp'}</span>
    </div>
  );
  if (part === 'brief') {
    return (
      <section className="cp-tutorial cp-part-brief" aria-label="Hướng dẫn code">
        <div className="cp-tut-guide">
          <div className="cp-tut-head">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} aria-expanded={String(!!e.tocOpen)} aria-controls={`cp-toc-${e.args.lessonId}`} onClick={() => { e.tocOpen = !e.tocOpen; bump(); }}><Icon name="list" className="icon-sm" /> Mục lục</button>
            <span className="small muted od-nowrap" role="status">Bước {i + 1}/{steps.length}</span>
          </div>
          <div className="progress-segments" aria-hidden="true">
            {steps.map((_, k) => <i key={k} className={k === i ? 'current' : v.visited.includes(k) ? 'done' : ''} />)}
          </div>
          {e.tocOpen ? (
            <ol className="cp-toc" id={`cp-toc-${e.args.lessonId}`} aria-label="Các bước hướng dẫn">
              {steps.map((st, k) => (
                <li key={k}>
                  <button type="button" disabled={busy} className={`cp-toc-item ${k === i ? 'is-active' : ''}`} aria-current={k === i ? 'step' : undefined} onClick={() => stepAction(e, k)}>
                    <span className="cp-toc-n">{v.visited.includes(k) ? <><Icon name="check-circle" className="icon-sm text-success" /><span className="sr-only">Đã xem: </span></> : k + 1}</span><span>{st.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <article className="cp-tut-step stack-3">
              <h2 className="cp-tut-title" tabIndex={-1}>{v.title}</h2>
              {v.gated ? (
                <div className="cp-gate stack-2">
                  <Alert type="warn" title="Bạn chắc muốn xem lời giải?" body="Hãy thử tự làm các bước thực hành trước — tự tìm ra cách sửa giúp bạn nhớ lâu hơn." />
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => solutionAction(e)}>Hiện lời giải</button>
                </div>
              ) : <Md text={v.body || ''} />}
            </article>
          )}
          <div className="cp-tut-nav">
            <button type="button" className="btn btn-ghost" disabled={busy || i === 0} onClick={() => stepAction(e, i - 1)}><Icon name="arrow-left" className="icon-sm" /> Bước trước</button>
            {i < steps.length - 1
              ? <button type="button" className="btn btn-secondary cp-tut-next" disabled={busy} onClick={() => stepAction(e, i + 1)}>Tiếp: {steps[i + 1].title} <Icon name="arrow-right" className="icon-sm" /></button>
              : <span className="badge badge-success"><Icon name="check-circle" />Đã đi hết hướng dẫn</span>}
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="cp-tutorial cp-part-work stack-3" data-cp-workspace={key} aria-label="Code hướng dẫn">
      <FailureAlert f={e.failure} busy={busy} />
      <div className="cp-tut-work">
        {v.gated ? (
          <div className="cp-gate-pane"><Icon name="eye-off" className="icon-lg" /><p>Code lời giải đang được ẩn.</p><p className="small">Chọn “Hiện lời giải” khi bạn đã sẵn sàng.</p></div>
        ) : (
          <>
            {!can ? <Alert type="info" title="Sandbox chưa sẵn sàng" body="Bạn vẫn có thể đọc hướng dẫn và lưu nháp." /> : null}
            {editor({ id: `cp-tu-${e.args.lessonId}-${i}`, key, value: v.code || '', fileName: v.fileName, language: v.language, label: 'Code hướng dẫn', minRows: 12, maxRows: 18, readonly: busy, errorLine: r ? r.line : null })}
            <section className="cp-panel cp-console" aria-label="Console">
              <h3 className="cp-h3"><Icon name="terminal" className="icon-sm" /> Console</h3>
              <div className="cp-console-lines" role="log" aria-live="polite" aria-busy={busy}>
                {busy ? <p className="cp-console-empty">Đang chạy…</p> : r ? (
                  <>
                    {logLines(r)}
                    {r.error ? <p className="cp-log is-error">{r.phase === 'timeout' ? 'Quá thời gian' : r.phase === 'syntax' ? 'Lỗi cú pháp' : 'Lỗi khi chạy'}{r.line ? ` · Dòng ${r.line}` : ''}: {r.error}</p> : null}
                    {r.error && explain(r.error) ? <p className="cp-log-explain small">{explain(r.error)}</p> : null}
                    {Codi.tutor && (r.error || failed) ? <div><button type="button" className="btn btn-secondary btn-sm cp-ask-ai" onClick={ask}><Icon name="sparkles" className="icon-sm" /> Hỏi AI trợ lý: Giải thích lỗi này</button></div> : null}
                    {r.phase === 'done' && !(r.logs || []).length ? <p className="cp-console-empty">Code đã chạy xong, không có nội dung in ra Console.</p> : null}
                    {(r.outcomes || []).map((o) => (
                      <div key={o.name} className={`cp-tut-outcome ${o.passed ? 'is-pass' : 'is-fail'}`}>
                        <p><Icon name={o.passed ? 'check-circle' : 'x-circle'} className="icon-sm" /> {o.passed ? 'Đạt' : 'Chưa đạt'} · {o.name}</p>
                        {!o.passed ? <p className="cp-tut-outcome-detail">Mong đợi: {o.expected} · Nhận được: {o.actual ?? 'Không có kết quả'}</p> : null}
                      </div>
                    ))}
                  </>
                ) : <p className="cp-console-empty">Bấm <strong>Chạy</strong> để xem kết quả ở đây.</p>}
              </div>
            </section>
            <div className="cp-dock">{actions}</div>
          </>
        )}
      </div>
    </section>
  );
}

function LearnerWorkspace({ args, part, onContinue, onChange }) {
  useVersion();
  const e = entryFor(args);
  e.onChange = onChange || e.onChange;
  // The work pane re-reads the workspace each time the lesson opens (the brief shows the same entry) and saves a
  // pending draft when it closes.
  useEffect(() => {
    if (part === 'work' || !e.view) load(e);
    return part === 'work' ? () => { flushDraft(e); } : undefined;
  }, [e, part]);
  useEffect(() => { restoreFocus(); });
  if (!e.view) return e.error ? <LoadError e={e} /> : <SpinnerBlock text={args.tutorial ? 'Đang tải hướng dẫn code…' : 'Đang tải bài tập code…'} />;
  return args.tutorial ? <TutorialView e={e} part={part} /> : <ChallengeView e={e} part={part} onContinue={onContinue} />;
}

function learner(opts) {
  const args = { courseId: opts.courseId, lessonId: opts.lessonId, assessmentId: opts.assessmentId, tutorial: !!opts.tutorial };
  const part = opts.part === 'brief' ? 'brief' : 'work';
  return <LearnerWorkspace key={`${keyOf(args)}:${part}`} args={args} part={part} onContinue={opts.onContinue} onChange={opts.onChange} />;
}

const findEntry = (courseId, lessonId) => Array.from(entries.values()).find((x) => x.args.courseId === courseId && x.args.lessonId === lessonId && x.view) || null;
/** What the lesson's code workspace lends the AI tutor; null when no workspace is loaded or the solution step is hidden. */
function bridge(courseId, lessonId, testId) {
  const e = findEntry(courseId, lessonId);
  if (!e) return null;
  const v = e.view;
  let task;
  if (e.args.tutorial) {
    if (v.gated) return null;
    const label = `Bước ${v.current + 1}/${v.steps.length}: ${v.title}`;
    task = { label, text: `${label}\n${v.body || ''}` };
  } else {
    task = { label: v.title, text: v.instructions || 'Hoàn thành hàm để đạt tất cả kiểm thử.' };
  }
  const run = e.args.tutorial ? v.lastRun : challengeRun(v);
  return { task, code: currentCode(e), failing: failingOf(e, testId), runError: runErrorOf(e), run, tutorial: e.args.tutorial };
}

const legacyRunTests = Codi.code.runTests;
Object.assign(Codi.code, {
  learner,
  bridge,
  runTests(courseId, lessonId) {
    const e = findEntry(courseId, lessonId);
    if (e) runAction(e, 'run'); else legacyRunTests(courseId, lessonId);
  },
});
