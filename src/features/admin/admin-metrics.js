/**
 * Admin metrics — every number on the admin dashboard, "Quan sát hệ thống" (A1–A9) and "Tài chính" (B1–B9),
 * computed from the live store rows (orders, users, enrolments, learnerProgress, studyLog, learnerStudyDays,
 * checkoutEvents, questions, reviews, submissions, courses). Port of the real app's analytics-contract.ts /
 * analytics-formulas.ts / admin-analytics-service.ts / revenue-analytics-service.ts.
 *
 * Windows are GMT+7 calendar days ending today (inclusive), the previous window has the same length right before.
 * Revenue basis (real): an order counts by paidAt when paid or later refunded; gross = subtotal; discount;
 * net = total; refunds = total of refunded orders dated by updatedAt.
 *
 * Every reader is defensive: older rows may miss lifecycle fields (received, failReason, timeline, updatedAt …).
 */
import { Codi } from '../../lib/codi';

export const DAY = 86400000;
const HOUR = 3600000;
const TZ = 7 * HOUR;
export const OVERDUE_MS = 24 * HOUR;
const UNANSWERED_AFTER_MS = 48 * HOUR;
const RECONCILIATION_LIMIT = 50;

const db = () => Codi.db();
const ms = (v) => (v == null || v === '' ? null : typeof v === 'number' ? v : (Number.isFinite(Date.parse(v)) ? Date.parse(v) : null));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const arr = (v) => (Array.isArray(v) ? v : []);

// ───────────────────────── GMT+7 windows ─────────────────────────
/** GMT+7 calendar day of an instant: "2026-10-23". */
export const dayKey = (t) => new Date(ms(t) + TZ).toISOString().slice(0, 10);
const span = (start, end) => { const keys = []; for (let t = start; t < end; t += DAY) keys.push(dayKey(t)); return { start, end, keys, days: keys.length }; };
/** Window of `days` GMT+7 days ending with today. */
export function windowOf(days, now = Date.now()) {
  const end = Date.parse(dayKey(now) + 'T00:00:00Z') - TZ + DAY;
  return span(end - days * DAY, end);
}
export const previousOf = (w) => span(w.start - (w.end - w.start), w.start);
export const inWindow = (t, w) => { const x = ms(t); return x != null && x >= w.start && x < w.end; };
export const dayLabel = (k) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
export const dayLabelFull = (k) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;
const rangeOf = (w) => `${dayLabelFull(w.keys[0])} – ${dayLabelFull(w.keys[w.keys.length - 1])}`;
/** "01/10/2026 – 30/10/2026 (GMT+7) · so với 01/09/2026 – 30/09/2026" */
export const rangeLabel = (w, p) => `${rangeOf(w)} (GMT+7)${p ? ` · so với ${rangeOf(p)}` : ''}`;
/** Monday (GMT+7) of the week holding day key k. */
const weekStart = (k) => { const d = new Date(k + 'T00:00:00Z'); return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10); };

export const median = (xs) => { const a = xs.slice().sort((x, y) => x - y); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const percentile = (xs, p) => { const a = xs.slice().sort((x, y) => x - y); if (!a.length) return null; return a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)]; };
const pct = (part, whole) => (whole ? (part / whole) * 100 : 0);

// ───────────────────────── orders ─────────────────────────
const timelineAt = (o, re) => { const t = arr(o.timeline).find((x) => re.test(x.type || '') || re.test(x.label || '')); return t ? ms(t.at || t.createdAt) : null; };

/** Normalised order facts used by every finance formula. */
export function orderFact(o) {
  const items = arr(o.items);
  const subtotal = Number.isFinite(o.subtotal) ? o.subtotal : items.reduce((s, i) => s + num(i.price ?? i.unitPrice), 0);
  const discount = num(o.discount ?? o.discountAmount);
  const total = Number.isFinite(o.total) ? o.total : subtotal - discount;
  const created = ms(o.createdAt);
  const paid = ms(o.paidAt);
  const updated = ms(o.updatedAt) ?? ms(o.refundedAt) ?? (o.status === 'refunded' ? timelineAt(o, /refund|hoàn tiền/i) : null) ?? ms(o.cancelledAt) ?? paid ?? created;
  return { o, id: o.id, code: o.code, userId: o.userId, status: o.status, items, subtotal, discount, total, received: num(o.received ?? o.receivedAmount), failReason: o.failReason || null, flagged: !!o.needsReconciliation, voucherCode: o.voucherCode || null, isBuyNow: !!(o.isBuyNow || o.source === 'buy_now'), created, paid, updated };
}
const facts = () => arr(db().orders).map(orderFact).filter((f) => f.created != null);
const isRevenue = (f) => (f.status === 'paid' || f.status === 'refunded') && f.paid != null;

