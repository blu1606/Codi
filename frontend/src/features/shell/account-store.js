/**
 * Account helpers shared by the shell screens. Everything here talks to the real backend (Better Auth under
 * /api/auth/*, Codi routes under /api/*); nothing is simulated in the browser any more.
 *
 *  accountUser()       the signed-in user for rendering: the backend session user (name, email, emailVerified,
 *                      image, createdAt) over the legacy store record (role, status) that unported pages still read.
 *  syncLegacyUser()    mirrors the session user into the transitional legacy store so pages that still read
 *                      Codi.currentUser() (header badges, other features) see a newly registered or OAuth user and
 *                      fresh name/avatar. Goes away with the legacy store.
 *  authMessage(e, fb)  Vietnamese message for a Better Auth / API error.
 *  logActivity(type)   POST /api/student/profile activity (sign-ins feed the profile heatmap).
 *  endSession()        signs out through the backend.
 *
 * Email OTP codes are sent by the backend. Without a Resend key they are printed to the backend console
 * ("[Auth OTP for <email>]: 123456").
 */
import { Codi } from '../../lib/codi';
import { api } from '../../lib/api';

export const DEMO_PASSWORD = 'Codi@12345';
export const OTP_TTL_S = 120;
export const OTP_RESEND_AFTER_S = 30;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ───────────────────────── session user ─────────────────────────
const SESSION_FIELDS = ['name', 'email', 'emailVerified', 'image', 'createdAt'];

/** Signed-in user for rendering, or null. Backend session fields win over the legacy record. */
export function accountUser() {
  const legacy = Codi.currentUser();
  const su = Codi.session && Codi.session.user;
  if (!legacy && !su) return null;
  if (!su) return legacy;
  const role = Codi.role();
  return { ...(legacy || {}), id: su.id, role: role === 'guest' ? 'learner' : role, ...Object.fromEntries(SESSION_FIELDS.map((k) => [k, su[k] ?? null])) };
}

/**
 * Makes the legacy store agree with the backend session: creates the record for a user the legacy seed never had
 * (new sign-up, first OAuth sign-in), marks them current, and copies name/email/image/emailVerified.
 * Returns true when it changed anything.
 */
export function syncLegacyUser() {
  const su = Codi.session && Codi.session.user;
  const users = Codi.db().users;
  if (!su || !Array.isArray(users)) return false;
  const rec = users.find((u) => u.id === su.id);
  const same = rec && Codi.state.currentUserId === su.id && rec.name === su.name && rec.email === su.email
    && (rec.image || null) === (su.image || null) && rec.emailVerified === !!su.emailVerified;
  if (same) return false;
  Codi.set((s) => {
    let u = s.db.users.find((x) => x.id === su.id);
    if (!u) {
      const now = new Date().toISOString();
      u = { id: su.id, role: 'learner', status: 'active', createdAt: su.createdAt || now, lastActive: now };
      s.db.users.push(u);
    }
    Object.assign(u, { name: su.name, email: su.email, image: su.image || null, emailVerified: !!su.emailVerified });
    s.currentUserId = su.id;
  });
  return true;
}

/** Re-reads the backend session (after a profile/email change) and mirrors it into the legacy store. */
export async function refreshAccount() {
  await Codi.refreshSession();
  syncLegacyUser();
}

// ───────────────────────── errors ─────────────────────────
const AUTH_CODES = {
  INVALID_EMAIL_OR_PASSWORD: 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.',
  INVALID_PASSWORD: 'Mật khẩu hiện tại không đúng.',
  USER_ALREADY_EXISTS: 'Email này đã có tài khoản. Hãy đăng nhập hoặc dùng "Quên mật khẩu?".',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Email này đã có tài khoản. Hãy đăng nhập hoặc dùng "Quên mật khẩu?".',
  PASSWORD_TOO_SHORT: 'Mật khẩu phải có ít nhất 8 ký tự',
  PASSWORD_TOO_LONG: 'Mật khẩu quá dài (tối đa 128 ký tự).',
  INVALID_OTP: 'Mã OTP không chính xác.',
  OTP_EXPIRED: 'Mã OTP đã hết hạn. Vui lòng gửi lại mã.',
  TOO_MANY_ATTEMPTS: 'Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã.',
  EMAIL_UNAVAILABLE: 'Email này đã được liên kết với một tài khoản khác. Vui lòng sử dụng email khác.',
  INVALID_RESET_GRANT: 'Vui lòng xác thực email trong phần Cài đặt trước khi đặt mật khẩu mới.',
  INVALID_TOKEN: 'Không thể đặt lại mật khẩu. Token có thể đã hết hạn.',
  TOKEN_EXPIRED: 'Không thể đặt lại mật khẩu. Token có thể đã hết hạn.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã lâu. Vui lòng đăng xuất, đăng nhập lại rồi thử lại.',
  USER_NOT_FOUND: 'Mã OTP không hợp lệ hoặc đã hết hạn 2 phút.',
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'Tài khoản này chưa có mật khẩu (đăng nhập bằng Google/GitHub). Dùng "Quên mật khẩu hiện tại?" để đặt mật khẩu.',
};

/** Vietnamese message for an ApiError from Better Auth ({ code, message }) or a Codi route ({ error }). */
export function authMessage(e, fallback) {
  if (!e) return fallback;
  if (e.status === 0) return e.message;
  if (e.status === 429) return 'Bạn thử quá nhiều lần. Vui lòng đợi một lát rồi thử lại.';
  const code = e.body && typeof e.body === 'object' ? e.body.code : null;
  if (code && AUTH_CODES[code]) return AUTH_CODES[code];
  if (/vô hiệu hoá/i.test(e.message || '')) return e.message;
  // Codi routes answer in Vietnamese; Better Auth messages are English, so fall back to the screen's copy.
  return code ? fallback : (e.message || fallback);
}
export const authCode = (e) => (e && e.body && typeof e.body === 'object' ? e.body.code || null : null);

// ───────────────────────── activity & sign-out ─────────────────────────
/** Records an activity for the profile heatmap. Never blocks the caller; a failure is only logged. */
export function logActivity(type) {
  api.post('/api/student/profile', { type }).catch((e) => console.warn('[activity]', e.message));
}

export function endSession() {
  Codi.signOut();
}

// ───────────────────────── devices ─────────────────────────
/** Real describeDevice() from components/settings/session-settings.tsx. */
export function describeDevice(userAgent) {
  if (!userAgent) return 'Thiết bị không xác định';
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox' : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Trình duyệt';
  const system = /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iOS' : /Windows/.test(userAgent) ? 'Windows' : /Mac/.test(userAgent) ? 'macOS' : /Linux/.test(userAgent) ? 'Linux' : 'Thiết bị khác';
  return `${browser} · ${system}`;
}
export const isMobileAgent = (ua) => /Android|iPhone|iPad/.test(ua || '');
