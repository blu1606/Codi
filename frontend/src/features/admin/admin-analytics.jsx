/**
 * S36 "Quan sát hệ thống" (A1–A9) and S37 "Tài chính" (B1–B9).
 * Routes (admin): /admin/insights · /admin/insights/:card · /admin/finance · /admin/finance/:card
 *
 * Port of the real admin-insights-view / admin-finance-view. Data: GET /api/admin/insights/overview and
 * /api/admin/finance/overview (?period=7|30|90). Cards the real app marks unavailable (A4, A6, A9, the A8 grading
 * median and B5) show the same "chưa có số liệu" reason as the real app. The period choice and the expanded state
 * are a browser preference (localStorage). Period presets 7 / 30 / 90 ngày (real), previous period always compared. Mockup additions kept: per-card detail view with the
 * full table + CSV, and the B9 export dialog.
 *
 * Cards are built with the chart kit (src/lib/charts.js), which returns trusted HTML strings. Card bodies are
 * composed with a local escaping `html` tag and rendered via <Html>; "#/…" links inside that markup are handled
 * by one container click handler.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { charts } from '../../lib/charts';
import { ICON_PATHS } from '../../lib/icon-paths';
import { Icon, Html, Empty, esc } from '../../components/ui/primitives';
import { AdminShell } from './admin-shell';
import { fromOverview, rangeLabel, dayLabel, dayLabelFull, dayKey, BUCKET_LABEL, BUCKET_TONE } from './admin-metrics';
import { useAdminGet } from './admin-data';

const { fmt } = Codi;

// ───────────────────────── trusted-markup helpers ─────────────────────────
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
const safe = (s) => new Safe(String(s == null ? '' : s));
const part = (v) => (v == null || v === false ? '' : v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
/** Tagged template: interpolated values are escaped unless they are Safe (or arrays of Safe). */
function html(strings, ...vals) { let o = strings[0]; vals.forEach((v, i) => { o += part(v) + strings[i + 1]; }); return new Safe(o); }
const iconHtml = (name, cls) => safe(`<svg class="icon ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`);

// Chart kit wrapped so its HTML output is treated as trusted inside `html`.
const ch = {
  kpi: (o) => safe(charts.kpi(o)), line: (o) => safe(charts.line(o)), bars: (o) => safe(charts.bars(o)), hbars: (o) => safe(charts.hbars(o)),
  funnel: (o) => safe(charts.funnel(o)), stacked: (o) => safe(charts.stacked(o)), heatmap: (o) => safe(charts.heatmap(o)),
  table: (h, r, o) => safe(charts.table(h, r, o)), card: (o) => safe(charts.card(o)), csv: (...a) => charts.csv(...a), fmt: charts.fmt,
};

const PERIODS = [{ v: '7', label: '7 ngày', days: 7 }, { v: '30', label: '30 ngày', days: 30 }, { v: '90', label: '90 ngày', days: 90 }];
const PREFS_KEY = 'codi-admin-analytics';
let prefsCache = null;
/** Browser-only UI preference: selected period and which "Chi tiết thêm" sections are open. */
const prefs = () => {
  if (!prefsCache) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch { saved = {}; }
    prefsCache = { period: saved.period || '30', open: { insights: false, finance: false, ...(saved.open || {}) } };
  }
  return prefsCache;
};
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs())); } catch { /* storage blocked: lasts for this tab */ } };

/** Card the backend has no data source for (same reasons as the real app). No table, so no detail view or CSV. */
const unavailable = (code, title, question, reason, wide) => ({
  code, title, question, wide, body: html`<p class="viz-empty" role="status">${reason}</p>`,
});
const period = () => (PERIODS.find((x) => x.v === prefs().period) || PERIODS[1]).v;

const vnd = (n) => fmt.vnd(Math.round(n || 0));
const P = (v) => ch.fmt.pct(v, v < 10 ? 1 : 0);
const pct = (part, whole) => (whole ? (part / whole) * 100 : 0);
const sum = (rows, k) => rows.reduce((s, r) => s + (typeof k === 'function' ? k(r) : r[k] || 0), 0);
/** Current + dashed previous series aligned by position (real LineChart pairs). */
const pair = (cur, prev, y) => [
  { name: 'Kỳ này', points: cur.map((d) => ({ x: d.date, y: y(d), label: dayLabel(d.date) })) },
  { name: 'Kỳ trước', dashed: true, points: prev.map((d, i) => (cur[i] ? { x: cur[i].date, y: y(d), label: dayLabel(cur[i].date), note: dayLabel(d.date) } : null)).filter(Boolean) },
];

