/**
 * AI quiz generation with a review gate before anything reaches the quiz.
 * Port of the real app's components/quiz-builder/quiz-ai-dialog.tsx and generateAiQuizQuestions
 * (courses/[courseId]/actions.ts). Generation calls the real backend action (LLM via the configured AI key; the
 * backend also logs the draft in ai_content_drafts).
 *
 * Installs on Codi.lecturerAI:
 *   quizReview(props) → ReactElement   "Tạo câu hỏi bằng AI" dialog. Props:
 *       open: boolean                       dialog visibility (the caller owns it)
 *       onClose(): void                     close request (Đóng, ×, Esc, after apply)
 *       courseId: string
 *       lessonId: string                    lesson id, or 'entry' for the entry (diagnostic) test
 *       lessonTitle?: string                shown in the description (defaults to the lesson / entry test title)
 *       maxOptions?: number                 option cap used by the validator (default 6)
 *       onApply(questions[]): void          accepted, valid questions only, each
 *                                           { id, conceptId, text, options[4], correctIndex, explanation,
 *                                             difficulty, aiGenerated: true, aiReviewed: true }
 *     Nothing is written to the quiz here; the caller appends the questions to its draft and the lecturer
 *     still saves the quiz.
 *   generateQuizQuestions(courseId, lessonId, count?, difficulty?, { sourceText, focus }?)
 *       → Promise<{ success: true, questions[] } | { success: false, code, message, retryable }>
 *       codes: no_material | rate_limited | not_configured | unavailable | invalid_output (real contract).
 *   validateQuestionDraft({ text, options, correctIndex }, maxOptions?) → string[]   (real lib/quiz-import.ts)
 *   QuizReviewList — the review list component, also used by the document import sheet.
 *
 * Demo flags (Alt+K, client-side): Codi.state.scenario.aiAssistant 'ratelimit' → rate_limited, 'error' →
 * unavailable, 'thinking' → no answer until the real 45 s timeout, then unavailable.
 */
import { useRef, useState } from 'react';
import { Codi } from '../../lib/codi';
import { Alert, Icon } from '../../components/ui/primitives';
import { Modal } from '../../components/ui/overlay-host';
import { api } from '../../lib/api';
import './lecturer-ai.css';

export const DEFAULT_MAX_QUIZ_OPTIONS = 6;
const MAX_PASTE_CHARS = 6000;
const MAX_FOCUS_CHARS = 200;
const COUNT_OPTIONS = [3, 5, 8];
const DIFFICULTY_OPTIONS = [['easy', 'Dễ'], ['medium', 'Vừa'], ['hard', 'Khó']];
const AI_QUIZ_MAX_QUESTIONS = 10;
const AI_QUIZ_MAX_MATERIAL_CHARS = 12000;
const AI_QUIZ_TIMEOUT_MS = 45000;
const STATE_LABEL = { pending: 'Chờ duyệt', accepted: 'Đã chấp nhận', discarded: 'Đã bỏ' };
const NETWORK_ERROR = { success: false, code: 'unavailable', message: 'Không kết nối được tới dịch vụ AI. Vui lòng thử lại.', retryable: true };
const failure = (code, message, retryable) => ({ success: false, code, message, retryable });
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

export function validateQuestionDraft(draft, maxOptions = DEFAULT_MAX_QUIZ_OPTIONS) {
  const errors = [];
  const options = Array.isArray(draft.options) ? draft.options : [];
  if (!String(draft.text || '').trim()) errors.push('Thiếu nội dung câu hỏi.');
  const filled = options.filter((o) => String(o).trim().length > 0);
  if (options.length < 2 || filled.length < 2) errors.push('Cần ít nhất 2 phương án.');
  if (options.length > maxOptions) errors.push(`Tối đa ${maxOptions} phương án mỗi câu.`);
  if (options.some((o) => String(o).trim().length === 0)) errors.push('Có phương án còn trống.');
  const correct = options[draft.correctIndex];
  if (draft.correctIndex < 0 || correct === undefined || !String(correct).trim()) {
    errors.push('Chưa có đáp án đúng (đánh dấu * ở đầu phương án hoặc ghi A–D trong cột đáp án).');
  }
  return errors;
}

