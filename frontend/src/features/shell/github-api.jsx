/**
 * "Hồ sơ năng lực" (GitHub skill profile) on the real backend — the flow of the real app's
 * components/profile/github-profile-panel.tsx and github-learner-card.tsx:
 *   linked?   GET /api/auth/list-accounts (a "github-profile" or "github" account)
 *   profile   GET /api/github-profile → { profile | null }
 *   connect   GET /api/github-profile/connect?returnTo= → the browser goes to GitHub (any GitHub account, even one
 *             already linked to another Codi account)
 *   analyse   POST /api/github-profile { consentVersion:'public-github-v1' } (explicit consent) → { profile }, or 202 { job }
 *             when the AI worker runs it in the background; then GET /api/github-profile → { job, profile } until done
 *   correct   PATCH /api/github-profile/corrections { corrections: { excludedRepositoryIds, technologies[{ technologyId,
 *             usage?, hidden? }], areas } } → { saved, corrections, summaryJobId }; a changed exclusion list queues a
 *             summary-only job (no GitHub calls) that rewrites the AI summary, polled like an analysis
 *   delete    DELETE /api/github-profile/profile → { deleted } (removes the saved analysis, keeps the GitHub link)
 *   unlink    DELETE /api/github-profile
 * Linking and analysing stay separate, explicit steps; nothing starts on page load. Every failure shows the server's
 * message. Locally, GitHub linking needs the OAuth app to accept http://localhost:5190/api/auth/callback/github and
 * the analysis needs the GitHub budget + OpenAI keys (docs/getting-started.md); without them the backend's own error
 * is shown, never a simulated result.
 *
 * The profile tab renders the full report from ./github-report.jsx (port of github-profile-result.tsx and
 * friends); the onboarding step keeps the compact <ProfileSummary>.
 *
 * Installs Codi.github = { openConnect, stateFor, isConnected, onboardingHref, learnerCard }.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { api } from '../../lib/api';
import { Alert, Icon } from '../../components/ui/primitives';
import { GithubMark } from './shell-ui';
import { CorrectionsEditor, PendingChecklist, ProfileReport } from './github-report';

export const PROFILE_HREF = '/profile?tab=nang-luc';
export const ONBOARDING_PATH = '/onboarding/github';
const CONSENT_VERSION = 'public-github-v1';
const TIMEOUT_MS = 240000; // background job: worker poll + up to 175 s of analysis
const STALE_MS = 90 * 86400000;
const USAGE_LABEL = { tried: 'Đã thử', regular: 'Dùng thường xuyên', deep: 'Dùng sâu' };

/** Link to the account GitHub step; `next` is where "Để sau" / "Tiếp tục" continue to. */
export const onboardingHref = (next) => `${ONBOARDING_PATH}?next=${encodeURIComponent(next || Codi.path())}`;
export const dateLabel = (iso) => { const d = new Date(iso); return Number.isNaN(d.valueOf()) ? String(iso) : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(d); };
export const isStale = (iso) => !!iso && Date.now() - Date.parse(iso) > STALE_MS;
const errText = (e, fallback) => (e && typeof e.message === 'string' && e.message) || fallback;

// ───────────────────────── shared state (per signed-in learner) ─────────────────────────
// { userId, status:'idle'|'loading'|'ready'|'error', linked, profile, aiGuidance, error }
// aiGuidance: { state:'undecided'|'granted'|'declined', decidedAt } for a published profile, else null.
let gh = { userId: null, status: 'idle', linked: false, profile: null, aiGuidance: null, error: null };
let ver = 0;
const subs = new Set();
const bump = () => { ver += 1; subs.forEach((f) => f()); };
const set = (patch) => { gh = { ...gh, ...patch }; bump(); };

/** Loads link status and the saved profile for the signed-in learner (once per user; `force` re-reads). */
export async function loadGithub(force = false) {
  const uid = Codi.state.currentUserId;
  if (!uid || Codi.role() !== 'learner') return;
  if (!force && gh.userId === uid && gh.status !== 'idle') return;
  const same = gh.userId === uid;
  gh = { userId: uid, status: 'loading', linked: same && gh.linked, profile: same ? gh.profile : null, aiGuidance: same ? gh.aiGuidance : null, error: null };
  bump();
  try {
    const [accounts, saved] = await Promise.all([api.get('/api/auth/list-accounts'), api.get('/api/github-profile')]);
    if (Codi.state.currentUserId !== uid) return;
    // "github-profile" is the Codi-owned profile link; "github" is a Sign in with GitHub account.
    const linked = Array.isArray(accounts) && accounts.some((a) => a && (a.providerId === 'github-profile' || a.providerId === 'github'));
    set({ status: 'ready', linked, profile: (saved && saved.profile) || null, aiGuidance: guidanceOf(saved) });
  } catch (e) {
    if (Codi.state.currentUserId === uid) set({ status: 'error', error: errText(e, 'Chưa tải được hồ sơ năng lực.') });
  }
}

