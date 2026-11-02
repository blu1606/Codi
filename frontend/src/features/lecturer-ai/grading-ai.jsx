/**
 * AI grading assist for assignment submissions (simulated job, see ./grading-jobs.js).
 * The real app shows a disabled "AI gợi ý điểm và nhận xét" button with a "Sắp có" pill and its getAiGradingDraft
 * action always fails; the product owner kept a working simulation, now as a persisted job per submission
 * (Codi.db().aiGradingJobs) with named stages, live progress, cancel, retry and a reviewable result.
 * Rule G5: the AI never sets a grade. "Dùng bản nháp này" only fills the caller's form; the lecturer saves.
 * Copy for the error / limit states comes from docs/mockup/js/lecturer.js (tc-grade-ai).
 *
 * Installs on Codi.lecturerAI:
 *   getAiGradingDraft(submission, assignment?) → Promise<{ success: true, suggestedScore, scores, feedback }
 *                                                       | { success: false, error, code: 'error'|'limit' }>
 *       one-shot draft (no job). scores holds only the criteria the AI could assess. Follows scenario.aiAssistant.
 *   gradingDraft(props) → ReactElement   job card for one submission. Props:
 *       submission: { id, maxScore, link?, fileName?, note? }   assignment?: { rubric?[] }
 *       disabled?: boolean
 *       onApply({ score, scores, feedback }): void   called only from "Dùng bản nháp này". score is set only when the
 *                                                    assignment has no rubric; scores omits unassessed criteria.
 *   gradingBadge(submissionId) → ReactElement | null   list badge: Đang chấm AI / Có gợi ý AI / Lỗi AI
 *   gradingJobs: { latestJob, startJob, cancelJob, dismissJob, markApplied, badgeStatus }   (store helpers)
 */
import { useEffect, useState } from 'react';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Icon } from '../../components/ui/primitives';
import { gradingResult, evidenceOf, confidenceLabel } from './grading-draft-logic';
import {
  STAGES, QUEUE_MS, ERRORS, isActive, latestJob, liveProgress, ensureRunner,
  startJob, cancelJob, dismissJob, markApplied, badgeStatus,
} from './grading-jobs';
import './lecturer-ai.css';

const num = (n) => String(n).replace('.', ',');
const ms = (iso) => (iso ? new Date(iso).getTime() : NaN);
function seconds(t) {
  if (!Number.isFinite(t) || t < 0) return '—';
  const s = t / 1000;
  if (s < 60) return `${num(s.toFixed(1))} giây`;
  return `${Math.floor(s / 60)} phút ${Math.round(s % 60)} giây`;
}
const SIM_TIP = 'Bản thử nghiệm: AI được mô phỏng. Kết quả suy ra từ bài nộp và thang chấm, không gọi mô hình AI thật.';

export function getAiGradingDraft(sub, a) {
  if (!sub) return Promise.resolve({ success: false, code: 'error', error: ERRORS.missing });
  const flag = Codi.state.scenario && Codi.state.scenario.aiAssistant;
  if (flag === 'ratelimit') return Promise.resolve({ success: false, code: 'limit', error: ERRORS.limit });
  return new Promise((resolve) => {
    if (flag === 'thinking') return; // stays loading until the caller stops waiting
    setTimeout(() => {
      if (flag === 'error') { resolve({ success: false, code: 'error', error: ERRORS.error }); return; }
      try {
        const r = gradingResult(sub, a);
        const scores = Object.fromEntries(Object.entries(r.scores).filter(([, v]) => v.score != null).map(([k, v]) => [k, v.score]));
        resolve({ success: true, suggestedScore: r.total, scores, feedback: r.feedback });
      } catch (e) {
        console.error('[lecturerAI.getAiGradingDraft]', e);
        resolve({ success: false, code: 'error', error: ERRORS.error });
      }
    }, 1300);
  });
}

/** Re-renders every 200 ms while `on`, for the live progress and elapsed time. */
function useTicker(on) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const t = setInterval(() => setT((x) => x + 1), 200);
    return () => clearInterval(t);
  }, [on]);
}

const criterionName = (rubric, id) => (id === 'overall' ? 'Điểm tổng' : (rubric.find((k) => k.id === id) || {}).name || 'Tiêu chí');
const totalPoints = (rubric, sub) => (rubric.length ? rubric.reduce((t, k) => t + (Number(k.points) || 0), 0) : Number(sub.maxScore) || 10);

