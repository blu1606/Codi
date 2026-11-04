/**
 * Pure (DOM-free) text helpers of the coding UI: key-order-independent JSON, plain-language error explanations, a
 * syntax check used before formatting, and syntax highlighting. Code runs only in the backend sandbox.
 */
import { parse } from 'acorn';
import { esc } from '../../components/ui/primitives';

// Key-order-independent JSON so {paid:2,pending:1} equals {pending:1,paid:2}.
export function stableJSON(v) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'function') return '[Function]';
  if (typeof v === 'number' && !isFinite(v)) return String(v);
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableJSON).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableJSON(v[k])).join(',') + '}';
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

/**
 * Syntax check used before formatting ('' when the code parses). JavaScript only. It parses with acorn instead of
 * compiling with new Function, so the page's Content-Security-Policy needs no 'unsafe-eval'. The options mirror a
 * function body, which is what the learner's code was previously checked as.
 */
export function syntaxError(code) {
  try {
    parse(String(code || ''), { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
    return '';
  } catch (err) {
    return err instanceof SyntaxError ? err.message : '';
  }
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
