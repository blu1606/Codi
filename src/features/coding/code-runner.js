/**
 * Pure (DOM-free) pieces of the coding-practice runtime: JSON comparison, the JavaScript sandbox (Web Worker with a
 * 3 s limit), grading, error explanation and syntax highlighting. Re-exported on Codi.code by code-api.jsx.
 *
 * Follows the real runner (packages/coding-runner): JavaScript only, console output capped at 30 lines, a run that
 * cannot start is an infrastructure failure (phase 'unavailable', never graded), and a test that runs out of time is graded as
 * "Quá thời gian chạy (3 giây).". Python has no sandbox, so it is refused instead of simulated.
 */
import { esc } from '../../components/ui/primitives';

export const TIMEOUT_MS = 3000;
export const LOG_MAX = 30;
export const TIMEOUT_TEXT = 'Quá thời gian chạy (3 giây).';
/** Languages the sandbox can run. Everything else shows "Sandbox chưa sẵn sàng". */
export const available = (language) => (language || 'javascript') === 'javascript';
export const UNAVAILABLE_TEXT = (language) => `Dịch vụ chạy ${language === 'python' ? 'Python' : 'code'} chưa sẵn sàng. Vui lòng thử lại sau.`;

const BUSY_TEXT = 'Sandbox chưa sẵn sàng hoặc đang bận. Code của bạn vẫn được giữ; hãy thử lại.';
// The sandbox could not run at all: an infrastructure failure, never a graded run (real service answers 503).
const unavailableResult = (error) => ({ phase: 'unavailable', error, line: null, logs: [], results: [], durationMs: 0 });

// Key-order-independent JSON so {paid:2,pending:1} equals {pending:1,paid:2}.
export function stableJSON(v) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'function') return '[Function]';
  if (typeof v === 'number' && !isFinite(v)) return String(v);
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableJSON).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableJSON(v[k])).join(',') + '}';
}

// Runs the learner's code once, then evaluates each test expression in the same scope.
// Self-contained (only uses stableJSON): its source is also shipped into the Web Worker.
function execute(code, tests, logMax) {
  const logs = [];
  const started = Date.now();
  const show = (a) => (typeof a === 'string' ? a : stableJSON(a));
  const push = (kind) => (...args) => { if (logs.length < logMax) logs.push({ kind, text: args.slice(0, 8).map(show).join(' ').slice(0, 4096) }); };
  const con = { log: push('log'), info: push('log'), debug: push('log'), warn: push('warn'), error: push('error') };
  // Line of the learner's code an error points at: the Function wrapper adds 2 lines before the body.
  const total = String(code).split('\n').length;
  const lineOf = (err) => {
    const m = /<anonymous>:(\d+):\d+/.exec((err && err.stack) || '') || /Function:(\d+):\d+/.exec((err && err.stack) || '');
    const n = m ? Number(m[1]) - 2 : 0;
    return n >= 1 && n <= total ? n : null;
  };
  let probe;
  try {
    probe = new Function('console', code + '\n;return function (__expr) { return eval(__expr); };')(con);
  } catch (err) {
    return { phase: err instanceof SyntaxError ? 'syntax' : 'runtime', error: err.name + ': ' + err.message, line: lineOf(err), logs, results: [], durationMs: Date.now() - started };
  }
  if (typeof probe !== 'function') return { phase: 'runtime', error: 'Code có lệnh return ở ngoài cùng nên không chạy được test.', line: null, logs, results: [], durationMs: Date.now() - started };
  let phase = 'done'; let firstError = null; let firstLine = null;
  const results = tests.map((t) => {
    const t0 = Date.now();
    try {
      const value = probe(t.call);
      if (value && typeof value.then === 'function') throw new Error('Async/Promise chưa được hỗ trợ. Hãy dùng hàm đồng bộ.');
      const actual = stableJSON(value);
      if (actual.length > 4096) throw new Error('Kết quả vượt quá 4096 ký tự.');
      return { id: t.id, ok: true, actual, durationMs: Date.now() - t0 };
    } catch (err) {
      const error = err.name + ': ' + err.message; const line = lineOf(err);
      if (phase === 'done') { phase = 'runtime'; firstError = error; firstLine = line; }
      return { id: t.id, ok: false, error, line, durationMs: Date.now() - t0 };
    }
  });
  return { phase, error: firstError, line: firstLine, logs, results, durationMs: Date.now() - started };
}
// Function names come from .name so the source stays valid after the bundler minifies identifiers.
export const WORKER_SRC = stableJSON.toString() + '\n' + execute.toString() +
  `\nself.onmessage = function (e) { self.postMessage(${execute.name}(e.data.code, e.data.tests, e.data.logMax)); };`;