/** One-line summary of a finished stage. */
function stageSummary(key, { sub, rubric, result }) {
  if (key === 'read') {
    const n = evidenceOf(sub).length;
    const kinds = [sub.note && String(sub.note).trim() ? 'ghi chú' : null, sub.link ? 'liên kết' : null, sub.fileName ? 'tệp' : null].filter(Boolean);
    return n ? `Đọc ${n} nguồn: ${kinds.join(', ')}` : 'Không có nội dung để đọc';
  }
  if (key === 'rubric') return rubric.length ? `${rubric.length} tiêu chí · ${num(totalPoints(rubric, sub))} điểm` : `Thang điểm 0–${num(totalPoints(rubric, sub))}`;
  if (key === 'score') return result ? `Đã chấm ${result.assessed}/${result.criteria} tiêu chí` : 'Đã chấm';
  return result ? `Đã soạn nhận xét · độ tin cậy ${confidenceLabel(result.confidence).toLowerCase()}` : 'Đã soạn nhận xét';
}
function runningText(key, frac, criteria) {
  if (key === 'score') return `Tiêu chí ${Math.min(criteria, Math.floor(frac * criteria) + 1)}/${criteria}`;
  return { read: 'Đang đọc…', rubric: 'Đang đối chiếu…', feedback: 'Đang soạn…' }[key] || 'Đang chạy…';
}