const GUIDANCE_STATES = ['undecided', 'granted', 'declined'];
const guidanceOf = (body) => {
  const g = body && body.aiGuidance;
  return g && GUIDANCE_STATES.includes(g.state) ? { state: g.state, decidedAt: g.decidedAt || null } : null;
};

/**
 * Grants (true) or declines/revokes (false) the use of the saved profile summary for AI course guidance:
 * PUT /api/github-profile/ai-guidance { consent }. Throws ApiError with the server message.
 */
export async function setAiGuidance(consent) {
  const res = await api('/api/github-profile/ai-guidance', { method: 'PUT', body: { consent: !!consent } });
  const next = guidanceOf(res);
  if (!next) throw new Error('Chưa lưu được lựa chọn. Bạn có thể thử lại.');
  set({ aiGuidance: next });
  return next;
}

/** Subscribes to the GitHub state and loads it for a signed-in learner. */
export function useGithub() {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => ver);
  const uid = Codi.state.currentUserId;
  useEffect(() => { loadGithub(); }, [uid]);
  return gh.userId === uid ? gh : { userId: uid, status: 'idle', linked: false, profile: null, aiGuidance: null, error: null };
}

/**
 * Starts GitHub linking: the browser goes straight to GitHub's authorize page (always shown, so another GitHub
 * account can be picked) and comes back to `returnTo` with ?github=linked or ?error=<code>. One GitHub account may
 * back the profile of several Codi accounts.
 */
export async function connectGithub(returnTo) {
  const url = new URL(returnTo || Codi.path() + window.location.search, window.location.origin);
  url.searchParams.delete('error');
  url.searchParams.delete('github');
  window.location.assign(`/api/github-profile/connect?returnTo=${encodeURIComponent(url.pathname + url.search)}`);
}

/**
 * Runs the analysis after explicit consent. Resolves the returned profile; throws ApiError with the server message.
 * A run with no technology observations is not published by the server, so it never replaces an observed result.
 */
export async function analyseGithub() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let res = await api('/api/github-profile', { method: 'POST', body: { consentVersion: CONSENT_VERSION }, signal: ctrl.signal });
    if (res && res.job && res.job.id) {
      // The AI worker runs the analysis in the background (202 { job }): poll GET until the job ends.
      res = await pollProfileJob(res.job.id, ctrl.signal);
      if (res.job.errorCode === 'no_observations') { set({ linked: true }); return gh.profile; }
    }
    const latest = (res && res.profile) || null;
    if (!latest || latest.version !== 1) throw new Error('Chưa tạo được hồ sơ năng lực. Không thể đọc phản hồi máy chủ. Bạn có thể thử lại.');
    const keepPrevious = latest.observationAvailability === 'none_observed' && gh.profile && gh.profile.observationAvailability === 'observed';
    set(keepPrevious ? { linked: true } : { linked: true, profile: latest });
    // A first published profile starts with an undecided AI-guidance choice; read it so /ai can ask.
    if (!gh.aiGuidance) api.get('/api/github-profile').then((body) => set({ aiGuidance: guidanceOf(body) })).catch(() => {});
    return latest;
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error('Đã hết thời gian chờ 4 phút. Chưa xác nhận được kết quả; yêu cầu trên máy chủ có thể vẫn đang hoàn tất. Không tự thử lại.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Background job error codes (lib/github-profile-worker.ts) → the messages the synchronous route uses.
const JOB_ERRORS = {
  not_ready: 'Phân tích GitHub chưa sẵn sàng trên máy chủ này.',
  unauthorized: 'Bạn không có quyền học viên đang hoạt động.',
  github_not_linked: 'Bạn chưa liên kết GitHub với tài khoản Codi này.',
  profile_unavailable: 'Không còn hồ sơ đã lưu để cập nhật. Hãy phân tích lại.',
};
/** Polls GET /api/github-profile every 3 s until background job `jobId` completes; throws its failure. */
async function pollProfileJob(jobId, signal) {
  for (;;) {
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, 3000);
      signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    });
    const body = await api.get('/api/github-profile', { signal });
    const job = body && body.job;
    if (!job || job.id !== jobId) throw new Error('Không theo dõi được lượt phân tích. Hãy tải lại trang để xem kết quả.');
    if (job.status === 'completed') return body;
    if (job.status === 'failed') throw new Error(JOB_ERRORS[job.errorCode] || 'Chưa tạo được hồ sơ năng lực. Bạn có thể thử lại.');
  }
}