/** Pending and created at least 24 hours ago (real isOrderOverdue). */
export const isOverdue = (o, now = Date.now()) => o.status === 'pending' && now - ms(o.createdAt) >= OVERDUE_MS;
export const needsReconciliation = (o) => !!o.needsReconciliation;
const isExpired = (f) => f.status === 'failed' && (f.failReason === 'expired' || /hết hạn|expire/i.test(f.failReason || ''));

const BUCKETS = ['paid', 'awaiting', 'underpaid', 'expired', 'failed', 'cancelled', 'refunded'];
export const BUCKET_LABEL = { paid: 'Đã thanh toán', awaiting: 'Chờ thanh toán', underpaid: 'Thiếu tiền', expired: 'Hết hạn', failed: 'Thất bại', cancelled: 'Đã huỷ', refunded: 'Hoàn tiền' };
export const BUCKET_TONE = { paid: 'good', awaiting: 'warning', underpaid: 'serious', expired: 'neutral', failed: 'critical', cancelled: 'slot-3', refunded: 'critical' };
function bucketOf(f) {
  switch (f.status) {
    case 'paid': return 'paid';
    case 'refunded': return 'refunded';
    case 'cancelled': return 'cancelled';
    case 'failed': return isExpired(f) ? 'expired' : 'failed';
    default: return f.received > 0 && f.received < f.total ? 'underpaid' : 'awaiting';
  }
}

function revenue(w, fs) {
  const t = { gross: 0, discount: 0, net: 0, paidOrders: 0, averageOrderValue: 0, refunds: 0, refundCount: 0 };
  const daily = new Map(w.keys.map((date) => [date, { date, gross: 0, discount: 0, net: 0, refunds: 0 }]));
  fs.forEach((f) => {
    if (isRevenue(f) && inWindow(f.paid, w)) {
      t.gross += f.subtotal; t.discount += f.discount; t.net += f.total; t.paidOrders += 1;
      const row = daily.get(dayKey(f.paid)); if (row) { row.gross += f.subtotal; row.discount += f.discount; row.net += f.total; }
    }
    if (f.status === 'refunded' && inWindow(f.updated, w)) {
      t.refunds += f.total; t.refundCount += 1;
      const row = daily.get(dayKey(f.updated)); if (row) row.refunds += f.total;
    }
  });
  t.averageOrderValue = t.paidOrders ? Math.round(t.net / t.paidOrders) : 0;
  return { totals: t, daily: [...daily.values()] };
}

const PAYMENT_BUCKETS = [['< 1 phút', 1], ['1–5 phút', 5], ['5–15 phút', 15], ['15–30 phút', 30], ['Sau 30 phút', Infinity]];

/** Underpaid pending, pending ≥ 24 h, flagged — independent of the period, oldest first, max 50 rows. */
export function reconciliation(now = Date.now()) {
  let underpaid = 0; let stalePending = 0; let flagged = 0; const items = [];
  facts().forEach((f) => {
    const reasons = [];
    if (f.status === 'pending' && f.received > 0 && f.received < f.total) { reasons.push('underpaid'); underpaid += 1; }
    if (f.status === 'pending' && now - f.created > OVERDUE_MS) { reasons.push('stale'); stalePending += 1; }
    if (f.flagged) { reasons.push('flagged'); flagged += 1; }
    if (reasons.length) items.push({ ...f, reasons });
  });
  items.sort((a, b) => a.created - b.created);
  return { underpaid, stalePending, flagged, items: items.slice(0, RECONCILIATION_LIMIT) };
}

function courseRevenue(w, fs) {
  const rows = new Map();
  const rowFor = (id) => {
    if (!rows.has(id)) rows.set(id, { courseId: id, title: (Codi.course(id) || { title: '(đã xoá)' }).title, gross: 0, discount: 0, net: 0, refunds: 0, orderIds: new Set() });
    return rows.get(id);
  };
  fs.forEach((f) => f.items.forEach((it) => {
    const price = num(it.price ?? it.unitPrice);
    const lineDiscount = f.subtotal > 0 ? Math.round((price * f.discount) / f.subtotal) : 0;
    if (isRevenue(f) && inWindow(f.paid, w)) { const r = rowFor(it.courseId); r.gross += price; r.discount += lineDiscount; r.net += price - lineDiscount; r.orderIds.add(f.id); }
    if (f.status === 'refunded' && inWindow(f.updated, w)) rowFor(it.courseId).refunds += price - lineDiscount;
  }));
  return [...rows.values()].map(({ orderIds, ...r }) => ({ ...r, paidOrders: orderIds.size })).sort((a, b) => b.net - a.net || a.title.localeCompare(b.title));
}

