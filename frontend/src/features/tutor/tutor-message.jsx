/**
 * One message of a Tutor chat (port of Codi develop's components/ai-chat/ai-chat-message.tsx): the learner's
 * question as a bubble; an answer as its parts in order — reasoning ("Tutor đang suy nghĩ…" / "Đã suy nghĩ", folded once
 * done), tool steps (expandable; material hits as sources), course cards (search_courses), a comparison table
 * (compare_courses), the ≤3-line code suggestion (suggest_code_change) with Áp dụng / Bỏ qua / Hoàn tác / Chạy lại
 * test, then the answer text — followed by line jumps, copy, 👍/👎 and a 👎 reason.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import TutorMarkdown from './tutor-markdown';
import { TIcon } from './tutor-ui';
import { DOWN_REASONS, TOOL_LABELS, formatVnd, messageText } from './tutor-contract';

const isToolPart = (part) => typeof part.type === 'string' && part.type.startsWith('tool-');
const toolName = (part) => part.type.slice(5);
const TOOL_ICONS = { search_course_material: 'search', get_my_progress: 'graduation-cap', search_courses: 'search', compare_courses: 'layers', get_my_learning: 'graduation-cap', suggest_code_change: 'code' };

/** What the model thought before answering, folded by default once it is done. */
function Reasoning({ text, live }) {
  const [open, setOpen] = useState(false);
  if (!text.trim() && !live) return null;
  const shown = (open || live) && text.trim();
  return (
    <div className="tc-step">
      <button type="button" className="tc-step-btn" aria-expanded={open || live} onClick={() => setOpen((v) => !v)}>
        {live ? <Icon name="loader" className="icon-sm tc-spin" /> : <TIcon name="brain" className="icon-sm" />}
        <span>{live ? 'Tutor đang suy nghĩ…' : 'Đã suy nghĩ'}</span>
        {!live ? <Icon name="chevron-down" className={`icon-sm tc-chev ${open ? 'is-open' : ''}`.trim()} /> : null}
      </button>
      {shown ? <p className="tc-step-detail tc-reasoning">{text}</p> : null}
    </div>
  );
}

/** One tool step ("Đã tìm trong tài liệu của học phần"), expandable to show what was found. */
function ToolStep({ name, state, input, detail }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[name] || { running: 'Đang dùng công cụ…', done: 'Đã dùng công cụ' };
  const running = state === 'input-streaming' || state === 'input-available';
  const failed = state === 'output-error';
  const query = input && typeof input === 'object' && typeof input.query === 'string' ? input.query : null;
  return (
    <div className="tc-step">
      <button type="button" className="tc-step-btn" aria-expanded={detail ? open : undefined} disabled={running || !detail} onClick={() => setOpen((v) => !v)}>
        {running ? <Icon name="loader" className="icon-sm tc-spin" /> : failed ? <Icon name="alert-triangle" className="icon-sm tc-warn" /> : <TIcon name={TOOL_ICONS[name] || 'wrench'} className="icon-sm" />}
        <span className="tc-step-text">{failed ? 'Công cụ chưa trả về kết quả' : running ? label.running : label.done}{query ? ` · “${query}”` : ''}</span>
        {!running && detail ? <Icon name="chevron-down" className={`icon-sm tc-chev ${open ? 'is-open' : ''}`.trim()} /> : null}
      </button>
      {open && detail ? <div className="tc-step-detail">{detail}</div> : null}
    </div>
  );
}

function Sources({ hits }) {
  if (!hits.length) return <p>Không tìm thấy bài nào khớp trong học phần.</p>;
  return (
    <ul className="tc-sources">
      {hits.map((hit) => (
        <li key={hit.href}>
          <Link to={hit.href}>{hit.title}</Link>{hit.chapter ? <span> · {hit.chapter}</span> : null}
          <p>{hit.excerpt}</p>
        </li>
      ))}
    </ul>
  );
}

