/**
 * Codi coding practice — React port of the real lesson coding workspace (apps/web components/lesson-coding.tsx,
 * lesson-tutorial.tsx, lib/coding-contract.ts, lib/tutorial-contract.ts), with the mockup's coding-practice.js filling
 * the gaps. Installs Codi.code. Shared by the learner lesson player, the lecturer coding editor and lecturer AI.
 *
 * Lesson payload (lesson.code):
 *   challenge: {kind:'challenge', language, fileName, instructions[], starter, solution, tests[], hints[], solutionCheck}
 *   tutorial:  {kind:'tutorial', language, fileName, steps[{title, body, starter, tests?, isSolution?}]}
 *   tests[]:   {id, name, call, expected, hidden?, step?}
 * Learner state lives in Codi.db().codeAttempts (one row per user + lesson) so lecturers can read it.
 *
 * Rules taken from the real app:
 *  - Only JavaScript runs. Other languages show "Sandbox chưa sẵn sàng" and keep drafts (no simulated grading).
 *  - "Chỉ lần nộp gần nhất được tính": passed and the score come from the latest submit (bestScore is kept for
 *    lecturer analytics).
 *  - Hints open one by one: 1 + failed submits.
 *  - The solution opens only when it was verified by the lecturer (solutionCheck.ok) and the learner passed, or after
 *    3 failed submits whose run finished (no syntax / runtime / timeout). Viewing it before passing caps the score
 *    at 70 and is visible to the lecturer.
 *  - A new run starts at most every 2 seconds per learner; a run that cannot start keeps the code and offers retry.
 *
 * PUBLIC API — Codi.code (call at render time: `Codi.code?.view(c, l)`):
 *   TYPES                                   {tutorial:{label,icon}, code:{label,icon}}
 *   LANG                                    {javascript:'JavaScript', python:'Python'}
 *   available(language) → boolean           true when the sandbox can run that language (JavaScript only)
 *   highlight(code, language) → string      escaped HTML with tk-* spans (for <Html>/dangerouslySetInnerHTML)
 *   codeBlock(code, language) → element     read-only highlighted <pre class="cp-code-block">
 *   view(course, lesson, opts?{preview, part}) → element   learner workspace: challenge (3 columns) or guided tutorial.
 *                                           preview: true → stateless (lecturer preview): the attempt lives in memory
 *                                           only, nothing is written to codeAttempts, AI tutor buttons are hidden
 *                                           part: 'all' (default) | 'brief' (requirements or tutorial guide + test
 *                                           results) | 'work' (status, editor, console, pinned Chạy / Nộp bài) — the
 *                                           split lesson page renders brief and work in separate panes.
 *                                           onContinue: optional fn for the "Tiếp tục" button after passing (default:
 *                                           scroll to #checklist)
 *   status(lesson) → tutorial {kind, done, step, total} | challenge {kind, done, passedCount, total, submits,
 *                    solutionViewed, score}
 *   score(lesson) → 0..100                  mastery evidence (viewing the solution before passing caps at 70)
 *   lastErrorText(lesson) → string          last run error / first failing test in plain words ('' if none)
 *   runError(lesson) → string|null          run-level error of the last run ("Dòng N: …"), null when it finished
 *   failingTest(lesson, testId?) → {id, name, input, expected, actual}|null   a visible test that did not pass
 *   task(lesson) → {label, text}|null       what the learner is working on (instructions / current tutorial step)
 *   runTests(courseId, lessonId)            runs the sample tests (challenge) or the current step (tutorial)
 *   editor({id, key, value, fileName, language, label, minRows, maxRows, readonly, errorLine, barExtra}) → element
 *       Code editor (line numbers, highlight, Tab indent, auto-indent, Ctrl/⌘+Enter clicks the enabled
 *       [data-cp-run] button and Shift+Alt+F the enabled [data-cp-format] button inside the closest
 *       [data-cp-workspace]). Every edit calls the onInput handler registered for the key prefix (text before the
 *       first ':'). `value` must reflect what that handler stores, because a changed `value` prop replaces the editor
 *       content (used by "Đặt lại").
 *   run(code, tests, {language, unavailable}) → Promise<{phase:'done'|'syntax'|'runtime'|'timeout'|'unavailable',
 *                    error, line, logs[], results[], durationMs}>   JS runs in a Web Worker (3 s limit)
 *   grade(tests, runResult) → [{id, pass, expected, actual, error, line, phase}]
 *   stableJSON(value) → string              key-order-independent JSON
 *   explain(errorText) → string             plain-language explanation ('' when none)
 *   blank(kind:'challenge'|'tutorial') → lesson.code skeleton for a new lesson
 *   onInput(prefix, fn(key, value))         register the edit handler for editor keys starting with `prefix:`
 *   consoleView(runResult|null, ctx?{courseId, lessonId}) → element   (ctx adds "Hỏi AI trợ lý: Giải thích lỗi này")
 *   testRow(test{id?, name, call?}, outcome|null, ctx?{courseId, lessonId}) → <li class="cp-test"> element
 *   rememberFocus() / restoreFocus()        keep editor focus + caret across a re-render
 *
 * Forced scenario: Codi.state.scenario.codeSandbox === 'unavailable' makes every run fail to start (real 503).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Codi, useCodi } from '../../lib/codi';
import { Icon, Md, Alert } from '../../components/ui/primitives';
import { stableJSON, run, grade, explain, highlight, available, syntaxError } from './code-runner';
import './coding.css';

const uid = () => Codi.state.currentUserId;

const TYPES = {
  tutorial: { label: 'Hướng dẫn code', icon: 'terminal' },
  code: { label: 'Bài code', icon: 'code' },
};
const LANG = { javascript: 'JavaScript', python: 'Python' };
const SOLUTION_AFTER = 3; // failed submits (run finished) before the solution unlocks
const COOLDOWN_MS = 2000;
const SAVE_DELAY_MS = 650;
const SOLUTION_CAP = 70;

// View-only state (running flags, open TOC, tabs, errors) re-renders the workspaces without persisting anything.
let viewVer = 0;
const viewSubs = new Set();
const rerender = () => { viewVer += 1; viewSubs.forEach((f) => f()); };
const useViewState = () => useSyncExternalStore((f) => { viewSubs.add(f); return () => viewSubs.delete(f); }, () => viewVer);

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

// ───────────────────────── learner state ─────────────────────────
// Preview workspaces (lecturer previews: view(c, l, {preview:true})) keep their attempt in memory only, per lesson,
// and never read or write Codi.db().codeAttempts.
const previewAttempts = {};
function entry(lessonId, courseId, create, preview) {
  const db = Codi.db();
  if (!preview && !db.codeAttempts) db.codeAttempts = [];
  let e = preview ? previewAttempts[lessonId] : db.codeAttempts.find((x) => x.userId === uid() && x.lessonId === lessonId);
  if (!e && create) {
    e = { userId: uid(), courseId, lessonId, draft: null, submits: 0, failSubmits: 0, solutionFailSubmits: 0, runs: 0, passed: false, lastScore: null, bestScore: 0, solutionViewed: false, failedTests: {}, lastRun: null, tutorialStep: 0, tutorialVisited: [0], stepDrafts: {}, stepRuns: {}, updatedAt: new Date().toISOString() };
    if (preview) previewAttempts[lessonId] = e; else db.codeAttempts.push(e);
  }
  if (e && !e.stepDrafts) e.stepDrafts = {};
  if (e && !e.stepRuns) e.stepRuns = {};
  if (e && !Array.isArray(e.tutorialVisited)) e.tutorialVisited = [0];
  return e;
}
// Editor keys: ch:<course>:<lesson> / tu:<course>:<lesson>:<step>; preview workspaces use chp: / tup:.
const parseKey = (key) => { const [raw, courseId, lessonId, step] = key.split(':'); const preview = raw === 'chp' || raw === 'tup'; return { kind: preview ? raw.slice(0, 2) : raw, preview, courseId, lessonId, step: step === undefined ? null : Number(step) }; };
const lessonFor = (courseId, lessonId) => { const c = Codi.course(courseId); return { c, l: c ? Codi.lesson(c, lessonId) : null }; };

// Draft autosave: "Đang lưu nháp…" until the debounce flushes, then "Đã lưu nháp".
const saving = {};
const saveTimers = {};
function draftChanged(key, preview) {
  if (!saving[key]) { saving[key] = true; rerender(); }
  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => { if (!preview) Codi.set(null, { render: false }); delete saving[key]; rerender(); }, SAVE_DELAY_MS);
}
const onChallengeInput = (key, value) => { const k = parseKey(key); const e = entry(k.lessonId, k.courseId, true, k.preview); e.draft = value; e.updatedAt = new Date().toISOString(); draftChanged(key, k.preview); };
const onTutorialInput = (key, value) => { const k = parseKey(key); const e = entry(k.lessonId, k.courseId, true, k.preview); e.stepDrafts[k.step] = value; e.updatedAt = new Date().toISOString(); draftChanged(key, k.preview); };
onInput('ch', onChallengeInput); onInput('chp', onChallengeInput);
onInput('tu', onTutorialInput); onInput('tup', onTutorialInput);

const running = {};
const tocOpen = {};
const testFilter = {}; // key → 'all' | 'pass' | 'fail'
const outTab = {}; // challenge key → 'tests' | 'console'
const failures = {}; // key → { message, retry() }  ("Chưa thể thực hiện")
const lastStart = {}; // userId → ms of the last run start (2 s cooldown)
const setFailure = (key, message, retry) => { failures[key] = { message, retry }; rerender(); };
const clearFailure = (key) => { if (failures[key]) { delete failures[key]; rerender(); } };

// Bounded test contract (real requireCodingTests): a broken lesson shows an error instead of a workspace.
function problem(cd) {
  if (cd.kind === 'tutorial') return cd.steps && cd.steps.length ? '' : 'Hướng dẫn chưa có nội dung.';
  const tests = cd.tests || [];
  if (!tests.length || tests.length > 100 || !tests.some((t) => !t.hidden)) return 'Bài tập chưa có bộ kiểm thử hợp lệ. Vui lòng liên hệ giảng viên.';
  if (tests.some((t) => t.expected === undefined)) return 'Kết quả kiểm thử chưa hợp lệ. Vui lòng liên hệ giảng viên.';
  return '';
}
const solutionVerified = (cd) => !!cd.solution && !!(cd.solutionCheck && cd.solutionCheck.ok);
const solutionFails = (e) => (e.solutionFailSubmits !== undefined ? e.solutionFailSubmits : e.failSubmits || 0);
const solutionAvailable = (cd, e) => solutionVerified(cd) && (!!e.passed || solutionFails(e) >= SOLUTION_AFTER);
const latestScore = (e) => (e.lastScore !== undefined && e.lastScore !== null ? e.lastScore : e.submits ? e.bestScore || 0 : null);

function status(lesson) {
  const cd = lesson.code;
  const e = entry(lesson.id, null, false);
  if (cd.kind === 'tutorial') {
    const last = cd.steps.length - 1;
    return { kind: 'tutorial', done: !!(e && e.tutorialVisited.includes(last)), step: e ? e.tutorialStep : 0, total: cd.steps.length };
  }
  const total = cd.tests.length;
  const outs = e && e.lastRun && e.lastRun.mode === 'submit' ? e.lastRun.outcomes : [];
  return { kind: 'challenge', done: !!(e && e.passed), passedCount: outs.filter((o) => o.pass).length, total, submits: e ? e.submits : 0, solutionViewed: !!(e && e.solutionViewed), score: e ? latestScore(e) || 0 : 0 };
}
// 0..100 for mastery; viewing the solution before passing caps the signal.
function score(lesson) {
  const s = status(lesson);
  if (s.kind === 'tutorial') return s.done ? 80 : 0;
  return s.solutionViewed ? Math.min(s.score, SOLUTION_CAP) : s.score;
}
const lastRunOf = (lesson, e) => (lesson.code.kind === 'tutorial' ? e.stepRuns[e.tutorialStep] : e.lastRun);
function lastErrorText(lesson) {
  const e = entry(lesson.id, null, false);
  if (!e) return '';
  const r = lastRunOf(lesson, e);
  if (!r) return '';
  if (r.error) return r.error;
  const fail = (r.outcomes || []).find((o) => !o.pass);
  if (!fail) return '';
  const t = (lesson.code.kind === 'tutorial' ? (lesson.code.steps[e.tutorialStep].tests || []) : lesson.code.tests).find((x) => x.id === fail.id);
  return `Test "${t ? (t.hidden ? 'ẩn' : t.name) : fail.id}" chưa đạt: mong đợi ${fail.expected}, nhận được ${fail.error || fail.actual}.`;
}
/** Run-level error text the console shows (syntax / runtime / timeout), with its line when known. */
function runErrorText(r) {
  if (!r || r.phase === 'done' || !r.phase) return null;
  if (r.error) return `${r.line ? `Dòng ${r.line}: ` : ''}${r.error}`;
  return r.phase === 'timeout' ? 'Code chạy quá thời gian.' : null;
}
function runError(lesson) {
  const e = lesson && lesson.code ? entry(lesson.id, null, false) : null;
  return e ? runErrorText(lastRunOf(lesson, e)) : null;
}
function failingTest(lesson, testId) {
  const e = lesson && lesson.code ? entry(lesson.id, null, false) : null;
  const r = e ? lastRunOf(lesson, e) : null;
  if (!r || !r.outcomes) return null;
  const tests = lesson.code.kind === 'tutorial' ? (lesson.code.steps[e.tutorialStep].tests || []) : lesson.code.tests;
  const visible = (id) => { const t = tests.find((x) => x.id === id); return t && !t.hidden ? t : null; };
  const o = r.outcomes.find((x) => (testId ? x.id === testId : !x.pass && visible(x.id)));
  const t = o ? visible(o.id) : null;
  if (!o || o.pass || !t) return null;
  return { id: o.id, name: t.name, input: t.call || null, expected: o.expected, actual: o.error || o.actual };
}
function task(lesson) {
  if (!lesson || !lesson.code) return null;
  const cd = lesson.code;
  if (cd.kind === 'tutorial') {
    const e = entry(lesson.id, null, false);
    const i = Math.min((e && e.tutorialStep) || 0, cd.steps.length - 1); const s = cd.steps[i];
    if (!s || (s.isSolution && !(e && e.solutionViewed))) return null;
    const label = `Bước ${i + 1}/${cd.steps.length}: ${s.title}`;
    return { label, text: `${label}\n${s.body || ''}` };
  }
  return { label: lesson.title, text: (cd.instructions || []).join('\n') || 'Hoàn thành hàm để đạt tất cả kiểm thử.' };
}

