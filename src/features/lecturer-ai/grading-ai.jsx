/**
 * AI grading draft for assignment submissions (simulated).
 * The real app shows a disabled "AI gợi ý điểm và nhận xét" button with a "Sắp có" pill and its getAiGradingDraft
 * action always fails; the product owner kept a working simulation. The draft is only a suggestion: it is shown for
 * review and reaches the grading form only when the lecturer presses "Dùng bản nháp này". It never saves a grade.
 * States and copy for loading / error / limit come from docs/mockup/js/lecturer.js (tc-grade-ai).
 *
 * Installs on Codi.lecturerAI:
 *   getAiGradingDraft(submission, assignment?) → Promise<{ success: true, suggestedScore, scores, feedback }
 *                                                       | { success: false, error, code: 'error'|'limit' }>
 *       assignment.rubric[{ id, name, points, desc }] → per-criterion scores; otherwise one score out of
 *       submission.maxScore. Scores are 0..max, rounded to 0.5. Follows Codi.state.scenario.aiAssistant.
 *   gradingDraft(props) → ReactElement   button + states + draft review. Props:
 *       submission: { id, maxScore, link?, fileName?, note? }   assignment?: { rubric?[] }
 *       disabled?: boolean (e.g. already graded / locked)
 *       onApply({ score, scores, feedback }): void   called only from "Dùng bản nháp này"; the caller fills its
 *                                                    form fields and the lecturer still saves the grade.
 */
import { useEffect, useRef, useState } from 'react';
import { Codi } from '../../lib/codi';
import { Alert, Icon } from '../../components/ui/primitives';
import './lecturer-ai.css';

const half = (n) => Math.round(n * 2) / 2;
const clamp = (n, max) => Math.min(max, Math.max(0, n));
const fmt = (n) => String(n).replace('.', ',');

/** Deterministic draft from the submission's evidence (link, file, note length). */
function draftFor(sub, a) {
  const rubric = (a && Array.isArray(a.rubric) && a.rubric) || [];
  const evidence = (sub.link ? 1 : 0) + (sub.fileName ? 1 : 0) + (String(sub.note || '').trim().length > 20 ? 1 : 0);
  const base = evidence >= 2 ? 0.85 : evidence === 1 ? 0.7 : 0.5;
  const scores = {};
  rubric.forEach((k, i) => { const pts = Number(k.points) || 0; scores[k.id] = clamp(half(pts * (base - [0, 0.1, 0.05, 0.15][i % 4])), pts); });
  const max = rubric.length ? rubric.reduce((t, k) => t + (Number(k.points) || 0), 0) : Number(sub.maxScore) || 10;
  const suggestedScore = rubric.length ? Math.round(rubric.reduce((t, k) => t + scores[k.id], 0) * 10) / 10 : clamp(half(max * base), max);
  const weakest = rubric.slice().sort((x, y) => scores[x.id] / (Number(x.points) || 1) - scores[y.id] / (Number(y.points) || 1))[0];
  const evidenceNote = evidence ? '' : ' Bài nộp chưa có liên kết, tệp hay ghi chú mô tả, nên mình chưa kiểm tra được hết yêu cầu.';
  const feedback = `Bài làm đáp ứng phần lớn yêu cầu${sub.note ? ', ghi chú của bạn giúp mình hiểu cách làm' : ''}.${evidenceNote} Điểm cần cải thiện nhất: ${weakest ? `${weakest.name.toLowerCase()} — ${String(weakest.desc || '').toLowerCase()}` : 'trình bày bài nộp'}. Gợi ý: kiểm tra lại các trường hợp biên trước khi nộp lần sau.`;
  return { suggestedScore, scores, feedback, max };
}

export function getAiGradingDraft(sub, a) {
  if (!sub) return Promise.resolve({ success: false, code: 'error', error: 'Không tìm thấy bài nộp.' });
  const flag = Codi.state.scenario && Codi.state.scenario.aiAssistant;
  if (flag === 'ratelimit') return Promise.resolve({ success: false, code: 'limit', error: 'Đã dùng hết lượt gợi ý bằng AI trong giờ này.' });
  return new Promise((resolve) => {
    if (flag === 'thinking') return; // stays loading until the lecturer stops it
    setTimeout(() => {
      if (flag === 'error') { resolve({ success: false, code: 'error', error: 'AI chưa gợi ý được.' }); return; }
      try { resolve({ success: true, ...draftFor(sub, a) }); } catch (e) { console.error('[lecturerAI.getAiGradingDraft]', e); resolve({ success: false, code: 'error', error: 'AI chưa gợi ý được.' }); }
    }, 1300);
  });
}

