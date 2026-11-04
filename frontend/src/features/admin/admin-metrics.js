/**
 * Admin analytics helpers: GMT+7 day keys and range labels for the "Quan sát hệ thống" (A1–A9) and "Tài chính"
 * (B1–B9) cards, and the adapter from GET /api/admin/{insights|finance}/overview to the shape the cards render.
 * Cards the backend has no source for (A4, A6, A9, the A8 grading median, B5) are rendered as unavailable, as in
 * the real app; nothing is computed in the browser.
 */
export const DAY = 86400000;
const TZ = 7 * 3600000;

const ms = (v) => (v == null || v === '' ? null : typeof v === 'number' ? v : (Number.isFinite(Date.parse(v)) ? Date.parse(v) : null));

/** GMT+7 calendar day of an instant: "2026-10-23". */
export const dayKey = (t) => new Date(ms(t) + TZ).toISOString().slice(0, 10);
const span = (start, end) => { const keys = []; for (let t = start; t < end; t += DAY) keys.push(dayKey(t)); return { start, end, keys, days: keys.length }; };
export const dayLabel = (k) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
export const dayLabelFull = (k) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;
const rangeOf = (w) => `${dayLabelFull(w.keys[0])} – ${dayLabelFull(w.keys[w.keys.length - 1])}`;
/** "01/10/2026 – 30/10/2026 (GMT+7) · so với 01/09/2026 – 30/09/2026" */
export const rangeLabel = (w, p) => `${rangeOf(w)} (GMT+7)${p ? ` · so với ${rangeOf(p)}` : ''}`;

export const BUCKET_LABEL = { paid: 'Đã thanh toán', awaiting: 'Chờ thanh toán', underpaid: 'Thiếu tiền', expired: 'Hết hạn', failed: 'Thất bại', cancelled: 'Đã huỷ', refunded: 'Hoàn tiền' };
export const BUCKET_TONE = { paid: 'good', awaiting: 'warning', underpaid: 'serious', expired: 'neutral', failed: 'critical', cancelled: 'slot-3', refunded: 'critical' };

/** Backend window { start, end } (ISO) → the { start, end, keys, days } shape the cards render. */
const fromIsoWindow = (w) => span(Date.parse(w.start), Date.parse(w.end));

/** Adapts the backend overview of `page` ('insights' | 'finance') to the card data shape. */
export function fromOverview(page, server) {
  const window = fromIsoWindow(server.window);
  const previousWindow = fromIsoWindow(server.previousWindow);
  if (page === 'insights') return { ...server, window, previousWindow };
  const r = server.reconciliation;
  return {
    ...server, window, previousWindow,
    reconciliation: { ...r, items: r.items.map((x) => ({ id: x.code, code: x.code, status: x.status, total: x.totalAmount, received: x.receivedAmount, created: Date.parse(x.createdAt), reasons: x.reasons })) },
  };
}