// ───────────────────────── actions ─────────────────────────
async function runAction(key, mode) {
  if (running[key]) return;
  const k = parseKey(key); const { c, l } = lessonFor(k.courseId, k.lessonId);
  if (!l || !l.code) return;
  const cd = l.code;
  const isTut = k.kind === 'tu'; const step = isTut ? cd.steps[k.step] : null;
  if (!available(cd.language)) return;
  const ta = document.querySelector(`[data-cp-input="${key}"]`);
  const e = entry(l.id, c.id, true, k.preview);
  const code = ta ? ta.value : (isTut ? (e.stepDrafts[k.step] !== undefined ? e.stepDrafts[k.step] : step.starter) : (e.draft !== null ? e.draft : cd.starter));
  if (isTut) e.stepDrafts[k.step] = code; else e.draft = code;
  const retry = () => runAction(key, isTut ? mode : 'run');
  const started = Date.now();
  if (lastStart[uid()] && started - lastStart[uid()] < COOLDOWN_MS) {
    setFailure(key, isTut ? 'Một lượt chạy đang diễn ra hoặc bạn chạy quá nhanh. Vui lòng thử lại sau 2 giây.' : 'Bạn chạy code quá nhanh. Vui lòng chờ 2 giây rồi thử lại.', retry);
    return;
  }
  lastStart[uid()] = started;
  const tests = isTut ? (step.tests || []) : (mode === 'submit' ? cd.tests : cd.tests.filter((t) => !t.hidden));
  rememberFocus();
  delete failures[key];
  clearTimeout(saveTimers[key]); delete saving[key];
  running[key] = true; rerender();
  let res;
  try {
    res = await run(code, tests, { language: cd.language, unavailable: Codi.state.scenario.codeSandbox === 'unavailable' });
  } catch (err) {
    console.error('[code] run failed', err);
    res = { phase: 'unavailable', error: '', results: [] };
  }
  delete running[key];
  if (res.phase === 'unavailable') {
    // The draft is kept (real: persisted before the sandbox call); the run is not graded.
    if (!k.preview) Codi.set(null, { render: false });
    setFailure(key, isTut ? 'Sandbox chưa sẵn sàng. Code nháp của bạn vẫn được giữ; hãy thử lại.' : (res.error || 'Sandbox chưa sẵn sàng hoặc đang bận. Code của bạn vẫn được giữ; hãy thử lại.'), retry);
    return;
  }
  const outcomes = grade(tests, res);
  const at = new Date().toISOString();
  e.runs = (e.runs || 0) + 1; e.updatedAt = at;
  if (isTut) {
    const failed = outcomes.find((o) => o.error);
    e.stepRuns[k.step] = {
      mode: 'run', at, phase: res.phase, logs: res.logs, error: res.error || (failed ? failed.error : null), line: res.line || (failed ? failed.line : null),
      outcomes: outcomes.map((o) => ({ ...o, name: (tests.find((t) => t.id === o.id) || {}).name || o.id })),
    };
  } else {
    const visibleIds = new Set(cd.tests.filter((t) => !t.hidden).map((t) => t.id));
    const visible = outcomes.filter((o) => visibleIds.has(o.id));
    const byId = {}; (res.results || []).forEach((x) => { byId[x.id] = x; });
    const sampleMs = visible.reduce((n, o) => n + ((byId[o.id] && byId[o.id].durationMs) || 0), 0);
    const failedVisible = visible.find((o) => o.phase !== 'done');
    e.lastRun = {
      mode, at, phase: failedVisible ? failedVisible.phase : 'done', error: res.error || (failedVisible ? failedVisible.error : null),
      line: res.line || (visible.find((o) => o.line) || {}).line || null,
      // Only sample execution time is shown, rounded to 100 ms (real: never the hidden tests' time).
      durationMs: Math.round(sampleMs / 100) * 100, logs: res.logs || [], outcomes,
    };
    if (mode === 'submit') {
      const wasPassed = !!e.passed;
      const allPass = outcomes.length > 0 && outcomes.every((o) => o.pass);
      const pct = outcomes.length ? Math.round((outcomes.filter((o) => o.pass).length / outcomes.length) * 100) : 0;
      e.submits += 1;
      e.lastScore = pct;
      e.bestScore = Math.max(e.bestScore || 0, pct);
      e.passed = allPass; // the latest submit decides
      outcomes.filter((o) => !o.pass).forEach((o) => { e.failedTests[o.id] = (e.failedTests[o.id] || 0) + 1; });
      if (!allPass) {
        e.failSubmits = (e.failSubmits || 0) + 1;
        // Only a run that finished counts towards opening the solution.
        if (outcomes.every((o) => o.phase === 'done')) e.solutionFailSubmits = solutionFails(e) + 1;
        else if (e.solutionFailSubmits === undefined) e.solutionFailSubmits = solutionFails(e);
      }
      if (allPass && !wasPassed) Codi.ui.toast('Bạn đã đạt tất cả test! Giờ có thể hoàn thành bài học.', { type: 'success' });
    }
    outTab[key] = e.lastRun.phase === 'done' ? 'tests' : 'console';
  }
  if (k.preview) rerender(); else Codi.set(null);
}
async function resetAction(key) {
  const k = parseKey(key); const { c, l } = lessonFor(k.courseId, k.lessonId);
  const isTut = k.kind === 'tu';
  const r = await Codi.ui.confirm({
    title: 'Khôi phục code ban đầu?',
    body: isTut ? 'Code bạn đang viết ở bước này sẽ được thay bằng code khởi đầu. Các bước khác vẫn được giữ.' : 'Code bạn đang viết sẽ được thay bằng code khởi đầu. Kết quả lần nộp gần nhất vẫn được giữ.',
    confirmLabel: 'Khôi phục',
  });
  if (!r.ok || !l || running[key]) return;
  const e = entry(l.id, c.id, true, k.preview);
  clearTimeout(saveTimers[key]); delete saving[key]; delete failures[key];
  if (isTut) { delete e.stepDrafts[k.step]; delete e.stepRuns[k.step]; } else { e.draft = null; e.lastRun = null; }
  if (k.preview) rerender(); else Codi.set(null);
}
async function solutionAction(key) {
  const k = parseKey(key); const { c, l } = lessonFor(k.courseId, k.lessonId);
  const r = await Codi.ui.confirm({ title: 'Bạn chắc muốn xem lời giải?', body: 'Giảng viên sẽ thấy bạn đã xem lời giải trước khi đạt. Điểm năng lực của bài này được giới hạn ở 70%.', confirmLabel: 'Xem lời giải' });
  if (!r.ok || !l) return;
  const e = entry(l.id, c.id, true, k.preview);
  if (!solutionAvailable(l.code, e)) { setFailure(key, 'Lời giải mở khi đạt tất cả test hoặc sau 3 lần nộp chạy xong nhưng chưa đạt.', null); return; }
  e.solutionViewed = true;
  if (k.preview) rerender(); else Codi.set(null);
}
// tKey: '<live|preview>:<courseId>:<lessonId>'
const tutEntry = (tKey) => { const [mode, courseId, lessonId] = tKey.split(':'); const preview = mode === 'preview'; const { c, l } = lessonFor(courseId, lessonId); return { c, l, preview, e: entry(l.id, c.id, true, preview) }; };
const saveTut = (preview) => { if (preview) rerender(); else Codi.set(null); };
function tocAction(tKey) { tocOpen[tKey] = !tocOpen[tKey]; rerender(); }
function stepAction(tKey, n) {
  const { l, e, preview } = tutEntry(tKey);
  if (n < 0 || n >= l.code.steps.length) return;
  const last = l.code.steps.length - 1;
  const wasDone = e.tutorialVisited.includes(last);
  e.tutorialStep = n; if (!e.tutorialVisited.includes(n)) e.tutorialVisited.push(n);
  tocOpen[tKey] = false;
  if (n === last && !wasDone) Codi.ui.toast('Bạn đã đi hết hướng dẫn. Có thể hoàn thành bài học.', { type: 'success' });
  saveTut(preview);
  setTimeout(() => { const t = document.querySelector('.cp-tut-title'); if (t) t.focus({ preventScroll: false }); }, 0);
}
function tutSolutionAction(tKey) { const { e, preview } = tutEntry(tKey); e.solutionViewed = true; saveTut(preview); }
function filterAction(key, f) { testFilter[key] = f; rerender(); }
function tabAction(key, t) { outTab[key] = t; rerender(); }
function formatAction(key) {
  const ta = document.querySelector(`[data-cp-input="${key}"]`);
  if (!ta || running[key]) return;
  if (syntaxError(ta.value)) { setFailure(key, 'Chưa thể định dạng. Hãy sửa lỗi cú pháp trước.', () => formatAction(key)); return; }
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
  clearFailure(key);
  if (formatted !== ta.value) setEditorValue(ta, formatted);
  restoreFocus();
}
function explainTest(courseId, lessonId, testId) { if (Codi.tutor && Codi.tutor.explainError) Codi.tutor.explainError(courseId, lessonId, testId); }
// Run-level error (syntax / runtime / timeout): the tutor gets the error, the code and the offending line.
function askErrorAction(courseId, lessonId) { if (Codi.tutor && Codi.tutor.explainRunError) Codi.tutor.explainRunError(courseId, lessonId); }
function runTests(courseId, lessonId) {
  const { l } = lessonFor(courseId, lessonId);
  if (!l || !l.code) return;
  if (l.code.kind === 'tutorial') { const e = entry(l.id, courseId, true); runAction(`tu:${courseId}:${lessonId}:${Math.min(e.tutorialStep || 0, l.code.steps.length - 1)}`, 'run'); }
  else runAction(`ch:${courseId}:${lessonId}`, 'run');
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
            {ctx && Codi.tutor ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => explainTest(ctx.courseId, ctx.lessonId, t.id)}><Icon name="sparkles" className="icon-sm" /> Vì sao test này chưa đạt?</button> : null}
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
function LoadError({ message, kind }) {
  return (
    <Alert type="danger" title={kind === 'tutorial' ? 'Không thể tải hướng dẫn code.' : 'Không thể tải bài tập code.'} body={message}
      actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => Codi.rerender()}><Icon name="rotate-ccw" className="icon-sm" /> Thử lại</button>} />
  );
}