function checkoutFunnel(w, fs) {
  const ev = arr(db().checkoutEvents).filter((e) => inWindow(e.at, w));
  const created = fs.filter((f) => inWindow(f.created, w));
  const cartClicks = ev.filter((e) => e.kind !== 'buy_now').length;
  const buyNowClicks = ev.filter((e) => e.kind === 'buy_now').length;
  const fromCart = created.filter((f) => !f.isBuyNow).length;
  const paid = created.filter(isRevenue).length;
  return { clicks: cartClicks + buyNowClicks, created: created.length, paid, sources: [['Giỏ hàng', cartClicks, fromCart], ['Mua ngay', buyNowClicks, created.length - fromCart]] };
}

/** S37 finance data for a period of `days` (7 / 30 / 90). */
export function finance(days, now = Date.now()) {
  const w = windowOf(days, now); const p = previousOf(w); const fs = facts();
  const cur = revenue(w, fs); const prev = revenue(p, fs);
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, { bucket: b, orders: 0, amount: 0 }]));
  fs.forEach((f) => { if (inWindow(f.created, w)) { const b = counts[bucketOf(f)]; b.orders += 1; b.amount += f.total; } });
  const buckets = PAYMENT_BUCKETS.map(([label]) => ({ label, orders: 0 }));
  fs.forEach((f) => {
    if (!isRevenue(f) || !inWindow(f.paid, w)) return;
    const minutes = (f.paid - f.created) / 60000;
    const i = PAYMENT_BUCKETS.findIndex(([, max]) => minutes < max);
    buckets[i === -1 ? buckets.length - 1 : i].orders += 1;
  });
  const paidTotal = buckets.reduce((s, b) => s + b.orders, 0); let seen = 0;
  const med = buckets.find((b) => { seen += b.orders; return paidTotal > 0 && seen * 2 >= paidTotal; });
  const vouchers = new Map();
  fs.forEach((f) => {
    if (!f.voucherCode || !isRevenue(f) || !inWindow(f.paid, w)) return;
    const r = vouchers.get(f.voucherCode) || { code: f.voucherCode, orders: 0, discount: 0, net: 0 };
    r.orders += 1; r.discount += f.discount; r.net += f.total; vouchers.set(f.voucherCode, r);
  });
  return {
    window: w, previousWindow: p,
    totals: cur.totals, previousTotals: prev.totals, daily: cur.daily, previousDaily: prev.daily,
    statusDistribution: BUCKETS.map((b) => counts[b]),
    courses: courseRevenue(w, fs),
    paymentTime: { buckets, medianLabel: med ? med.label : null },
    vouchers: [...vouchers.values()].sort((a, b) => b.net - a.net),
    reconciliation: reconciliation(now),
    checkout: checkoutFunnel(w, fs), previousCheckout: checkoutFunnel(p, fs),
  };
}

// ───────────────────────── learning activity ─────────────────────────
/** userId → Set(day keys with study time > 0), from studyLog plus the demo learner's learnerStudyDays. */
function activeDays() {
  const out = new Map();
  const add = (uid, k) => { if (!out.has(uid)) out.set(uid, new Set()); out.get(uid).add(k); };
  arr(db().studyLog).forEach((r) => Object.entries(r.days || {}).forEach(([k, v]) => { if (num(v && v.m) > 0) add(r.userId, k); }));
  arr(db().learnerStudyDays).forEach((r) => { if (num(r.minutes) > 0) add(r.userId, r.date); });
  return out;
}
/** day key → { requests, errors, rateLimited, latencies[] } from the AI usage recorded on study days. */
function aiDays() {
  const out = new Map();
  arr(db().studyLog).forEach((r) => Object.entries(r.days || {}).forEach(([k, v]) => {
    if (!v || !Array.isArray(v.ai) || !v.ai.length) return;
    const d = out.get(k) || { requests: 0, errors: 0, rateLimited: 0, latencies: [] };
    d.requests += v.ai.length; d.errors += num(v.err); d.rateLimited += num(v.rl); d.latencies.push(...v.ai.map(num));
    out.set(k, d);
  }));
  return out;
}
const lessonCompletions = () => arr(db().learnerProgress).flatMap((p) => Object.values(p.completedAt || {}).map(ms).filter((t) => t != null));
const lessonCount = (c) => (c && Codi.lessons ? Codi.lessons(c).length : 0);

