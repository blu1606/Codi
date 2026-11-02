/**
 * /settings — port of the real app's app/settings/page.tsx and components/settings/* (account-settings.tsx,
 * change-email-form.tsx, session-settings.tsx, password-recovery-form.tsx) plus
 * components/profile/change-password-card.tsx and email-verification-card.tsx.
 *
 * Layout: no app header (focus layout with the "Đóng cài đặt" exit), left card with avatar + "Sửa Hồ Sơ", three
 * tabs, Esc closes to the role home. Dialogs: display name, change email (OTP to the new address), password
 * (with "Quên mật khẩu hiện tại?" recovery). Security tab lists device sessions.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import { FieldError, useMounted } from './auth';
import OtpInput from './otp-input';
import { GithubMark, ListRowsSkeleton, LoadingRegion, ShellIcon, Skel, UserAvatar, scenario } from './shell-ui';
import {
  EMAIL_RE, OTP_MAX_TRIES, checkOtp, checkPassword, currentSessionId, describeDevice, endSession, grantReset,
  isMobileAgent, revokeOtherSessions, revokeSession, sessionsOf, setPassword,
} from './account-store';

export const maskEmail = (e) => { const s = String(e || ''); return '••••••••' + s.slice(s.lastIndexOf('@')); };

/** Opens a dialog whose content can lock it while busy (real: closeDialog ignored while saving). */
function openDialog(title, description, render, onClosed) {
  let h = null;
  const setBusy = (b) => { if (h) h.update({ dismissible: !b }); };
  h = Codi.ui.modal({
    title,
    body: (handle) => (<>{description && <p className="small muted" style={{ marginTop: -8 }}>{description}</p>}{render(handle, setBusy)}</>),
    onClose: onClosed,
  });
  return h;
}

// ───────────────────────── display name ─────────────────────────
function NameForm({ handle, setBusy }) {
  const u = Codi.currentUser();
  const [draft, setDraft] = useState(u ? u.name : '');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.focus(); }, []);
  if (!u) return null;
  const dirty = draft.trim() !== u.name;
  const save = async (e) => {
    e.preventDefault();
    const next = draft.trim();
    if (!next || !dirty || saving) return;
    setSaving(true); setBusy(true);
    await Codi.wait(400);
    Codi.set(() => { const cu = Codi.currentUser(); if (cu) cu.name = next; });
    setBusy(false);
    handle.close();
    Codi.ui.toast('Đã cập nhật tên hiển thị.', { type: 'success' });
  };
  return (
    <form className="stack-4" noValidate onSubmit={save}>
      <div className="field"><label htmlFor="settings-display-name">Tên hiển thị</label>
        <input ref={ref} id="settings-display-name" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="name" maxLength={100} required disabled={saving} /></div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => handle.close()}>Hủy</button>
        <button type="submit" className="btn btn-primary" disabled={saving || !draft.trim() || !dirty}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
      </div>
    </form>
  );
}

