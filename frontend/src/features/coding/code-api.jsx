/**
 * Codi coding UI kit — the editor and result pieces shared by the learner workspace (learner-code.jsx, backend
 * sandbox) and the lecturer coding editor (lecturer-ai/code-editor-page.jsx, backend sandbox). Nothing here runs or
 * grades code, and nothing is stored: run results come from the backend.
 *
 * Codi.code (installed here; learner-code.jsx adds learner / bridge / runTests):
 *   LANG                                    {javascript:'JavaScript', python:'Python'}
 *   editor({id, key, value, fileName, language, label, minRows, maxRows, readonly, errorLine, barExtra}) → element
 *       Code editor (line numbers, highlight, Tab indent, auto-indent, Ctrl/⌘+Enter clicks the enabled
 *       [data-cp-run] button and Shift+Alt+F the enabled [data-cp-format] button inside the closest
 *       [data-cp-workspace]). Every edit calls the onInput handler registered for the key prefix (text before the
 *       first ':'). `value` must reflect what that handler stores, because a changed `value` prop replaces the editor
 *       content (used by "Đặt lại").
 *   onInput(prefix, fn(key, value))         register the edit handler for editor keys starting with `prefix:`
 *   consoleView(runResult|null, ctx?{courseId, lessonId}) → element   (ctx adds "Hỏi AI trợ lý: Giải thích lỗi này")
 *   testRow(test{id?, name, call?}, outcome|null, ctx?{courseId, lessonId}) → <li class="cp-test"> element
 *   stableJSON(value) → string              key-order-independent JSON
 *   explain(errorText) → string             plain-language explanation ('' when none)
 *   rememberFocus() / restoreFocus()        keep editor focus + caret across a re-render
 *   runTests(courseId, lessonId)            no-op until a learner workspace is mounted (learner-code.jsx overrides it)
 */
import { useEffect, useRef, useState } from 'react';
import { Codi } from '../../lib/codi';
import { Icon, Alert } from '../../components/ui/primitives';
import { stableJSON, explain, highlight } from './code-text';
import './coding.css';

const LANG = { javascript: 'JavaScript', python: 'Python' };

/**
 * Sets a textarea's value so React's onChange fires (bypasses the instance value tracker), like the mockup's
 * `ta.value = x; ta.dispatchEvent(new Event('input'))`. Used by "Định dạng code" and the AI tutor's diff.
 */
export function setEditorValue(ta, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, value);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

const codeBlock = (code, language) => (
  <pre className="cp-code-block"><code dangerouslySetInnerHTML={{ __html: highlight(code, language) }} /></pre>
);

// ───────────────────────── editor ─────────────────────────
const inputHandlers = {}; // key prefix → fn(key, value)
const onInput = (prefix, fn) => { inputHandlers[prefix] = fn; };
let escArmed = false;

