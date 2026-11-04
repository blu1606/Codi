/**
 * Account onboarding step "Kết nối GitHub" ('/onboarding/github?next=…'): optional, skippable with "Để sau".
 *
 * Reached right after sign-up (OTP or a new social account), from the dashboard GitHub card and from the course
 * onboarding level step. Flow on the real backend (./github-api.jsx): connect (Better Auth link-social → GitHub →
 * back here) → separate analysis consent → analysing (POST /api/github-profile, saved by the server) → result →
 * continue to `next`. Linking never starts an analysis. Failures show the server's message.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Icon, Stepper } from '../../components/ui/primitives';
import { GithubMark } from './shell-ui';
import {
  PROFILE_HREF, ProfileSummary, ReadsList, analyseGithub, confirmUnlinkDialog, connectGithub, disconnectGithub, isStale,
  useGithub, useGithubAction,
} from './github-api';

const STEPS = ['Kết nối GitHub', 'Phân tích', 'Hồ sơ năng lực'];

/** In-app path only; anything else (absent, external, protocol-relative) continues to the role home. */
// Same-site paths only. Browsers read "/\" like "//" (protocol-relative), so "/\evil.com" would leave the site;
// control characters are refused because browsers strip them before parsing.
export function safeNext(v) {
  const sameSite = typeof v === 'string' && /^\/(?![/\\])/.test(v) && !/[\u0000-\u001f\\]/.test(v);
  return sameSite && !v.startsWith('/onboarding/github') ? v : Codi.homeFor(Codi.role());
}
const nextFromUrl = () => safeNext(Codi.query().next);