// ───────────────────────── change email ─────────────────────────
function ChangeEmailForm({ handle, setBusy }) {
  const u = Codi.currentUser();
  const [draft, setDraft] = useState('');
  const [destination, setDestination] = useState(null);
  const [otp, setOtp] = useState('');
  const [busy, setB] = useState(false);
  const [error, setError] = useState('');
  const tries = useRef(0);
  const deadline = useRef(0);
  const ref = useRef(null);
  const mounted = useMounted();
  useEffect(() => { if (!destination && ref.current) ref.current.focus(); }, [destination]);
  if (!u) return null;
  const pending = (b) => { setB(b); setBusy(b); };

  const sendCode = async () => {
    if (busy) return false;
    const next = destination || draft.trim().toLowerCase();
    if (!EMAIL_RE.test(next)) { setError('Vui lòng nhập địa chỉ email hợp lệ.'); return false; }
    if (next === u.email.toLowerCase()) { setError('Email mới phải khác email hiện tại.'); return false; }
    pending(true); setError('');
    await Codi.wait(600);
    if (!mounted.current) return false;
    pending(false);
    if (Codi.db().users.some((x) => x.id !== u.id && x.email.toLowerCase() === next)) {
      setError('Email này đã được liên kết với một tài khoản khác. Vui lòng sử dụng email khác.'); return false;
    }
    tries.current = 0;
    setDestination(next); setOtp('');
    return true;
  };
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!destination) { await sendCode(); return; }
    if (!/^\d{6}$/.test(otp)) { setError('Vui lòng nhập đủ 6 chữ số xác thực.'); return; }
    if (tries.current >= OTP_MAX_TRIES) { setError('Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã.'); return; }
    pending(true); setError('');
    await Codi.wait(600);
    if (!mounted.current) return;
    pending(false);
    const r = checkOtp(otp, deadline.current);
    if (r === 'expired') { setError('Mã xác thực đã hết hạn. Vui lòng gửi lại mã.'); return; }
    if (r === 'wrong') {
      tries.current += 1;
      setError(tries.current >= OTP_MAX_TRIES ? 'Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã.' : 'Mã xác thực không đúng. Vui lòng kiểm tra lại.');
      return;
    }
    Codi.set(() => { const cu = Codi.currentUser(); if (cu) { cu.email = destination; cu.emailVerified = true; } });
    handle.close();
    Codi.ui.toast('Đã xác thực và cập nhật email. Bạn có thể dùng email mới để đăng nhập.', { type: 'success' });
  };

  return (
    <form className="stack-4" noValidate onSubmit={submit}>
      {destination ? (
        <>
          <p className="small muted" style={{ overflowWrap: 'anywhere' }}>Kiểm tra hộp thư <strong>{destination}</strong> và nhập mã xác thực gồm 6 chữ số.</p>
          <OtpInput value={otp} onChange={setOtp} onResend={sendCode} disabled={busy} autoFocus onDeadline={(d) => { deadline.current = d; }} />
          <div><button type="button" className="btn-link small" disabled={busy} onClick={() => { setDestination(null); setOtp(''); setError(''); }}>Nhập email khác</button></div>
        </>
      ) : (
        <div className={`field ${error ? 'is-invalid' : ''}`}>
          <label htmlFor="settings-new-email">Email mới</label>
          <input ref={ref} id="settings-new-email" type="email" autoComplete="email" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nhập email mới của bạn"
            disabled={busy} aria-invalid={error ? true : undefined} aria-describedby={error ? 'change-email-error' : undefined} />
          <p className="field-help">Email hiện tại giữ nguyên cho đến khi bạn xác thực email mới thành công.</p>
        </div>
      )}
      {error && <p id="change-email-error" className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{error}</span></p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || (destination ? otp.length !== 6 : !draft.trim())}>
        {busy ? 'Đang xử lý...' : destination ? 'Xác nhận và cập nhật email' : 'Gửi mã xác thực'}
      </button>
    </form>
  );
}

// ───────────────────────── email verification card ─────────────────────────
function EmailVerificationCard({ u, displayEmail }) {
  const [sending, setSending] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const deadline = useRef(0);
  if (u.emailVerified !== false) return null;
  const send = async () => {
    setSending(true);
    await Codi.wait(500);
    setSending(false); setShowOtp(true);
    Codi.ui.toast('Mã OTP gồm 6 chữ số đã được gửi tới email của bạn!', { type: 'success' });
    return true;
  };
  const verify = async () => {
    if (otp.length !== 6) { Codi.ui.toast('Vui lòng nhập đủ 6 chữ số OTP', { type: 'danger' }); return; }
    setVerifying(true);
    await Codi.wait(500);
    setVerifying(false);
    if (checkOtp(otp, deadline.current) !== 'ok') { Codi.ui.toast('Mã OTP không hợp lệ hoặc đã hết hạn.', { type: 'danger' }); return; }
    Codi.set(() => { const cu = Codi.currentUser(); if (cu) cu.emailVerified = true; });
    setShowOtp(false);
    Codi.ui.toast('Xác thực email thành công!', { type: 'success' });
  };
  return (
    <div className="card shell-verify-card"><div className="card-body stack-3">
      <div className="row" style={{ gap: 8 }}><span className="text-danger"><ShellIcon name="shield-alert" /></span><strong>Tài khoản chưa xác thực email</strong></div>
      <p className="small muted">Xác thực địa chỉ email <strong>{displayEmail || u.email}</strong> để bảo vệ tài khoản và mở khóa đầy đủ tính năng.</p>
      {!showOtp ? (
        <div><button type="button" className="btn btn-primary btn-sm" onClick={send} disabled={sending}>{sending ? 'Đang gửi mã...' : 'Gửi mã OTP xác thực'}</button></div>
      ) : (
        <div className="stack-3" style={{ maxWidth: 420 }}>
          <OtpInput value={otp} onChange={setOtp} onResend={send} disabled={verifying} autoFocus onDeadline={(d) => { deadline.current = d; }} />
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" onClick={verify} disabled={otp.length !== 6 || verifying}>{verifying ? 'Đang xác thực...' : 'Xác nhận OTP'}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowOtp(false)}>Thu gọn</button>
          </div>
        </div>
      )}
    </div></div>
  );
}
export { EmailVerificationCard };