function CourseCards({ courses }) {
  if (!courses.length) return null;
  return (
    <ul className="tc-courses" aria-label="Khoá học Tutor gợi ý">
      {courses.map((c) => (
        <li key={c.id}>
          <Link to={`/courses/${encodeURIComponent(c.slug)}`} className="tc-course">
            <span className="tc-course-title">{c.title}</span>
            <span className="tc-course-meta">
              {c.level} · {c.lessonCount} bài
              {c.rating !== null && c.rating !== undefined ? <> · <Icon name="star" className="icon-xs" /> {Number(c.rating).toFixed(1)}</> : null}
            </span>
            <span className="tc-course-price">
              {c.owned ? <span className="tc-owned"><Icon name="check-circle" className="icon-xs" /> Đã sở hữu</span> : c.price ? formatVnd(c.price) : 'Miễn phí'}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CompareTable({ table }) {
  if (!table || !table.rows || table.rows.length < 2) return null;
  return (
    <div className="tc-table-wrap" tabIndex={0} role="region" aria-label="Bảng so sánh khoá học">
      <table className="tc-table">
        <thead><tr>{table.headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row[0]}>{row.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A ≤3-line suggestion, applied to the editor only when the learner presses "Áp dụng". */
function DiffBlock({ id, diff, actions }) {
  const state = actions.state(id);
  return (
    <div className="tc-diff" role="group" aria-label={`Đề xuất thay đổi${state === 'applied' ? ' (đã áp dụng)' : ''}`}>
      <div className="tc-diff-head">
        <span>Đề xuất thêm {diff.add.length} dòng · trước dòng {diff.at}</span>
        {state === 'applied' ? <span className="badge badge-success"><Icon name="check" className="icon-xs" /> Đã áp dụng</span> : null}
        {state === 'skipped' ? <span className="badge badge-neutral">Đã bỏ qua</span> : null}
      </div>
      <pre className="tc-diff-code">
        {diff.add.map((line, i) => <span key={i} className="is-add"><span aria-hidden="true">+ </span>{line}</span>)}
        <span className="is-ctx"><span aria-hidden="true">{'  '}</span>{diff.context}</span>
      </pre>
      {!actions.codeOpen ? <p className="tc-diff-note">Mở bài code này để áp dụng đề xuất.</p> : state !== 'skipped' ? (
        <div className="tc-diff-actions">
          {state === 'applied' ? (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={actions.rerun}><Icon name="play" className="icon-sm" /> Chạy lại test</button>
              {actions.canUndo(id) ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.undo(id)}><Icon name="rotate-ccw" className="icon-sm" /> Hoàn tác</button> : null}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => actions.apply(id, diff)}><Icon name="check" className="icon-sm" /> Áp dụng</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.skip(id)}>Bỏ qua</button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ToolPart({ part, diff }) {
  const name = toolName(part);
  const output = part.state === 'output-available' ? part.output : null;
  let detail = null;
  let block = null;
  if (output && name === 'search_course_material') detail = <Sources hits={output.hits || []} />;
  if (output && name === 'search_courses') block = <CourseCards courses={output.courses || []} />;
  if (output && name === 'compare_courses') block = <CompareTable table={output} />;
  if (output && name === 'suggest_code_change' && diff && output.ok) block = <DiffBlock id={part.toolCallId} diff={output.diff} actions={diff} />;
  return <><ToolStep name={name} state={part.state} input={part.input} detail={detail} />{block}</>;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      Codi.ui.toast('Hãy chọn và chép nội dung câu trả lời.');
    }
  };
  return (
    <button type="button" className="tc-act" aria-label={copied ? 'Đã chép' : 'Chép câu trả lời'} title={copied ? 'Đã chép' : 'Chép'} onClick={copy}>
      <Icon name={copied ? 'check' : 'copy'} className="icon-sm" />
    </button>
  );
}

/**
 * actions: { vote(value)|null (guests), reason(value), escalate: node|null, lines: number[], onLine(n) }.
 * diff: DiffActions for lesson chats (codeOpen, state, canUndo, apply, undo, skip, rerun) or null.
 */
export default function TutorMessage({ message, streaming, diff, actions }) {
  if (message.role === 'user') {
    return <div className="tc-q"><p>{messageText(message)}</p></div>;
  }
  const text = messageText(message);
  const last = message.parts.length - 1;
  const meta = message.metadata || {};
  return (
    <article className="tc-a" aria-busy={streaming || undefined} aria-label="Câu trả lời của Tutor">
      {message.parts.map((part, i) => {
        if (part.type === 'reasoning') return <Reasoning key={i} text={part.text} live={streaming && part.state === 'streaming'} />;
        if (part.type === 'text') return part.text.trim() ? <TutorMarkdown key={i} text={part.text} streaming={streaming && i === last} /> : null;
        if (isToolPart(part)) return <ToolPart key={part.toolCallId || i} part={part} diff={diff} />;
        return null;
      })}
      {meta.stopped && text !== 'Bạn đã dừng câu trả lời này.' ? <p className="tc-note">Đã dừng câu trả lời.</p> : null}
      {!streaming && actions.lines.length > 0 ? (
        <div className="tc-lines">
          {actions.lines.map((n) => <button key={n} type="button" className="btn btn-secondary btn-sm" onClick={() => actions.onLine(n)}><Icon name="code" className="icon-sm" /> Xem dòng {n}</button>)}
        </div>
      ) : null}
      {!streaming && text ? (
        <div className="tc-acts">
          <CopyButton text={text} />
          {actions.vote ? (
            <>
              <button type="button" className={`tc-act ${meta.vote === 'up' ? 'is-up' : ''}`.trim()} aria-pressed={meta.vote === 'up'} aria-label="Trả lời hữu ích" title="Trả lời hữu ích" onClick={() => actions.vote('up')}><Icon name="thumbs-up" className="icon-sm" /></button>
              <button type="button" className={`tc-act ${meta.vote === 'down' ? 'is-down' : ''}`.trim()} aria-pressed={meta.vote === 'down'} aria-label="Trả lời chưa đúng" title="Trả lời chưa đúng" onClick={() => actions.vote('down')}><Icon name="thumbs-down" className="icon-sm" /></button>
              {meta.vote === 'up' ? <span className="tc-acts-note" role="status">Cảm ơn, Codi sẽ dùng góp ý này để cải thiện Tutor.</span> : null}
            </>
          ) : null}
          {meta.vote === 'down' && !meta.voteReason ? (
            <span className="tc-reasons" role="group" aria-label="Chưa tốt ở điểm nào?">
              <span>Chưa tốt ở điểm nào?</span>
              {DOWN_REASONS.map((r) => <button key={r} type="button" className="tc-reason" onClick={() => actions.reason(r)}>{r}</button>)}
            </span>
          ) : null}
          {meta.voteReason ? <span className="tc-acts-note">Đã ghi nhận: {meta.voteReason}</span> : null}
          {meta.vote === 'down' ? actions.escalate : null}
        </div>
      ) : null}
    </article>
  );
}
