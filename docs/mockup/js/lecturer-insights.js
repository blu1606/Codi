/**
 * lecturer-insights.js — lecturer insights dashboard (PRODUCT.md §7.21–23, Flow T4, S29b).
 * Route: '/teach/insights' · revenue overview: B1 (KPI), B2 (line chart), B3 (table).
 * Filtered to own courses; states: no sales yet, course not published.
 */
(function () {
  'use strict';
  const { html, icon, fmt, ui } = Codi;
  const me = () => Codi.currentUser();
  const myCourses = () => Codi.db().courses.filter((c) => c.lecturerId === me().id);
  const isMine = (c) => c && c.lecturerId === me().id;
  const byCourse = (list) => list.filter((x) => myCourses().some((c) => c.id === x.courseId));

  // Period helpers
  const PERIODS = [
    { k: '7d', l: 'Tuần này', days: 7 },
    { k: '30d', l: '30 ngày', days: 30 },
    { k: '90d', l: '90 ngày', days: 90 },
  ];
  const periodDates = (days) => {
    const today = new Date();
    const start = new Date(today); start.setDate(start.getDate() - days);
    const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - days);
    const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
    return { start, prevStart, prevEnd };
  };
  const inPeriod = (date, start, end) => {
    const d = new Date(date);
    return d >= start && d <= end;
  };

  // Revenue calculation helpers
  function calculateRevenue(period = '30d') {
    const p = PERIODS.find((x) => x.k === period);
    const days = p ? p.days : 30;
    const dates = periodDates(days);
    const today = new Date();

    // Get orders from lecturer's courses in current period
    const allOrders = Codi.db().orders || [];
    const myOrdersCurr = allOrders.filter((o) => {
      if (o.status !== 'paid') return false;
      return myCourses().some((c) => o.courseIds.includes(c.id) && inPeriod(o.paidAt, dates.start, today));
    });
    const myOrdersPrev = allOrders.filter((o) => {
      if (o.status !== 'paid') return false;
      return myCourses().some((c) => o.courseIds.includes(c.id) && inPeriod(o.paidAt, dates.prevStart, dates.prevEnd));
    });

    // Gross + net revenue
    const grossCurr = myOrdersCurr.reduce((s, o) => s + (o.total || 0), 0);
    const netCurr = myOrdersCurr.reduce((s, o) => s + ((o.total || 0) - (o.discountAmount || 0)), 0);
    const grossPrev = myOrdersPrev.reduce((s, o) => s + (o.total || 0), 0);
    const netPrev = myOrdersPrev.reduce((s, o) => s + ((o.total || 0) - (o.discountAmount || 0)), 0);

    // KPI data
    const kpiData = [
      { k: 'gross', label: 'Doanh thu gộp', curr: grossCurr, prev: grossPrev },
      { k: 'net', label: 'Doanh thu ròng', curr: netCurr, prev: netPrev },
      { k: 'orders', label: 'Đơn thanh toán', curr: myOrdersCurr.length, prev: myOrdersPrev.length },
      { k: 'discount', label: 'Tiền giảm giá', curr: myOrdersCurr.reduce((s, o) => s + (o.discountAmount || 0), 0), prev: myOrdersPrev.reduce((s, o) => s + (o.discountAmount || 0), 0) },
    ];

    // Revenue by course (B3)
    const courseRevenue = {};
    myCourses().forEach((c) => {
      const orders = myOrdersCurr.filter((o) => o.courseIds.includes(c.id));
      const total = orders.reduce((s, o) => s + (o.total || 0), 0);
      courseRevenue[c.id] = { course: c, orders: orders.length, total };
    });

    // Line chart data (B2): daily/weekly/monthly aggregation
    const chartData = generateChartData(myOrdersCurr, myOrdersPrev, dates, period);

    return { kpiData, courseRevenue, chartData, dates, period, myOrdersCurr, myOrdersPrev };
  }

  function generateChartData(curr, prev, dates, period) {
    const isDaily = period === '7d';
    const isWeekly = period === '30d';
    const isMonthly = period === '90d';

    const bucketed = {};
    const prevBucketed = {};

    // Current period bucketing
    curr.forEach((o) => {
      const d = new Date(o.paidAt);
      let key;
      if (isDaily) key = fmt.date(d); // Day of week or date
      else if (isWeekly) key = fmt.date(d);
      else key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); // YYYY-MM

      bucketed[key] = (bucketed[key] || 0) + (o.total || 0);
    });

    // Previous period bucketing (aligned)
    prev.forEach((o) => {
      const d = new Date(o.paidAt);
      let key;
      if (isDaily) key = fmt.date(d);
      else if (isWeekly) key = fmt.date(d);
      else key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

      prevBucketed[key] = (prevBucketed[key] || 0) + (o.total || 0);
    });

    // Construct data series
    const keys = Object.keys(bucketed).sort();
    const series = keys.map((k) => ({
      x: k,
      curr: bucketed[k] || 0,
      prev: prevBucketed[k] || 0,
    }));

    const currTotal = Object.values(bucketed).reduce((s, v) => s + v, 0);
    const avg = keys.length ? Math.round(currTotal / keys.length) : 0;

    return { series, currTotal, avg };
  }

  function kpiCard(data, period) {
    const delta = data.curr - data.prev;
    const deltaPct = data.prev ? Math.round((delta / data.prev) * 100) : 0;
    const deltaSign = delta > 0 ? '+' : '';
    const isNumeric = ['orders', 'discount'].includes(data.k);

    return html`<div class="stat-tile">
      <div class="row-between"><strong class="small">${data.label}</strong><span class="xsmall muted">kỳ trước ${fmt.vnd(data.prev)}</span></div>
      <div class="stat-value" style="margin:8px 0">${isNumeric ? fmt.num(data.curr) : fmt.vnd(data.curr)}</div>
      <span class="xsmall ${delta >= 0 ? 'text-success' : 'text-danger'}">${deltaSign}${deltaPct}%</span>
    </div>`;
  }

  function revenueLineChart(chartData) {
    if (!chartData.series.length) {
      return html`<div class="card"><div class="card-body" style="text-align:center;padding:40px"><p class="small muted">Chưa có dữ liệu doanh thu trong kỳ này.</p></div></div>`;
    }
    // Note: real implementation would use Codi.charts.line(data) from js/charts.js
    // For now, return a simple visualization
    return html`<div class="card"><div class="card-body stack-2">
      <div class="row-between"><strong class="small">Doanh thu theo thời gian</strong><span class="xsmall muted">Dòng đứt: kỳ trước · Dòng liền: kỳ này</span></div>
      ${Codi.charts ? Codi.charts.line({
        series: [
          { name: 'Kỳ này', data: chartData.series.map((d) => ({ x: d.x, y: d.curr })) },
          { name: 'Kỳ trước', data: chartData.series.map((d) => ({ x: d.x, y: d.prev })), dashed: true },
        ],
        legend: true,
      }) : html`<p class="xsmall muted">Biểu đồ không khả dụng.</p>`}
      <div class="row" style="gap:16px;margin-top:12px">
        <span class="xsmall"><strong>TB:</strong> ${fmt.vnd(chartData.avg)}/ngày</span>
        <span class="xsmall"><strong>Tổng:</strong> ${fmt.vnd(chartData.currTotal)}</span>
      </div>
    </div></div>`;
  }

  function revenueByCoursTable(courseRevenue) {
    const rows = Object.values(courseRevenue)
      .filter((r) => r.course && ['published', 'hidden'].includes(r.course.status))
      .sort((a, b) => b.total - a.total);

    if (!rows.length) {
      return html`<div class="card"><div class="card-body"><p class="small muted">Không có khoá học đã xuất bản có doanh thu.</p></div></div>`;
    }

    const totalRevenue = rows.reduce((s, r) => s + r.total, 0);

    return html`<div class="card"><div class="card-header"><h2 class="tc-h">Doanh thu theo khoá học</h2><span class="small muted">${rows.length} khoá học</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Khoá học</th><th class="num">Đơn</th><th class="num">Doanh thu</th><th style="width:100px">Tỉ lệ</th></tr></thead><tbody>
        ${rows.map((r) => {
          const pct = totalRevenue ? Math.round((r.total / totalRevenue) * 100) : 0;
          return html`<tr><td><strong class="small">${r.course.title}</strong></td><td class="num">${r.orders}</td><td class="num">${fmt.vnd(r.total)}</td><td><div class="row small" style="gap:4px">${ui.progress(pct)}<span>${pct}%</span></div></td></tr>`;
        })}
        <tr style="border-top:1px solid var(--border);font-weight:600"><td>Tổng cộng</td><td class="num">${rows.reduce((s, r) => s + r.orders, 0)}</td><td class="num">${fmt.vnd(totalRevenue)}</td><td>100%</td></tr>
      </tbody></table></div>
    </div>`;
  }

  // Main route
  Codi.route('/teach/insights', (p, q) => {
    const courses = myCourses();
    const published = courses.filter((c) => ['published', 'hidden'].includes(c.status));

    // Empty states
    if (!courses.length) {
      return Codi.teach.shell('/teach', html`
        <div class="page-header"><div><h1>Doanh thu khóa học của tôi</h1><p class="muted">Theo dõi doanh thu và đơn hàng từ các khoá học bạn dạy.</p></div></div>
        <div class="card">${ui.empty({ icon: 'trending-up', title: 'Bạn chưa có khoá học nào', body: 'Tạo khoá học và xuất bản để bắt đầu bán.' })}</div>
      `);
    }
    if (!published.length) {
      return Codi.teach.shell('/teach', html`
        <div class="page-header"><div><h1>Doanh thu khóa học của tôi</h1><p class="muted">Theo dõi doanh thu và đơn hàng từ các khoá học bạn dạy.</p></div></div>
        <div class="card">${ui.empty({ icon: 'trending-up', title: 'Chưa có khoá học nào được xuất bản', body: 'Khi xuất bản khoá học, doanh thu sẽ hiển thị ở đây.' })}</div>
      `);
    }

    const period = q.period || '30d';
    const rev = calculateRevenue(period);
    const periodLabel = PERIODS.find((x) => x.k === period)?.l || '30 ngày';

    return Codi.teach.shell('/teach', html`
      <div class="page-header"><div><h1>Doanh thu khóa học của tôi</h1><p class="muted">Theo dõi doanh thu và đơn hàng. Dữ liệu lọc theo khoá học bạn dạy.</p></div></div>
      <div class="row-between" style="margin-bottom:16px"><div class="row" style="gap:8px">
        ${PERIODS.map((p) => html`<a class="btn ${period === p.k ? 'btn-primary' : 'btn-ghost'}" href="#/teach/insights?period=${p.k}">${p.l}</a>`)}
      </div></div>
      <div class="grid-4" style="margin-bottom:24px">${rev.kpiData.map((d) => kpiCard(d, period))}</div>
      ${revenueLineChart(rev.chartData)}
      <div style="margin-top:24px">${revenueByCoursTable(rev.courseRevenue)}</div>
    `);
  }, { title: 'Doanh thu khóa học', role: 'lecturer' });
})();