// ───────────────────────── challenge workspace ─────────────────────────
function ChallengeView({ c, l, preview, part = 'all', onContinue }) {
  useCodi(); useViewState();
  useEffect(() => { restoreFocus(); });
  const cd = l.code; const key = `${preview ? 'chp' : 'ch'}:${c.id}:${l.id}`;
  const aiCtx = preview ? null : { courseId: c.id, lessonId: l.id }; // previews have no learner tutor thread
  const bad = problem(cd);
  if (bad) return <LoadError message={bad} kind="challenge" />;
  const e = entry(l.id, c.id, false, preview) || { draft: null, submits: 0, failSubmits: 0, passed: false, solutionViewed: false, lastRun: null, bestScore: 0 };
  const hasDraft = e.draft !== null && e.draft !== undefined;
  const code = hasDraft ? e.draft : cd.starter;
  const r = e.lastRun; const busy = !!running[key];
  const can = available(cd.language);
  const outs = r ? r.outcomes || [] : [];
  const oc = (id) => outs.find((o) => o.id === id);
  const visible = cd.tests.filter((t) => !t.hidden); const hidden = cd.tests.filter((t) => t.hidden);
  const stepTests = (i) => cd.tests.filter((t) => (t.step || 0) === i && (r && r.mode === 'submit' ? true : !t.hidden));
  const stepDone = (i) => e.passed || (stepTests(i).length > 0 && stepTests(i).every((t) => oc(t.id) && oc(t.id).pass));
  const failSubmits = e.failSubmits || 0;
  const hints = cd.hints || [];
  const shownHints = hints.slice(0, 1 + failSubmits);
  const lockedHints = Math.max(0, hints.length - 1 - failSubmits);
  const solOpen = solutionAvailable(cd, e);
  const f = testFilter[key] || 'all';
  const tab = outTab[key] || 'tests';
  const shownTests = visible.filter((t) => f === 'all' || (oc(t.id) && oc(t.id).pass === (f === 'pass')));
  const hiddenOuts = hidden.map((t) => oc(t.id)).filter(Boolean);
  const score = latestScore(e);
  const failure = failures[key];
  const tabs = [['tests', 'Kết quả kiểm thử'], ['console', 'Console']];
  const scrollToChecklist = () => { if (typeof onContinue === 'function') { onContinue(); return; } const el = document.getElementById('checklist') || document.querySelector('.ln-checklist, [data-checklist]'); if (el) el.scrollIntoView({ behavior: 'smooth' }); };
  const focusEditor = () => { const ta = document.querySelector(`[data-cp-input="${key}"]`); if (ta) ta.focus(); };

  const [tone, toneIcon] = busy ? ['badge-neutral', 'loader'] : phaseTone(r, e.passed);
  const statusbar = (
    <div className="cp-statusbar">
      <div className="cp-status" role="status">
        <span className={`badge ${tone}`}>
          <Icon name={toneIcon} className={busy ? 'cp-spin' : undefined} />
          {busy ? 'Đang chạy…' : e.passed ? `Đã đạt tất cả test${e.solutionViewed ? ' · đã xem lời giải' : ''}` : phaseLabel(r)}
        </span>
        <span className="small muted">Đã nộp {e.submits || 0} lần</span>
        {score !== null ? <span className="small muted">Điểm lần nộp gần nhất: <strong className="cp-num">{score}</strong></span> : null}
      </div>
    </div>
  );
  const sandboxAlert = !can ? <Alert type="info" title="Sandbox chưa sẵn sàng" body={`Dịch vụ chạy ${LANG[cd.language] || cd.language} chưa sẵn sàng. Bạn vẫn có thể đọc yêu cầu và lưu nháp.`} /> : null;
  const instr = (
    <div className="cp-col cp-instr">
      <h2 className="cp-h">Yêu cầu</h2>
      <ol className="cp-steps">
        {(cd.instructions && cd.instructions.length ? cd.instructions : ['Hoàn thành hàm để đạt tất cả kiểm thử.']).map((s, i) => (
          <li key={i} className={stepDone(i) ? 'is-done' : ''}>
            <span className="cp-step-icon"><Icon name={stepDone(i) ? 'check-circle' : 'circle'} className="icon-sm" /></span>
            <div className="cp-step-body"><span className="cp-step-n">Bước {i + 1}<span className="sr-only">{stepDone(i) ? ' — đã đạt' : ' — chưa đạt'}</span></span><Md text={s} /></div>
          </li>
        ))}
      </ol>
      <div className="cp-hints stack-2">
        <h3 className="cp-h3"><Icon name="lightbulb" className="icon-sm" /> Bí rồi? Xem gợi ý</h3>
        {shownHints.map((h, i) => <details key={i} className="cp-hint"><summary>Gợi ý {i + 1}</summary><Md text={h} /></details>)}
        {lockedHints > 0 ? <p className="cp-hint-locked"><Icon name="lock" className="icon-sm" /> Còn {lockedHints} gợi ý mở dần sau mỗi lần nộp chưa đạt.</p> : null}
      </div>
      <details className="cp-solution">
        <summary className="cp-solution-summary"><Icon name="eye" className="icon-sm" /> Lời giải</summary>
        <div className="stack-2 cp-solution-body">
          {solOpen && (e.passed || e.solutionViewed) ? (
            <>{codeBlock(cd.solution, cd.language)}<p className="xsmall muted">Bạn vẫn cần tự nộp code đạt tất cả test để hoàn thành bài.</p></>
          ) : solOpen ? (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => solutionAction(key)}>Xem lời giải</button>
          ) : (
            <p className="small muted">Lời giải mở khi bạn đạt tất cả test hoặc sau 3 lần nộp chạy xong nhưng chưa đạt.</p>
          )}
        </div>
      </details>
    </div>
  );
  const codeEditor = editor({
    id: `cp-ed-${l.id}`, key, value: code, fileName: cd.fileName, language: cd.language, label: 'Code bài làm', minRows: 18, maxRows: 26,
    readonly: busy, errorLine: r ? r.line : null,
    barExtra: (
      <span className="cp-bar-tools">
        <span className="cp-lang" role="status">{saving[key] ? 'Đang lưu nháp…' : 'Đã lưu nháp'}</span>
        <button type="button" className="btn btn-ghost btn-sm cp-bar-btn" data-cp-format="" disabled={busy || !can} title="Định dạng code (Shift+Alt+F)" aria-label="Định dạng code" onClick={() => formatAction(key)}><Icon name="code" className="icon-sm" /><span className="cp-bar-label">Định dạng code</span></button>
        <button type="button" className="btn btn-ghost btn-sm cp-bar-btn" disabled={busy} title="Khôi phục code ban đầu" aria-label="Đặt lại" onClick={() => resetAction(key)}><Icon name="rotate-ccw" className="icon-sm" /><span className="cp-bar-label">Đặt lại</span></button>
      </span>
    ),
  });
  const actions = (
    <div className="cp-actions">
      <button type="button" className="btn btn-secondary" data-action="cp-run" data-cp-run="" data-mode="run" disabled={busy || !can} aria-busy={busy ? 'true' : undefined} onClick={() => runAction(key, 'run')}>
        {busy ? null : <Icon name="play" className="icon-sm" />} Chạy <kbd className="cp-kbd">Ctrl/⌘ ↵</kbd>
      </button>
      <button type="button" className="btn btn-primary" data-action="cp-run" data-mode="submit" disabled={busy || !can} onClick={() => runAction(key, 'submit')}><Icon name="check" className="icon-sm" /> Nộp bài</button>
      <span className="xsmall muted">{visible.length} test mẫu · Chấm toàn bộ khi nộp</span>
    </div>
  );
  const meta = (
    <div className="cp-meta xsmall muted">
      <p>Chỉ lần nộp gần nhất được tính.</p>
      <details className="cp-keys"><summary>Phím tắt</summary><p>Tab: thụt lề · Esc rồi Tab: rời editor · Shift+Alt+F: định dạng</p></details>
    </div>
  );
  const busyLine = <p className="row muted cp-busy"><Icon name="loader" className="icon-sm cp-spin" /> Đang chạy kiểm thử…</p>;
  const testsBody = (
    <div className="stack-3">
      <div className="cp-tests-head">
        <p className="small"><strong>{r ? <><span className="cp-mono">{outs.filter((o) => o.pass).length}/{outs.length}</span> bài kiểm thử đạt</> : 'Bấm Chạy để thử với test mẫu, hoặc Nộp bài để chấm toàn bộ.'}</strong></p>
        {r ? (
          <div className="cp-filter-tabs" aria-label="Lọc kiểm thử">
            {[['all', 'Tất cả'], ['pass', 'Đạt'], ['fail', 'Chưa đạt']].map(([t, label]) => (
              <button key={t} type="button" aria-pressed={f === t} className={`cp-filter-tab ${f === t ? 'is-active' : ''}`} onClick={() => filterAction(key, t)}>{label}</button>
            ))}
          </div>
        ) : null}
      </div>
      <ul className="cp-tests">{shownTests.map((t) => testRow(t, oc(t.id), aiCtx))}</ul>
      {r && r.mode === 'submit' && hidden.length
        ? <p className={`cp-hidden-sum ${hiddenOuts.every((o) => o.pass) ? 'is-pass' : 'is-fail'}`}><Icon name={hiddenOuts.every((o) => o.pass) ? 'check-circle' : 'x-circle'} className="icon-sm" /> Test ẩn: {hiddenOuts.filter((o) => o.pass).length}/{hidden.length} đạt</p>
        : <p className="xsmall muted"><Icon name="lock" className="icon-sm" /> Test ẩn chỉ chạy khi nộp bài.</p>}
    </div>
  );
  const passedAlert = e.passed && !busy ? (
    <Alert type="success" title="Đã đạt tất cả test!" body={`Bạn đã nộp ${e.submits} lần. Giờ có thể hoàn thành bài học.`}
      actions={<><button type="button" className="btn btn-primary btn-sm" onClick={scrollToChecklist}>Tiếp tục</button><button type="button" className="btn btn-secondary btn-sm" onClick={focusEditor}>Xem lại code</button></>} />
  ) : null;

  // Split lesson layout: the brief (requirements, hints, solution, test results) and the work (editor, console,
  // run/submit) render in separate panes. Both read the same attempt and view state.
  if (part === 'brief') {
    return (
      <section className="cp-challenge cp-part-brief" aria-label="Yêu cầu bài code">
        {instr}
        <section className="cp-panel cp-tests-panel" aria-label="Kết quả kiểm thử" aria-live="polite">
          <h3 className="cp-h3"><Icon name="check-circle" className="icon-sm" /> Kết quả kiểm thử</h3>
          {busy ? busyLine : testsBody}
        </section>
      </section>
    );
  }
  if (part === 'work') {
    return (
      <section className="cp-challenge cp-part-work" data-cp-workspace={key} aria-label="Bài code">
        {statusbar}
        <FailureAlert f={failure} busy={busy} />
        {sandboxAlert}
        {codeEditor}
        {meta}
        <section className="cp-panel cp-console" aria-label="Console">
          <h3 className="cp-h3"><Icon name="terminal" className="icon-sm" /> Console</h3>
          <div aria-live="polite">{busy ? busyLine : consoleView(r, aiCtx)}</div>
        </section>
        {passedAlert}
        <div className="cp-dock">{actions}</div>
      </section>
    );
  }
  return (
    <section className="cp-challenge" data-cp-workspace={key} aria-label="Bài code">
      {statusbar}
      <FailureAlert f={failure} busy={busy} />
      {sandboxAlert}
      <div className="cp-grid">
        {instr}
        <div className="cp-col cp-code">
          {codeEditor}
          {actions}
          {meta}
        </div>
        <div className="cp-col cp-out">
          <section className="cp-panel cp-out-panel" aria-label="Đầu ra">
            <div className="tabs cp-out-tabs" role="tablist" aria-label="Đầu ra">
              {tabs.map(([t, label]) => (
                <button key={t} type="button" role="tab" id={`cp-tab-${l.id}-${t}`} aria-controls={`cp-out-${l.id}-${t}`} aria-selected={tab === t} className="tab" onClick={() => tabAction(key, t)}>{label}</button>
              ))}
            </div>
            <div role="tabpanel" id={`cp-out-${l.id}-${tab}`} aria-labelledby={`cp-tab-${l.id}-${tab}`} className={`cp-out-body ${tab === 'console' ? 'cp-console' : ''}`.trim()} aria-live="polite">
              {busy ? busyLine : tab === 'console' ? consoleView(r, aiCtx) : testsBody}
            </div>
          </section>
        </div>
      </div>
      {passedAlert}
    </section>
  );
}

