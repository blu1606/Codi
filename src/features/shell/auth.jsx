/**
 * Auth UI — port of the real app's sign-in-form.tsx, sign-up-form.tsx, otp-input.tsx, google-button.tsx and
 * github-button.tsx, keeping the rebuild's gated sign-in modal (Codi.openSignIn(intent, opts)) and the simulated
 * OAuth account chooser (now for Google and GitHub).
 *
 * One view store (authView) drives both the full pages (/login, /register) and the modal. Forms keep their own
 * field state; authView carries only the mode, the email/name between steps, the course context and the intent.
 * Importing this module installs the real Codi.openSignIn.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Avatar, Icon } from '../../components/ui/primitives';
import { GithubMark, ShellIcon } from './shell-ui';
import OtpInput from './otp-input';
import { EMAIL_RE, OTP_MAX_TRIES, checkOtp, checkPassword, setPassword, startSession } from './account-store';
import { safeNext } from './github-onboarding-page';

const DEMO = [['minhanh@codi.vn', 'Học viên'], ['quochuy@codi.vn', 'Giảng viên'], ['giabao@codi.vn', 'Quản trị viên'], ['kimoanh@codi.vn', 'Tài khoản bị vô hiệu hoá']];
const REMEMBER_EMAIL_KEY = 'codi_remember_email';
const freshView = (extra) => ({ mode: 'login', email: '', name: '', error: null, courseTitle: null, reason: null, rev: 0, social: null, socialFrom: 'login', socialPick: null, ...extra });

// ───────────────────────── view store ─────────────────────────
let authView = freshView();
let authModal = null;
let authIntent = null;
let pendingPassword = '';
let ver = 0;
const subs = new Set();
const bump = () => { ver += 1; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
function useAuthView() {
  useSyncExternalStore(subscribe, () => ver);
  return authView;
}

const PROVIDERS = {
  google: { label: 'Google', Mark: GoogleMark },
  github: { label: 'GitHub', Mark: ({ className }) => <GithubMark className={className || 'icon'} /> },
};
const authTitle = () => ({ register: 'Tạo tài khoản', otp: 'Xác thực tài khoản', social: `Tiếp tục với ${(PROVIDERS[authView.social] || PROVIDERS.google).label}` }[authView.mode] || 'Chào mừng trở lại!');
const isAuthPagePath = () => /^\/(login|register)$/.test(Codi.path());

/** Re-renders the auth view (modal title included); rev remounts the active form. */
function refreshAuth() {
  authView.rev += 1;
  if (authModal) authModal.update({ title: authTitle() });
  bump();
}

const readRemembered = () => { try { return localStorage.getItem(REMEMBER_EMAIL_KEY) || ''; } catch { return ''; } };
function writeRemembered(on, email) {
  try { if (on) localStorage.setItem(REMEMBER_EMAIL_KEY, email); else localStorage.removeItem(REMEMBER_EMAIL_KEY); } catch { /* restricted storage */ }
}

