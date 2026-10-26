/**
 * learner-insights.js — S13b "Thống kê học tập" and S13c "Bản đồ kiến thức của tôi" (+ /insights hub).
 *
 * PRODUCT.md §6 S13b: one period selector (Tuần / Tháng / 30 ngày — default 30 ngày) + course filter.
 * Tổng quan: C1 KPI row · C2 study hours per week with the weekly goal dashed · C3 activity calendar + streak ·
 * C4 mastery per concept, sorted, text label + ghost marker at the diagnostic level (hidden if skipped).
 * "Xem chi tiết": C5 quiz & coding scores over time with dashed pass threshold + tiles · C6 per-quiz donut
 * Đúng / Sai / Chưa biết (the only donut in the product). States: no activity, little data, diagnostic skipped.
 *
 * Data: db.learnerStudyDays (minutes per day), the learner's learning record (state.learning, or the seed
 * before it exists), db.codeAttempts. Study minutes are not split per course, so the course filter applies
 * to C4–C6 and lesson counts only (said on the page).
 */
(function () {
  'use strict';
  const { html, icon, fmt, ui } = Codi;
  const ch = Codi.charts;
  const DAY = 86400000;
  const PASS = 70; // quiz pass threshold used across the learner flows

  const uid = () => Codi.state.currentUserId;
  const prefs = () => Codi.ensure('learnerStatsPrefs', () => ({ period: '30', course: 'all', open: false, quiz: null, mapCourse: null }));
  const asOf = () => Codi.db().analyticsAsOf || new Date().toISOString().slice(0, 10);
  const D = (s) => new Date(s + 'T00:00:00Z');
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const enrolledCourses = () => Codi.db().enrolments.filter((e) => e.userId === uid()).map((e) => Codi.course(e.courseId)).filter(Boolean);

  // The learning record lives in state.learning once the learner opened the course; before that, read the seed.
  function record(c) {
    const all = (Codi.state.learning || {})[uid()];
    if (all && all[c.id]) return all[c.id];
    const seed = Codi.db().learnerSeed; const s = seed && seed.userId === uid() && seed.courses[c.id];
    if (!s) return { mastery: {}, quiz: {}, completed: [], diag: { status: 'none' }, goal: null };
    const quiz = {}; Object.keys(s.quizScores).forEach((lid) => { quiz[lid] = { submitted: true, score: s.quizScores[lid] }; });
    return { mastery: s.mastery, quiz, completed: s.completed, diag: { status: s.diagnostic ? 'done' : 'none' }, goal: s.goal };
  }
  const diagCounts = (c) => { const seed = Codi.db().learnerSeed; const s = seed && seed.userId === uid() && seed.courses[c.id]; return s && s.diagnostic && s.diagnostic.right != null ? s.diagnostic : null; };

  // Period windows: Tuần = 7 ngày, Tháng = calendar month to date, 30 ngày (default); "kỳ trước" = same length before.
  function windows() {
    const end = D(asOf()); const p = prefs().period;
    const len = p === '7' ? 7 : p === 'month' ? end.getUTCDate() : 30;
    const start = end.getTime() - (len - 1) * DAY;
    return { len, start: iso(start), end: asOf(), prevStart: iso(start - len * DAY), prevEnd: iso(start - DAY) };
  }
  const studyDays = () => (Codi.db().learnerStudyDays || []).filter((d) => d.userId === uid());
  const inRange = (d, a, b) => d.date >= a && d.date <= b;

  function streakInfo(days) {
    const studied = new Set(days.filter((d) => d.minutes > 0).map((d) => d.date));
    let cur = 0; let t = D(asOf()).getTime();
    if (!studied.has(iso(t))) t -= DAY; // today not studied yet → streak counts up to yesterday
    while (studied.has(iso(t))) { cur += 1; t -= DAY; }
    let best = 0; let run = 0;
    days.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((d) => { run = d.minutes > 0 ? run + 1 : 0; best = Math.max(best, run); });
    return { cur, best };
  }
  // Completed lessons carry no date in the seed: spread them over the study days, latest lesson on the latest day.
  function completionDates(courses, days) {
    const studied = days.filter((d) => d.minutes > 0).map((d) => d.date).sort();
    const lessons = courses.flatMap((c) => record(c).completed.map((lid) => ({ c, lid })));
    return lessons.map((x, i) => ({ ...x, date: studied[Math.max(0, studied.length - lessons.length + i)] || asOf() }));
  }

  function toolbar(courses) {
    const p = prefs();
    return html`<div class="viz-toolbar" role="group" aria-label="Bộ lọc thống kê">
      <div class="viz-seg-ctrl" role="group" aria-label="Khoảng thời gian">${[['7', 'Tuần'], ['month', 'Tháng'], ['30', '30 ngày']].map(([v, l]) => html`<button type="button" aria-pressed="${String(p.period === v)}" data-action="li-period" data-v="${v}">${l}</button>`)}</div>
      <label class="sr-only" for="li-course">Khóa học</label>
      <select id="li-course" class="input" style="width:auto;min-height:40px" data-change="li-course">
        <option value="all" ${p.course === 'all' ? Codi.raw('selected') : ''}>Tất cả khóa học</option>
        ${courses.map((c) => html`<option value="${c.id}" ${p.course === c.id ? Codi.raw('selected') : ''}>${c.title}</option>`)}
      </select>
    </div>`;
  }

  // ───────────────────────── S13b ─────────────────────────
  Codi.route('/insights/stats', () => {
    const all = enrolledCourses();
    if (!all.length) return html`<div class="page">${ui.empty({ icon: 'bar-chart', title: 'Chưa có số liệu học tập', body: 'Đăng ký một khóa học, số liệu sẽ xuất hiện sau buổi học đầu tiên.', actions: html`<a class="btn btn-primary" href="#/courses">Khám phá khóa học</a>` })}</div>`;
    const p = prefs();
    if (p.course !== 'all' && !all.some((c) => c.id === p.course)) p.course = 'all';
    const courses = p.course === 'all' ? all : all.filter((c) => c.id === p.course);
    const w = windows(); const days = studyDays();
    const cur = days.filter((d) => inRange(d, w.start, w.end)); const prev = days.filter((d) => inRange(d, w.prevStart, w.prevEnd));
    const minutes = (xs) => xs.reduce((s, d) => s + d.minutes, 0);
    const activeDays = cur.filter((d) => d.minutes > 0).length;
    const done = completionDates(courses, days);
    const doneIn = (a, b) => done.filter((x) => x.date >= a && x.date <= b).length;
    const concepts = courses.flatMap((c) => (c.concepts || []).map((k) => ({ k, c, lv: record(c).mastery[k.id] || 0 })));
    const mastered = concepts.filter((x) => x.lv >= 3).length;
    const goalRec = courses.map(record).find((r) => r.goal && r.goal.hours);
    const goalHours = goalRec ? goalRec.goal.hours : 5;
    const st = streakInfo(days);

    if (!minutes(cur) && !concepts.some((x) => x.lv > 0)) {
      return html`<div class="page stack-5"><div class="page-header"><div><h1>Thống kê học tập</h1></div></div>${toolbar(all)}
        ${ui.empty({ icon: 'bar-chart', title: 'Chưa có hoạt động trong khoảng này', body: 'Học một bài là biểu đồ bắt đầu có số liệu. Thử chọn khoảng thời gian dài hơn.', actions: html`<a class="btn btn-primary" href="#/dashboard">Học tiếp</a>` })}</div>`;
    }

    // C1 — KPI row
    const c1 = html`<div class="viz-kpis">
      ${ch.kpi({ label: 'Giờ học trong kỳ', value: minutes(cur) / 60, prev: minutes(prev) / 60, format: (v) => fmt.num(Math.round(v * 10) / 10) + ' giờ', spark: cur.slice(-12).map((d) => d.minutes) })}
      ${ch.kpi({ label: 'Chuỗi ngày học', value: st.cur, format: (v) => v + ' ngày', compare: false, note: `Dài nhất: ${st.best} ngày` })}
      ${ch.kpi({ label: 'Bài hoàn thành', value: doneIn(w.start, w.end), prev: doneIn(w.prevStart, w.prevEnd) })}
      ${ch.kpi({ label: 'Kỹ năng thành thạo', value: `${mastered}/${concepts.length}`, compare: false, note: 'Mức "Thành thạo" trở lên' })}
    </div>`;

    // C2 — hours per week (or minutes per day for "Tuần") with the goal dashed
    let c2;
    if (w.len <= 7) {
      const items = cur.map((d) => ({ label: `${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][D(d.date).getUTCDay()]} ${dm(d.date)}`, value: d.minutes }));
      c2 = { title: 'Phút học mỗi ngày', question: 'Mỗi ngày bạn học bao lâu so với mục tiêu?', body: ch.bars({ items, goal: Math.round((goalHours * 60) / 7), goalLabel: 'Mục tiêu/ngày', format: (v) => v + ' phút', capFormat: (v) => String(v), ariaLabel: 'Phút học mỗi ngày' }), table: { headers: ['Ngày', 'Phút'], rows: cur.map((d) => [dm(d.date), String(d.minutes)]) } };
    } else {
      const wk = [];
      days.filter((d) => d.date <= w.end).slice(-56).forEach((d) => { const dt = D(d.date); const mon = iso(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * DAY); let x = wk[wk.length - 1]; if (!x || x.start !== mon) { x = { start: mon, m: 0 }; wk.push(x); } x.m += d.minutes; });
      const items = wk.slice(-6).map((x) => ({ label: 'Tuần ' + dm(x.start), value: Math.round((x.m / 60) * 10) / 10 }));
      c2 = { title: 'Giờ học mỗi tuần', question: 'Bạn có đạt mục tiêu giờ học hằng tuần?', body: ch.bars({ items, goal: goalHours, goalLabel: goalRec ? 'Mục tiêu tuần' : 'Mục tiêu tuần (Giả định)', format: (v) => fmt.num(v) + ' giờ', capFormat: (v) => fmt.num(v), ariaLabel: 'Giờ học mỗi tuần' }), table: { headers: ['Tuần', 'Giờ học'], rows: items.map((i) => [i.label, fmt.num(i.value)]) }, note: 'Tuần gần nhất có thể chưa kết thúc.' };
    }
    if (!goalRec) c2.note = (c2.note ? c2.note + ' ' : '') + 'Bạn chưa đặt mục tiêu, Codi tạm dùng 5 giờ/tuần (Giả định).';

    // C3 — calendar for the period (rounded out to whole weeks by the chart)
    const calDays = days.filter((d) => inRange(d, w.len < 28 ? iso(D(w.end).getTime() - 27 * DAY) : w.start, w.end));
    const c3 = { title: 'Lịch học', question: `Chuỗi hiện tại: ${st.cur} ngày liên tiếp`, body: ch.calendar({ days: calDays.map((d) => ({ date: d.date, value: d.minutes })), today: asOf(), unit: 'phút', ariaLabel: 'Lịch học theo ngày' }), table: { headers: ['Ngày', 'Phút'], rows: calDays.map((d) => [dm(d.date), String(d.minutes)]) } };

    // C4 — mastery per concept, sorted; ghost marker = level at the diagnostic test (derived), hidden if skipped
    const skipped = courses.every((c) => record(c).diag.status !== 'done');
    const c4items = concepts.map((x) => ({
      label: p.course === 'all' && all.length > 1 ? `${x.k.name} · ${x.c.title.split(' ')[0]}` : x.k.name,
      value: x.lv, max: 4, text: Codi.ui.masteryLabel(x.lv),
      marker: !skipped && record(x.c).diag.status === 'done' && x.lv > 0 ? Math.max(0, x.lv - 1 - (x.k.id.length % 2)) : null,
      markerLabel: 'Lúc làm bài đầu vào', markerText: Codi.ui.masteryLabel(Math.max(0, x.lv - 1 - (x.k.id.length % 2))),
      tip: `Mức ${x.lv}/4`,
    }));
    const c4 = { title: 'Mức thành thạo theo kỹ năng', question: 'Kỹ năng nào vững, kỹ năng nào cần ôn?', body: html`${ch.hbars({ items: c4items, emptyText: 'Chưa có kỹ năng nào được ghi nhận.' })}
      ${!skipped ? html`<div class="viz-legend-inline" style="margin-top:8px"><span class="viz-marker-key" aria-hidden="true"></span> Vạch đứt: mức lúc làm bài kiểm tra đầu vào</div>` : ''}`,
      note: skipped ? 'Bạn đã bỏ qua bài kiểm tra đầu vào nên không có mốc so sánh. Có thể làm lại từ trang lộ trình.' : 'Mốc đầu vào được suy ra từ kết quả bài kiểm tra đầu vào.',
      table: { headers: ['Kỹ năng', 'Mức hiện tại', 'Lúc làm bài đầu vào'], rows: c4items.map((i) => [i.label, i.text, i.marker != null ? i.markerText : '—']) } };

    // C5 — quiz & coding scores over time, dashed pass threshold
    const scores = [];
    courses.forEach((c) => {
      const r = record(c); const order = c.chapters.flatMap((chp) => chp.lessons.map((l) => l.id));
      Object.keys(r.quiz || {}).filter((lid) => r.quiz[lid].submitted).sort((a, b) => order.indexOf(a) - order.indexOf(b)).forEach((lid) => { const l = Codi.lesson(c, lid); scores.push({ label: l ? l.title : lid, kind: 'Quiz', y: r.quiz[lid].score }); });
      (Codi.db().codeAttempts || []).filter((a) => a.userId === uid() && a.courseId === c.id && a.submits).forEach((a) => { const l = Codi.lesson(c, a.lessonId); scores.push({ label: l ? l.title : a.lessonId, kind: 'Bài code', y: a.bestScore }); });
    });
    const pts = scores.map((s, i) => ({ x: i, y: s.y, label: `#${i + 1}`, note: `${s.kind}: ${s.label}` }));
    const passRate = scores.length ? (scores.filter((s) => s.y >= PASS).length / scores.length) * 100 : 0;
    const c5 = { title: 'Điểm quiz & bài code theo thời gian', question: 'Điểm của bạn có ổn định trên ngưỡng đạt?', sample: scores.length,
      body: scores.length ? html`<div class="viz-tiles" style="margin-bottom:12px">
          <div class="viz-tile"><span class="viz-tile-label">Trung bình</span><span class="viz-tile-value">${Math.round(scores.reduce((s, x) => s + x.y, 0) / scores.length)}%</span></div>
          <div class="viz-tile"><span class="viz-tile-label">Cao nhất</span><span class="viz-tile-value">${Math.max(...scores.map((s) => s.y))}%</span></div>
          <div class="viz-tile"><span class="viz-tile-label">Tỉ lệ đạt (≥ ${PASS}%)</span><span class="viz-tile-value">${Math.round(passRate)}%</span></div></div>
        ${ch.line({ series: [{ name: 'Điểm', points: pts }], threshold: { value: PASS, label: `Ngưỡng đạt ${PASS}%` }, yFormat: (v) => Math.round(v) + '%', ariaLabel: 'Điểm theo lượt làm' })}` : '',
      state: scores.length ? 'ok' : 'empty', emptyText: 'Bạn chưa nộp quiz hay bài code nào.',
      table: { headers: ['Lượt', 'Loại', 'Bài', 'Điểm'], rows: scores.map((s, i) => [`#${i + 1}`, s.kind, s.label, s.y + '%']) } };

    // C6 — one quiz at a time: Đúng / Sai / Chưa biết
    const quizzes = [];
    courses.forEach((c) => {
      const dc = diagCounts(c); if (dc && record(c).diag.status === 'done') quizzes.push({ id: c.id + ':diag', label: `Bài kiểm tra đầu vào · ${c.title}`, correct: dc.right, wrong: dc.wrong, unknown: dc.unknown });
      const r = record(c);
      Object.keys(r.quiz || {}).filter((lid) => r.quiz[lid].submitted).forEach((lid) => { const l = Codi.lesson(c, lid); const n = (l && l.quiz && l.quiz.questions.length) || 4; const ok = Math.round((r.quiz[lid].score / 100) * n); quizzes.push({ id: c.id + ':' + lid, label: l ? l.title : lid, correct: ok, wrong: n - ok, unknown: 0 }); });
    });
    const sel = quizzes.find((q) => q.id === p.quiz) || quizzes[quizzes.length - 1];
    const c6 = { title: 'Kết quả một bài quiz', question: 'Bạn đúng, sai bao nhiêu câu ở bài đã chọn?',
      actions: quizzes.length > 1 ? html`<label class="sr-only" for="li-quiz">Chọn bài quiz</label><select id="li-quiz" class="input" style="width:auto;max-width:220px;min-height:36px" data-change="li-quiz">${quizzes.map((q) => html`<option value="${q.id}" ${sel && q.id === sel.id ? Codi.raw('selected') : ''}>${q.label}</option>`)}</select>` : '',
      body: sel ? ch.donut(Object.assign({}, sel)) : '', state: sel ? 'ok' : 'empty', emptyText: 'Chưa có bài quiz nào được nộp.',
      table: sel ? { headers: ['Kết quả', 'Số câu'], rows: [['Đúng', String(sel.correct)], ['Sai', String(sel.wrong)], ['Chưa biết', String(sel.unknown)]] } : null };

    const little = activeDays > 0 && activeDays < 3;
    return html`<div class="page stack-5">
      <div class="page-header"><div><h1>Thống kê học tập</h1><p class="muted">Bạn học đều đặn đến đâu và kỹ năng nào đang lên.</p></div><a class="btn btn-secondary" href="#/insights/knowledge-map">${icon('map', { cls: 'icon-sm' })} Bản đồ kiến thức</a></div>
      ${toolbar(all)}
      <p class="small muted" style="margin:0">${dm(w.start)} – ${dm(w.end)} · so với ${dm(w.prevStart)} – ${dm(w.prevEnd)}${p.course !== 'all' ? ' · Giờ học tính trên mọi khóa (thời gian học chưa tách theo khóa).' : ''}</p>
      ${little ? html`<p class="viz-warn"><span aria-hidden="true">▲</span> Mới có ${activeDays} ngày học trong khoảng này — biểu đồ sẽ rõ hơn sau vài buổi học nữa.</p>` : ''}
      ${ch.card({ code: 'C1', title: 'Tóm tắt kỳ này', body: c1, wide: true })}
      <div class="viz-grid-cards">
        ${ch.card(Object.assign({ code: 'C2' }, c2))}
        ${ch.card(Object.assign({ code: 'C3' }, c3))}
        ${ch.card(Object.assign({ code: 'C4', wide: true }, c4))}
      </div>
      <div class="viz-section-head"><h2>Chi tiết thêm</h2><button type="button" class="btn btn-secondary btn-sm" data-action="li-expand" aria-expanded="${String(!!p.open)}">${icon(p.open ? 'chevron-down' : 'chevron-right', { cls: 'icon-sm' })} ${p.open ? 'Thu gọn' : 'Xem chi tiết (2 thẻ)'}</button></div>
      ${p.open ? html`<div class="viz-grid-cards">${ch.card(Object.assign({ code: 'C5', wide: true }, c5))}${ch.card(Object.assign({ code: 'C6', wide: true }, c6))}</div>` : ''}
    </div>`;
  }, { title: 'Thống kê học tập', role: 'learner' });

  Codi.action('li-period', (el) => { prefs().period = el.dataset.v; Codi.set(null); });
  Codi.action('li-course', (el) => { prefs().course = el.value; prefs().quiz = null; Codi.set(null); });
  Codi.action('li-quiz', (el) => { prefs().quiz = el.value; Codi.set(null); });
  Codi.action('li-expand', () => { prefs().open = !prefs().open; Codi.set(null); });

  // ───────────────────────── S13c Bản đồ kiến thức của tôi ─────────────────────────
  // A concept is locked until every prerequisite reaches "Đang học" — shown, never bypassed.
  Codi.route('/insights/knowledge-map', () => {
    const all = enrolledCourses().filter((c) => (c.concepts || []).length);
    if (!all.length) return html`<div class="page">${ui.empty({ icon: 'map', title: 'Chưa có bản đồ kiến thức', body: 'Bản đồ xuất hiện khi bạn học một khóa có danh sách khái niệm.', actions: html`<a class="btn btn-primary" href="#/courses">Khám phá khóa học</a>` })}</div>`;
    const p = prefs();
    const c = all.find((x) => x.id === p.mapCourse) || all[0];
    const r = record(c);
    const lv = (id) => r.mastery[id] || 0;
    const pre = (id) => (c.prerequisites || []).filter((e) => e.to === id).map((e) => e.from);
    const nodes = c.concepts.map((k) => ({ id: k.id, label: k.name, mastery: lv(k.id), locked: lv(k.id) === 0 && pre(k.id).some((f) => lv(f) < 1) }));
    const sorted = nodes.slice().sort((a, b) => b.mastery - a.mastery);
    const next = nodes.filter((n) => !n.locked && n.mastery < 3).sort((a, b) => a.mastery - b.mastery)[0];
    return html`<div class="page stack-5">
      <div class="page-header"><div><h1>Bản đồ kiến thức của tôi</h1><p class="muted">Mỗi ô là một khái niệm; mũi tên chỉ khái niệm cần học trước.</p></div><a class="btn btn-secondary" href="#/insights/stats">${icon('bar-chart', { cls: 'icon-sm' })} Thống kê học tập</a></div>
      ${all.length > 1 ? html`<div class="viz-toolbar"><label class="sr-only" for="li-map">Khóa học</label><select id="li-map" class="input" style="width:auto;min-height:40px" data-change="li-map">${all.map((x) => html`<option value="${x.id}" ${x.id === c.id ? Codi.raw('selected') : ''}>${x.title}</option>`)}</select></div>` : ''}
      ${next ? html`<p class="small" style="margin:0">${icon('lightbulb', { cls: 'icon-sm' })} Nên ôn tiếp: <strong>${next.label}</strong> (${Codi.ui.masteryLabel(next.mastery)}).</p>` : ''}
      ${ch.card({ title: c.title, question: `${nodes.filter((n) => n.mastery >= 3).length}/${nodes.length} khái niệm đã thành thạo · ${nodes.filter((n) => n.locked).length} chưa mở khoá`, body: ch.graph({ nodes, edges: c.prerequisites || [], ariaLabel: 'Bản đồ khái niệm ' + c.title }), wide: true,
        table: { headers: ['Khái niệm', 'Mức', 'Cần học trước'], rows: nodes.map((n) => [n.label, n.locked ? 'Chưa mở khoá' : Codi.ui.masteryLabel(n.mastery), pre(n.id).map((f) => (c.concepts.find((k) => k.id === f) || {}).name).join(', ') || '—']) } })}
      ${ch.card({ title: 'Theo mức thành thạo', body: ch.hbars({ items: sorted.map((n) => ({ label: n.label, value: n.mastery, max: 4, text: n.locked ? 'Chưa mở khoá' : Codi.ui.masteryLabel(n.mastery) })), sort: false }), wide: true })}
    </div>`;
  }, { title: 'Bản đồ kiến thức', role: 'learner' });
  Codi.action('li-map', (el) => { prefs().mapCourse = el.value; Codi.set(null); });

  // ───────────────────────── /insights hub ─────────────────────────
  Codi.route('/insights', () => html`<div class="page stack-5">
      <div class="page-header"><div><h1>Thống kê & bản đồ kiến thức</h1><p class="muted">Xem nhịp học và mức thành thạo của bạn.</p></div></div>
      <div class="viz-grid-cards">
        <a class="viz-card li-hub" href="#/insights/stats"><span class="li-hub-icon">${icon('bar-chart')}</span><strong>Thống kê học tập</strong><span class="small muted">Giờ học, chuỗi ngày, điểm quiz và kỹ năng.</span></a>
        <a class="viz-card li-hub" href="#/insights/knowledge-map"><span class="li-hub-icon">${icon('map')}</span><strong>Bản đồ kiến thức của tôi</strong><span class="small muted">Khái niệm nào đã vững, khái niệm nào chưa mở khoá.</span></a>
      </div>
      <a class="btn btn-ghost" style="width:fit-content" href="#/progress">Điểm, bài tập và nhận xét: Tiến độ & kết quả</a>
    </div>`, { title: 'Thống kê học tập', role: 'learner' });
})();
