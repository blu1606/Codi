/**
 * admin-analytics.js — S36 "Quan sát hệ thống" (A1–A9) and S37 "Tài chính" (B1–B9).
 * Routes (admin): /admin/insights · /admin/insights/:card · /admin/finance · /admin/finance/:card
 *
 * PRODUCT.md §6/§7.21: one header per page (period presets 7 ngày / 30 ngày (default) / Quý + "So sánh: kỳ trước")
 * applied to every card; "Tổng quan" set first; "Xem chi tiết" expands the rest in place (remembered);
 * every card opens its own detail view with the full table and a CSV download.
 *
 * Data: db.analytics (180 seeded days, sample platform aggregates), db.courses / orders / submissions /
 * questions / reviews / vouchers (real seed records). Where a breakdown is not in the seed (cohort
 * retention, revenue split by course, voucher split) it is derived deterministically and the card says so.
 */
(function () {
  'use strict';
  const { html, icon, fmt, ui } = Codi;
  const ch = Codi.charts;
  const db = () => Codi.db();
  const DAY = 86400000;

  const PERIODS = [{ v: '7', label: '7 ngày', days: 7 }, { v: '30', label: '30 ngày', days: 30 }, { v: '90', label: 'Quý', days: 90 }];
  const prefs = () => Codi.ensure('analyticsPrefs', () => ({ period: '30', compare: true, open: { insights: false, finance: false }, b3: 'course', a5: 'rate' }));
  let refreshing = false;

  // ───────────────────────── data helpers ─────────────────────────
  const asOf = () => db().analyticsAsOf || (window.CodiData && window.CodiData.analyticsAsOf) || new Date().toISOString().slice(0, 10);
  const asOfMs = () => new Date(asOf() + 'T23:59:59Z').getTime();
  function win() {
    const p = prefs(); const days = (PERIODS.find((x) => x.v === p.period) || PERIODS[1]).days;
    const all = db().analytics || [];
    const cur = all.slice(-days); const prevAll = all.slice(-2 * days, -days);
    return { days, cur, prev: prevAll.length === days ? prevAll : null, compare: p.compare };
  }
  const sum = (arr, k) => (arr || []).reduce((s, d) => s + (typeof k === 'function' ? k(d) : d[k] || 0), 0);
  const avg = (arr, k) => (arr && arr.length ? sum(arr, k) / arr.length : 0);
  const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const dmy = (s) => `${dm(s)}/${s.slice(0, 4)}`;
  const median = (xs) => { const a = xs.slice().sort((x, y) => x - y); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const hash = (s) => { let h = 7; for (const ch2 of String(s)) h = (h * 31 + ch2.charCodeAt(0)) % 100003; return h; };
  const vndc = (n) => ch.fmt.compact(n) + ' ₫';
  const P = (v) => ch.fmt.pct(v, v < 10 ? 1 : 0);
  // Group days into weeks (Monday-first) for weekly charts.
  function weeks(days) {
    const out = [];
    days.forEach((d) => {
      const dt = new Date(d.date + 'T00:00:00Z'); const dow = (dt.getUTCDay() + 6) % 7;
      const start = new Date(dt.getTime() - dow * DAY).toISOString().slice(0, 10);
      let w = out[out.length - 1];
      if (!w || w.start !== start) { w = { start, days: [] }; out.push(w); }
      w.days.push(d);
    });
    return out;
  }
  // Line points: daily for ≤ 30 days, weekly sums for a quarter (13 readable points).
  function series(days, key, agg) {
    const w = win();
    if (w.days <= 30) return days.map((d) => ({ x: d.date, y: typeof key === 'function' ? key(d) : d[key], label: dm(d.date), date: d.date }));
    return weeks(days).map((wk) => ({ x: wk.start, y: (agg === 'avg' ? avg : sum)(wk.days, key), label: 'Tuần ' + dm(wk.start), date: wk.start }));
  }
  function withPrev(curPts, prevPts) {
    if (!prevPts) return [{ name: 'Kỳ này', points: curPts }];
    return [{ name: 'Kỳ này', points: curPts }, { name: 'Kỳ trước', dashed: true, points: curPts.map((p, i) => (prevPts[i] ? { x: p.x, y: prevPts[i].y, label: p.label, note: prevPts[i].label } : null)).filter(Boolean) }];
  }
  const kpiPrev = (w, v) => (w.compare && w.prev ? v : null);
  const rangeText = (w) => `${dmy(w.cur[0].date)} – ${dmy(w.cur[w.cur.length - 1].date)}${w.compare ? (w.prev ? ` · so với ${dmy(w.prev[0].date)} – ${dmy(w.prev[w.prev.length - 1].date)}` : ' · chưa có kỳ trước để so sánh') : ''}`;

  // ───────────────────────── shell & header ─────────────────────────
  function shell(active, body) {
    const pending = db().courses.filter((c) => c.status === 'pending').length;
    return ui.workspace({
      label: 'Quản trị', active, body,
      items: [
        { section: 'Quản trị', href: '/admin', label: 'Tổng quan', icon: 'layout-dashboard' },
        { section: 'Khoá học', href: '/admin/publication', label: 'Duyệt xuất bản', icon: 'clipboard-check', count: pending, match: /^\/admin\/publication/ },
        { section: 'Khoá học', href: '/admin/courses', label: 'Khóa học đã xuất bản', icon: 'book-open' },
        { section: 'Vận hành', href: '/admin/users', label: 'Người dùng', icon: 'users' },
        { section: 'Vận hành', href: '/admin/orders', label: 'Đơn hàng & giao dịch', icon: 'receipt' },
        { section: 'Vận hành', href: '/admin/vouchers', label: 'Voucher', icon: 'ticket' },
        { section: 'Phân tích', href: '/admin/insights', label: 'Quan sát hệ thống', icon: 'activity', match: /^\/admin\/insights/ },
        { section: 'Phân tích', href: '/admin/finance', label: 'Tài chính', icon: 'trending-up', match: /^\/admin\/finance/ },
      ],
    });
  }
  function toolbar(w) {
    const p = prefs();
    return html`<div class="viz-toolbar" role="group" aria-label="Khoảng thời gian áp dụng cho mọi thẻ">
      <div class="viz-seg-ctrl" role="group" aria-label="Khoảng thời gian">${PERIODS.map((x) => html`<button type="button" aria-pressed="${String(p.period === x.v)}" data-action="aa-period" data-v="${x.v}">${x.label}</button>`)}
        <button type="button" aria-pressed="false" data-action="aa-custom">Tùy chọn</button></div>
      <button type="button" class="viz-switch btn-reset" role="switch" aria-checked="${String(p.compare)}" data-action="aa-compare"><input type="checkbox" tabindex="-1" aria-hidden="true" ${p.compare ? Codi.raw('checked') : ''}> So sánh: kỳ trước</button>
      <span class="viz-range">${rangeText(w)}</span>
    </div>`;
  }

  // ───────────────────────── S36 cards ─────────────────────────
  const INSIGHTS = {
    a1(w) {
      const pv = (k) => kpiPrev(w, w.prev && sum(w.prev, k));
      const lastWau = w.cur[w.cur.length - 1].wau; const prevWau = w.prev && w.prev[w.prev.length - 1].wau;
      const published = db().courses.filter((c) => c.status === 'published').length;
      const spark = (k) => w.cur.slice(-12).map((d) => d[k]);
      const tiles = [
        { label: 'Người dùng hoạt động tuần (WAU)', value: lastWau, prev: kpiPrev(w, prevWau), spark: spark('wau') },
        { label: 'Đăng ký mới', value: sum(w.cur, 'signups'), prev: pv('signups'), spark: spark('signups') },
        { label: 'Ghi danh mới', value: sum(w.cur, 'newEnrolments'), prev: pv('newEnrolments'), spark: spark('newEnrolments') },
        { label: 'Bài học hoàn thành', value: sum(w.cur, 'lessonsCompleted'), prev: pv('lessonsCompleted'), spark: spark('lessonsCompleted') },
        { label: 'Khóa đang bán', value: published, compare: false, note: 'Tại thời điểm hiện tại' },
      ];
      return {
        code: 'A1', title: 'Chỉ số chính', question: 'Nền tảng đang lớn lên hay chững lại?', wide: true,
        body: html`<div class="viz-kpis">${tiles.map((t) => ch.kpi(Object.assign({ prevMissing: w.compare && !w.prev, compare: w.compare ? t.compare : false }, t)))}</div>`,
        table: { headers: ['Chỉ số', 'Kỳ này', 'Kỳ trước'], rows: tiles.map((t) => [t.label, fmt.num(t.value), t.prev != null ? fmt.num(t.prev) : '—']) },
      };
    },
    a2(w) {
      const cur = series(w.cur, 'dau', 'avg'); const prev = w.compare && w.prev ? series(w.prev, 'dau', 'avg') : null;
      const sticky = (days) => (avg(days, 'dau') / avg(days, 'wau')) * 100;
      return {
        code: 'A2', title: 'Người dùng hoạt động mỗi ngày', question: 'DAU kỳ này so với kỳ trước',
        body: html`${ch.line({ series: withPrev(cur, prev), ariaLabel: 'DAU theo ngày', yFormat: ch.fmt.num })}
          <div class="viz-tiles" style="margin-top:12px"><div class="viz-tile"><span class="viz-tile-label">DAU trung bình</span><span class="viz-tile-value">${fmt.num(Math.round(avg(w.cur, 'dau')))}</span></div>
          <div class="viz-tile"><span class="viz-tile-label">Độ gắn bó (DAU/WAU)</span><span class="viz-tile-value">${P(sticky(w.cur))}</span>${w.compare && w.prev ? html`<span class="viz-tile-sub">Kỳ trước ${P(sticky(w.prev))}</span>` : ''}</div></div>`,
        table: { headers: ['Mốc', 'DAU kỳ này', 'DAU kỳ trước'], rows: cur.map((p, i) => [p.label, fmt.num(Math.round(p.y)), prev && prev[i] ? fmt.num(Math.round(prev[i].y)) : '—']) },
      };
    },
    a3(w) {
      const steps = [['Đăng ký', 'signups'], ['Xác thực email', 'verified'], ['Mua lần đầu', 'firstPurchase'], ['Hoàn thành bài đầu tiên', 'firstLesson']].map(([label, k]) => ({ label, value: sum(w.cur, k) }));
      return {
        code: 'A3', title: 'Phễu kích hoạt', question: 'Người mới rơi rụng ở bước nào?',
        body: ch.funnel({ steps, format: fmt.num }),
        table: { headers: ['Bước', 'Số lượng', '% so với bước 1'], rows: steps.map((s) => [s.label, fmt.num(s.value), P((s.value / steps[0].value) * 100)]) },
      };
    },
    a7() {
      const cs = db().courses; const n = (st) => cs.filter((c) => c.status === st).length;
      const segs = [{ label: 'Bản nháp', value: n('draft'), tone: 'neutral' }, { label: 'Chờ duyệt', value: n('pending'), tone: 'warning' }, { label: 'Đã xuất bản', value: n('published'), tone: 'accent' }, { label: 'Đã ẩn', value: n('hidden'), tone: 'slot-3' }, { label: 'Bị từ chối', value: n('rejected'), tone: 'critical' }];
      const waits = cs.filter((c) => c.status === 'pending' && c.submittedAt).map((c) => (asOfMs() - new Date(c.submittedAt).getTime()) / DAY);
      return {
        code: 'A7', title: 'Khóa học theo trạng thái', question: 'Có khóa nào đang tắc ở khâu duyệt?',
        body: html`${ch.stacked({ segments: segs, format: fmt.num })}
          <div class="viz-tiles" style="margin-top:12px"><div class="viz-tile"><span class="viz-tile-label">Chờ duyệt lâu nhất</span><span class="viz-tile-value">${waits.length ? Math.round(Math.max(...waits)) + ' ngày' : '—'}</span><span class="viz-tile-sub">${waits.length ? `${waits.length} khóa đang chờ` : 'Không có khóa chờ duyệt'}</span></div>
          <div class="viz-tile"><span class="viz-tile-label">Thời gian chờ trung vị</span><span class="viz-tile-value">${waits.length ? Math.round(median(waits)) + ' ngày' : '—'}</span></div></div>
          ${n('pending') ? html`<a class="btn btn-secondary btn-sm" style="margin-top:12px" href="#/admin/publication">Mở hàng chờ duyệt (${n('pending')})</a>` : ''}`,
        table: { headers: ['Trạng thái', 'Số khóa'], rows: segs.map((s) => [s.label, fmt.num(s.value)]) },
      };
    },
    a8() {
      // Inverted metrics: higher = worse. Counted at "as of" for three windows.
      const now = asOfMs(); const inWin = (iso, d) => iso && now - new Date(iso).getTime() <= d * DAY && new Date(iso).getTime() <= now;
      const subs = db().submissions || []; const qs = db().questions || []; const rv = db().reviews || [];
      const gradeHours = (d) => median(subs.filter((s) => s.status === 'graded' && inWin(s.gradedAt, d)).map((s) => (new Date(s.gradedAt) - new Date(s.submittedAt)) / 3600000));
      const unanswered = (d) => qs.filter((q) => q.status !== 'answered' && inWin(q.createdAt, d) && now - new Date(q.createdAt).getTime() > 48 * 3600000).length;
      const noReply = (d) => rv.filter((r) => !r.reply && inWin(r.createdAt, d)).length;
      const W = [1, 7, 30];
      const rows = [
        ['Thời gian chấm bài trung vị', W.map((d) => { const h = gradeHours(d); return h == null ? '—' : `${Math.round(h)} giờ`; })],
        ['Câu hỏi chưa trả lời > 48 giờ', W.map((d) => String(unanswered(d)))],
        ['Đánh giá chưa phản hồi', W.map((d) => String(noReply(d)))],
      ];
      return {
        code: 'A8', title: 'Sức khỏe vận hành', question: 'Học viên có đang phải chờ quá lâu?',
        body: html`<div class="table-wrap"><table class="table viz-data-table"><caption class="sr-only">Sức khỏe vận hành</caption><thead><tr><th scope="col">Chỉ số (thấp hơn là tốt)</th>${['Hôm nay', '7 ngày', '30 ngày'].map((h) => html`<th scope="col" class="num">${h}</th>`)}</tr></thead>
          <tbody>${rows.map(([label, vals], ri) => html`<tr><th scope="row">${label}</th>${vals.map((v) => html`<td class="num">${ri > 0 && v !== '0' ? html`<button type="button" class="btn-link" data-action="aa-queue" data-q="${label}">${v}</button>` : v}</td>`)}</tr>`)}</tbody></table></div>`,
        table: { headers: ['Chỉ số', 'Hôm nay', '7 ngày', '30 ngày'], rows: rows.map(([l, v]) => [l].concat(v)) },
        note: 'Tính từ bài nộp, câu hỏi và đánh giá thật trong dữ liệu mẫu.',
      };
    },
    a4(w) {
      // Enrolment-week cohorts × weeks since enrolment. Retention is derived from the seed (labelled).
      const wk = weeks(db().analytics.slice(-Math.max(w.days, 56))).slice(-8);
      const end = asOfMs();
      const rows = wk.map((c) => {
        const n = sum(c.days, 'newEnrolments'); const start = new Date(c.start + 'T00:00:00Z').getTime(); const h = hash(c.start);
        const cells = Array.from({ length: 9 }, (_, i) => (start + i * 7 * DAY > end ? null : i === 0 ? 100 : Math.max(5, Math.round(100 * (0.56 * Math.exp(-0.24 * i) + 0.2) + ((h >> i) % 9) - 4))));
        return { label: 'Tuần ' + dm(c.start), n, cells };
      });
      const total = rows.reduce((s, r) => s + r.n, 0);
      const all = { label: 'Tất cả', n: total, pinned: true, cells: Array.from({ length: 9 }, (_, i) => { const rs = rows.filter((r) => r.cells[i] != null); const nn = rs.reduce((s, r) => s + r.n, 0); return nn ? Math.round(rs.reduce((s, r) => s + r.cells[i] * r.n, 0) / nn) : null; }) };
      const cols = Array.from({ length: 9 }, (_, i) => 'T' + i);
      return {
        code: 'A4', title: 'Giữ chân theo nhóm ghi danh', question: 'Sau bao nhiêu tuần học viên bắt đầu bỏ học?', wide: true,
        body: ch.heatmap({ rowHeader: 'Nhóm ghi danh', cols, rows: [all].concat(rows.reverse()), caption: 'Tỉ lệ còn học theo tuần' }),
        note: 'T0 = tuần ghi danh. Ô trống: tuần đó chưa tới. Tỉ lệ giữ chân được suy ra từ dữ liệu mẫu.',
        table: { headers: ['Nhóm', 'n'].concat(cols), rows: [all].concat(rows).map((r) => [r.label, fmt.num(r.n)].concat(r.cells.map((v) => (v == null ? '' : v + '%')))) },
      };
    },
    a5() {
      const sortBy = prefs().a5;
      const rows = db().courses.filter((c) => c.status === 'published').map((c) => {
        const n = c.learnersCount || 0; const rate = 18 + (hash(c.id) % 30);
        return { c, n, rate };
      }).sort((a, b) => (sortBy === 'n' ? b.n - a.n : b.rate - a.rate));
      return {
        code: 'A5', title: 'Tỉ lệ hoàn thành theo khóa', question: 'Khóa nào học viên học tới cùng?',
        actions: html`<div class="viz-seg-ctrl" role="group" aria-label="Sắp xếp"><button type="button" aria-pressed="${String(sortBy !== 'n')}" data-action="aa-a5" data-v="rate">Tỉ lệ</button><button type="button" aria-pressed="${String(sortBy === 'n')}" data-action="aa-a5" data-v="n">Học viên</button></div>`,
        body: html`<div class="table-wrap"><table class="table viz-data-table"><caption class="sr-only">Tỉ lệ hoàn thành theo khóa</caption><thead><tr><th scope="col">Khóa học</th><th scope="col" class="num">Học viên</th><th scope="col" class="num">Hoàn thành</th></tr></thead>
          <tbody>${rows.map((r) => html`<tr><th scope="row">${r.c.title}</th><td class="num">${fmt.num(r.n)}</td><td class="num">${ch.inlineBar(r.rate, 100, r.rate + '%')}</td></tr>`)}</tbody></table></div>`,
        note: 'Tỉ lệ hoàn thành được suy ra từ dữ liệu mẫu.',
        table: { headers: ['Khóa học', 'Học viên', 'Hoàn thành'], rows: rows.map((r) => [r.c.title, fmt.num(r.n), r.rate + '%']) },
      };
    },
    a6(w) {
      const took = sum(w.cur, 'diagnosticTaken'); const lesson1 = sum(w.cur, 'startFromLesson1');
      const trend = weeks(w.cur).map((wk) => ({ x: wk.start, label: 'Tuần ' + dm(wk.start), y: Math.round((sum(wk.days, 'diagnosticTaken') / (sum(wk.days, 'newEnrolments') || 1)) * 100) }));
      return {
        code: 'A6', title: 'Làm bài kiểm tra đầu vào hay học từ bài 1', question: 'Bao nhiêu học viên mới chọn tìm điểm bắt đầu?',
        body: html`${ch.stacked({ segments: [{ label: 'Tìm điểm bắt đầu (làm bài đầu vào)', value: took }, { label: 'Học từ bài 1', value: lesson1 }], format: fmt.num })}
          <div style="margin-top:16px">${trend.length > 1 ? ch.line({ series: [{ name: '% làm bài đầu vào', points: trend }], yFormat: (v) => Math.round(v) + '%', height: 140, ariaLabel: 'Tỉ lệ làm bài đầu vào theo tuần' }) : ''}</div>`,
        table: { headers: ['Tuần', '% làm bài đầu vào'], rows: trend.map((t) => [t.label, t.y + '%']) },
      };
    },
    a9(w) {
      const errRate = (days) => (sum(days, 'pathErrors') / (sum(days, 'pathRequests') || 1)) * 100;
      const p95 = (days) => median(days.map((d) => d.p95Latency));
      const prev = w.compare && w.prev;
      const cur = series(w.cur, 'p95Latency', 'avg'); const prevS = prev ? series(w.prev, 'p95Latency', 'avg') : null;
      return {
        code: 'A9', title: 'Sức khỏe AI', question: 'AI có đang chậm hoặc lỗi nhiều hơn?', wide: true,
        body: html`<div class="viz-kpis">
            ${ch.kpi({ label: 'Yêu cầu trợ lý / ngày', value: Math.round(avg(w.cur, 'aiRequests')), prev: prev ? Math.round(avg(w.prev, 'aiRequests')) : null, compare: w.compare, prevMissing: w.compare && !w.prev })}
            ${ch.kpi({ label: 'Lỗi tạo lộ trình', value: errRate(w.cur), format: (v) => P(v), prev: prev ? errRate(w.prev) : null, deltaGood: 'down', compare: w.compare })}
            ${ch.kpi({ label: 'Độ trễ p95 (trung vị)', value: p95(w.cur), format: (v) => fmt.num(Math.round(v)) + ' ms', prev: prev ? p95(w.prev) : null, deltaGood: 'down', compare: w.compare })}
            ${ch.kpi({ label: 'Lần chạm giới hạn', value: sum(w.cur, 'rateLimitHits'), prev: prev ? sum(w.prev, 'rateLimitHits') : null, deltaGood: 'down', compare: w.compare })}
          </div>
          <div style="margin-top:16px">${ch.line({ series: withPrev(cur, prevS), threshold: { value: 1500, label: 'Mục tiêu p95 ≤ 1.500 ms' }, yFormat: (v) => fmt.num(Math.round(v)) + ' ms', ariaLabel: 'Độ trễ p95' })}</div>`,
        note: 'Lỗi, độ trễ và lần chạm giới hạn: số càng cao càng xấu.',
        table: { headers: ['Mốc', 'p95 kỳ này (ms)', 'p95 kỳ trước (ms)'], rows: cur.map((p, i) => [p.label, fmt.num(Math.round(p.y)), prevS && prevS[i] ? fmt.num(Math.round(prevS[i].y)) : '—']) },
      };
    },
  };

  // ───────────────────────── S37 cards ─────────────────────────
  const published = () => db().courses.filter((c) => c.status === 'published' && c.price > 0);
  function revenueSplit(total) {
    const cs = published(); const wsum = cs.reduce((s, c) => s + (c.learnersCount || 1) * c.price, 0) || 1;
    return cs.map((c) => ({ c, revenue: Math.round((total * ((c.learnersCount || 1) * c.price)) / wsum / 1000) * 1000 }));
  }
  const FIN = {
    b1(w) {
      const k = (days) => ({ gross: sum(days, 'revenue'), net: sum(days, 'revenue') - sum(days, 'discount') - sum(days, 'refundAmount'), paid: sum(days, 'ordersPaid'), discount: sum(days, 'discount'), refund: sum(days, 'refundAmount') });
      const c = k(w.cur); const p = w.compare && w.prev ? k(w.prev) : null;
      const tiles = [
        { label: 'Doanh thu gộp', value: c.gross, prev: p && p.gross, format: vndc },
        { label: 'Doanh thu ròng sau voucher', value: c.net, prev: p && p.net, format: vndc },
        { label: 'Đơn đã thanh toán', value: c.paid, prev: p && p.paid },
        { label: 'Giá trị đơn trung bình', value: c.paid ? c.gross / c.paid : 0, prev: p && p.paid ? p.gross / p.paid : null, format: vndc },
        { label: 'Tiền giảm giá', value: c.discount, prev: p && p.discount, format: vndc, deltaGood: 'down' },
        { label: 'Hoàn tiền', value: c.refund, prev: p && p.refund, format: vndc, deltaGood: 'down' },
      ];
      return {
        code: 'B1', title: 'Chỉ số doanh thu', question: 'Kỳ này thu được bao nhiêu?', wide: true,
        body: html`<div class="viz-kpis">${tiles.map((t) => ch.kpi(Object.assign({ compare: w.compare, prevMissing: w.compare && !w.prev }, t)))}</div>`,
        table: { headers: ['Chỉ số', 'Kỳ này', 'Kỳ trước'], rows: tiles.map((t) => [t.label, t.format ? fmt.vnd(Math.round(t.value)) : fmt.num(t.value), t.prev != null ? (t.format ? fmt.vnd(Math.round(t.prev)) : fmt.num(t.prev)) : '—']) },
      };
    },
    b2(w) {
      const cur = series(w.cur, 'revenue'); const prev = w.compare && w.prev ? series(w.prev, 'revenue') : null;
      const mean = cur.reduce((s, p) => s + p.y, 0) / cur.length;
      const lines = withPrev(cur, prev).concat([{ name: 'Trung bình kỳ này', role: 'average', points: cur.map((p) => ({ x: p.x, y: mean, label: p.label })) }]);
      return {
        code: 'B2', title: 'Doanh thu theo thời gian', question: `Doanh thu theo ${w.days <= 30 ? 'ngày' : 'tuần'}, kỳ này so với kỳ trước`, wide: true,
        body: ch.line({ series: lines, yFormat: (v) => ch.fmt.compact(v), ariaLabel: 'Doanh thu', height: 220 }),
        table: { headers: ['Mốc', 'Kỳ này', 'Kỳ trước (cùng vị trí)'], rows: cur.map((p, i) => [p.label, fmt.vnd(p.y), prev && prev[i] ? `${fmt.vnd(prev[i].y)} (${prev[i].label})` : '—']) },
      };
    },
    b4(w) {
      const aov = sum(w.cur, 'revenue') / (sum(w.cur, 'ordersPaid') || 1);
      const st = [['Đã thanh toán', 'ordersPaid', 'good'], ['Chờ thanh toán', 'ordersPending', 'warning'], ['Hết hạn', 'ordersExpired', 'neutral'], ['Thiếu tiền', 'ordersUnderpaid', 'serious'], ['Đã huỷ', 'ordersCancelled', 'slot-3'], ['Hoàn tiền', 'refunds', 'critical']];
      const segs = st.map(([label, k, tone]) => ({ label, value: sum(w.cur, k), amount: Math.round(sum(w.cur, k) * aov), tone }));
      const created = sum(w.cur, 'ordersCreated');
      const wk = weeks(w.cur).map((x) => ({ label: dm(x.start), values: [sum(x.days, 'ordersPaid'), sum(x.days, 'ordersExpired') + sum(x.days, 'ordersCancelled'), sum(x.days, 'ordersUnderpaid') + sum(x.days, 'ordersPending')] }));
      return {
        code: 'B4', title: 'Trạng thái đơn hàng', question: 'Bao nhiêu đơn tạo ra thực sự được thanh toán?',
        body: html`<div class="viz-tiles" style="margin-bottom:12px"><div class="viz-tile"><span class="viz-tile-label">Tỉ lệ thanh toán thành công</span><span class="viz-tile-value">${P((sum(w.cur, 'ordersPaid') / (created || 1)) * 100)}</span><span class="viz-tile-sub">${fmt.num(created)} đơn được tạo</span></div></div>
          ${ch.stacked({ segments: segs, format: fmt.num, amountFormat: vndc })}
          ${wk.length > 1 ? html`<div style="margin-top:16px">${ch.stackedCols({ cols: wk, keys: [{ label: 'Đã thanh toán', tone: 'good' }, { label: 'Hết hạn / huỷ', tone: 'neutral' }, { label: 'Thiếu tiền / chờ', tone: 'serious' }], format: fmt.num, height: 150, ariaLabel: 'Đơn theo tuần' })}</div>` : ''}`,
        table: { headers: ['Trạng thái', 'Số đơn', 'Giá trị ước tính'], rows: segs.map((s) => [s.label, fmt.num(s.value), fmt.vnd(s.amount)]) },
      };
    },
    b8() {
      const os = db().orders || []; const now = Date.now();
      const under = os.filter((o) => o.status === 'pending' && o.received && o.received < o.total);
      const stale = os.filter((o) => o.status === 'pending' && !(o.received) && now - new Date(o.createdAt).getTime() > 30 * 60000);
      const refunds = os.filter((o) => o.status === 'refund_requested');
      const cards = [['Đơn thiếu tiền', under, 'Liên hệ người mua để chuyển thêm hoặc hoàn tiền.'], ['Đơn chờ quá 30 phút', stale, 'Đối soát sao kê với mã CODI#####.'], ['Hoàn tiền chờ xử lý', refunds, 'Xác nhận và chuyển khoản hoàn tiền.']];
      const total = cards.reduce((s, c) => s + c[1].length, 0);
      return {
        code: 'B8', title: 'Cần đối soát', question: 'Việc gì cần làm ngay?', wide: true,
        body: total ? html`<div class="viz-attn">${cards.map(([t, list, hint]) => html`<div class="viz-attn-card ${list.length ? 'has-items' : ''}"><span class="small muted">${t}</span><span class="viz-attn-count">${list.length}</span><span class="xsmall muted">${list.length ? hint : 'Không có'}</span>
            ${list.length ? html`<a class="btn btn-secondary btn-sm" href="#/admin/orders?status=pending&range=all">Mở danh sách</a>` : ''}</div>`)}</div>`
          : html`<div class="viz-empty">Không có đơn cần đối soát.</div>`,
        table: { headers: ['Hạng mục', 'Số đơn', 'Mã đơn'], rows: cards.map(([t, list]) => [t, String(list.length), list.map((o) => o.code).join(' ')]) },
        note: 'Tính từ đơn hàng thật trong dữ liệu mẫu, không phụ thuộc khoảng thời gian.',
      };
    },
    b3(w) {
      const tab = prefs().b3;
      const split = revenueSplit(sum(w.cur, 'revenue'));
      const aov = sum(w.cur, 'revenue') / (sum(w.cur, 'ordersPaid') || 1);
      const groupKey = tab === 'category' ? (r) => (Codi.category(r.c.categoryId) || {}).name || 'Khác' : tab === 'lecturer' ? (r) => (Codi.user(r.c.lecturerId) || {}).name || 'Khác' : (r) => r.c.title;
      const groups = {};
      split.forEach((r) => { const k = groupKey(r); groups[k] = (groups[k] || 0) + r.revenue; });
      const rows = Object.entries(groups).map(([k, v]) => ({ k, v, orders: Math.round(v / aov) })).sort((a, b) => b.v - a.v);
      const total = rows.reduce((s, r) => s + r.v, 0); const max = rows.length ? rows[0].v : 1;
      const head = { course: 'Khóa học', category: 'Danh mục', lecturer: 'Giảng viên' }[tab];
      return {
        code: 'B3', title: 'Doanh thu theo khóa học', question: 'Nguồn doanh thu đến từ đâu?', wide: true,
        actions: html`<div class="viz-seg-ctrl" role="group" aria-label="Nhóm theo">${[['course', 'Khóa học'], ['category', 'Danh mục'], ['lecturer', 'Giảng viên']].map(([v, l]) => html`<button type="button" aria-pressed="${String(tab === v)}" data-action="aa-b3" data-v="${v}">${l}</button>`)}</div>`,
        body: html`<div class="table-wrap"><table class="table viz-data-table"><caption class="sr-only">Doanh thu theo ${head}</caption><thead><tr><th scope="col">${head}</th><th scope="col" class="num">Đơn (ước tính)</th><th scope="col" class="num">Doanh thu</th></tr></thead>
          <tbody>${rows.map((r) => html`<tr><th scope="row">${r.k}</th><td class="num">${fmt.num(r.orders)}</td><td class="num">${ch.inlineBar(r.v, max, fmt.vnd(r.v))}</td></tr>`)}
          <tr class="is-pinned"><th scope="row">Tổng</th><td class="num">${fmt.num(rows.reduce((s, r) => s + r.orders, 0))}</td><td class="num">${fmt.vnd(total)}</td></tr></tbody></table></div>`,
        note: 'Doanh thu kỳ được phân bổ theo số học viên × giá của từng khóa (dữ liệu mẫu).',
        table: { headers: [head, 'Đơn (ước tính)', 'Doanh thu'], rows: rows.map((r) => [r.k, fmt.num(r.orders), fmt.vnd(r.v)]) },
      };
    },
    b5(w) {
      const steps = [{ label: 'Thêm vào giỏ / Mua ngay', value: sum(w.cur, 'cartAdds') + sum(w.cur, 'buyNow') }, { label: 'Tạo đơn', value: sum(w.cur, 'ordersCreated') }, { label: 'Đã thanh toán', value: sum(w.cur, 'ordersPaid') }];
      const fromCart = sum(w.cur, 'ordersFromCart'); const created = sum(w.cur, 'ordersCreated'); const paidRate = sum(w.cur, 'ordersPaid') / (created || 1);
      const src = [['Giỏ hàng', sum(w.cur, 'cartAdds'), fromCart], ['Mua ngay', sum(w.cur, 'buyNow'), created - fromCart]];
      return {
        code: 'B5', title: 'Phễu thanh toán', question: 'Khách bỏ ở bước nào trước khi trả tiền?',
        body: html`${ch.funnel({ steps, format: fmt.num })}
          <h4 class="small" style="margin:16px 0 8px">Theo nguồn</h4>
          <div class="table-wrap"><table class="table viz-data-table"><caption class="sr-only">Phễu theo nguồn</caption><thead><tr><th scope="col">Nguồn</th><th scope="col" class="num">Lượt bấm</th><th scope="col" class="num">Tạo đơn</th><th scope="col" class="num">Tỉ lệ tạo đơn</th></tr></thead>
          <tbody>${src.map(([l, a, o]) => html`<tr><th scope="row">${l}</th><td class="num">${fmt.num(a)}</td><td class="num">${fmt.num(o)}</td><td class="num">${P((o / (a || 1)) * 100)}</td></tr>`)}</tbody></table></div>`,
        note: `Tỉ lệ thanh toán chung sau khi tạo đơn: ${P(paidRate * 100)}. Nguồn được suy ra từ dữ liệu mẫu.`,
        table: { headers: ['Bước', 'Số lượng'], rows: steps.map((s) => [s.label, fmt.num(s.value)]) },
      };
    },
    b6(w) {
      const b = [['< 1 phút', 'payLt1', 0.5], ['1–5 phút', 'pay1to5', 3], ['5–15 phút', 'pay5to15', 10], ['15–30 phút', 'pay15to30', 22]].map(([label, k, mid]) => ({ label, value: sum(w.cur, k), mid }));
      const expired = sum(w.cur, 'ordersExpired');
      const totalPaid = b.reduce((s, x) => s + x.value, 0); let acc = 0; let med = null;
      b.forEach((x) => { acc += x.value; if (med == null && acc >= totalPaid / 2) med = x.label; });
      return {
        code: 'B6', title: 'Thời gian từ tạo đơn đến thanh toán', question: 'Khách mất bao lâu để chuyển khoản?',
        body: html`<div class="viz-tiles" style="margin-bottom:12px"><div class="viz-tile"><span class="viz-tile-label">Trung vị</span><span class="viz-tile-value">${med || '—'}</span></div><div class="viz-tile"><span class="viz-tile-label">Hết hạn (quá 30 phút)</span><span class="viz-tile-value">${fmt.num(expired)}</span></div></div>
          ${ch.bars({ items: b.map((x) => ({ label: x.label, value: x.value })).concat([{ label: 'Hết hạn', value: expired, tone: 'neutral' }]), format: fmt.num, valueLabel: 'Số đơn', ariaLabel: 'Phân bố thời gian thanh toán' })}`,
        table: { headers: ['Khoảng thời gian', 'Số đơn'], rows: b.map((x) => [x.label, fmt.num(x.value)]).concat([['Hết hạn', fmt.num(expired)]]) },
      };
    },
    b7(w) {
      const share = { WELCOME20: 0.55, REACT10: 0.25, BACKEND50K: 0.12, GIAM100K: 0.08 };
      const uses = sum(w.cur, 'voucherUsage'); const disc = sum(w.cur, 'discount'); const aov = sum(w.cur, 'revenue') / (sum(w.cur, 'ordersPaid') || 1);
      const today = asOf();
      const rows = (db().vouchers || []).map((v) => {
        const s = share[v.code] || 0; const u = Math.round(uses * s);
        const status = !v.active ? 'Ngừng' : v.expiresAt && v.expiresAt < today ? 'Hết hạn' : v.usageLimit && v.used >= v.usageLimit ? 'Hết lượt' : 'Đang chạy';
        return { code: v.code, uses: u, discount: Math.round((disc * s) / 1000) * 1000, revenue: Math.round((u * aov) / 1000) * 1000, status };
      }).sort((a, b) => b.revenue - a.revenue);
      return {
        code: 'B7', title: 'Hiệu quả voucher', question: 'Voucher nào mang lại doanh thu?',
        body: html`<div class="table-wrap"><table class="table viz-data-table"><caption class="sr-only">Hiệu quả voucher</caption><thead><tr><th scope="col">Mã</th><th scope="col" class="num">Lượt dùng</th><th scope="col" class="num">Tiền giảm</th><th scope="col" class="num">Doanh thu có mã</th><th scope="col">Trạng thái</th></tr></thead>
          <tbody>${rows.map((r) => html`<tr><th scope="row"><span class="mono">${r.code}</span></th><td class="num">${fmt.num(r.uses)}</td><td class="num">${fmt.vnd(r.discount)}</td><td class="num">${fmt.vnd(r.revenue)}</td><td><span class="badge ${r.status === 'Đang chạy' ? 'badge-success' : ''}">${r.status}</span></td></tr>`)}</tbody></table></div>`,
        note: 'Lượt dùng trong kỳ được phân bổ theo tỉ trọng của từng mã (dữ liệu mẫu).',
        table: { headers: ['Mã', 'Lượt dùng', 'Tiền giảm', 'Doanh thu có mã', 'Trạng thái'], rows: rows.map((r) => [r.code, fmt.num(r.uses), fmt.vnd(r.discount), fmt.vnd(r.revenue), r.status]) },
      };
    },
    b9() {
      return {
        code: 'B9', title: 'Xuất CSV', question: 'Tải số liệu của trang này cho kế toán',
        body: html`<p class="small" style="margin:0 0 12px">Chọn thẻ cần xuất. File dùng đúng khoảng thời gian đang chọn, giờ theo GMT+7.</p><button type="button" class="btn btn-secondary" data-action="aa-export" data-page="finance">${icon('download', { cls: 'icon-sm' })} Xuất CSV…</button>`,
      };
    },
  };

  const PAGES = {
    insights: { title: 'Quan sát hệ thống', lead: 'Người dùng, nội dung, vận hành và AI — cùng một khoảng thời gian cho mọi thẻ.', route: '/admin/insights', cards: INSIGHTS, overview: ['a1', 'a2', 'a3', 'a7', 'a8'], more: ['a4', 'a5', 'a6', 'a9'] },
    finance: { title: 'Tài chính', lead: 'Doanh thu, đơn hàng và việc cần đối soát.', route: '/admin/finance', cards: FIN, overview: ['b1', 'b2', 'b4', 'b8'], more: ['b3', 'b5', 'b6', 'b7', 'b9'] },
  };

  function renderCard(page, id, w) {
    const c = PAGES[page].cards[id](w);
    return ch.card(Object.assign({ id, detailHref: c.table ? `${PAGES[page].route}/${id}` : null }, c));
  }
  function pageView(page) {
    const P2 = PAGES[page]; const w = win(); const open = prefs().open[page];
    if (!w.cur.length) return shell(P2.route, html`<div class="page">${ui.empty({ icon: 'bar-chart', title: 'Chưa có dữ liệu', body: 'Chưa có số liệu cho khoảng thời gian này.' })}</div>`);
    return shell(P2.route, html`<div class="page stack-5">
      <div class="page-header"><div><h1>${P2.title}</h1><p class="muted">${P2.lead}</p></div></div>
      ${toolbar(w)}
      <div class="viz-section-head"><h2>Tổng quan</h2></div>
      <div class="viz-grid-cards ${refreshing ? 'is-refreshing' : ''}">${P2.overview.map((id) => renderCard(page, id, w))}</div>
      <div class="viz-section-head"><h2>Chi tiết thêm</h2>
        <button type="button" class="btn btn-secondary btn-sm" data-action="aa-expand" data-page="${page}" aria-expanded="${String(!!open)}">${icon(open ? 'chevron-down' : 'chevron-right', { cls: 'icon-sm' })} ${open ? 'Thu gọn' : `Xem chi tiết (${P2.more.length} thẻ)`}</button></div>
      ${open ? html`<div class="viz-grid-cards ${refreshing ? 'is-refreshing' : ''}">${P2.more.map((id) => renderCard(page, id, w))}</div>` : ''}
    </div>`);
  }
  function detailView(page, id) {
    const P2 = PAGES[page]; const w = win(); const fn = P2.cards[id];
    if (!fn) return shell(P2.route, html`<div class="page">${ui.empty({ icon: 'bar-chart', title: 'Không tìm thấy thẻ', actions: html`<a class="btn btn-primary" href="#${P2.route}">Về ${P2.title}</a>` })}</div>`);
    const c = fn(w);
    return shell(P2.route, html`<div class="page stack-5">
      <a class="btn btn-ghost btn-sm" style="width:fit-content" href="#${P2.route}">${icon('arrow-left', { cls: 'icon-sm' })} ${P2.title}</a>
      <div class="page-header"><div><h1>${c.code} · ${c.title}</h1><p class="muted">${c.question}</p></div>
        ${c.table ? html`<button type="button" class="btn btn-primary" data-action="aa-csv" data-page="${page}" data-card="${id}">${icon('download', { cls: 'icon-sm' })} Tải CSV</button>` : ''}</div>
      ${toolbar(w)}
      <div class="${refreshing ? 'is-refreshing' : ''}">${ch.card(Object.assign({}, c, { table: null, wide: true }))}</div>
      ${c.table ? html`<section class="viz-card"><header class="viz-card-head"><div class="viz-card-titles"><h3>Bảng số liệu</h3><p>${rangeText(w)}</p></div></header><div class="table-wrap">${ch.table(c.table.headers, c.table.rows, { caption: c.title })}</div></section>` : ''}
    </div>`);
  }

  Codi.route('/admin/insights', () => pageView('insights'), { title: 'Quan sát hệ thống', role: 'admin' });
  Codi.route('/admin/insights/:card', (p) => detailView('insights', p.card), { title: 'Quan sát hệ thống', role: 'admin' });
  Codi.route('/admin/finance', () => pageView('finance'), { title: 'Tài chính', role: 'admin' });
  Codi.route('/admin/finance/:card', (p) => detailView('finance', p.card), { title: 'Tài chính', role: 'admin' });

  // ───────────────────────── actions ─────────────────────────
  // Period/compare changes re-render every card; the previous render stays visible at reduced opacity
  // for a moment (no skeleton flash, no layout jump).
  function refresh() {
    refreshing = true; Codi.set(null);
    setTimeout(() => { refreshing = false; Codi.rerender(); }, 350);
  }
  Codi.action('aa-period', (el) => { prefs().period = el.dataset.v; refresh(); });
  Codi.action('aa-compare', () => { prefs().compare = !prefs().compare; refresh(); });
  Codi.action('aa-custom', () => ui.toast('Chọn khoảng tùy chọn nằm ngoài phạm vi prototype.', { type: 'info' }));
  Codi.action('aa-expand', (el) => { const o = prefs().open; o[el.dataset.page] = !o[el.dataset.page]; Codi.set(null); });
  Codi.action('aa-b3', (el) => { prefs().b3 = el.dataset.v; Codi.set(null); });
  Codi.action('aa-a5', (el) => { prefs().a5 = el.dataset.v; Codi.set(null); });
  Codi.action('aa-queue', (el) => ui.toast(`“${el.dataset.q}” thuộc hàng đợi của giảng viên — ngoài phạm vi prototype quản trị.`, { type: 'info' }));

  const stamp = () => { const d = new Date(Date.now() + 7 * 3600000); return d.toISOString().slice(0, 16).replace('T', ' ') + ' GMT+7'; };
  function csvFor(page, ids) {
    const w = win(); const rows = [];
    ids.forEach((id) => { const c = PAGES[page].cards[id](w); if (!c.table) return; rows.push([`${c.code} ${c.title}`]); rows.push(c.table.headers); c.table.rows.forEach((r) => rows.push(r.cells || r)); rows.push([]); });
    return rows;
  }
  Codi.action('aa-csv', (el) => {
    const page = el.dataset.page; const id = el.dataset.card; const w = win(); const c = PAGES[page].cards[id](w);
    ch.csv(`codi-${page}-${id}-${asOf()}.csv`, [`${c.code} ${c.title}`, `Khoảng: ${rangeText(w)}`, `Xuất lúc ${stamp()}`], [c.table.headers].concat(c.table.rows.map((r) => r.cells || r)));
    ui.toast(`Đã tải CSV ${c.code} (${c.table.rows.length} dòng).`, { type: 'success' });
  });
  Codi.action('aa-export', (el) => {
    const page = el.dataset.page; const P2 = PAGES[page]; const w = win();
    const ids = P2.overview.concat(P2.more).filter((id) => P2.cards[id](w).table);
    ui.modal({
      title: 'Xuất CSV', body: html`<form class="stack-3" data-submit="aa-export-go" data-page="${page}">
        <p class="small muted" style="margin:0">Khoảng: ${rangeText(w)} · giờ theo GMT+7.</p>
        <fieldset class="stack-1"><legend class="small"><strong>Thẻ cần xuất</strong></legend>
          ${ids.map((id) => { const c = P2.cards[id](w); return html`<label class="check"><input type="checkbox" name="c_${id}" checked> ${c.code} · ${c.title} <span class="xsmall muted">(${c.table.rows.length} dòng)</span></label>`; })}</fieldset>
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-close>Huỷ</button><button type="submit" class="btn btn-primary">${icon('download', { cls: 'icon-sm' })} Tải xuống</button></div></form>`,
    });
  });
  Codi.action('aa-export-go', (form, e, v) => {
    const page = form.dataset.page; const ids = Object.keys(v).filter((k) => k.startsWith('c_') && v[k]).map((k) => k.slice(2));
    if (!ids.length) { ui.toast('Chọn ít nhất một thẻ để xuất.', { type: 'warn' }); return; }
    const w = win();
    ch.csv(`codi-${page}-${asOf()}.csv`, [`Codi — ${PAGES[page].title}`, `Khoảng: ${rangeText(w)}`, `Xuất lúc ${stamp()}`], csvFor(page, ids));
    const ov = form.closest('.overlay'); const x = ov && ov.querySelector('[data-close]'); if (x) x.click();
    ui.toast(`Đã tải CSV gồm ${ids.length} thẻ.`, { type: 'success' });
  });
})();