// ───────────────────────── password (dialog) ─────────────────────────
function PasswordRecoveryForm({ email, onBack, setBusy, handle }) {
  const [otp, setOtp] = useState('');
  const [busy, setB] = useState(false);
  const [error, setError] = useState('');
  const deadline = useRef(0);
  const mounted = useMounted();
  const pending = (b) => { setB(b); setBusy(b); };
  const resend = async () => {
    pending(true); setError('');
    await Codi.wait(500);
    if (!mounted.current) return false;
    pending(false);
    return true;
  };
  const verify = async (e) => {
    e.preventDefault();
    if (busy || !/^\d{6}$/.test(otp)) return;
    pending(true); setError('');
    await Codi.wait(500);
    if (!mounted.current) return;
    pending(false);
    const r = checkOtp(otp, deadline.current);
    if (r !== 'ok') { setError(r === 'expired' ? 'Mã xác thực đã hết hạn. Vui lòng gửi lại mã.' : 'Mã xác thực không đúng. Vui lòng kiểm tra lại.'); return; }
    grantReset(Codi.state.currentUserId, email);
    handle.close();
    Codi.go('/reset-password?source=account');
  };
  return (
    <form className="stack-4" noValidate onSubmit={verify}>
      <div className="stack-1"><strong>Xác thực email</strong><p className="small muted">Khôi phục mật khẩu bằng email đang liên kết với tài khoản.</p></div>
      <p className="small muted" style={{ overflowWrap: 'anywhere' }}>Nhập mã 6 số đã gửi đến <strong>{email}</strong> để tiếp tục đặt mật khẩu mới.</p>
      <OtpInput value={otp} onChange={setOtp} onResend={resend} disabled={busy} autoFocus onDeadline={(d) => { deadline.current = d; }} />
      {error && <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{error}</span></p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || otp.length !== 6}>{busy ? 'Đang xác thực...' : 'Xác thực mã và tiếp tục'}</button>
      <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={onBack}>Quay lại đổi mật khẩu</button>
    </form>
  );
}

