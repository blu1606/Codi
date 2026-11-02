/**
 * Account onboarding step "Kết nối GitHub" ('/onboarding/github?next=…'): optional, skippable with "Để sau".
 *
 * Reached right after sign-up (OTP or a new social account), from the dashboard GitHub card and from the course
 * onboarding level step. Flow: connect (simulated GitHub OAuth chooser + permission) → separate analysis consent →
 * analysing (stages + progress) → result summary → "Lưu vào hồ sơ" saves on the user's GitHub record → continue to
 * `next`. Linking never starts an analysis and the draft result is only stored after "Lưu vào hồ sơ".
 *
 * Copy and rules follow the real app's GitHub profile panel (components/profile/github-profile-panel.tsx) and PRODUCT
 * Flow L14 (consent lists, "ước tính từ GitHub", failure titles). Outcomes are forced with the dev-drawer flag
 * githubAnalysis (ok · insufficient · rate-limit · expired · failed · timeout).
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Icon, Progress, Stepper } from '../../components/ui/primitives';
import { GITHUB_ACCOUNTS } from './github-profiles';
import { GithubMark, scenario } from './shell-ui';
import {
  DOMAINS, LanguageBars, OauthBody, confirmUnlinkDialog, dateLabel, disconnect, isStale, linkedElsewhere, markLinked,
  profileFor, saveAnalysis, selectedRepos, stateFor,
} from './github-api';

const PROFILE_HREF = '/profile?tab=nang-luc';
const STAGES = ['Đọc hồ sơ công khai', 'Đọc repo công khai', 'Nhận diện công nghệ', 'Tạo hồ sơ năng lực'];
const STAGE_MS = 900;
const TIMEOUT_MS = 60000;
const STEPS = ['Kết nối GitHub', 'Phân tích', 'Lưu vào hồ sơ'];

/** In-app path only; anything else (absent, external, protocol-relative) continues to the role home. */
export function safeNext(v) {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/onboarding/github') ? v : Codi.homeFor(Codi.role());
}
const nextFromUrl = () => safeNext(Codi.query().next);

// Overall estimate shown on the result: highest domain stop, never above "Vững"; confidence from public repo count.
const OVERALL = ['Mới bắt đầu', 'Mới bắt đầu', 'Cơ bản', 'Vững'];
function overallLevel(r) {
  const lv = (r.understanding && r.understanding.level) || {};
  const best = Math.max(0, ...DOMAINS.map((d) => (lv[d.key] || {}).stop || 0));
  const repos = (r.stats && r.stats.repos) || 0;
  return { label: OVERALL[best], confidence: repos >= 10 ? 'Trung bình' : 'Thấp' };
}

const FAILURES = {
  'rate-limit': { code: 'rate_limited', title: 'GitHub đang giới hạn lượt đọc', error: 'GitHub đang giới hạn lượt đọc. Vui lòng thử lại sau.' },
  expired: { code: 'connection_expired', title: 'Kết nối GitHub đã hết hiệu lực', error: 'Kết nối GitHub đã hết hiệu lực. Vui lòng kết nối lại.' },
  failed: { code: 'request_failed', title: 'Chưa tạo được hồ sơ năng lực', error: 'Chưa tạo được hồ sơ năng lực. Không tự thử lại.' },
  timeout: { code: 'client_timeout', title: 'Chưa tạo được hồ sơ năng lực', error: 'Đã hết thời gian chờ 60 giây. Chưa xác nhận được kết quả; yêu cầu trên máy chủ có thể vẫn đang hoàn tất. Không tự thử lại.' },
};

function initialPhase(uid) {
  const s = stateFor(uid);
  return s.hasProfile ? 'saved' : s.linked ? 'consent' : 'intro';
}

