/**
 * Lesson body authored by lecturers (port of real components/lesson-markdown.tsx).
 * Static markdown: raw HTML is escaped (never parsed), links open in a new tab with rel="noopener noreferrer",
 * only http(s), mailto and same-site links are kept, and single line breaks of plain-text bodies are preserved.
 * Supported: # headings, fenced code, `inline code`, **bold**, *italic*, [links](url), - / 1. lists, > quotes.
 */
import { esc } from '../../components/ui/primitives';

const safeHref = (raw) => {
  const href = String(raw || '').trim();
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  return null;
};

function inline(text) {
  // Code spans first so their content is never formatted.
  const parts = String(text).split(/(`[^`]+`)/g);
  return parts.map((part) => {
    if (/^`[^`]+`$/.test(part)) return `<code>${esc(part.slice(1, -1))}</code>`;
    let s = esc(part);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
      const href = safeHref(url.replace(/&amp;/g, '&'));
      return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    return s;
  }).join('');
}

export function lessonMarkdownToHtml(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = []; let list = null; let quote = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote><p>${quote.map(inline).join('<br>')}</p></blockquote>`); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (fence) {
      flushAll();
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { code.push(lines[i]); i++; }
      out.push(`<pre tabindex="0"${fence[1] ? ` data-lang="${esc(fence[1])}"` : ''}><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) { flushAll(); const level = Math.min(4, heading[1].length + 1); out.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/); const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara(); flushQuote();
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((ul || ol)[1]);
      continue;
    }
    const q = line.match(/^\s*>\s?(.*)$/);
    if (q) { flushPara(); flushList(); quote.push(q[1]); continue; }
    if (!line.trim()) { flushAll(); continue; }
    flushList(); flushQuote();
    para.push(line);
  }
  flushAll();
  return out.join('');
}

export default function LessonMarkdown({ text, className = '' }) {
  return <div className={`ln-md ${className}`.trim()} dangerouslySetInnerHTML={{ __html: lessonMarkdownToHtml(text) }} />;
}