// ───────────────────────── tutorial workspace (Replit-style) ─────────────────────────
function TutorialView({ c, l, preview, part = 'all' }) {
  useCodi(); useViewState();
  useEffect(() => { restoreFocus(); });
  const cd = l.code; const steps = cd.steps || [];
  const bad = problem(cd);
  if (bad) return <LoadError message={bad} kind="tutorial" />;
  const e = entry(l.id, c.id, false, preview) || { tutorialStep: 0, tutorialVisited: [0], stepDrafts: {}, stepRuns: {}, solutionViewed: false };
  const i = Math.min(e.tutorialStep || 0, steps.length - 1); const s = steps[i];
  const key = `${preview ? 'tup' : 'tu'}:${c.id}:${l.id}:${i}`; const busy = !!running[key];
  const can = available(cd.language);
  const gated = s.isSolution && !e.solutionViewed;
  const r = gated ? null : (e.stepRuns[i] || null);
  const code = e.stepDrafts[i] !== undefined ? e.stepDrafts[i] : s.starter || '';
  const tKey = `${preview ? 'preview' : 'live'}:${c.id}:${l.id}`;
  const failure = failures[key];
  const err = r ? runErrorText(r) : null;
  const failed = r ? (r.outcomes || []).find((o) => !o.pass) : null;
  const askTutor = () => {
    if (!Codi.tutor || !Codi.tutor.open) return;
    if (err) Codi.tutor.explainRunError(c.id, l.id);
    else Codi.tutor.open(c.id, l.id, { testId: failed && failed.id, ask: `Giải thích giúp mình vì sao “${failed ? failed.name : ''}” chưa đạt?` });
  };
  const tutActions = (
              <div className="cp-actions">
                <button type="button" className="btn btn-primary" data-action="cp-run" data-cp-run="" data-mode={s.tests ? 'submit' : 'run'} disabled={busy || !can} aria-busy={busy ? 'true' : undefined} onClick={() => runAction(key, 'run')}>
                  {busy ? null : <Icon name="play" className="icon-sm" />} Chạy <kbd className="cp-kbd">Ctrl/⌘ ↵</kbd>
                </button>
                <button type="button" className="btn btn-ghost btn-sm" data-cp-format="" disabled={busy || !can} aria-label="Định dạng code" title="Định dạng code (Shift+Alt+F)" onClick={() => formatAction(key)}><Icon name="code" className="icon-sm" /> Định dạng</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} aria-label="Khôi phục code ban đầu" onClick={() => resetAction(key)}><Icon name="rotate-ccw" className="icon-sm" /> Đặt lại</button>
                <span className="xsmall muted" role="status">{saving[key] ? 'Chưa lưu nháp' : 'Đã lưu nháp'}</span>
              </div>
  );
  const guide = (
        <div className="cp-tut-guide">
          <div className="cp-tut-head">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} aria-expanded={String(!!tocOpen[tKey])} aria-controls={`cp-toc-${l.id}`} onClick={() => tocAction(tKey)}><Icon name="list" className="icon-sm" /> Mục lục</button>
            <span className="small muted od-nowrap" role="status">Bước {i + 1}/{steps.length}</span>
          </div>
          <div className="progress-segments" aria-hidden="true">
            {steps.map((_, k) => <i key={k} className={k === i ? 'current' : e.tutorialVisited.includes(k) ? 'done' : ''} />)}
          </div>
          {tocOpen[tKey] ? (
            <ol className="cp-toc" id={`cp-toc-${l.id}`} aria-label="Các bước hướng dẫn">
              {steps.map((st, k) => (
                <li key={k}>
                  <button type="button" disabled={busy} className={`cp-toc-item ${k === i ? 'is-active' : ''}`} aria-current={k === i ? 'step' : undefined} onClick={() => stepAction(tKey, k)}>
                    <span className="cp-toc-n">{e.tutorialVisited.includes(k) ? <><Icon name="check-circle" className="icon-sm text-success" /><span className="sr-only">Đã xem: </span></> : k + 1}</span><span>{st.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <article className="cp-tut-step stack-3">
              <h2 className="cp-tut-title" tabIndex={-1}>{s.title}</h2>
              {gated ? (
                <div className="cp-gate stack-2">
                  <Alert type="warn" title="Bạn chắc muốn xem lời giải?" body="Hãy thử tự làm các bước thực hành trước — tự tìm ra cách sửa giúp bạn nhớ lâu hơn." />
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => tutSolutionAction(tKey)}>Hiện lời giải</button>
                </div>
              ) : <Md text={s.body || ''} />}
            </article>
          )}
          <div className="cp-tut-nav">
            <button type="button" className="btn btn-ghost" disabled={busy || i === 0} onClick={() => stepAction(tKey, i - 1)}><Icon name="arrow-left" className="icon-sm" /> Bước trước</button>
            {i < steps.length - 1
              ? <button type="button" className="btn btn-secondary cp-tut-next" disabled={busy} onClick={() => stepAction(tKey, i + 1)}>Tiếp: {steps[i + 1].title} <Icon name="arrow-right" className="icon-sm" /></button>
              : <span className="badge badge-success"><Icon name="check-circle" />Đã đi hết hướng dẫn</span>}
          </div>
        </div>
  );
  const work = (
        <div className="cp-tut-work">
          {gated ? (
            <div className="cp-gate-pane"><Icon name="eye-off" className="icon-lg" /><p>Code lời giải đang được ẩn.</p><p className="small">Chọn “Hiện lời giải” khi bạn đã sẵn sàng.</p></div>
          ) : (
            <>
              {!can ? <Alert type="info" title="Sandbox chưa sẵn sàng" body="Bạn vẫn có thể đọc hướng dẫn và lưu nháp." /> : null}
              {editor({ id: `cp-tu-${l.id}-${i}`, key, value: code, fileName: cd.fileName, language: cd.language, label: 'Code hướng dẫn', minRows: 12, maxRows: 18, readonly: busy, errorLine: r ? r.line : null })}
              {part === 'work' ? null : tutActions}
              <section className="cp-panel cp-console" aria-label="Console">
                <h3 className="cp-h3"><Icon name="terminal" className="icon-sm" /> Console</h3>
                <div className="cp-console-lines" role="log" aria-live="polite" aria-busy={busy}>
                  {busy ? <p className="cp-console-empty">Đang chạy…</p> : r ? (
                    <>
                      {logLines(r)}
                      {r.error ? <p className="cp-log is-error">{r.phase === 'timeout' ? 'Quá thời gian' : r.phase === 'syntax' ? 'Lỗi cú pháp' : 'Lỗi khi chạy'}{r.line ? ` · Dòng ${r.line}` : ''}: {r.error}</p> : null}
                      {r.error && explain(r.error) ? <p className="cp-log-explain small">{explain(r.error)}</p> : null}
                      {Codi.tutor && !preview && (r.error || failed) ? <div><button type="button" className="btn btn-secondary btn-sm cp-ask-ai" onClick={askTutor}><Icon name="sparkles" className="icon-sm" /> Hỏi AI trợ lý: Giải thích lỗi này</button></div> : null}
                      {r.phase === 'done' && !(r.logs || []).length ? <p className="cp-console-empty">Code đã chạy xong, không có nội dung in ra Console.</p> : null}
                      {(r.outcomes || []).map((o) => (
                        <div key={o.id} className={`cp-tut-outcome ${o.pass ? 'is-pass' : 'is-fail'}`}>
                          <p><Icon name={o.pass ? 'check-circle' : 'x-circle'} className="icon-sm" /> {o.pass ? 'Đạt' : 'Chưa đạt'} · {o.name}</p>
                          {!o.pass ? <p className="cp-tut-outcome-detail">Mong đợi: {o.expected} · Nhận được: {o.actual ?? 'Không có kết quả'}</p> : null}
                        </div>
                      ))}
                    </>
                  ) : <p className="cp-console-empty">Bấm <strong>Chạy</strong> để xem kết quả ở đây.</p>}
                </div>
              </section>
              {part === 'work' ? <div className="cp-dock">{tutActions}</div> : null}
            </>
          )}
        </div>
  );
  if (part === 'brief') return <section className="cp-tutorial cp-part-brief" aria-label="Hướng dẫn code">{guide}</section>;
  if (part === 'work') return <section className="cp-tutorial cp-part-work stack-3" data-cp-workspace={key} aria-label="Code hướng dẫn"><FailureAlert f={failure} busy={busy} />{work}</section>;
  return (
    <section className="cp-tutorial stack-3" data-cp-workspace={key} aria-label="Hướng dẫn code">
      <FailureAlert f={failure} busy={busy} />
      <div className="cp-tut-grid">
        {guide}
        {work}
      </div>
    </section>
  );
}

// opts.preview: stateless workspace (lecturer preview). The attempt stays in memory; no codeAttempts writes, no tutor.
// opts.part: 'all' (default, one workspace) | 'brief' (requirements / tutorial guide + test results) | 'work' (editor,
// console, run/submit). The split lesson layout renders 'brief' and 'work' in two panes over the same attempt.
function view(c, l, opts) {
  const preview = !!(opts && opts.preview);
  const part = (opts && (opts.part === 'brief' || opts.part === 'work') && opts.part) || 'all';
  const k = `${preview ? 'p:' : ''}${c.id}:${l.id}:${part}`;
  return l.code.kind === 'tutorial' ? <TutorialView key={`tu:${k}`} c={c} l={l} preview={preview} part={part} /> : <ChallengeView key={`ch:${k}`} c={c} l={l} preview={preview} part={part} onContinue={opts && opts.onContinue} />;
}

// ───────────────────────── lecturer helpers ─────────────────────────
function blank(kind) {
  if (kind === 'tutorial') {
    return { kind: 'tutorial', language: 'javascript', fileName: 'main.js', steps: [
      { title: 'Giới thiệu', body: 'Giới thiệu mục tiêu của bài hướng dẫn.', starter: 'console.log("Xin chào!");' },
      { title: 'Lời giải (đừng xem trước!)', isSolution: true, body: 'Lời giải cho các bước thực hành.', starter: '' },
    ] };
  }
  return { kind: 'challenge', language: 'javascript', fileName: 'bai-lam.js', instructions: ['Mô tả yêu cầu bước 1.'], starter: 'function giaiBai(input) {\n  // Viết code của bạn ở đây\n}\n', solution: 'function giaiBai(input) {\n  return input;\n}\n', tests: [], hints: ['Gợi ý đầu tiên cho học viên.'], solutionCheck: null };
}

Object.assign(Codi, {
  code: { TYPES, LANG, available, highlight, codeBlock, view, status, score, lastErrorText, runError, failingTest, task, runTests, editor, run, grade, stableJSON, explain, blank, onInput, consoleView, testRow, rememberFocus, restoreFocus },
});