function ChangePasswordCard({ handle, setBusy }) {
  const u = Codi.currentUser();
  const [v, setV] = useState({ cur: '', p1: '', p2: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState(null);
  const mounted = useMounted();
  if (!u) return null;
  if (recoveryEmail) return <PasswordRecoveryForm email={recoveryEmail} onBack={() => setRecoveryEmail(null)} setBusy={setBusy} handle={handle} />;
  const on = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (saving || sending) return;
    const next = {};
    if (!v.cur) next.cur = 'Vui lòng nhập mật khẩu hiện tại';
    if (v.p1.length < 8) next.p1 = 'Mật khẩu mới phải có ít nhất 8 ký tự';
    if (v.p2.length < 8) next.p2 = 'Vui lòng nhập lại mật khẩu mới';
    else if (v.p1 !== v.p2) next.p2 = 'Mật khẩu xác nhận không khớp';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true); setBusy(true);
    await Codi.wait(600);
    if (!mounted.current) return;
    setSaving(false); setBusy(false);
    if (!checkPassword(u.id, v.cur)) { Codi.ui.toast('Đổi mật khẩu thất bại. Vui lòng kiểm tra mật khẩu hiện tại.', { type: 'danger' }); return; }
    setPassword(u.id, v.p1);
    revokeOtherSessions(u.id);
    setV({ cur: '', p1: '', p2: '' });
    Codi.ui.toast('Đổi mật khẩu thành công! Các phiên đăng nhập khác đã được đăng xuất.', { type: 'success' });
  };
  const startRecovery = async () => {
    if (sending || saving) return;
    setSending(true); setBusy(true);
    await Codi.wait(500);
    if (!mounted.current) return;
    setSending(false); setBusy(false);
    setRecoveryEmail(u.email);
  };

  return (
    <div className="stack-4">
      <div className="stack-1"><strong className="row" style={{ gap: 8 }}><Icon name="key" className="icon-sm" /> Đổi mật khẩu</strong><p className="small muted">Cập nhật mật khẩu bảo mật cho tài khoản của bạn.</p></div>
      <form className="stack-4" noValidate onSubmit={submit}>
        <div className={`field ${errors.cur ? 'is-invalid' : ''}`}><label htmlFor="currentPassword">Mật khẩu hiện tại</label><input id="currentPassword" type="password" autoComplete="current-password" placeholder="••••••••" value={v.cur} onChange={on('cur')} /><FieldError msg={errors.cur} /></div>
        <div className={`field ${errors.p1 ? 'is-invalid' : ''}`}><label htmlFor="newPassword">Mật khẩu mới</label><input id="newPassword" type="password" autoComplete="new-password" placeholder="Ít nhất 8 ký tự" value={v.p1} onChange={on('p1')} /><FieldError msg={errors.p1} /></div>
        <div className={`field ${errors.p2 ? 'is-invalid' : ''}`}><label htmlFor="confirmPassword">Xác nhận mật khẩu mới</label><input id="confirmPassword" type="password" autoComplete="new-password" placeholder="Nhập lại mật khẩu mới" value={v.p2} onChange={on('p2')} /><FieldError msg={errors.p2} /></div>
        <div><button type="submit" className="btn btn-primary" disabled={saving || sending}>{saving ? 'Đang lưu thay đổi...' : 'Cập nhật mật khẩu'}</button></div>
      </form>
      <div className="stack-2 shell-divided">
        <p className="xsmall muted">Không nhớ mật khẩu hiện tại? Nhận mã xác thực qua email đang liên kết với tài khoản để đặt mật khẩu mới.</p>
        <div><button type="button" className="btn-link small" disabled={sending || saving} onClick={startRecovery}>{sending ? 'Đang gửi mã...' : 'Quên mật khẩu hiện tại?'}</button></div>
      </div>
    </div>
  );
}

// ───────────────────────── sessions ─────────────────────────
function SessionSettings({ revision }) {
  useCodi();
  const u = Codi.currentUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [revoking, setRevoking] = useState(null);
  const [currentId, setCurrentId] = useState(null);
  const userId = u ? u.id : null;

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    setLoading(true); setError(false); setCurrentId(null);
    Codi.wait(500).then(() => {
      if (!active) return;
      if (scenario(Codi.state, 'sessions') === 'error') setError(true);
      else setCurrentId(currentSessionId(userId));
      setLoading(false);
    });
    return () => { active = false; };
  }, [userId, revision, refresh]);

  if (!u) return null;
  const sessions = !loading && !error ? sessionsOf(u.id) : [];
  const revoke = async (s) => {
    if (loading || error || revoking || !currentId || s.id === currentId) return;
    setRevoking(s.id);
    await Codi.wait(400);
    revokeSession(s.id);
    setRevoking(null);
    Codi.ui.toast('Đã đăng xuất thiết bị.', { type: 'success' });
  };

  return (
    <div className="shell-sessions">
      <button type="button" className="shell-collapse" aria-expanded={expanded} aria-controls="settings-session-list" onClick={() => setExpanded((x) => !x)}>
        <strong className="small">Thiết Bị Đã Đăng Nhập</strong>
        <span className="row small" style={{ gap: 12 }} aria-live="polite">
          {loading ? <Skel w={56} h={14} /> : error ? 'Không thể tải' : `${sessions.length} phiên`}
          <Icon name="chevron-right" className={`icon-sm shell-chevron ${expanded ? 'is-open' : ''}`} />
        </span>
      </button>
      <div id="settings-session-list" hidden={!expanded} className="shell-session-box stack-3">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <p className="xsmall muted">Các phiên đăng nhập đang hoạt động. Một thiết bị có thể có nhiều phiên.</p>
          <button type="button" className="btn btn-ghost btn-sm" disabled={loading || revoking !== null} onClick={() => setRefresh((x) => x + 1)}>Tải lại</button>
        </div>
        {error ? <p className="small text-danger" role="alert">Không thể tải danh sách thiết bị. Vui lòng thử lại.</p>
          : loading ? <LoadingRegion label="Đang tải phiên đăng nhập…"><ListRowsSkeleton rows={2} /></LoadingRegion> : (
            <ul className="list">
              {sessions.map((s) => {
                const current = s.id === currentId;
                return (
                  <li key={s.id} className="list-row" style={{ paddingLeft: 0, paddingRight: 0, flexWrap: 'wrap' }}>
                    <span className="muted"><ShellIcon name={isMobileAgent(s.userAgent) ? 'smartphone' : 'monitor'} /></span>
                    <div className="list-main"><span className="small strong">{describeDevice(s.userAgent)}</span><span className="xsmall muted">Đăng nhập: {new Date(s.createdAt).toLocaleString('vi-VN')}</span></div>
                    {current ? <span className="xsmall strong shell-text-accent">Phiên hiện tại</span>
                      : <button type="button" className="btn btn-secondary btn-sm" disabled={revoking !== null} onClick={() => revoke(s)}>{revoking === s.id ? 'Đang đăng xuất...' : 'Đăng xuất'}</button>}
                  </li>
                );
              })}
              {sessions.length === 0 && <li className="small muted" style={{ padding: '12px 0' }}>Không có phiên đăng nhập đang hoạt động.</li>}
            </ul>
          )}
      </div>
    </div>
  );
}