// ───────────────────────── S36 cards ─────────────────────────
const INSIGHTS = {
  a1(d) {
    const t = d.totals; const p = d.previousTotals;
    const tiles = [
      { label: 'Học viên có học (TB/ngày)', value: t.activeLearnersAvg, prev: p.activeLearnersAvg },
      { label: 'Đăng ký mới', value: t.signups, prev: p.signups, spark: d.daily.map((x) => x.signups) },
      { label: 'Ghi danh mới', value: t.newEnrolments, prev: p.newEnrolments, spark: d.daily.map((x) => x.newEnrolments) },
      { label: 'Bài học hoàn thành', value: t.lessonsCompleted, prev: p.lessonsCompleted, spark: d.daily.map((x) => x.lessonsCompleted) },
      { label: 'Khóa đang bán', value: d.publishedCourses, compare: false, note: 'Tại thời điểm hiện tại' },
    ];
    return {
      code: 'A1', title: 'Chỉ số chính', question: 'Nền tảng đang lớn lên hay chững lại?', wide: true,
      body: html`<div class="viz-kpis">${tiles.map((x) => ch.kpi({ compare: true, ...x }))}</div>`,
      table: { headers: ['Chỉ số', 'Kỳ này', 'Kỳ trước'], rows: [
        ['Học viên có học (TB/ngày)', fmt.num(t.activeLearnersAvg), fmt.num(p.activeLearnersAvg)],
        ['Đăng ký mới', fmt.num(t.signups), fmt.num(p.signups)],
        ['Ghi danh mới', fmt.num(t.newEnrolments), fmt.num(p.newEnrolments)],
        ['Bài học hoàn thành', fmt.num(t.lessonsCompleted), fmt.num(p.lessonsCompleted)],
        ['Khóa đang bán (hiện tại)', fmt.num(d.publishedCourses), '—'],
      ] },
    };
  },
  a2(d) {
    return {
      code: 'A2', title: 'Học viên có học mỗi ngày', question: 'Số học viên có ghi nhận thời gian học trong ngày, so với kỳ trước', wide: true,
      body: html`${ch.line({ series: pair(d.daily, d.previousDaily, (x) => x.activeLearners), ariaLabel: 'Học viên có học mỗi ngày', height: 200, yFormat: ch.fmt.num })}
        <p class="xsmall muted" style="margin:8px 0 0">TB: ${fmt.num(d.totals.activeLearnersAvg)} học viên/ngày · Kỳ trước: ${fmt.num(d.previousTotals.activeLearnersAvg)}</p>`,
      note: 'Tính theo thời gian học được ghi nhận, không phải lượt đăng nhập.',
      table: { headers: ['Ngày', 'Kỳ này', 'Kỳ trước (cùng vị trí)'], rows: d.daily.map((x, i) => [dayLabelFull(x.date), fmt.num(x.activeLearners), d.previousDaily[i] ? fmt.num(d.previousDaily[i].activeLearners) : '—']) },
    };
  },
  a3(d) {
    const f = d.funnel;
    const steps = [{ label: 'Đăng ký', value: f.signups }, { label: 'Xác thực email', value: f.verified }, { label: 'Mua lần đầu', value: f.purchased }, { label: 'Hoàn thành bài đầu tiên', value: f.firstLesson }];
    return {
      code: 'A3', title: 'Phễu kích hoạt', question: 'Người mới rơi rụng ở bước nào?', sample: f.signups,
      body: ch.funnel({ steps, format: fmt.num, emptyText: 'Không có tài khoản nào được tạo trong kỳ này.' }),
      note: 'Nhóm = tài khoản tạo trong kỳ. Xác thực, mua và bài đầu tiên tính theo trạng thái hiện tại.',
      table: { headers: ['Bước', 'Số lượng', '% so với đăng ký'], rows: steps.map((s, i) => [s.label, fmt.num(s.value), i ? P(pct(s.value, f.signups)) : '100%']) },
    };
  },
  a7(d) {
    const s = d.courseStatus;
    const segs = [{ label: 'Bản nháp', value: s.draft, tone: 'neutral' }, { label: 'Chờ duyệt', value: s.pending, tone: 'warning' }, { label: 'Đã xuất bản', value: s.published, tone: 'accent' }, { label: 'Đã ẩn', value: s.hidden, tone: 'slot-3' }, { label: 'Bị từ chối', value: s.rejected, tone: 'critical' }];
    return {
      code: 'A7', title: 'Khóa học theo trạng thái', question: 'Có khóa nào đang tắc ở khâu duyệt?',
      body: html`${ch.stacked({ segments: segs, format: fmt.num, keepZero: true, emptyText: 'Chưa có khóa học nào.' })}
        ${s.pending ? html`<a class="btn btn-secondary btn-sm" style="margin-top:12px" href="#/admin/publication?tab=pending">Mở hàng chờ duyệt (${s.pending})</a>` : ''}`,
      note: 'Tại thời điểm hiện tại, không theo kỳ.',
      table: { headers: ['Trạng thái', 'Số khóa'], rows: segs.map((x) => [x.label, fmt.num(x.value)]) },
    };
  },
  a8(d) {
    const o = d.operations;
    return {
      code: 'A8', title: 'Sức khỏe vận hành', question: 'Học viên có đang phải chờ quá lâu?',
      body: html`<div class="viz-kpis">
        ${ch.kpi({ label: 'Câu hỏi chưa trả lời > 48 giờ', value: o.unansweredQuestions, compare: false })}
        ${ch.kpi({ label: 'Đánh giá chưa phản hồi', value: o.unrepliedReviews, compare: false })}
      </div>`,
      note: 'Tại thời điểm hiện tại. Thời gian chấm bài trung vị chưa có số liệu đã xác minh.',
      table: { headers: ['Chỉ số (thấp hơn là tốt)', 'Hiện tại'], rows: [
        ['Câu hỏi chưa trả lời > 48 giờ', fmt.num(o.unansweredQuestions)],
        ['Đánh giá chưa phản hồi', fmt.num(o.unrepliedReviews)],
      ] },
    };
  },
  a4: () => unavailable('A4', 'Giữ chân theo nhóm ghi danh', 'Sau bao nhiêu tuần học viên bắt đầu bỏ học?', 'Chưa có số liệu giữ chân theo tuần: chưa có nhật ký hoạt động theo nhóm ghi danh đã xác minh.', true),
  a5(d) {
    const rows = d.completion.filter((c) => c.learners > 0);
    const rate = (c) => pct(c.completed, c.learners);
    return {
      code: 'A5', title: 'Tỉ lệ hoàn thành theo khóa', question: 'Khóa nào học viên học tới cùng?', wide: true,
      body: ch.hbars({ items: rows.map((c) => ({ label: c.title, value: rate(c), max: 100, text: `${P(rate(c))} (${fmt.num(c.completed)}/${fmt.num(c.learners)})` })), format: (v) => P(v), emptyText: 'Chưa có khóa học xuất bản nào có học viên.' }),
      note: 'Snapshot ghi danh hiện tại, không theo kỳ.',
      table: { headers: ['Khóa học', 'Học viên', 'Hoàn thành', 'Tỉ lệ'], rows: rows.map((c) => [c.title, fmt.num(c.learners), fmt.num(c.completed), P(rate(c))]) },
    };
  },
  a6: () => unavailable('A6', 'Làm bài kiểm tra đầu vào hay học từ bài 1', 'Bao nhiêu học viên mới chọn tìm điểm bắt đầu?', 'Chưa có số liệu: hệ thống chưa ghi nhận lựa chọn học từ bài 1 hay làm bài đầu vào.'),
  a9: () => unavailable('A9', 'Sức khỏe AI', 'AI có đang chậm hoặc lỗi nhiều hơn?', 'Chưa có số liệu độ trễ p95 và lần chạm giới hạn tốc độ AI: chưa có nguồn dữ liệu đã xác minh.', true),
};