function ReadsList() {
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

/** Summary of an analysis: handle, repos counted, overall estimate, domains, languages. */
function ResultSummary({ r, analyzedAt }) {
  const lv = (r.understanding && r.understanding.level) || {};
  const est = overallLevel(r);
  return (
    <div className="stack-4">
      <dl className="shell-ghob-facts">
        <div><dt>Tài khoản</dt><dd>@{r.handle}</dd></div>
        <div><dt>Repo công khai</dt><dd><span className="shell-ghob-num">{r.stats.repos}</span> repo · <span className="shell-ghob-num">{selectedRepos(r)}</span> repo được chọn</dd></div>
        <div><dt>Trình độ ước tính</dt><dd><strong>{est.label}</strong> <span className="badge badge-neutral">ước tính từ GitHub</span> <span className="small muted">· độ tin cậy {est.confidence}</span></dd></div>
        {analyzedAt && <div><dt>Phân tích lúc</dt><dd>{dateLabel(analyzedAt)}</dd></div>}
      </dl>
      <p className="shell-ghob-headline">{(r.understanding && r.understanding.headline) || r.summary}</p>
      <div className="gh-mini-chips" role="group" aria-label="Mức theo mảng">
        {DOMAINS.map((d) => { const x = lv[d.key]; return x ? <span key={d.key} className={`gh-mini-chip is-stop-${x.stop}`}>{d.label} · {x.label}</span> : null; })}
      </div>
      <section className="stack-2" aria-labelledby="ghob-langs">
        <h2 id="ghob-langs" className="small strong" style={{ margin: 0 }}>Ngôn ngữ trong repo công khai</h2>
        <LanguageBars langs={r.languages} />
      </section>
      <p className="xsmall muted">Ước tính từ repo công khai, không phải điểm đánh giá chính thức. Bài kiểm tra đầu vào và bài tập trong từng khoá học vẫn quyết định trình độ của bạn.</p>
    </div>
  );
}

function Analysing({ stage, repoCount, repoTotal, pct, waitingServer }) {
  return (
    <section className="stack-4 shell-ghob-analysing" aria-labelledby="ghob-wait-h" aria-busy="true">
      <div className="stack-2">
        <h1 id="ghob-wait-h" tabIndex={-1}>Đang phân tích GitHub…</h1>
        <p className="muted">Thường mất dưới 1 phút. Vui lòng giữ trang mở; Codi không tự thử lại.</p>
      </div>
      <Progress pct={pct} label="Tiến độ phân tích GitHub" />
      <ol className="shell-ghob-stages">
        {STAGES.map((s, i) => {
          const st = i < stage ? 'done' : i === stage ? 'current' : 'todo';
          return (
            <li key={s} className={`is-${st}`} aria-current={st === 'current' ? 'step' : undefined}>
              <span className="shell-ghob-stage-mark" aria-hidden="true">{st === 'done' ? <Icon name="check" className="icon-sm" /> : null}</span>
              <span className="od-fill">{s}{i === 1 && repoTotal > 0 && st !== 'todo' && <span className="shell-ghob-num muted"> ({repoCount}/{repoTotal})</span>}</span>
              <span className="sr-only">{st === 'done' ? ' · xong' : st === 'current' ? ' · đang chạy' : ' · chưa bắt đầu'}</span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" role="status">{waitingServer ? 'Đang chờ máy chủ xác nhận kết quả' : STAGES[stage]}</p>
      {waitingServer && <p className="small muted">Đang chờ máy chủ xác nhận kết quả…</p>}
      <p className="xsmall muted">Bản thử nghiệm mô phỏng các bước phân tích; GitHub thật không được gọi.</p>
    </section>
  );
}

export default function GithubOnboardingPage() {
  useCodi();
  const uid = Codi.state.currentUserId;
  const u = Codi.currentUser();
  const [phase, setPhase] = useState(() => initialPhase(uid)); // intro | picker | permission | consent | analysing | result | saved | failed | insufficient
  const [account, setAccount] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState(null); // { type, title?, body }
  const [failure, setFailure] = useState(null);
  const [draft, setDraft] = useState(null);
  const [prog, setProg] = useState({ stage: 0, repoCount: 0, repoTotal: 0, pct: 0, waitingServer: false });
  const [busy, setBusy] = useState(false);
  const timers = useRef([]);
  const alive = useRef(true);
  const userRef = useRef(uid);

  const clearTimers = () => { timers.current.forEach((t) => clearTimeout(t)); timers.current = []; };
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimers(); }; }, []);
  // A different account signed in on this tab: drop the previous user's in-progress state.
  useEffect(() => {
    if (userRef.current === uid) return;
    userRef.current = uid; clearTimers();
    setPhase(initialPhase(uid)); setDraft(null); setFailure(null); setNotice(null); setAccount(null);
  }, [uid]);
  // Move focus to the new step's heading so keyboard and screen-reader users follow the flow.
  useEffect(() => {
    const h = document.querySelector('#app-main h1');
    if (h) h.focus({ preventScroll: false });
  }, [phase]);

  if (!uid || !u) return null;
  const s = stateFor(uid);
  const next = nextFromUrl();
  const isNewAccount = !s.linked && Date.now() - Date.parse(u.createdAt || 0) < 15 * 60000;
  const later = () => { clearTimers(); Codi.go(next); };
  const accounts = GITHUB_ACCOUNTS.some((a) => a.email === u.email) ? GITHUB_ACCOUNTS : [{ email: u.email, name: u.name }, ...GITHUB_ACCOUNTS];

  const startLink = () => { setNotice(null); setFailure(null); setAccount(null); setPhase('picker'); };
  const pick = (email) => { setAccount(accounts.find((a) => a.email === email) || null); setPhase('permission'); };
  const cancelOauth = () => { setPhase('intro'); setNotice({ type: 'info', body: 'Chưa hoàn tất kết nối GitHub. Bạn có thể thử lại.' }); };
  const deny = () => { setPhase('intro'); setNotice({ type: 'warn', body: 'Bạn chưa kết nối GitHub. Codi chưa được GitHub cấp quyền.' }); };
  const allow = async () => {
    if (!account || connecting) return;
    setConnecting(true);
    await Codi.wait(600);
    if (!alive.current || Codi.state.currentUserId !== uid) return;
    setConnecting(false);
    if (linkedElsewhere(account.email, uid)) {
      setPhase('intro');
      setNotice({ type: 'danger', title: 'Chưa kết nối được GitHub', body: 'Tài khoản GitHub đã liên kết với tài khoản Codi khác. Dùng tài khoản GitHub khác.' });
      return;
    }
    // Reconnecting the same account keeps the saved result; switching to another GitHub account drops the old record.
    const prev = stateFor(uid);
    if (prev.linked && prev.email !== account.email) disconnect(uid);
    markLinked(uid, account);
    Codi.ui.toast('Đã kết nối GitHub.', { type: 'success' });
    setAccount(null); setPhase('consent');
  };

  const analyse = () => {
    const entry = stateFor(uid);
    if (!entry.linked) { setPhase('intro'); setNotice({ type: 'warn', body: 'Bạn chưa liên kết GitHub với tài khoản Codi này.' }); return; }
    clearTimers();
    const outcome = scenario(Codi.state, 'githubAnalysis');
    const result = profileFor(entry.email);
    const total = (result.stats && result.stats.repos) || 0;
    setFailure(null); setNotice(null); setDraft(null);
    setProg({ stage: 0, repoCount: 0, repoTotal: total, pct: 4, waitingServer: false });
    setPhase('analysing');
    const at = (ms, fn) => timers.current.push(setTimeout(() => { if (alive.current) fn(); }, ms));
    // Stage 2 counts repos up in a few visible ticks.
    at(STAGE_MS, () => setProg((p) => ({ ...p, stage: 1, pct: 25 })));
    [0.35, 0.7, 1].forEach((f, i) => at(STAGE_MS + (i + 1) * (STAGE_MS / 3), () => setProg((p) => ({ ...p, repoCount: Math.round(total * f), pct: 25 + Math.round(25 * f) }))));
    at(STAGE_MS * 2 + 100, () => setProg((p) => ({ ...p, stage: 2, pct: 60 })));
    at(STAGE_MS * 3 + 100, () => setProg((p) => ({ ...p, stage: 3, pct: 82 })));
    if (outcome === 'timeout') {
      at(STAGE_MS * 4, () => setProg((p) => ({ ...p, pct: 92, waitingServer: true })));
      at(TIMEOUT_MS, () => { setFailure(FAILURES.timeout); setPhase('failed'); });
      return;
    }
    at(STAGE_MS * 4 + 200, () => {
      if (Codi.state.currentUserId !== uid) return;
      if (FAILURES[outcome]) { setFailure(FAILURES[outcome]); setPhase('failed'); return; }
      if (outcome === 'insufficient') { setDraft({ listed: total, selected: 0 }); setPhase('insufficient'); return; }
      setProg((p) => ({ ...p, stage: STAGES.length, pct: 100 }));
      setDraft(result); setPhase('result');
    });
  };

  const stopWaiting = () => {
    clearTimers();
    setPhase(stateFor(uid).hasProfile ? 'saved' : 'consent');
    setNotice({ type: 'info', body: 'Đã dừng chờ. Chưa lưu kết quả mới; kết quả trước vẫn được giữ lại nếu có.' });
  };

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    await Codi.wait(300);
    if (!alive.current) return;
    setBusy(false);
    if (!saveAnalysis(uid, draft)) { setFailure({ code: 'github_not_linked', title: 'Chưa lưu được hồ sơ năng lực', error: 'Bạn chưa liên kết GitHub với tài khoản Codi này.' }); setPhase('failed'); return; }
    Codi.ui.toast('Đã lưu hồ sơ năng lực vào hồ sơ của bạn.', { type: 'success' });
    Codi.go(next);
  };
  const discard = () => { setDraft(null); setPhase(stateFor(uid).hasProfile ? 'saved' : 'consent'); setNotice({ type: 'info', body: 'Chưa lưu kết quả vừa phân tích.' }); };

  const unlink = async () => {
    if (busy) return;
    if (!(await confirmUnlinkDialog())) return;
    if (!alive.current) return;
    setBusy(true);
    await Codi.wait(400);
    if (!alive.current) return;
    disconnect(uid);
    setBusy(false); clearTimers(); setDraft(null); setFailure(null);
    setPhase('intro'); setNotice({ type: 'info', body: 'Đã ngắt kết nối GitHub.' });
  };

  const stepIndex = { intro: 0, picker: 0, permission: 0, consent: 1, analysing: 1, failed: 1, insufficient: 1, result: 2, saved: 3 }[phase];
  const noticeEl = notice && <Alert type={notice.type} title={notice.title} body={notice.body} />;
  const unlinkBtn = s.linked && <button type="button" className="btn btn-ghost btn-sm" onClick={unlink} disabled={busy}><Icon name="x" className="icon-sm" /> Ngắt kết nối</button>;

  let body;
  if (phase === 'picker' || phase === 'permission') {
    body = (
      <section className="stack-6" aria-labelledby="ghob-oauth-h">
        <h1 id="ghob-oauth-h" tabIndex={-1}>{phase === 'picker' ? 'Chọn tài khoản GitHub' : 'Cấp quyền cho Codi'}</h1>
        <div className="card"><div className="card-body">
          <OauthBody step={phase} account={account} accounts={accounts} onPick={pick} />
        </div></div>
        <div className="shell-ghob-actions">
          {phase === 'picker'
            ? <button type="button" className="btn btn-ghost" onClick={cancelOauth}>Huỷ</button>
            : <>
              <button type="button" className="btn btn-ghost" onClick={() => { setAccount(null); setPhase('picker'); }} disabled={connecting}>Chọn tài khoản khác</button>
              <span className="od-fill" />
              <button type="button" className="btn btn-secondary" onClick={deny} disabled={connecting}>Từ chối</button>
              <button type="button" className="btn btn-primary" onClick={allow} disabled={connecting} aria-busy={connecting || undefined}>
                {connecting ? <><Icon name="loader" className="icon-sm shell-spin" /> Đang kết nối...</> : 'Cho phép'}
              </button>
            </>}
        </div>
      </section>
    );
  } else if (phase === 'consent') {
    body = (
      <section className="stack-6" aria-labelledby="ghob-consent-h">
        <div className="stack-2">
          <h1 id="ghob-consent-h" tabIndex={-1}>Cho phép Codi phân tích GitHub?</h1>
          <p className="muted">Đã kết nối <strong>@{s.username}</strong>. Codi chỉ bắt đầu đọc sau khi bạn đồng ý.</p>
        </div>
        {noticeEl}
        <ReadsList />
        <p className="xsmall muted">Yêu cầu này có thể mất đến 60 giây. Trang không tự phân tích hoặc tự thử lại.</p>
        <div className="shell-ghob-actions">
          {unlinkBtn}<span className="od-fill" />
          <button type="button" className="btn btn-ghost" onClick={later}>Để sau</button>
          <button type="button" className="btn btn-primary" onClick={analyse}>Tôi đồng ý · Phân tích</button>
        </div>
      </section>
    );
  } else if (phase === 'analysing') {
    body = (
      <div className="stack-6">
        <Analysing {...prog} />
        <div className="shell-ghob-actions"><span className="od-fill" /><button type="button" className="btn btn-ghost" onClick={stopWaiting}>Dừng chờ</button></div>
      </div>
    );
  } else if (phase === 'result' && draft) {
    body = (
      <section className="stack-6" aria-labelledby="ghob-result-h">
        <div className="stack-2">
          <h1 id="ghob-result-h" tabIndex={-1}>Hồ sơ năng lực đã sẵn sàng</h1>
          <p className="muted">Xem lại trước khi lưu. Kết quả chỉ được lưu khi bạn chọn Lưu vào hồ sơ.</p>
        </div>
        <div className="card"><div className="card-body"><ResultSummary r={draft} /></div></div>
        <div className="shell-ghob-actions">
          <button type="button" className="btn btn-ghost" onClick={discard} disabled={busy}>Không lưu</button>
          <span className="od-fill" />
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy} aria-busy={busy || undefined}>{busy ? 'Đang lưu...' : 'Lưu vào hồ sơ'}</button>
        </div>
      </section>
    );
  } else if (phase === 'saved' && s.result) {
    body = (
      <section className="stack-6" aria-labelledby="ghob-saved-h">
        <div className="stack-2">
          <h1 id="ghob-saved-h" tabIndex={-1}>Hồ sơ năng lực của bạn</h1>
          <p className="muted">GitHub đã kết nối và kết quả đã lưu. Bạn có thể phân tích lại khi có code công khai mới.</p>
        </div>
        {noticeEl}
        {isStale(s.analyzedAt) && <p className="small muted" role="status">Hồ sơ phân tích hơn 90 ngày trước. Phân tích lại để cập nhật bằng chứng.</p>}
        <div className="card"><div className="card-body"><ResultSummary r={s.result} analyzedAt={s.analyzedAt} /></div></div>
        <div className="shell-ghob-actions">
          {unlinkBtn}
          <button type="button" className="btn btn-ghost btn-sm" onClick={analyse} disabled={busy}><Icon name="rotate-ccw" className="icon-sm" /> Phân tích lại</button>
          <Link className="btn btn-ghost btn-sm" to={PROFILE_HREF}>Xem chi tiết</Link>
          <span className="od-fill" />
          <button type="button" className="btn btn-primary" onClick={later}>Tiếp tục <Icon name="arrow-right" className="icon-sm" /></button>
        </div>
      </section>
    );
  } else if (phase === 'failed' && failure) {
    const reconnect = failure.code === 'connection_expired' || failure.code === 'github_not_linked';
    body = (
      <section className="stack-6" aria-labelledby="ghob-fail-h">
        <h1 id="ghob-fail-h" tabIndex={-1}>Chưa phân tích được GitHub</h1>
        <Alert type="danger" title={failure.title}>
          <span style={{ display: 'block' }}>{failure.error}</span>
          {failure.code === 'rate_limited' && <span style={{ display: 'block' }}>Có thể thử lại sau {dateLabel(new Date(Date.now() + 3600000).toISOString())}.</span>}
          {s.hasProfile && <span style={{ display: 'block' }}>Kết quả trước vẫn được giữ lại.</span>}
        </Alert>
        <div className="shell-ghob-actions">
          {unlinkBtn}<span className="od-fill" />
          <button type="button" className="btn btn-ghost" onClick={later}>Để sau</button>
          {reconnect
            ? <button type="button" className="btn btn-primary" onClick={startLink}>Kết nối lại GitHub</button>
            : <button type="button" className="btn btn-primary" onClick={analyse}>Thử lại</button>}
        </div>
      </section>
    );
  } else if (phase === 'insufficient' && draft) {
    body = (
      <section className="stack-6" aria-labelledby="ghob-empty-h">
        <h1 id="ghob-empty-h" tabIndex={-1}>Chưa đủ dữ liệu để ước tính</h1>
        <Alert type="info">
          <span style={{ display: 'block' }}>Đã liệt kê {draft.listed} repo; chọn {draft.selected} repo. Lượt phân tích này chưa ghi nhận quan sát công nghệ nên không có gì để lưu.</span>
          <span style={{ display: 'block' }}>Thiếu dữ liệu không có nghĩa là năng lực yếu. Bạn có thể phân tích lại sau khi bổ sung code công khai hoặc làm bài kiểm tra đầu vào trong khoá học của mình.</span>
          {s.hasProfile && <span style={{ display: 'block' }}>Kết quả trước vẫn được giữ lại.</span>}
        </Alert>
        <div className="shell-ghob-actions">
          {unlinkBtn}<span className="od-fill" />
          <button type="button" className="btn btn-ghost" onClick={analyse}>Phân tích lại</button>
          <button type="button" className="btn btn-primary" onClick={later}>Tiếp tục</button>
        </div>
      </section>
    );
  } else {
    // intro: not linked
    body = (
      <section className="stack-6" aria-labelledby="ghob-intro-h">
        <div className="stack-2">
          <h1 id="ghob-intro-h" tabIndex={-1}>Kết nối GitHub</h1>
          <p className="shell-ghob-lede">{isNewAccount ? 'Tài khoản đã sẵn sàng. ' : ''}Codi đọc repo công khai để hiểu bạn nhanh hơn và gợi ý điểm bắt đầu, ghi nhãn "ước tính từ GitHub". Bước này không bắt buộc.</p>
        </div>
        {noticeEl}
        <ReadsList />
        <p className="xsmall muted">Bạn có thể kết nối sau trong Hồ sơ năng lực, và ngắt kết nối bất cứ lúc nào.</p>
        <div className="shell-ghob-actions">
          <span className="od-fill" />
          <button type="button" className="btn btn-ghost" onClick={later}>Để sau</button>
          <button type="button" className="btn btn-primary" onClick={startLink}><GithubMark className="icon icon-sm" /> Kết nối GitHub</button>
        </div>
      </section>
    );
  }

  return (
    <div className="page page-focus stack-6 shell-ghob">
      {phase !== 'saved' && <Stepper steps={STEPS} current={stepIndex} />}
      {body}
    </div>
  );
}
