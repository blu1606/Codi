/**
 * AI grading suggestions for assignment submissions, on Codi's getAiGradingDraft server action
 * (dashboard/lecturer/grading, Codi feat/ai-grading-suggestions + grading-queue-client.tsx). The server reads the
 * submission's text answer and the assignment rubric, asks the model for a score per rubric criterion (or one
 * overall score) and a feedback draft, and returns them without saving anything or notifying the learner. The view
 * token pins the suggestion to the exact submission version the lecturer is looking at.
 *
 * Lecturer in control (rule G5): the suggestion is shown as a review card. Each criterion (and the feedback) can be
 * accepted as is, edited, or ignored; "Điền vào phiếu chấm" only fills the caller's form with the kept values, and the
 * lecturer still saves the grade. Suggestions live in memory for this tab only (never stored as domain data).
 *
 * Installs on Codi.lecturerAI:
 *   getAiGradingDraft({ submissionId, viewToken }) → Promise<{ success: true, suggestedScore, rubricScores?, feedback,
 *                                                             contextUsed?, sources?, warnings? }
 *                                                           | { success: false, error, warnings? }>
 *       sources: what the server read besides the typed answer (lesson transcripts and passages, the submitted file
 *       and link), each { kind, label, status: 'read'|'skipped', detail? }; warnings: files / links it refused to read.
 *       security: the scan run before the model on every learner-controlled source, each
 *       { source, kind: 'file'|'link'|'text', verdict: 'safe'|'blocked'|'suspicious', reasons[], snippets[] };
 *       also present on failures, so the "Kiểm tra bảo mật" block shows even when the AI step fails.
 *   gradingDraft(props) → ReactElement   suggestion card for one submission. Props:
 *       submission: { id, viewToken, maxScore }   assignment?: { rubric?: [{ id, name, points }] }   disabled?: boolean
 *       onApply({ score, scores, feedback }): void   score is set only without a rubric; scores holds only the kept
 *                                                    criteria; feedback is null when ignored.
 *   gradingBadge(submissionId) → ReactElement | null   list badge: Đang gợi ý AI / Có gợi ý AI / Lỗi AI
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Codi } from '../../lib/codi';
import { api } from '../../lib/api';
import { Alert, Icon } from '../../components/ui/primitives';
import './lecturer-ai.css';

const GRADING_MODULE = 'dashboard/lecturer/grading';
const FALLBACK_ERROR = 'AI chưa gợi ý được. Vui lòng thử lại hoặc chấm bài thủ công.';
const num = (n) => String(n).replace('.', ',');
const parseNum = (t) => Number(String(t ?? '').replace(',', '.').trim());

/** One-shot call to the real action; never throws. */
export async function getAiGradingDraft(input) {
  const submissionId = Number(input && input.submissionId);
  const viewToken = input && typeof input.viewToken === 'string' ? input.viewToken : '';
  if (!Number.isSafeInteger(submissionId) || submissionId <= 0 || !viewToken) return { success: false, error: 'Bài nộp không hợp lệ.' };
  try {
    const r = await api.action(GRADING_MODULE, 'getAiGradingDraft', { submissionId, viewToken });
    if (!r || !r.success || typeof r.suggestedScore !== 'number' || typeof r.feedback !== 'string') {
      return { success: false, error: (r && r.error) || FALLBACK_ERROR, warnings: r && Array.isArray(r.warnings) ? r.warnings : [], security: r && Array.isArray(r.security) ? r.security : [] };
    }
    return r;
  } catch (e) {
    return { success: false, error: (e && typeof e.message === 'string' && e.message) || FALLBACK_ERROR };
  }
}

// ───────────────────────── per-tab suggestion store ─────────────────────────
// submissionId → { seq, viewToken, status: 'loading'|'ready'|'failed', startedAt, result, error, appliedAt, dismissed }
const drafts = new Map();
let version = 0; let seq = 0;
const subs = new Set();
const bump = () => { version += 1; subs.forEach((f) => f()); };
const useDrafts = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version);
const setDraft = (id, value) => { drafts.set(id, value); bump(); };