function dayRows(w, series) {
  const rows = new Map(w.keys.map((date) => [date, { date, signups: 0, newEnrolments: 0, lessonsCompleted: 0, activeLearners: 0 }]));
  const bump = (t, key) => { const r = rows.get(dayKey(t)); if (r) r[key] += 1; };
  series.signups.forEach((t) => bump(t, 'signups'));
  series.enrolments.forEach((t) => bump(t, 'newEnrolments'));
  series.lessons.forEach((t) => bump(t, 'lessonsCompleted'));
  series.active.forEach((set) => set.forEach((k) => { const r = rows.get(k); if (r) r.activeLearners += 1; }));
  return [...rows.values()];
}
const totalsOf = (days) => {
  const s = (k) => days.reduce((x, d) => x + d[k], 0);
  return { signups: s('signups'), newEnrolments: s('newEnrolments'), lessonsCompleted: s('lessonsCompleted'), activeLearnersAvg: days.length ? Math.round(s('activeLearners') / days.length) : 0 };
};

/** A4 — enrolment-week cohorts × weeks since enrolment: % of the cohort's learners with study time that week. */
function retention(w, active, now) {
  const from = Math.min(w.start, windowOf(56, now).start);
  const cohorts = new Map();
  arr(db().enrolments).forEach((e) => {
    const t = ms(e.enrolledAt); if (t == null || t < from || t >= w.end) return;
    const ws = weekStart(dayKey(t));
    if (!cohorts.has(ws)) cohorts.set(ws, new Set());
    cohorts.get(ws).add(e.userId);
  });
  const today = dayKey(now);
  const rows = [...cohorts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-8).map(([ws, users]) => {
    const start = Date.parse(ws + 'T00:00:00Z');
    const cells = Array.from({ length: 9 }, (_, i) => {
      const keys = Array.from({ length: 7 }, (__, d) => new Date(start + (i * 7 + d) * DAY).toISOString().slice(0, 10));
      if (keys[0] > today) return null;
      const kept = [...users].filter((u) => { const s = active.get(u); return s && keys.some((k) => s.has(k)); }).length;
      return Math.round(pct(kept, users.size));
    });
    return { label: 'Tuần ' + dayLabel(ws), n: users.size, cells };
  });
  const all = { label: 'Tất cả', pinned: true, n: rows.reduce((s, r) => s + r.n, 0), cells: Array.from({ length: 9 }, (_, i) => { const rs = rows.filter((r) => r.cells[i] != null); const n = rs.reduce((s, r) => s + r.n, 0); return n ? Math.round(rs.reduce((s, r) => s + r.cells[i] * r.n, 0) / n) : null; }) };
  return { rows, all };
}

/** A6 — new enrolments in the window by how the learner started. */
function startChoice(w) {
  const es = arr(db().enrolments).filter((e) => inWindow(e.enrolledAt, w) && e.startMode);
  const weeks = new Map();
  es.forEach((e) => { const k = weekStart(dayKey(e.enrolledAt)); const x = weeks.get(k) || { diag: 0, n: 0 }; x.n += 1; if (e.startMode === 'diagnostic') x.diag += 1; weeks.set(k, x); });
  return {
    diagnostic: es.filter((e) => e.startMode === 'diagnostic').length,
    lesson1: es.filter((e) => e.startMode !== 'diagnostic').length,
    weeks: [...weeks.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, x]) => ({ week: k, rate: Math.round(pct(x.diag, x.n)), n: x.n })),
  };
}

/** A9 — AI assistant requests, path-generation errors, p95 latency, rate-limit hits in a window. */
function aiHealth(w, ai) {
  const days = w.keys.map((k) => { const d = ai.get(k); return { date: k, requests: d ? d.requests : 0, errors: d ? d.errors : 0, rateLimited: d ? d.rateLimited : 0, p95: d && d.latencies.length ? percentile(d.latencies, 95) : null }; });
  const diag = arr(db().enrolments).filter((e) => inWindow(e.enrolledAt, w) && e.startMode === 'diagnostic' && e.pathStatus);
  const p95s = days.map((d) => d.p95).filter((v) => v != null);
  return {
    days,
    requestsPerDay: days.length ? Math.round(days.reduce((s, d) => s + d.requests, 0) / days.length) : 0,
    requests: days.reduce((s, d) => s + d.requests, 0),
    errors: days.reduce((s, d) => s + d.errors, 0),
    pathRequests: diag.length, pathErrors: diag.filter((e) => e.pathStatus === 'error').length,
    pathErrorRate: diag.length ? pct(diag.filter((e) => e.pathStatus === 'error').length, diag.length) : null,
    p95: p95s.length ? median(p95s) : null,
    rateLimited: days.reduce((s, d) => s + d.rateLimited, 0),
  };
}