/**
 * run(code, tests[{id, call}], {language?, unavailable?}) → Promise<{phase:'done'|'syntax'|'runtime'|'timeout'|'unavailable',
 *   error, line, logs[{kind,text}], results[{id, ok, actual?, error?, line?}], durationMs}>
 * phase 'unavailable' (no results) when the sandbox cannot run: a language without a runner, a blocked worker, or
 * opts.unavailable (forced scenario). It never rejects; callers keep the learner's code and offer "Thử lại".
 */
export function run(code, tests, opts) {
  opts = opts || {};
  const plain = (tests || []).map((t) => ({ id: t.id, call: t.call }));
  if (!available(opts.language)) return Promise.resolve(unavailableResult(UNAVAILABLE_TEXT(opts.language)));
  if (opts.unavailable || typeof Worker === 'undefined') return Promise.resolve(unavailableResult(BUSY_TEXT));
  let w;
  try { w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))); }
  catch { return Promise.resolve(unavailableResult(BUSY_TEXT)); }
  const started = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; clearTimeout(timer); w.terminate(); resolve(v); };
    // Out of time: every test that has no result is graded as a timeout (the real guest interrupt).
    const timer = setTimeout(() => finish({
      phase: 'timeout', error: TIMEOUT_TEXT, line: null, logs: [], durationMs: Date.now() - started,
      results: plain.map((t) => ({ id: t.id, ok: false, timeout: true, error: TIMEOUT_TEXT })),
    }), TIMEOUT_MS);
    w.onmessage = (e) => finish(e.data);
    // The worker itself could not start (blocked by a sandbox / CSP): infrastructure failure, not a graded run.
    w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); finish(unavailableResult(BUSY_TEXT)); };
    w.postMessage({ code, tests: plain, logMax: LOG_MAX });
  });
}

/** Plain-language explanation shown above the raw error ('' when none applies). */
export function explain(err) {
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

/** grade(tests, runResult) → [{id, pass, expected, actual, error, line, phase}] */
export function grade(tests, res) {
  const by = {};
  (res.results || []).forEach((r) => { by[r.id] = r; });
  return tests.map((t) => {
    const expected = stableJSON(t.expected);
    const r = by[t.id];
    if (!r) return { id: t.id, pass: false, expected, actual: null, error: res.error || 'Không chạy được test.', line: res.line || null, phase: res.phase === 'done' ? 'runtime' : res.phase };
    if (!r.ok) return { id: t.id, pass: false, expected, actual: null, error: r.error, line: r.line || null, phase: r.timeout ? 'timeout' : 'runtime' };
    return { id: t.id, pass: r.actual === expected, expected, actual: r.actual, error: null, line: null, phase: 'done' };
  });
}

/** Syntax check used before formatting ('' when the code parses). JavaScript only. */
export function syntaxError(code) {
  try { new Function(String(code || '')); return ''; } catch (err) { return err instanceof SyntaxError ? err.message : ''; }
}

// ───────────────────────── syntax highlighting ─────────────────────────
// Lightweight tokenizer: comments, strings, numbers, keywords, function names. Output is escaped HTML.
const KEYWORDS = {
  javascript: /^(?:const|let|var|function|return|if|else|for|while|do|switch|case|default|break|continue|new|class|extends|import|from|export|async|await|try|catch|finally|throw|typeof|instanceof|in|of|this|true|false|null|undefined)$/,
  python: /^(?:def|return|if|elif|else|for|while|in|not|and|or|is|import|from|as|class|try|except|finally|raise|with|lambda|pass|break|continue|yield|True|False|None)$/,
};
const TOKENS = {
  javascript: /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\.|[^`\\])*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g,
  python: /(#[^\n]*)|("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g,
};
/** highlight(code, language) → escaped HTML string with tk-* spans (trailing newline included). */
export function highlight(code, language) {
  const lang = language === 'python' ? 'python' : 'javascript';
  const re = new RegExp(TOKENS[lang].source, 'g'); const kw = KEYWORDS[lang];
  const src = String(code || '');
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
