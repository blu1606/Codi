/**
 * Codi coding practice (proposed feature — PRODUCT.md "Proposed — Coding practice").
 *
 * Shared by the learner player and the lecturer editor:
 *  - a light code editor (textarea + line numbers, Tab indent, auto-indent, Ctrl/⌘+Enter runs)
 *  - a JavaScript runner (Web Worker with timeout; main-thread fallback when workers are blocked)
 *  - a test grader (expected JSON values compared with a key-order-independent stringify)
 *  - simulated Python (clearly labelled) for courses whose language cannot run in the browser
 *  - learner workspaces: code challenge (3 columns, Codecademy-style) and guided tutorial (Replit-style)
 *
 * Lesson payload (lesson.code):
 *   challenge: {kind:'challenge', language, fileName, instructions[], starter, solution, tests[], hints[], solutionCheck}
 *   tutorial:  {kind:'tutorial', language, fileName, steps[{title, body, starter, tests?, isSolution?}]}
 *   tests[]:   {id, name, call, expected, hidden?, step?}
 * Learner state lives in Codi.db().codeAttempts (one row per user + lesson) so lecturers can read it.
 *
 * Public API: Codi.code = {TYPES, view, status, score, lastErrorText, editor, run, grade, stableJSON, blank, onInput}
 */
