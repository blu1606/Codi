/**
 * Forgot / reset password — port of the real app's app/forgot-password/page.tsx (6-digit email OTP, two steps in
 * one card), app/reset-password/page.tsx (token link with invalid-link state) and
 * components/settings/account-reset-password-form.tsx (/reset-password?source=account, reached from
 * "Quên mật khẩu hiện tại?" in settings).
 *
 * Backend (Better Auth): email-otp/send-verification-otp {type:'forget-password'} + email-otp/reset-password;
 * reset-password {token,newPassword}; account/password/reset-status + account/password/reset (the grant cookie is
 * set by account/password/verify-reset in settings). Without Resend the codes are printed to the backend console.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { api } from '../../lib/api';
import { ShellIcon } from './shell-ui';
import OtpInput from './otp-input';
import { FieldError, useMounted } from './auth';
import { EMAIL_RE, authCode, authMessage } from './account-store';

const sendResetCode = (email) => api.post('/api/auth/email-otp/send-verification-otp', { email, type: 'forget-password' });

const Card = ({ children, center }) => (
  <div className="auth-wrap"><div className="auth-card card"><div className="card-body stack-4" style={center ? { textAlign: 'center' } : undefined}>{children}</div></div></div>
);
const Head = ({ icon, title, children }) => (
  <div className="stack-2 shell-auth-head">
    {icon && <span className="shell-icon-bubble" aria-hidden="true"><ShellIcon name={icon} /></span>}
    <h1 style={{ fontSize: 'var(--text-xl)' }}>{title}</h1>
    {children && <p className="small muted">{children}</p>}
  </div>
);

/** New password + confirmation fields with the real zod messages. Returns errors or null. */
function validatePasswords(p1, p2, confirmEmpty = 'Vui lòng xác nhận mật khẩu mới') {
  const errors = {};
  if (p1.length < 8) errors.p1 = 'Mật khẩu mới phải có ít nhất 8 ký tự';
  if (p2.length < 8) errors.p2 = confirmEmpty;
  else if (p1 !== p2) errors.p2 = 'Mật khẩu xác nhận không khớp';
  return Object.keys(errors).length ? errors : null;
}
function PasswordFields({ v, setV, errors, disabled }) {
  return (
    <>
      <div className={`field ${errors.p1 ? 'is-invalid' : ''}`}><label htmlFor="np1">Mật khẩu mới</label>
        <input id="np1" type="password" autoComplete="new-password" placeholder="Ít nhất 8 ký tự" value={v.p1} disabled={disabled} onChange={(e) => setV({ ...v, p1: e.target.value })} /><FieldError msg={errors.p1} /></div>
      <div className={`field ${errors.p2 ? 'is-invalid' : ''}`}><label htmlFor="np2">Xác nhận mật khẩu mới</label>
        <input id="np2" type="password" autoComplete="new-password" placeholder="Nhập lại mật khẩu mới" value={v.p2} disabled={disabled} onChange={(e) => setV({ ...v, p2: e.target.value })} /><FieldError msg={errors.p2} /></div>
    </>
  );
}