// ───────────────────────── tabs ─────────────────────────
function Row({ label, children, action }) {
  return <div className="shell-setting-row"><h2 className="small strong">{label}</h2><div className="shell-setting-value">{children}</div><div>{action}</div></div>;
}

function AccountTab({ u }) {
  const [visible, setVisible] = useState(false);
  const shown = visible ? u.email : maskEmail(u.email);
  return (
    <>
      <div className="page-header"><div><h1>Thông tin tài khoản</h1><p className="muted">Quản lý tên hiển thị và email đăng nhập.</p></div></div>
      <section className="card" aria-label="Thông tin cá nhân"><div className="card-body">
        <Row label="Tên hiển thị" action={<button type="button" className="btn btn-secondary btn-sm" aria-label="Chỉnh sửa tên hiển thị"
          onClick={() => openDialog('Chỉnh sửa tên hiển thị', 'Tên này hiển thị trên hồ sơ và trong Codi.', (h, b) => <NameForm handle={h} setBusy={b} />)}><Icon name="pencil" className="icon-sm" /> Sửa</button>}>
          <span className="small strong" style={{ overflowWrap: 'anywhere' }}>{u.name}</span>
        </Row>
        <Row label="Email" action={<button type="button" className="btn btn-secondary btn-sm" aria-label="Đổi email"
          onClick={() => openDialog('Thay đổi email', 'Xác thực địa chỉ email mới trước khi thay đổi email đăng nhập.', (h, b) => <ChangeEmailForm handle={h} setBusy={b} />, () => setVisible(false))}>Đổi email</button>}>
          <span className="row small" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="strong" style={{ overflowWrap: 'anywhere' }}>{shown}</span>
            <button type="button" className="btn-link small" aria-pressed={visible} aria-label={visible ? 'Ẩn địa chỉ email' : 'Hiển thị địa chỉ email'} onClick={() => setVisible((x) => !x)}>{visible ? 'Ẩn' : 'Hiện'}</button>
            {u.emailVerified !== false && <span className="badge badge-success">Đã xác thực</span>}
          </span>
        </Row>
      </div></section>
      <p className="xsmall muted" style={{ marginTop: 12 }}>Khi đổi email, chúng tôi gửi mã xác thực đến địa chỉ mới. Email cũ vẫn dùng được cho đến khi bạn xác thực.</p>
      {u.emailVerified === false && <div className="section"><EmailVerificationCard u={u} displayEmail={shown} /></div>}
    </>
  );
}