/**
 * Saves the learner's corrections and shows the corrected profile at once. Resolves the summary job id when the
 * exclusions changed and the worker rewrites the summary (follow it with waitForSummary), else null.
 */
export async function saveGithubCorrections(corrections) {
  const res = await api.patch('/api/github-profile/corrections', { corrections });
  const body = await api.get('/api/github-profile');
  set({ profile: (body && body.profile) || gh.profile });
  return (res && res.summaryJobId) || null;
}

/** Waits for the summary-only job queued by saveGithubCorrections, then shows the profile with the new summary. */
export async function waitForSummary(jobId) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const body = await pollProfileJob(jobId, ctrl.signal);
    if (body && body.profile) set({ profile: body.profile });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error('Đã hết thời gian chờ 4 phút. Chỉnh sửa đã được lưu; phần tóm tắt có thể vẫn đang được viết lại. Tải lại trang sau để xem.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Deletes the saved analysis and its evidence; the GitHub link stays. */
export async function deleteGithubProfile() {
  await api.del('/api/github-profile/profile');
  set({ profile: null, aiGuidance: null });
}

/** Unlinks GitHub and deletes the saved analysis. */
export async function disconnectGithub() {
  await api.del('/api/github-profile');
  set({ linked: false, profile: null, aiGuidance: null });
}

/** The unlink consequence dialog shared by the profile tab and the onboarding step. Resolves true on confirm. */
export async function confirmUnlinkDialog() {
  const r = await Codi.ui.confirm({
    title: 'Ngắt kết nối GitHub?',
    body: 'Dữ liệu phân tích hiện tại sẽ bị xoá cùng kết nối GitHub. Kết quả kiểm tra và tiến độ học đã đo không thay đổi. Bạn có thể kết nối lại bất kỳ lúc nào. Nếu GitHub là cách đăng nhập duy nhất, hãy đặt mật khẩu trước.',
    confirmLabel: 'Ngắt kết nối',
    cancelLabel: 'Huỷ',
  });
  return !!(r && r.ok);
}

// ───────────────────────── shared pieces ─────────────────────────
export function ReadsList() {
  return (
    <div className="stack-2 shell-ghob-reads">
      <p className="small strong" style={{ margin: 0 }}>Codi sẽ đọc</p>
      <ul className="gh-consent-list">
        <li><Icon name="check" className="icon-sm text-success" /> <span>Hồ sơ GitHub công khai</span></li>
        <li><Icon name="check" className="icon-sm text-success" /> <span>Danh sách repo công khai (bỏ qua repo fork và repo trống)</span></li>
        <li><Icon name="check" className="icon-sm text-success" /> <span>Ngôn ngữ, file cấu hình như package.json, requirements.txt, pom.xml và README</span></li>
      </ul>
      <p className="small strong" style={{ margin: 0 }}>Codi sẽ không</p>
      <p className="small" style={{ margin: 0 }}>Không đọc repo riêng tư · Không ghi gì lên GitHub · Không chia sẻ với giảng viên.</p>
    </div>
  );
}

const techName = (id) => { const raw = String(id || '').split(':').slice(1).join(':'); try { return decodeURIComponent(raw) || id; } catch { return raw || id; } };

/** Compact view of a saved profile for the onboarding step (real GithubProfileProjection v1): technologies with usage, observed facts. */
export function ProfileSummary({ profile }) {
  const techs = (profile.technologies || []).slice(0, 12);
  const facts = (profile.factualSummary || []).slice(0, 6);
  return (
    <div className="stack-4">
      <dl className="shell-ghob-facts">
        <div><dt>Tài khoản</dt><dd>{profile.identity ? `@${profile.identity.login}` : '—'}</dd></div>
        <div><dt>Thu thập lúc</dt><dd>{dateLabel(profile.collectedAt)}</dd></div>
      </dl>
      {profile.observationAvailability === 'none_observed' ? (
        <Alert type="info" title="Chưa đủ dữ liệu để ước tính" body="Lượt phân tích này chưa ghi nhận quan sát công nghệ. Thiếu dữ liệu không có nghĩa là năng lực yếu." />
      ) : (
        <>
          <ul className="stack-2 small" style={{ margin: 0 }}>
            {techs.map((t) => <li key={t.technologyId}><strong>{techName(t.technologyId)}</strong>{t.usage ? ` · ${USAGE_LABEL[t.usage] || t.usage}` : ''}</li>)}
          </ul>
          {facts.length > 0 && <ul className="stack-1 xsmall muted" style={{ margin: 0 }}>{facts.map((f) => <li key={f}>{f}</li>)}</ul>}
        </>
      )}
      <p className="xsmall muted" style={{ margin: 0 }}>Ước tính từ repo công khai, không phải điểm đánh giá chính thức.</p>
    </div>
  );
}

// ───────────────────────── AI course guidance (a separate consent from the analysis) ─────────────────────────
/** Exactly what leaves Codi when guidance is on (backend lib/github-profile-guidance.ts). */
function GuidanceSends() {
  return (
    <div className="stack-1 small">
      <p style={{ margin: 0 }}>Mỗi lần bạn hỏi Tutor ở trang Tutor, Codi gửi kèm bản tóm tắt hồ sơ năng lực cho nhà cung cấp AI:</p>
      <ul className="ghr-guidance-list">
        <li>tên công nghệ và mức dùng ước tính (ví dụ React · Đã thử)</li>
        <li>các mảng kiến thức và độ tin cậy</li>
        <li>mức tổng thể ước tính</li>
      </ul>
      <p style={{ margin: 0 }}>Không gửi code, nội dung file, tên repo hay đường dẫn GitHub. Tutor trong bài học không dùng hồ sơ này.</p>
    </div>
  );
}

/** A published, observed profile whose guidance choice the learner can make. */
const guidanceReady = (s) => s.status === 'ready' && !!s.profile && s.profile.observationAvailability === 'observed' && !!s.aiGuidance;

/** The confirmation box on /ai: asked once per published profile; both answers are saved, so it never nags. */
export function GuidancePrompt() {
  useCodi();
  const s = useGithub();
  const [busy, failure, run] = useGithubAction();
  if (!Codi.state.currentUserId || Codi.role() !== 'learner' || !guidanceReady(s) || s.aiGuidance.state !== 'undecided') return null;
  const decide = (consent) => run(consent ? 'grant' : 'decline', async () => {
    await setAiGuidance(consent);
    Codi.ui.toast(consent ? 'Tutor sẽ dùng hồ sơ GitHub để gợi ý khoá học.' : 'Đã ghi nhận. Tutor sẽ không dùng hồ sơ GitHub.');
  }, 'Chưa lưu được lựa chọn. Bạn có thể thử lại.');
  return (
    <section className="card tc-guidance" aria-labelledby="tc-guidance-title"><div className="card-body compact stack-3">
      <h2 id="tc-guidance-title" className="small strong" style={{ margin: 0 }}>Dùng hồ sơ GitHub để Tutor gợi ý khoá học?</h2>
      <GuidanceSends />
      <p className="xsmall muted" style={{ margin: 0 }}>Bạn có thể đổi ý bất kỳ lúc nào trong <Link to={PROFILE_HREF}>Hồ sơ năng lực</Link>.</p>
      {failure && <p className="small text-danger" role="alert" style={{ margin: 0 }}>{failure}</p>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} aria-busy={busy === 'grant' || undefined} onClick={() => decide(true)}>{busy === 'grant' ? 'Đang lưu…' : 'Đồng ý dùng hồ sơ'}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} aria-busy={busy === 'decline' || undefined} onClick={() => decide(false)}>Không dùng</button>
      </div>
    </div></section>
  );
}