async function requestDraft(submission) {
  const id = submission.id;
  const mine = ++seq;
  setDraft(id, { seq: mine, viewToken: submission.viewToken, status: 'loading', startedAt: Date.now(), result: null, error: null, appliedAt: null, dismissed: false });
  const r = await getAiGradingDraft({ submissionId: id, viewToken: submission.viewToken });
  const cur = drafts.get(id);
  if (!cur || cur.seq !== mine) return; // stopped, or superseded by a newer request
  setDraft(id, r.success ? { ...cur, status: 'ready', result: r } : { ...cur, status: 'failed', error: r.error || FALLBACK_ERROR, warnings: r.warnings || [], security: r.security || [] });
}
/** "Dừng": forget the pending request; a late answer is ignored (the server keeps nothing either way). */
const stopDraft = (id) => { drafts.delete(id); bump(); };
const dismissDraft = (id) => { const cur = drafts.get(id); if (cur) setDraft(id, { ...cur, dismissed: true }); };

/** Re-renders every second while `on`, for the elapsed time. */
function useTicker(on) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const t = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
}

// ───────────────────────── review card ─────────────────────────
const DECISIONS = [['accept', 'Chấp nhận'], ['edit', 'Sửa'], ['ignore', 'Bỏ qua']];

function Decision({ label, value, onChange, disabled }) {
  return (
    <div className="segmented lai-decision" role="group" aria-label={`Quyết định cho ${label}`}>
      {DECISIONS.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} disabled={disabled} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

/** Rows the card reviews: one per rubric criterion when the AI scored the rubric, else one overall score. */
function rowsOf(result, rubric, maxScore) {
  if (rubric.length && result.rubricScores) {
    return rubric.map((k) => ({ id: k.id, name: k.name || 'Tiêu chí', max: Number(k.points) || 0, ai: result.rubricScores[k.id] }))
      .filter((r) => typeof r.ai === 'number');
  }
  return [{ id: 'overall', name: 'Điểm tổng', max: Number(maxScore) || 10, ai: result.suggestedScore }];
}

const SOURCE_KIND = { transcript: 'transcript', lesson: 'bài học', file: 'tệp', link: 'đường dẫn' };
/** What the AI read (and refused to read) besides the typed answer; renders nothing for a text-only draft. */
function ReadSummary({ result }) {
  const sources = Array.isArray(result.sources) ? result.sources : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const read = sources.filter((s) => s.status === 'read' && s.kind !== 'lesson');
  const skipped = sources.filter((s) => s.status === 'skipped' && (s.kind === 'transcript' || s.kind === 'lesson'));
  if (!result.contextUsed && !read.length && !warnings.length && !skipped.length) return null;
  return (
    <div className="stack-1">
      {(result.contextUsed > 0 || read.length > 0) && (
        <p className="xsmall muted">
          {result.contextUsed > 0 && <>Dựa trên {result.contextUsed} đoạn bài học</>}
          {result.contextUsed > 0 && read.length > 0 && ' · '}
          {read.length > 0 && <>Đã đọc {read.map((s) => `${SOURCE_KIND[s.kind] || s.kind} ${s.label}`).join(', ')}</>}
        </p>
      )}
      {skipped.length > 0 && <p className="xsmall muted">Không dùng: {skipped.map((s) => `${SOURCE_KIND[s.kind] || s.kind} ${s.label}${s.detail ? ` (${s.detail})` : ''}`).join('; ')}</p>}
      {warnings.length > 0 && <Alert type="warn" title={`AI không đọc ${warnings.length} phần của bài nộp`} body={<><span className="xsmall">Các mục dưới đây không được đưa vào chấm. Điểm chỉ dựa trên phần AI đọc được; bạn vẫn có thể chấm tay.</span><ul className="ai-sources">{warnings.map((w) => <li key={w}>{w}</li>)}</ul></>} />}
    </div>
  );
}

// ───────────────────────── security scan ─────────────────────────
const VERDICT = {
  blocked: { badge: 'badge-danger', label: 'Bị chặn', icon: 'alert-circle' },
  suspicious: { badge: 'badge-warn', label: 'Nghi chèn lệnh', icon: 'alert-triangle' },
  safe: { badge: 'badge-success', label: 'An toàn', icon: 'check' },
};
const SECURITY_KIND = { file: 'Tệp', link: 'Đường dẫn', text: 'Bài làm' };
const RANK = { safe: 0, suspicious: 1, blocked: 2 };

/**
 * "Kiểm tra bảo mật": the scan the server ran on the submitted file, link and typed text before anything reached
 * the model. Shown above the draft (and above the error when the AI step failed). Blocked sources were never read;
 * suspicious ones were read, but the model was told not to let them raise the score.
 */
function SecurityScan({ checks }) {
  const list = Array.isArray(checks) ? checks.filter((c) => c && VERDICT[c.verdict]) : [];
  if (!list.length) return null;
  const worst = list.reduce((w, c) => (RANK[c.verdict] > RANK[w] ? c.verdict : w), 'safe');
  const summary = worst === 'blocked' ? 'Có nguồn bị chặn, AI không đọc nguồn đó.'
    : worst === 'suspicious' ? 'Có nội dung nghi chèn lệnh. AI được dặn chỉ chấm theo bằng chứng và không cộng điểm vì đoạn đó.'
      : 'Không phát hiện nội dung nguy hiểm hay câu lệnh chèn.';
  return (
    <section className={`lai-job lai-sec is-${worst}`} aria-label="Kiểm tra bảo mật">
      <div className="row-between lai-job-head">
        <strong className="small row" style={{ gap: 6 }}><Icon name="shield" className="icon-sm" /> Kiểm tra bảo mật</strong>
        <span className={`badge ${VERDICT[worst].badge}`}>{VERDICT[worst].label}</span>
      </div>
      <p className="xsmall muted">{summary}</p>
      <ul className="lai-sec-list">
        {list.map((c) => {
          const v = VERDICT[c.verdict];
          return (
            <li key={`${c.kind}:${c.source}`} className="lai-sec-item">
              <div className="row lai-sec-head">
                <span className={`badge ${v.badge}`}><Icon name={v.icon} className="icon-sm" /> {v.label}</span>
                <span className="small lai-sec-source"><span className="muted">{SECURITY_KIND[c.kind] || c.kind}</span> {c.source}</span>
              </div>
              {c.reasons && c.reasons.length > 0 && <p className="xsmall">{c.reasons.join('; ')}</p>}
              {c.snippets && c.snippets.map((snip) => <q key={snip} className="xsmall mono lai-sec-snippet">{snip}</q>)}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ReviewCard({ submission, rubric, draft, disabled, onApply }) {
  const result = draft.result;
  const rubricWithoutScores = rubric.length > 0 && !result.rubricScores;
  const rows = rowsOf(result, rubric, submission.maxScore);
  const [choice, setChoice] = useState(() => Object.fromEntries(rows.map((r) => [r.id, { decision: 'accept', value: String(r.ai) }])));
  const [fb, setFb] = useState({ decision: 'accept', value: result.feedback });
  const errorOf = (r) => {
    const c = choice[r.id];
    if (!c || c.decision !== 'edit') return null;
    const n = parseNum(c.value);
    return String(c.value).trim() === '' || Number.isNaN(n) || n < 0 || n > r.max ? `Nhập điểm từ 0 đến ${num(r.max)}.` : null;
  };
  const kept = rows.filter((r) => choice[r.id] && choice[r.id].decision !== 'ignore');
  const valueOf = (r) => (choice[r.id].decision === 'edit' ? parseNum(choice[r.id].value) : r.ai);
  const invalid = rows.some((r) => errorOf(r)) || (fb.decision === 'edit' && !fb.value.trim());
  const nothing = (rubricWithoutScores || !kept.length) && fb.decision === 'ignore';
  const keptTotal = Math.round(kept.reduce((t, r) => t + (Number.isNaN(valueOf(r)) ? 0 : valueOf(r)), 0) * 10) / 10;

  const apply = () => {
    if (invalid || nothing) return;
    const feedback = fb.decision === 'ignore' ? null : (fb.decision === 'edit' ? fb.value.trim() : result.feedback);
    const overall = rows.length === 1 && rows[0].id === 'overall' && !rubric.length && kept.length ? valueOf(rows[0]) : null;
    const scores = rubric.length && !rubricWithoutScores ? Object.fromEntries(kept.map((r) => [r.id, valueOf(r)])) : null;
    try {
      onApply({ score: overall, scores, feedback });
      setDraft(submission.id, { ...draft, appliedAt: Date.now() });
      Codi.ui.toast('Đã điền gợi ý vào phiếu chấm. Kiểm tra rồi tự lưu điểm.', { type: 'success' });
    } catch (e) {
      console.error('[lecturerAI.gradingDraft] onApply failed', e);
      Codi.ui.toast('Chưa điền được gợi ý vào phiếu chấm.', { type: 'danger' });
    }
  };
  const set = (id, patch) => setChoice((x) => ({ ...x, [id]: { ...x[id], ...patch } }));

  return (
    <section className="lai-job lai-grade-draft" aria-label="Gợi ý chấm điểm của AI">
      <div className="row-between lai-job-head">
        <strong className="small row" style={{ gap: 6 }}><Icon name="sparkles" className="icon-sm" /> Bản nháp AI gợi ý</strong>
        <span className="badge badge-accent">AI đề xuất</span>
      </div>
      <p className="xsmall muted">Chọn Chấp nhận, Sửa hoặc Bỏ qua cho từng mục. Chỉ các mục bạn giữ lại được điền vào phiếu chấm.</p>
      <ReadSummary result={result} />
      {rubricWithoutScores ? (
        <Alert type="info" body={`AI gợi ý tổng ${num(result.suggestedScore)}/${num(submission.maxScore)} nhưng chưa chấm từng tiêu chí. Hãy tự chấm theo thang điểm; bạn vẫn có thể dùng nhận xét gợi ý.`} />
      ) : (
        <ul className="lai-crit-list">
          {rows.map((r) => {
            const c = choice[r.id]; const err = errorOf(r);
            return (
              <li key={r.id} className={`lai-crit ${c.decision === 'ignore' ? 'is-ignored' : ''}`}>
                <div className="row-between lai-crit-head">
                  <span className="small strong">{r.name}</span>
                  <span className="num strong">AI: {num(r.ai)}/{num(r.max)}</span>
                </div>
                <div className="row lai-crit-actions">
                  <Decision label={r.name} value={c.decision} disabled={disabled} onChange={(v) => set(r.id, { decision: v })} />
                  {c.decision === 'edit' && (
                    <span className="row" style={{ gap: 4 }}>
                      <label className="sr-only" htmlFor={`ai-edit-${submission.id}-${r.id}`}>Điểm sửa cho {r.name}</label>
                      <input id={`ai-edit-${submission.id}-${r.id}`} className="input mono lai-score-input" type="number" min="0" max={r.max} step="0.5"
                        value={c.value} aria-invalid={!!err || undefined} onChange={(e) => set(r.id, { value: e.target.value })} />
                      <span className="xsmall muted">/ {num(r.max)}</span>
                    </span>
                  )}
                </div>
                {err && <p className="xsmall text-danger" role="alert">{err}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {!rubricWithoutScores && (
        <div className="lai-total row-between small">
          <strong>Tổng các mục giữ lại</strong>
          <span className="num strong">{kept.length ? `${num(keptTotal)}/${num(rows.reduce((t, r) => t + r.max, 0))}` : '—'}</span>
        </div>
      )}
      <div className="stack-1">
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <strong className="xsmall muted">Nhận xét gợi ý</strong>
          <Decision label="nhận xét gợi ý" value={fb.decision} disabled={disabled} onChange={(v) => setFb((x) => ({ ...x, decision: v }))} />
        </div>
        {fb.decision === 'edit' ? (
          <>
            <label className="sr-only" htmlFor={`ai-fb-${submission.id}`}>Sửa nhận xét gợi ý</label>
            <textarea id={`ai-fb-${submission.id}`} rows={4} value={fb.value} onChange={(e) => setFb((x) => ({ ...x, value: e.target.value }))} />
            {!fb.value.trim() && <p className="xsmall text-danger" role="alert">Nhận xét không được để trống; chọn Bỏ qua nếu không dùng.</p>}
          </>
        ) : <p className={`small ${fb.decision === 'ignore' ? 'muted lai-ignored-text' : ''}`} style={{ whiteSpace: 'pre-line' }}>{result.feedback}</p>}
      </div>
      <Alert type="info" body="AI chỉ gợi ý. Điểm chỉ được ghi nhận khi bạn kiểm tra và tự lưu điểm; học viên không nhận được gì từ bản nháp này." />
      {draft.appliedAt && <p className="xsmall ai-draft-note"><Icon name="check" className="icon-sm" /> Đã điền vào phiếu chấm lúc {Codi.fmt.datetime(new Date(draft.appliedAt).toISOString())} — xem lại từng điểm và nhận xét trước khi lưu.</p>}
      <div className="row lai-job-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={apply} disabled={disabled || invalid || nothing}>Điền vào phiếu chấm</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => requestDraft(submission)} disabled={disabled}>Gợi ý lại</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismissDraft(submission.id)}>Bỏ qua gợi ý</button>
      </div>
    </section>
  );
}

function GradingDraftCard({ submission, assignment, disabled, onApply }) {
  useDrafts();
  const draft = drafts.get(submission.id) || null;
  const loading = !!draft && draft.status === 'loading';
  useTicker(loading);
  const rubric = (assignment && Array.isArray(assignment.rubric) && assignment.rubric) || [];
  // A suggestion belongs to the submission version it was made for; a newer version needs a new one.
  const outdated = !!draft && !loading && draft.viewToken !== submission.viewToken;
  const start = () => { if (!disabled) requestDraft(submission); };
  const trigger = (
    <button type="button" className="btn btn-ghost btn-sm" onClick={start} disabled={disabled || !submission.viewToken}><Icon name="sparkles" className="icon-sm" /> AI gợi ý điểm và nhận xét</button>
  );
  const live = !draft ? '' : loading ? 'AI đang đọc bài nộp.' : draft.status === 'failed' ? draft.error : draft.dismissed ? '' : 'AI đã soạn xong bản nháp gợi ý. Xem lại trước khi dùng.';

  let body;
  if (!draft || draft.dismissed || outdated) {
    body = (
      <div className="stack-1">
        <div className="row">{trigger}</div>
        {outdated && !draft.dismissed && <p className="xsmall muted">Bài nộp đã thay đổi sau lần gợi ý trước; hãy yêu cầu gợi ý mới.</p>}
      </div>
    );
  } else if (loading) {
    const secs = Math.max(0, Math.round((Date.now() - draft.startedAt) / 1000));
    body = (
      <section className="lai-job" aria-label="AI gợi ý điểm và nhận xét" aria-busy="true">
        <div className="row-between lai-job-head">
          <strong className="small row" style={{ gap: 6 }}><Icon name="loader" className="icon-sm lai-spin" /> AI đang đọc bài nộp…</strong>
          <span className="badge badge-accent">Đang gợi ý</span>
        </div>
        <p className="xsmall muted row-between"><span>Kiểm tra bảo mật tệp, đường dẫn và văn bản đã nộp, rồi đọc bài làm, nội dung bài học liên quan và đối chiếu thang điểm. Thường mất dưới một phút.</span><span className="num">Đã chạy {secs} giây</span></p>
        <div className="row"><button type="button" className="btn btn-ghost btn-sm" onClick={() => stopDraft(submission.id)}>Dừng</button></div>
      </section>
    );
  } else if (draft.status === 'failed') {
    body = (
      <>
      <SecurityScan checks={draft.security} />
      <section className="lai-job is-error" aria-label="AI gợi ý điểm và nhận xét">
        <div className="row-between lai-job-head">
          <strong className="small row" style={{ gap: 6 }}><Icon name="sparkles" className="icon-sm" /> AI chưa gợi ý được</strong>
          <span className="badge badge-danger">Lỗi</span>
        </div>
        <p className="small row lai-job-msg"><Icon name="alert-circle" className="icon-sm" /><span>{draft.error}</span></p>
        {draft.warnings && draft.warnings.length > 0 && !draft.error.startsWith('AI không đọc được bài nộp') && <ul className="xsmall muted">{draft.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={start} disabled={disabled}><Icon name="refresh" className="icon-sm" /> Thử lại</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismissDraft(submission.id)}>Bỏ qua</button>
        </div>
      </section>
      </>
    );
  } else {
    body = (
      <>
        <SecurityScan checks={draft.result.security} />
        <ReviewCard key={draft.seq} submission={submission} rubric={rubric} draft={draft} disabled={disabled} onApply={onApply} />
      </>
    );
  }
  return <div className="lai-job-slot"><p className="sr-only" aria-live="polite" aria-atomic="true">{live}</p>{body}</div>;
}

/** Codi.lecturerAI.gradingDraft(props) → element. */
export function gradingDraft(props) {
  if (!props || !props.submission) return null;
  return <GradingDraftCard key={props.submission.id} {...props} />;
}

const BADGES = {
  loading: ['badge-accent', 'Đang gợi ý AI'],
  ready: ['badge-info', 'Có gợi ý AI'],
  failed: ['badge-danger', 'Lỗi AI'],
};
function GradingDraftBadge({ submissionId }) {
  useDrafts();
  const d = drafts.get(submissionId);
  if (!d || d.dismissed) return null;
  const [cls, label] = BADGES[d.status] || [];
  if (!cls) return null;
  return <span className={`badge ${cls} lai-list-badge`}><Icon name="sparkles" className="icon-sm" /> {label}</span>;
}
/** Codi.lecturerAI.gradingBadge(submissionId) → element (renders nothing without a visible suggestion). */
export function gradingBadge(submissionId) {
  if (!submissionId) return null;
  return <GradingDraftBadge submissionId={submissionId} />;
}

Object.assign(Codi, {
  lecturerAI: {
    ...(Codi.lecturerAI || {}),
    getAiGradingDraft,
    gradingDraft,
    gradingBadge,
  },
});
