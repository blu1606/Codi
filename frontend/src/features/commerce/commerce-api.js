/**
 * Commerce data from the backend: DTO adapters, catalogue/ownership hooks, the cart count signal, and the gated
 * purchase actions (add to cart, buy now, free enrolment). Routes: /api/courses, /api/courses/ownership,
 * /api/student/cart, /api/orders/buy-now, /api/courses/enroll-free, /api/dev/simulate-payment.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Codi } from '../../lib/codi';
import { api } from '../../lib/api';
import { useApi } from '../../lib/use-api';

// ───────────────────────── adapters ─────────────────────────

const LEVEL_LABEL = { Beginner: 'Cơ bản', Intermediate: 'Trung cấp', Advanced: 'Nâng cao' };
export const levelLabel = (level) => LEVEL_LABEL[level] || level || '';

/** /api/courses row → the course shape the commerce screens render. */
export const toCourse = (c) => ({
  id: c.id, slug: c.slug, title: c.title, summary: c.description || '', category: c.category || '',
  level: c.level, price: c.price || 0, rating: c.rating || 0, ratingCount: c.reviewCount || 0,
  learnersCount: c.enrollmentCount || 0, duration: c.duration || '', coverImageUrl: c.coverImageUrl || null,
  lecturerName: c.instructorName || 'Codi', topics: c.topics || [], createdAt: c.createdAt,
});

/** GET /api/orders/:id → order shape used by checkout and success. */
export const toOrder = (o) => ({
  id: o.id, code: o.code, status: o.status, failReason: o.failReason, items: o.items || [],
  subtotal: o.subtotal, discount: o.discountAmount || 0, total: o.totalAmount, received: o.receivedAmount || 0,
  voucherCode: o.voucherCode, isBuyNow: o.isBuyNow, paymentDeadline: o.paymentDeadline,
  createdAt: o.createdAt, paidAt: o.paidAt, cancelledAt: o.cancelledAt,
});

/** Published catalogue (GET /api/courses). `query` is the query string without '?', e.g. 'sort=popular&limit=4'. */
export function useCatalog(query = '') {
  const res = useApi('/api/courses' + (query ? '?' + query : ''));
  const courses = useMemo(() => (res.data ? res.data.courses.map(toCourse) : null), [res.data]);
  return { ...res, courses };
}

// ───────────────────────── cart signal ─────────────────────────
// Bumped after every cart write so ownership maps reload; also carries the learner's cart size for the header.

let cartState = { version: 0, count: null };
const cartSubs = new Set();
const setCartState = (patch) => { cartState = { ...cartState, ...patch }; cartSubs.forEach((f) => f()); };
const subscribeCart = (f) => { cartSubs.add(f); return () => cartSubs.delete(f); };

/** Number of courses in the signed-in learner's backend cart (null until first loaded). */
export function useCartCount() {
  useEffect(() => { if (cartState.count === null) refreshCartCount(); }, []);
  return useSyncExternalStore(subscribeCart, () => cartState.count);
}
const useCartVersion = () => useSyncExternalStore(subscribeCart, () => cartState.version);

export async function refreshCartCount() {
  if (Codi.role() !== 'learner') { setCartState({ count: 0 }); return; }
  try {
    const r = await api.get('/api/student/cart');
    setCartState({ count: r.count });
  } catch (e) {
    console.warn('Không đọc được số khoá trong giỏ:', e.message);
  }
}

/** Call after any cart / order write: ownership maps reload and the cart count refreshes. */
export function cartChanged(count) {
  setCartState({ version: cartState.version + 1, ...(typeof count === 'number' ? { count } : {}) });
  if (typeof count !== 'number') refreshCartCount();
}

// ───────────────────────── ownership ─────────────────────────

/**
 * Ownership of a list of courses for the viewer (POST /api/courses/ownership):
 * owned | pending-payment (+ pendingOrderId) | in-cart | free | not-owned. of() is null until the first answer
 * (callers show a placeholder instead of a CTA that would flip); if the request fails, courses read as free /
 * not-owned by price and the server still guards every purchase. Reloads when the signed-in user or the cart changes.
 */
export function useOwnership(courses) {
  const list = courses || [];
  const key = list.map((c) => c.id).join(',');
  const userId = Codi.session.user ? Codi.session.user.id : null;
  const version = useCartVersion();
  const [map, setMap] = useState(null);

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const r = await api.post('/api/courses/ownership', { courses: key.split(',') });
      setMap(r.ownerships || {});
    } catch (e) {
      setMap((m) => m || {});
      Codi.ui.toast('Không xác định được trạng thái sở hữu khoá học: ' + e.message, { type: 'warn' });
    }
  }, [key, userId, version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const priceOf = useMemo(() => Object.fromEntries(list.map((c) => [c.id, c.price || 0])), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => ({
    of: (id) => (!map ? null : (map[id] && map[id].ownership)) || (priceOf[id] === 0 ? 'free' : 'not-owned'),
    pendingOrderId: (id) => (map && map[id] && map[id].pendingOrderId) || null,
    reload: load,
  }), [map, priceOf, load]);
}