// ───────────────────────── /forgot-password ─────────────────────────
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(null);
  const [emailErr, setEmailErr] = useState(null);
  const [sending, setSending] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpErr, setOtpErr] = useState(null);
  const [v, setV] = useState({ p1: '', p2: '' });
  const [errors, setErrors] = useState({});
  const [resetting, setResetting] = useState(false);
  const mounted = useMounted();

  const request = async (e) => {
    e.preventDefault();
    if (sending) return;
    const addr = email.trim();
    if (!EMAIL_RE.test(addr)) { setEmailErr('Vui lòng nhập địa chỉ email hợp lệ'); return; }
    setEmailErr(null); setSending(true);
    try {
      await sendResetCode(addr);
    } catch (err) {
      if (!mounted.current) return;
      setSending(false);
      Codi.ui.toast(authMessage(err, 'Không thể gửi mã OTP lúc này. Vui lòng thử lại.'), { type: 'danger' });
      return;
    }
    if (!mounted.current) return;
    setSending(false);
    setSubmitted(addr); setOtp(''); setOtpErr(null); setV({ p1: '', p2: '' }); setErrors({});
    Codi.ui.toast('Mã OTP gồm 6 chữ số đã được gửi tới email của bạn!', { type: 'success' });
  };
  const resend = async () => {
    try {
      await sendResetCode(submitted);
    } catch (err) {
      if (mounted.current) Codi.ui.toast(authMessage(err, 'Không thể gửi lại mã OTP lúc này.'), { type: 'danger' });
      return false;
    }
    if (!mounted.current) return false;
    Codi.ui.toast('Đã gửi mã OTP mới! Vui lòng kiểm tra email.', { type: 'success' });
    return true;
  };
  const reset = async (e) => {
    e.preventDefault();
    if (resetting) return;
    if (otp.length !== 6) { setOtpErr('Vui lòng nhập đủ 6 chữ số mã OTP'); return; }
    const errs = validatePasswords(v.p1, v.p2);
    setErrors(errs || {});
    if (errs) return;
    setOtpErr(null); setResetting(true);
    try {
      // Unknown emails fail like a wrong code, so the page never reveals whether an account exists.
      await api.post('/api/auth/email-otp/reset-password', { email: submitted, otp, password: v.p1 });
    } catch (err) {
      if (!mounted.current) return;
      setResetting(false);
      const c = authCode(err);
      setOtpErr(c === 'TOO_MANY_ATTEMPTS' ? 'Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã.'
        : c === 'OTP_EXPIRED' ? 'Mã OTP đã hết hạn. Vui lòng gửi lại mã.'
          : c === 'PASSWORD_TOO_SHORT' || c === 'PASSWORD_TOO_LONG' || err.status === 429 ? authMessage(err) : 'Mã OTP không hợp lệ hoặc đã hết hạn 2 phút.');
      return;
    }
    if (!mounted.current) return;
    setResetting(false);
    // Every session of that account is revoked; if it was this browser's, the app is now signed out.
    await Codi.refreshSession().catch(() => {});
    Codi.ui.toast('Đặt lại mật khẩu thành công! Đang chuyển hướng về trang đăng nhập...', { type: 'success' });
    setTimeout(() => Codi.go('/login'), 1200);
  };

  if (submitted) {
    return (
      <Card>
        <Head icon="key" title="Đặt lại mật khẩu">Nhập mã OTP gồm 6 chữ số đã gửi tới <strong>{submitted}</strong> (hiệu lực 2 phút) và tạo mật khẩu mới.</Head>
        <div className="stack-2">
          <span className="field-label" style={{ textAlign: 'center' }}>Mã xác thực OTP</span>
          <OtpInput key={submitted} value={otp} onChange={(x) => { setOtp(x); setOtpErr(null); }} onResend={resend} disabled={resetting} error={otpErr} />
        </div>
        <form className="stack-4" noValidate onSubmit={reset}>
          <PasswordFields v={v} setV={setV} errors={errors} disabled={resetting} />
          <button className="btn btn-primary btn-block" type="submit" disabled={resetting || otp.length !== 6}>{resetting ? 'Đang cập nhật...' : 'Cập nhật mật khẩu mới'}</button>
        </form>
        <button type="button" className="btn-link small" onClick={() => setSubmitted(null)}>← Đổi địa chỉ email khác</button>
      </Card>
    );
  }
  return (
    <Card>
      <Head icon="mail" title="Quên mật khẩu?">Nhập email của bạn để nhận mã OTP 6 chữ số khôi phục mật khẩu.</Head>
      <form className="stack-4" noValidate onSubmit={request}>
        <div className={`field ${emailErr ? 'is-invalid' : ''}`}>
          <label htmlFor="forgot-email">Email tài khoản</label>
          <input id="forgot-email" type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sending} />
          <FieldError msg={emailErr} />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={sending}>{sending ? 'Đang gửi mã OTP...' : 'Nhận mã OTP qua Email'}</button>
      </form>
      <Link to="/login" className="small" style={{ textAlign: 'center' }}>← Quay lại trang Đăng nhập</Link>
    </Card>
  );
}