(function () {
  const Codi = window.Codi;
  const { html, icon, fmt, ui } = Codi;
  const raw = Codi.raw;
  const uid = () => Codi.state.currentUserId;

  const TYPES = {
    tutorial: { label: 'Hướng dẫn code', icon: 'terminal' },
    code: { label: 'Bài code', icon: 'code' },
  };
  const LANG = { javascript: 'JavaScript', python: 'Python' };
  const TIMEOUT_MS = 3000;
  const HINT_SOLUTION_AFTER = 3; // failed submissions before the solution unlocks

  // ───────────────────────── runner ─────────────────────────
  // Key-order-independent JSON so {paid:2,pending:1} equals {pending:1,paid:2}.
  function stableJSON(v) {
    if (v === undefined) return 'undefined';
    if (typeof v === 'function') return '[Function]';
    if (typeof v === 'number' && !isFinite(v)) return String(v);
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stableJSON).join(',') + ']';
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableJSON(v[k])).join(',') + '}';
  }
  // Runs the learner's code once, then evaluates each test expression in the same scope.
  // Self-contained: its source is also shipped into the Web Worker.
  function execute(code, tests) {
    const logs = [];
    const show = (a) => (typeof a === 'string' ? a : stableJSON(a));
    const push = (kind) => (...args) => { if (logs.length < 200) logs.push({ kind, text: args.map(show).join(' ') }); };
    const con = { log: push('log'), info: push('log'), debug: push('log'), warn: push('warn'), error: push('error') };
    let probe;
    try {
      probe = new Function('console', code + '\n;return function (__expr) { return eval(__expr); };')(con);
    } catch (err) {
      return { phase: err instanceof SyntaxError ? 'syntax' : 'runtime', error: err.name + ': ' + err.message, logs, results: [] };
    }
    if (typeof probe !== 'function') return { phase: 'runtime', error: 'Code có lệnh return ở ngoài cùng nên không chạy được test.', logs, results: [] };
    const results = tests.map((t) => {
      try { return { id: t.id, ok: true, actual: stableJSON(probe(t.call)) }; }
      catch (err) { return { id: t.id, ok: false, error: err.name + ': ' + err.message }; }
    });
    return { phase: 'done', error: null, logs, results };
  }
  const WORKER_SRC = stableJSON.toString() + '\n' + execute.toString() +
    '\nself.onmessage = function (e) { self.postMessage(execute(e.data.code, e.data.tests)); };';
  let workerBroken = false;

  function simulatePython(code, tests, solution) {
    const norm = (s) => String(s || '').replace(/#.*$/gm, '').replace(/\s+/g, '');
    const same = !!solution && norm(code) === norm(solution);
    return {
      phase: 'done', error: null, simulated: true,
      logs: [{ kind: 'info', text: 'Python được mô phỏng trong bản thử nghiệm: test chỉ đạt khi code khớp lời giải mẫu.' }],
      results: tests.map((t) => ({ id: t.id, ok: true, actual: same ? stableJSON(t.expected) : '(mô phỏng: chưa khớp lời giải)' })),
    };
  }

  function run(code, tests, opts) {
    opts = opts || {};
    const plain = (tests || []).map((t) => ({ id: t.id, call: t.call }));
    if (opts.language === 'python') return Promise.resolve(simulatePython(code, tests || [], opts.solution));
    const inline = () => Object.assign(execute(code, plain), { inline: true });
    if (workerBroken || typeof Worker === 'undefined') return Promise.resolve(inline());
    let w;
    try { w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))); }
    catch (e) { workerBroken = true; return Promise.resolve(inline()); }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (r) => { if (settled) return; settled = true; clearTimeout(timer); w.terminate(); resolve(r); };
      const timer = setTimeout(() => finish({ phase: 'timeout', error: `Code chạy quá ${TIMEOUT_MS / 1000} giây nên đã bị dừng. Kiểm tra vòng lặp đã có điều kiện dừng chưa.`, logs: [], results: [] }), TIMEOUT_MS);
      w.onmessage = (e) => finish(e.data);
      // The worker itself could not start (blocked by the preview sandbox): fall back to the page.
      w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); workerBroken = true; finish(inline()); };
      w.postMessage({ code, tests: plain });
    });
  }

  // Plain-language explanation shown above the raw error.
  function explain(err) {
    if (!err) return '';
    let m = /ReferenceError: (\S+) is not defined/.exec(err);
    if (m) return `Chưa có biến hoặc hàm "${m[1]}". Kiểm tra tên đã khai báo đúng chưa.`;
    m = /TypeError: (.+) is not a function/.exec(err);
    if (m) return `"${m[1]}" không phải là hàm. Kiểm tra lại tên hàm hoặc giá trị bạn đang gọi.`;
    m = /TypeError: Cannot read propert(?:y|ies) of (undefined|null)/.exec(err);
    if (m) return `Đang đọc thuộc tính của giá trị ${m[1]}. Kiểm tra biến đã có giá trị chưa.`;
    if (/^SyntaxError/.test(err)) return 'Lỗi cú pháp: kiểm tra dấu ngoặc, dấu phẩy và dấu nháy.';
    return '';
  }

  function grade(tests, res) {
    const by = {};
    (res.results || []).forEach((r) => { by[r.id] = r; });
    return tests.map((t) => {
      const expected = stableJSON(t.expected);
      const r = by[t.id];
      if (!r) return { id: t.id, pass: false, expected, actual: null, error: res.error || 'Không chạy được test.' };
      if (!r.ok) return { id: t.id, pass: false, expected, actual: null, error: r.error };
      return { id: t.id, pass: r.actual === expected, expected, actual: r.actual, error: null };
    });
  }

  // ───────────────────────── syntax highlighting ─────────────────────────
  // Lightweight tokenizer: comments, strings, numbers, keywords, function names.
  // Output is escaped HTML painted in a layer under a transparent textarea (see editor()).
  const KEYWORDS = {
    javascript: /^(?:const|let|var|function|return|if|else|for|while|do|switch|case|default|break|continue|new|class|extends|import|from|export|async|await|try|catch|finally|throw|typeof|instanceof|in|of|this|true|false|null|undefined)$/,
    python: /^(?:def|return|if|elif|else|for|while|in|not|and|or|is|import|from|as|class|try|except|finally|raise|with|lambda|pass|break|continue|yield|True|False|None)$/,
  };
  const TOKENS = {
    javascript: /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\.|[^`\\])*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g,
    python: /(#[^\n]*)|("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g,
  };
  function highlight(code, language) {
    const lang = language === 'python' ? 'python' : 'javascript';
    const re = new RegExp(TOKENS[lang].source, 'g'); const kw = KEYWORDS[lang];
    const esc = Codi.esc; const src = String(code || '');
    let out = ''; let last = 0; let m;
    while ((m = re.exec(src))) {
      if (!m[0]) { re.lastIndex += 1; continue; }
      out += esc(src.slice(last, m.index));
      const t = esc(m[0]);
      if (m[1]) out += `<span class="tk-c">${t}</span>`;
      else if (m[2]) out += `<span class="tk-s">${t}</span>`;
      else if (m[3]) out += `<span class="tk-n">${t}</span>`;
      else if (kw.test(m[0])) out += `<span class="tk-k">${t}</span>`;
      else if (/^\s*\(/.test(src.substr(re.lastIndex, 16))) out += `<span class="tk-f">${t}</span>`;
      else out += t;
      last = re.lastIndex;
    }
    // Trailing newline keeps the painted layer as tall as the textarea's last empty line.
    return out + esc(src.slice(last)) + '\n';
  }
  const codeBlock = (code, language) => html`<pre class="cp-code-block"><code>${raw(highlight(code, language))}</code></pre>`;

  // ───────────────────────── editor ─────────────────────────
  const inputHandlers = {}; // key prefix → fn(key, value)
  const lineNumbers = (n) => Array.from({ length: n }, (_, i) => i + 1).join('\n');
  function editor(o) {
    const value = o.value || '';
    const lines = Math.max(o.minRows || 12, value.split('\n').length + 1);
    const rows = Math.min(lines, o.maxRows || 22);
    return html`<div class="cp-editor">
      <div class="cp-editor-bar"><span class="cp-file">${icon('file-text', { cls: 'icon-sm' })} ${o.fileName || 'main.js'}</span><span class="cp-lang">${LANG[o.language] || 'JavaScript'}${o.language === 'python' ? ' · mô phỏng' : ''}</span></div>
      <div class="cp-editor-body">
        <pre class="cp-gutter" aria-hidden="true">${lineNumbers(lines)}</pre>
        <div class="cp-code-area">
          <pre class="cp-highlight" aria-hidden="true"><code>${raw(highlight(value, o.language))}</code></pre>
          <textarea class="cp-textarea" id="${o.id}" rows="${rows}" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="${o.label}" aria-describedby="${o.id}-help" data-cp-input="${o.key}" data-cp-lang="${o.language || 'javascript'}" ${o.readonly ? raw('readonly') : ''}>${value}</textarea>
        </div>
      </div>
      <p class="cp-editor-help" id="${o.id}-help">Tab: thụt lề · Ctrl/⌘ + Enter: chạy · Esc rồi Tab: rời trình soạn</p>
    </div>`;
  }
  // Keeps line numbers and the highlight layer aligned with the textarea (content + scroll).
  function syncEditor(ta, contentChanged) {
    const body = ta.closest('.cp-editor-body');
    if (!body) return;
    const gutter = body.querySelector('.cp-gutter'); const hl = body.querySelector('.cp-highlight');
    if (contentChanged) {
      const n = Math.max(ta.rows, ta.value.split('\n').length + 1);
      if (gutter && gutter.textContent.split('\n').length !== n) gutter.textContent = lineNumbers(n);
      if (hl) hl.firstChild.innerHTML = highlight(ta.value, ta.dataset.cpLang);
    }
    if (gutter) gutter.scrollTop = ta.scrollTop;
    if (hl) { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; }
  }
  let escArmed = false;
  document.addEventListener('keydown', (e) => {
    const ta = e.target;
    if (!ta || !ta.classList || !ta.classList.contains('cp-textarea') || ta.readOnly) return;
    if (e.key === 'Escape') { escArmed = true; return; }
    if (e.key === 'Tab' && !e.shiftKey && !escArmed) {
      e.preventDefault();
      ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const ws = ta.closest('[data-cp-workspace]');
      const btn = ws && ws.querySelector('[data-cp-run]:not([disabled])');
      if (btn) btn.click();
      return;
    }
    if (e.key === 'Enter' && !e.isComposing) {
      // Keep the indentation of the current line.
      const before = ta.value.slice(0, ta.selectionStart);
      const indent = (/(^|\n)([ \t]*)[^\n]*$/.exec(before) || [])[2] || '';
      if (indent) { e.preventDefault(); ta.setRangeText('\n' + indent, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    escArmed = false;
  });
  document.addEventListener('input', (e) => {
    const ta = e.target;
    if (!ta || !ta.matches || !ta.matches('[data-cp-input]')) return;
    syncEditor(ta, true);
    const key = ta.dataset.cpInput;
    const h = inputHandlers[key.split(':')[0]];
    if (h) h(key, ta.value);
  });
  document.addEventListener('scroll', (e) => { const ta = e.target; if (ta && ta.classList && ta.classList.contains('cp-textarea')) syncEditor(ta, false); }, true);
  const onInput = (prefix, fn) => { inputHandlers[prefix] = fn; };

  // Keep focus + caret in the editor across full re-renders (run results re-render the page).
  let focusMemo = null;
  function rememberFocus() {
    const a = document.activeElement;
    focusMemo = a && a.matches && a.matches('[data-cp-input]') ? { key: a.dataset.cpInput, s: a.selectionStart, e: a.selectionEnd } : null;
  }
  function restoreFocus() {
    if (!focusMemo) return;
    const ta = document.querySelector(`[data-cp-input="${focusMemo.key}"]`);
    if (ta) { ta.focus({ preventScroll: true }); try { ta.setSelectionRange(focusMemo.s, focusMemo.e); } catch (e) { /* ignore */ } }
    focusMemo = null;
  }

  // ───────────────────────── learner state ─────────────────────────
  function entry(lessonId, courseId, create) {
    const db = Codi.db();
    if (!db.codeAttempts) db.codeAttempts = [];
    let e = db.codeAttempts.find((x) => x.userId === uid() && x.lessonId === lessonId);
    if (!e && create) {
      e = { userId: uid(), courseId, lessonId, draft: null, submits: 0, failSubmits: 0, runs: 0, passed: false, lastScore: 0, solutionViewed: false, failedTests: {}, lastRun: null, tutorialStep: 0, tutorialVisited: [0], stepDrafts: {}, stepRuns: {}, updatedAt: new Date().toISOString() };
      db.codeAttempts.push(e);
    }
    return e;
  }
  let saveTimer = null;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => Codi.set(null, { render: false }), 400); };
  const parseKey = (key) => { const [kind, courseId, lessonId, step] = key.split(':'); return { kind, courseId, lessonId, step: step === undefined ? null : Number(step) }; };

  onInput('ch', (key, value) => { const k = parseKey(key); const e = entry(k.lessonId, k.courseId, true); e.draft = value; e.updatedAt = new Date().toISOString(); saveSoon(); });
  onInput('tu', (key, value) => { const k = parseKey(key); const e = entry(k.lessonId, k.courseId, true); e.stepDrafts[k.step] = value; e.updatedAt = new Date().toISOString(); saveSoon(); });

  const running = {};
  const tocOpen = {};
  const testFilter = {}; // key → 'all' | 'pass' | 'fail'

  function status(lesson) {
    const cd = lesson.code;
    const e = entry(lesson.id, null, false);
    if (cd.kind === 'tutorial') {
      const last = cd.steps.length - 1;
      return { kind: 'tutorial', done: !!(e && e.tutorialVisited.includes(last)), step: e ? e.tutorialStep : 0, total: cd.steps.length };
    }
    const total = cd.tests.length;
    const outs = e && e.lastRun && e.lastRun.mode === 'submit' ? e.lastRun.outcomes : [];
    return { kind: 'challenge', done: !!(e && e.passed), passedCount: outs.filter((o) => o.pass).length, total, submits: e ? e.submits : 0, solutionViewed: !!(e && e.solutionViewed), score: e ? e.lastScore : 0 };
  }
  // 0..100 for mastery; viewing the solution before passing caps the signal.
  function score(lesson) {
    const s = status(lesson);
    if (s.kind === 'tutorial') return s.done ? 80 : 0;
    return s.solutionViewed ? Math.min(s.score, 70) : s.score;
  }
  function lastErrorText(lesson) {
    const e = entry(lesson.id, null, false);
    if (!e) return '';
    const r = lesson.code.kind === 'tutorial' ? e.stepRuns[e.tutorialStep] : e.lastRun;
    if (!r) return '';
    if (r.error) return r.error;
    const fail = (r.outcomes || []).find((o) => !o.pass);
    if (!fail) return '';
    const t = (lesson.code.kind === 'tutorial' ? (lesson.code.steps[e.tutorialStep].tests || []) : lesson.code.tests).find((x) => x.id === fail.id);
    return `Test "${t ? (t.hidden ? 'ẩn' : t.name) : fail.id}" chưa đạt: mong đợi ${fail.expected}, nhận được ${fail.error || fail.actual}.`;
  }

  // ───────────────────────── shared result pieces ─────────────────────────
  // ctx {courseId, lessonId} (learner workspace only) adds "Hỏi AI về lỗi này" under a syntax/runtime/timeout error.
  function consoleView(r, ctx) {
    if (!r) return html`<p class="cp-console-empty">Kết quả <code>console.log</code> sẽ hiện ở đây.</p>`;
    const askAI = ctx && Codi.tutor ? html`<button type="button" class="btn btn-secondary btn-sm cp-ask-ai" data-action="cp-ask-error" data-course="${ctx.courseId}" data-lesson="${ctx.lessonId}">${icon('sparkles', { cls: 'icon-sm' })} Hỏi AI về lỗi này</button>` : '';
    const err = r.error ? html`<div class="cp-log is-error" role="alert"><strong>${r.phase === 'timeout' ? 'Quá thời gian' : r.phase === 'syntax' ? 'Lỗi cú pháp' : 'Lỗi khi chạy'}</strong>${explain(r.error) ? html`<span class="cp-log-explain">${explain(r.error)}</span>` : ''}<code>${r.error}</code>${askAI}</div>` : '';
    return html`<div class="cp-console-lines">
      ${(r.logs || []).map((l) => html`<div class="cp-log is-${l.kind}">${l.kind === 'warn' ? icon('alert-triangle', { cls: 'icon-sm' }) : l.kind === 'error' ? icon('alert-circle', { cls: 'icon-sm' }) : html`<span class="cp-log-caret" aria-hidden="true">›</span>`}<code>${l.text}</code></div>`)}
      ${!(r.logs || []).length && !r.error ? html`<p class="cp-console-empty">Code chạy xong, không có dòng <code>console.log</code> nào.</p>` : ''}
      ${err}
      ${r.inline ? html`<p class="cp-note">Đang chạy ở chế độ dự phòng ngay trên trang: vòng lặp vô hạn có thể làm treo trang.</p>` : ''}
      ${r.simulated ? html`<p class="cp-note">Kết quả Python là mô phỏng, không phải chạy thật.</p>` : ''}
    </div>`;
  }
  function testRow(t, o) {
    const state = !o ? 'idle' : o.pass ? 'pass' : 'fail';
    const id = 'cp-test-' + (t.id || t.name).replace(/\W/g, '-');
    return html`<li class="cp-test is-${state}">
      <details class="cp-test-details" ${state === 'idle' ? '' : Codi.raw('open')}>
        <summary class="cp-test-summary">
          <span class="cp-test-icon">${icon(state === 'pass' ? 'check-circle' : state === 'fail' ? 'x-circle' : 'circle', { cls: 'icon-sm' })}</span>
          <div class="cp-test-body">
            <span class="cp-test-name">${t.name}</span>
            <span class="cp-test-state">${state === 'pass' ? 'Đạt' : state === 'fail' ? 'Chưa đạt' : 'Chưa chạy'}</span>
          </div>
        </summary>
        ${state !== 'idle' ? html`<div class="cp-test-detail stack-2">
          <div class="cp-test-io"><strong>Input</strong><code>${t.call}</code></div>
          <div class="cp-test-io"><strong>Expected</strong><code>${o.expected}</code></div>
          ${o.actual ? html`<div class="cp-test-io ${o.pass ? '' : 'is-fail'}">${o.pass ? '<strong>Actual (pass)</strong>' : html`<strong>Received</strong>`}<code>${o.actual}</code></div>` : ''}
          ${o.error ? html`<div class="cp-test-io is-error"><strong>Error</strong><code>${o.error}</code></div>` : ''}
        </div>` : ''}
      </details></li>`;
  }

  // ───────────────────────── challenge workspace ─────────────────────────
  function challengeView(c, l) {
    const cd = l.code; const key = `ch:${c.id}:${l.id}`;
    const e = entry(l.id, c.id, false) || { draft: null, submits: 0, failSubmits: 0, passed: false, solutionViewed: false, lastRun: null };
    const code = e.draft !== null && e.draft !== undefined ? e.draft : cd.starter;
    const r = e.lastRun; const busy = !!running[key];
    const outs = r ? r.outcomes || [] : [];
    const oc = (id) => outs.find((o) => o.id === id);
    const visible = cd.tests.filter((t) => !t.hidden); const hidden = cd.tests.filter((t) => t.hidden);
    const stepTests = (i) => cd.tests.filter((t) => (t.step || 0) === i && (r && r.mode === 'submit' ? true : !t.hidden));
    const stepDone = (i) => e.passed || (stepTests(i).length > 0 && stepTests(i).every((t) => oc(t.id) && oc(t.id).pass));
    const passCount = outs.filter((o) => o.pass).length;
    let chip;
    if (busy) chip = html`<span class="badge badge-info">${icon('refresh', { cls: 'icon-sm' })}Đang chạy…</span>`;
    else if (e.passed) chip = html`<span class="badge badge-success">${icon('check-circle')}Đã đạt tất cả test${e.solutionViewed ? ' · đã xem lời giải' : ''}</span>`;
    else if (r && r.phase === 'syntax') chip = html`<span class="badge badge-danger">${icon('alert-circle')}Lỗi cú pháp</span>`;
    else if (r && r.phase === 'timeout') chip = html`<span class="badge badge-warn">${icon('clock')}Quá thời gian</span>`;
    else if (r && r.phase === 'runtime') chip = html`<span class="badge badge-danger">${icon('alert-circle')}Lỗi khi chạy</span>`;
    else if (r) chip = html`<span class="badge badge-warn">${icon('alert-triangle')}Đạt ${passCount}/${outs.length} test${r.mode === 'run' ? ' mẫu' : ''}</span>`;
    else if (e.draft !== null && e.draft !== undefined) chip = html`<span class="badge badge-neutral">${icon('pencil')}Đang làm · đã lưu nháp</span>`;
    else chip = html`<span class="badge badge-outline">${icon('circle')}Chưa làm</span>`;
    const hintsOpen = Math.min(cd.hints.length, 1 + (e.failSubmits || 0));
    const solutionOpen = e.passed || (e.failSubmits || 0) >= HINT_SOLUTION_AFTER;
    Codi.onMount(restoreFocus);
    return html`<section class="cp-challenge" data-cp-workspace="${key}" aria-label="Bài code">
      <div class="cp-statusbar">
        <div class="cp-status" aria-live="polite">${chip}<span class="small muted">${e.submits ? `Đã nộp ${e.submits} lần` : 'Chưa nộp lần nào'}</span></div>
        <button class="btn btn-ghost btn-sm" data-action="cp-reset" data-key="${key}" ${e.draft === null || e.draft === undefined || busy ? raw('disabled') : ''}>${icon('rotate-ccw', { cls: 'icon-sm' })} Khôi phục code ban đầu</button>
      </div>
      <div class="cp-grid">
        <div class="cp-col cp-instr">
          <h2 class="cp-h">Yêu cầu</h2>
          <ol class="cp-steps">${cd.instructions.map((s, i) => html`<li class="${stepDone(i) ? 'is-done' : ''}">
            <span class="cp-step-icon">${icon(stepDone(i) ? 'check-circle' : 'circle', { cls: 'icon-sm' })}</span>
            <div class="cp-step-body"><span class="cp-step-n">Bước ${i + 1}<span class="sr-only">${stepDone(i) ? ' — đã đạt' : ' — chưa đạt'}</span></span>${ui.md(s)}</div></li>`)}</ol>
          <div class="cp-hints stack-2">
            <h3 class="cp-h3">${icon('lightbulb', { cls: 'icon-sm' })} Bí rồi? Xem gợi ý</h3>
            ${cd.hints.map((h, i) => i < hintsOpen
              ? html`<details class="cp-hint"><summary>Gợi ý ${i + 1}</summary>${ui.md(h)}</details>`
              : html`<p class="cp-hint-locked">${icon('lock', { cls: 'icon-sm' })} Gợi ý ${i + 1} mở sau khi nộp thêm ${i + 1 - (e.failSubmits || 0)} lần chưa đạt.</p>`)}
          </div>
          <div class="cp-solution stack-2">
            <h3 class="cp-h3">${icon('eye', { cls: 'icon-sm' })} Lời giải</h3>
            ${!solutionOpen ? html`<p class="small muted">Lời giải mở khi bạn đạt tất cả test hoặc sau ${HINT_SOLUTION_AFTER} lần nộp chưa đạt (còn ${HINT_SOLUTION_AFTER - (e.failSubmits || 0)} lần).</p>`
              : e.solutionViewed || e.passed ? html`${codeBlock(cd.solution, cd.language)}${e.passed ? '' : html`<p class="xsmall muted">Bạn vẫn cần tự nộp code đạt tất cả test để hoàn thành bài.</p>`}`
              : html`<button class="btn btn-secondary btn-sm" data-action="cp-solution" data-key="${key}">Xem lời giải</button>`}
          </div>
        </div>
        <div class="cp-col cp-code">
          ${editor({ id: `cp-ed-${l.id}`, key, value: code, fileName: cd.fileName, language: cd.language, label: `Trình soạn code bài ${l.title}`, minRows: 18, maxRows: 26 })}
          <div class="cp-actions">
            <button class="btn btn-secondary" data-action="cp-run" data-cp-run data-key="${key}" data-mode="run" ${busy ? raw('disabled aria-busy="true"') : ''}>${icon('play', { cls: 'icon-sm' })} Chạy</button>
            <button class="btn btn-primary" data-action="cp-run" data-key="${key}" data-mode="submit" ${busy ? raw('disabled') : ''}>${icon('check', { cls: 'icon-sm' })} Nộp bài</button>
            <button class="btn btn-ghost btn-sm" data-action="cp-format" data-key="${key}" ${busy ? raw('disabled') : ''}>${icon('type', { cls: 'icon-sm' })} Định dạng code</button>
            <span class="small muted">Chạy: thử với ${visible.length} test mẫu. Nộp bài: chấm với cả ${hidden.length} test ẩn.</span>
          </div>
        </div>
        <div class="cp-col cp-out">
          <section class="cp-panel" aria-labelledby="cp-tests-${l.id}">
            <div class="cp-tests-head">
              <h3 class="cp-h3" id="cp-tests-${l.id}">${icon('clipboard-check', { cls: 'icon-sm' })} Kết quả test</h3>
              ${r ? html`<div class="cp-filter-tabs">
                ${['all', 'pass', 'fail'].map((f) => {
                  const isActive = (testFilter[key] || 'all') === f;
                  const counts = { all: visible.length, pass: visible.filter((t) => oc(t.id) && oc(t.id).pass).length, fail: visible.filter((t) => oc(t.id) && !oc(t.id).pass).length };
                  return html`<button class="cp-filter-tab ${isActive ? 'is-active' : ''}" data-action="cp-filter" data-key="${key}" data-filter="${f}">
                    ${f === 'all' ? 'Tất cả' : f === 'pass' ? html`${icon('check-circle', { cls: 'icon-sm' })} Đạt` : html`${icon('x-circle', { cls: 'icon-sm' })} Chưa đạt`} <span class="small muted">${counts[f]}</span>
                  </button>`;
                })}
              </div>` : ''}
            </div>
            ${!r ? html`<p class="small muted">Bấm <strong>Chạy</strong> để thử với test mẫu, hoặc <strong>Nộp bài</strong> để chấm toàn bộ.</p>` : ''}
            ${r && r.outcomes && r.outcomes.some((o) => !o.pass) ? html`<button class="btn btn-secondary btn-sm" data-action="cp-explain-error" data-key="${key}" data-course="${c.id}" data-lesson="${l.id}">${icon('lightbulb', { cls: 'icon-sm' })} Giải thích lỗi này</button>` : ''}
            <ul class="cp-tests">${(() => {
              const f = testFilter[key] || 'all';
              const tests = f === 'all' ? visible : f === 'pass' ? visible.filter((t) => oc(t.id) && oc(t.id).pass) : visible.filter((t) => oc(t.id) && !oc(t.id).pass);
              return tests.map((t) => testRow(t, oc(t.id)));
            })()}</ul>
            ${hidden.length ? (r && r.mode === 'submit'
              ? html`<p class="cp-hidden-sum ${hidden.every((t) => oc(t.id) && oc(t.id).pass) ? 'is-pass' : 'is-fail'}">${icon(hidden.every((t) => oc(t.id) && oc(t.id).pass) ? 'check-circle' : 'x-circle', { cls: 'icon-sm' })} Test ẩn: ${hidden.filter((t) => oc(t.id) && oc(t.id).pass).length}/${hidden.length} đạt${hidden.some((t) => !(oc(t.id) && oc(t.id).pass)) ? ` — xem lại bước ${[...new Set(hidden.filter((t) => !(oc(t.id) && oc(t.id).pass)).map((t) => (t.step || 0) + 1))].join(', ')}` : ''}</p>`
              : html`<p class="small muted">${icon('lock', { cls: 'icon-sm' })} ${hidden.length} test ẩn chỉ chạy khi nộp bài.</p>`) : ''}
          </section>
          <section class="cp-panel cp-console" aria-labelledby="cp-con-${l.id}">
            <h3 class="cp-h3" id="cp-con-${l.id}">${icon('terminal', { cls: 'icon-sm' })} Console</h3>
            ${consoleView(r, { courseId: c.id, lessonId: l.id })}
          </section>
        </div>
      </div>
    </section>`;
  }

  // ───────────────────────── tutorial workspace (Replit-style) ─────────────────────────
  function tutorialView(c, l) {
    const cd = l.code; const steps = cd.steps;
    const e = entry(l.id, c.id, false) || { tutorialStep: 0, tutorialVisited: [0], stepDrafts: {}, stepRuns: {}, solutionViewed: false };
    const i = Math.min(e.tutorialStep || 0, steps.length - 1); const s = steps[i];
    const key = `tu:${c.id}:${l.id}:${i}`; const busy = !!running[key];
    const r = e.stepRuns[i] || null;
    const gated = s.isSolution && !e.solutionViewed;
    const code = e.stepDrafts[i] !== undefined ? e.stepDrafts[i] : s.starter || '';
    const tKey = `${c.id}:${l.id}`;
    const stepPassed = (k) => { const rr = e.stepRuns[k]; return !!(steps[k].tests && rr && rr.outcomes && rr.outcomes.length && rr.outcomes.every((o) => o.pass)); };
    Codi.onMount(restoreFocus);
    return html`<section class="cp-tutorial" data-cp-workspace="${key}" aria-label="Hướng dẫn code">
      <div class="cp-tut-grid">
        <div class="cp-tut-guide">
          <div class="cp-tut-head">
            <button class="btn btn-ghost btn-sm" data-action="cp-toc" data-tkey="${tKey}" aria-expanded="${String(!!tocOpen[tKey])}" aria-controls="cp-toc-${l.id}">${icon('list', { cls: 'icon-sm' })} Mục lục</button>
            <span class="small muted od-nowrap">Bước ${i + 1}/${steps.length}</span>
          </div>
          <div class="progress-segments" aria-hidden="true">${steps.map((_, k) => html`<i class="${e.tutorialVisited.includes(k) && k !== i ? 'done' : k === i ? 'current' : ''}"></i>`)}</div>
          ${tocOpen[tKey] ? html`<ol class="cp-toc" id="cp-toc-${l.id}">${steps.map((st, k) => html`<li><button class="cp-toc-item ${k === i ? 'is-active' : ''}" data-action="cp-step" data-tkey="${tKey}" data-step="${k}" ${k === i ? raw('aria-current="step"') : ''}>
              <span class="cp-toc-n">${stepPassed(k) || (e.tutorialVisited.includes(k) && !steps[k].tests) ? icon('check-circle', { cls: 'icon-sm text-success' }) : k + 1}</span><span>${st.title}</span></button></li>`)}</ol>`
            : html`<article class="cp-tut-step stack-3">
              <h2 class="cp-tut-title">${s.title}</h2>
              ${gated ? html`<div class="cp-gate stack-2">${ui.alert({ type: 'warn', title: 'Bạn chắc muốn xem lời giải?', body: 'Hãy thử tự làm bước "Sửa code của mình!" và "Thử thách" trước — tự tìm ra cách sửa giúp bạn nhớ lâu hơn.' })}<button class="btn btn-secondary" data-action="cp-tut-solution" data-tkey="${tKey}">Hiện lời giải</button></div>` : ui.md(s.body)}
            </article>`}
          <div class="cp-tut-nav">
            <button class="btn btn-ghost" data-action="cp-step" data-tkey="${tKey}" data-step="${i - 1}" ${i === 0 ? raw('disabled') : ''}>${icon('arrow-left', { cls: 'icon-sm' })} Bước trước</button>
            ${i < steps.length - 1 ? html`<button class="btn btn-primary" data-action="cp-step" data-tkey="${tKey}" data-step="${i + 1}">Tiếp: ${steps[i + 1].title} ${icon('arrow-right', { cls: 'icon-sm' })}</button>`
              : html`<span class="badge badge-success">${icon('check-circle')}Đã đi hết hướng dẫn</span>`}
          </div>
        </div>
        <div class="cp-tut-work">
          ${gated ? html`<div class="cp-gate-pane">${icon('eye-off', { cls: 'icon-lg' })}<span>Code lời giải sẽ hiện ở đây sau khi bạn bấm "Hiện lời giải".</span></div>`
            : html`${editor({ id: `cp-tu-${l.id}-${i}`, key, value: code, fileName: cd.fileName, language: cd.language, label: `Trình soạn code, bước ${i + 1}: ${s.title}`, minRows: 12, maxRows: 18 })}
              <div class="cp-actions">
                <button class="btn btn-primary" data-action="cp-run" data-cp-run data-key="${key}" data-mode="${s.tests ? 'submit' : 'run'}" ${busy ? raw('disabled aria-busy="true"') : ''}>${icon('play', { cls: 'icon-sm' })} ${busy ? 'Đang chạy…' : 'Chạy'}</button>
                <button class="btn btn-ghost" data-action="cp-reset" data-key="${key}" ${e.stepDrafts[i] === undefined || busy ? raw('disabled') : ''}>${icon('rotate-ccw', { cls: 'icon-sm' })} Khôi phục code của bước</button>
              </div>`}
          ${s.tests ? html`<section class="cp-panel" aria-label="Kiểm tra bước này"><h3 class="cp-h3">${icon('clipboard-check', { cls: 'icon-sm' })} Kiểm tra bước này</h3><ul class="cp-tests">${s.tests.map((t) => testRow(t, r && r.outcomes ? r.outcomes.find((o) => o.id === t.id) : null))}</ul></section>` : ''}
          <section class="cp-panel cp-console" aria-label="Console"><h3 class="cp-h3">${icon('terminal', { cls: 'icon-sm' })} Console</h3>${consoleView(r, { courseId: c.id, lessonId: l.id })}</section>
        </div>
      </div>
    </section>`;
  }

  function view(c, l) { return l.code.kind === 'tutorial' ? tutorialView(c, l) : challengeView(c, l); }

  // ───────────────────────── actions ─────────────────────────
  Codi.action('cp-run', async (el) => {
    const key = el.dataset.key; if (running[key]) return;
    const k = parseKey(key); const c = Codi.course(k.courseId); const l = Codi.lesson(c, k.lessonId); const cd = l.code;
    const ta = document.querySelector(`[data-cp-input="${key}"]`);
    const e = entry(l.id, c.id, true);
    const isTut = k.kind === 'tu'; const step = isTut ? cd.steps[k.step] : null;
    const code = ta ? ta.value : (isTut ? (e.stepDrafts[k.step] !== undefined ? e.stepDrafts[k.step] : step.starter) : (e.draft !== null ? e.draft : cd.starter));
    if (isTut) e.stepDrafts[k.step] = code; else e.draft = code;
    const mode = el.dataset.mode;
    const tests = isTut ? (step.tests || []) : (mode === 'submit' ? cd.tests : cd.tests.filter((t) => !t.hidden));
    rememberFocus();
    running[key] = true; Codi.rerender();
    const res = await run(code, tests, { language: cd.language, solution: isTut ? null : cd.solution });
    const outcomes = grade(tests, res);
    const lastRun = { mode, at: new Date().toISOString(), phase: res.phase, error: res.error, logs: res.logs, outcomes, inline: !!res.inline, simulated: !!res.simulated };
    e.runs = (e.runs || 0) + 1; e.updatedAt = lastRun.at;
    if (isTut) {
      e.stepRuns[k.step] = lastRun;
    } else {
      e.lastRun = lastRun;
      if (mode === 'submit') {
        e.submits += 1;
        const allPass = outcomes.length > 0 && outcomes.every((o) => o.pass);
        const pct = outcomes.length ? Math.round((outcomes.filter((o) => o.pass).length / outcomes.length) * 100) : 0;
        // The latest submission counts (D7): score and pass status are overwritten, never max'ed.
        const wasPassed = e.passed;
        e.lastScore = pct; e.passed = allPass;
        outcomes.filter((o) => !o.pass).forEach((o) => { e.failedTests[o.id] = (e.failedTests[o.id] || 0) + 1; });
        if (allPass && !wasPassed) ui.toast('Bạn đã đạt tất cả test! Giờ có thể hoàn thành bài học.', { type: 'success' });
        else if (!allPass) { e.failSubmits = (e.failSubmits || 0) + 1; if (wasPassed) ui.toast(`Lần nộp này đạt ${pct}%. Điểm tính theo lần nộp gần nhất.`, { type: 'warn' }); }
      }
    }
    delete running[key];
    Codi.set(null);
  });
  Codi.action('cp-reset', async (el) => {
    const k = parseKey(el.dataset.key); const c = Codi.course(k.courseId); const l = Codi.lesson(c, k.lessonId);
    const r = await ui.confirm({ title: 'Khôi phục code ban đầu?', body: 'Code bạn đang viết sẽ được thay bằng code khởi đầu của bài.', reversible: false, confirmLabel: 'Khôi phục' });
    if (!r.ok) return;
    const e = entry(l.id, c.id, true);
    if (k.kind === 'tu') { delete e.stepDrafts[k.step]; delete e.stepRuns[k.step]; } else { e.draft = null; e.lastRun = null; }
    Codi.set(null);
  });
  Codi.action('cp-solution', async (el) => {
    const k = parseKey(el.dataset.key); const c = Codi.course(k.courseId); const l = Codi.lesson(c, k.lessonId);
    const r = await ui.confirm({ title: 'Xem lời giải?', body: 'Giảng viên sẽ thấy bạn đã xem lời giải trước khi đạt. Bạn vẫn cần tự nộp code đạt tất cả test để hoàn thành bài.', confirmLabel: 'Xem lời giải' });
    if (!r.ok) return;
    entry(l.id, c.id, true).solutionViewed = true;
    Codi.set(null);
  });
  const tutEntry = (el) => { const [courseId, lessonId] = el.dataset.tkey.split(':'); const c = Codi.course(courseId); const l = Codi.lesson(c, lessonId); return { c, l, e: entry(l.id, c.id, true) }; };
  Codi.action('cp-toc', (el) => { tocOpen[el.dataset.tkey] = !tocOpen[el.dataset.tkey]; Codi.rerender(); });
  Codi.action('cp-step', (el) => {
    const { l, e } = tutEntry(el); const n = Number(el.dataset.step);
    if (n < 0 || n >= l.code.steps.length) return;
    e.tutorialStep = n; if (!e.tutorialVisited.includes(n)) e.tutorialVisited.push(n);
    tocOpen[el.dataset.tkey] = false;
    if (n === l.code.steps.length - 1 && e.tutorialVisited.length) ui.toast('Bạn đã đi hết hướng dẫn. Có thể hoàn thành bài học.', { type: 'success' });
    Codi.set(null);
    const ws = document.querySelector('.cp-tut-title'); if (ws) { ws.setAttribute('tabindex', '-1'); ws.focus({ preventScroll: false }); }
  });
  Codi.action('cp-tut-solution', (el) => { const { e } = tutEntry(el); e.solutionViewed = true; Codi.set(null); });
  Codi.action('cp-filter', (el) => { testFilter[el.dataset.key] = el.dataset.filter; Codi.rerender(); });
  Codi.action('cp-format', (el) => {
    // Simple code formatter: normalize indentation
    const k = parseKey(el.dataset.key);
    const ta = document.querySelector(`[data-cp-input="${k.kind}:${k.courseId}:${k.lessonId}:${k.step}"]`) || document.querySelector(`[data-cp-input="${k.kind}:${k.courseId}:${k.lessonId}"]`);
    if (!ta) return;
    rememberFocus();
    const lines = ta.value.split('\n');
    let indent = 0;
    const formatted = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (/^[\}]/.test(trimmed)) indent = Math.max(0, indent - 1);
      const result = '  '.repeat(indent) + trimmed;
      if (/[\{\[]$/.test(trimmed)) indent += 1;
      return result;
    }).join('\n');
    ta.value = formatted;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    restoreFocus();
    ui.toast('Đã định dạng code.', { type: 'success' });
  });
  Codi.action('cp-explain-error', (el) => {
    const k = parseKey(el.dataset.key); const c = Codi.course(k.courseId); const l = Codi.lesson(c, k.lessonId);
    const e = entry(l.id, c.id, false);
    const r = e && e.lastRun;
    const failedTest = r && r.outcomes ? r.outcomes.find((o) => !o.pass) : null;
    if (failedTest && Codi.tutor && typeof Codi.tutor.explainError === 'function') {
      Codi.tutor.explainError(k.courseId, k.lessonId, failedTest.id);
    }
  });

  // Run-level error (syntax / runtime / timeout): the tutor gets the error, the code and the offending line.
  Codi.action('cp-ask-error', (el) => { if (Codi.tutor) Codi.tutor.explainRunError(el.dataset.course, el.dataset.lesson); });

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

  // CSS for code practice
  const cpStyle = document.createElement('style');
  cpStyle.textContent = `
    .cp-tests-head { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
    .cp-filter-tabs { display: flex; gap: var(--space-2); flex-wrap: wrap; }
    .cp-filter-tab { padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--muted); cursor: pointer; font-size: var(--text-sm); display: flex; align-items: center; gap: var(--space-1); transition: all 0.2s; }
    .cp-filter-tab:hover { background: var(--subtle); color: var(--fg); }
    .cp-filter-tab.is-active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); font-weight: 500; }
    .cp-test-details { list-style: none; }
    .cp-test-summary { display: flex; gap: var(--space-3); align-items: flex-start; cursor: pointer; padding: var(--space-2) 0; width: 100%; text-align: left; background: none; border: none; font-size: inherit; }
    .cp-test-summary:hover { opacity: 0.85; }
    .cp-test-body { display: flex; gap: var(--space-2); align-items: center; flex: 1; }
    .cp-test-name { flex: 1; }
    .cp-test-state { white-space: nowrap; font-size: var(--text-sm); color: var(--muted); }
    .cp-test-detail { padding: var(--space-3) 0 var(--space-2) var(--space-5); border-left: 2px solid var(--subtle); margin-top: var(--space-2); }
    .cp-test-io { padding: var(--space-2); background: var(--canvas); border-radius: var(--radius-sm); font-size: var(--text-sm); }
    .cp-test-io strong { display: block; color: var(--muted); font-size: var(--text-xs); margin-bottom: var(--space-1); }
    .cp-test-io code { word-break: break-all; }
    .cp-test-io.is-fail { background: var(--danger-soft); }
    .cp-test-io.is-error { background: var(--danger-soft); }
    .cp-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; padding-top: var(--space-3); border-top: 1px solid var(--border); margin-top: var(--space-3); }
  `;
  document.head.appendChild(cpStyle);

  Codi.code = { TYPES, LANG, highlight, codeBlock, view, status, score, lastErrorText, editor, run, grade, stableJSON, explain, blank, onInput, consoleView, testRow, rememberFocus, restoreFocus };
})();