function titleFor(code) {
  switch (code) {
    case 'no_material': return 'Chưa có nội dung để AI đọc';
    case 'rate_limited': return 'AI đang bận';
    case 'not_configured': return 'AI chưa sẵn sàng';
    case 'invalid_output': return 'AI chưa tạo đúng định dạng';
    default: return 'AI chưa tạo được nội dung';
  }
}

// ───────────────────────── server action ─────────────────────────
export async function generateQuizQuestions(courseId, lessonId, count = 3, difficulty = 'medium', source = {}) {
  const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
  const validCount = Math.min(Math.max(Math.trunc(Number(count)) || 1, 1), AI_QUIZ_MAX_QUESTIONS);
  const sourceText = typeof source.sourceText === 'string' ? source.sourceText.trim().slice(0, AI_QUIZ_MAX_MATERIAL_CHARS) : '';
  const focus = typeof source.focus === 'string' ? source.focus.trim().slice(0, MAX_FOCUS_CHARS) : '';
  const flag = Codi.state.scenario && Codi.state.scenario.aiAssistant;
  if (flag === 'ratelimit') return failure('rate_limited', 'AI đang quá tải hoặc đã hết lượt tạo trong thời gian ngắn. Đợi một lúc rồi thử lại.', true);
  if (flag === 'thinking') { await sleep(AI_QUIZ_TIMEOUT_MS); return failure('unavailable', 'AI chưa phản hồi. Vui lòng thử lại.', true); }
  if (flag === 'error') { await sleep(1400); return failure('unavailable', 'AI chưa phản hồi. Vui lòng thử lại.', true); }
  let r;
  try {
    r = await api.action('dashboard/lecturer/courses/courseId', 'generateAiQuizQuestions', courseId, lessonId, validCount, diff, { ...(sourceText ? { sourceText } : {}), ...(focus ? { focus } : {}) });
  } catch (e) {
    return failure('unavailable', (e && e.message) || NETWORK_ERROR.message, true);
  }
  if (!r || !r.success) return r && r.code ? r : NETWORK_ERROR;
  const questions = (r.questions || []).map((q) => ({ ...q, id: q.id || Codi.uid('q'), difficulty: diff, aiGenerated: true, aiReviewed: false }));
  if (!questions.length) return failure('invalid_output', 'AI trả về nội dung chưa đúng định dạng. Thử tạo lại.', true);
  return { success: true, questions };
}

// ───────────────────────── review list (shared) ─────────────────────────
/** Builds review items from generated questions. */
export const toReviewItems = (questions, startKey = 1) => questions.map((q, i) => ({ key: startKey + i, question: { ...q }, state: 'pending', editing: false }));

/**
 * Review list with the real gate: Chấp nhận / Sửa (Xong) / Bỏ, Hoàn tác, invalid drafts open in edit mode,
 * "Chấp nhận tất cả" with an inline confirm listing the items. setItems(fn) receives the previous array.
 */