// Google "G" brand mark (official four colours).
export function GoogleMark({ className = 'icon google-mark' }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#FBBC05" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#EA4335" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#34A853" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#4285F4" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

// ───────────────────────── actions ─────────────────────────
/**
 * Signs in, closes the modal and continues: pending intent, ?next=, or the role home.
 * A brand-new account (`isNew`) first gets the optional "Kết nối GitHub" step, which then continues to the same
 * destination. A pending intent (e.g. "Thêm vào giỏ" from the gated modal) wins: the learner finishes that action and
 * finds the GitHub prompt on the dashboard instead.
 */
function completeAuth(userId, { delay = 0, isNew = false } = {}) {
  startSession(userId);
  const intent = authIntent; authIntent = null;
  const wasModal = !!authModal;
  if (authModal) authModal.close();
  if (intent) { intent(); return; }
  const here = Codi.path() + (window.location.search || '');
  if (wasModal && !isNew) return;
  const go = () => {
    const u = Codi.currentUser();
    if (!u) return;
    const next = wasModal ? here : safeNext(Codi.query().next);
    if (isNew && u.role === 'learner' && Codi.github && Codi.github.onboardingHref) Codi.go(Codi.github.onboardingHref(next));
    else Codi.go(next);
  };
  if (delay) setTimeout(go, delay); else go();
}

function setMode(mode) {
  authView.mode = mode; authView.error = null;
  if (isAuthPagePath() && !authModal && mode !== 'otp') { bump(); Codi.go('/' + (mode === 'register' ? 'register' : 'login')); } else refreshAuth();
}

// Simulated OAuth (no real Google/GitHub connection): choose an account, then consent.
function startSocial(provider) {
  if (authView.mode !== 'social') authView.socialFrom = authView.mode === 'register' ? 'register' : 'login';
  authView.mode = 'social'; authView.social = provider; authView.socialPick = null; authView.error = null; refreshAuth();
}
const leaveSocial = (notice) => { authView.mode = authView.socialFrom || 'login'; authView.socialPick = null; authView.error = notice; refreshAuth(); };
function socialCancel() {
  const p = PROVIDERS[authView.social].label;
  leaveSocial({ type: 'info', retry: authView.social, title: `Bạn đã huỷ đăng nhập bằng ${p}`, body: 'Chưa có thay đổi nào. Bạn có thể thử lại hoặc dùng email và mật khẩu.' });
}
function socialDeny() {
  const p = PROVIDERS[authView.social].label;
  leaveSocial({ type: 'warn', retry: authView.social, title: `Codi chưa được ${p} cấp quyền`, body: `Codi cần tên và email để nhận ra tài khoản của bạn. Hãy thử lại và chọn "Cho phép", hoặc dùng email và mật khẩu.` });
}
function socialPick(email, name) { authView.socialPick = { email, name }; authView.error = null; refreshAuth(); }
function socialBack() { authView.socialPick = null; authView.error = null; refreshAuth(); }
function socialAllow() {
  const pick = authView.socialPick;
  const provider = authView.social;
  if (!pick) return;
  let u = Codi.db().users.find((x) => x.email.toLowerCase() === pick.email);
  if (u && u.status !== 'active') {
    authView.socialPick = null;
    authView.error = { title: 'Tài khoản đã bị vô hiệu hoá', body: 'Tài khoản Codi gắn với email này hiện không thể đăng nhập. Liên hệ hotro@codi.vn nếu bạn cho rằng đây là nhầm lẫn.' };
    refreshAuth(); return;
  }
  authView.error = null; authView.socialPick = null;
  const isNew = !u;
  if (!u) {
    const now = new Date().toISOString();
    u = { id: 'usr-new-' + Date.now().toString(36), name: pick.name, email: pick.email, role: 'learner', status: 'active', authProvider: provider, emailVerified: true, image: null, createdAt: now, lastActive: now };
    const created = u;
    Codi.set((s) => { s.db.users.push(created); }, { render: false });
    Codi.ui.toast(`Đã tạo tài khoản Codi cho ${pick.email}.`, { type: 'success' });
  }
  // Signing in with GitHub links that GitHub account to the Codi account (Better Auth social account).
  if (provider === 'github' && Codi.github && Codi.github.markLinked) Codi.github.markLinked(u.id, pick);
  Codi.ui.toast('Đăng nhập thành công!', { type: 'success' });
  completeAuth(u.id, { isNew });
}

const FieldError = ({ msg, id }) => (msg ? <p className="field-error" id={id}><Icon name="alert-circle" className="icon-sm" /><span>{msg}</span></p> : null);
const formValues = (form) => { const v = {}; new FormData(form).forEach((val, k) => { v[k] = val; }); return v; };

/** Tracks mount so async submit handlers do not update a closed modal. */
function useMounted() {
  const ref = useRef(true);
  useEffect(() => { ref.current = true; return () => { ref.current = false; }; }, []);
  return ref;
}

// ───────────────────────── forms ─────────────────────────
function AuthAlert({ err }) {
  if (!err) return null;
  const P = err.retry ? PROVIDERS[err.retry] : null;
  return (
    <Alert type={err.type || 'danger'} title={err.title} body={err.body}
      actions={P ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => startSocial(err.retry)}><P.Mark /> Thử lại với {P.label}</button> : null} />
  );
}

