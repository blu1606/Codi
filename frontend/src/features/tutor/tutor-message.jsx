/**
 * One message of a Tutor chat (port of Codi develop's components/ai-chat/ai-chat-message.tsx): the learner's
 * question as a bubble; an answer as one "thinking steps" dropdown (passages read, reasoning and tool calls with their
 * input/output, see tutor-thinking.jsx), then its parts in order — course cards (search_courses), a comparison table
 * (compare_courses), the ≤3-line code suggestion (suggest_code_change) with Áp dụng / Bỏ qua / Hoàn tác / Chạy lại
 * test, then the answer text — followed by line jumps, copy, 👍/👎 and a 👎 reason.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import TutorMarkdown from './tutor-markdown';
import ThinkingSteps, { isToolPart, toolName } from './tutor-thinking';
import { DOWN_REASONS, formatVnd, messageText } from './tutor-contract';

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
            {c.note ? <span className="tc-course-note">{c.note}</span> : null}
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

/** What a finished tool adds to the answer itself; its call and result are listed in the thinking steps. */
function ToolBlock({ part, diff }) {
  const name = toolName(part);
  const output = part.state === 'output-available' ? part.output : null;
  let block = null;
  if (output && (name === 'search_courses' || name === 'recommend_courses_for_profile')) block = <CourseCards courses={output.courses || []} />;
  if (output && name === 'compare_courses') block = <CompareTable table={output} />;
  if (output && name === 'suggest_code_change' && diff && output.ok) block = <DiffBlock id={part.toolCallId} diff={output.diff} actions={diff} />;
  return block;
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
      <ThinkingSteps message={message} streaming={streaming} />
      {message.parts.map((part, i) => {
        if (part.type === 'text') return part.text.trim() ? <TutorMarkdown key={i} text={part.text} streaming={streaming && i === last} /> : null;
        if (isToolPart(part)) return <ToolBlock key={part.toolCallId || i} part={part} diff={diff} />;
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