export function QuizReviewList({ items, setItems, maxOptions = DEFAULT_MAX_QUIZ_OPTIONS, onRegenerate }) {
  const [confirmAll, setConfirmAll] = useState(false);
  const isValid = (it) => validateQuestionDraft(it.question, maxOptions).length === 0;
  const update = (key, patch) => setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const updateDraft = (key, patch) => setItems((prev) => prev.map((it) => (it.key === key ? { ...it, question: { ...it.question, ...patch } } : it)));
  const setOption = (key, idx, value) => setItems((prev) => prev.map((it) => {
    if (it.key !== key) return it;
    const options = it.question.options.slice(); options[idx] = value;
    return { ...it, question: { ...it.question, options } };
  }));
  const toggleAccept = (it) => {
    if (it.state === 'accepted') { update(it.key, { state: 'pending' }); return; }
    if (!isValid(it)) { update(it.key, { editing: true }); return; }
    update(it.key, { state: 'accepted', editing: false });
  };
  const acceptAll = () => setItems((prev) => prev.map((it) => (it.state === 'discarded' || !isValid(it) ? it : { ...it, state: 'accepted', editing: false })));
  const accepted = items.filter((it) => it.state === 'accepted' && isValid(it)).length;
  const acceptable = items.filter((it) => it.state === 'pending' && isValid(it));

  return (
    <section className="stack-3" aria-label="Kết quả AI">
      <div className="row-between lai-review-bar">
        <span className="small strong">{items.length} câu · {accepted} đã chấp nhận</span>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmAll(true)} disabled={!acceptable.length}>Chấp nhận tất cả</button>
          {onRegenerate ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setConfirmAll(false); onRegenerate(); }}><Icon name="rotate-ccw" className="icon-sm" /> Tạo lại</button> : null}
        </div>
      </div>
      {confirmAll && acceptable.length > 0 && (
        <div role="alert" className="la-block stack-2">
          <p className="small strong">Chấp nhận {acceptable.length} câu?</p>
          <p className="small muted">Các câu sau sẽ được đánh dấu đã chấp nhận. Bạn vẫn có thể bỏ chấp nhận trước khi thêm vào bài.</p>
          <ol className="small lai-confirm-list">{acceptable.map((it) => <li key={it.key}>{it.question.text}</li>)}</ol>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmAll(false)}>Huỷ</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { acceptAll(); setConfirmAll(false); }}>Chấp nhận {acceptable.length} câu</button>
          </div>
        </div>
      )}
      {!items.length && <p className="small muted">AI chưa tạo được câu nào. Thử dán nội dung chi tiết hơn.</p>}
      <ol className="la-qs">{items.map((it, i) => (
        <ReviewCard key={it.key} index={i} item={it} maxOptions={maxOptions}
          onToggleAccept={() => toggleAccept(it)}
          onToggleEdit={() => update(it.key, { editing: !it.editing })}
          onDiscard={() => update(it.key, { state: it.state === 'discarded' ? 'pending' : 'discarded', editing: false })}
          onDraft={(patch) => updateDraft(it.key, patch)}
          onOption={(idx, v) => setOption(it.key, idx, v)} />
      ))}</ol>
    </section>
  );
}

function ReviewCard({ index, item, maxOptions, onToggleAccept, onToggleEdit, onDiscard, onDraft, onOption }) {
  const { question: q, state, editing } = item;
  const issues = editing ? validateQuestionDraft(q, maxOptions) : [];
  const label = `Câu ${index + 1}`;
  const letter = (k) => String.fromCharCode(65 + k);
  return (
    <li className={`la-q ${state === 'accepted' ? 'is-accepted' : ''} ${state === 'discarded' ? 'is-off' : ''}`}>
      <div className="row-between">
        <span className="row" style={{ gap: 8 }}><strong className="small">{label}</strong>
          <span className={`badge ${state === 'accepted' ? 'badge-success' : 'badge-neutral'}`}>{STATE_LABEL[state]}</span></span>
        <span className="row" style={{ gap: 4 }}>
          {state === 'pending' && (
            <>
              <button type="button" className="btn btn-primary btn-sm" onClick={onToggleAccept}>Chấp nhận</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onToggleEdit}>{editing ? 'Xong' : 'Sửa'}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onDiscard} aria-label={`Bỏ ${label}`}><Icon name="trash" className="icon-sm" /> Bỏ</button>
            </>
          )}
          {state === 'accepted' && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onToggleEdit}>{editing ? 'Xong' : 'Sửa'}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleAccept} aria-label={`Hoàn tác chấp nhận ${label}`}><Icon name="rotate-ccw" className="icon-sm" /> Hoàn tác</button>
            </>
          )}
          {state === 'discarded' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDiscard} aria-label={`Hoàn tác bỏ ${label}`}><Icon name="rotate-ccw" className="icon-sm" /> Hoàn tác</button>
          )}
        </span>
      </div>
      {editing ? (
        <div className="stack-2">
          <textarea rows={2} aria-label={`Nội dung ${label}`} value={q.text} onChange={(e) => onDraft({ text: e.target.value })} />
          {q.options.map((o, k) => (
            <div key={k} className={`row lai-opt ${q.correctIndex === k ? 'is-correct' : ''}`} style={{ gap: 8 }}>
              <input type="radio" name={`ai-correct-${item.key}`} aria-label={`Đáp án đúng ${letter(k)}`} checked={q.correctIndex === k} onChange={() => onDraft({ correctIndex: k })} />
              <span className="xsmall strong muted">{letter(k)}.</span>
              <input className="input od-fill" aria-label={`Phương án ${letter(k)}`} value={o} onChange={(e) => onOption(k, e.target.value)} />
            </div>
          ))}
          <textarea rows={2} aria-label={`Giải thích ${label}`} placeholder="Giải thích đáp án..." value={q.explanation || ''} onChange={(e) => onDraft({ explanation: e.target.value })} />
          {issues.length > 0 && <p role="alert" className="field-error"><Icon name="alert-circle" className="icon-sm" /><span>{issues[0]}</span></p>}
        </div>
      ) : (
        <div className="stack-1">
          <p className="small">{q.text}</p>
          <ul className="rv-opts">{q.options.map((o, k) => (
            <li key={k} className={k === q.correctIndex ? 'is-correct' : ''}>
              <span className="xsmall strong">{letter(k)}.</span><span>{o}</span>
              {k === q.correctIndex ? <Icon name="check" className="icon-sm" title="Đáp án đúng" /> : null}
            </li>
          ))}</ul>
          {q.explanation ? <p className="xsmall muted lai-clamp" title={q.explanation}>Giải thích: {q.explanation}</p> : null}
        </div>
      )}
    </li>
  );
}