/** Real google-button / github-button: "Đang kết nối..." while the provider opens. */
function SocialButton({ provider, text }) {
  const [busy, setBusy] = useState(false);
  const mounted = useMounted();
  const P = PROVIDERS[provider];
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    await Codi.wait(400);
    if (!mounted.current) return;
    setBusy(false);
    startSocial(provider);
  };
  return (
    <button className="btn btn-secondary btn-block" type="button" onClick={onClick} disabled={busy}>
      {busy ? <Icon name="loader" className="icon-sm shell-spin" /> : <P.Mark />}<span>{busy ? 'Đang kết nối...' : text}</span>
    </button>
  );
}

function LoginForm({ view }) {
  const remembered = readRemembered();
  const [email, setEmail] = useState(view.email || remembered);
  const [password, setPw] = useState('');
  const [remember, setRemember] = useState(!!remembered);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(view.error);
  const [busy, setBusy] = useState(false);
  const mounted = useMounted();

  const fill = (e) => { setEmail(e); setPw('codi123'); setErrors({}); };
  const submit = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    const addr = email.trim();
    const next = {};
    if (!EMAIL_RE.test(addr)) next.email = 'Địa chỉ email không hợp lệ';
    if (!password) next.password = 'Vui lòng nhập mật khẩu';
    setErrors(next);
    if (Object.keys(next).length) return;
    setServerError(null);
    setBusy(true);
    await Codi.wait(500);
    if (!mounted.current) return;
    setBusy(false);
    const u = Codi.db().users.find((x) => x.email.toLowerCase() === addr.toLowerCase());
    if (!u || !checkPassword(u.id, password)) {
      const msg = 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.';
      setServerError({ body: msg }); Codi.ui.toast(msg, { type: 'danger' }); return;
    }
    if (u.status !== 'active') {
      setServerError({ title: 'Tài khoản đã bị vô hiệu hoá', body: 'Tài khoản này hiện không thể đăng nhập. Liên hệ hotro@codi.vn nếu bạn cho rằng đây là nhầm lẫn.' });
      return;
    }
    writeRemembered(remember, addr);
    authView.email = addr;
    Codi.ui.toast('Đăng nhập thành công!', { type: 'success' });
    completeAuth(u.id);
  };

  return (
    <form className="stack-4" noValidate onSubmit={submit}>
      <AuthAlert err={serverError} />
      <div className={`field ${errors.email ? 'is-invalid' : ''}`}>
        <label htmlFor="login-email">Địa chỉ Email</label>
        <input id="login-email" name="email" type="email" autoComplete="email" placeholder="student@university.edu" value={email}
          onChange={(e) => setEmail(e.target.value)} aria-invalid={errors.email ? true : undefined} aria-describedby={errors.email ? 'login-email-err' : undefined} />
        <FieldError id="login-email-err" msg={errors.email} />
      </div>
      <div className={`field ${errors.password ? 'is-invalid' : ''}`}>
        <label htmlFor="login-pass">Mật khẩu</label>
        <input id="login-pass" name="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password}
          onChange={(e) => setPw(e.target.value)} aria-invalid={errors.password ? true : undefined} aria-describedby={errors.password ? 'login-pass-err' : undefined} />
        <FieldError id="login-pass-err" msg={errors.password} />
      </div>
      <div className="row-between">
        <label className="check" htmlFor="remember-email"><input id="remember-email" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Ghi nhớ email</label>
        <Link to="/forgot-password" className="small" data-close="">Quên mật khẩu?</Link>
      </div>
      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
      <div className="or-divider">Hoặc tiếp tục với</div>
      <div className="stack-2">
        <SocialButton provider="google" text="Tiếp tục với Google" />
        <SocialButton provider="github" text="Tiếp tục với GitHub" />
      </div>
      <p className="small muted" style={{ textAlign: 'center' }}>Chưa có tài khoản? <button type="button" className="btn-link" onClick={() => setMode('register')}>Đăng ký ngay</button></p>
      <div className="demo-accounts">
        <span className="xsmall strong">Tài khoản thử nghiệm · mật khẩu codi123</span>
        {DEMO.map(([e, l]) => <button key={e} type="button" onClick={() => fill(e)}>{l}: {e}</button>)}
      </div>
    </form>
  );
}