function GradingDraft({ submission, assignment, disabled, onApply }) {
  const [st, setSt] = useState({ state: 'idle', draft: null, applied: false });
  const run = useRef(0);
  useEffect(() => () => { run.current += 1; }, []);
  const rubric = (assignment && Array.isArray(assignment.rubric) && assignment.rubric) || [];

  const start = async () => {
    const me = ++run.current;
    setSt({ state: 'loading', draft: null, applied: false });
    const r = await getAiGradingDraft(submission, assignment);
    if (me !== run.current) return;
    if (r.success) setSt({ state: 'done', draft: r, applied: false });
    else setSt({ state: r.code === 'limit' ? 'limit' : 'error', draft: null, applied: false });
  };
  const stop = () => { run.current += 1; setSt({ state: 'idle', draft: null, applied: false }); };
  const apply = () => {
    const d = st.draft; if (!d) return;
    try {
      if (onApply) onApply({ score: d.suggestedScore, scores: { ...d.scores }, feedback: d.feedback });
      setSt((s) => ({ ...s, applied: true }));
    } catch (e) {
      console.error('[lecturerAI.gradingDraft] onApply failed', e);
      Codi.ui.toast('Chưa điền được bản nháp vào phiếu chấm.', { type: 'danger' });
    }
  };

  if (st.state === 'loading') {
    return (
      <div className="ai-thinking-row" role="status" aria-busy="true"><span className="typing" aria-hidden="true"><i /><i /><i /></span><span>AI đang đọc bài nộp…</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={stop}>Dừng</button></div>
    );
  }
  const trigger = (
    <button type="button" className="btn btn-ghost btn-sm" onClick={start} disabled={disabled}><Icon name="sparkles" className="icon-sm" /> AI gợi ý điểm và nhận xét</button>
  );
  if (st.state === 'error') {
    return <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>AI chưa gợi ý được. <button type="button" className="btn-link" onClick={start}>Thử lại</button></span></p>;
  }
  if (st.state === 'limit') {
    return <p className="small text-warn" role="status"><Icon name="alert-triangle" className="icon-sm" /> Đã dùng hết lượt gợi ý bằng AI trong giờ này.</p>;
  }
  if (st.state !== 'done' || !st.draft) return <div className="row">{trigger}</div>;

  const d = st.draft;
  if (st.applied) {
    return (
      <div className="stack-2">
        <p className="xsmall muted ai-draft-note" role="status"><Icon name="sparkles" className="icon-sm" /> Đã điền bản nháp do AI gợi ý — xem lại từng điểm và nhận xét trước khi lưu.</p>
        <div className="row">{trigger}</div>
      </div>
    );
  }
  return (
    <section className="la-block lai-grade-draft" aria-label="Bản nháp AI gợi ý">
      <div className="row-between">
        <strong className="small"><Icon name="sparkles" className="icon-sm" /> Bản nháp AI gợi ý</strong>
        <span className="badge badge-accent">AI đề xuất</span>
      </div>
      {rubric.length ? (
        <ul className="lai-grade-list small">{rubric.map((k) => (
          <li key={k.id}><span>{k.name}</span><span className="num strong">{fmt(d.scores[k.id])}/{fmt(Number(k.points) || 0)}</span></li>
        ))}<li className="strong"><span>Tổng</span><span className="num">{fmt(d.suggestedScore)}/{fmt(d.max)}</span></li></ul>
      ) : (
        <p className="small">Điểm gợi ý: <strong className="num">{fmt(d.suggestedScore)}/{fmt(d.max)}</strong></p>
      )}
      <p className="small">{d.feedback}</p>
      <Alert type="info" body="AI chỉ gợi ý. Điểm chỉ được ghi nhận khi bạn kiểm tra và tự lưu điểm." />
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={apply} disabled={disabled}>Dùng bản nháp này</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={stop}>Bỏ bản nháp</button>
      </div>
    </section>
  );
}

/** Codi.lecturerAI.gradingDraft(props) → element (state resets per submission). */
export function gradingDraft(props) {
  if (!props || !props.submission) return null;
  return <GradingDraft key={props.submission.id} {...props} />;
}

Object.assign(Codi, {
  lecturerAI: { ...(Codi.lecturerAI || {}), getAiGradingDraft, gradingDraft },
});