// ───────────────────────── dialog ─────────────────────────
function QuizAiDialog({ open, onClose, courseId, lessonId, lessonTitle, maxOptions = DEFAULT_MAX_QUIZ_OPTIONS, onApply }) {
  const [sourceMode, setSourceMode] = useState('lesson');
  const [sourceText, setSourceText] = useState('');
  const [focus, setFocus] = useState('');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState(null);
  const nextKey = useRef(1);
  const run = useRef(0);

  const isEntry = lessonId === 'entry';
  const title = lessonTitle || (isEntry ? 'Bài kiểm tra đầu vào' : '');
  const close = () => { if (onClose) onClose(); };

  const runGeneration = async () => {
    const me = ++run.current;
    setGenerating(true); setError(null);
    let result;
    try {
      result = await generateQuizQuestions(courseId, lessonId, count, difficulty, { sourceText: sourceMode === 'paste' ? sourceText : '', focus });
    } catch (e) {
      console.error('[lecturerAI.quizReview]', e);
      result = NETWORK_ERROR;
    }
    if (me !== run.current) return; // a newer request replaced this one
    setGenerating(false);
    if (!result.success) { setError(result); return; }
    setItems(toReviewItems(result.questions, nextKey.current));
    nextKey.current += result.questions.length;
  };

  const isValid = (it) => validateQuestionDraft(it.question, maxOptions).length === 0;
  const applicable = items ? items.filter((it) => it.state === 'accepted' && isValid(it)) : [];
  const apply = () => {
    if (!applicable.length) return;
    const questions = applicable.map((it) => ({ ...it.question, id: it.question.id || Codi.uid('q'), aiGenerated: true, aiReviewed: true }));
    try {
      if (onApply) onApply(questions);
    } catch (e) {
      console.error('[lecturerAI.quizReview] onApply failed', e);
      Codi.ui.toast('Chưa thêm được câu hỏi. Vui lòng thử lại.', { type: 'danger' });
      return;
    }
    setItems(null);
    close();
  };
  const showResults = items !== null && !generating;

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={close}>Đóng</button>
      {showResults ? (
        <button type="button" className="btn btn-primary" onClick={apply} disabled={!applicable.length}><Icon name="check-circle" className="icon-sm" /> Thêm {applicable.length} câu đã chấp nhận</button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={runGeneration} disabled={generating || (sourceMode === 'paste' && !sourceText.trim())} aria-busy={generating ? 'true' : undefined}>
          {generating ? null : <Icon name="sparkles" className="icon-sm" />} {generating ? 'Đang tạo…' : 'Tạo câu hỏi'}
        </button>
      )}
    </>
  );

  return (
    <Modal open={open} onClose={close} title="Tạo câu hỏi bằng AI" footer={footer} size="lg" dismissible>
      <div className="stack-4">
        <p className="small muted">AI chỉ tạo bản nháp cho bài <strong>{title}</strong>. Chỉ những câu bạn chấp nhận mới được thêm vào bài, và bạn vẫn cần lưu bài trắc nghiệm.</p>
        {error && (
          <Alert type={error.code === 'no_material' ? 'warn' : 'danger'} title={titleFor(error.code)} body={error.message}
            actions={(error.code === 'no_material' || error.retryable) ? (
              <>
                {error.code === 'no_material' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSourceMode('paste'); setItems(null); }}>Dán nội dung</button>}
                {error.retryable && <button type="button" className="btn btn-secondary btn-sm" onClick={runGeneration} disabled={generating}>Thử lại</button>}
              </>
            ) : null} />
        )}
        {generating && (
          <div className="ai-thinking-row" role="status" aria-busy="true"><span className="typing" aria-hidden="true"><i /><i /><i /></span><span>AI đang tạo {count} câu hỏi từ nội dung {isEntry ? 'cả khoá học' : 'bài học'}…</span></div>
        )}
        {!showResults && (
          <fieldset className="stack-3 te-fieldset lai-fieldset" disabled={generating}>
            <legend className="field-label">Nguồn nội dung</legend>
            <div className="row" style={{ gap: 16 }} role="radiogroup" aria-label="Nguồn nội dung">
              <label className="check"><input type="radio" name="ai-quiz-source" checked={sourceMode === 'lesson'} onChange={() => setSourceMode('lesson')} /> {isEntry ? 'Nội dung cả khoá học' : 'Nội dung bài học'}</label>
              <label className="check"><input type="radio" name="ai-quiz-source" checked={sourceMode === 'paste'} onChange={() => setSourceMode('paste')} /> Dán nội dung</label>
            </div>
            {sourceMode === 'lesson' ? (
              <p className="field-help">{isEntry
                ? 'AI đọc tên, mô tả, mục tiêu, chương và nội dung đọc của mọi bài trong khoá học, chia đều cho các chương. Câu hỏi bao quát các khái niệm cốt lõi của khoá. Nếu khoá học chưa có nội dung đọc, hãy chọn &quot;Dán nội dung&quot;.'
                : 'AI đọc mô tả và nội dung đọc của bài học. Nếu bài chưa có nội dung đọc, hãy chọn &quot;Dán nội dung&quot;.'}</p>
            ) : (
              <div className="field">
                <label htmlFor="ai-quiz-paste">Nội dung để tạo câu hỏi</label>
                <textarea id="ai-quiz-paste" rows={6} maxLength={MAX_PASTE_CHARS} value={sourceText} onChange={(e) => setSourceText(e.target.value)} placeholder="Dán đoạn văn, slide hoặc ghi chú bài giảng..." />
                <span className="field-help lai-counter">{sourceText.length}/{MAX_PASTE_CHARS}</span>
              </div>
            )}
            <div className="field">
              <label htmlFor="ai-quiz-focus">Trọng tâm (không bắt buộc)</label>
              <input id="ai-quiz-focus" maxLength={MAX_FOCUS_CHARS} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Ví dụ: sự khác nhau giữa props và state" />
            </div>
            <div className="grid-2">
              <div className="field"><label htmlFor="ai-quiz-count">Số câu</label>
                <select id="ai-quiz-count" value={String(count)} onChange={(e) => setCount(Number(e.target.value))}>{COUNT_OPTIONS.map((n) => <option key={n} value={String(n)}>{n} câu</option>)}</select></div>
              <div className="field"><label htmlFor="ai-quiz-diff">Độ khó</label>
                <select id="ai-quiz-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>{DIFFICULTY_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
            </div>
          </fieldset>
        )}
        {showResults && <QuizReviewList items={items} setItems={(fn) => setItems((prev) => fn(prev || []))} maxOptions={maxOptions} onRegenerate={runGeneration} />}
      </div>
    </Modal>
  );
}

/** Codi.lecturerAI.quizReview(props) → element. */
export function quizReview(props) {
  if (!props || !props.courseId) return null;
  return <QuizAiDialog key={`${props.courseId}/${props.lessonId}`} {...props} />;
}

Object.assign(Codi, {
  lecturerAI: { ...(Codi.lecturerAI || {}), quizReview, generateQuizQuestions, validateQuestionDraft },
});