// ───────────────────────── S37 cards ─────────────────────────
const ORDER_STATUS = { pending: 'Chờ thanh toán', paid: 'Đã thanh toán', failed: 'Thất bại / hết hạn', cancelled: 'Đã huỷ', refunded: 'Đã hoàn tiền' };
const REASON = { underpaid: 'Thiếu tiền', stale: 'Chờ quá 24 giờ', flagged: 'Cần đối soát' };

const FIN = {
  b1(d) {
    const t = d.totals; const p = d.previousTotals;
    const tiles = [
      { label: 'Doanh thu gộp', value: t.gross, prev: p.gross, format: vnd },
      { label: 'Doanh thu ròng sau giảm giá', value: t.net, prev: p.net, format: vnd },
      { label: 'Tiền giảm giá', value: t.discount, prev: p.discount, format: vnd, deltaGood: 'down' },
      { label: 'Hoàn tiền', value: t.refunds, prev: p.refunds, format: vnd, deltaGood: 'down' },
      { label: 'Đơn đã thanh toán', value: t.paidOrders, prev: p.paidOrders },
      { label: 'Giá trị đơn trung bình', value: t.averageOrderValue, prev: p.averageOrderValue, format: vnd },
    ];
    return {
      code: 'B1', title: 'Chỉ số doanh thu', question: 'Kỳ này thu được bao nhiêu?', wide: true,
      body: html`<div class="viz-kpis">${tiles.map((x) => ch.kpi({ compare: true, ...x }))}</div>`,
      table: { headers: ['Chỉ số', 'Kỳ này', 'Kỳ trước'], rows: [
        ['Doanh thu gộp', vnd(t.gross), vnd(p.gross)], ['Doanh thu ròng sau giảm giá', vnd(t.net), vnd(p.net)],
        ['Tiền giảm giá', vnd(t.discount), vnd(p.discount)], ['Hoàn tiền', vnd(t.refunds), vnd(p.refunds)],
        ['Đơn đã thanh toán', fmt.num(t.paidOrders), fmt.num(p.paidOrders)], ['Giá trị đơn trung bình (ròng)', vnd(t.averageOrderValue), vnd(p.averageOrderValue)],
      ] },
    };
  },
  b2(d) {
    return {
      code: 'B2', title: 'Doanh thu ròng theo ngày', question: 'Doanh thu theo ngày trong kỳ, so với kỳ trước', wide: true,
      body: ch.line({ series: pair(d.daily, d.previousDaily, (x) => x.net), yFormat: (v) => ch.fmt.compact(v), ariaLabel: 'Doanh thu ròng theo ngày', height: 220 }),
      note: `Trung bình kỳ này: ${vnd(d.totals.net / Math.max(d.daily.length, 1))}/ngày`,
      table: { headers: ['Ngày', 'Ròng kỳ này', 'Ròng kỳ trước (cùng vị trí)'], rows: d.daily.map((x, i) => [dayLabelFull(x.date), vnd(x.net), d.previousDaily[i] ? vnd(d.previousDaily[i].net) : '—']) },
    };
  },
  b4(d) {
    const total = sum(d.statusDistribution, 'orders');
    return {
      code: 'B4', title: 'Trạng thái đơn hàng', question: 'Bao nhiêu đơn tạo ra thực sự được thanh toán?', wide: true,
      body: ch.stacked({ segments: d.statusDistribution.map((r) => ({ label: BUCKET_LABEL[r.bucket], value: r.orders, amount: r.amount, tone: BUCKET_TONE[r.bucket] })), format: fmt.num, amountFormat: vnd, emptyText: 'Không có đơn nào được tạo trong kỳ này.' }),
      note: `Tỉ lệ thanh toán: ${P(pct(d.totals.paidOrders, total))} trên ${fmt.num(total)} đơn tạo trong kỳ. Theo ngày tạo đơn.`,
      table: { headers: ['Trạng thái', 'Số đơn', 'Tổng tiền đơn'], rows: d.statusDistribution.map((r) => [BUCKET_LABEL[r.bucket], fmt.num(r.orders), vnd(r.amount)]) },
    };
  },
  b8(d) {
    const r = d.reconciliation;
    const tile = (label, value, note, href) => html`<div class="viz-attn-card ${value ? 'has-items' : ''}"><span class="small muted">${label}</span><span class="viz-attn-count">${fmt.num(value)}</span><span class="xsmall muted">${note}</span>${value ? html`<a class="btn btn-secondary btn-sm" href="#${href}">Mở danh sách</a>` : ''}</div>`;
    const rows = r.items.map((f) => [f.code, ORDER_STATUS[f.status] || f.status, vnd(f.total), vnd(f.received), f.reasons.map((x) => REASON[x]).join(', '), dayLabelFull(dayKey(f.created))]);
    return {
      code: 'B8', title: 'Cần đối soát', question: 'Việc gì cần làm ngay?', wide: true,
      body: html`<div class="viz-attn">
          ${tile('Đơn thiếu tiền', r.underpaid, 'Liên hệ người mua để nhận đủ tiền.', '/admin/orders?status=pending&range=all')}
          ${tile('Đơn chờ quá 24 giờ', r.stalePending, 'Đối soát sao kê với mã CODI#####.', '/admin/orders?status=pending&overdue=1&range=all')}
          ${tile('Đơn được đánh dấu đối soát', r.flagged, 'Thanh toán thừa, muộn hoặc hết hạn khi thiếu tiền.', '/admin/orders?reconciliation=1&range=all')}
        </div>
        ${r.items.length ? html`<div class="table-wrap" style="margin-top:12px"><table class="table viz-data-table"><caption class="sr-only">Đơn cần đối soát</caption>
          <thead><tr><th scope="col">Mã đơn</th><th scope="col">Trạng thái</th><th scope="col" class="num">Tổng tiền</th><th scope="col" class="num">Đã nhận</th><th scope="col">Lý do</th><th scope="col">Tạo lúc</th></tr></thead>
          <tbody>${r.items.map((f, i) => html`<tr><th scope="row"><a class="mono" href="#/admin/orders?range=all&id=${f.id}">${f.code}</a></th><td>${rows[i][1]}</td><td class="num">${rows[i][2]}</td><td class="num">${rows[i][3]}</td><td>${rows[i][4]}</td><td>${rows[i][5]}</td></tr>`)}</tbody></table></div>`
          : html`<p class="viz-empty" role="status">Không có đơn cần đối soát.</p>`}`,
      note: 'Không phụ thuộc khoảng thời gian. Danh sách hiển thị tối đa 50 đơn, cũ nhất trước.',
      table: { headers: ['Mã đơn', 'Trạng thái', 'Tổng tiền', 'Đã nhận', 'Lý do', 'Tạo lúc'], rows },
    };
  },
  b3(d) {
    const rows = d.courses.filter((c) => c.gross > 0 || c.refunds > 0);
    const max = rows.reduce((m, r) => Math.max(m, r.net), 0);
    return {
      code: 'B3', title: 'Doanh thu theo khóa học', question: 'Nguồn doanh thu đến từ đâu?', wide: true,
      body: ch.hbars({ items: rows.map((r) => ({ label: r.title, value: r.net, max: max || 1, text: vnd(r.net) })), sort: false, format: (v) => ch.fmt.compact(v), emptyText: 'Không có khóa học nào có doanh thu trong kỳ này.' }),
      note: 'Giảm giá được chia theo tỉ trọng giá của từng khóa trong đơn, nên tổng khóa có thể lệch vài đồng so với tổng.',
      table: { headers: ['Khóa học', 'Đơn', 'Gộp', 'Giảm giá', 'Ròng', 'Hoàn tiền'], rows: rows.map((r) => [r.title, fmt.num(r.paidOrders), vnd(r.gross), vnd(r.discount), vnd(r.net), vnd(r.refunds)]) },
    };
  },
  b5: () => unavailable('B5', 'Phễu thanh toán', 'Khách bỏ ở bước nào trước khi trả tiền?', 'Chưa có số liệu: hệ thống chưa lưu lịch sử thêm giỏ hàng và mua ngay để dựng phễu từ giỏ tới thanh toán.'),
  b6(d) {
    const b = d.paymentTime.buckets; const total = sum(b, 'orders');
    return {
      code: 'B6', title: 'Thời gian từ tạo đơn đến thanh toán', question: 'Khách mất bao lâu để chuyển khoản?', sample: total, minSample: 10,
      body: ch.bars({ items: b.map((x) => ({ label: x.label, value: x.orders })), format: fmt.num, valueLabel: 'Số đơn', ariaLabel: 'Phân bố thời gian thanh toán', emptyText: 'Không có đơn nào được thanh toán trong kỳ này.' }),
      note: d.paymentTime.medianLabel ? `Trung vị: ${d.paymentTime.medianLabel}` : null,
      table: { headers: ['Khoảng thời gian', 'Số đơn'], rows: b.map((x) => [x.label, fmt.num(x.orders)]) },
    };
  },
  b7(d) {
    const rows = d.vouchers;
    return {
      code: 'B7', title: 'Hiệu quả voucher', question: 'Voucher nào mang lại doanh thu?', wide: true,
      body: rows.length ? html`<div class="table-wrap"><table class="table viz-data-table"><caption class="sr-only">Hiệu quả voucher</caption><thead><tr><th scope="col">Mã</th><th scope="col" class="num">Đơn dùng</th><th scope="col" class="num">Tiền giảm</th><th scope="col" class="num">Doanh thu ròng</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr><th scope="row"><span class="mono">${r.code}</span></th><td class="num">${fmt.num(r.orders)}</td><td class="num">${vnd(r.discount)}</td><td class="num">${vnd(r.net)}</td></tr>`)}</tbody></table></div>`
        : html`<div class="viz-empty">Không có đơn nào dùng voucher trong kỳ này.</div>`,
      table: { headers: ['Mã', 'Đơn dùng', 'Tiền giảm', 'Doanh thu ròng'], rows: rows.map((r) => [r.code, fmt.num(r.orders), vnd(r.discount), vnd(r.net)]) },
    };
  },
  b9() {
    return {
      code: 'B9', title: 'Xuất CSV', question: 'Tải số liệu của trang này cho kế toán',
      body: html`<p class="small" style="margin:0 0 12px">Chọn thẻ cần xuất. File dùng đúng khoảng thời gian đang chọn, giờ theo GMT+7.</p><button type="button" class="btn btn-secondary" data-action="aa-export" data-page="finance">${iconHtml('download', 'icon-sm')} Xuất CSV…</button>`,
    };
  },
};

const PAGES = {
  insights: {
    title: 'Quan sát hệ thống', lead: 'Người dùng, nội dung, vận hành và AI — cùng một khoảng thời gian cho mọi thẻ.', route: '/admin/insights',
    cards: INSIGHTS, overview: ['a1', 'a2', 'a3', 'a7', 'a8'], more: ['a5', 'a4', 'a6', 'a9'], collapsible: true,
    basis: 'Nguồn: tài khoản, ghi danh, tiến độ học, nhật ký học, sự kiện mua hàng, câu hỏi, đánh giá và bài nộp trong hệ thống. Ngày tính theo GMT+7, gồm cả hôm nay; "Kỳ trước" là khoảng có cùng độ dài ngay trước kỳ này.',
    error: 'Không tải được thống kê.',
    quiet: (d) => (sum(d.daily, (x) => x.signups + x.newEnrolments + x.lessonsCompleted + x.activeLearners) === 0 ? 'Không có hoạt động nào được ghi nhận trong kỳ này.' : null),
  },
  finance: {
    title: 'Tài chính', lead: 'Doanh thu, đơn hàng và việc cần đối soát.', route: '/admin/finance',
    cards: FIN, overview: ['b1', 'b2', 'b4', 'b8'], more: ['b3', 'b5', 'b6', 'b7', 'b9'], collapsible: true,
    error: 'Không tải được số liệu tài chính.',
    basis: 'Gộp = tổng giá gốc của đơn đã thanh toán, tính theo ngày thanh toán. Ròng = gộp − giảm giá. Hoàn tiền = đơn đã hoàn, tính theo ngày cập nhật gần nhất.',
    quiet: (d) => (d.totals.paidOrders === 0 && d.statusDistribution.every((r) => r.orders === 0) ? 'Không có đơn hàng nào được thanh toán trong kỳ này.' : null),
  },
};

/**
 * Loads the page overview for the selected period. A malformed reply surfaces as the
 * real error panel instead of a blank page. While another period loads, the previous data stays (is-refreshing).
 */
function useAnalytics(page) {
  const res = useAdminGet(`/api/admin/${page}/overview?period=${period()}`);
  const merged = useMemo(() => {
    if (!res.data) return { data: null, error: null };
    try { return { data: fromOverview(page, res.data), error: null }; } catch (error) { console.error(error); return { data: null, error }; }
  }, [page, res.data]);
  return { d: merged.data, failed: !!(res.error || merged.error) && !merged.data, loading: res.loading, reload: res.reload };
}
const renderCard = (page, id, d) => { const c = PAGES[page].cards[id](d); return ch.card({ id, detailHref: c.table ? `${PAGES[page].route}/${id}` : null, ...c }); };

// ───────────────────────── CSV ─────────────────────────
const stamp = () => { const d = new Date(Date.now() + 7 * 3600000); return d.toISOString().slice(0, 16).replace('T', ' ') + ' GMT+7'; };
const today = () => dayKey(Date.now());
function csvFor(page, ids, d) {
  const rows = [];
  ids.forEach((id) => { const c = PAGES[page].cards[id](d); if (!c.table) return; rows.push([`${c.code} ${c.title}`]); rows.push(c.table.headers); c.table.rows.forEach((r) => rows.push(r.cells || r)); rows.push([]); });
  return rows;
}
function downloadCard(page, id, d) {
  const c = PAGES[page].cards[id](d);
  if (!c.table) return;
  ch.csv(`codi-${page}-${id}-${today()}.csv`, [`${c.code} ${c.title}`, `Khoảng: ${rangeLabel(d.window, d.previousWindow)}`, `Xuất lúc ${stamp()}`], [c.table.headers].concat(c.table.rows.map((r) => r.cells || r)));
  Codi.ui.toast(`Đã tải CSV ${c.code} (${c.table.rows.length} dòng).`, { type: 'success' });
}

function ExportDialog({ handle, page, d }) {
  const P2 = PAGES[page];
  const cards = d ? P2.overview.concat(P2.more).map((id) => ({ id, c: P2.cards[id](d) })).filter((x) => x.c.table) : [];
  const [picked, setPicked] = useState(() => Object.fromEntries(cards.map((x) => [x.id, true])));
  if (!d) return <p className="small">{P2.error}</p>;
  const submit = (e) => {
    e.preventDefault();
    const ids = cards.map((x) => x.id).filter((id) => picked[id]);
    if (!ids.length) { Codi.ui.toast('Chọn ít nhất một thẻ để xuất.', { type: 'warn' }); return; }
    ch.csv(`codi-${page}-${today()}.csv`, [`Codi — ${P2.title}`, `Khoảng: ${rangeLabel(d.window, d.previousWindow)}`, `Xuất lúc ${stamp()}`], csvFor(page, ids, d));
    handle.close();
    Codi.ui.toast(`Đã tải CSV gồm ${ids.length} thẻ.`, { type: 'success' });
  };
  return (
    <form className="stack-3" onSubmit={submit}>
      <p className="small muted" style={{ margin: 0 }}>Khoảng: {rangeLabel(d.window, d.previousWindow)} · giờ theo GMT+7.</p>
      <fieldset className="stack-1"><legend className="small"><strong>Thẻ cần xuất</strong></legend>
        {cards.map(({ id, c }) => (
          <label key={id} className="check"><input type="checkbox" name={`c_${id}`} checked={!!picked[id]} onChange={(e) => setPicked({ ...picked, [id]: e.target.checked })} /> {c.code} · {c.title} <span className="xsmall muted">({c.table.rows.length} dòng)</span></label>
        ))}</fieldset>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-ghost" onClick={() => handle.close()}>Huỷ</button><button type="submit" className="btn btn-primary"><Icon name="download" className="icon-sm" /> Tải xuống</button></div>
    </form>
  );
}

// ───────────────────────── page components ─────────────────────────
/** Period changes re-fetch every card; the previous render stays visible at reduced opacity while it loads. */
function useAnalyticsActions(page) {
  const a = useAnalytics(page);
  const [, rerender] = useState(0);
  const handlers = {
    'aa-period': (v) => { prefs().period = v; savePrefs(); rerender((n) => n + 1); },
    'aa-expand': (pg) => { const o = prefs().open; o[pg] = !o[pg]; savePrefs(); rerender((n) => n + 1); },
    'aa-export': (pg) => { if (a.d) Codi.ui.modal({ title: 'Xuất CSV', body: (h) => <ExportDialog handle={h} page={pg} d={a.d} /> }); },
    retry: () => a.reload(),
  };
  // One delegated handler for data-action buttons and "#/…" links inside chart-kit markup.
  const onClick = (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (a) { e.preventDefault(); Codi.go(a.getAttribute('href').slice(1)); return; }
    const b = e.target.closest('[data-action="aa-export"]');
    if (b) { e.preventDefault(); handlers['aa-export'](b.dataset.page); }
  };
  return { refreshing: a.loading && !!a.d, d: a.d, failed: a.failed, onClick, handlers };
}

function Toolbar({ d, onPeriod }) {
  const p = prefs();
  return (
    <div className="viz-toolbar" role="group" aria-label="Khoảng thời gian áp dụng cho mọi thẻ">
      <div className="viz-seg-ctrl" role="group" aria-label="Khoảng thời gian">
        {PERIODS.map((x) => <button key={x.v} type="button" aria-pressed={String(p.period === x.v)} onClick={() => onPeriod(x.v)}>{x.label}</button>)}
      </div>
      {d && <span className="viz-range">{rangeLabel(d.window, d.previousWindow)}</span>}
    </div>
  );
}

function ErrorPanel({ text, onRetry }) {
  return <div role="alert" className="card ad-panel-row"><p className="small" style={{ margin: 0 }}>{text}</p><button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>Thử lại</button></div>;
}

function AnalyticsPage({ page }) {
  const { refreshing, d, failed, onClick, handlers } = useAnalyticsActions(page);
  const P2 = PAGES[page];
  const open = !P2.collapsible || prefs().open[page];
  const quiet = d && P2.quiet(d);
  const grid = (ids) => <Html className={`viz-grid-cards ${refreshing ? 'is-refreshing' : ''}`} html={ids.map((id) => String(renderCard(page, id, d))).join('')} />;
  return (
    <AdminShell active={P2.route}>
      <div className="stack-4 ad-analytics" onClick={onClick}>
        <div className="page-header"><div><h1>{P2.title}</h1><p className="muted">{P2.lead}</p></div></div>
        <Toolbar d={d} onPeriod={handlers['aa-period']} />
        {P2.basis && <p className="xsmall muted" style={{ margin: 0 }}>{P2.basis}</p>}
        {failed && <ErrorPanel text={P2.error} onRetry={handlers.retry} />}
        {!d && !failed && <div className="viz-grid-cards" aria-busy="true"><div className="viz-skeleton" /><div className="viz-skeleton" /></div>}
        {quiet && <p role="status" className="card ad-panel-row small muted">{quiet}</p>}
        {d && (
          <>
            <div className="viz-section-head"><h2>Tổng quan</h2></div>
            {grid(P2.overview)}
            <div className="viz-section-head"><h2>Chi tiết thêm</h2>
              {P2.collapsible && (
                <button type="button" className="btn btn-secondary btn-sm" aria-expanded={String(!!open)} onClick={() => handlers['aa-expand'](page)}>
                  <Icon name={open ? 'chevron-down' : 'chevron-right'} className="icon-sm" /> {open ? 'Thu gọn' : `Xem chi tiết (${P2.more.length} thẻ)`}
                </button>
              )}</div>
            {open && grid(P2.more)}
          </>
        )}
      </div>
    </AdminShell>
  );
}

function AnalyticsDetailPage({ page, id }) {
  const { refreshing, d, failed, onClick, handlers } = useAnalyticsActions(page);
  const P2 = PAGES[page]; const fn = P2.cards[id];
  if (!fn) {
    return <AdminShell active={P2.route}><div><Empty icon="bar-chart" title="Không tìm thấy thẻ" actions={<Link className="btn btn-primary" to={P2.route}>Về {P2.title}</Link>} /></div></AdminShell>;
  }
  const c = d ? fn(d) : null;
  return (
    <AdminShell active={P2.route}>
      <div className="stack-4 ad-analytics" onClick={onClick}>
        <Link className="btn btn-ghost btn-sm" style={{ width: 'fit-content' }} to={P2.route}><Icon name="arrow-left" className="icon-sm" /> {P2.title}</Link>
        {c ? (
          <>
            <div className="page-header"><div><h1>{c.code} · {c.title}</h1><p className="muted">{c.question}</p></div>
              {c.table && <button type="button" className="btn btn-primary" onClick={() => downloadCard(page, id, d)}><Icon name="download" className="icon-sm" /> Tải CSV</button>}</div>
            <Toolbar d={d} onPeriod={handlers['aa-period']} />
            <Html className={refreshing ? 'is-refreshing' : ''} html={String(ch.card({ ...c, table: null, wide: true }))} />
            {c.table && (
              <section className="viz-card"><header className="viz-card-head"><div className="viz-card-titles"><h3>Bảng số liệu</h3><p>{rangeLabel(d.window, d.previousWindow)}</p></div></header>
                {c.table.rows.length ? <Html className="table-wrap" html={String(ch.table(c.table.headers, c.table.rows, { caption: c.title }))} /> : <div className="viz-empty">Chưa có dữ liệu trong kỳ này.</div>}</section>
            )}
          </>
        ) : failed ? <ErrorPanel text={P2.error} onRetry={handlers.retry} /> : <div className="viz-skeleton" aria-busy="true" />}
      </div>
    </AdminShell>
  );
}

export const InsightsPage = () => <AnalyticsPage page="insights" />;
export const FinancePage = () => <AnalyticsPage page="finance" />;
export const InsightsDetailPage = ({ params }) => <AnalyticsDetailPage page="insights" id={params.card} />;
export const FinanceDetailPage = ({ params }) => <AnalyticsDetailPage page="finance" id={params.card} />;