function RegisterForm({ view }) {
  const [v, setV] = useState({ name: view.name || '', email: view.email || '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(view.error);
  const [busy, setBusy] = useState(false);
  const mounted = useMounted();
  const on = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    const name = v.name.trim(); const email = v.email.trim();
    const next = {};
    if (name.length < 2) next.name = 'Tên người dùng phải có ít nhất 2 ký tự';
    if (!EMAIL_RE.test(email)) next.email = 'Địa chỉ email không hợp lệ';
    if (v.password.length < 8) next.password = 'Mật khẩu phải có ít nhất 8 ký tự';
    setErrors(next);
    if (Object.keys(next).length) return;
    setServerError(null);
    setBusy(true);
    await Codi.wait(600);
    if (!mounted.current) return;
    setBusy(false);
    if (Codi.db().users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      setServerError({ title: 'Email đã được dùng', body: 'Email này đã có tài khoản. Hãy đăng nhập hoặc dùng "Quên mật khẩu?".' });
      Codi.ui.toast('Đăng ký thất bại', { type: 'danger' });
      return;
    }
    authView.name = name; authView.email = email; pendingPassword = v.password;
    Codi.ui.toast('Đăng ký thành công! Mã OTP xác thực 6 số đã được gửi.', { type: 'success' });
    setMode('otp');
  };

  return (
    <div className="stack-4">
      <AuthAlert err={serverError} />
      <div className="stack-2">
        <SocialButton provider="google" text="Đăng ký với Google" />
        <SocialButton provider="github" text="Đăng ký với GitHub" />
      </div>
      <div className="or-divider">Hoặc đăng ký bằng Email</div>
      <form className="stack-4" noValidate onSubmit={submit}>
        <div className={`field ${errors.name ? 'is-invalid' : ''}`}><label htmlFor="reg-name">Họ và tên</label>
          <input id="reg-name" name="name" autoComplete="name" placeholder="Nguyễn Văn A" value={v.name} onChange={on('name')} aria-invalid={errors.name ? true : undefined} /><FieldError msg={errors.name} /></div>
        <div className={`field ${errors.email ? 'is-invalid' : ''}`}><label htmlFor="reg-email">Email</label>
          <input id="reg-email" name="email" type="email" autoComplete="email" placeholder="name@example.com" value={v.email} onChange={on('email')} aria-invalid={errors.email ? true : undefined} /><FieldError msg={errors.email} /></div>
        <div className={`field ${errors.password ? 'is-invalid' : ''}`}><label htmlFor="reg-pass">Mật khẩu</label>
          <input id="reg-pass" name="password" type="password" autoComplete="new-password" placeholder="Ít nhất 8 ký tự" value={v.password} onChange={on('password')} aria-invalid={errors.password ? true : undefined} /><FieldError msg={errors.password} /></div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản'}</button>
      </form>
      <p className="small muted" style={{ textAlign: 'center' }}>Đã có tài khoản? <button type="button" className="btn-link" onClick={() => setMode('login')}>Đăng nhập</button></p>
    </div>
  );
}

function OtpStep({ view }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const tries = useRef(0);
  const deadline = useRef(0);
  const mounted = useMounted();

  const verify = async () => {
    if (busy || locked) return;
    if (code.length !== 6) { setErr('Vui lòng nhập đủ 6 chữ số OTP'); return; }
    setErr(null); setBusy(true);
    await Codi.wait(500);
    if (!mounted.current) return;
    setBusy(false);
    const r = checkOtp(code, deadline.current);
    if (r === 'expired') { setErr('Mã OTP đã hết hạn. Vui lòng gửi lại mã.'); return; }
    if (r === 'wrong') {
      tries.current += 1;
      if (tries.current >= OTP_MAX_TRIES) { setLocked(true); setErr('Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã.'); } else setErr('Mã OTP không chính xác hoặc đã hết hạn 2 phút.');
      return;
    }
    const id = 'usr-new-' + Date.now().toString(36);
    const now = new Date().toISOString();
    const user = { id, name: authView.name, email: authView.email, role: 'learner', status: 'active', emailVerified: true, image: null, createdAt: now, lastActive: now };
    Codi.set((s) => { s.db.users.push(user); }, { render: false });
    setPassword(id, pendingPassword); pendingPassword = '';
    Codi.ui.toast('Xác thực email thành công! Đang chuyển hướng vào hệ thống...', { type: 'success' });
    completeAuth(id, { delay: 1000, isNew: true });
  };
  const resend = async () => {
    await Codi.wait(500);
    if (!mounted.current) return false;
    tries.current = 0; setLocked(false); setErr(null);
    Codi.ui.toast('Đã gửi mã OTP mới! Vui lòng kiểm tra email.', { type: 'success' });
    return true;
  };

  return (
    <form className="stack-4" noValidate onSubmit={(e) => { e.preventDefault(); verify(); }}>
      <div className="stack-2 shell-auth-head">
        <span className="shell-icon-bubble" aria-hidden="true"><ShellIcon name="shield-check" /></span>
        <p className="small muted">Mã OTP gồm 6 chữ số đã được gửi tới email <strong>{view.email}</strong>. Mã có hiệu lực trong 2 phút.</p>
      </div>
      <OtpInput value={code} onChange={(x) => { setCode(x); setErr(null); }} onResend={resend} disabled={busy || locked} error={err} autoFocus
        onDeadline={(d) => { deadline.current = d; }} />
      <button className="btn btn-primary btn-block" type="submit" disabled={code.length !== 6 || busy || locked}>{busy ? 'Đang xác thực...' : 'Xác thực và hoàn tất'}</button>
      <p className="small muted" style={{ textAlign: 'center' }}>Nhập nhầm email? <button type="button" className="btn-link" onClick={() => setMode('register')}>Đăng ký lại</button></p>
    </form>
  );
}

// Simulated provider chooser. An existing Codi email signs straight in; a new email creates a learner account
// without OTP (the provider already verified it); a deactivated account is refused like the password flow.
const SOCIAL_ACCOUNTS = {
  google: [{ email: 'minhanh@codi.vn', name: 'Minh Anh' }, { email: 'nam.tran.dev@gmail.com', name: 'Trần Văn Nam' }, { email: 'kimoanh@codi.vn', name: 'Kim Oanh' }],
  github: [{ email: 'minhanh@codi.vn', name: 'Minh Anh' }, { email: 'quocanh@codi.vn', name: 'Quốc Anh' }, { email: 'hoang.le.gh@gmail.com', name: 'Lê Minh Hoàng' }],
};
function SocialForm({ view }) {
  useCodi();
  const provider = view.social || 'google';
  const P = PROVIDERS[provider];
  const err = view.error;
  const pick = view.socialPick;
  if (pick) {
    return (
      <div className="stack-4">
        <div className="google-head"><P.Mark /><p className="small muted">Codi muốn truy cập Tài khoản {P.label} của bạn</p></div>
        {err && <Alert type="danger" title={err.title} body={err.body} />}
        <div className="google-who"><Avatar user={{ name: pick.name }} size="sm" /><span className="google-account-body"><span className="google-account-name">{pick.name}</span><span className="google-account-email od-truncate">{pick.email}</span></span></div>
        <div className="stack-2"><span className="small strong">Codi sẽ được phép:</span>
          <ul className="google-scopes">
            <li><Icon name="user" className="icon-sm" /><span>{provider === 'github' ? 'Xem hồ sơ công khai và ảnh đại diện của bạn' : 'Xem tên và ảnh đại diện của bạn'}</span></li>
            <li><Icon name="mail" className="icon-sm" /><span>Xem địa chỉ email của bạn</span></li>
          </ul>
          <p className="xsmall muted">{provider === 'github' ? 'Codi không đọc repo riêng tư và không ghi gì lên GitHub.' : 'Codi không đọc thư, danh bạ hay tệp trên Google Drive của bạn.'} Bản thử nghiệm không kết nối {P.label} thật.</p></div>
        <div className="google-consent-actions">
          <button type="button" className="btn btn-secondary" onClick={socialDeny}>Từ chối</button>
          <button type="button" className="btn btn-primary" onClick={socialAllow}>Cho phép</button>
        </div>
        <button type="button" className="btn btn-ghost btn-block" onClick={socialBack}><Icon name="arrow-left" className="icon-sm" /> Chọn tài khoản khác</button>
      </div>
    );
  }
  return (
    <div className="stack-4">
      <div className="google-head"><P.Mark /><p className="small muted">Chọn tài khoản {P.label} để tiếp tục vào Codi</p></div>
      {err && <Alert type="danger" title={err.title} body={err.body} />}
      <ul className="google-accounts">
        {SOCIAL_ACCOUNTS[provider].map((a) => {
          const u = Codi.db().users.find((x) => x.email.toLowerCase() === a.email);
          const name = u ? u.name : a.name;
          return (
            <li key={a.email}>
              <button type="button" className="google-account" onClick={() => socialPick(a.email, name)}>
                <Avatar user={{ name }} size="sm" />
                <span className="google-account-body"><span className="google-account-name">{name}</span><span className="google-account-email od-truncate">{a.email}</span></span>
                <span className="google-account-tag">{u ? 'Đã có tài khoản Codi' : 'Tài khoản mới'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="xsmall muted">Codi chỉ nhận tên, email và ảnh đại diện từ {P.label}. Bản thử nghiệm không kết nối {P.label} thật.</p>
      <button type="button" className="btn btn-ghost btn-block" onClick={socialCancel}>Huỷ</button>
    </div>
  );
}

function AuthBody() {
  const view = useAuthView();
  const key = view.mode + ':' + view.rev;
  if (view.mode === 'register') return <RegisterForm key={key} view={view} />;
  if (view.mode === 'otp') return <OtpStep key={key} view={view} />;
  if (view.mode === 'social') return <SocialForm key={key} view={view} />;
  return <LoginForm key={key} view={view} />;
}

const DESCRIPTION = { login: 'Đăng nhập để tiếp tục học tập và thanh toán', register: 'Đăng ký tài khoản Codi mới' };

/** Course context box (real sign-in-form "Khoá học đang chọn") + intent reason. */
function IntentBox({ view }) {
  if (!(view.mode === 'login' || view.mode === 'register')) return null;
  if (view.courseTitle) {
    return (
      <div className="shell-intent-box">
        <span className="xsmall muted">Khoá học đang chọn</span>
        <strong className="small od-truncate">{view.courseTitle}</strong>
        {view.reason && <span className="xsmall muted">{view.reason}</span>}
      </div>
    );
  }
  return view.reason ? <p className="small muted">{view.reason}</p> : null;
}

function AuthModalBody() {
  const view = useAuthView();
  return (
    <>
      {DESCRIPTION[view.mode] && <p className="small muted" style={{ marginTop: -8 }}>{DESCRIPTION[view.mode]}</p>}
      <IntentBox view={view} />
      <AuthBody />
    </>
  );
}

// Gated sign-in modal with optional course context (Flow L2, S03).
export function openSignIn(intent, opts) {
  const o = typeof opts === 'string' ? { reason: opts } : (opts || {});
  authIntent = typeof intent === 'function' ? intent : null;
  authView = freshView({ courseTitle: o.courseTitle || null, reason: o.reason || null });
  if (authModal) authModal.close();
  bump();
  const handle = Codi.ui.modal({
    title: authTitle(),
    body: () => <AuthModalBody />,
    onClose: () => { if (authModal === handle) authModal = null; },
  });
  authModal = handle;
}

Codi.openSignIn = openSignIn;

// ───────────────────────── pages ─────────────────────────
function AuthPage({ mode }) {
  useCodi();
  const view = useAuthView();
  if (view.mode !== mode && view.mode !== 'social' && !(mode === 'register' && view.mode === 'otp')) {
    authView = { ...authView, mode, error: null };
  }
  const desc = DESCRIPTION[authView.mode];
  return (
    <div className="auth-wrap"><div className="auth-card card"><div className="card-body stack-4">
      <div className="stack-1 shell-auth-title">
        <h1 style={{ fontSize: 'var(--text-xl)' }}>{authTitle()}</h1>
        {desc && <p className="small muted">{desc}</p>}
      </div>
      <IntentBox view={authView} />
      <AuthBody />
    </div></div></div>
  );
}
export const LoginPage = () => <AuthPage mode="login" />;
export const RegisterPage = () => <AuthPage mode="register" />;

export { FieldError, formValues, useMounted };
