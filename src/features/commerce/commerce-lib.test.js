/**
 * Unit tests for the pure commerce rules (no test runner is installed; run with node's built-in runner):
 *   npx esbuild src/features/commerce/commerce-lib.test.js --bundle --platform=node --format=esm --outfile=<tmp>/t.mjs
 *   node --test <tmp>/t.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTransfer, filterCatalog, normaliseSort, typeaheadSuggestions } from './commerce-lib';

const baseOrder = (over = {}) => ({
  id: 'order-1', code: 'CODI12345', userId: 'u1', items: [{ courseId: 'c1', price: 500000 }], voucherCode: null,
  discount: 0, total: 500000, status: 'pending', received: 0, failReason: null, timeline: [], ...over,
});

test('transfer without the order code in the content is ignored', () => {
  const o = baseOrder();
  const r = applyTransfer(o, { amount: 500000, content: 'chuyen tien' });
  assert.equal(r.result, 'ignored');
  assert.equal(r.order, o);
});

test('full transfer settles the order, enrols items and notifies', () => {
  const o = baseOrder();
  const r = applyTransfer(o, { amount: 500000, content: 'codi12345 thanh toan' });
  assert.equal(r.result, 'paid');
  assert.equal(r.order.status, 'paid');
  assert.equal(r.order.received, 500000);
  assert.deepEqual(r.enroll, ['c1']);
  assert.equal(r.notify, true);
  assert.equal(r.order.timeline.at(-1).label, 'Đã nhận tiền');
  assert.equal(o.status, 'pending', 'input is not mutated');
});

test('partial transfers accumulate and stay pending until the total is reached', () => {
  const first = applyTransfer(baseOrder(), { amount: 200000, content: 'CODI12345' });
  assert.equal(first.result, 'underpaid');
  assert.equal(first.order.status, 'pending');
  assert.equal(first.order.received, 200000);
  const second = applyTransfer(first.order, { amount: 300000, content: 'CODI12345' });
  assert.equal(second.result, 'paid');
  assert.equal(second.order.received, 500000);
});

test('overpayment settles and flags reconciliation', () => {
  const r = applyTransfer(baseOrder(), { amount: 550000, content: 'CODI12345' });
  assert.equal(r.result, 'paid');
  assert.equal(r.order.needsReconciliation, true);
  assert.equal(r.order.timeline.at(-1).type, 'overpaid');
});

test('late transfer after expiry is honoured unless every course is already owned', () => {
  const expired = baseOrder({ status: 'failed', failReason: 'expired' });
  const late = applyTransfer(expired, { amount: 500000, content: 'CODI12345' }, { ownsAll: false });
  assert.equal(late.result, 'late_paid');
  assert.equal(late.order.status, 'paid');
  assert.equal(late.order.needsReconciliation, false);
  assert.equal(late.order.timeline.at(-1).label, 'Thanh toán muộn được chấp nhận');

  const owned = applyTransfer(expired, { amount: 500000, content: 'CODI12345' }, { ownsAll: true });
  assert.equal(owned.result, 'late_owned');
  assert.equal(owned.order.status, 'failed');
  assert.equal(owned.order.needsReconciliation, true);
  assert.deepEqual(owned.enroll, []);
});

test('partial transfer after expiry keeps the order failed and flags reconciliation', () => {
  const r = applyTransfer(baseOrder({ status: 'failed', failReason: 'expired' }), { amount: 100000, content: 'CODI12345' });
  assert.equal(r.result, 'underpaid');
  assert.equal(r.order.status, 'failed');
  assert.equal(r.order.needsReconciliation, true);
});

test('money for a cancelled order is recorded for refund without changing its status', () => {
  const r = applyTransfer(baseOrder({ status: 'cancelled' }), { amount: 500000, content: 'CODI12345' });
  assert.equal(r.result, 'not_pending');
  assert.equal(r.order.status, 'cancelled');
  assert.equal(r.order.received, 500000);
  assert.equal(r.order.needsReconciliation, true);
});

test('voucher claim is skipped and flagged when the voucher is exhausted', () => {
  const o = baseOrder({ voucherCode: 'WELCOME20' });
  const ok = applyTransfer(o, { amount: 500000, content: 'CODI12345' }, { voucher: { usageLimit: 10, used: 3 } });
  assert.equal(ok.claimVoucher, true);
  const full = applyTransfer(o, { amount: 500000, content: 'CODI12345' }, { voucher: { usageLimit: 10, used: 10 } });
  assert.equal(full.claimVoucher, false);
  assert.equal(full.order.needsReconciliation, true);
  assert.equal(full.order.timeline.at(-1).type, 'voucher_over_limit');
});

const entries = [
  { id: 'c1', title: 'React Fundamentals', description: 'Learn React', category: 'Frontend', categoryId: 'fe', level: 'Beginner', topics: ['React', 'Hooks'], price: 1000, enrollmentCount: 5, rating: 4.1, createdAt: '2026-01-01' },
  { id: 'c2', title: 'Node.js Backend', description: 'APIs with React clients', category: 'Backend', categoryId: 'be', level: 'Intermediate', topics: ['Express'], price: 0, enrollmentCount: 50, rating: 4.8, createdAt: '2026-03-01' },
  { id: 'c3', title: 'Python Data', description: 'Pandas', category: 'Dữ liệu', categoryId: 'da', level: 'Advanced', topics: [], price: 2000, enrollmentCount: 20, rating: 4.5, createdAt: '2026-02-01' },
];

test('"Phù hợp nhất" ranks title matches before enrolment count', () => {
  const r = filterCatalog(entries, 'react', { sort: 'popular' });
  assert.deepEqual(r.map((e) => e.id), ['c1', 'c2']);
  assert.deepEqual(filterCatalog(entries, '', { sort: 'popular' }).map((e) => e.id), ['c2', 'c3', 'c1']);
});

test('filters by topic, category, level and price; sorts by newest and rating', () => {
  assert.deepEqual(filterCatalog(entries, 'hooks').map((e) => e.id), ['c1']);
  assert.deepEqual(filterCatalog(entries, '', { price: 'free' }).map((e) => e.id), ['c2']);
  assert.deepEqual(filterCatalog(entries, '', { cat: 'da', level: 'Advanced' }).map((e) => e.id), ['c3']);
  assert.deepEqual(filterCatalog(entries, '', { sort: 'newest' }).map((e) => e.id), ['c2', 'c3', 'c1']);
  assert.deepEqual(filterCatalog(entries, '', { sort: 'rating' }).map((e) => e.id), ['c2', 'c3', 'c1']);
});

test('legacy and unknown sort values fall back to "popular"', () => {
  assert.equal(normaliseSort('price-asc'), 'popular');
  assert.equal(normaliseSort('relevant'), 'popular');
  assert.equal(normaliseSort('enrollment'), 'enrollment');
});

test('typeahead returns suggestions, course then topic top results, and an empty flag', () => {
  const t = typeaheadSuggestions(entries, 'react');
  assert.deepEqual(t.querySuggestions, ['React Fundamentals', 'React']);
  assert.deepEqual(t.topResults.map((r) => r.type), ['Khóa học', 'Khóa học', 'Chủ đề']);
  assert.equal(t.matches.length, 2);
  assert.equal(typeaheadSuggestions(entries, 'zzz').isEmpty, true);
  assert.equal(typeaheadSuggestions(entries, '  ').isEmpty, false);
});
