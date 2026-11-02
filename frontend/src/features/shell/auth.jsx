/**
 * Auth UI — port of the real app's sign-in-form.tsx, sign-up-form.tsx, otp-input.tsx, google-button.tsx and
 * github-button.tsx, keeping the rebuild's gated sign-in modal (Codi.openSignIn(intent, opts)).
 *
 * Backend (Better Auth): POST /api/auth/sign-in/email · sign-up/email (signs in and emails a 6-digit code) ·
 * email-otp/verify-email · email-otp/send-verification-otp · sign-in/social (redirects to Google / GitHub; the
 * provider returns to /login?social=ok|<provider>&error=…). Without Resend the codes are printed to the backend console.
 *
 * One view store (authView) drives both the full pages (/login, /register) and the modal. Forms keep their own
 * field state; authView carries only the mode, the email/name between steps, the course context and the intent.
 * Importing this module installs the real Codi.openSignIn.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { api } from '../../lib/api';
import { Alert, Icon } from '../../components/ui/primitives';
import { GithubMark, ShellIcon } from './shell-ui';
import OtpInput from './otp-input';
import { DEMO_PASSWORD, EMAIL_RE, authCode, authMessage, logActivity, syncLegacyUser } from './account-store';
import { safeNext } from './github-onboarding-page';

const DEMO = [['minhanh@codi.vn', 'Học viên'], ['quochuy@codi.vn', 'Giảng viên'], ['giabao@codi.vn', 'Quản trị viên'], ['kimoanh@codi.vn', 'Tài khoản bị vô hiệu hoá']];
const REMEMBER_EMAIL_KEY = 'codi_remember_email';
const freshView = (extra) => ({ mode: 'login', email: '', name: '', error: null, courseTitle: null, reason: null, rev: 0, ...extra });

// ───────────────────────── view store ─────────────────────────
let authView = freshView();
let authModal = null;
let authIntent = null;
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
const authTitle = () => ({ register: 'Tạo tài khoản', otp: 'Xác thực tài khoản' }[authView.mode] || 'Chào mừng trở lại!');
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
function completeAuth({ delay = 0, isNew = false } = {}) {
  syncLegacyUser(); // a brand-new account is not in the transitional legacy store yet
  logActivity('login');
  const intent = authIntent; authIntent = null;
  const wasModal = !!authModal;
  if (authModal) authModal.close();
  if (intent) { intent(); return; }
  const here = Codi.path() + (window.location.search || '');
  if (wasModal && !isNew) return;
  const go = () => {
    if (!Codi.session.user) return;
    const next = wasModal ? here : safeNext(Codi.query().next);
    if (isNew && Codi.role() === 'learner' && Codi.github && Codi.github.onboardingHref) Codi.go(Codi.github.onboardingHref(next));
    else Codi.go(next);
  };
  if (delay) setTimeout(go, delay); else go();
}

function setMode(mode) {
  authView.mode = mode; authView.error = null;
  if (isAuthPagePath() && !authModal && mode !== 'otp') { bump(); Codi.go('/' + (mode === 'register' ? 'register' : 'login')); } else refreshAuth();
}

/**
 * Real OAuth: Better Auth returns the provider URL and the browser leaves the app. The provider comes back to
 * /login?social=ok&next=… (signed in), the GitHub onboarding step for a new account, or /login?social=<id>&error=….
 */
async function startSocial(provider) {
  const next = authModal ? Codi.path() + (window.location.search || '') : safeNext(Codi.query().next);
  const back = (q) => `/login?${new URLSearchParams(q).toString()}`;
  const res = await api.post('/api/auth/sign-in/social', {
    provider,
    callbackURL: back({ social: 'ok', next }),
    errorCallbackURL: back({ social: provider }),
    newUserCallbackURL: Codi.github && Codi.github.onboardingHref ? Codi.github.onboardingHref(next) : next,
  });
  if (!res || typeof res.url !== 'string') throw new Error('Không mở được trang đăng nhập của nhà cung cấp.');
  window.location.assign(res.url);
}

