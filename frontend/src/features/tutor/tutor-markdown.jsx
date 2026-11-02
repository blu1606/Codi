/**
 * Markdown for Tutor answers, built as React elements (no HTML injection): paragraphs, headings, lists, quotes,
 * GFM tables, fenced code (an unclosed fence while streaming still renders as code), inline code, bold, italic and
 * links. Internal links to /learn/… or /courses/… are citations: a chip that opens the lesson or course in place
 * (Codi's AnswerLink); http(s) links open in a new tab; any other scheme renders as plain text.
 */
import { Link } from 'react-router-dom';
import { Icon } from '../../components/ui/primitives';
import { isCitationHref } from './tutor-contract';

const INLINE = /(`+)([^`]+?)\1|\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|(?<![\w*])\*([^*\n]+?)\*(?![\w*])|(?<![\w_])_([^_\n]+?)_(?![\w_])/;

function inline(text, key = 'i') {
  const out = [];
  let rest = text;
  let n = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) { out.push(rest); break; }
    if (m.index) out.push(rest.slice(0, m.index));
    const k = `${key}-${n++}`;
    if (m[2] !== undefined) out.push(<code key={k}>{m[2]}</code>);
    else if (m[3] !== undefined) out.push(<AnswerLink key={k} href={m[4]}>{inline(m[3], k)}</AnswerLink>);
    else if (m[5] !== undefined || m[6] !== undefined) out.push(<strong key={k}>{inline(m[5] ?? m[6], k)}</strong>);
    else out.push(<em key={k}>{inline(m[7] ?? m[8], k)}</em>);
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

function AnswerLink({ href, children }) {
  if (isCitationHref(href)) {
    return <Link to={href} className="tc-cite"><Icon name="book-open" className="icon-sm" /><span>{children}</span></Link>;
  }
  if (/^https?:\/\//i.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
  return <>{children}</>;
}

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isRule = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

/** Splits the answer into blocks: { type: 'code'|'h'|'ul'|'ol'|'quote'|'table'|'hr'|'p', … }. */
function blocks(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*(```|~~~)\s*([\w+-]*)/.exec(line);
    if (fence) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) { body.push(lines[i]); i += 1; }
      i += 1;
      out.push({ type: 'code', lang: fence[2], text: body.join('\n') });
      continue;
    }
    if (!line.trim()) { i += 1; continue; }
    const h = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (h) { out.push({ type: 'h', text: h[2].replace(/\s#+\s*$/, '') }); i += 1; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push({ type: 'hr' }); i += 1; continue; }
    if (line.includes('|') && i + 1 < lines.length && isRule(lines[i + 1])) {
      const head = cells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(cells(lines[i])); i += 1; }
      out.push({ type: 'table', head, rows });
      continue;
    }
    const item = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (item) {
      const type = item[1] ? 'ul' : 'ol';
      const items = [];
      while (i < lines.length) {
        const it = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(lines[i]);
        if (it && (it[1] ? 'ul' : 'ol') === type) { items.push(it[3]); i += 1; continue; }
        // An indented line continues the previous item.
        if (items.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*(```|~~~)/.test(lines[i])) { items[items.length - 1] += `\n${lines[i].trim()}`; i += 1; continue; }
        break;
      }
      out.push({ type, items, start: item[2] ? Number(item[2]) : 1 });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { body.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
      out.push({ type: 'quote', text: body.join('\n') });
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~|#{1,6}\s|>|[-*+]\s|\d+[.)]\s)/.test(lines[i])
      && !(lines[i].includes('|') && i + 1 < lines.length && isRule(lines[i + 1]))) { para.push(lines[i]); i += 1; }
    if (!para.length) { para.push(line); i += 1; }
    out.push({ type: 'p', text: para.join('\n') });
  }
  return out;
}

const withBreaks = (text, key) => text.split('\n').flatMap((part, n) => (n ? [<br key={`${key}-br${n}`} />, ...inline(part, `${key}-${n}`)] : inline(part, `${key}-${n}`)));

export default function TutorMarkdown({ text, streaming = false }) {
  const list = blocks(text);
  return (
    <div className={`tc-md ${streaming ? 'is-streaming' : ''}`.trim()}>
      {list.map((b, n) => {
        const key = `b${n}`;
        switch (b.type) {
          case 'code': return <pre key={key} className="tc-md-pre" tabIndex={0} aria-label={b.lang ? `Đoạn code ${b.lang}` : 'Đoạn code'}><code>{b.text}</code></pre>;
          case 'h': return <p key={key} className="tc-md-h">{inline(b.text, key)}</p>;
          case 'hr': return <hr key={key} />;
          case 'ul': return <ul key={key}>{b.items.map((t, k) => <li key={k}>{withBreaks(t, `${key}-${k}`)}</li>)}</ul>;
          case 'ol': return <ol key={key} start={b.start}>{b.items.map((t, k) => <li key={k}>{withBreaks(t, `${key}-${k}`)}</li>)}</ol>;
          case 'quote': return <blockquote key={key}>{withBreaks(b.text, key)}</blockquote>;
          case 'table': return (
            <div key={key} className="tc-table-wrap" tabIndex={0} role="region" aria-label="Bảng trong câu trả lời">
              <table className="tc-table">
                <thead><tr>{b.head.map((c, k) => <th key={k} scope="col">{inline(c, `${key}-h${k}`)}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c, `${key}-${k}-${j}`)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
          default: return <p key={key}>{withBreaks(b.text, key)}</p>;
        }
      })}
    </div>
  );
}
