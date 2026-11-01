/**
 * "Hồ sơ năng lực" (GitHub skill profile) — port of the real app's components/profile/github-profile-panel.tsx,
 * github-learner-card.tsx and app/profile/github/page.tsx, with the rebuild's simulated GitHub OAuth and canned
 * analysis results (./github-profiles.js) standing in for the server.
 *
 * Real flow kept: linking and analysing are separate, explicit steps ("Kết nối GitHub" then
 * "Tôi đồng ý · Phân tích"); "Để sau" never starts anything; the waiting checklist is illustrative only; failures
 * (rate limit, expired connection, 60 s timeout, generic) keep the previous result; "Chưa đủ dữ liệu để ước tính";
 * stale notice after 90 days; disconnect confirmation. Outcomes are forced with the dev-drawer flag githubAnalysis.
 *
 * Installs Codi.github = { openConnect, stateFor, isConnected, disconnect, contextFor, markLinked, learnerCard }.
 * Persisted in the slice Codi.state.githubAnalysis.byUser[userId] = { linked, username, email, analyzedAt?, result? }.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Icon, Thumb } from '../../components/ui/primitives';
import { GITHUB_PROFILES, GITHUB_ACCOUNTS, fallbackProfile } from './github-profiles';
import { GithubMark, scenario } from './shell-ui';

const PROFILE_HREF = '/profile?tab=nang-luc';
const STALE_MS = 90 * 86400000;
const WAIT_MS = 3500;
const TIMEOUT_MS = 60000;
const store = () => Codi.ensure('githubAnalysis', () => ({ byUser: {} }));
const profileFor = (email) => GITHUB_PROFILES[email] || fallbackProfile(email);
const dateLabel = (iso) => { const d = new Date(iso); return Number.isNaN(d.valueOf()) ? String(iso) : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(d); };
const selectedRepos = (r) => (r.repos || []).filter((x) => !x.fork).length;

// ───────────────────────── state helpers ─────────────────────────
function entryOf(userId) { return userId ? store().byUser[userId] || null : null; }
function stateFor(userId) {
  const s = entryOf(userId);
  if (!s) return { connected: false, linked: false, hasProfile: false };
  return { connected: true, linked: true, hasProfile: !!s.result, username: s.username, analyzedAt: s.analyzedAt || null, result: s.result || null };
}
const isConnected = () => !!(entryOf(Codi.state.currentUserId) || {}).result;
/** Links a GitHub account to a Codi user (sign-in with GitHub or the simulated OAuth below). */
function markLinked(userId, account) {
  const cur = entryOf(userId);
  if (cur) return;
  Codi.set(() => { store().byUser[userId] = { linked: true, username: profileFor(account.email).handle, email: account.email }; });
}
function disconnect(userId) {
  Codi.set(() => { delete store().byUser[userId]; });
}

// ───────────────────────── panel view state (module, survives navigation) ─────────────────────────
const blank = () => ({ consent: null, oauth: null, account: null, pending: false, resultOpen: false, failure: null, note: '', insufficient: null, input: '', disconnecting: false, highlight: 0 });
let ui = blank();
let uiUser = null;
let sheet = null;
let timers = [];
let ver = 0;
const subs = new Set();
const bump = () => { ver += 1; subs.forEach((f) => f()); if (sheet) sheet.update({ title: sheetTitle() }); };
const useUi = () => { useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => ver); return ui; };
const patch = (p) => { Object.assign(ui, p); bump(); };
const clearTimers = () => { timers.forEach((t) => clearTimeout(t) || clearInterval(t)); timers = []; };
function forUser() {
  const uid = Codi.state.currentUserId;
  if (uid !== uiUser) { clearTimers(); closeSheet(); ui = blank(); uiUser = uid; }
  return uid;
}
/** Render-safe variant: drops the previous user's view state without touching overlays or timers. */
function syncUser() {
  const uid = Codi.state.currentUserId;
  if (uid !== uiUser) { ui = blank(); uiUser = uid; }
  return uid;
}

function sheetTitle() {
  if (ui.pending) return 'Đang phân tích GitHub…';
  if (ui.oauth) return 'Kết nối GitHub';
  if (ui.resultOpen && !ui.consent) return 'Hồ sơ năng lực đã sẵn sàng';
  return 'Kết nối và phân tích GitHub';
}
let closingQuietly = false;
function closeSheet() {
  if (!sheet) return;
  closingQuietly = true;
  const h = sheet; sheet = null; h.close();
  closingQuietly = false;
}
function openSheet() {
  if (sheet) { bump(); return; }
  const h = Codi.ui.sheet({
    title: sheetTitle(),
    body: () => <SheetBody />,
    footer: () => <SheetFooter />,
    onClose: () => {
      if (closingQuietly || sheet !== h) return;
      sheet = null;
      if (ui.pending) { stopWaiting(); return; }
      const wasConsent = ui.consent !== null || ui.oauth !== null;
      patch({ consent: null, oauth: null, resultOpen: false, note: wasConsent ? 'Bạn đã chọn Để sau. Không bắt đầu phân tích.' : ui.note });
    },
  });
  sheet = h;
}