export default function GithubOnboardingPage() {
  useCodi();
  const u = Codi.currentUser();
  const s = useGithub();
  const [busy, failure, run] = useGithubAction();
  const linkFailed = !!Codi.query().error;
  const phase = !s.linked ? 'intro' : busy === 'analyse' ? 'analysing' : s.profile ? 'saved' : 'consent';

  // Move focus to the new step's heading so keyboard and screen-reader users follow the flow.
  useEffect(() => {
    const h = document.querySelector('#app-main h1');
    if (h) h.focus({ preventScroll: false });
  }, [phase]);

  if (!u) return null;
  const next = nextFromUrl();
  const later = () => Codi.go(next);
  const here = `${Codi.path()}?next=${encodeURIComponent(next)}`;
  const isNewAccount = !s.linked && Date.now() - Date.parse(u.createdAt || 0) < 15 * 60000;
  const startLink = () => run('link', () => connectGithub(here), 'Không thể mở kết nối GitHub. Bạn có thể thử lại sau.');
  const analyse = () => run('analyse', analyseGithub, 'Chưa tạo được hồ sơ năng lực. Bạn có thể thử lại.');
  const unlink = async () => { if (await confirmUnlinkDialog()) run('unlink', disconnectGithub, 'Chưa ngắt kết nối được GitHub.'); };

  if (s.status === 'loading' || s.status === 'idle') {
    return <div className="page page-focus stack-6 shell-ghob"><p className="small muted" role="status">Đang tải trạng thái GitHub…</p></div>;
  }
  if (s.status === 'error') {
    return (
      <div className="page page-focus stack-6 shell-ghob">
        <h1 tabIndex={-1}>Kết nối GitHub</h1>
        <Alert type="danger" title="Chưa tải được trạng thái GitHub" body={s.error} />
        <div className="shell-ghob-actions"><span className="od-fill" /><button type="button" className="btn btn-primary" onClick={later}>Để sau</button></div>
      </div>
    );
  }

  const failureEl = failure && <Alert type="danger" title={phase === 'intro' ? 'Chưa kết nối được GitHub' : 'Chưa tạo được hồ sơ năng lực'} body={failure} />;
  const unlinkBtn = s.linked && <button type="button" className="btn btn-ghost btn-sm" onClick={unlink} disabled={!!busy}><Icon name="x" className="icon-sm" /> Ngắt kết nối</button>;
  const stepIndex = { intro: 0, consent: 1, analysing: 1, saved: 2 }[phase];

  let body;
  if (phase === 'consent') {
    body = (
      <section className="stack-6" aria-labelledby="ghob-consent-h">
        <div className="stack-2">
          <h1 id="ghob-consent-h" tabIndex={-1}>Cho phép Codi phân tích GitHub?</h1>
          <p className="muted">GitHub đã kết nối. Codi chỉ bắt đầu đọc sau khi bạn đồng ý.</p>
        </div>
        {failureEl}
        <ReadsList />
        <p className="xsmall muted">Yêu cầu này có thể mất đến 3 phút. Trang không tự phân tích hoặc tự thử lại.</p>
        <div className="shell-ghob-actions">
          {unlinkBtn}<span className="od-fill" />
          <button type="button" className="btn btn-ghost" onClick={later}>Để sau</button>
          <button type="button" className="btn btn-primary" onClick={analyse} disabled={!!busy}>Tôi đồng ý · Phân tích</button>
        </div>
      </section>
    );
  } else if (phase === 'analysing') {
    body = (
      <section className="stack-6" aria-labelledby="ghob-wait-h">
        <h1 id="ghob-wait-h" tabIndex={-1}>Đang phân tích GitHub…</h1>
        <p className="muted" role="status"><Icon name="loader" className="icon-sm shell-spin" /> Codi đang đọc repo công khai của bạn. Việc này có thể mất đến 3 phút.</p>
      </section>
    );
  } else if (phase === 'saved') {
    body = (
      <section className="stack-6" aria-labelledby="ghob-saved-h">
        <div className="stack-2">
          <h1 id="ghob-saved-h" tabIndex={-1}>Hồ sơ năng lực của bạn</h1>
          <p className="muted">GitHub đã kết nối và kết quả đã lưu. Bạn có thể phân tích lại khi có code công khai mới.</p>
        </div>
        {failureEl}
        {isStale(s.profile.collectedAt) && <p className="small muted" role="status">Hồ sơ phân tích hơn 90 ngày trước. Phân tích lại để cập nhật bằng chứng.</p>}
        <div className="card"><div className="card-body"><ProfileSummary profile={s.profile} /></div></div>
        <div className="shell-ghob-actions">
          {unlinkBtn}
          <button type="button" className="btn btn-ghost btn-sm" onClick={analyse} disabled={!!busy}><Icon name="rotate-ccw" className="icon-sm" /> Phân tích lại</button>
          <Link className="btn btn-ghost btn-sm" to={PROFILE_HREF}>Xem chi tiết</Link>
          <span className="od-fill" />
          <button type="button" className="btn btn-primary" onClick={later}>Tiếp tục <Icon name="arrow-right" className="icon-sm" /></button>
        </div>
      </section>
    );
  } else {
    body = (
      <section className="stack-6" aria-labelledby="ghob-intro-h">
        <div className="stack-2">
          <h1 id="ghob-intro-h" tabIndex={-1}>Kết nối GitHub</h1>
          <p className="shell-ghob-lede">{isNewAccount ? 'Tài khoản đã sẵn sàng. ' : ''}Codi đọc repo công khai để hiểu bạn nhanh hơn và gợi ý điểm bắt đầu, ghi nhãn "ước tính từ GitHub". Bước này không bắt buộc.</p>
        </div>
        {linkFailed && !failure && <Alert type="warn" body="Chưa hoàn tất kết nối GitHub. Bạn có thể thử lại." />}
        {failureEl}
        <ReadsList />
        <p className="xsmall muted">Bạn có thể kết nối sau trong Hồ sơ năng lực, và ngắt kết nối bất cứ lúc nào.</p>
        <div className="shell-ghob-actions">
          <span className="od-fill" />
          <button type="button" className="btn btn-ghost" onClick={later}>Để sau</button>
          <button type="button" className="btn btn-primary" onClick={startLink} disabled={!!busy} aria-busy={busy === 'link' || undefined}><GithubMark className="icon icon-sm" /> {busy === 'link' ? 'Đang mở GitHub…' : 'Kết nối GitHub'}</button>
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
