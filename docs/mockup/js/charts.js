/**
 * Codi.charts — chart kit for every analytics surface (S13b, S13c, S24, S29b, S36, S37).
 *
 * Rules it enforces (PRODUCT.md §7.21 + the data-viz method):
 *  - one question per chart; exact values via a hover/focus tooltip AND a table view (tooltips never gate);
 *  - current period = solid accent line, previous period = dashed muted line; goals/thresholds dashed;
 *  - thin marks (bars ≤ 24px, 2px lines), hairline solid grid, 2px surface gap between touching fills;
 *  - identity never colour-only: legends for ≥ 2 series, counts on status segments, mastery text labels;
 *  - no pie/donut except the single-quiz result; no radar; one y-axis only;
 *  - colours come only from css/charts.css tokens (validated palette, light + dark).
 *
 * Every function returns SafeHTML (Codi.raw). Layout is HTML + a stretched SVG for line paths
 * (vector-effect keeps strokes 2px), so labels stay crisp and readable at 390px.
 *
 * API (all options optional unless noted):
 *  kpi({label, value, format, prev, delta, deltaGood:'up'|'down', spark:[n], note, compare})
 *  line({series:[{name, points|data:[{x,y,label}], dashed, role}], yFormat, xLabel, height, threshold:{value,label}, ariaLabel})
 *  bars({items:[{label, value, tip}], goal, goalLabel, format, height, ariaLabel})
 *  hbars({items:[{label, value, max, marker, markerLabel, text, tip}], format, sort})
 *  stacked({segments:[{label, value, amount, tone}], format, amountFormat})
 *  stackedCols({cols:[{label, values:[n]}], keys:[{label, tone}], format, height})
 *  calendar({days:[{date, value}], unit})
 *  funnel({steps:[{label, value}], format})
 *  heatmap({cols:[label], rows:[{label, n, cells:[pct|null], pinned}], minN})
 *  donut({correct, wrong, unknown, label} | {value, total, label})
 *  graph({nodes:[{id,label,mastery,locked}], edges:[{from,to}], cycle:[id], highlightPath:[id], selected, onSelectAction})
 *  card({id, title, question, body, table:{headers, rows}, detailHref, actions, state, emptyText, sample, minSample, note, wide})
 *  table(headers, rows) · csv(filename, headers, rows) · fmt helpers: num, compact, pct
 */