function openConsent(kind) {
  forUser();
  if (ui.pending || ui.disconnecting) return;
  patch({ consent: kind, oauth: null, failure: null, note: '', resultOpen: false, insufficient: null });
  openSheet();
}
function later() { patch({ consent: null, oauth: null, note: 'Bạn đã chọn Để sau. Không bắt đầu phân tích.' }); closeSheet(); }

function stopWaiting() {
  clearTimers();
  patch({ pending: false, note: 'Đã dừng chờ. Chưa xác nhận máy chủ đã hoàn tất hoặc lưu kết quả; không phải huỷ dữ liệu trên máy chủ. Kết quả trước vẫn được giữ lại nếu có. Tải lại trang để xem hồ sơ đã lưu.' });
  closeSheet();
}

// Simulated GitHub OAuth (linkSocial): choose an account, then authorise.
function oauthPick(email) { patch({ account: GITHUB_ACCOUNTS.find((a) => a.email === email) || null, oauth: 'permission' }); }
function oauthCancel() {
  closeSheet();
  patch({ oauth: null, consent: null, failure: { code: 'github_not_linked', error: 'Chưa hoàn tất kết nối GitHub. Bạn có thể thử lại.' } });
}
function oauthDeny() {
  closeSheet();
  patch({ oauth: null, consent: null, failure: { code: 'github_not_linked', error: 'Bạn chưa kết nối GitHub. Codi chưa được GitHub cấp quyền.' } });
}
function oauthAllow() {
  const uid = forUser();
  if (!ui.account || !uid) return;
  markLinked(uid, ui.account);
  Codi.ui.toast('Đã kết nối GitHub.', { type: 'success' });
  // Linking never starts an analysis: ask for the separate analysis consent next.
  patch({ oauth: null, consent: 'analysis', account: null });
}