// ───────────────────────── /reset-password?token= ─────────────────────────
// Token link (Better Auth reset-password). An invalid or expired token shows the server error state.
function TokenReset({ token }) {
  const [v, setV] = useState({ p1: '', p2: '' });
  const [errors, setErrors] = useState({});
  const [errorMsg, setErrorMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const mounted = useMounted();
  if (!token) {
    return (
      <Card center>
        <h1 className="text-danger" style={{ fontSize: 'var(--text-xl)' }}>Liên kết không hợp lệ</h1>
        <p className="small muted">Không tìm thấy mã token đặt lại mật khẩu trong liên kết. Vui lòng kiểm tra lại liên kết trong email của bạn.</p>
        <Link className="btn btn-primary btn-block" to="/forgot-password">Yêu cầu liên kết mới</Link>
      </Card>
    );
  }
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const errs = validatePasswords(v.p1, v.p2, 'Vui lòng nhập lại mật khẩu');
    setErrors(errs || {});
    if (errs) return;
    setBusy(true);
    try {
      await api.post('/api/auth/reset-password', { token, newPassword: v.p1 });
    } catch (err) {
      if (!mounted.current) return;
      setBusy(false);
      const msg = authMessage(err, 'Không thể đặt lại mật khẩu. Token có thể đã hết hạn.');
      setErrorMsg(msg); Codi.ui.toast(msg, { type: 'danger' }); return;
    }
    if (!mounted.current) return;
    setBusy(false);
    Codi.ui.toast('Đặt lại mật khẩu thành công! Đang chuyển đến trang đăng nhập...', { type: 'success' });
    setTimeout(() => Codi.go('/login'), 1500);
  };
  return (
    <Card>
      <div className="stack-1" style={{ textAlign: 'center' }}><h1 style={{ fontSize: 'var(--text-xl)' }}>Đặt lại mật khẩu</h1><p className="small muted">Tạo mật khẩu mới cho tài khoản của bạn</p></div>
      {errorMsg && <p className="shell-error-box" role="alert">{errorMsg}</p>}
      <form className="stack-4" noValidate onSubmit={submit}>
        <PasswordFields v={v} setV={setV} errors={errors} disabled={busy} />
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}</button>
      </form>
    </Card>
  );
}

// ───────────────────────── /reset-password?source=account ─────────────────────────
function AccountReset() {
  useCodi();
  const [loading, setLoading] = useState(true);
  const [grant, setGrant] = useState(null);
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useMounted();

  useEffect(() => {
    let active = true;
    // The grant is an httpOnly cookie set when the settings OTP was verified; the server says whether it is valid.
    api.get('/api/auth/account/password/reset-status')
      .then((r) => { if (active) setGrant(r && r.email ? { email: r.email } : null); })
      .catch(() => { if (active) setGrant(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !grant) return;
    setError(null);
    if (p1.length < 8 || p1.length > 128) { setError('Mật khẩu mới phải có từ 8 đến 128 ký tự.'); return; }
    if (p1 !== p2) { setError('Mật khẩu xác nhận không khớp.'); return; }
    setBusy(true);
    try {
      await api.post('/api/auth/account/password/reset', { newPassword: p1 });
    } catch (err) {
      if (!mounted.current) return;
      setBusy(false);
      if (authCode(err) === 'INVALID_RESET_GRANT') { setGrant(null); setError('Không thể đặt lại mật khẩu. Vui lòng thử lại.'); return; }
      setError(authMessage(err, 'Không thể đặt lại mật khẩu. Vui lòng thử lại.'));
      return;
    }
    if (!mounted.current) return;
    setBusy(false);
    // The endpoint revokes every session, so the learner signs in again with the new password.
    await Codi.refreshSession().catch(() => {});
    Codi.ui.toast('Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.', { type: 'success' });
    Codi.go('/login');
  };

  return (
    <Card>
      <div className="stack-1" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 'var(--text-xl)' }}>Đặt mật khẩu mới</h1>
        <p className="small muted" style={{ overflowWrap: 'anywhere' }}>{loading ? 'Đang kiểm tra xác thực…' : grant ? `Email đã được xác thực: ${grant.email}` : 'Vui lòng xác thực email trong phần Cài đặt trước khi đặt mật khẩu mới.'}</p>
      </div>
      {error && <p className="shell-error-box" role="alert">{error}</p>}
      {!loading && (grant ? (
        <form className="stack-4" noValidate onSubmit={submit}>
          <div className="field"><label htmlFor="new-password">Mật khẩu mới</label><input id="new-password" type="password" autoComplete="new-password" maxLength={128} autoFocus disabled={busy} value={p1} onChange={(e) => setP1(e.target.value)} /></div>
          <div className="field"><label htmlFor="confirm-new-password">Xác nhận mật khẩu mới</label><input id="confirm-new-password" type="password" autoComplete="new-password" maxLength={128} disabled={busy} value={p2} onChange={(e) => setP2(e.target.value)} /></div>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}</button>
          <p className="xsmall muted">Sau khi đổi mật khẩu, bạn sẽ được đăng xuất khỏi các thiết bị.</p>
        </form>
      ) : <Link className="btn btn-primary btn-block" to="/settings">Quay lại Cài đặt</Link>)}
    </Card>
  );
}

export function ResetPasswordPage({ query }) {
  return query.source === 'account' ? <AccountReset /> : <TokenReset token={query.token || ''} />;
}
