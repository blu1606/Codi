/**
 * Commerce business logic, ported from the real app (Codi/apps/web/src/lib/{cart-service,checkout-cart,buy-now,
 * filter-course-catalog}.ts, app/api/orders/*, app/api/payments/sepay/callback) with the mockup filling gaps.
 * Data: Codi.db().courses / orders / vouchers / reviews / knowledgeMaps.
 * Own persisted slice: Codi.state.commerce { voucher: { [userId]: code } }.
 *
 * Order lifecycle fields owned here: received, expiresAt, failReason, cancelledAt, cancelReason, replacesOrderId and
 * timeline[{ at, type, by, label, note? }] (label kept for existing readers). needsReconciliation is set where the real
 * app sets it; the admin area resolves it.
 */
import { Codi } from '../../lib/codi';

const fmt = Codi.fmt;

// Persisted slice — always read through cm() so a data reset never leaves a stale reference.
export const cm = () => Codi.ensure('commerce', () => ({ voucher: {} }));
export const uid = () => Codi.state.currentUserId;
const nowIso = () => new Date().toISOString();

export const SUPPORT_EMAIL = 'hotro@codi.vn';
export const ORDER_TTL_MS = 30 * 60000;

export const lecturerName = (c) => (Codi.user(c.lecturerId) || { name: 'Codi' }).name;
export const published = () => Codi.db().courses.filter((c) => c.status === 'published');
export const priceLabel = (c) => (c.price ? fmt.vnd(c.price) : 'Miễn phí');
export const myPendingOrders = () => Codi.db().orders
  .filter((o) => o.userId === uid() && o.status === 'pending')
  .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
/** Looks an order up by id or by its CODI code (the real app links with the code). */
export const findMyOrder = (idOrCode) => {
  if (!idOrCode) return null;
  const key = String(idOrCode).trim();
  return Codi.db().orders.find((o) => o.userId === uid() && (o.id === key || o.code === key.toUpperCase())) || null;
};

// Lesson content types with visual labels (S02 requirement)
export const TYPE_ICON = { video: 'video', pdf: 'presentation', reading: 'book-open', tutorial: 'terminal', code: 'code', quiz: 'clipboard-check', assignment: 'upload' };
export const TYPE_LABEL = { video: 'Video', pdf: 'Slide/PDF', reading: 'Bài đọc', tutorial: 'Hướng dẫn code', code: 'Bài code', quiz: 'Quiz', assignment: 'Bài tập' };

// ───────────────────────── timeline ─────────────────────────

/** Appends a timeline event. `by` is the acting user id, or null for the system (expiry, bank webhook). */
export function addEvent(order, type, label, by = null, note) {
  if (!Array.isArray(order.timeline)) order.timeline = [];
  const e = { at: nowIso(), type, by, label };
  if (note) e.note = note;
  order.timeline.push(e);
  order.updatedAt = e.at; // admin KPIs window on updatedAt
}

// ───────────────────────── catalog search (lib/filter-course-catalog.ts) ─────────────────────────

/** Topics come only from confirmed knowledge maps, accepted or edited concepts (real /api/courses topicEligibility). */
export function courseTopics(course) {
  const maps = Codi.db().knowledgeMaps || {};
  const m = maps[course.id];
  if (!m || m.status !== 'confirmed' || course.status !== 'published') return [];
  return [...new Set((m.concepts || []).filter((c) => c.review === 'accepted' || c.review === 'edited').map((c) => c.name))];
}

/** Catalog entry shape used by the real filter functions. */
export const catalogEntry = (c) => ({
  course: c, id: c.id, slug: c.slug, title: c.title, description: c.summary || '', categoryId: c.categoryId,
  category: Codi.category(c.categoryId).name, level: c.level, topics: courseTopics(c), price: c.price || 0,
  enrollmentCount: c.learnersCount || 0, rating: c.rating || 0, createdAt: c.createdAt,
});