/** Notice for ?social=<provider>&error=<code> after the provider sent the user back. */
function socialNotice(provider, error) {
  const P = PROVIDERS[provider];
  const label = P ? P.label : 'nhà cung cấp';
  if (error === 'access_denied') {
    return { type: 'warn', retry: P ? provider : null, title: `Codi chưa được ${label} cấp quyền`, body: 'Codi cần tên và email để nhận ra tài khoản của bạn. Hãy thử lại và chọn "Cho phép", hoặc dùng email và mật khẩu.' };
  }
  if (/banned|vô hiệu/i.test(error)) {
    return { title: 'Tài khoản đã bị vô hiệu hoá', body: 'Tài khoản Codi gắn với email này hiện không thể đăng nhập. Liên hệ hotro@codi.vn nếu bạn cho rằng đây là nhầm lẫn.' };
  }
  return { type: 'danger', retry: P ? provider : null, title: `Chưa đăng nhập được bằng ${label}`, body: 'Chưa có thay đổi nào. Bạn có thể thử lại hoặc dùng email và mật khẩu.' };
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
/** Opens the provider; a failure to even start (provider not configured, network) becomes the form's alert. */
async function trySocial(provider) {
  try {
    await startSocial(provider);
    return true;
  } catch (e) {
    const label = PROVIDERS[provider].label;
    authView.error = { type: 'danger', title: `Chưa kết nối được ${label}`, body: e.status === 404 ? `Máy chủ chưa cấu hình đăng nhập bằng ${label}. Hãy dùng email và mật khẩu.` : authMessage(e, 'Không mở được trang đăng nhập. Vui lòng thử lại.') };
    refreshAuth();
    return false;
  }
}

function AuthAlert({ err }) {
  if (!err) return null;
  const P = err.retry ? PROVIDERS[err.retry] : null;
  return (
    <Alert type={err.type || 'danger'} title={err.title} body={err.body}
      actions={P ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => trySocial(err.retry)}><P.Mark /> Thử lại với {P.label}</button> : null} />
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
    const leaving = await trySocial(provider);
    if (!leaving && mounted.current) setBusy(false);
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

  const fill = (e) => { setEmail(e); setPw(DEMO_PASSWORD); setErrors({}); };
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
    try {
      await Codi.signIn(addr, password);
    } catch (e) {
      if (!mounted.current) return;
      setBusy(false);
      // Better Auth: 401 INVALID_EMAIL_OR_PASSWORD; a banned account is refused by the session hook (also 401).
      if (/vô hiệu hoá/i.test(e.message || '')) {
        setServerError({ title: 'Tài khoản đã bị vô hiệu hoá', body: 'Tài khoản này hiện không thể đăng nhập. Liên hệ hotro@codi.vn nếu bạn cho rằng đây là nhầm lẫn.' });
        return;
      }
      const msg = e.status === 401 ? 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.'
        : e.status === 429 ? 'Bạn thử quá nhiều lần. Vui lòng đợi một lát rồi thử lại.'
        : e.message || 'Không đăng nhập được. Vui lòng thử lại.';
      setServerError({ body: msg }); Codi.ui.toast(msg, { type: 'danger' }); return;
    }
    if (!mounted.current) return;
    setBusy(false);
    writeRemembered(remember, addr);
    authView.email = addr;
    Codi.ui.toast('Đăng nhập thành công!', { type: 'success' });
    completeAuth();
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
      <button type="button" className="btn btn-secondary btn-block" onClick={() => setMode('register')}>Chưa có tài khoản? Tạo tài khoản miễn phí</button>
      <div className="demo-accounts">
        <span className="xsmall strong">Tài khoản thử nghiệm · mật khẩu {DEMO_PASSWORD}</span>
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
    try {
      // Better Auth creates the account, signs it in and sends the email-verification code.
      await api.post('/api/auth/sign-up/email', { name, email, password: v.password });
    } catch (e) {
      if (!mounted.current) return;
      setBusy(false);
      const code = authCode(e);
      if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' || e.status === 422) {
        setServerError({ title: 'Email đã được dùng', body: 'Email này đã có tài khoản. Hãy đăng nhập hoặc dùng "Quên mật khẩu?".' });
      } else {
        setServerError({ body: authMessage(e, 'Đăng ký thất bại. Vui lòng thử lại.') });
      }
      Codi.ui.toast('Đăng ký thất bại', { type: 'danger' });
      return;
    }
    if (!mounted.current) return;
    setBusy(false);
    authView.name = name; authView.email = email;
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
  const mounted = useMounted();

  const verify = async () => {
    if (busy || locked) return;
    if (code.length !== 6) { setErr('Vui lòng nhập đủ 6 chữ số OTP'); return; }
    setErr(null); setBusy(true);
    try {
      await api.post('/api/auth/email-otp/verify-email', { email: view.email, otp: code });
      // Sign-up already set the session cookie; read it so the app knows who is signed in.
      await Codi.refreshSession();
    } catch (e) {
      if (!mounted.current) return;
      setBusy(false);
      const c = authCode(e);
      if (c === 'TOO_MANY_ATTEMPTS') { setLocked(true); setErr('Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã.'); return; }
      if (c === 'OTP_EXPIRED') { setErr('Mã OTP đã hết hạn. Vui lòng gửi lại mã.'); return; }
      setErr(c === 'INVALID_OTP' ? 'Mã OTP không chính xác hoặc đã hết hạn 2 phút.' : authMessage(e, 'Mã OTP không chính xác hoặc đã hết hạn 2 phút.'));
      return;
    }
    if (!mounted.current) return;
    setBusy(false);
    if (!Codi.session.user) {
      // Verified, but this browser has no session (e.g. cookies were cleared): sign in normally.
      Codi.ui.toast('Xác thực email thành công! Vui lòng đăng nhập.', { type: 'success' });
      authView.email = view.email; setMode('login');
      return;
    }
    Codi.ui.toast('Xác thực email thành công! Đang chuyển hướng vào hệ thống...', { type: 'success' });
    completeAuth({ delay: 1000, isNew: true });
  };
  const resend = async () => {
    try {
      await api.post('/api/auth/email-otp/send-verification-otp', { email: view.email, type: 'email-verification' });
    } catch (e) {
      if (mounted.current) Codi.ui.toast(authMessage(e, 'Không thể gửi lại mã OTP lúc này.'), { type: 'danger' });
      return false;
    }
    if (!mounted.current) return false;
    setLocked(false); setErr(null);
    Codi.ui.toast('Đã gửi mã OTP mới! Vui lòng kiểm tra email.', { type: 'success' });
    return true;
  };

  return (
    <form className="stack-4" noValidate onSubmit={(e) => { e.preventDefault(); verify(); }}>
      <div className="stack-2 shell-auth-head">
        <span className="shell-icon-bubble" aria-hidden="true"><ShellIcon name="shield-check" /></span>
        <p className="small muted">Mã OTP gồm 6 chữ số đã được gửi tới email <strong>{view.email}</strong>. Mã có hiệu lực trong 2 phút.</p>
      </div>
      <OtpInput value={code} onChange={(x) => { setCode(x); setErr(null); }} onResend={resend} disabled={busy || locked} error={err} autoFocus />
      <button className="btn btn-primary btn-block" type="submit" disabled={code.length !== 6 || busy || locked}>{busy ? 'Đang xác thực...' : 'Xác thực và hoàn tất'}</button>
      <p className="small muted" style={{ textAlign: 'center' }}>Nhập nhầm email? <button type="button" className="btn-link" onClick={() => setMode('register')}>Đăng ký lại</button></p>
    </form>
  );
}

