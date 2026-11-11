/**
 * The answer's thinking steps in one dropdown, the way Gemini shows "Show thinking": while the Tutor works, the header
 * names the step it is on ("Đang tìm trong tài liệu…"); once done it reads "Đã suy nghĩ · N bước" and opens to a
 * timeline of every step — course passages read automatically, reasoning text, and each tool call with what it was
 * asked (input) and what it returned (output or error).
 */
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/ui/primitives';
import { TIcon } from './tutor-ui';
import { TOOL_LABELS } from './tutor-contract';

export const isToolPart = (part) => typeof part.type === 'string' && part.type.startsWith('tool-');
export const toolName = (part) => part.type.slice(5);
const TOOL_ICONS = { search_course_material: 'search', get_my_progress: 'graduation-cap', search_courses: 'search', recommend_courses_for_profile: 'compass', compare_courses: 'layers', get_my_learning: 'graduation-cap', suggest_code_change: 'code' };
const FALLBACK_LABEL = { running: 'Đang dùng công cụ…', done: 'Đã dùng công cụ' };
const running = (part) => part.state === 'input-streaming' || part.state === 'input-available';

export function Sources({ hits }) {
  if (!hits.length) return <p>Không tìm thấy nội dung nào khớp trong học phần.</p>;
  return (
    <ul className="tc-sources">
      {hits.map((hit, i) => (
        <li key={`${hit.href}-${i}`}>
          <Link to={hit.href}>{hit.title}</Link>{hit.chapter ? <span> · {hit.chapter}</span> : null}
          <p>{hit.excerpt}</p>
        </li>
      ))}
    </ul>
  );
}

function Json({ value }) {
  const text = JSON.stringify(value, null, 2) ?? '';
  return <pre className="tc-think-json">{text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text}</pre>;
}

/** One tool call: its label, then the arguments and the result it returned. */
function ToolDetail({ part }) {
  const name = toolName(part);
  const output = part.state === 'output-available' ? part.output : undefined;
  return (
    <>
      {part.input !== undefined ? <div className="tc-think-sub"><span>Tham số</span><Json value={part.input} /></div> : null}
      {part.state === 'output-error' ? <div className="tc-think-sub is-error"><span>Lỗi</span><p>{part.errorText || 'Công cụ chưa trả về kết quả.'}</p></div> : null}
      {output !== undefined ? (
        <div className="tc-think-sub">
          <span>Kết quả</span>
          {name === 'search_course_material' ? <Sources hits={output.hits || []} /> : <Json value={output} />}
        </div>
      ) : null}
    </>
  );
}

function stepsOf(message, streaming) {
  const steps = [];
  const retrieved = message.metadata && message.metadata.retrieved;
  if (retrieved && retrieved.length) {
    steps.push({ key: 'context', icon: 'book-open', title: `Đã đọc ${retrieved.length} đoạn tài liệu liên quan trong học phần`, body: <Sources hits={retrieved} /> });
  }
  message.parts.forEach((part, i) => {
    if (part.type === 'reasoning' && part.text.trim()) {
      const live = streaming && part.state === 'streaming';
      steps.push({ key: `r${i}`, icon: 'brain', live, title: live ? 'Đang suy nghĩ…' : 'Suy nghĩ', body: <p className="tc-reasoning">{part.text}</p> });
    } else if (isToolPart(part)) {
      const name = toolName(part);
      const label = TOOL_LABELS[name] || FALLBACK_LABEL;
      const query = part.input && typeof part.input.query === 'string' ? ` · “${part.input.query}”` : '';
      const failed = part.state === 'output-error';
      steps.push({
        key: part.toolCallId || `t${i}`,
        icon: failed ? 'alert-triangle' : TOOL_ICONS[name] || 'wrench',
        live: running(part),
        failed,
        title: `${failed ? 'Công cụ chưa trả về kết quả' : running(part) ? label.running : label.done}${query}`,
        tool: name,
        body: <ToolDetail part={part} />,
      });
    }
  });
  return steps;
}

export default function ThinkingSteps({ message, streaming }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const steps = stepsOf(message, streaming);
  if (!steps.length) return null;
  const answering = message.parts.some((p) => p.type === 'text' && p.text.trim());
  const active = [...steps].reverse().find((s) => s.live);
  const working = streaming && !answering;
  const title = working ? (active ? active.title : 'Tutor đang suy nghĩ…') : `Đã suy nghĩ · ${steps.length} bước`;
  return (
    <div className={`tc-think ${open ? 'is-open' : ''}`.trim()}>
      <button type="button" className="tc-think-head" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((v) => !v)}>
        {working ? <Icon name="loader" className="icon-sm tc-spin" /> : <TIcon name="brain" className="icon-sm" />}
        <span className="tc-step-text" aria-live={working ? 'polite' : undefined}>{title}</span>
        <Icon name="chevron-down" className={`icon-sm tc-chev ${open ? 'is-open' : ''}`.trim()} />
      </button>
      {open ? (
        <ol id={panel} className="tc-think-list">
          {steps.map((step) => (
            <li key={step.key} className={`tc-think-step ${step.failed ? 'is-failed' : ''}`.trim()}>
              <span className="tc-think-dot" aria-hidden="true">
                {step.live && streaming ? <Icon name="loader" className="icon-xs tc-spin" /> : <TIcon name={step.icon} className="icon-xs" />}
              </span>
              <div className="tc-think-body">
                <p className="tc-think-title">{step.title}{step.tool ? <code>{step.tool}</code> : null}</p>
                {step.body}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