/** S36 insights data for a period of `days` (7 / 30 / 90). */
export function insights(days, now = Date.now()) {
  const w = windowOf(days, now); const p = previousOf(w); const d = db();
  const users = arr(d.users); const enrolments = arr(d.enrolments); const progress = arr(d.learnerProgress);
  const active = activeDays(); const ai = aiDays();
  const series = { signups: users.map((u) => ms(u.createdAt)).filter((t) => t != null), enrolments: enrolments.map((e) => ms(e.enrolledAt)).filter((t) => t != null), lessons: lessonCompletions(), active: [...active.values()] };
  const daily = dayRows(w, series); const previousDaily = dayRows(p, series);

  const paidBuyers = new Set(arr(d.orders).filter((o) => o.status === 'paid').map((o) => o.userId));
  const learnedSome = new Set(progress.filter((r) => arr(r.completed).length).map((r) => r.userId));
  const cohort = users.filter((u) => inWindow(u.createdAt, w));
  const funnel = { signups: cohort.length, verified: cohort.filter((u) => u.emailVerified === true || !!u.emailVerifiedAt).length, purchased: cohort.filter((u) => paidBuyers.has(u.id)).length, firstLesson: cohort.filter((u) => learnedSome.has(u.id)).length };

  const courses = arr(d.courses);
  const status = { draft: 0, pending: 0, rejected: 0, published: 0, hidden: 0 };
  courses.forEach((c) => { if (status[c.status] !== undefined) status[c.status] += 1; });
  const completion = courses.filter((c) => c.status === 'published').map((c) => {
    const total = lessonCount(c);
    const es = enrolments.filter((e) => e.courseId === c.id);
    const learners = new Set(es.map((e) => e.userId));
    const done = new Set(es.filter((e) => e.status === 'completed').map((e) => e.userId));
    progress.forEach((r) => { if (r.courseId === c.id && learners.has(r.userId) && total && arr(r.completed).length >= total) done.add(r.userId); });
    return { courseId: c.id, title: c.title, learners: learners.size, completed: done.size };
  }).sort((a, b) => b.learners - a.learners || a.title.localeCompare(b.title));

  const graded = arr(d.submissions).filter((s) => s.status === 'graded' && inWindow(s.gradedAt, w) && ms(s.submittedAt) != null).map((s) => (ms(s.gradedAt) - ms(s.submittedAt)) / HOUR);
  const operations = {
    unansweredQuestions: arr(d.questions).filter((q) => !q.parentId && q.status !== 'answered' && !q.hidden && now - ms(q.createdAt) > UNANSWERED_AFTER_MS).length,
    unrepliedReviews: arr(d.reviews).filter((r) => !r.reply && !r.lecturerReply && r.hidden !== true && r.isVisible !== false).length,
    gradingHoursMedian: median(graded), gradedCount: graded.length,
  };

  return {
    window: w, previousWindow: p, daily, previousDaily, totals: totalsOf(daily), previousTotals: totalsOf(previousDaily),
    publishedCourses: status.published, funnel, courseStatus: status, completion, operations,
    retention: retention(w, active, now), startChoice: startChoice(w), previousStartChoice: startChoice(p),
    ai: aiHealth(w, ai), previousAi: aiHealth(p, ai),
  };
}

// ───────────────────────── dashboard ─────────────────────────
/** S30 KPIs and "Cần xử lý" counts. Revenue / orders use the same 30-day window and basis as B1 / B4. */
export function dashboard(now = Date.now()) {
  const f = finance(30, now); const w = f.window; const d = db();
  return {
    window: w,
    revenue: f.totals.net, paidOrders: f.totals.paidOrders,
    orders: f.statusDistribution.reduce((s, b) => s + b.orders, 0),
    newLearners: arr(d.users).filter((u) => u.role === 'learner' && inWindow(u.createdAt, w)).length,
    publishedCourses: arr(d.courses).filter((c) => c.status === 'published').length,
    pendingCourses: arr(d.courses).filter((c) => c.status === 'pending').length,
    overdueOrders: arr(d.orders).filter((o) => isOverdue(o, now)).length,
    nearLimitVouchers: arr(d.vouchers).filter((v) => v.active && num(v.usageLimit) > 0 && num(v.used) * 10 >= num(v.usageLimit) * 9).length,
    inactiveUsers: arr(d.users).filter((u) => u.status === 'inactive').length,
  };
}