function AuthBody() {
  const view = useAuthView();
  const key = view.mode + ':' + view.rev;
  if (view.mode === 'register') return <RegisterForm key={key} view={view} />;
  if (view.mode === 'otp') return <OtpStep key={key} view={view} />;
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
function AuthPage({ mode, query = {} }) {
  useCodi();
  const view = useAuthView();
  if (view.mode !== mode && !(mode === 'register' && view.mode === 'otp')) {
    authView = { ...authView, mode, error: null };
  }

  // Back from Google / GitHub: continue when signed in, otherwise explain what happened. The query is then
  // dropped so a reload does not repeat it.
  const { social, error, next } = query;
  useEffect(() => {
    if (!social) return;
    if (social === 'ok' && Codi.session.user) {
      syncLegacyUser();
      logActivity('login');
      Codi.ui.toast('Đăng nhập thành công!', { type: 'success' });
      Codi.go(safeNext(next));
      return;
    }
    authView.error = socialNotice(social, error || 'unknown');
    refreshAuth();
    Codi.go('/login');
  }, [social, error, next]);

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
export const LoginPage = ({ query }) => <AuthPage mode="login" query={query} />;
export const RegisterPage = ({ query }) => <AuthPage mode="register" query={query} />;

export { FieldError, formValues, useMounted };
