// AI text with fenced code: ``` blocks render as <pre><code>, everything else through the shared <Md> subset.
import { Md } from '../../components/ui/primitives';
import TutorMarkdown from '../tutor/tutor-markdown';
import { TIMESTAMP } from '../learning/video-seek';

export function splitFences(text) {
  const parts = [];
  const re = /```[\w-]*\n?([\s\S]*?)(?:```|$)/g;
  const src = String(text || '');
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) parts.push({ type: 'md', text: src.slice(last, m.index) });
    parts.push({ type: 'code', text: m[1].replace(/\n$/, '') });
    last = re.lastIndex;
    if (m[0].length === 0) break;
  }
  if (last < src.length) parts.push({ type: 'md', text: src.slice(last) });
  return parts.filter((p) => p.text.trim());
}

export function RichText({ text, className = '' }) {
  // A line that cites the video ("[mm:ss]") renders through the React Markdown, where the mark seeks the video.
  if (TIMESTAMP.test(String(text || ''))) return <div className={`cr-rich ${className}`.trim()}><TutorMarkdown text={text} /></div>;
  const parts = splitFences(text);
  if (parts.length <= 1 && (!parts[0] || parts[0].type === 'md')) return <Md text={text} className={className} />;
  return (
    <div className={`cr-rich ${className}`.trim()}>
      {parts.map((p, i) => (p.type === 'code'
        ? <pre key={i} className="cr-code"><code>{p.text}</code></pre>
        : <Md key={i} text={p.text} />))}
    </div>
  );
}