function StageList({ job, live, ctx }) {
  const criteria = ctx.preview ? ctx.preview.criteria : Math.max(1, ctx.rubric.length);
  return (
    <ol className="lai-stages">
      {STAGES.map((s, i) => {
        let state = 'pending';
        if (job.status === 'succeeded' || i < live.stageIndex) state = 'done';
        else if (i === live.stageIndex) state = job.status === 'running' ? 'running' : job.status === 'failed' ? 'error' : job.status === 'cancelled' ? 'stopped' : 'pending';
        const icon = { done: 'check-circle', running: 'loader', error: 'x-circle', stopped: 'circle-dot', pending: 'circle' }[state];
        const stateText = { done: 'Xong', running: 'Đang chạy', error: 'Lỗi', stopped: 'Đã dừng', pending: 'Chưa bắt đầu' }[state];
        const detail = state === 'done' ? stageSummary(s.key, ctx)
          : state === 'running' ? runningText(s.key, live.stageFrac, criteria)
            : state === 'error' ? 'Dừng ở bước này' : state === 'stopped' ? 'Bạn đã dừng ở bước này' : '';
        return (
          <li key={s.key} className={`lai-stage is-${state}`}>
            <Icon name={icon} className="icon-sm lai-stage-icon" />
            <span className="lai-stage-body">
              <span className="small">{s.label}<span className="sr-only"> — {stateText}</span></span>
              {detail && <span className="xsmall muted">{detail}</span>}
            </span>
            {state === 'done' && <span className="xsmall muted num">{seconds(s.ms)}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Meter({ pct, text }) {
  return (
    <div className="lai-meter">
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${pct}% — ${text}`} aria-label="Tiến độ chấm bằng AI">
        <span style={{ width: pct + '%' }} />
      </div>
      <span className="xsmall num" aria-hidden="true">{pct}%</span>
    </div>
  );
}

function CriteriaList({ rubric, scores, upTo, pendingLabel }) {
  const ids = Object.keys(scores);
  return (
    <ul className="lai-crit-list">
      {ids.map((id, i) => {
        const c = scores[id];
        const ready = i < upTo;
        return (
          <li key={id} className={`lai-crit ${ready ? '' : 'is-waiting'}`}>
            <div className="row-between lai-crit-head">
              <span className="small strong">{criterionName(rubric, id)}</span>
              {!ready ? <span className="xsmall muted">{pendingLabel}</span>
                : c.score == null ? <span className="num strong" aria-label={`Chưa chấm được, tối đa ${num(c.max)} điểm`}>–/{num(c.max)}</span>
                  : <span className="num strong">{num(c.score)}/{num(c.max)}</span>}
            </div>
            {ready && <p className="xsmall muted">{c.rationale}</p>}
            {ready && c.evidence && <blockquote className="lai-evidence xsmall">{c.evidence}</blockquote>}
          </li>
        );
      })}
    </ul>
  );
}

function announcement(job, live) {
  if (!job) return '';
  if (job.status === 'queued') return 'AI đã nhận yêu cầu, đang chờ chấm.';
  if (job.status === 'running') { const s = STAGES[live.stageIndex]; return s ? `AI đang ở bước ${s.label.toLowerCase()}.` : 'AI đang chấm.'; }
  if (job.status === 'succeeded') return job.dismissedAt ? '' : 'AI đã soạn xong bản nháp gợi ý. Xem lại trước khi dùng.';
  if (job.status === 'failed') return (job.error && job.error.message) || ERRORS.error;
  if (job.status === 'cancelled') return 'Đã dừng chấm bằng AI.';
  return '';
}

function CardHeader({ title, badge }) {
  return (
    <div className="row-between lai-job-head">
      <strong className="small row" style={{ gap: 6 }}><Icon name="sparkles" className="icon-sm" /> {title}</strong>
      <span className="row" style={{ gap: 6 }}>
        <span className="badge badge-outline" title={SIM_TIP}>Mô phỏng<span className="sr-only">: {SIM_TIP}</span></span>
        {badge}
      </span>
    </div>
  );
}

function GradingJobCard({ submission, assignment, disabled, onApply }) {
  useCodi();
  const job = latestJob(submission.id);
  const active = isActive(job);
  useTicker(active);
  useEffect(() => { if (active) ensureRunner(); }, [active]);
  const rubric = (assignment && Array.isArray(assignment.rubric) && assignment.rubric) || [];
  const live = liveProgress(job);

  const start = () => {
    const r = startJob(submission.id);
    if (!r.ok) Codi.ui.toast(r.error, { type: 'danger' });
  };
  const apply = () => {
    const res = job && job.result; if (!res) return;
    try {
      const scores = Object.fromEntries(Object.entries(res.scores).filter(([id, v]) => id !== 'overall' && v.score != null).map(([id, v]) => [id, v.score]));
      const overall = res.scores.overall;
      if (onApply) onApply({ score: overall && overall.score != null ? overall.score : null, scores, feedback: res.feedback });
      markApplied(job.id);
      Codi.ui.toast('Đã điền bản nháp vào phiếu chấm. Kiểm tra rồi tự lưu điểm.', { type: 'success' });
    } catch (e) {
      console.error('[lecturerAI.gradingDraft] onApply failed', e);
      Codi.ui.toast('Chưa điền được bản nháp vào phiếu chấm.', { type: 'danger' });
    }
  };

  const trigger = (
    <button type="button" className="btn btn-ghost btn-sm" onClick={start} disabled={disabled}><Icon name="sparkles" className="icon-sm" /> AI gợi ý điểm và nhận xét</button>
  );
  const liveRegion = <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement(job, live)}</p>;

  return <div className="lai-job-slot">{liveRegion}{renderBody()}</div>;

  function renderBody() {
    // idle: no job yet, result dismissed, or the last run was stopped
    if (!job || job.dismissedAt || job.status === 'cancelled') {
      return (
        <div className="stack-1">
          <div className="row">{trigger}</div>
          {job && job.status === 'cancelled' && <p className="xsmall muted">Đã dừng lần chấm bằng AI lúc {Codi.fmt.datetime(job.finishedAt)}.</p>}
        </div>
      );
    }

    let preview = null;
    try { preview = gradingResult(submission, assignment); } catch (e) { console.error('[lecturerAI.gradingDraft] preview failed', e); }
    const ctx = { sub: submission, rubric, result: job.result || preview, preview };

    if (active) {
      const queued = job.status === 'queued';
      const elapsed = Date.now() - ms(job.createdAt);
      const stage = STAGES[live.stageIndex];
      const text = queued ? 'Đang chờ đến lượt' : `${stage ? stage.label : 'Đang chấm'}`;
      const criteria = preview ? preview.criteria : 0;
      const upTo = live.stageIndex < 2 ? 0 : live.stageIndex > 2 ? criteria : Math.floor(live.stageFrac * criteria);
      return (
        <section className="lai-job" aria-label="AI gợi ý điểm và nhận xét" aria-busy="true">
          <CardHeader title="AI đang chấm bài" badge={<span className="badge badge-accent">{queued ? 'Đang chờ' : 'Đang chấm'}</span>} />
          <Meter pct={live.progress} text={text} />
          <p className="xsmall muted row-between"><span>{text}</span><span className="num">Đã chạy {seconds(Math.max(0, elapsed))}</span></p>
          <StageList job={job} live={live} ctx={ctx} />
          {preview && !queued && (
            <div className="stack-1">
              <CriteriaList rubric={rubric} scores={preview.scores} upTo={upTo} pendingLabel="Đang chờ" />
              <p className="xsmall muted">Tổng điểm và nhận xét hiện khi chấm xong.</p>
            </div>
          )}
          <div className="row"><button type="button" className="btn btn-ghost btn-sm" onClick={() => cancelJob(job.id)}>Dừng</button></div>
        </section>
      );
    }

    if (job.status === 'failed') {
      const limit = job.error && job.error.code === 'limit';
      return (
        <section className={`lai-job ${limit ? 'is-warn' : 'is-error'}`} aria-label="AI gợi ý điểm và nhận xét">
          <CardHeader title="AI chưa gợi ý được" badge={<span className={`badge ${limit ? 'badge-warn' : 'badge-danger'}`}>{limit ? 'Hết lượt' : 'Lỗi'}</span>} />
          <p className="small row lai-job-msg"><Icon name={limit ? 'alert-triangle' : 'alert-circle'} className="icon-sm" /><span>{(job.error && job.error.message) || ERRORS.error}</span></p>
          {limit ? <p className="xsmall muted">Thử lại sau ít phút, hoặc chấm thủ công theo thang điểm.</p> : <StageList job={job} live={live} ctx={ctx} />}
          <p className="xsmall muted">Lúc {Codi.fmt.datetime(job.finishedAt)}</p>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={start} disabled={disabled}><Icon name="refresh" className="icon-sm" /> Thử lại</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismissJob(job.id)}>Bỏ qua</button>
          </div>
        </section>
      );
    }

    // succeeded
    const res = job.result;
    if (!res || !res.scores) return <div className="row">{trigger}</div>;
    const took = ms(job.finishedAt) - ms(job.createdAt);
    const full = res.assessed === res.criteria;
    return (
      <section className="lai-job lai-grade-draft" aria-label="Bản nháp AI gợi ý">
        <CardHeader title="Bản nháp AI gợi ý" badge={<span className="row" style={{ gap: 6 }}><span className="badge badge-accent">AI đề xuất</span><span className="badge badge-neutral">Mô phỏng</span></span>} />
        <details className="lai-stages-wrap">
          <summary className="xsmall muted">{STAGES.length} bước · {seconds(Number.isFinite(took) ? took : QUEUE_MS)} · xem chi tiết</summary>
          <StageList job={job} live={live} ctx={ctx} />
        </details>
        {res.flags && res.flags.length > 0 && (
          <ul className="lai-flags" aria-label="Lưu ý từ AI">
            {res.flags.map((f) => <li key={f.code}><span className="badge badge-warn"><Icon name="alert-triangle" className="icon-sm" /> {f.label}</span></li>)}
          </ul>
        )}
        <CriteriaList rubric={rubric} scores={res.scores} upTo={Infinity} pendingLabel="" />
        <div className="lai-total row-between small">
          <strong>Tổng gợi ý</strong>
          <span className="num strong">{num(res.total)}/{num(res.max)}</span>
        </div>
        <p className="xsmall muted">
          {full ? `Đã chấm ${res.assessed}/${res.criteria} tiêu chí.` : `Đã chấm ${res.assessed}/${res.criteria} tiêu chí — tiêu chí ghi “–” bạn cần tự chấm; tổng chỉ tính phần AI đã chấm.`}
          {' '}Độ tin cậy: {confidenceLabel(res.confidence)} ({Math.round(res.confidence * 100)}%), dựa trên lượng bằng chứng có trong bài nộp.
        </p>
        <div className="stack-1">
          <strong className="xsmall muted">Nhận xét gợi ý</strong>
          <p className="small">{res.feedback}</p>
        </div>
        <Alert type="info" body="AI chỉ gợi ý. Điểm chỉ được ghi nhận khi bạn kiểm tra và tự lưu điểm." />
        {job.appliedAt && <p className="xsmall ai-draft-note"><Icon name="check" className="icon-sm" /> Đã điền vào phiếu chấm lúc {Codi.fmt.datetime(job.appliedAt)} — xem lại từng điểm và nhận xét trước khi lưu.</p>}
        <div className="row lai-job-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={apply} disabled={disabled}>Dùng bản nháp này</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={start} disabled={disabled}>Chấm lại bằng AI</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismissJob(job.id)}>Bỏ qua</button>
        </div>
      </section>
    );
  }
}

/** Codi.lecturerAI.gradingDraft(props) → element (state follows the submission's stored job). */
export function gradingDraft(props) {
  if (!props || !props.submission) return null;
  return <GradingJobCard key={props.submission.id} {...props} />;
}

const BADGES = {
  running: ['badge-accent', 'Đang chấm AI'],
  ready: ['badge-info', 'Có gợi ý AI'],
  failed: ['badge-danger', 'Lỗi AI'],
};
function GradingJobBadge({ submissionId }) {
  const st = badgeStatus(submissionId);
  useEffect(() => { if (st === 'running') ensureRunner(); }, [st]);
  if (!st) return null;
  const [cls, label] = BADGES[st];
  return <span className={`badge ${cls} lai-list-badge`}><Icon name="sparkles" className="icon-sm" /> {label}</span>;
}
/** Codi.lecturerAI.gradingBadge(submissionId) → element (renders nothing without a visible job). */
export function gradingBadge(submissionId) {
  if (!submissionId) return null;
  return <GradingJobBadge submissionId={submissionId} />;
}

Object.assign(Codi, {
  lecturerAI: {
    ...(Codi.lecturerAI || {}),
    getAiGradingDraft,
    gradingDraft,
    gradingBadge,
    gradingJobs: { latestJob, startJob, cancelJob, dismissJob, markApplied, badgeStatus },
  },
});
