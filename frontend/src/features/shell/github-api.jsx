/**
 * "Hồ sơ năng lực" (GitHub skill profile) on the real backend — the flow of the real app's
 * components/profile/github-profile-panel.tsx and github-learner-card.tsx:
 *   linked?   GET /api/auth/list-accounts (a "github" account)
 *   profile   GET /api/github-profile → { profile | null }
 *   connect   POST /api/auth/link-social { provider:'github', callbackURL } → the browser goes to GitHub
 *   analyse   POST /api/github-profile { consentVersion:'public-github-v1' } (explicit consent, up to 3 min)
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
import { PendingChecklist, ProfileReport } from './github-report';

export const PROFILE_HREF = '/profile?tab=nang-luc';
export const ONBOARDING_PATH = '/onboarding/github';
const CONSENT_VERSION = 'public-github-v1';
const TIMEOUT_MS = 160000;
const STALE_MS = 90 * 86400000;
const USAGE_LABEL = { tried: 'Đã thử', regular: 'Dùng thường xuyên', deep: 'Dùng sâu' };

/** Link to the account GitHub step; `next` is where "Để sau" / "Tiếp tục" continue to. */
export const onboardingHref = (next) => `${ONBOARDING_PATH}?next=${encodeURIComponent(next || Codi.path())}`;
export const dateLabel = (iso) => { const d = new Date(iso); return Number.isNaN(d.valueOf()) ? String(iso) : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(d); };
export const isStale = (iso) => !!iso && Date.now() - Date.parse(iso) > STALE_MS;
const errText = (e, fallback) => (e && typeof e.message === 'string' && e.message) || fallback;

// ───────────────────────── shared state (per signed-in learner) ─────────────────────────
// { userId, status:'idle'|'loading'|'ready'|'error', linked, profile, error }
let gh = { userId: null, status: 'idle', linked: false, profile: null, error: null };
let ver = 0;
const subs = new Set();
const bump = () => { ver += 1; subs.forEach((f) => f()); };
const set = (patch) => { gh = { ...gh, ...patch }; bump(); };

/** Loads link status and the saved profile for the signed-in learner (once per user; `force` re-reads). */
export async function loadGithub(force = false) {
  const uid = Codi.state.currentUserId;
  if (!uid || Codi.role() !== 'learner') return;
  if (!force && gh.userId === uid && gh.status !== 'idle') return;
  gh = { userId: uid, status: 'loading', linked: gh.userId === uid && gh.linked, profile: gh.userId === uid ? gh.profile : null, error: null };
  bump();
  try {
    const [accounts, saved] = await Promise.all([api.get('/api/auth/list-accounts'), api.get('/api/github-profile')]);
    if (Codi.state.currentUserId !== uid) return;
    const linked = Array.isArray(accounts) && accounts.some((a) => a && a.providerId === 'github');
    set({ status: 'ready', linked, profile: (saved && saved.profile) || null });
  } catch (e) {
    if (Codi.state.currentUserId === uid) set({ status: 'error', error: errText(e, 'Chưa tải được hồ sơ năng lực.') });
  }
}

/** Subscribes to the GitHub state and loads it for a signed-in learner. */
export function useGithub() {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => ver);
  const uid = Codi.state.currentUserId;
  useEffect(() => { loadGithub(); }, [uid]);
  return gh.userId === uid ? gh : { userId: uid, status: 'idle', linked: false, profile: null, error: null };
}

/** Starts GitHub account linking; the browser leaves for GitHub and comes back to `returnTo`. Throws on failure. */
export async function connectGithub(returnTo) {
  const back = returnTo || Codi.path() + window.location.search;
  const sep = back.includes('?') ? '&' : '?';
  const res = await api.post('/api/auth/link-social', { provider: 'github', callbackURL: back, errorCallbackURL: `${back}${sep}error=failed` });
  if (!res || !res.url) throw new Error('Không thể mở kết nối GitHub. Bạn có thể thử lại sau.');
  window.location.assign(res.url);
}

/**
 * Runs the analysis after explicit consent. Resolves the returned profile; throws ApiError with the server message.
 * A run with no technology observations is not published by the server, so it never replaces an observed result.
 */
export async function analyseGithub() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await api('/api/github-profile', { method: 'POST', body: { consentVersion: CONSENT_VERSION }, signal: ctrl.signal });
    const latest = (res && res.profile) || null;
    if (!latest || latest.version !== 1) throw new Error('Chưa tạo được hồ sơ năng lực. Không thể đọc phản hồi máy chủ. Bạn có thể thử lại.');
    const keepPrevious = latest.observationAvailability === 'none_observed' && gh.profile && gh.profile.observationAvailability === 'observed';
    set(keepPrevious ? { linked: true } : { linked: true, profile: latest });
    return latest;
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error('Đã hết thời gian chờ 3 phút. Chưa xác nhận được kết quả; yêu cầu trên máy chủ có thể vẫn đang hoàn tất. Không tự thử lại.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Unlinks GitHub and deletes the saved analysis. */
export async function disconnectGithub() {
  await api.del('/api/github-profile');
  set({ linked: false, profile: null });
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

// ───────────────────────── panel (profile tab "Hồ sơ năng lực") ─────────────────────────
const LINK_ERRORS = {
  denied: 'Bạn chưa kết nối GitHub. Codi chưa được GitHub cấp quyền.',
  already_linked: 'Tài khoản GitHub đã liên kết với tài khoản Codi khác. Dùng tài khoản GitHub khác.',
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
          {saved && <span style={{ display: 'block' }}>Kết quả trước vẫn hiển thị bên dưới; chưa được thay thế.</span>}
        </Alert>
      )}

      {saved && <ProfileReport profile={saved} />}
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
