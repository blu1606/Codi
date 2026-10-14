/**
 * admin-review.js — S32 "Duyệt xuất bản" (admin): detailed course review.
 * Route: /admin/publication?tab=pending|changes|approved&id=<courseId>
 *
 * Layout (refs: Reddit mod queue, Circle moderation): queue on the left; on the right the course with four
 * views — Tiêu chí (mark each criterion Đạt / Cần sửa / Không áp dụng + note), Nội dung (preview every lesson:
 * reading, every quiz question with the correct answer marked, code tests + solution check, assignment rules
 * + rubric; flag any lesson / question / test / assignment), Cờ (all flags, AI pre-check suggestions,
 * close / reopen), Lịch sử (review rounds). Decisions: Duyệt và xuất bản (blocked while criteria are
 * unmarked / "Cần sửa" or a "Bắt buộc sửa" flag is open), Yêu cầu sửa, Từ chối — all with consequence dialogs.
 * Data model and rules: js/course-review.js (Codi.review).
 */
(function () {
  'use strict';
  const { html, icon, fmt, ui } = Codi;
  const R = () => Codi.review;
  const db = () => Codi.db();
  const persist = (render) => Codi.set(() => {}, { render: render !== false });
  const TYPE = { video: 'Video', pdf: 'Slide/PDF', reading: 'Bài đọc', tutorial: 'Hướng dẫn code', code: 'Bài code' };

  let view = { courseId: null, tab: 'criteria', lessonId: null, ai: null }; // ai: {state:'running'|'done'|'error'|'limit', items, token}
  let priceDraft = {};
  const forCourse = (c) => { if (view.courseId !== c.id) view = { courseId: c.id, tab: 'criteria', lessonId: null, ai: null }; return view; };

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
        { section: 'Phân tích', href: '/admin/insights', label: 'Quan sát hệ thống', icon: 'activity' },
        { section: 'Phân tích', href: '/admin/finance', label: 'Tài chính', icon: 'trending-up' },
      ],
    });
  }

  const sevBadge = (s) => html`<span class="badge ${s === 'must' ? 'badge-danger' : 'badge-warn'}">${s === 'must' ? icon('alert-circle') : icon('alert-triangle')}${R().SEVERITY[s]}</span>`;
  const statusBadge = (f) => html`<span class="badge ${f.status === 'closed' ? 'badge-success' : f.status === 'fixed' ? 'badge-accent' : ''}">${R().FLAG_STATUS[f.status]}</span>`;
  const ROUND = { in_review: 'Đang duyệt', changes_requested: 'Yêu cầu sửa', rejected: 'Từ chối', approved: 'Đã duyệt' };
  const flagBtn = (c, t) => html`<button type="button" class="btn btn-ghost btn-sm" data-action="rv-flag" data-course="${c.id}" data-type="${t.type}" data-lesson="${t.lessonId || ''}" data-item="${t.itemId || ''}" data-label="${t.label}">${icon('flag', { cls: 'icon-sm' })} Gắn cờ</button>`;
  const countFor = (r, pred) => (r ? r.flags.filter((f) => f.status !== 'closed' && pred(f)).length : 0);

  // ───────────────────────── views ─────────────────────────
  function criteriaView(c, r, ro) {
    const auto = R().autoCriteria(c);
    const marked = R().CRITERIA.filter((k) => r.criteria[k.id] && r.criteria[k.id].status).length;
    return html`<div class="stack-3">
      <div class="row-between"><span class="small muted">${marked}/${R().CRITERIA.length} tiêu chí đã chấm</span>
        ${ro ? '' : html`<button type="button" class="btn btn-secondary btn-sm" data-action="rv-crit-auto" data-course="${c.id}">${icon('sparkles', { cls: 'icon-sm' })} Điền theo gợi ý tự động</button>`}</div>
      <ul class="rv-crit">${R().CRITERIA.map((k) => {
        const cur = r.criteria[k.id] || {}; const a = auto[k.id];
        return html`<li class="rv-crit-row">
          <div class="rv-crit-main"><strong class="small">${k.label}</strong><span class="xsmall muted">${k.help}</span>
            <span class="xsmall rv-auto">${icon('sparkles', { cls: 'icon-sm' })} Gợi ý: ${a.status ? { pass: 'Đạt', fix: 'Cần sửa', na: 'Không áp dụng' }[a.status] : 'người duyệt tự xác nhận'} — ${a.why}</span></div>
          <div class="rv-crit-ctrl">
            <div class="viz-seg-ctrl" role="group" aria-label="Kết quả: ${k.label}">${[['pass', 'Đạt'], ['fix', 'Cần sửa'], ['na', 'Không áp dụng']].map(([v, l]) => html`<button type="button" aria-pressed="${String(cur.status === v)}" data-action="rv-crit" data-course="${c.id}" data-id="${k.id}" data-v="${v}" ${ro ? Codi.raw('disabled') : ''}>${l}</button>`)}</div>
            <label class="sr-only" for="rv-note-${k.id}">Ghi chú cho ${k.label}</label>
            <input id="rv-note-${k.id}" class="input" placeholder="${cur.status === 'fix' ? 'Ghi rõ cần sửa gì (bắt buộc)' : 'Ghi chú (không bắt buộc)'}" value="${cur.note || ''}" data-input="rv-crit-note" data-course="${c.id}" data-id="${k.id}" ${ro ? Codi.raw('disabled') : ''}>
          </div></li>`;
      })}</ul></div>`;
  }

  function lessonPreview(c, l, r, ro) {
    if (!l) return '';
    if (l === 'entry') {
      const et = c.entryTest || { questions: [] };
      return html`<div class="stack-3"><div class="row-between"><h3 class="tc-h">Bài kiểm tra đầu vào</h3>${ro ? '' : flagBtn(c, { type: 'course', label: 'Bài kiểm tra đầu vào' })}</div>
        <p class="small ${et.questions.length < R().ENTRY_MIN ? 'text-danger' : 'muted'}">${et.questions.length} câu · cần ít nhất ${R().ENTRY_MIN} câu.</p>
        ${questionList(c, null, et.questions, r, ro)}</div>`;
    }
    const mat = l.material && l.material.fileName ? l.material.fileName : l.fileName;
    const a = l.assignment;
    return html`<div class="stack-4">
      <div class="row-between"><div class="stack-1"><h3 class="tc-h">${l.title}</h3><span class="xsmall muted">${TYPE[l.type] || l.type} · ${fmt.duration(l.durationMin)}</span></div>${ro ? '' : flagBtn(c, { type: 'lesson', lessonId: l.id, label: 'Bài: ' + l.title })}</div>
      ${['video', 'pdf'].includes(l.type) ? (mat ? html`<p class="small">${icon('file-text', { cls: 'icon-sm' })} <span class="mono">${mat}</span>${l.material && l.material.pages ? html` · ${l.material.pages} trang` : ''}</p>` : ui.alert({ type: 'danger', title: 'Chưa có tệp', body: `Bài ${TYPE[l.type].toLowerCase()} này chưa có tệp — học viên sẽ thấy bài trống.` })) : ''}
      ${l.reading ? html`<details class="panel"><summary class="small strong">Bài đọc / tóm tắt</summary><p class="small" style="margin-top:8px">${String(l.reading).replace(/[#*`>]/g, '').slice(0, 600)}${l.reading.length > 600 ? '…' : ''}</p></details>` : ''}
      ${l.quiz ? html`<div class="stack-2"><strong class="small">Quiz · ${l.quiz.questions.length} câu · điểm đạt ${l.quiz.passingScore}%</strong>${questionList(c, l, l.quiz.questions, r, ro)}</div>` : ''}
      ${l.code ? codePreview(c, l, r, ro) : ''}
      ${a ? html`<div class="stack-2"><div class="row-between"><strong class="small">Bài tập</strong>${ro ? '' : flagBtn(c, { type: 'assignment', lessonId: l.id, label: 'Bài tập: ' + l.title })}</div>
        <p class="small">${a.instructions}</p>
        <p class="xsmall muted">Nộp: ${[a.requiresLink ? 'đường dẫn' : '', a.requiresFile ? `tệp (${a.acceptedTypes || 'mọi loại'})` : ''].filter(Boolean).join(' + ') || 'chưa quy định'} · Điểm ${a.passScore}/${a.maxScore} để đạt · hạn ${a.dueDays} ngày · nộp muộn: ${{ accept: 'vẫn nhận', penalty: `trừ ${a.latePenalty}%`, reject: 'không nhận' }[a.latePolicy] || '—'}</p>
        ${(a.rubric || []).length ? html`<div class="table-wrap"><table class="table"><caption class="sr-only">Thang chấm</caption><thead><tr><th>Tiêu chí</th><th class="num">Điểm</th></tr></thead><tbody>${a.rubric.map((k) => html`<tr><th scope="row"><span class="small strong">${k.name}</span><br><span class="xsmall muted">${k.desc}</span></th><td class="num">${k.points}</td></tr>`)}</tbody></table></div>`
          : ui.alert({ type: 'warn', title: 'Chưa có thang chấm', body: 'Học viên không biết bài được chấm theo tiêu chí nào.' })}</div>` : ''}
      ${!l.quiz && !l.code && !a && !l.reading && materialOkText(l)}
    </div>`;
  }
  const materialOkText = (l) => (R().materialOk(l) ? html`<p class="small muted">Bài chỉ có ${TYPE[l.type] ? TYPE[l.type].toLowerCase() : 'nội dung'}, không có quiz hay bài tập.</p>` : '');
  function questionList(c, l, qs, r, ro) {
    if (!qs.length) return html`<p class="small muted">Chưa có câu hỏi.</p>`;
    return html`<ol class="rv-questions">${qs.map((q, i) => {
      const n = countFor(r, (f) => f.target.itemId === q.id);
      return html`<li class="rv-q"><div class="row-between"><strong class="small">Câu ${i + 1}. ${q.text}</strong><span class="row" style="gap:4px">${n ? html`<span class="badge badge-warn">${n} cờ</span>` : ''}${q.aiGenerated ? html`<span class="badge badge-accent">AI tạo</span>` : ''}${ro ? '' : flagBtn(c, { type: 'question', lessonId: l ? l.id : null, itemId: q.id, label: `Câu ${i + 1}: ${q.text}` })}</span></div>
        <ul class="rv-opts">${q.options.map((o, k) => html`<li class="${k === q.correctIndex ? 'is-correct' : ''}">${k === q.correctIndex ? html`${icon('check-circle', { cls: 'icon-sm' })}<span class="sr-only">Đáp án đúng: </span>` : html`<span class="rv-opt-dot" aria-hidden="true"></span>`}<span>${o}</span>${k === q.correctIndex ? html`<span class="xsmall">Đáp án đúng</span>` : ''}</li>`)}</ul>
        ${q.explanation ? html`<p class="xsmall muted">Giải thích: ${q.explanation}</p>` : html`<p class="xsmall text-warn">Chưa có giải thích.</p>`}</li>`;
    })}</ol>`;
  }
  function codePreview(c, l, r, ro) {
    const cd = l.code; const chk = cd.solutionCheck;
    if (cd.kind === 'tutorial') return html`<div class="stack-2"><strong class="small">Hướng dẫn code · ${cd.steps.length} bước</strong><ol class="small">${cd.steps.map((s) => html`<li>${s.title}${s.tests && s.tests.length ? html` <span class="xsmall muted">(${s.tests.length} test)</span>` : ''}</li>`)}</ol></div>`;
    return html`<div class="stack-2">
      <div class="row-between"><strong class="small">Bài code · ${cd.tests.length} test (${cd.tests.filter((t) => t.hidden).length} ẩn)</strong>
        ${chk && chk.ok ? html`<span class="badge badge-success">${icon('check')}Lời giải đạt ${chk.passed}/${chk.total}</span>` : html`<span class="badge badge-danger">${icon('alert-circle')}Lời giải chưa chạy đạt</span>`}</div>
      <ol class="small">${cd.instructions.map((s) => html`<li>${String(s).replace(/[`*]/g, '')}</li>`)}</ol>
      <div class="table-wrap"><table class="table"><caption class="sr-only">Test của bài code</caption><thead><tr><th>Test</th><th>Biểu thức</th><th>Mong đợi</th><th></th></tr></thead><tbody>
        ${cd.tests.map((t) => html`<tr><th scope="row"><span class="small">${t.name}</span>${t.hidden ? html` <span class="badge">Ẩn</span>` : ''}</th><td class="mono xsmall">${t.call}</td><td class="mono xsmall">${JSON.stringify(t.expected)}</td><td>${ro ? '' : flagBtn(c, { type: 'test', lessonId: l.id, itemId: t.id, label: `Test “${t.name}” · ${l.title}` })}</td></tr>`)}
      </tbody></table></div></div>`;
  }
  function contentView(c, r, ro) {
    const ls = Codi.lessons(c);
    const sel = view.lessonId === 'entry' ? 'entry' : ls.find((l) => l.id === view.lessonId) || ls[0];
    const item = (id, title, sub, n, cur) => html`<li><button type="button" class="rv-tree-item" aria-current="${String(cur)}" data-action="rv-lesson" data-id="${id}"><span class="od-fill stack-1"><span class="small">${title}</span><span class="xsmall muted">${sub}</span></span>${n ? html`<span class="badge badge-warn">${n}</span>` : ''}</button></li>`;
    return html`<div class="rv-content">
      <nav class="rv-tree" aria-label="Nội dung khoá học"><ul>
        ${item('entry', 'Bài kiểm tra đầu vào', `${(c.entryTest || { questions: [] }).questions.length} câu`, countFor(r, (f) => f.target.label === 'Bài kiểm tra đầu vào'), sel === 'entry')}
        ${c.chapters.map((ch) => html`<li class="rv-tree-ch"><span class="xsmall muted">${ch.title}</span><ul>${ch.lessons.map((l) => item(l.id, l.title, [TYPE[l.type] || l.type, l.quiz ? `quiz ${l.quiz.questions.length} câu` : '', l.code ? `${l.code.tests ? l.code.tests.length : 0} test` : '', l.assignment ? 'bài tập' : '', !R().materialOk(l) ? 'thiếu tệp' : ''].filter(Boolean).join(' · '), countFor(r, (f) => f.target.lessonId === l.id), sel === l))}</ul></li>`)}
      </ul></nav>
      <div class="rv-preview">${lessonPreview(c, sel, r, ro)}</div>
    </div>`;
  }
  function flagsView(c, r, ro) {
    const ai = view.ai;
    const live = r.flags.slice().sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || (a.severity === 'must' ? -1 : 1));
    return html`<div class="stack-4">
      ${ro ? '' : aiPanel(c, r, ai)}
      ${!live.length ? html`<div class="viz-empty">Chưa có cờ nào. Gắn cờ từ thẻ "Nội dung" hoặc chạy "Rà soát bằng AI".</div>` : html`<ul class="rv-flags">${live.map((f) => html`<li class="rv-flag ${f.status === 'closed' ? 'is-closed' : ''}">
        <div class="row" style="gap:6px;flex-wrap:wrap">${sevBadge(f.severity)}${statusBadge(f)}${f.source === 'ai' ? html`<span class="badge badge-accent">${icon('sparkles')}AI đề xuất</span>` : ''}${f.carried ? html`<span class="badge">Từ vòng trước</span>` : ''}</div>
        <button type="button" class="btn-link rv-flag-target" data-action="rv-goto" data-lesson="${f.target.lessonId || (f.target.label === 'Bài kiểm tra đầu vào' ? 'entry' : '')}">${f.target.label}</button>
        <p class="small">${f.comment}</p>
        ${f.reply ? html`<p class="small rv-reply">${icon('message-circle', { cls: 'icon-sm' })} Giảng viên: ${f.reply}</p>` : ''}
        ${ro ? '' : html`<div class="row" style="gap:8px">${f.status !== 'closed' ? html`<button type="button" class="btn btn-secondary btn-sm" data-action="rv-flag-state" data-course="${c.id}" data-id="${f.id}" data-v="closed">${icon('check', { cls: 'icon-sm' })} Đóng cờ</button>` : html`<button type="button" class="btn btn-ghost btn-sm" data-action="rv-flag-state" data-course="${c.id}" data-id="${f.id}" data-v="open">Mở lại</button>`}
          <button type="button" class="btn btn-ghost btn-sm" data-action="rv-flag-del" data-course="${c.id}" data-id="${f.id}">${icon('trash', { cls: 'icon-sm' })} Xoá</button></div>`}
      </li>`)}</ul>`}</div>`;
  }
  function aiPanel(c, r, ai) {
    if (!ai) return html`<div class="rv-ai"><div><strong class="small">${icon('sparkles', { cls: 'icon-sm' })} Rà soát bằng AI</strong><p class="xsmall muted">AI đọc toàn bộ nội dung và đề xuất cờ. Bạn chấp nhận hoặc bỏ từng đề xuất.</p></div>
      <button type="button" class="btn btn-secondary btn-sm" data-action="rv-ai" data-course="${c.id}">Chạy rà soát</button></div>`;
    if (ai.state === 'running') return html`<div class="rv-ai" aria-busy="true"><span class="ai-thinking-row"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span>AI đang đọc ${Codi.lessons(c).length} bài và ${Codi.lessons(c).reduce((s, l) => s + (l.quiz ? l.quiz.questions.length : 0), 0)} câu hỏi…</span></span>
      <button type="button" class="btn btn-ghost btn-sm" data-action="rv-ai-stop">${icon('x', { cls: 'icon-sm' })} Dừng</button></div>`;
    if (ai.state === 'error') return ui.alert({ type: 'danger', title: 'AI rà soát chưa chạy được', body: 'Bạn vẫn duyệt thủ công bình thường.', actions: html`<button type="button" class="btn btn-secondary btn-sm" data-action="rv-ai" data-course="${c.id}">Thử lại</button>` });
    if (ai.state === 'limit') return ui.alert({ type: 'warn', title: 'Đã dùng hết lượt rà soát AI trong giờ này', body: 'Thử lại sau ít phút.' });
    const items = ai.items.filter((x) => !x.done);
    return html`<section class="rv-ai is-done"><div class="row-between"><strong class="small">${icon('sparkles', { cls: 'icon-sm' })} AI đề xuất ${ai.items.length} cờ · còn ${items.length} chưa xử lý</strong>
        ${items.length ? html`<button type="button" class="btn btn-secondary btn-sm" data-action="rv-ai-accept" data-course="${c.id}" data-i="all">Thêm tất cả (${items.length})</button>` : ''}</div>
      ${items.length ? html`<ul class="rv-flags">${ai.items.map((x, i) => (x.done ? '' : html`<li class="rv-flag is-suggestion"><div class="row" style="gap:6px">${sevBadge(x.severity)}<span class="small strong">${x.target.label}</span></div><p class="small">${x.comment}</p>
          <div class="row" style="gap:8px"><button type="button" class="btn btn-primary btn-sm" data-action="rv-ai-accept" data-course="${c.id}" data-i="${i}">Thêm cờ</button><button type="button" class="btn btn-ghost btn-sm" data-action="rv-ai-skip" data-i="${i}">Bỏ qua</button></div></li>`))}</ul>`
        : html`<p class="xsmall muted">Đã xử lý mọi đề xuất.</p>`}
      <p class="xsmall muted">AI có thể sai — đề xuất chỉ thành cờ khi bạn chấp nhận.</p></section>`;
  }
  function historyView(c) {
    const rs = R().rounds(c).slice().reverse();
    if (!rs.length) return html`<div class="viz-empty">Chưa có vòng duyệt nào.</div>`;
    return html`<ol class="rv-history">${rs.map((x) => html`<li><div class="row-between"><strong class="small">Vòng ${x.round} · ${ROUND[x.status]}</strong><span class="xsmall muted">Gửi ${fmt.datetime(x.submittedAt)}${x.decidedAt ? ' · kết luận ' + fmt.datetime(x.decidedAt) : ''}</span></div>
      <span class="xsmall muted">${x.flags.length} cờ (${x.flags.filter((f) => f.status === 'closed').length} đã đóng)</span>${x.note ? html`<p class="small">${x.note}</p>` : ''}</li>`)}</ol>`;
  }

  function decisionCard(c, r) {
    const price = priceDraft[c.id] !== undefined ? priceDraft[c.id] : String(c.proposedPrice != null ? c.proposedPrice : c.price || '');
    const why = R().canApprove(r);
    return html`<section class="card rv-decision"><div class="card-body stack-3">
      <h3 class="tc-h">Kết luận vòng ${r.round}</h3>
      <div class="field ${priceDraft.err ? 'is-invalid' : ''}" style="max-width:320px"><label for="pub-price">Giá bán (VND) <span class="req">*</span></label>
        <input id="pub-price" inputmode="numeric" value="${price}" data-input="rv-price" data-id="${c.id}">
        <span class="field-help">Giảng viên đề xuất: ${c.proposedPrice == null ? 'chưa đề xuất' : fmt.vnd(c.proposedPrice)}. Nhập 0 cho khoá miễn phí.</span>
        ${priceDraft.err ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${priceDraft.err}</span></p>` : ''}</div>
      ${why.length ? html`<div class="rv-why"><strong class="small">Chưa thể duyệt:</strong><ul class="small">${why.map((x) => html`<li>${x}</li>`)}</ul></div>` : html`<p class="small text-success">${icon('check-circle', { cls: 'icon-sm' })} Đủ điều kiện duyệt.</p>`}
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-primary" data-action="rv-approve" data-id="${c.id}" ${why.length ? Codi.raw('disabled') : ''}>Duyệt và xuất bản</button>
        <button type="button" class="btn btn-secondary" data-action="rv-request" data-id="${c.id}">Yêu cầu sửa</button>
        <button type="button" class="btn btn-danger-outline" data-action="rv-reject" data-id="${c.id}">Từ chối</button>
      </div></div></section>`;
  }

  // ───────────────────────── route ─────────────────────────
  Codi.route('/admin/publication', (p, q) => {
    const tab = ['changes', 'approved'].includes(q.tab) ? q.tab : 'pending';
    const groups = { pending: db().courses.filter((c) => c.status === 'pending'), changes: db().courses.filter((c) => c.status === 'rejected'), approved: db().courses.filter((c) => ['published', 'hidden'].includes(c.status)) };
    const list = groups[tab];
    const sel = list.find((c) => c.id === q.id) || list[0];
    let detail;
    if (!sel) detail = html`<div class="card">${ui.empty({ icon: 'clipboard-check', title: tab === 'pending' ? 'Không có khoá học chờ duyệt' : 'Không có khoá học', body: tab === 'pending' ? 'Yêu cầu mới từ giảng viên sẽ xuất hiện ở đây.' : '' })}</div>`;
    else {
      const v = forCourse(sel);
      if (q.view && ['criteria', 'content', 'flags', 'history'].includes(q.view)) v.tab = q.view;
      const ro = sel.status !== 'pending';
      const r = ro ? R().latest(sel) : R().ensureRound(sel);
      const lec = Codi.user(sel.lecturerId);
      if (!r) detail = html`<section class="card"><div class="card-body stack-3"><h2 class="tc-h">${sel.title}</h2><p class="small muted">Khoá học được duyệt trước khi có quy trình duyệt chi tiết. Giá đang bán: ${fmt.vnd(sel.price)}.</p><a class="btn btn-secondary" style="width:fit-content" href="#/admin/courses">Mở Khóa học đã xuất bản</a></div></section>`;
      else {
        const nFlags = r.flags.filter((f) => f.status !== 'closed').length;
        const body = { criteria: criteriaView, content: contentView, flags: flagsView, history: historyView }[v.tab](sel, r, ro);
        detail = html`<div class="stack-4"><section class="card"><div class="card-body stack-4">
          <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:12px"><div class="stack-1"><h2 style="font-size:var(--text-xl);margin:0">${sel.title}</h2>
            <span class="small muted">${lec ? lec.name : ''} · ${Codi.category(sel.categoryId).name} · ${Codi.levelLabel(sel.level)} · Vòng ${r.round} · gửi ${fmt.relative(r.submittedAt)}</span></div>
            <div class="row" style="gap:8px"><button class="btn btn-secondary btn-sm" data-action="ad-preview" data-id="${sel.id}">${icon('eye', { cls: 'icon-sm' })} Xem trước như học viên</button></div></div>
          ${r.status !== 'in_review' ? ui.alert({ type: r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warn', title: `Vòng ${r.round}: ${ROUND[r.status]}`, body: r.note || '' }) : ''}
          ${sel.status === 'pending' && r.flags.some((f) => f.carried && f.status === 'fixed') ? ui.alert({ type: 'info', title: `Giảng viên đã sửa ${r.flags.filter((f) => f.carried && f.status === 'fixed').length} cờ của vòng trước`, body: 'Kiểm tra lại nội dung rồi đóng cờ ở thẻ "Cờ".' }) : ''}
          <div class="tabs" role="tablist" style="margin:0">${[['criteria', 'Tiêu chí'], ['content', 'Nội dung'], ['flags', `Cờ${nFlags ? ' (' + nFlags + ')' : ''}`], ['history', 'Lịch sử']].map(([k, l]) => html`<a class="tab" role="tab" aria-selected="${String(v.tab === k)}" href="#/admin/publication?tab=${tab}&id=${sel.id}&view=${k}">${l}</a>`)}</div>
          ${body}
        </div></section>${ro ? '' : decisionCard(sel, r)}</div>`;
      }
    }
    return shell('/admin/publication', html`
      <div class="page-header"><div><h1>Duyệt xuất bản</h1><p class="muted">Chấm từng tiêu chí, xem trước nội dung, gắn cờ chỗ cần sửa rồi kết luận.</p></div></div>
      <div class="tabs" role="tablist">${[['pending', 'Chờ duyệt'], ['changes', 'Cần sửa / từ chối'], ['approved', 'Đã duyệt']].map(([k, l]) => html`<a class="tab" role="tab" aria-selected="${String(tab === k)}" href="#/admin/publication?tab=${k}">${l} <span class="count">${groups[k].length}</span></a>`)}</div>
      <div class="split-view"><div class="split-list">${list.length ? list.map((c) => { const lr = R().latest(c); const n = lr ? lr.flags.filter((f) => f.status !== 'closed').length : 0; return html`<a class="split-list-item" href="#/admin/publication?tab=${tab}&id=${c.id}" aria-current="${String(sel && sel.id === c.id)}">
          <strong class="small od-clamp-2">${c.title}</strong><span class="xsmall muted">${(Codi.user(c.lecturerId) || {}).name || ''}${lr ? ` · vòng ${lr.round}` : ''}${n ? ` · ${n} cờ mở` : ''}</span></a>`; }) : html`<p class="small muted" style="padding:16px">Không có khoá học.</p>`}</div>
        <div class="split-detail">${detail}</div></div>`);
  }, { title: 'Duyệt xuất bản', role: 'admin' });

  // ───────────────────────── actions ─────────────────────────
  const round = (id) => R().ensureRound(Codi.course(id));
  Codi.action('rv-lesson', (el) => { view.lessonId = el.dataset.id; Codi.rerender(); });
  Codi.action('rv-goto', (el) => { view.tab = 'content'; view.lessonId = el.dataset.lesson || null; const c = Codi.course(view.courseId); Codi.go(`/admin/publication?tab=pending&id=${c.id}&view=content`); });
  Codi.action('rv-crit', (el) => { const r = round(el.dataset.course); const cur = r.criteria[el.dataset.id] || { note: '' }; cur.status = cur.status === el.dataset.v ? null : el.dataset.v; r.criteria[el.dataset.id] = cur; persist(); });
  Codi.action('rv-crit-note', (el) => { const r = round(el.dataset.course); r.criteria[el.dataset.id] = Object.assign(r.criteria[el.dataset.id] || {}, { note: el.value }); Codi.set(null, { render: false }); });
  Codi.action('rv-crit-auto', (el) => {
    const c = Codi.course(el.dataset.course); const r = round(c.id); const auto = R().autoCriteria(c); let n = 0;
    R().CRITERIA.forEach((k) => { if ((!r.criteria[k.id] || !r.criteria[k.id].status) && auto[k.id].status) { r.criteria[k.id] = { status: auto[k.id].status, note: auto[k.id].status === 'fix' ? auto[k.id].why : '' }; n += 1; } });
    persist(); ui.toast(n ? `Đã điền ${n} tiêu chí theo gợi ý. Kiểm tra lại trước khi kết luận.` : 'Không còn tiêu chí nào để điền tự động.');
  });
  Codi.action('rv-price', (el) => { priceDraft[el.dataset.id] = el.value; });

  // Flag dialog
  Codi.action('rv-flag', (el) => {
    const d = el.dataset;
    ui.modal({
      title: 'Gắn cờ', body: html`<form class="stack-3" data-submit="rv-flag-save" data-course="${d.course}" data-type="${d.type}" data-lesson="${d.lesson}" data-item="${d.item}" data-label="${d.label}" novalidate>
        <p class="small"><span class="muted">Vị trí:</span> <strong>${d.label}</strong></p>
        <fieldset class="stack-1"><legend class="small"><strong>Mức độ</strong></legend>
          <label class="check"><input type="radio" name="severity" value="must" checked> Bắt buộc sửa — chặn việc xuất bản</label>
          <label class="check"><input type="radio" name="severity" value="should"> Nên sửa — góp ý, không chặn</label></fieldset>
        <div class="field"><label for="rv-fc">Nhận xét cho giảng viên <span class="req">*</span></label><textarea id="rv-fc" name="comment" rows="3" placeholder="Mô tả vấn đề và cách sửa mong muốn"></textarea><span class="field-help" data-rv-help>Ít nhất 10 ký tự.</span></div>
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-close>Huỷ</button><button type="submit" class="btn btn-primary">${icon('flag', { cls: 'icon-sm' })} Gắn cờ</button></div></form>`,
    });
  });
  Codi.action('rv-flag-save', (form, e, v) => {
    const d = form.dataset; const comment = (v.comment || '').trim();
    if (comment.length < 10) { const h = form.querySelector('[data-rv-help]'); h.textContent = 'Nhận xét cần ít nhất 10 ký tự để giảng viên biết cần sửa gì.'; h.classList.add('field-error'); return; }
    const r = round(d.course);
    r.flags.push({ id: Codi.uid('fl'), target: { type: d.type, lessonId: d.lesson || undefined, itemId: d.item || undefined, label: d.label }, severity: v.severity || 'must', comment, status: 'open', reply: '', source: 'admin', at: new Date().toISOString() });
    const ov = form.closest('.overlay'); const x = ov && ov.querySelector('[data-close]'); if (x) x.click();
    persist(); ui.toast('Đã gắn cờ.', { type: 'success' });
  });
  Codi.action('rv-flag-state', (el) => { const f = round(el.dataset.course).flags.find((x) => x.id === el.dataset.id); if (f) { f.status = el.dataset.v; persist(); } });
  Codi.action('rv-flag-del', (el) => {
    const r = round(el.dataset.course); const i = r.flags.findIndex((x) => x.id === el.dataset.id); if (i < 0) return;
    const [f] = r.flags.splice(i, 1); persist();
    ui.toast('Đã xoá cờ.', { actions: Codi.raw('<button type="button" data-action="rv-flag-undo">Hoàn tác</button>') });
    lastDeleted = { courseId: el.dataset.course, flag: f, index: i };
  });
  let lastDeleted = null;
  Codi.action('rv-flag-undo', () => { if (!lastDeleted) return; round(lastDeleted.courseId).flags.splice(lastDeleted.index, 0, lastDeleted.flag); lastDeleted = null; persist(); });

  // AI pre-check (simulated; obeys the aiAssistant scenario flag)
  Codi.action('rv-ai', (el) => {
    const c = Codi.course(el.dataset.course); const token = {};
    const flag = Codi.state.scenario.aiAssistant;
    if (flag === 'ratelimit') { view.ai = { state: 'limit' }; Codi.rerender(); return; }
    view.ai = { state: 'running', token }; view.tab = 'flags'; Codi.rerender();
    if (flag === 'thinking') return;
    setTimeout(() => {
      if (!view.ai || view.ai.token !== token) return;
      if (flag === 'error') { view.ai = { state: 'error' }; Codi.rerender(); return; }
      const r = round(c.id);
      const have = new Set(r.flags.map((f) => f.target.label + '|' + f.comment));
      view.ai = { state: 'done', items: R().aiPrecheck(c).filter((x) => !have.has(x.target.label + '|' + x.comment)) };
      Codi.rerender();
    }, 1400);
  });
  Codi.action('rv-ai-stop', () => { view.ai = null; Codi.rerender(); ui.toast('Đã dừng rà soát.'); });
  Codi.action('rv-ai-skip', (el) => { const x = view.ai.items[Number(el.dataset.i)]; if (x) x.done = true; Codi.rerender(); });
  Codi.action('rv-ai-accept', (el) => {
    const r = round(el.dataset.course); const all = el.dataset.i === 'all';
    const pick = all ? view.ai.items.filter((x) => !x.done) : [view.ai.items[Number(el.dataset.i)]];
    pick.forEach((x) => { x.done = true; r.flags.push({ id: Codi.uid('fl'), target: x.target, severity: x.severity, comment: x.comment, status: 'open', reply: '', source: 'ai', at: new Date().toISOString() }); });
    persist(); ui.toast(`Đã thêm ${pick.length} cờ.`, { type: 'success' });
  });

  // Decisions
  const parsePrice = (s) => { const t = String(s || '').replace(/[.\s₫,]/g, ''); return /^\d+$/.test(t) ? Number(t) : null; };
  const lecturerLink = (c) => `/teach/courses/${c.id}/publish`;
  Codi.action('rv-approve', async (el) => {
    const c = Codi.course(el.dataset.id); const r = round(c.id);
    if (R().canApprove(r).length) return;
    const price = parsePrice(priceDraft[c.id] !== undefined ? priceDraft[c.id] : String(c.proposedPrice != null ? c.proposedPrice : c.price));
    if (price === null) { priceDraft.err = 'Giá phải là số nguyên không âm, ví dụ 1290000.'; Codi.rerender(); return; }
    priceDraft.err = null;
    const res = await ui.confirm({ title: `Duyệt và xuất bản "${c.title}"?`, body: `Giá bán: ${price ? fmt.vnd(price) : 'Miễn phí'}.`, consequence: 'Khoá học xuất hiện ngay trong danh mục và học viên mua được với giá này. Giảng viên nhận thông báo.', confirmLabel: 'Duyệt và xuất bản' });
    if (!res.ok) return;
    Object.assign(r, { status: 'approved', decidedAt: new Date().toISOString(), reviewerId: Codi.state.currentUserId });
    Object.assign(c, { status: 'published', price, approvedAt: r.decidedAt, rejectReason: null, reviewOutcome: null });
    Codi.notify(c.lecturerId, { title: 'Khoá học đã được duyệt', body: `${c.title} đã xuất bản với giá ${price ? fmt.vnd(price) : 'Miễn phí'}.`, link: lecturerLink(c) });
    delete priceDraft[c.id]; persist(false); ui.toast('Đã xuất bản khoá học.', { type: 'success' });
    Codi.go('/admin/publication?tab=approved&id=' + c.id);
  });
  Codi.action('rv-request', async (el) => {
    const c = Codi.course(el.dataset.id); const r = round(c.id);
    const fixes = R().CRITERIA.filter((k) => r.criteria[k.id] && r.criteria[k.id].status === 'fix');
    const open = r.flags.filter((f) => f.status !== 'closed');
    if (!fixes.length && !open.length) { ui.toast('Chưa có tiêu chí "Cần sửa" hay cờ nào để gửi. Gắn cờ trước khi yêu cầu sửa.', { type: 'warn' }); return; }
    const res = await ui.confirm({ title: `Yêu cầu sửa "${c.title}"?`, body: `Gửi ${fixes.length} tiêu chí cần sửa và ${open.length} cờ (${open.filter((f) => f.severity === 'must').length} bắt buộc) cho giảng viên.`, consequence: 'Khoá học chuyển sang "Bị từ chối" và không được bán. Giảng viên sửa theo từng cờ rồi gửi lại thành vòng duyệt mới.', requireReason: true, reasonLabel: 'Lời nhắn chung cho giảng viên', reasonPlaceholder: 'Ví dụ: Nội dung tốt, cần bổ sung tài liệu bài 4 và sửa đáp án quiz.', confirmLabel: 'Gửi yêu cầu sửa' });
    if (!res.ok) return;
    Object.assign(r, { status: 'changes_requested', decidedAt: new Date().toISOString(), reviewerId: Codi.state.currentUserId, note: res.reason });
    Object.assign(c, { status: 'rejected', reviewOutcome: 'changes', rejectReason: res.reason });
    Codi.notify(c.lecturerId, { title: 'Khoá học cần chỉnh sửa', body: `${c.title}: ${open.length} góp ý cần xem.`, link: lecturerLink(c) });
    persist(false); ui.toast('Đã gửi yêu cầu sửa cho giảng viên.');
    Codi.go('/admin/publication?tab=changes&id=' + c.id);
  });
  Codi.action('rv-reject', async (el) => {
    const c = Codi.course(el.dataset.id); const r = round(c.id);
    const res = await ui.confirm({ title: `Từ chối "${c.title}"?`, body: 'Dùng khi khoá học không phù hợp chính sách hoặc chất lượng chung chưa đạt. Nếu chỉ cần sửa vài chỗ, hãy dùng "Yêu cầu sửa".', consequence: 'Khoá học chuyển sang "Bị từ chối" và không được bán. Giảng viên thấy lý do và vẫn có thể sửa rồi gửi lại.', requireReason: true, reasonLabel: 'Lý do từ chối', danger: true, confirmLabel: 'Từ chối' });
    if (!res.ok) return;
    Object.assign(r, { status: 'rejected', decidedAt: new Date().toISOString(), reviewerId: Codi.state.currentUserId, note: res.reason });
    Object.assign(c, { status: 'rejected', reviewOutcome: 'rejected', rejectReason: res.reason });
    Codi.notify(c.lecturerId, { title: 'Khoá học bị từ chối', body: `${c.title}: ${res.reason}`, link: lecturerLink(c) });
    persist(false); ui.toast('Đã từ chối và gửi lý do cho giảng viên.');
    Codi.go('/admin/publication?tab=changes&id=' + c.id);
  });

  // S32b preview as learner (persistent bar + exit)
  Codi.action('ad-preview', (el) => {
    const c = Codi.course(el.dataset.id); const lec = Codi.user(c.lecturerId) || { name: '' };
    ui.modal({ size: 'lg', dismissible: false, body: html`<div class="ad-preview-container">
      <div class="ad-preview-bar"><div><strong>Bạn đang xem trước như học viên</strong> · ${c.title}</div>
        <button class="btn btn-secondary btn-sm" data-close>${icon('x', { cls: 'icon-sm' })} Thoát xem trước</button></div>
      <div class="ad-preview-content stack-4">
        <div>${ui.thumb(c)}<h1 style="margin:12px 0 0">${c.title}</h1><p class="small muted">${lec.name} · ${Codi.category(c.categoryId).name} · ${Codi.levelLabel(c.level)} · ${c.proposedPrice != null ? fmt.vnd(c.proposedPrice) + ' (giá đề xuất)' : 'Chưa có giá'}</p></div>
        <p>${c.summary}</p>
        ${c.outcomes.length ? html`<div class="stack-2"><h3>Bạn sẽ học được gì</h3><ul class="small">${c.outcomes.map((o) => html`<li>${o}</li>`)}</ul></div>` : ''}
        <div class="stack-2"><h3>Nội dung khóa học</h3>${c.chapters.map((ch) => html`<div class="stack-1"><strong>${ch.title}</strong><ul class="small">${ch.lessons.map((l) => html`<li>${l.title} <span class="muted">· ${TYPE[l.type] || l.type} · ${fmt.duration(l.durationMin)}</span></li>`)}</ul></div>`)}</div>
        <div class="stack-2"><h3>Yêu cầu trước khi học</h3><ul class="small">${(c.requirements.length ? c.requirements : ['Không có yêu cầu đặc biệt.']).map((x) => html`<li>${x}</li>`)}</ul></div>
      </div></div>` });
  });
})();