(function () {
  'use strict';
  const C = (window.Codi = window.Codi || {});
  const charts = (C.charts = C.charts || {});

  // ───────────────────────── helpers ─────────────────────────
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const out = (s) => (C.raw ? C.raw(s) : s);
  const nf = new Intl.NumberFormat('vi-VN');
  const num = (n) => (typeof n === 'number' && isFinite(n) ? nf.format(Math.round(n * 10) / 10) : String(n == null ? '—' : n));
  const one = (v) => nf.format(Math.round(v * 10) / 10);
  const compact = (n) => {
    if (typeof n !== 'number' || !isFinite(n)) return String(n);
    const a = Math.abs(n);
    if (a >= 1e9) return one(n / 1e9) + ' tỷ';
    if (a >= 1e6) return one(n / 1e6) + ' tr';
    if (a >= 1e4) return one(n / 1e3) + 'k';
    return num(n);
  };
  const pct = (v, digits) => (v == null || !isFinite(v) ? '—' : nf.format(Number(v.toFixed(digits == null ? 0 : digits))) + '%');
  let seq = 0;
  const uid = (p) => `${p}-${(++seq).toString(36)}`;
  const fmtOf = (f) => (typeof f === 'function' ? f : num);
  const tip = (lines) => esc(lines.filter((l) => l !== '' && l != null).join('\n'));

  // Clean axis: 0 … top in 4–5 round steps.
  function niceStep(range) {
    const raw = range / 4 || 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }
  function scale(maxVal) {
    if (!(maxVal > 0)) return { top: 1, ticks: [0, 1] };
    const step = niceStep(maxVal);
    const top = Math.ceil(maxVal / step - 1e-9) * step;
    const ticks = [];
    for (let v = 0; v <= top + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
    return { top, ticks };
  }
  const empty = (text) => `<div class="viz-empty">${esc(text || 'Chưa có dữ liệu trong kỳ này.')}</div>`;

  function table(headers, rows, opts) {
    const o = opts || {};
    return `<table class="table viz-data-table">${o.caption ? `<caption class="sr-only">${esc(o.caption)}</caption>` : ''}
      <thead><tr>${headers.map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.pinned ? 'is-pinned' : ''}">${(r.cells || r).map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td class="num">${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table>`;
  }

  // ───────────────────────── tooltip (one shared layer) ─────────────────────────
  // Any element with data-tip="Title\nline\nline" shows it on hover and on keyboard focus.
  const tipEl = document.createElement('div');
  tipEl.className = 'viz-tip'; tipEl.setAttribute('role', 'tooltip'); tipEl.hidden = true;
  const mount = () => { if (!tipEl.isConnected && document.body) document.body.appendChild(tipEl); };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  let tipFor = null;
  function place(x, y) {
    const r = tipEl.getBoundingClientRect();
    let left = x - r.width / 2; let top = y - r.height - 12;
    left = Math.max(8, Math.min(window.innerWidth - r.width - 8, left));
    if (top < 8) top = y + 16;
    tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
  }
  function showTip(el, x, y) {
    const lines = (el.getAttribute('data-tip') || '').split('\n');
    if (!lines[0]) return;
    mount();
    tipEl.innerHTML = `<strong>${esc(lines[0])}</strong>${lines.slice(1).map((l) => `<span>${esc(l)}</span>`).join('')}`;
    tipEl.hidden = false; tipFor = el;
    if (x == null) { const r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; }
    place(x, y);
  }
  const hideTip = () => { tipEl.hidden = true; tipFor = null; };
  document.addEventListener('mouseover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); else if (tipFor) hideTip(); });
  document.addEventListener('mousemove', (e) => { if (tipFor && !tipEl.hidden) place(e.clientX, e.clientY); });
  document.addEventListener('focusin', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el); });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
  window.addEventListener('scroll', hideTip, true);

  // ───────────────────────── KPI tile ─────────────────────────
  // delta is computed from prev when given; deltaGood:'down' marks inverted metrics (errors, wait time),
  // so a rise there reads as deterioration.
  charts.kpi = function (o) {
    const f = fmtOf(o.format);
    const value = o.value;
    let delta = o.delta; let rel = null;
    if (o.prev != null && typeof value === 'number') {
      delta = value - o.prev;
      rel = o.prev ? (delta / Math.abs(o.prev)) * 100 : null;
    }
    const good = (o.deltaGood || 'up') === 'up';
    let deltaHtml = '';
    if (o.compare === false) deltaHtml = '';
    else if (delta == null) deltaHtml = o.prevMissing ? `<div class="viz-kpi-delta is-na">Chưa có kỳ trước để so sánh</div>` : '';
    else {
      const dir = Math.abs(delta) < 1e-9 ? 'flat' : (delta > 0) === good ? 'good' : 'bad';
      const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '■';
      const amount = rel != null ? pct(Math.abs(rel), Math.abs(rel) < 10 ? 1 : 0) : f(Math.abs(delta));
      const word = dir === 'good' ? 'tốt hơn' : dir === 'bad' ? 'kém hơn' : 'không đổi';
      deltaHtml = `<div class="viz-kpi-delta is-${dir}"><span aria-hidden="true">${arrow}</span> ${esc(amount)} <span class="viz-kpi-vs">so với kỳ trước</span><span class="sr-only"> (${word})</span></div>`;
    }
    let spark = '';
    const s = o.spark;
    if (s && s.length > 1) {
      const max = Math.max(...s); const min = Math.min(...s); const rng = max - min || 1;
      const pts = s.map((v, i) => `${((i / (s.length - 1)) * 100).toFixed(1)},${(28 - ((v - min) / rng) * 24).toFixed(1)}`);
      const last = pts[pts.length - 1].split(',');
      spark = `<svg class="viz-spark" viewBox="-3 0 106 32" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(' ')}" vector-effect="non-scaling-stroke"/><circle cx="${last[0]}" cy="${last[1]}" r="3"/></svg>`;
    }
    return out(`<div class="viz-kpi">
      <div class="viz-kpi-label">${esc(o.label)}</div>
      <div class="viz-kpi-row"><div class="viz-kpi-value">${esc(typeof value === 'number' ? f(value) : value)}</div>${spark}</div>
      ${deltaHtml}${o.note ? `<div class="viz-kpi-note">${esc(o.note)}</div>` : ''}
    </div>`);
  };

  // ───────────────────────── shared cartesian frame ─────────────────────────
  function frame(o) {
    const { height, ticks, top, yFormat, plot, xLabels, ariaLabel, legend } = o;
    const grid = ticks.map((t) => `<div class="viz-grid" style="bottom:${((t / top) * 100).toFixed(2)}%"></div>`).join('');
    const yl = ticks.map((t) => `<span style="bottom:${((t / top) * 100).toFixed(2)}%">${esc(yFormat(t))}</span>`).join('');
    // role="group" (not img): the plot holds focusable hover targets; values are also in the sr-only table.
    return `<div class="viz-frame" role="group" aria-label="${esc(ariaLabel || 'Biểu đồ')}">
      ${legend || ''}
      <div class="viz-xy" style="--viz-h:${height}px">
        <div class="viz-yaxis" aria-hidden="true">${yl}</div>
        <div class="viz-plot">${grid}${plot}</div>
        <div></div>
        <div class="viz-xaxis" aria-hidden="true">${xLabels}</div>
      </div>
    </div>`;
  }
  const pickLabels = (n, max) => {
    if (n <= max) return Array.from({ length: n }, (_, i) => i);
    const step = (n - 1) / (max - 1);
    return Array.from({ length: max }, (_, i) => Math.round(i * step));
  };

  // ───────────────────────── line ─────────────────────────
  charts.line = function (o) {
    const series = (o.series || []).map((s) => Object.assign({}, s, { points: s.points || s.data || [] })).filter((s) => s.points.length);
    if (!series.length) return out(empty(o.emptyText));
    const yFormat = fmtOf(o.yFormat);
    const n = Math.max(...series.map((s) => s.points.length));
    const vals = series.flatMap((s) => s.points.map((p) => p.y)).concat(o.threshold ? [o.threshold.value] : []);
    const { top, ticks } = scale(Math.max(...vals));
    const base = series[0].points;
    const xl = (i) => { const p = base[i] || {}; return p.label != null ? p.label : o.xLabel ? o.xLabel(p.x, i) : String(p.x != null ? p.x : i + 1); };
    const X = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
    const Y = (v) => 100 - (v / top) * 100;
    const roleOf = (s, k) => s.role || (s.dashed ? 'previous' : k === 0 ? 'current' : 'series' + Math.min(k + 1, 5));
    const paths = series.map((s, k) => {
      const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${(X(i) * 10).toFixed(1)} ${(Y(p.y) * 10).toFixed(1)}`).join(' ');
      return `<path class="viz-line is-${roleOf(s, k)}" d="${d}" vector-effect="non-scaling-stroke"/>`;
    }).join('');
    const svg = `<svg class="viz-lines" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>`;
    const thr = o.threshold ? `<div class="viz-ref" style="bottom:${(100 - Y(o.threshold.value)).toFixed(2)}%"><span>${esc(o.threshold.label || yFormat(o.threshold.value))}</span></div>` : '';
    // End marker + direct label on the main series only (selective labelling).
    const last = base[base.length - 1];
    const endDot = last ? `<span class="viz-dot is-${roleOf(series[0], 0)} is-end" style="left:${X(base.length - 1)}%;bottom:${100 - Y(last.y)}%"></span><span class="viz-endlabel" style="bottom:${100 - Y(last.y)}%">${esc(yFormat(last.y))}</span>` : '';
    const w = n > 1 ? 100 / (n - 1) : 100;
    const focusable = n <= 16;
    const hits = Array.from({ length: n }, (_, i) => {
      const lines = [xl(i)].concat(series.map((s) => (s.points[i] ? `${s.name || 'Giá trị'}: ${yFormat(s.points[i].y)}${s.points[i].note ? ' · ' + s.points[i].note : ''}` : '')));
      const dots = series.map((s, k) => (s.points[i] ? `<span class="viz-dot is-${roleOf(s, k)}" style="bottom:${100 - Y(s.points[i].y)}%"></span>` : '')).join('');
      return `<div class="viz-hit" style="left:${Math.max(0, X(i) - w / 2)}%;width:${(i === 0 || i === n - 1) && n > 1 ? w / 2 : w}%;--cx:${i === 0 && n > 1 ? '0%' : i === n - 1 && n > 1 ? '100%' : '50%'}" data-tip="${tip(lines)}"${focusable ? ' tabindex="0"' : ''}>${dots}</div>`;
    }).join('');
    const idx = pickLabels(n, o.maxXLabels || 6);
    const xLabels = idx.map((i) => `<span style="left:${X(i)}%" class="${i === 0 ? 'is-first' : i === n - 1 ? 'is-last' : ''}">${esc(xl(i))}</span>`).join('');
    const legend = series.length > 1 ? `<ul class="viz-legend">${series.map((s, k) => `<li><span class="viz-key is-line is-${roleOf(s, k)}" aria-hidden="true"></span>${esc(s.name)}</li>`).join('')}${o.threshold ? `<li><span class="viz-key is-line is-ref" aria-hidden="true"></span>${esc(o.threshold.label || 'Ngưỡng')}</li>` : ''}</ul>` : o.threshold ? `<ul class="viz-legend"><li><span class="viz-key is-line is-current" aria-hidden="true"></span>${esc(series[0].name || 'Giá trị')}</li><li><span class="viz-key is-line is-ref" aria-hidden="true"></span>${esc(o.threshold.label || 'Ngưỡng')}</li></ul>` : '';
    const sr = `<div class="sr-only">${table(['Mốc'].concat(series.map((s) => s.name || 'Giá trị')), Array.from({ length: n }, (_, i) => [xl(i)].concat(series.map((s) => (s.points[i] ? yFormat(s.points[i].y) : '—')))))}</div>`;
    return out(frame({ height: o.height || 200, ticks, top, yFormat, plot: svg + thr + endDot + hits, xLabels, legend, ariaLabel: o.ariaLabel || series.map((s) => s.name).join(', ') }) + sr);
  };

  // ───────────────────────── vertical bars ─────────────────────────
  charts.bars = function (o) {
    const items = o.items || [];
    if (!items.length || items.every((i) => !i.value)) return out(empty(o.emptyText));
    const f = fmtOf(o.format);
    const { top, ticks } = scale(Math.max(...items.map((i) => i.value), o.goal || 0));
    const n = items.length;
    const maxIdx = items.reduce((m, it, i) => (it.value > items[m].value ? i : m), 0);
    const labelAll = n <= 8;
    const cols = items.map((it, i) => {
      const h = (it.value / top) * 100;
      const show = labelAll || i === maxIdx || i === n - 1;
      const lines = [it.label, f(it.value)].concat(it.tip ? [it.tip] : []).concat(o.goal ? [`${o.goalLabel || 'Mục tiêu'}: ${f(o.goal)}`] : []);
      return `<div class="viz-col" data-tip="${tip(lines)}"${n <= 16 ? ' tabindex="0"' : ''}><div class="viz-bar${it.tone ? ' tone-' + it.tone : ''}" style="height:${h.toFixed(2)}%">${show && it.value ? `<span class="viz-cap">${esc(o.capFormat ? o.capFormat(it.value) : f(it.value))}</span>` : ''}</div></div>`;
    }).join('');
    const goal = o.goal ? `<div class="viz-ref" style="bottom:${((o.goal / top) * 100).toFixed(2)}%"><span>${esc(o.goalLabel || 'Mục tiêu')}: ${esc(f(o.goal))}</span></div>` : '';
    const idx = new Set(pickLabels(n, o.maxXLabels || 8));
    const xLabels = `<div class="viz-xcols">${items.map((it, i) => `<span>${idx.has(i) ? esc(it.label) : ''}</span>`).join('')}</div>`;
    const sr = `<div class="sr-only">${table(['Mốc', o.valueLabel || 'Giá trị'], items.map((it) => [it.label, f(it.value)]))}</div>`;
    return out(frame({ height: o.height || 180, ticks, top, yFormat: o.axisFormat || compact, plot: `<div class="viz-cols">${cols}</div>${goal}`, xLabels, ariaLabel: o.ariaLabel || 'Biểu đồ cột' }) + sr);
  };

  // ───────────────────────── horizontal bars (rankings, mastery) ─────────────────────────
  charts.hbars = function (o) {
    let items = (o.items || []).slice();
    if (!items.length) return out(empty(o.emptyText || 'Chưa có kỹ năng nào được ghi nhận.'));
    if (o.sort !== false) items.sort((a, b) => b.value / (b.max || 1) - a.value / (a.max || 1));
    const f = fmtOf(o.format);
    const max = o.max || Math.max(...items.map((i) => i.max || i.value), 1);
    return out(`<ul class="viz-hbars" role="list">${items.map((it) => {
      const m = it.max || max;
      const w = Math.max(0, Math.min(100, (it.value / m) * 100));
      const mk = it.marker != null ? `<span class="viz-marker" style="left:${((it.marker / m) * 100).toFixed(2)}%" aria-hidden="true"></span>` : '';
      const valueText = it.text || `${f(it.value)}${it.max ? '/' + f(it.max) : ''}`;
      const lines = [it.label, valueText].concat(it.marker != null ? [`${it.markerLabel || 'Mốc so sánh'}: ${it.markerText || f(it.marker)}`] : []).concat(it.tip ? [it.tip] : []);
      return `<li class="viz-hrow" data-tip="${tip(lines)}" tabindex="0">
        <span class="viz-hlabel">${esc(it.label)}</span>
        <span class="viz-htrack"><span class="viz-hbar${it.tone ? ' tone-' + it.tone : ''}" style="width:${w.toFixed(2)}%"></span>${mk}</span>
        <span class="viz-hvalue">${esc(valueText)}</span>
      </li>`;
    }).join('')}</ul>`);
  };

  // Inline bar for table cells (rankings: B3, A5).
  charts.inlineBar = function (value, max, text) {
    const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    return out(`<span class="viz-inline"><span class="viz-inline-track"><span style="width:${w.toFixed(1)}%"></span></span><span class="viz-inline-text">${esc(text != null ? text : num(value))}</span></span>`);
  };

  // ───────────────────────── segmented bar (part-to-whole with counts) ─────────────────────────
  // Colour follows the entity: callers pass a status tone ('good'…), an explicit 'slot-N', or nothing
  // (then the fixed slot order by position is used).
  const toneOf = (seg, i) => (seg.tone ? (/^slot-/.test(seg.tone) ? seg.tone : 'tone-' + seg.tone) : 'slot-' + ((i % 5) + 1));
  charts.stacked = function (o) {
    const segs = (o.segments || []).filter((s) => s.value > 0 || o.keepZero);
    const total = segs.reduce((s, x) => s + x.value, 0);
    if (!total) return out(empty(o.emptyText || 'Không có dữ liệu trong kỳ này.'));
    const f = fmtOf(o.format); const af = fmtOf(o.amountFormat);
    const bar = `<div class="viz-seg" role="group" aria-label="${esc(segs.map((s) => `${s.label}: ${f(s.value)}`).join(', '))}">${segs.map((s, i) => {
      const share = (s.value / total) * 100;
      return `<span class="viz-seg-part ${toneOf(s, i)}" style="flex:${s.value} 1 0" data-tip="${tip([s.label, `${f(s.value)} (${pct(share)})`, s.amount != null ? af(s.amount) : ''])}" tabindex="0"></span>`;
    }).join('')}</div>`;
    const legend = `<ul class="viz-seg-legend">${segs.map((s, i) => `<li><span class="viz-key ${toneOf(s, i)}" aria-hidden="true"></span><span class="viz-seg-name">${esc(s.label)}</span><strong>${esc(f(s.value))}</strong><span class="muted">${esc(pct((s.value / total) * 100))}${s.amount != null ? ' · ' + esc(af(s.amount)) : ''}</span></li>`).join('')}</ul>`;
    return out(`<div class="viz-segwrap">${bar}${legend}</div>`);
  };

  // ───────────────────────── stacked columns (weekly status mix) ─────────────────────────
  charts.stackedCols = function (o) {
    const cols = o.cols || []; const keys = o.keys || [];
    const totals = cols.map((c) => c.values.reduce((a, b) => a + b, 0));
    if (!cols.length || !totals.some(Boolean)) return out(empty(o.emptyText));
    const f = fmtOf(o.format);
    const { top, ticks } = scale(Math.max(...totals));
    const body = cols.map((c, ci) => {
      const lines = [c.label].concat(keys.map((k, i) => `${k.label}: ${f(c.values[i] || 0)}`)).concat([`Tổng: ${f(totals[ci])}`]);
      return `<div class="viz-col" data-tip="${tip(lines)}" tabindex="0"><div class="viz-stack" style="height:${((totals[ci] / top) * 100).toFixed(2)}%">${c.values.map((v, i) => (v ? `<span class="${toneOf(keys[i] || {}, i)}" style="flex:${v} 1 0"></span>` : '')).join('')}</div></div>`;
    }).join('');
    const idx = new Set(pickLabels(cols.length, o.maxXLabels || 8));
    const xLabels = `<div class="viz-xcols">${cols.map((c, i) => `<span>${idx.has(i) ? esc(c.label) : ''}</span>`).join('')}</div>`;
    const legend = `<ul class="viz-legend">${keys.map((k, i) => `<li><span class="viz-key ${toneOf(k, i)}" aria-hidden="true"></span>${esc(k.label)}</li>`).join('')}</ul>`;
    const sr = `<div class="sr-only">${table(['Mốc'].concat(keys.map((k) => k.label)), cols.map((c) => [c.label].concat(c.values.map(f))))}</div>`;
    return out(frame({ height: o.height || 180, ticks, top, yFormat: compact, plot: `<div class="viz-cols is-stacked">${body}</div>`, xLabels, legend, ariaLabel: o.ariaLabel || 'Biểu đồ cột chồng' }) + sr);
  };

  // ───────────────────────── activity calendar ─────────────────────────
  const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const WDL = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  charts.calendar = function (o) {
    const days = (o.days || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!days.length) return out(empty(o.emptyText));
    const unit = o.unit || 'phút';
    const max = Math.max(...days.map((d) => d.value || 0), 1);
    const level = (v) => (!v ? 0 : Math.min(4, 1 + Math.floor((v / max) * 3.999)));
    const D = (s) => new Date(s + 'T00:00:00Z');
    const first = D(days[0].date); const lead = (first.getUTCDay() + 6) % 7; // Monday-first grid
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<span class="viz-cal-cell is-out" aria-hidden="true"></span>');
    days.forEach((d) => {
      const dt = D(d.date); const lv = level(d.value);
      const label = `${WDL[dt.getUTCDay()]}, ${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
      cells.push(`<span class="viz-cal-cell lv-${lv}${d.date === o.today ? ' is-today' : ''}" data-tip="${tip([label, d.value ? `${num(d.value)} ${unit}` : 'Không học'])}" tabindex="-1"><span class="sr-only">${esc(label)}: ${d.value ? num(d.value) + ' ' + unit : 'không học'}</span></span>`);
    });
    const head = [1, 2, 3, 4, 5, 6, 0].map((i) => `<span>${WD[i]}</span>`).join('');
    const legend = `<div class="viz-cal-legend" aria-hidden="true"><span>Ít</span>${[0, 1, 2, 3, 4].map((l) => `<span class="viz-cal-cell lv-${l}"></span>`).join('')}<span>Nhiều</span></div>`;
    return out(`<div class="viz-cal" role="group" aria-label="${esc(o.ariaLabel || 'Lịch hoạt động')}"><div class="viz-cal-grid"><div class="viz-cal-head" aria-hidden="true">${head}</div><div class="viz-cal-body">${cells.join('')}</div></div>${legend}</div>`);
  };

  // ───────────────────────── funnel (step bars + rate table) ─────────────────────────
  charts.funnel = function (o) {
    const steps = o.steps || [];
    if (!steps.length || !steps[0].value) return out(empty(o.emptyText));
    const f = fmtOf(o.format); const first = steps[0].value;
    const rows = steps.map((s, i) => {
      const w = (s.value / first) * 100; const prevW = i ? (steps[i - 1].value / first) * 100 : w;
      const stepRate = i ? (s.value / (steps[i - 1].value || 1)) * 100 : 100;
      return `<li class="viz-funnel-row" data-tip="${tip([s.label, f(s.value), `${pct(w)} so với bước 1`, i ? `${pct(stepRate)} từ bước trước` : ''])}" tabindex="0">
        <span class="viz-hlabel">${i + 1}. ${esc(s.label)}</span>
        <span class="viz-htrack is-funnel"><span class="viz-drop" style="left:${w.toFixed(2)}%;width:${Math.max(0, prevW - w).toFixed(2)}%"></span><span class="viz-hbar" style="width:${w.toFixed(2)}%"></span></span>
        <span class="viz-hvalue">${esc(f(s.value))}</span></li>`;
    }).join('');
    const tbl = table(['Bước', 'Số lượng', '% so với bước 1', '% chuyển bước', 'Rơi rụng'], steps.map((s, i) => [`${i + 1}. ${s.label}`, f(s.value), pct((s.value / first) * 100, 1), i ? pct((s.value / (steps[i - 1].value || 1)) * 100, 1) : '—', i ? f(steps[i - 1].value - s.value) : '—']), { caption: 'Tỉ lệ từng bước' });
    return out(`<div class="viz-funnel"><ul class="viz-hbars" role="list">${rows}</ul><div class="viz-legend-inline"><span class="viz-key is-drop" aria-hidden="true"></span> Phần rơi rụng so với bước trước</div><div class="table-wrap">${tbl}</div></div>`);
  };

  // ───────────────────────── cohort heatmap ─────────────────────────
  charts.heatmap = function (o) {
    const rows = o.rows || []; const cols = o.cols || [];
    if (!rows.length) return out(empty(o.emptyText));
    const minN = o.minN || 20;
    const lvl = (v) => (v == null ? 'na' : 'h' + Math.min(5, Math.floor(v / 20)));
    return out(`<div class="table-wrap viz-heat-wrap"><table class="table viz-heat"><caption class="sr-only">${esc(o.caption || 'Bảng nhiệt')}</caption>
      <thead><tr><th scope="col">${esc(o.rowHeader || 'Nhóm')}</th><th scope="col" class="num">n</th>${cols.map((c) => `<th scope="col" class="num">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.pinned ? 'is-pinned' : ''}"><th scope="row">${esc(r.label)}${r.n < minN ? ` <span class="viz-small" title="Mẫu nhỏ">n &lt; ${minN}</span>` : ''}</th><td class="num">${num(r.n)}</td>${r.cells.map((v, i) => `<td class="viz-heat-cell ${lvl(v)}"${v != null ? ` data-tip="${tip([r.label, `${cols[i]}: ${pct(v)}`, `n = ${num(r.n)}`])}"` : ''}>${v == null ? '<span class="sr-only">chưa có</span>' : esc(pct(v))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`);
  };

  // ───────────────────────── single-quiz donut (the only donut in the product) ─────────────────────────
  charts.donut = function (o) {
    let correct = o.correct; let wrong = o.wrong; let unknown = o.unknown || 0;
    if (correct == null) { correct = o.value || 0; wrong = Math.max(0, (o.total || 0) - correct); }
    const total = correct + wrong + unknown;
    if (!total) return out(empty('Chưa có câu trả lời.'));
    const r = 42; const C2 = 2 * Math.PI * r; const gap = total > 1 ? 1.2 : 0;
    let offset = 0;
    const parts = [['Đúng', correct, 'slot-1'], ['Sai', wrong, 'slot-2'], ['Chưa biết', unknown, 'tone-neutral']].filter((p) => p[1] > 0);
    const arcs = parts.map(([, v, cls]) => {
      const len = (v / total) * C2;
      const a = `<circle class="viz-arc ${cls}" cx="50" cy="50" r="${r}" stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${(C2 - Math.max(0, len - gap)).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`;
      offset += len; return a;
    }).join('');
    return out(`<div class="viz-donut"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(o.label || 'Kết quả quiz')}: ${correct} đúng, ${wrong} sai, ${unknown} chưa biết"><g transform="rotate(-90 50 50)">${arcs}</g><text x="50" y="49" text-anchor="middle" class="viz-donut-value">${esc(pct((correct / total) * 100))}</text><text x="50" y="62" text-anchor="middle" class="viz-donut-sub">đúng</text></svg>
      <ul class="viz-seg-legend">${parts.map(([l, v, cls]) => `<li><span class="viz-key ${cls}" aria-hidden="true"></span><span class="viz-seg-name">${l}</span><strong>${num(v)}</strong><span class="muted">${pct((v / total) * 100)}</span></li>`).join('')}</ul></div>`);
  };

  // ───────────────────────── layered concept graph ─────────────────────────
  // Top→bottom layers by longest prerequisite path; nodes left in a cycle are placed on extra layers so
  // nothing overlaps. Nodes carry mastery as fill + text (never colour-only), locks as text.
  // Same 5-stop text scale as Codi.ui.mastery (PRODUCT.md: "Chưa học / Đang học / Thành thạo").
  const MASTERY = ['Chưa học', 'Đang học · mới bắt đầu', 'Đang học · khá', 'Thành thạo', 'Thành thạo · vững'];
  const MASTERY_SHORT = ['Chưa học', 'Đang học', 'Đang học', 'Thành thạo', 'Thành thạo']; // fits a node; the meter shows the step
  charts.masteryLabel = (lv) => MASTERY[Math.max(0, Math.min(4, lv | 0))];
  charts.graph = function (o) {
    const nodes = o.nodes || []; const edges = (o.edges || []).filter((e) => nodes.some((n) => n.id === e.from) && nodes.some((n) => n.id === e.to));
    if (!nodes.length) return out(empty('Chưa có khái niệm.'));
    const inDeg = {}; const outs = {};
    nodes.forEach((n) => { inDeg[n.id] = 0; outs[n.id] = []; });
    edges.forEach((e) => { inDeg[e.to] += 1; outs[e.from].push(e.to); });
    const layer = {}; const q = nodes.filter((n) => !inDeg[n.id]).map((n) => n.id);
    q.forEach((id) => { layer[id] = 0; });
    const deg = Object.assign({}, inDeg);
    while (q.length) {
      const id = q.shift();
      outs[id].forEach((t) => { layer[t] = Math.max(layer[t] || 0, layer[id] + 1); deg[t] -= 1; if (deg[t] === 0) q.push(t); });
    }
    let maxL = Math.max(0, ...Object.values(layer));
    nodes.filter((n) => layer[n.id] == null).forEach((n) => { maxL += 1; layer[n.id] = maxL; }); // cycle members
    const NW = 152; const NH = 60; const GX = 24; const GY = 56; const PAD = 16;
    const byLayer = [];
    nodes.forEach((n) => { (byLayer[layer[n.id]] = byLayer[layer[n.id]] || []).push(n); });
    const widest = Math.max(...byLayer.map((l) => (l ? l.length : 0)));
    const W = Math.max(widest * (NW + GX) - GX + PAD * 2, 320);
    const rowsUsed = byLayer.filter(Boolean);
    const H = rowsUsed.length * (NH + GY) - GY + PAD * 2;
    const pos = {};
    rowsUsed.forEach((row, ri) => {
      const rowW = row.length * (NW + GX) - GX; const x0 = (W - rowW) / 2;
      row.forEach((n, i) => { pos[n.id] = { x: x0 + i * (NW + GX), y: PAD + ri * (NH + GY) }; });
    });
    const cyc = o.cycle || []; const hp = o.highlightPath || [];
    const inCycleEdge = (e) => { const a = cyc.indexOf(e.from); const b = cyc.indexOf(e.to); return a >= 0 && b >= 0 && (b === a + 1 || (a === cyc.length - 1 && b === 0) || (cyc[0] === cyc[cyc.length - 1] && b === a + 1)); };
    const gid = uid('g');
    const paths = edges.map((e) => {
      const a = pos[e.from]; const b = pos[e.to];
      const x1 = a.x + NW / 2; const y1 = a.y + NH; const x2 = b.x + NW / 2; const y2 = b.y;
      const back = y2 <= y1; // edge pointing up (closes a cycle)
      const d = back ? `M${x1} ${a.y} C ${x1 + 70} ${a.y - 40}, ${x2 + 70} ${y2 + NH + 40}, ${x2 + NW / 2 - 6} ${y2 + NH / 2}` : `M${x1} ${y1} C ${x1} ${y1 + GY / 2}, ${x2} ${y2 - GY / 2}, ${x2} ${y2 - 2}`;
      const cls = inCycleEdge(e) ? 'is-cycle' : hp.includes(e.from) && hp.includes(e.to) ? 'is-path' : '';
      return `<path class="viz-edge ${cls}" d="${d}" marker-end="url(#${gid}-${cls ? cls.slice(3) : 'base'})"/>`;
    }).join('');
    const marker = (k) => `<marker id="${gid}-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="viz-arrow is-${k}" d="M0 0 L10 5 L0 10 z"/></marker>`;
    const lockIcon = C.icon ? String(C.icon('lock', { cls: 'icon-sm' })) : '';
    const nodeHtml = nodes.map((n) => {
      const p = pos[n.id]; const lv = n.mastery != null ? Math.max(0, Math.min(4, n.mastery | 0)) : null;
      const state = [cyc.includes(n.id) ? 'is-cycle' : '', hp.includes(n.id) ? 'is-path' : '', o.selected === n.id ? 'is-selected' : '', n.locked ? 'is-locked' : '', lv != null ? 'm' + lv : 'mx'].join(' ');
      const sub = n.locked ? `${lockIcon}<span>Chưa mở khoá</span>` : lv != null ? `<span class="viz-node-meter" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('')}</span><span>${MASTERY_SHORT[lv]}</span>` : n.sub ? `<span>${esc(n.sub)}</span>` : '';
      const tipText = tip([n.label, n.locked ? 'Chưa mở khoá — cần học khái niệm tiên quyết trước' : lv != null ? `Mức thành thạo: ${MASTERY[lv]} (${lv}/4)` : '', cyc.includes(n.id) ? 'Nằm trong vòng lặp tiên quyết' : '']);
      const tag = o.onSelectAction ? 'button' : 'div';
      const attrs = o.onSelectAction ? `type="button" data-action="${esc(o.onSelectAction)}" data-id="${esc(n.id)}" aria-pressed="${o.selected === n.id}"` : 'tabindex="0"';
      return `<${tag} class="viz-node ${state}" style="left:${p.x}px;top:${p.y}px;width:${NW}px;height:${NH}px" data-tip="${tipText}" ${attrs}><span class="viz-node-label">${esc(n.label)}</span><span class="viz-node-sub">${sub}</span></${tag}>`;
    }).join('');
    const legend = nodes.some((n) => n.mastery != null) ? `<ul class="viz-legend">${[0, 1, 2, 3, 4].map((l) => `<li><span class="viz-key viz-node-swatch m${l}" aria-hidden="true"></span>${MASTERY[l]}</li>`).join('')}</ul>` : '';
    return out(`<div class="viz-graph-wrap">${legend}<div class="viz-graph" role="group" aria-label="${esc(o.ariaLabel || 'Bản đồ khái niệm')}"><div class="viz-graph-canvas" style="width:${W}px;height:${H}px">
      <svg width="${W}" height="${H}" aria-hidden="true"><defs>${marker('base')}${marker('cycle')}${marker('path')}</defs>${paths}</svg>${nodeHtml}</div></div></div>`);
  };

  // ───────────────────────── card shell ─────────────────────────
  charts.card = function (o) {
    const tid = uid('vc');
    const small = o.sample != null && o.sample < (o.minSample || 20);
    const state = o.state || 'ok';
    const body = state === 'loading' ? '<div class="viz-skeleton" aria-hidden="true"></div><span class="sr-only">Đang tải…</span>' : state === 'empty' ? empty(o.emptyText) : String(o.body || '');
    const tbl = o.table && state === 'ok' && o.table.rows.length ? `<details class="viz-table"><summary>Bảng số liệu</summary><div class="table-wrap">${table(o.table.headers, o.table.rows, { caption: o.title })}</div></details>` : '';
    return out(`<section class="viz-card${o.wide ? ' is-wide' : ''}${o.cls ? ' ' + o.cls : ''}" aria-labelledby="${tid}"${state === 'loading' ? ' aria-busy="true"' : ''}${o.id ? ` data-card="${esc(o.id)}"` : ''}>
      <header class="viz-card-head"><div class="viz-card-titles">${o.code ? `<span class="viz-code">${esc(o.code)}</span>` : ''}<h3 id="${tid}">${esc(o.title)}</h3>${o.question ? `<p>${esc(o.question)}</p>` : ''}</div>
        <div class="viz-card-actions">${String(o.actions || '')}${o.detailHref ? `<a class="btn btn-ghost btn-sm" href="#${esc(o.detailHref)}">Xem chi tiết<span class="sr-only"> ${esc(o.title)}</span></a>` : ''}</div></header>
      ${small && state === 'ok' ? `<p class="viz-warn"><span aria-hidden="true">▲</span> Mẫu nhỏ (n = ${num(o.sample)}) — đọc kết quả thận trọng.</p>` : ''}
      <div class="viz-card-body">${body}</div>
      ${o.note ? `<p class="viz-note">${esc(o.note)}</p>` : ''}
      ${tbl}
    </section>`);
  };

  // ───────────────────────── CSV download ─────────────────────────
  charts.csv = function (filename, headers, rows) {
    const q = (v) => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const text = '﻿' + [headers].concat(rows).map((r) => r.map(q).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  charts.table = (h, r, o) => out(table(h, r, o));
  charts.fmt = { num, compact, pct };
})();