function CodeEditor({ id, inputKey, value, fileName, language, label, minRows, maxRows, readonly, errorLine, barExtra }) {
  const initial = value || '';
  const [text, setText] = useState(initial);
  // Last value seen from the prop or emitted by typing: a different prop value is an external replacement.
  const seen = useRef(initial);
  if (initial !== seen.current) { seen.current = initial; if (text !== initial) setText(initial); }
  const taRef = useRef(null); const gutterRef = useRef(null); const hlRef = useRef(null);

  const lines = Math.max(minRows || 12, initial.split('\n').length + 1);
  const rows = Math.min(lines, maxRows || 22);
  const gutterN = Math.max(rows, lines, text.split('\n').length + 1);

  const syncScroll = () => {
    const ta = taRef.current; if (!ta) return;
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    if (hlRef.current) { hlRef.current.scrollTop = ta.scrollTop; hlRef.current.scrollLeft = ta.scrollLeft; }
  };
  useEffect(syncScroll, [text]);

  const onChange = (e) => {
    const v = e.target.value;
    seen.current = v;
    setText(v);
    const h = inputKey ? inputHandlers[String(inputKey).split(':')[0]] : null;
    if (h) h(inputKey, v);
  };
  const clickIn = (ta, selector) => {
    const ws = ta.closest('[data-cp-workspace]');
    const btn = ws && ws.querySelector(`${selector}:not([disabled])`);
    if (btn) btn.click();
  };
  const onKeyDown = (e) => {
    const ta = e.currentTarget;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); clickIn(ta, '[data-cp-run]'); return; }
    if (ta.readOnly) return;
    if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); clickIn(ta, '[data-cp-format]'); return; }
    if (e.key === 'Escape') { escArmed = true; return; }
    if (e.key === 'Tab' && !e.shiftKey && !escArmed) {
      e.preventDefault();
      ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      // Keep the indentation of the current line.
      const before = ta.value.slice(0, ta.selectionStart);
      const indent = (/(^|\n)([ \t]*)[^\n]*$/.exec(before) || [])[2] || '';
      if (indent) { e.preventDefault(); ta.setRangeText('\n' + indent, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    escArmed = false;
  };

  return (
    <div className="cp-editor">
      <div className="cp-editor-bar">
        <span className="cp-file"><Icon name="file-text" className="icon-sm" /> {fileName || (language === 'python' ? 'main.py' : 'main.js')}</span>
        {barExtra || <span className="cp-lang">{LANG[language] || language || 'JavaScript'}</span>}
      </div>
      <div className="cp-editor-body">
        <pre className="cp-gutter" aria-hidden="true" ref={gutterRef}>
          {Array.from({ length: gutterN }, (_, i) => <span key={i} className={errorLine === i + 1 ? 'is-error' : undefined}>{i + 1}</span>)}
        </pre>
        <div className="cp-code-area">
          <pre className="cp-highlight" aria-hidden="true" ref={hlRef}><code dangerouslySetInnerHTML={{ __html: highlight(text, language) }} /></pre>
          <textarea ref={taRef} className="cp-textarea" id={id} rows={rows} spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off" wrap="off"
            maxLength={65536} aria-label={label} aria-describedby={`${id}-help`} data-cp-input={inputKey} data-cp-lang={language || 'javascript'}
            readOnly={!!readonly} value={text} onChange={onChange} onKeyDown={onKeyDown} onScroll={syncScroll} />
        </div>
      </div>
      <p className="cp-editor-help" id={`${id}-help`}>Tab: thụt lề · Ctrl/⌘ + Enter: chạy · Esc rồi Tab: rời trình soạn</p>
    </div>
  );
}
function editor(o) {
  const { key, ...rest } = o || {};
  return <CodeEditor key={key || rest.id} inputKey={key} {...rest} />;
}

// Keep focus + caret in the editor across re-renders (run results re-render the page).
let focusMemo = null;
function rememberFocus() {
  const a = document.activeElement;
  focusMemo = a && a.matches && a.matches('[data-cp-input]') ? { key: a.dataset.cpInput, s: a.selectionStart, e: a.selectionEnd } : null;
}
function restoreFocus() {
  if (!focusMemo) return;
  const ta = document.querySelector(`[data-cp-input="${focusMemo.key}"]`);
  if (ta) { ta.focus({ preventScroll: true }); try { ta.setSelectionRange(focusMemo.s, focusMemo.e); } catch { /* ignore */ } }
  focusMemo = null;
}

function explainTest(courseId, lessonId, testId) { if (Codi.tutor && Codi.tutor.explainError) Codi.tutor.explainError(courseId, lessonId, testId); }
// Run-level error (syntax / runtime / timeout): the tutor gets the error, the code and the offending line.
function askErrorAction(courseId, lessonId) { if (Codi.tutor && Codi.tutor.explainRunError) Codi.tutor.explainRunError(courseId, lessonId); }
/** Run-level error text the console shows (syntax / runtime / timeout), with its line when known. */
function runErrorText(r) {
  if (!r || r.phase === 'done' || !r.phase) return null;
  if (r.error) return `${r.line ? `Dòng ${r.line}: ` : ''}${r.error}`;
  return r.phase === 'timeout' ? 'Code chạy quá thời gian.' : null;
}

// ───────────────────────── shared result pieces ─────────────────────────
const phaseLabel = (r) => (!r ? 'Chưa chạy' : r.phase === 'syntax' ? 'Lỗi cú pháp' : r.phase === 'runtime' ? 'Lỗi khi chạy' : r.phase === 'timeout' ? 'Quá thời gian'
  : `Đạt ${(r.outcomes || []).filter((o) => o.pass).length}/${(r.outcomes || []).length} test${r.mode === 'run' ? ' mẫu' : ''}`);
// Status chip tone + icon for a run result: errors read red, a never-run task neutral, a passed task green.
const phaseTone = (r, passed) => {
  if (passed) return ['badge-success', 'check-circle'];
  if (!r) return ['badge-neutral', 'clock'];
  if (r.phase === 'syntax' || r.phase === 'runtime' || r.phase === 'timeout') return ['badge-danger', 'alert-circle'];
  const outs = r.outcomes || [];
  return outs.length && outs.every((o) => o.pass) ? ['badge-neutral', 'check-circle'] : ['badge-warn', 'x-circle'];
};
const logLines = (r) => (r.logs || []).map((l, i) => (
  <div key={i} className={`cp-log is-${l.kind || 'log'}`}>
    {l.kind === 'warn' ? <Icon name="alert-triangle" className="icon-sm" /> : l.kind === 'error' ? <Icon name="alert-circle" className="icon-sm" /> : <span className="cp-log-caret" aria-hidden="true">›</span>}
    <code>{typeof l === 'string' ? l : l.text}</code>
  </div>
));
const askAiButton = (ctx) => (ctx && Codi.tutor ? (
  <button type="button" className="btn btn-secondary btn-sm cp-ask-ai" onClick={() => askErrorAction(ctx.courseId, ctx.lessonId)}>
    <Icon name="sparkles" className="icon-sm" /> Hỏi AI trợ lý: Giải thích lỗi này
  </button>
) : null);

// Challenge console tab. ctx {courseId, lessonId} (learner workspace only) adds the AI tutor button under an error.
function consoleView(r, ctx) {
  if (!r) return <p className="cp-console-empty">Chưa có đầu ra console.</p>;
  const err = runErrorText(r);
  const ex = r.error ? explain(r.error) : '';
  return (
    <div className="cp-console-lines">
      <p className="cp-console-head">{phaseLabel(r)}{r.durationMs !== undefined ? ` · ${r.durationMs} ms` : ''}</p>
      {r.phase === 'timeout' ? <p className="cp-log is-warn">Code đã vượt giới hạn 3 giây. Kiểm tra điều kiện dừng của vòng lặp.</p> : null}
      {err ? (
        <div className="cp-log is-error" role="alert">
          <code>{err}</code>
          {ex ? <span className="cp-log-explain">{ex}</span> : null}
        </div>
      ) : null}
      {(r.logs || []).length ? logLines(r) : <p className="cp-console-empty">Chưa có đầu ra console.</p>}
      {r.phase && r.phase !== 'done' ? askAiButton(ctx) : null}
    </div>
  );
}
function testRow(t, o, ctx) {
  const state = !o ? 'idle' : o.pass ? 'pass' : 'fail';
  const rowKey = String(t.id || t.name);
  const io = [['Đầu vào', t.call || ''], ['Kết quả mong đợi', o ? o.expected : stableJSON(t.expected)], ['Kết quả thực tế', o ? (o.error || o.actual || '') : 'Chưa chạy']];
  return (
    <li key={rowKey} className={`cp-test is-${state}`}>
      <details className="cp-test-details">
        <summary className="cp-test-summary">
          <span className="cp-test-icon"><Icon name={state === 'pass' ? 'check-circle' : state === 'fail' ? 'x-circle' : 'circle'} className="icon-sm" /></span>
          <span className="cp-test-body">
            <span className="cp-test-name">{t.name}</span>
            <span className="cp-test-state">{state === 'pass' ? 'Đạt' : state === 'fail' ? 'Chưa đạt' : 'Chưa chạy'}</span>
          </span>
          <Icon name="chevron-down" className="icon-sm cp-test-chevron" />
        </summary>
        <dl className="cp-test-detail">
          {io.map(([label, text]) => (
            <div key={label} className={`cp-test-io ${state === 'fail' && label === 'Kết quả thực tế' ? 'is-fail' : ''}`.trim()}>
              <dt>{label}</dt><dd><code>{text}</code></dd>
            </div>
          ))}
        </dl>
        {state === 'fail' ? (
          <div className="cp-test-fail stack-2">
            <p className="xsmall text-danger">Khác kết quả mong đợi.</p>
            {ctx && Codi.tutor ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => explainTest(ctx.courseId, ctx.lessonId, t.id)}><Icon name="sparkles" className="icon-sm" /> Vì sao “{t.name}” chưa đạt?</button> : null}
          </div>
        ) : null}
      </details>
    </li>
  );
}
function FailureAlert({ f, busy }) {
  if (!f) return null;
  return (
    <Alert type="danger" title="Chưa thể thực hiện" body={f.message}
      actions={f.retry ? <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={f.retry}><Icon name="rotate-ccw" className="icon-sm" /> Thử lại</button> : null} />
  );
}
Object.assign(Codi, {
  code: { LANG, editor, onInput, consoleView, testRow, stableJSON, explain, rememberFocus, restoreFocus, runTests: () => {} },
});

// Pieces the backend-driven learner workspace (learner-code.jsx) reuses.
export { editor, codeBlock, consoleView, logLines, FailureAlert, rememberFocus, restoreFocus, onInput, runErrorText, LANG };