// ───────────────────────── gated actions ─────────────────────────

const learnerOnly = (verb) => {
  if (Codi.role() === 'learner') return true;
  Codi.ui.toast(`Chỉ tài khoản học viên mới ${verb} được khoá học.`, { type: 'warn' });
  return false;
};

/** POST /api/student/cart. Resolves true when the course is in the cart afterwards. */
export async function addToCart(course) {
  if (!learnerOnly('mua')) return false;
  try {
    const r = await api.post('/api/student/cart', { courseId: course.id });
    cartChanged();
    if (r.added) {
      Codi.ui.toast(`Đã thêm “${course.title}” vào giỏ hàng.`, { type: 'success', action: { label: 'Xem giỏ hàng', onClick: () => Codi.go('/cart') } });
    } else {
      Codi.ui.toast('Khoá học đã có trong giỏ hàng.', { type: 'info', action: { label: 'Xem giỏ hàng', onClick: () => Codi.go('/cart') } });
    }
    return true;
  } catch (e) {
    cartChanged();
    Codi.ui.toast(e.message, { type: e.status === 409 ? 'info' : 'danger' });
    return false;
  }
}

/** "Mua ngay" (POST /api/orders/buy-now): single-course order straight to checkout; the cart is untouched. */
export function buyNow(course) {
  Codi.requireAuth(async () => {
    if (!learnerOnly('mua')) return;
    try {
      const r = await api.post('/api/orders/buy-now', { courseId: course.id });
      cartChanged();
      Codi.go('/checkout?order=' + encodeURIComponent(r.orderCode));
    } catch (e) {
      cartChanged();
      Codi.ui.toast(e.status === 409 ? 'Bạn đã sở hữu khóa học này.' : e.message || 'Không thể xử lý mua ngay.', { type: e.status === 409 ? 'success' : 'danger' });
    }
  }, { reason: 'Đăng nhập để mua khoá học.', courseTitle: course.title });
}

/** "Đăng ký miễn phí" (POST /api/courses/enroll-free), then onboarding unless `stay`. */
export function enrollFree(course, { stay = false } = {}) {
  Codi.requireAuth(async () => {
    if (!learnerOnly('đăng ký')) return;
    try {
      await api.post('/api/courses/enroll-free', { courseId: course.id });
      cartChanged();
      if (stay) {
        Codi.ui.toast(`Đã đăng ký "${course.title}"`, { type: 'success', action: { label: 'Học ngay', onClick: () => Codi.go(`/learn/${course.id}`) } });
      } else {
        Codi.ui.toast(`Đã đăng ký “${course.title}”.`, { type: 'success' });
        Codi.go('/learn/' + course.id + '/onboarding');
      }
    } catch (e) {
      Codi.ui.toast(e.message, { type: 'danger' });
    }
  }, { reason: 'Đăng nhập để đăng ký khoá học miễn phí.', courseTitle: course.title });
}

// ───────────────────────── voucher + payment simulation ─────────────────────────

// The applied voucher code lives in this tab until checkout (the backend re-validates it on every cart read).
const voucherKey = () => 'codi-cart-voucher:' + (Codi.session.user ? Codi.session.user.id : 'guest');
export const getVoucher = () => { try { return sessionStorage.getItem(voucherKey()) || ''; } catch { return ''; } };
export const setVoucher = (code) => {
  try { if (code) sessionStorage.setItem(voucherKey(), code); else sessionStorage.removeItem(voucherKey()); } catch { /* storage blocked */ }
};

/**
 * Creates the order from the backend cart. Resolves { orderCode, totalAmount } or throws ApiError
 * (409 PENDING_ORDER_EXISTS, 400 voucher / empty cart, 503 payments unavailable). The Alt+K scenario
 * "unavailable" blocks paid checkouts before any order is created.
 */
export async function checkoutCart({ total, replaceOrderId } = {}) {
  if (total > 0 && Codi.state.scenario.paymentOutcome === 'unavailable') {
    const e = new Error('Thanh toán tạm thời chưa khả dụng do thiếu cấu hình cổng thanh toán.');
    e.status = 503;
    throw e;
  }
  const voucherCode = getVoucher() || undefined;
  const r = await api.post('/api/orders/checkout', { voucherCode, ...(replaceOrderId ? { replaceOrderId } : {}) });
  setVoucher('');
  cartChanged();
  return r;
}

/** Dev bank stand-in: asks the backend to post a SePay transfer for the order (outcome paid|underpaid|overpaid|expire). */
export const simulatePayment = (orderCode, outcome) => api.post('/api/dev/simulate-payment', { orderCode, outcome });