const HANDLE_RE = /^(?:https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/?$/;

function confirm(e) {
  e.preventDefault();
  const uid = forUser();
  if (!ui.consent || ui.pending || !uid) return;
  if (ui.consent === 'link') { patch({ consent: null, oauth: 'picker' }); return; }
  const entry = entryOf(uid);
  const typed = ui.input.trim();
  if (typed) {
    const m = typed.match(HANDLE_RE);
    if (!m) { closeSheet(); patch({ consent: null, failure: { code: 'invalid_input', error: 'Yêu cầu hoặc tên tài khoản GitHub không hợp lệ.' } }); return; }
    if (entry && m[1].toLowerCase() !== String(entry.username).toLowerCase()) {
      closeSheet(); patch({ consent: null, failure: { code: 'intent_mismatch', error: 'Tên GitHub đã nhập không khớp với tài khoản đã liên kết.' } }); return;
    }
  }
  if (!entry) { closeSheet(); patch({ consent: null, failure: { code: 'github_not_linked', error: 'Bạn chưa liên kết GitHub với tài khoản Codi này.' } }); return; }
  const outcome = scenario(Codi.state, 'githubAnalysis');
  patch({ consent: null, pending: true, failure: null, note: '', insufficient: null, resultOpen: false, highlight: 0 });
  clearTimers();
  timers.push(setInterval(() => patch({ highlight: (ui.highlight + 1) % (WAITING_STEPS.length - 1) }), 2000));
  timers.push(setTimeout(() => finish(uid, outcome), outcome === 'timeout' ? TIMEOUT_MS : WAIT_MS));
}

function finish(uid, outcome) {
  clearTimers();
  if (Codi.state.currentUserId !== uid) return;
  const entry = entryOf(uid);
  const hadProfile = !!(entry && entry.result);
  const fail = (failure) => patch({ pending: false, failure });
  if (!entry) { fail({ code: 'github_not_linked', error: 'Bạn chưa liên kết GitHub với tài khoản Codi này.' }); closeSheet(); return; }
  if (outcome === 'rate-limit') fail({ code: 'rate_limited', error: 'GitHub đang giới hạn lượt đọc. Vui lòng thử lại sau.', retryAt: new Date(Date.now() + 3600000).toISOString() });
  else if (outcome === 'expired') fail({ code: 'connection_expired', error: 'Kết nối GitHub đã hết hiệu lực. Vui lòng kết nối lại.' });
  else if (outcome === 'failed') fail({ code: 'request_failed', error: 'Chưa tạo được hồ sơ năng lực. Không tự thử lại.' });
  else if (outcome === 'timeout') fail({ code: 'client_timeout', error: 'Đã hết thời gian chờ 60 giây. Chưa xác nhận được kết quả; yêu cầu trên máy chủ có thể vẫn đang hoàn tất. Không tự thử lại.' });
  else if (outcome === 'insufficient') {
    const r = profileFor(entry.email);
    if (hadProfile) patch({ pending: false, note: 'Lượt phân tích mới chưa ghi nhận quan sát công nghệ. Kết quả trước vẫn được giữ lại.' });
    else patch({ pending: false, insufficient: { listed: r.stats.repos, selected: 0 } });
  } else {
    const result = profileFor(entry.email);
    Codi.set(() => { Object.assign(store().byUser[uid], { result, username: result.handle, analyzedAt: new Date().toISOString() }); });
    patch({ pending: false, resultOpen: true });
    openSheet();
    return;
  }
  closeSheet();
}

async function askDisconnect() {
  const uid = forUser();
  if (!uid || ui.pending || ui.disconnecting) return;
  const r = await Codi.ui.confirm({
    title: 'Ngắt kết nối GitHub?',
    body: 'Dữ liệu phân tích hiện tại sẽ bị xoá cùng kết nối GitHub. Kết quả kiểm tra và tiến độ học đã đo không thay đổi. Bạn có thể kết nối lại bất kỳ lúc nào. Nếu GitHub là cách đăng nhập duy nhất, hãy đặt mật khẩu trước.',
    confirmLabel: 'Ngắt kết nối',
    cancelLabel: 'Huỷ',
  });
  if (!r.ok) return;
  patch({ disconnecting: true, failure: null });
  await Codi.wait(500);
  disconnect(uid);
  patch({ disconnecting: false, insufficient: null, note: 'Đã ngắt kết nối GitHub.' });
}
/** Settings "Ngắt kết nối" kept for callers of the previous API. */
export const confirmDisconnect = askDisconnect;

/** Public: open the flow from anywhere (AI advisor card, settings). Linking first when needed. */
function openConnect() {
  const uid = Codi.state.currentUserId;
  if (!uid) { Codi.ui.toast('Đăng nhập để kết nối GitHub.', { type: 'warn' }); return; }
  openConsent(entryOf(uid) ? 'analysis' : 'link');
}

// ───────────────────────── sheet content ─────────────────────────
const WAITING_STEPS = ['Đọc hồ sơ công khai', 'Tải danh sách repo công khai', 'Thống kê ngôn ngữ', 'So khớp với khoá học của Codi'];
const DOMAINS = [
  { key: 'frontend', label: 'Frontend', icon: 'layout' },
  { key: 'backend', label: 'Backend / API', icon: 'server' },
  { key: 'data', label: 'Dữ liệu & AI', icon: 'bar-chart' },
  { key: 'devops', label: 'DevOps / CI', icon: 'git-branch' },
  { key: 'testing', label: 'Kiểm thử', icon: 'check-circle' },
];

function LanguageBars({ langs, big }) {
  return (
    <ol className={`gh-langs ${big ? 'is-big' : ''}`} aria-label="Ngôn ngữ trong repo công khai">
      {langs.map((l) => (
        <li key={l.name} className="gh-lang"><span className="gh-lang-dot" aria-hidden="true" style={{ background: l.color }} />
          <span className="gh-lang-name">{l.name}</span>
          <span className="gh-lang-bar" aria-hidden="true"><span style={{ width: Math.round(l.share * 100) + '%', background: l.color }} /></span>
          <span className="gh-lang-pct">{Math.round(l.share * 100)}%</span></li>
      ))}
    </ol>
  );
}

function PendingChecklist({ highlight }) {
  return (
    <section className="stack-3 shell-gh-wait" aria-label="Minh hoạ chờ phân tích" aria-busy="true">
      <h3 role="status" style={{ margin: 0 }}>Đang phân tích GitHub…</h3>
      <p className="small muted">Mô phỏng chờ: các bước chỉ minh hoạ trong khi chờ phản hồi cuối từ máy chủ, không phải tiến độ thực tế. Chưa xác nhận bước nào hoàn tất.</p>
      <ol className="shell-gh-steps">
        {WAITING_STEPS.map((step, i) => (
          <li key={step} className={i === highlight ? 'is-active' : ''}>
            <span className="shell-gh-step-dot" aria-hidden="true" />
            <span>{step}{i === WAITING_STEPS.length - 1 && <span className="xsmall"> · Chưa được cung cấp trong lượt phân tích này</span>}</span>
            <span className="sr-only"> · {i === highlight ? 'Minh hoạ đang chờ' : 'Chưa xác nhận'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ConsentForm({ kind, input }) {
  return (
    <form id="github-consent-form" className="stack-4 gh-consent" onSubmit={confirm}>
      <div className="gh-brandline"><span className="gh-brand"><Icon name="book-open" className="icon-sm" /> Codi</span><span className="gh-brand-arrow"><Icon name="arrow-right" className="icon-sm" /></span><span className="gh-brand"><GithubMark className="icon icon-sm" /> GitHub</span></div>
      <h3 style={{ margin: 0 }}>{kind === 'link' ? 'Kết nối GitHub' : 'Cho phép Codi phân tích GitHub?'}</h3>
      <p className="small">Chỉ phân tích tài khoản GitHub được máy chủ xác nhận đã liên kết với tài khoản Codi của bạn.</p>
      <div className="stack-2">
        <p className="small strong" style={{ margin: 0 }}>Codi sẽ đọc</p>
        <ul className="gh-consent-list">
          <li><Icon name="check" className="icon-sm text-success" /> <span>Hồ sơ GitHub công khai</span></li>
          <li><Icon name="check" className="icon-sm text-success" /> <span>Danh sách repo công khai (bỏ qua repo fork và repo trống)</span></li>
          <li><Icon name="check" className="icon-sm text-success" /> <span>Ngôn ngữ, file cấu hình như package.json, requirements.txt, pom.xml và README</span></li>
        </ul>
        <p className="small strong" style={{ margin: 0 }}>Codi sẽ không</p>
        <p className="small" style={{ margin: 0 }}>Không đọc repo riêng tư · Không ghi gì lên GitHub · Không chia sẻ với giảng viên.</p>
      </div>
      {kind === 'analysis' && (
        <div className="field">
          <label htmlFor="github-profile-input">Tên người dùng hoặc URL hồ sơ GitHub (không bắt buộc)</label>
          <input id="github-profile-input" value={input} maxLength={300} autoComplete="off" placeholder="Ví dụ: blu1606 hoặc https://github.com/blu1606"
            onChange={(e) => { ui.input = e.target.value; bump(); }} aria-describedby="github-input-hint" />
          <p className="field-help" id="github-input-hint">Chỉ để thể hiện tài khoản bạn muốn phân tích, không xác nhận quyền sở hữu. Để trống để dùng tài khoản đã liên kết.</p>
        </div>
      )}
      <p className="xsmall muted">{kind === 'link' ? 'Bước tiếp theo chỉ liên kết tài khoản; sau khi quay lại, bạn cần xác nhận phân tích riêng.' : 'Yêu cầu này có thể mất đến 60 giây. Trang không tự phân tích hoặc tự thử lại.'} Bạn có thể ngắt kết nối từ trang phân tích sau khi kết nối.</p>
    </form>
  );
}

function OauthBody({ step, account }) {
  if (step === 'permission' && account) {
    return (
      <div className="stack-4 gh-perm">
        <div className="gh-perm-head"><span className="gh-gh"><GithubMark className="icon icon-sm" /></span><span>Cấp quyền cho ứng dụng</span></div>
        <div className="gh-perm-card"><strong>Codi</strong> muốn truy cập tài khoản GitHub <span className="mono">{account.email}</span>.</div>
        <ul className="gh-perm-list">
          <li><Icon name="check" className="icon-sm text-success" /> <span>Đọc hồ sơ công khai: tên, ảnh, repo công khai.</span></li>
          <li><Icon name="check" className="icon-sm text-success" /> <span>Đọc thống kê ngôn ngữ của các repo công khai.</span></li>
          <li><Icon name="x" className="icon-sm text-danger" /> <span>Không truy cập repo riêng tư, email riêng tư, hay ghi dữ liệu.</span></li>
        </ul>
        <p className="xsmall muted">Màn mô phỏng GitHub OAuth. Bấm <strong>Cho phép</strong> để liên kết, hoặc <strong>Từ chối</strong> nếu bạn không đồng ý.</p>
      </div>
    );
  }
  return (
    <div className="stack-4">
      <div className="gh-perm-head"><span className="gh-gh"><GithubMark className="icon icon-sm" /></span><span>Chọn tài khoản GitHub để liên kết với Codi</span></div>
      <ul className="gh-accounts">
        {GITHUB_ACCOUNTS.map((a) => (
          <li key={a.email}><button type="button" className="gh-account" onClick={() => oauthPick(a.email)}>
            <span className="gh-avatar" aria-hidden="true">{a.name.charAt(0)}</span>
            <span className="gh-account-main"><span className="gh-account-name">{a.name}</span><span className="gh-account-email">{a.email}</span></span>
            <Icon name="chevron-right" className="icon-sm" /></button></li>
        ))}
      </ul>
      <p className="xsmall muted">Bản mô phỏng — không mở GitHub thật và không lưu mật khẩu của bạn.</p>
    </div>
  );
}

function ResultSummary({ entry }) {
  const r = entry.result;
  const lv = (r.understanding && r.understanding.level) || {};
  return (
    <div className="stack-4 gh-result-sheet">
      <p className="small"><strong>@{r.handle}</strong> · {selectedRepos(r)} repo được chọn</p>
      <p className="small">{(r.understanding && r.understanding.headline) || r.summary || 'Chưa có ước tính tổng thể. Xem quan sát và giới hạn trong trang phân tích.'}</p>
      <div className="gh-mini-chips">
        {DOMAINS.map((d) => { const x = lv[d.key]; return x ? <span key={d.key} className={`gh-mini-chip is-stop-${x.stop}`}>{d.label} · {x.label}</span> : null; })}
      </div>
      <section aria-label="Ngôn ngữ trong repo công khai" className="stack-2">
        <h3 className="small strong" style={{ margin: 0 }}>Ngôn ngữ trong repo công khai</h3>
        <LanguageBars langs={r.languages} />
      </section>
      <p className="xsmall muted">Ước tính từ repo công khai, không phải điểm đánh giá chính thức. Mở trang phân tích để xem bằng chứng và phạm vi thu thập.</p>
    </div>
  );
}

function SheetBody() {
  const v = useUi();
  useCodi();
  if (v.pending) {
    return (
      <div className="stack-3">
        <PendingChecklist highlight={v.highlight} />
        <p className="xsmall muted">Vui lòng giữ trang mở; tối đa 60 giây chờ. Không tự thử lại. {stateFor(uiUser).hasProfile && 'Kết quả trước vẫn hiển thị bên dưới.'}</p>
      </div>
    );
  }
  if (v.oauth) return <OauthBody step={v.oauth} account={v.account} />;
  const entry = entryOf(uiUser);
  if (v.resultOpen && !v.consent && entry && entry.result) return <ResultSummary entry={entry} />;
  if (v.consent) return <ConsentForm kind={v.consent} input={v.input} />;
  return null;
}
function SheetFooter() {
  const v = useUi();
  if (v.pending) return <button type="button" className="btn btn-ghost" onClick={stopWaiting}>Dừng chờ</button>;
  if (v.oauth === 'picker') return <button type="button" className="btn btn-ghost" onClick={oauthCancel}>Huỷ</button>;
  if (v.oauth === 'permission') {
    return (
      <>
        <button type="button" className="btn btn-ghost" onClick={() => patch({ oauth: 'picker', account: null })}>Chọn tài khoản khác</button>
        <button type="button" className="btn btn-ghost" onClick={oauthDeny}>Từ chối</button>
        <button type="button" className="btn btn-primary" onClick={oauthAllow}>Cho phép</button>
      </>
    );
  }
  if (v.resultOpen && !v.consent) {
    const openPage = () => { patch({ resultOpen: false }); closeSheet(); if (!(Codi.path() === '/profile' && Codi.query().tab === 'nang-luc')) Codi.go(PROFILE_HREF); };
    return <><button type="button" className="btn btn-ghost" onClick={() => { patch({ resultOpen: false }); closeSheet(); }}>Đóng</button><button type="button" className="btn btn-primary" onClick={openPage}>Mở trang phân tích</button></>;
  }
  if (v.consent) {
    return <><button type="button" className="btn btn-ghost" onClick={later}>Để sau</button><button type="submit" className="btn btn-primary" form="github-consent-form">{v.consent === 'link' ? 'Kết nối GitHub' : 'Tôi đồng ý · Phân tích'}</button></>;
  }
  return null;
}

// ───────────────────────── result sections (rebuild's analysis page content) ─────────────────────────
function MasteryBar({ stop }) {
  return <span className="gh-mastery" aria-hidden="true" data-stop={stop}>{[0, 1, 2, 3].map((i) => <i key={i} className={i <= stop ? 'is-on' : ''} />)}</span>;
}
function UnderstandingSection({ r }) {
  if (!r.understanding) return null;
  const u = r.understanding;
  return (
    <section className="section gh-under" aria-labelledby="gh-under-h">
      <div className="row-between" style={{ marginBottom: 12 }}>
        <h2 id="gh-under-h" style={{ margin: 0 }}>Codi hiểu bạn như thế nào</h2>
        <span className="xsmall muted">Suy ra từ repo công khai, không phải điểm đánh giá chính thức</span>
      </div>
      {u.headline && <p className="lede" style={{ marginBottom: 16, maxWidth: '68ch' }}>{u.headline}</p>}
      <div className="grid-2">
        <div className="card"><div className="card-body stack-3">
          <h3 className="small strong" style={{ margin: 0 }}>Mức hiểu biết theo mảng</h3>
          <ol className="gh-domains">
            {DOMAINS.map((d) => {
              const lv = (u.level || {})[d.key] || { stop: 0, label: 'Chưa thấy' };
              return (
                <li key={d.key} className="gh-domain">
                  <span className="gh-domain-head"><span className="gh-domain-icon"><Icon name={d.icon} className="icon-sm" /></span><span className="gh-domain-name">{d.label}</span><span className={`gh-domain-level is-stop-${lv.stop}`}>{lv.label}</span></span>
                  <MasteryBar stop={lv.stop} />
                  {lv.note && <span className="xsmall muted">{lv.note}</span>}
                </li>
              );
            })}
          </ol>
        </div></div>
        <div className="card"><div className="card-body stack-3">
          <h3 className="small strong" style={{ margin: 0 }}>Công nghệ Codi thấy bạn dùng</h3>
          {(r.tech || []).map((g) => (
            <div key={g.group} className="gh-tech-group">
              <span className="xsmall muted">{g.group}</span>
              <ul className="gh-tech-chips">
                {g.items.map((t) => (
                  <li key={t.name} className={`gh-tech is-conf-${t.confidence}`}><span className="gh-tech-dot" aria-hidden="true" /><span>{t.name}</span>{t.uses ? <span className="xsmall muted">{t.uses} repo{t.last ? ` · ${t.last}` : ''}</span> : null}</li>
                ))}
              </ul>
            </div>
          ))}
          <p className="xsmall muted">Chấm đậm = tin cậy cao (dùng nhiều, mới gần đây); chấm mờ = tin cậy thấp.</p>
        </div></div>
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card"><div className="card-body stack-2">
          <h3 className="small strong" style={{ margin: 0 }}>Điểm Codi tin</h3>
          <ul className="gh-signals">
            {(r.signals || []).filter((s) => s.kind === 'good').map((s) => (
              <li key={s.label} className="gh-signal is-good"><span className="gh-signal-icon"><Icon name="check-circle" className="icon-sm" /></span><div className="stack-1"><strong className="small">{s.label}</strong><span className="xsmall muted">{s.detail}</span></div></li>
            ))}
          </ul>
        </div></div>
        <div className="card"><div className="card-body stack-2">
          <h3 className="small strong" style={{ margin: 0 }}>Chỗ Codi chưa thấy</h3>
          <ul className="gh-signals">
            {(r.signals || []).filter((s) => s.kind === 'warn').map((s) => (
              <li key={s.label} className="gh-signal is-warn"><span className="gh-signal-icon"><Icon name="alert-triangle" className="icon-sm" /></span><div className="stack-1"><strong className="small">{s.label}</strong><span className="xsmall muted">{s.detail}</span></div></li>
            ))}
            {(r.gaps || []).map((g) => (
              <li key={g.label} className="gh-signal is-gap"><span className="gh-signal-icon"><Icon name="target" className="icon-sm" /></span><div className="stack-1"><strong className="small">{g.label}</strong><span className="xsmall muted">{g.hint}</span></div></li>
            ))}
          </ul>
        </div></div>
      </div>
    </section>
  );
}

function ProfileResult({ r }) {
  const handle = r.username || r.handle;
  return (
    <div className="stack-6">
      <div className="grid-2">
        <section className="card" aria-label="Ngôn ngữ trong repo công khai"><div className="card-body stack-3">
          <h3 className="small strong" style={{ margin: 0 }}>Ngôn ngữ trong repo công khai</h3>
          <LanguageBars langs={r.languages} big />
          <p className="xsmall muted">Ước tính từ repo công khai, không phải điểm đánh giá chính thức.</p>
        </div></section>
        <div className="card"><div className="card-body stack-3">
          <h3 className="small strong" style={{ margin: 0 }}>Codi nhận xét</h3>
          <p>{r.summary}</p>
          <ul className="stack-2 small"><li><strong>{r.stats.repos}</strong> repo · <strong>{r.stats.stars}</strong> star · <strong>{r.stats.followers}</strong> người theo dõi</li>
            <li><strong>{r.stats.contribYear}</strong> đóng góp trong 12 tháng qua</li>
            <li>Ngôn ngữ chính: <strong>{r.languages[0].name}</strong></li></ul>
        </div></div>
      </div>
      <UnderstandingSection r={r} />
      <section>
        <h2 style={{ marginBottom: 12 }}>Khoá học Codi gợi ý cho bạn</h2>
        <ul className="ai-courses">
          {r.recommend.map((cid, k) => {
            const c = Codi.course(cid); if (!c) return null;
            return (
              <li key={cid} className="ai-course">
                <Thumb course={c} small />
                <div className="ai-course-main">
                  <Link className="ai-course-title" to={`/courses/${c.slug}`}>{c.title}</Link>
                  <span className="ai-course-meta">{Codi.levelLabel(c.level)} · {Codi.lessons(c).length} bài · <span className="od-nowrap">{c.price ? Codi.fmt.vnd(c.price) : 'Miễn phí'}</span></span>
                  {r.recommendWhy[cid] && <span className="ai-course-why">{r.recommendWhy[cid]}</span>}
                </div>
                <div className="ai-course-cta">{k === 0 && <span className="badge badge-accent">Phù hợp nhất</span>}<Link className="btn btn-primary btn-sm" to={`/courses/${c.slug}`}>Xem khoá học</Link></div>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h2 style={{ marginBottom: 12 }}>Repo công khai gần đây ({r.repos.length})</h2>
        <ul className="gh-repos">
          {r.repos.map((rp) => {
            const col = (r.languages.find((l) => l.name === rp.lang) || {}).color || '#64748b';
            return (
              <li key={rp.name} className="gh-repo">
                <div className="gh-repo-main"><a className="gh-repo-name" href={`https://github.com/${handle}/${rp.name}`} target="_blank" rel="noopener noreferrer">{rp.name}</a>
                  {rp.fork && <span className="badge badge-neutral">Fork</span>}
                  <span className="gh-repo-desc">{rp.desc}</span></div>
                <div className="gh-repo-meta"><span className="gh-lang-mark"><span className="gh-lang-dot" style={{ background: col }} aria-hidden="true" />{rp.lang}</span>
                  <span className="xsmall muted">★ {rp.stars}</span>
                  <span className="xsmall muted">Cập nhật {rp.updated}</span></div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

// ───────────────────────── panel (profile tab "Hồ sơ năng lực") ─────────────────────────
const LINK_ERRORS = {
  denied: 'Bạn chưa kết nối GitHub. Codi chưa được GitHub cấp quyền.',
  already_linked: 'Tài khoản GitHub đã liên kết với tài khoản Codi khác. Dùng tài khoản GitHub khác.',
  failed: 'Chưa hoàn tất kết nối GitHub. Bạn có thể thử lại.',
};
function failureTitle(f) {
  if (f.code === 'rate_limited') return 'GitHub đang giới hạn lượt đọc';
  if (f.code === 'connection_expired') return 'Kết nối GitHub đã hết hiệu lực';
  if (f.action === 'disconnect') return 'Chưa ngắt kết nối được GitHub';
  return 'Chưa tạo được hồ sơ năng lực';
}

export function GithubProfilePanel({ linkError }) {
  useCodi();
  useUi();
  const uid = syncUser();
  const v = ui;
  useEffect(() => {
    if (linkError && LINK_ERRORS[linkError]) patch({ failure: { code: 'github_not_linked', error: LINK_ERRORS[linkError] } });
  }, [linkError]);
  if (!uid) return null;
  const s = stateFor(uid);
  const profile = s.result;
  const linked = s.linked;
  const busy = v.pending || v.disconnecting || !!v.oauth;
  const stale = profile && s.analyzedAt && Date.now() - Date.parse(s.analyzedAt) > STALE_MS;

  return (
    <div className="stack-6 shell-gh-panel">
      <header className="row-between" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="row" style={{ gap: 12, minWidth: 0 }}>
          {profile && <span className="gh-avatar gh-avatar-lg" aria-hidden="true">{String(s.username || profile.handle).charAt(0).toUpperCase()}</span>}
          <div className="stack-1" style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, overflowWrap: 'anywhere' }}>{profile ? `@${s.username || profile.handle}` : 'Phân tích GitHub'}</h2>
            <p className="small muted" style={{ margin: 0 }}>
              {profile ? `Phân tích lúc ${dateLabel(s.analyzedAt)} · ${selectedRepos(profile)} repo được chọn`
                : linked ? 'GitHub đã kết nối. Chưa có hồ sơ năng lực đã lưu.' : 'Kết nối GitHub để Codi hiểu kỹ năng của bạn từ repo công khai.'}
            </p>
          </div>
        </div>
        {(profile || linked) && (
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => openConsent('analysis')}><Icon name="rotate-ccw" className="icon-sm" /> {profile ? 'Phân tích lại' : 'Phân tích GitHub'}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={askDisconnect}><Icon name="x" className="icon-sm" /> Ngắt kết nối</button>
          </div>
        )}
      </header>

      {!profile && !linked && (
        <div className="card"><div className="card-body stack-3">
          <p>Codi phân tích danh sách repo công khai và ngôn ngữ đã quan sát, chỉ đọc và không ghi lên GitHub. Hồ sơ là ước tính ban đầu, không phải đánh giá chính thức.</p>
          <p className="small muted">Codi chỉ bắt đầu đọc GitHub sau khi bạn xác nhận. Mở trang, nhập thông tin hoặc chọn Để sau không bắt đầu phân tích.</p>
          <div><button type="button" className="btn btn-primary" disabled={busy} onClick={() => openConsent('link')}><GithubMark className="icon icon-sm" /> Kết nối GitHub</button></div>
        </div></div>
      )}

      {stale && <p className="small muted" role="status">Hồ sơ phân tích hơn 90 ngày trước. Phân tích lại để cập nhật bằng chứng.</p>}
      {v.pending && profile && <p className="small muted" role="status">Đang phân tích lại. Kết quả trước vẫn hiển thị bên dưới; chưa được thay thế.</p>}
      {v.pending && !profile && <p className="small muted" role="status">Đang phân tích GitHub…</p>}
      {v.disconnecting && <p className="small" role="status">Đang ngắt kết nối GitHub…</p>}
      {v.note && <p className="small muted" role="status">{v.note}</p>}

      {v.failure && (
        <Alert type="danger" title={failureTitle(v.failure)}>
          <span style={{ display: 'block' }}>{v.failure.error}</span>
          {v.failure.retryAt && <span style={{ display: 'block' }}>Có thể thử lại sau {dateLabel(v.failure.retryAt)}. Codi không tự thử lại.</span>}
          {(v.failure.code === 'github_not_linked' || v.failure.code === 'connection_expired') && (
            <span className="stack-2" style={{ display: 'grid', marginTop: 8 }}>
              <span>Cần liên kết tài khoản GitHub với phiên Codi hiện tại trước khi phân tích. Nhập tên người dùng không chứng minh quyền sở hữu.</span>
              <span><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => openConsent('link')}>{v.failure.code === 'connection_expired' ? 'Kết nối lại GitHub' : 'Kết nối GitHub'}</button></span>
            </span>
          )}
          {profile && <span style={{ display: 'block' }}>Kết quả trước vẫn hiển thị bên dưới; chưa được thay thế.</span>}
        </Alert>
      )}

      {profile && <ProfileResult r={profile} />}

      {v.insufficient && (
        <Alert type="info" title="Chưa đủ dữ liệu để ước tính">
          <span style={{ display: 'block' }}>Kết quả tạm thời, không phải hồ sơ đã lưu. Lượt phân tích này chưa ghi nhận quan sát công nghệ.</span>
          <span style={{ display: 'block' }}>Đã liệt kê {v.insufficient.listed} repo; chọn {v.insufficient.selected} repo. Chỉ phản ánh phạm vi đã thu thập.</span>
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
  const [dismissed, setDismissed] = useState(readDismissed);
  const uid = Codi.state.currentUserId;
  if (!uid || Codi.role() !== 'learner') return null;
  const dismiss = () => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* hidden for this view only */ } };
  if (stateFor(uid).linked) {
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
      <div className="row"><Link className="btn btn-secondary btn-sm" to={PROFILE_HREF}>Kết nối GitHub</Link><button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>Để sau</button></div>
    </div></div>
  );
}

// ───────────────────────── context for AI advisor ─────────────────────────
function contextFor(userId) {
  const s = stateFor(userId); if (!s.result) return '';
  const r = s.result; const u = r.understanding || {}; const lv = u.level || {};
  const strong = DOMAINS.filter((d) => (lv[d.key] || {}).stop >= 2).map((d) => `${d.label.toLowerCase()} (${lv[d.key].label.toLowerCase()})`);
  const weak = DOMAINS.filter((d) => (lv[d.key] || {}).stop <= 1).map((d) => d.label.toLowerCase());
  const topTech = (r.tech || []).flatMap((g) => g.items).filter((t) => t.confidence === 'high').map((t) => t.name).slice(0, 4);
  const parts = [`Người học đã kết nối GitHub (@${s.username}, ${r.stats.repos} repo, ${r.stats.contribYear} đóng góp/năm).`];
  if (u.headline) parts.push(u.headline);
  if (strong.length) parts.push(`Mạnh: ${strong.join(', ')}.`);
  if (weak.length) parts.push(`Mỏng: ${weak.join(', ')}.`);
  if (topTech.length) parts.push(`Hay dùng: ${topTech.join(', ')}.`);
  return parts.join(' ');
}

Object.assign(Codi, { github: { openConnect, stateFor, isConnected, disconnect, contextFor, markLinked, learnerCard: () => <GithubLearnerCard /> } });
Codi.onReset(() => { clearTimers(); closeSheet(); ui = blank(); uiUser = null; bump(); });