/** The switch on the profile tab: grant, or revoke at any time. */
function GuidanceSetting({ guidance }) {
  const [busy, failure, run] = useGithubAction();
  // The switch follows the click at once; a failed save puts it back and shows why.
  const [pending, setPending] = useState(null);
  const on = pending ?? guidance.state === 'granted';
  const toggle = async (next) => {
    setPending(next);
    await run('guidance', () => setAiGuidance(next), 'Chưa lưu được lựa chọn. Bạn có thể thử lại.');
    setPending(null);
  };
  return (
    <section aria-label="Dùng để gợi ý khoá học" className="card"><div className="card-body stack-3">
      <div className="stack-1">
        <h3 style={{ margin: 0 }}>Dùng để gợi ý khoá học</h3>
        <p className="xsmall muted" style={{ margin: 0 }}>
          {on ? `Đang bật từ ${dateLabel(guidance.decidedAt)}. Tutor so khớp công nghệ bạn đã dùng với kỹ năng của từng khoá.`
            : guidance.state === 'declined' ? `Đã tắt${guidance.decidedAt ? ` từ ${dateLabel(guidance.decidedAt)}` : ''}. Tutor gợi ý khoá mà không dùng hồ sơ này.`
              : 'Chưa chọn. Tutor gợi ý khoá mà không dùng hồ sơ này.'}
        </p>
      </div>
      <label className="switch">
        <input type="checkbox" role="switch" checked={on} disabled={!!busy} aria-busy={!!busy || undefined} onChange={(e) => toggle(e.target.checked)} />
        <span className="switch-track" />
        <span>Cho Tutor dùng hồ sơ này để gợi ý khoá học</span>
      </label>
      <GuidanceSends />
      {failure && <p className="small text-danger" role="alert" style={{ margin: 0 }}>{failure}</p>}
    </div></section>
  );
}