export const SORT_VALUES = ['popular', 'newest', 'rating', 'enrollment'];
/** URL sort value → supported option; legacy price sorts and 'relevant' fall back to 'popular' (real hydration). */
export const normaliseSort = (s) => (SORT_VALUES.includes(s) ? s : 'popular');

/** Pure filter + sort (real filterCourseCatalog). `entries` come from catalogEntry(). */
export function filterCatalog(entries, query, { cat = 'all', level = 'all', price = 'all', sort } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const list = entries.filter((e) => {
    const matchesSearch = !q || e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
      || e.category.toLowerCase().includes(q) || e.topics.some((t) => t.toLowerCase().includes(q));
    const matchesCat = cat === 'all' || e.categoryId === cat;
    const matchesLevel = level === 'all' || e.level === level;
    const matchesPrice = price === 'all' || (price === 'free' && e.price === 0) || (price === 'paid' && e.price > 0);
    return matchesSearch && matchesCat && matchesLevel && matchesPrice;
  });
  if (!sort) return list;
  const byEnrol = (a, b) => b.enrollmentCount - a.enrollmentCount;
  switch (sort) {
    case 'newest': return list.sort((a, b) => (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0));
    case 'rating': return list.sort((a, b) => b.rating - a.rating);
    case 'enrollment': return list.sort(byEnrol);
    default: // 'popular' = "Phù hợp nhất": title matches first when searching, then enrolment count
      if (q) {
        return list.sort((a, b) => {
          const at = a.title.toLowerCase().includes(q) ? 2 : 0;
          const bt = b.title.toLowerCase().includes(q) ? 2 : 0;
          return at !== bt ? bt - at : byEnrol(a, b);
        });
      }
      return list.sort(byEnrol);
  }
}

/** Typeahead groups (real getTypeaheadSuggestions): query suggestions, top results (courses then topics), matches. */
export function typeaheadSuggestions(entries, query) {
  const t = String(query || '').trim().toLowerCase();
  if (!t) return { matches: [], querySuggestions: [], topResults: [], isEmpty: false };
  const matches = filterCatalog(entries, query);
  const suggestions = new Set();
  entries.forEach((e) => {
    if (e.title.toLowerCase().includes(t)) suggestions.add(e.title);
    e.topics.forEach((x) => { if (x.toLowerCase().includes(t)) suggestions.add(x); });
  });
  const topResults = entries.filter((e) => e.title.toLowerCase().includes(t) || e.description.toLowerCase().includes(t)).slice(0, 4)
    .map((e) => ({ id: `course-${e.id}`, title: e.title, type: 'Khóa học', entry: e, category: e.category }));
  const seen = new Set();
  entries.forEach((e) => e.topics.forEach((x) => {
    if (x.toLowerCase().includes(t) && !seen.has(x.toLowerCase())) {
      seen.add(x.toLowerCase());
      topResults.push({ id: `topic-${x}`, title: x, type: 'Chủ đề', topic: x, category: e.category });
    }
  }));
  const querySuggestions = [...suggestions].slice(0, 5);
  return { matches, querySuggestions, topResults, isEmpty: !matches.length && !topResults.length && !querySuggestions.length };
}

// ───────────────────────── vouchers (lib/cart-service.ts validateVoucher) ─────────────────────────

const vnDate = (iso) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));

