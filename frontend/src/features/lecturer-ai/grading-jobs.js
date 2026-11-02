/**
 * AI grading-assist jobs (simulated runner; Codi's getAiGradingDraft is disabled). Jobs are browser-local
 * (localStorage 'codi-ai-grading-jobs'); the submission and rubric come from the grading page via registerSubmission().
 *
 * Job: { id, submissionId, lecturerId, status: 'queued'|'running'|'succeeded'|'failed'|'cancelled', stage, progress,
 *        createdAt, startedAt, finishedAt, error: { code: 'error'|'limit'|'missing', message } | null,
 *        result: { total, max, scores, feedback, confidence, flags } | null, appliedAt, appliedBy, dismissedAt }
 *
 * Timing is derived from timestamps, so a job that was running when the lecturer left the page (or reloaded) is
 * resumed from where the clock says it is, and one that should have finished is completed on the next tick.
 * Only stage transitions are written to the store; the card computes the live progress between them.
 * Scenario flag Codi.state.scenario.aiAssistant: 'ratelimit' fails before running, 'error' fails while scoring,
 * 'thinking' holds on the last stage until it is cancelled or the flag changes. The AI never writes a grade (G5):
 * applying a result only stamps appliedAt / appliedBy; the caller fills its form and the lecturer saves.
 */
import { Codi } from '../../lib/codi';
import { gradingResult } from './grading-draft-logic';

export const STAGES = [
  { key: 'read', label: 'Đọc bài nộp', ms: 900 },
  { key: 'rubric', label: 'Đối chiếu thang chấm', ms: 800 },
  { key: 'score', label: 'Chấm từng tiêu chí', ms: 1500 },
  { key: 'feedback', label: 'Soạn nhận xét', ms: 1000 },
];
export const QUEUE_MS = 600;
const TOTAL_MS = STAGES.reduce((t, s) => t + s.ms, 0);
const SCORE_START = STAGES.slice(0, 2).reduce((t, s) => t + s.ms, 0);
const FAIL_AT_MS = SCORE_START + STAGES[2].ms / 2; // 'error' scenario fails half-way through scoring
const HOLD_PCT = 95; // 'thinking' scenario never passes this
const TICK_MS = 250;

export const ERRORS = {
  error: 'AI chưa gợi ý được. Vui lòng thử lại hoặc chấm thủ công theo thang điểm.',
  limit: 'Đã dùng hết lượt gợi ý bằng AI trong giờ này.',
  missing: 'Không tìm thấy bài nộp.',
};
const ACTIVE = new Set(['queued', 'running']);
export const isActive = (j) => !!j && ACTIVE.has(j.status);

const ms = (iso) => (iso ? new Date(iso).getTime() : NaN);
const iso = (t) => new Date(t).toISOString();
const flag = () => (Codi.state.scenario && Codi.state.scenario.aiAssistant) || 'ok';

const STORE_KEY = 'codi-ai-grading-jobs';
let jobs = (() => { try { const v = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } })();
const jobsMut = () => jobs;
const jobsRead = () => jobs;
/** Persists the jobs locally and re-renders the subscribed screens. */
function commit() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(jobs.slice(-200))); } catch { /* storage full or disabled */ }
  if (Codi.rerender) Codi.rerender();
}
// Submissions the grading page shows: { [id]: { sub: { id, maxScore, link, fileName, note }, assignment: { rubric[] } } }
const registry = new Map();
/** Called by the grading card so a job can read the submission it grades. */
export function registerSubmission(sub, assignment) { if (sub && sub.id != null) registry.set(sub.id, { sub, assignment: assignment || { rubric: [] } }); }
const currentUser = () => (Codi.session && Codi.session.user) || null;
const canGrade = () => { const roles = (Codi.session && Codi.session.roles) || []; return roles.includes('LECTURER') || roles.includes('ADMIN'); };

/** Latest job for a submission (any status), or null. */
export function latestJob(submissionId) {
  let best = null;
  for (const j of jobsRead()) if (j && j.submissionId === submissionId && (!best || (j.createdAt || '') >= (best.createdAt || ''))) best = j;
  return best;
}
export const activeJob = (submissionId) => jobsRead().find((j) => j && j.submissionId === submissionId && isActive(j)) || null;

/** Stage index + overall percent for an elapsed running time. */
export function stageAt(elapsed) {
  let acc = 0;
  for (let i = 0; i < STAGES.length; i += 1) {
    if (elapsed < acc + STAGES[i].ms) return { index: i, frac: Math.max(0, elapsed - acc) / STAGES[i].ms, pct: ((acc + Math.max(0, elapsed - acc)) / TOTAL_MS) * 100 };
    acc += STAGES[i].ms;
  }
  return { index: STAGES.length - 1, frac: 1, pct: 100 };
}
const stageStartPct = (index) => Math.round((STAGES.slice(0, index).reduce((t, s) => t + s.ms, 0) / TOTAL_MS) * 100);

/** Live view of a job at time `now`: { stageIndex, stageFrac (0..1 within the stage), progress (integer 0..100) }. */
export function liveProgress(job, now = Date.now()) {
  if (!job) return { stageIndex: -1, stageFrac: 0, progress: 0 };
  const idx = STAGES.findIndex((s) => s.key === job.stage);
  if (job.status === 'queued') return { stageIndex: -1, stageFrac: 0, progress: 0 };
  if (job.status === 'succeeded') return { stageIndex: STAGES.length, stageFrac: 1, progress: 100 };
  if (job.status !== 'running') return { stageIndex: idx, stageFrac: job.stageFrac || 0, progress: Math.round(job.progress || 0) };
  const at = stageAt(now - ms(job.startedAt));
  const cap = flag() === 'thinking' ? HOLD_PCT : 99;
  const held = flag() === 'thinking' && at.pct >= HOLD_PCT;
  return { stageIndex: at.index, stageFrac: held ? Math.min(at.frac, 0.8) : at.frac, progress: Math.min(cap, Math.floor(at.pct)) };
}