// ───────────────────────── panel (profile tab "Hồ sơ năng lực") ─────────────────────────
const LINK_ERRORS = {
  denied: 'Bạn chưa kết nối GitHub. Codi chưa được GitHub cấp quyền.',
  session_changed: 'Phiên đăng nhập Codi đã thay đổi trong lúc kết nối. Hãy kết nối lại.',
  not_configured: 'Máy chủ này chưa cấu hình kết nối GitHub.',
  unauthorized: 'Chỉ tài khoản học viên mới kết nối được GitHub.',
  failed: 'Chưa hoàn tất kết nối GitHub. Bạn có thể thử lại.',
};

/** Runs `fn` with a busy flag and a failure message; returns [busy, failure, run, setFailure]. */
export function useGithubAction() {
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);
  const run = async (name, fn, fallback) => {
    if (busy) return false;
    setBusy(name); setFailure(null);
    try { await fn(); return true; } catch (e) { setFailure(errText(e, fallback)); return false; } finally { setBusy(null); }
  };
  return [busy, failure, run, setFailure];
}

/** Alert title for a failed action, by the server's error code (real github-profile-panel.tsx + budget/not-ready). */
function failureTitle(info) {
  if (!info) return 'Chưa hoàn tất thao tác GitHub';
  if (info.action === 'unlink') return 'Chưa ngắt kết nối được GitHub';
  if (info.action === 'corrections') return info.code === 'active_request' ? 'Một lượt phân tích đang chạy' : 'Chưa lưu được chỉnh sửa';
  if (info.action === 'summary') return 'Chưa viết lại được phần tóm tắt';
  if (info.action === 'delete') return info.code === 'active_request' ? 'Một lượt phân tích đang chạy' : 'Chưa xoá được hồ sơ năng lực';
  if (info.action === 'link') return 'Chưa kết nối được GitHub';
  if (info.code === 'rate_limited') return 'GitHub đang giới hạn lượt đọc';
  if (info.code === 'connection_expired') return 'Kết nối GitHub đã hết hiệu lực';
  if (info.diagnostics && info.diagnostics.category === 'reservation_denied') return 'Đã hết hạn mức phân tích';
  if (info.code === 'not_ready') return 'Phân tích GitHub chưa được bật';
  if (info.code === 'active_request') return 'Một lượt phân tích đang chạy';
  return 'Chưa tạo được hồ sơ năng lực';
}

/** Server error body → the fields the failure alert uses; nothing else is kept. */
const failureInfo = (action, e) => {
  const b = e && e.body && typeof e.body === 'object' ? e.body : {};
  return {
    action,
    code: typeof b.code === 'string' ? b.code : null,
    retryAt: typeof b.retryAt === 'string' ? b.retryAt : null,
    diagnostics: b.diagnostics && typeof b.diagnostics === 'object' ? b.diagnostics : null,
  };
};