/** First failure wins. Expiry and start are instant comparisons, as the real app stores timestamps. */
export function checkVoucher(code, subtotal, now = new Date()) {
  const v = Codi.db().vouchers.find((x) => x.code.toUpperCase() === String(code || '').trim().toUpperCase());
  if (!v) return { error: 'Mã giảm giá không tồn tại. Kiểm tra lại chính tả.' };
  if (!v.active) return { error: 'Mã này đã ngừng áp dụng.' };
  if (v.startsAt && new Date(v.startsAt) > now) return { error: `Mã giảm giá chỉ có hiệu lực từ ${vnDate(v.startsAt)}.` };
  if (v.expiresAt && new Date(v.expiresAt) < now) return { error: `Mã đã hết hạn từ ${vnDate(v.expiresAt)}.` };
  if (v.usageLimit !== null && v.usageLimit !== undefined && v.used >= v.usageLimit) return { error: 'Mã đã hết lượt sử dụng.' };
  if (v.minOrder > 0 && subtotal < v.minOrder) return { error: `Đơn hàng cần tối thiểu ${fmt.vnd(v.minOrder)} để dùng mã này.` };
  let discount;
  if (v.type === 'percent') {
    discount = Math.round((subtotal * v.value) / 100);
    if (v.maxDiscount && discount > v.maxDiscount) discount = v.maxDiscount;
  } else discount = Math.min(v.value, subtotal);
  return { voucher: v, discount };
}

const voucherHasCapacity = (v) => !!v && (v.usageLimit === null || v.usageLimit === undefined || v.used < v.usageLimit);

export function cartSummary() {
  const courses = Codi.cart().map((id) => Codi.course(id)).filter(Boolean);
  const subtotal = courses.reduce((s, c) => s + c.price, 0);
  const code = cm().voucher[uid()];
  let discount = 0; let voucher = null; let voucherInvalid = null;
  if (code && subtotal > 0) {
    const r = checkVoucher(code, subtotal);
    if (r.error) voucherInvalid = r.error; else { discount = r.discount; voucher = r.voucher; }
  }
  return { courses, subtotal, discount, total: Math.max(0, subtotal - discount), voucher, voucherInvalid, code };
}

/** Adds a course to the learner's cart. Returns true when the course is in the cart afterwards. */
export function addToCart(courseId) {
  const c = Codi.course(courseId);
  if (!c) return false;
  if (Codi.role() !== 'learner') { Codi.ui.toast('Chỉ tài khoản học viên mới mua được khoá học.', { type: 'warn' }); return false; }
  const own = Codi.ownership(courseId);
  if (own === 'owned') { Codi.ui.toast('Bạn đã sở hữu khóa học này.', { type: 'info' }); Codi.set(() => {}); return false; }
  if (own === 'pending-payment') { Codi.ui.toast('Khoá học này đang nằm trong một đơn chờ thanh toán.', { type: 'info' }); Codi.set(() => {}); return false; }
  Codi.set(() => { if (!Codi.cart().includes(courseId)) Codi.setCart(Codi.cart().concat(courseId)); });
  Codi.ui.toast(`Đã thêm “${c.title}” vào giỏ hàng.`, { type: 'success', action: { label: 'Xem giỏ hàng', onClick: () => Codi.go('/cart') } });
  return true;
}

export function makeOrderCode() {
  const used = new Set(Codi.db().orders.map((o) => o.code));
  let code;
  do { code = 'CODI' + String(10000 + Math.floor(Math.random() * 90000)); } while (used.has(code));
  return code;
}

let orderSeq = 0;
// Same id shape as the mockup ('order-' + base36 time) plus a per-session counter so two orders created in the
// same millisecond (replace-order) never collide.
const orderId = () => 'order-' + Date.now().toString(36) + (orderSeq++ ? orderSeq.toString(36) : '');

function newOrder({ items, voucherCode = null, discount = 0, total, status = 'pending', isBuyNow = false, replacesOrderId = null }) {
  const code = makeOrderCode();
  const now = nowIso();
  return {
    id: orderId(), code, userId: uid(), items, voucherCode, discount, total, method: 'Chuyển khoản ngân hàng', status,
    createdAt: now, paidAt: status === 'paid' ? now : null, content: code, received: 0,
    expiresAt: new Date(Date.now() + ORDER_TTL_MS).toISOString(), failReason: null, cancelledAt: null, cancelReason: null,
    isBuyNow, replacesOrderId, timeline: [],
  };
}