function assignmentOf(sub) {
  const r = registry.get(sub.id);
  return (r && r.assignment) || { rubric: [] };
}
function fail(j, code, now) {
  Object.assign(j, { status: 'failed', finishedAt: iso(now), error: { code, message: ERRORS[code] || ERRORS.error }, result: null });
}

/** Advances one job to `now`. Returns true when the stored job changed. */
function advance(j, now) {
  let changed = false;
  if (j.status === 'queued' && now - ms(j.createdAt) >= QUEUE_MS) {
    const startAt = ms(j.createdAt) + QUEUE_MS;
    if (flag() === 'ratelimit') { fail(j, 'limit', startAt); return true; }
    Object.assign(j, { status: 'running', startedAt: iso(startAt), stage: STAGES[0].key, progress: 0 });
    changed = true;
  }
  if (j.status !== 'running') return changed;
  const elapsed = now - ms(j.startedAt);
  if (Number.isNaN(elapsed)) { fail(j, 'error', now); return true; }
  if (flag() === 'error' && elapsed >= FAIL_AT_MS) {
    Object.assign(j, { stage: STAGES[2].key, stageFrac: 0.5, progress: Math.floor((FAIL_AT_MS / TOTAL_MS) * 100) });
    fail(j, 'error', Math.min(now, ms(j.startedAt) + FAIL_AT_MS));
    return true;
  }
  if (elapsed >= TOTAL_MS && flag() !== 'thinking') {
    const sub = (registry.get(j.submissionId) || {}).sub;
    if (!sub) { fail(j, 'missing', now); return true; }
    try {
      const result = gradingResult(sub, assignmentOf(sub));
      Object.assign(j, { status: 'succeeded', stage: STAGES[STAGES.length - 1].key, progress: 100, finishedAt: iso(Math.min(now, ms(j.startedAt) + TOTAL_MS)), result, error: null });
    } catch (e) {
      console.error('[lecturerAI.gradingJobs] result failed', e);
      fail(j, 'error', now);
    }
    return true;
  }
  const { index } = stageAt(Math.min(elapsed, TOTAL_MS - 1));
  if (j.stage !== STAGES[index].key) { j.stage = STAGES[index].key; j.progress = stageStartPct(index); changed = true; }
  return changed;
}

let timer = null;
function tick() {
  const now = Date.now();
  const active = jobsRead().filter(isActive);
  let dirty = false;
  active.forEach((j) => { if (advance(j, now)) dirty = true; });
  if (dirty) commit(); // jobs were mutated in place above
  if (!jobsRead().some(isActive)) { clearInterval(timer); timer = null; }
}
/** Starts the shared ticker when a job is active (idempotent). Safe to call from effects. */
export function ensureRunner() {
  if (timer || !jobsRead().some(isActive)) return;
  timer = setInterval(tick, TICK_MS);
  tick();
}

/** Queues a job for the submission, or returns the active one (one active job per submission). */
export function startJob(submissionId) {
  const user = currentUser();
  if (!user || !canGrade()) return { ok: false, error: 'Bạn không có quyền dùng AI chấm bài.' };
  const sub = (registry.get(submissionId) || {}).sub;
  if (!sub) return { ok: false, error: ERRORS.missing };
  const existing = activeJob(submissionId);
  if (existing) { ensureRunner(); return { ok: true, job: existing }; }
  const job = {
    id: Codi.uid('aigj'), submissionId, lecturerId: user.id, status: 'queued', stage: null, progress: 0,
    createdAt: iso(Date.now()), startedAt: null, finishedAt: null, error: null, result: null,
    appliedAt: null, appliedBy: null, dismissedAt: null,
  };
  jobsMut().push(job); commit();
  ensureRunner();
  return { ok: true, job };
}

function update(jobId, fn) {
  const j = jobsRead().find((x) => x.id === jobId);
  if (!j) return false;
  let ok = false;
  ok = fn(j) !== false; commit();
  return ok;
}

/** Stops a queued/running job. */
export const cancelJob = (jobId) => update(jobId, (j) => {
  if (!isActive(j)) return false;
  const { progress, stageIndex, stageFrac } = liveProgress(j);
  Object.assign(j, { status: 'cancelled', finishedAt: iso(Date.now()), progress, stage: stageIndex >= 0 ? STAGES[stageIndex].key : null, stageFrac });
  return true;
});

/** Marks a succeeded job as used for the form (never saves a grade). */
export const markApplied = (jobId) => update(jobId, (j) => {
  if (j.status !== 'succeeded') return false;
  const user = currentUser();
  Object.assign(j, { appliedAt: iso(Date.now()), appliedBy: user ? user.id : null });
  return true;
});

/** Hides a finished job's result ("Bỏ qua"); the job stays in history. */
export const dismissJob = (jobId) => update(jobId, (j) => {
  if (isActive(j)) return false;
  j.dismissedAt = iso(Date.now());
  return true;
});

/** List badge status for a submission: 'running' | 'ready' | 'failed' | null. */
export function badgeStatus(submissionId) {
  const j = latestJob(submissionId);
  if (!j) return null;
  if (isActive(j)) return 'running';
  if (j.dismissedAt) return null;
  if (j.status === 'succeeded') return 'ready';
  if (j.status === 'failed') return 'failed';
  return null;
}