export function GithubProfilePanel({ linkError }) {
  useCodi();
  const s = useGithub();
  const [busy, failure, run, setFailure] = useGithubAction();
  const [consent, setConsent] = useState(false);
  const [info, setInfo] = useState(null);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (linkError) { setInfo({ action: 'link' }); setFailure(LINK_ERRORS[linkError] || LINK_ERRORS.failed); } }, [linkError]);
  if (!Codi.state.currentUserId) return null;
  if (s.status === 'loading' && !s.profile) return <p className="small muted" role="status">Đang tải hồ sơ năng lực…</p>;
  if (s.status === 'error') {
    return <Alert type="danger" title="Chưa tải được hồ sơ năng lực" body={s.error} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => loadGithub(true)}>Thử lại</button>} />;
  }
  const { profile, linked } = s;
  // Each action records which step failed and the server's code so the alert can name the state.
  const act = (name, fn, fallback) => {
    setInfo(null); setNote('');
    return run(name, async () => { try { return await fn(); } catch (e) { setInfo(failureInfo(name, e)); throw e; } }, fallback);
  };
  const connect = () => act('link', () => connectGithub(PROFILE_HREF), 'Không thể mở kết nối GitHub. Bạn có thể thử lại sau.');
  const analyse = () => {
    setConsent(false);
    const hadObserved = !!(profile && profile.observationAvailability === 'observed');
    act('analyse', async () => {
      const latest = await analyseGithub();
      if (latest.observationAvailability === 'none_observed' && hadObserved) setNote('Lượt phân tích mới chưa ghi nhận quan sát công nghệ. Kết quả trước vẫn được giữ lại.');
    }, 'Chưa tạo được hồ sơ năng lực. Bạn có thể thử lại.');
  };
  const later = () => { setConsent(false); setNote('Bạn đã chọn Để sau. Không bắt đầu phân tích.'); };
  const unlink = async () => {
    if (!(await confirmUnlinkDialog())) return;
    if (await act('unlink', disconnectGithub, 'Chưa ngắt kết nối được GitHub.')) setNote('Đã ngắt kết nối GitHub.');
  };
  const saveCorrections = async (corrections) => {
    let jobId = null;
    const ok = await act('corrections', async () => { jobId = await saveGithubCorrections(corrections); }, 'Chưa lưu được chỉnh sửa hồ sơ.');
    if (!ok) return;
    setEditing(false);
    if (!jobId) { setNote('Đã lưu chỉnh sửa hồ sơ năng lực.'); return; }
    if (await act('summary', () => waitForSummary(jobId), 'Chưa viết lại được phần tóm tắt. Bạn có thể thử lại sau.')) {
      setNote('Đã lưu chỉnh sửa và viết lại phần tóm tắt theo các repo bạn giữ lại.');
    }
  };
  const removeProfile = async () => {
    const r = await Codi.ui.confirm({
      title: 'Xoá hồ sơ năng lực?',
      body: 'Codi xoá kết quả phân tích, bằng chứng và chỉnh sửa đã lưu. Kết nối GitHub vẫn giữ nguyên; bạn có thể phân tích lại bất kỳ lúc nào. Kết quả kiểm tra và tiến độ học không thay đổi.',
      confirmLabel: 'Xoá hồ sơ',
      cancelLabel: 'Huỷ',
    });
    if (!(r && r.ok)) return;
    setEditing(false);
    if (await act('delete', deleteGithubProfile, 'Chưa xoá được hồ sơ GitHub.')) setNote('Đã xoá hồ sơ năng lực. GitHub vẫn được kết nối.');
  };
  const login = profile && profile.identity ? profile.identity.login : null;
  // A run without technology observations is returned but never saved by the server: show it as temporary only.
  const insufficient = profile && profile.observationAvailability === 'none_observed' ? profile : null;
  const saved = insufficient ? null : profile;
  const needsLink = !!info && (info.code === 'github_not_linked' || info.code === 'connection_expired');
  const budgetOut = !!info && !!info.diagnostics && info.diagnostics.category === 'reservation_denied';

  return (
    <div className="stack-6 shell-gh-panel">
      <header className="row-between" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="row" style={{ gap: 12, minWidth: 0 }}>
          {login && <span className="gh-avatar gh-avatar-lg" aria-hidden="true">{login.charAt(0).toUpperCase()}</span>}
          <div className="stack-1" style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, overflowWrap: 'anywhere' }}>{login ? `@${login}` : 'Phân tích GitHub'}</h2>
            <p className="small muted" style={{ margin: 0 }}>
              {saved ? `Phân tích lúc ${dateLabel(saved.collectedAt)} · ${saved.limitations.coverage.selected} repo được chọn`
                : linked ? 'GitHub đã kết nối. Chưa có hồ sơ năng lực đã lưu.' : 'Kết nối GitHub để Codi hiểu kỹ năng của bạn từ repo công khai.'}
            </p>
          </div>
        </div>
        {linked && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => setConsent(true)}><Icon name="rotate-ccw" className="icon-sm" /> {saved ? 'Phân tích lại' : 'Phân tích GitHub'}</button>
            {saved && <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy || editing} onClick={() => { setNote(''); setEditing(true); }}><Icon name="pencil" className="icon-sm" /> Sửa hồ sơ năng lực</button>}
            {saved && <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={removeProfile}><Icon name="trash" className="icon-sm" /> Xoá hồ sơ năng lực</button>}
            <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={unlink}><Icon name="x" className="icon-sm" /> Ngắt kết nối</button>
          </div>
        )}
      </header>

      {!linked && (
        <div className="card"><div className="card-body stack-3">
          <p>Codi phân tích danh sách repo công khai và ngôn ngữ đã quan sát, chỉ đọc và không ghi lên GitHub. Hồ sơ là ước tính ban đầu, không phải đánh giá chính thức.</p>
          <p className="small muted">Codi chỉ bắt đầu đọc GitHub sau khi bạn xác nhận. Mở trang hoặc chọn Để sau không bắt đầu phân tích.</p>
          <div><button type="button" className="btn btn-primary" disabled={!!busy} aria-busy={busy === 'link' || undefined} onClick={connect}><GithubMark className="icon icon-sm" /> {busy === 'link' ? 'Đang mở GitHub…' : 'Kết nối GitHub'}</button></div>
        </div></div>
      )}

      {consent && (
        <div className="card"><div className="card-body stack-3">
          <h3 className="small strong" style={{ margin: 0 }}>Cho phép Codi phân tích GitHub?</h3>
          <p className="small muted" style={{ margin: 0 }}>Chỉ phân tích tài khoản GitHub được máy chủ xác nhận đã liên kết với tài khoản Codi của bạn.</p>
          <ReadsList />
          <p className="xsmall muted" style={{ margin: 0 }}>Yêu cầu này có thể mất đến 3 phút. Trang không tự phân tích hoặc tự thử lại.</p>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={analyse}>Tôi đồng ý · Phân tích</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={later}>Để sau</button>
          </div>
        </div></div>
      )}

      {saved && isStale(saved.collectedAt) && <p className="small muted" role="status">Hồ sơ phân tích hơn 90 ngày trước. Phân tích lại để cập nhật bằng chứng.</p>}
      {busy === 'analyse' && saved && <p className="small shell-ghr-rerun" role="status">Đang phân tích lại. Kết quả trước vẫn hiển thị bên dưới; chưa được thay thế.</p>}
      {busy === 'analyse' && <PendingChecklist hasPrevious={!!saved} />}
      {busy === 'unlink' && <p className="small" role="status">Đang ngắt kết nối GitHub…</p>}
      {busy === 'delete' && <p className="small" role="status">Đang xoá hồ sơ năng lực…</p>}
      {busy === 'summary' && <p className="small shell-ghr-rerun" role="status">Đã lưu chỉnh sửa. Codi đang viết lại phần tóm tắt theo các repo bạn giữ lại (không đọc lại GitHub); có thể mất 1–2 phút.</p>}
      {saved && editing && <CorrectionsEditor profile={saved} busy={busy === 'corrections'} onSave={saveCorrections} onCancel={() => setEditing(false)} />}
      {note && <p className="small" role="status">{note}</p>}
      {failure && (
        <Alert type="danger" title={failureTitle(info)}>
          <span style={{ display: 'block', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{failure}</span>
          {budgetOut && <span style={{ display: 'block' }}>Hạn mức chi phí phân tích của lượt chạy này đã dùng hết. Codi không tự thử lại; hãy thử lại khi hạn mức được cấp thêm.</span>}
          {info && info.retryAt && <span style={{ display: 'block' }}>Có thể thử lại sau {dateLabel(info.retryAt)}. Codi không tự thử lại.</span>}
          {needsLink && (
            <span className="stack-2" style={{ display: 'grid', marginTop: 8 }}>
              <span>Cần liên kết tài khoản GitHub với phiên Codi hiện tại trước khi phân tích.</span>
              <span><button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={connect}>{info.code === 'connection_expired' ? 'Kết nối lại GitHub' : 'Kết nối GitHub'}</button></span>
            </span>
          )}
          {info && info.action === 'summary' && <span style={{ display: 'block' }}>Chỉnh sửa của bạn đã được lưu. Phần tóm tắt cũ không còn khớp nên được ẩn; các quan sát và công nghệ bên dưới đã theo chỉnh sửa mới.</span>}
          {saved && !(info && ['corrections', 'summary', 'delete'].includes(info.action)) && <span style={{ display: 'block' }}>Kết quả trước vẫn hiển thị bên dưới; chưa được thay thế.</span>}
        </Alert>
      )}

      {saved && <ProfileReport profile={saved} guidance={s.aiGuidance ? <GuidanceSetting guidance={s.aiGuidance} /> : null} />}
      {insufficient && (
        <Alert type="info" title="Chưa đủ dữ liệu để ước tính">
          <span style={{ display: 'block' }}>Kết quả tạm thời, không phải hồ sơ đã lưu. Lượt phân tích này chưa ghi nhận quan sát công nghệ.</span>
          <span style={{ display: 'block' }}>
            Đã liệt kê {insufficient.limitations.coverage.listed} repo; chọn {insufficient.limitations.coverage.selected} repo.{' '}
            {insufficient.collectionStatus === 'partial' || !insufficient.limitations.listingComplete ? 'Phạm vi thu thập chưa đầy đủ.' : 'Chỉ phản ánh phạm vi đã thu thập.'}
          </span>
          <span style={{ display: 'block' }}>Thiếu dữ liệu không có nghĩa là năng lực yếu. Kết quả này không được lưu để khôi phục sau khi tải lại trang.</span>
          <span style={{ display: 'block' }}>Bạn có thể phân tích lại sau khi bổ sung code công khai hoặc làm bài kiểm tra đầu vào trong khoá học của mình.</span>
        </Alert>
      )}
    </div>
  );
}