export const orderExpiresAt = (o) => (o.expiresAt ? new Date(o.expiresAt).getTime() : new Date(o.createdAt).getTime() + ORDER_TTL_MS);
export const timeLeft = (order) => orderExpiresAt(order) - Date.now();
export const isExpiredPending = (o) => o.status === 'pending' && timeLeft(o) <= 0;
export const mmss = (ms) => (ms > 0 ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}` : '0:00');

/** pending → failed on expiry. Call inside Codi.set. */
export function expireOrder(order) {
  if (order.status !== 'pending') return;
  order.status = 'failed'; order.failReason = 'expired';
  if (order.received > 0) order.needsReconciliation = true;
  addEvent(order, 'expired', 'Mã thanh toán hết hạn');
}

/**
 * pending → cancelled. Call inside Codi.set. Courses go back to the learner's cart (real /api/orders/cancel).
 * Returns false when the order is no longer pending.
 */
export function cancelOrder(order, reason = 'Người mua đã huỷ', by = uid()) {
  if (!order || order.status !== 'pending') return false;
  const now = nowIso();
  order.status = 'cancelled'; order.cancelledAt = now; order.cancelReason = reason;
  if (order.received > 0) order.needsReconciliation = true; // money stays visible for refund disposition
  addEvent(order, reason === 'Huỷ để tạo đơn mới' ? 'replaced' : 'cancelled', reason, by);
  if (order.userId === uid()) {
    Codi.setCart([...new Set(Codi.cart().concat(order.items.map((i) => i.courseId)))].filter((id) => !Codi.isEnrolled(id)));
  }
  return true;
}

/**
 * Creates an order from the cart (real lib/checkout-cart.ts createOrderFromCart).
 * Returns { order } or { error, code?, pending? }:
 *  - empty cart → error; applied voucher no longer valid → error with the voucher message (no silent full price);
 *  - scenario paymentOutcome 'unavailable' and total > 0 → code 'UNAVAILABLE';
 *  - another pending order → expired ones are failed first, otherwise code 'PENDING_ORDER_EXISTS' unless
 *    replaceOrderId names it, in which case it is cancelled and its courses are kept in the new order;
 *  - total 0 (voucher covers the cart) → paid at once, voucher claimed, courses enrolled.
 */
export function createOrderFromCart({ replaceOrderId = null } = {}) {
  let result = null;
  Codi.set((st) => {
    const me = uid();
    const pending = myPendingOrders()[0];
    if (pending && isExpiredPending(pending)) expireOrder(pending);
    const live = pending && pending.status === 'pending' ? pending : null;
    if (live && replaceOrderId !== live.id) {
      result = { error: `Bạn đang có đơn hàng ${live.code} chờ thanh toán. Vui lòng hoàn tất hoặc huỷ đơn cũ trước khi đặt đơn mới.`, code: 'PENDING_ORDER_EXISTS', pending: live };
      return;
    }
    // Replacing keeps the old order's courses in the new order. Everything is validated on that prospective cart
    // first, so a failed checkout never leaves the old order cancelled.
    const ids = [...new Set(Codi.cart().concat(live ? live.items.map((i) => i.courseId) : []))];
    const courses = ids.map((id) => Codi.course(id)).filter((c) => c && !Codi.isEnrolled(c.id) && c.price > 0 && c.status === 'published');
    if (!courses.length) { result = { error: 'Giỏ hàng của bạn đang trống' }; return; }
    const subtotal = courses.reduce((n, c) => n + c.price, 0);
    const code = cm().voucher[me];
    const v = code ? checkVoucher(code, subtotal) : null;
    if (v && v.error) { result = { error: v.error, code: 'VOUCHER_INVALID' }; return; }
    const voucher = v ? v.voucher : null;
    const discount = v ? Math.min(v.discount, subtotal) : 0;
    const total = Math.max(0, subtotal - discount);
    if (total > 0 && Codi.state.scenario.paymentOutcome === 'unavailable') {
      result = { error: 'Thanh toán tạm thời chưa khả dụng do thiếu cấu hình cổng thanh toán.', code: 'UNAVAILABLE' };
      return;
    }
    const zero = total === 0;
    if (zero && voucher && !voucherHasCapacity(voucher)) { result = { error: 'Mã đã hết lượt sử dụng.', code: 'VOUCHER_INVALID' }; return; }

    if (live) cancelOrder(live, 'Huỷ để tạo đơn mới', me);
    if (zero && voucher) voucher.used += 1; // free orders claim voucher capacity at creation (no transfer follows)
    const s = { voucher };
    const order = newOrder({
      items: courses.map((c) => ({ courseId: c.id, price: c.price })), voucherCode: s.voucher ? s.voucher.code : null,
      discount, total, status: zero ? 'paid' : 'pending', replacesOrderId: live ? live.id : null,
    });
    if (zero) {
      order.expiresAt = null;
      addEvent(order, 'paid', 'Đã thanh toán (Miễn phí qua mã giảm giá)', me);
      order.items.forEach((i) => Codi.enroll(i.courseId, me));
    } else {
      addEvent(order, 'created', live ? 'Đã tạo đơn mới (thay đơn cũ)' : 'Đã tạo đơn', me);
    }
    st.db.orders.push(order);
    const ordered = new Set(order.items.map((i) => i.courseId));
    Codi.setCart(Codi.cart().filter((id) => !ordered.has(id)));
    cm().voucher[me] = null;
    result = { order };
  }, { render: false });
  return result;
}

/**
 * "Mua ngay" (real lib/buy-now.ts, D4): single-course pending order, no voucher, the cart is untouched. An existing
 * pending order holding this course is resumed instead.
 */
export function createBuyNowOrder(courseId) {
  const c = Codi.course(courseId);
  if (!c || Codi.isEnrolled(courseId) || c.price <= 0 || c.status !== 'published') return null;
  const existing = Codi.pendingOrderFor(courseId);
  if (existing) return existing;
  const order = newOrder({ items: [{ courseId: c.id, price: c.price }], total: c.price, isBuyNow: true });
  addEvent(order, 'created', 'Đã tạo đơn', uid());
  Codi.set((st) => { st.db.orders.push(order); }, { render: false });
  return order;
}

/** failed → new pending order row ("Tạo mã mới"); the failed row is kept (real /api/orders/[id]/new-code). */
export function newCodeFor(old) {
  const o = newOrder({ items: old.items.map((i) => ({ ...i })), voucherCode: old.voucherCode, discount: old.discount, total: old.total, isBuyNow: !!old.isBuyNow });
  addEvent(o, 'created', `Đã tạo đơn (thay cho ${old.code})`, uid());
  Codi.set((st) => { st.db.orders.push(o); }, { render: false });
  return o;
}

// ───────────────────────── payment (SePay webhook, simulated in-browser) ─────────────────────────

const ev = (type, label, at) => ({ at, type, by: null, label });

/**
 * Pure transfer rule set (real app/api/payments/sepay/callback/route.ts). Never mutates its input.
 * transfer = { amount, content, at? }, ctx = { ownsAll, voucher } (voucher: the order's voucher row, if any).
 * Returns { result, order, enroll: courseIds[], claimVoucher, notify } where result is one of
 * 'ignored' | 'underpaid' | 'paid' | 'late_paid' | 'late_owned' | 'not_pending'.
 */
export function applyTransfer(order, transfer, ctx = {}) {
  const at = transfer.at || nowIso();
  const amount = Math.max(0, Math.round(Number(transfer.amount) || 0));
  const content = String(transfer.content || '').toUpperCase();
  const none = { enroll: [], claimVoucher: false, notify: false };
  if (!amount || !content.includes(String(order.code).toUpperCase())) return { result: 'ignored', order, ...none };
  const o = { ...order, timeline: [...(order.timeline || [])], updatedAt: at };
  const received = o.received || 0;
  let late = false;
  if (o.status !== 'pending') {
    if (o.status === 'failed' && o.failReason === 'expired') {
      if (ctx.ownsAll) {
        o.received = received + amount; o.needsReconciliation = true;
        o.timeline.push(ev('late_owned', 'Thanh toán muộn cho các khoá đã sở hữu (Cần đối soát hoàn tiền)', at));
        return { result: 'late_owned', order: o, ...none };
      }
      late = true;
    } else if (o.status === 'cancelled' || o.status === 'paid') {
      o.received = received + amount; o.needsReconciliation = true;
      o.timeline.push(ev('received_after_close', o.status === 'paid'
        ? 'Nhận thêm thanh toán sau khi đơn đã thanh toán (cần đối soát hoàn tiền)'
        : 'Nhận thanh toán sau khi đơn đã huỷ (cần đối soát hoàn tiền)', at));
      return { result: 'not_pending', order: o, ...none };
    } else {
      return { result: 'not_pending', order, ...none };
    }
  }
  const acc = received + amount;
  if (acc < o.total) {
    const afterExpiry = o.status === 'failed';
    o.received = acc;
    if (afterExpiry) o.needsReconciliation = true;
    o.timeline.push(ev('partial_payment', afterExpiry
      ? `Thanh toán thiếu sau khi hết hạn: nhận thêm ${fmt.vnd(amount)} (Tổng nhận: ${fmt.vnd(acc)} / Cần: ${fmt.vnd(o.total)}, cần đối soát)`
      : `Đã nhận một phần: ${fmt.vnd(amount)} (Tổng nhận: ${fmt.vnd(acc)} / Cần: ${fmt.vnd(o.total)})`, at));
    return { result: 'underpaid', order: o, ...none };
  }
  const over = acc > o.total;
  o.status = 'paid'; o.received = acc; o.paidAt = at;
  if (over) o.needsReconciliation = true; else if (late) o.needsReconciliation = false;
  o.timeline.push(ev(late ? 'late_paid' : 'paid', late ? 'Thanh toán muộn được chấp nhận' : 'Đã nhận tiền', at));
  if (over) o.timeline.push(ev('overpaid', `Chuyển thừa ${fmt.vnd(acc - o.total)} (Cần đối soát)`, at));
  let claimVoucher = false;
  if (o.voucherCode) {
    if (voucherHasCapacity(ctx.voucher)) claimVoucher = true;
    else {
      o.needsReconciliation = true;
      o.timeline.push(ev('voucher_over_limit', 'Mã giảm giá vượt hạn mức sử dụng khi thanh toán (Cần đối soát)', at));
    }
  }
  return { result: late ? 'late_paid' : 'paid', order: o, enroll: o.items.map((i) => i.courseId), claimVoucher, notify: true };
}

/** Runs applyTransfer against the store and applies its side effects. Returns the result kind. */
export function receiveTransfer(orderId, amount, content) {
  let kind = 'ignored';
  Codi.set((st) => {
    const order = st.db.orders.find((x) => x.id === orderId);
    if (!order) return;
    const voucher = order.voucherCode ? st.db.vouchers.find((v) => v.code === order.voucherCode) : null;
    const ownsAll = order.items.length > 0 && order.items.every((i) => Codi.isEnrolled(i.courseId, order.userId));
    const r = applyTransfer(order, { amount, content }, { ownsAll, voucher });
    kind = r.result;
    if (r.order !== order) Object.assign(order, r.order);
    r.enroll.forEach((id) => Codi.enroll(id, order.userId));
    if (r.claimVoucher && voucher) voucher.used += 1;
    if (r.notify) Codi.notify(order.userId, { title: 'Thanh toán thành công', body: `Đơn ${order.code} đã được xác nhận. Khoá học đã sẵn sàng.`, link: '/checkout/success?order=' + order.id });
  }, { render: false });
  return kind;
}

/** Amount still due on a pending order. */
export const amountDue = (o) => Math.max(0, o.total - (o.received || 0));