function SecurityTab() {
  const [revision, setRevision] = useState(0);
  const openPassword = () => openDialog('Mật Khẩu & Bảo Mật', 'Đổi mật khẩu đăng nhập của bạn.', (h, b) => <ChangePasswordCard handle={h} setBusy={b} />, () => setRevision((x) => x + 1));
  return (
    <>
      <div className="page-header"><div><h1>Mật khẩu & Bảo mật</h1><p className="muted">Đổi mật khẩu đăng nhập.</p></div></div>
      <section className="card" aria-label="Mật khẩu"><div className="card-body row-between">
        <div className="stack-1"><h2 className="small strong">Mật khẩu</h2><p className="xsmall muted">Dùng mật khẩu mạnh và không dùng lại ở trang khác.</p></div>
        <button type="button" className="btn btn-secondary btn-sm" aria-label="Chỉnh sửa mật khẩu" onClick={openPassword}>Đổi mật khẩu</button>
      </div></section>
      <div className="section"><SessionSettings revision={revision} /></div>
      <div className="card section"><div className="card-body row-between">
        <div className="stack-1"><strong>Đăng xuất</strong><p className="small muted">Kết thúc phiên đăng nhập trên thiết bị này.</p></div>
        <button type="button" className="btn btn-secondary" onClick={() => endSession()}><Icon name="log-out" /> Đăng xuất</button>
      </div></div>
    </>
  );
}

function ConnectionsTab({ u }) {
  const gh = (Codi.github && Codi.github.stateFor(u.id)) || { linked: false };
  return (
    <>
      <div className="page-header"><div><h1>Tài khoản liên kết</h1><p className="muted">Kết nối tài khoản bên ngoài để Codi cá nhân hoá gợi ý khoá học và bài tập.</p></div></div>
      <section className="card" aria-label="Liên kết GitHub"><div className="card-body">
        <div className="conn-row" style={{ border: 0, padding: 0 }}>
          <div className="conn-main">
            <span className="conn-icon" aria-hidden="true"><GithubMark /></span>
            <div className="conn-text">
              <strong>GitHub</strong>
              <span className="xsmall muted">{gh.linked ? <>Đã kết nối{gh.username ? <> <span className="mono">@{gh.username}</span></> : null}</> : 'Chưa kết nối. Codi chỉ đọc repo công khai khi bạn xác nhận phân tích.'}</span>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {gh.linked ? <Link className="btn btn-secondary btn-sm" to="/profile?tab=nang-luc">Xem hồ sơ năng lực</Link> : (
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => Codi.github && Codi.github.openConnect()}>Kết nối GitHub</button>
                <Link className="btn btn-ghost btn-sm" to="/profile?tab=nang-luc">Mở Hồ sơ năng lực</Link>
              </>
            )}
          </div>
        </div>
      </div></section>
      <p className="xsmall muted" style={{ marginTop: 12 }}>Thông tin kết nối chỉ dùng trong tài khoản Codi của bạn. Bạn ngắt kết nối bất kỳ lúc nào — dữ liệu phân tích sẽ bị xoá.</p>
    </>
  );
}

const TABS = [
  { id: 'account', href: '/settings', label: 'Thông tin tài khoản', icon: 'user' },
  { id: 'security', href: '/settings?tab=security', label: 'Mật khẩu & Bảo mật', icon: 'key' },
  { id: 'connections', href: '/settings?tab=connections', label: 'Tài khoản liên kết', icon: 'link' },
];

export function SettingsPage({ query }) {
  useCodi();
  const u = Codi.currentUser();
  const tab = query.tab === 'security' || query.tab === 'connections' ? query.tab : 'account';

  // Esc closes settings (real: router.push('/dashboard')) unless a dialog handled the key first.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.overlay')) return;
      Codi.go(Codi.homeFor(Codi.role()));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!u) return null; // the role guard in App renders the sign-in page first
  return (
    <div className="workspace shell-settings">
      <aside className="workspace-nav" aria-label="Menu cài đặt">
        <Link to="/profile" className="shell-settings-me">
          <UserAvatar user={u} />
          <span className="stack-1" style={{ minWidth: 0 }}><span className="small strong od-truncate">{u.name}</span><span className="xsmall muted row" style={{ gap: 4 }}>Sửa Hồ Sơ <Icon name="pencil" className="icon-sm" /></span></span>
        </Link>
        <nav aria-label="Cài đặt tài khoản">
          <div className="nav-label">Tài khoản</div>
          {TABS.map((t) => <Link key={t.id} to={t.href} aria-current={t.id === tab ? 'page' : undefined}><Icon name={t.icon} /><span>{t.label}</span></Link>)}
        </nav>
      </aside>
      <div className="workspace-content"><div className="shell-settings-body">
        {tab === 'security' ? <SecurityTab key="security" /> : tab === 'connections' ? <ConnectionsTab u={u} /> : <AccountTab key="account" u={u} />}
      </div></div>
    </div>
  );
}