// ───────────────────────── learner-home card (real github-learner-card.tsx) ─────────────────────────
const DISMISS_KEY = 'codi.github-card.dismissed';
const readDismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } };
export function GithubLearnerCard() {
  useCodi();
  const s = useGithub();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!Codi.state.currentUserId || Codi.role() !== 'learner' || s.status !== 'ready') return null;
  const dismiss = () => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* hidden for this view only */ } };
  // Real card: "connected" means a saved skill profile exists; a bare link without analysis still shows the prompt.
  if (s.profile) {
    return (
      <Link className="card card-link" to={PROFILE_HREF}><div className="card-body compact row-between">
        <span className="row"><Icon name="link" /><span className="stack-1"><strong className="small">Hồ sơ năng lực</strong><span className="xsmall muted">Ước tính từ GitHub · xem và chỉnh sửa</span></span></span>
        <Icon name="chevron-right" className="icon-sm" />
      </div></Link>
    );
  }
  if (dismissed) return null;
  return (
    <div className="card"><div className="card-body stack-3">
      <div className="row-between"><strong>Kết nối GitHub để Codi hiểu bạn nhanh hơn</strong>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Ẩn thông báo kết nối GitHub" onClick={dismiss}><Icon name="x" /></button></div>
      <p className="small muted">Codi chỉ đọc repo công khai để gợi ý điểm bắt đầu, ghi nhãn "ước tính từ GitHub". Bài kiểm tra và bài tập vẫn quyết định trình độ của bạn.</p>
      <div className="row"><Link className="btn btn-secondary btn-sm" to={onboardingHref('/dashboard')}>{s.linked ? 'Phân tích GitHub' : 'Kết nối GitHub'}</Link><button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>Để sau</button></div>
    </div></div>
  );
}

// ───────────────────────── cross-feature contract ─────────────────────────
/** Last known state for `userId` (loads it in the background the first time). */
function stateFor(userId) {
  if (!userId || userId !== Codi.state.currentUserId) return { linked: false, hasProfile: false };
  if (gh.userId !== userId || gh.status === 'idle') queueMicrotask(() => loadGithub()); // never update subscribers during a render
  const cur = gh.userId === userId ? gh : { linked: false, profile: null };
  return { linked: !!cur.linked, hasProfile: !!cur.profile, username: cur.profile && cur.profile.identity ? cur.profile.identity.login : null };
}

Object.assign(Codi, {
  github: {
    openConnect: (opts) => Codi.go(onboardingHref((opts && opts.returnTo) || Codi.path())),
    stateFor,
    isConnected: () => stateFor(Codi.state.currentUserId).hasProfile,
    onboardingHref,
    learnerCard: () => <GithubLearnerCard />,
  },
});
