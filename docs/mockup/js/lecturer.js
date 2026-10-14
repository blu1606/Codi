/**
 * lecturer.js — lecturer workspace (PRODUCT.md Flows T1–T4; screens S20–S29).
 * Routes (role lecturer): '/teach' · '/teach/courses' · '/teach/new' · '/teach/courses/:courseId[/:tab]'
 *   (tab: content|info|kmap|publish) · '/teach/courses/:courseId/quiz/:lessonId' (lessonId 'entry' = entry test)
 *   · '/teach/grading[/:submissionId]' · '/teach/questions' · '/teach/reviews' · '/teach/progress[/:courseId]'.
 *   Coding lessons: editor + analytics live in js/lecturer-coding.js ('/teach/courses/:courseId/code/:lessonId[/preview]').
 * All data lives in Codi.db(); transient editor drafts live in module variables.
 */
(function () {
  'use strict';
  const { html, icon, fmt, ui } = Codi;
  const me = () => Codi.currentUser();
  const myCourses = () => Codi.db().courses.filter((c) => c.lecturerId === me().id);
  const isMine = (c) => c && c.lecturerId === me().id;
  const byCourse = (list) => list.filter((x) => myCourses().some((c) => c.id === x.courseId));
  const persist = (render) => Codi.set(() => {}, { render: render !== false });
  const TYPE_ICON = { video: 'video', pdf: 'presentation', reading: 'book-open', tutorial: 'terminal', code: 'code' };
  const TYPE_LABEL = { video: 'Video', pdf: 'Slide/PDF', reading: 'Bài đọc', tutorial: 'Hướng dẫn code', code: 'Bài code' };
  const MATERIAL_TYPES = ['video', 'pdf', 'reading']; // coding lessons are edited in the code editor route
  // Status badge for coding lessons in the curriculum tree (tests + solution check feed publication).
  const codeBadge = (l) => {
    if (!l.code || l.code.kind !== 'challenge') return '';
    const chk = l.code.solutionCheck;
    if (!l.code.tests.length) return html`<span class="badge badge-warn">${icon('alert-triangle')}Chưa có test</span>`;
    return chk && chk.ok ? html`<span class="badge badge-success">${icon('check')}${l.code.tests.length} test · lời giải đạt</span>` : html`<span class="badge badge-warn">${icon('alert-triangle')}Chưa chạy thử lời giải</span>`;
  };
  const ENTRY_MIN = 5; // entry test needs at least this many questions to personalise (A5)

  // ───────────────────────── workspace shell ─────────────────────────
  function counts() {
    return {
      grading: byCourse(Codi.db().submissions).filter((s) => s.status === 'pending').length,
      questions: byCourse(Codi.db().questions).filter((q) => q.status === 'unanswered').length,
      reviews: byCourse(Codi.db().reviews).filter((r) => !r.reply).length,
    };
  }
  function shell(active, body) {
    const n = counts();
    return ui.workspace({
      label: 'Khu vực giảng dạy',
      active,
      items: [
        { section: 'Giảng dạy', href: '/teach', label: 'Tổng quan', icon: 'layout-dashboard' },
        { section: 'Giảng dạy', href: '/teach/courses', label: 'Khoá học của tôi', icon: 'book-open', match: /^\/teach\/(courses|new)/ },
        { section: 'Hỗ trợ học viên', href: '/teach/grading', label: 'Chấm bài', icon: 'clipboard-check', count: n.grading, match: /^\/teach\/grading/ },
        { section: 'Hỗ trợ học viên', href: '/teach/questions', label: 'Hỏi đáp', icon: 'message-circle', count: n.questions },
        { section: 'Hỗ trợ học viên', href: '/teach/reviews', label: 'Đánh giá', icon: 'star', count: n.reviews },
        { section: 'Hỗ trợ học viên', href: '/teach/progress', label: 'Tiến độ học viên', icon: 'bar-chart', match: /^\/teach\/progress/ },
        { section: 'Kinh doanh', href: '/teach/insights', label: 'Doanh thu', icon: 'trending-up', match: /^\/teach\/insights/ },
      ],
      body,
    });
  }
  const notMine = () => shell('', ui.empty({ icon: 'lock', title: 'Không tìm thấy khoá học của bạn', body: 'Khoá học không tồn tại hoặc thuộc giảng viên khác.', actions: html`<a class="btn btn-primary" href="#/teach/courses">Về danh sách khoá học</a>` }));

  // ───────────────────────── unsaved-changes guard (Thông tin tab, quiz builder) ─────────────────────────
  let dirty = null; // { label } when a form has unsaved edits
  document.addEventListener('click', (e) => {
    if (!dirty) return;
    const a = e.target.closest('a[href^="#/"], [data-go]');
    if (!a || a.closest('[data-dirty-scope]')) return;
    const target = a.getAttribute('href') || '#' + a.dataset.go;
    if (target === location.hash) return;
    e.preventDefault(); e.stopImmediatePropagation();
    ui.confirm({ title: 'Có thay đổi chưa lưu', body: `${dirty.label} có thay đổi chưa được lưu.`, consequence: 'Rời trang sẽ bỏ các thay đổi này.', confirmLabel: 'Rời trang, bỏ thay đổi', cancelLabel: 'Ở lại', danger: true })
      .then((r) => { if (r.ok) { dirty = null; Codi.go(target); } });
  }, true);
  window.addEventListener('hashchange', () => { if (dirty && !location.hash.startsWith(dirty.scope)) dirty = null; });

  // ───────────────────────── S20 home ─────────────────────────
  function courseRow(c) {
    const lessons = Codi.lessons(c).length;
    return html`<li class="card"><div class="card-body compact row">
      ${ui.thumb(c, { small: true })}
      <div class="od-fill stack-1"><a class="strong" href="#/teach/courses/${c.id}">${c.title}</a>
        <div class="row" style="gap:8px">${ui.courseStatus(c.status)}<span class="xsmall muted">${c.chapters.length} chương · ${lessons} bài · ${fmt.num(c.learnersCount)} học viên</span></div>
        ${c.status === 'rejected' ? html`<span class="small text-danger od-clamp-2">Lý do từ chối: ${c.rejectReason}</span>` : ''}
        ${c.status === 'hidden' ? html`<span class="small muted od-clamp-2">Lý do ẩn: ${c.hideReason}</span>` : ''}</div>
      <a class="btn btn-secondary btn-sm" href="#/teach/courses/${c.id}${c.status === 'rejected' ? '/publish' : ''}">${c.status === 'rejected' ? 'Sửa và gửi lại' : 'Mở'}</a>
    </div></li>`;
  }
  Codi.route('/teach', () => {
    const n = counts(); const mine = myCourses();
    const by = (s) => mine.filter((c) => c.status === s).length;
    const rejected = mine.find((c) => c.status === 'rejected');
    const tile = (href, v, label, meta) => html`<a class="stat-tile" href="#${href}"><span class="stat-value">${v}</span><span class="stat-label">${label}</span><span class="stat-go">${meta} ${icon('arrow-right', { cls: 'icon-sm' })}</span></a>`;
    return shell('/teach', html`
      <div class="page-header"><div><h1>Tổng quan giảng dạy</h1><p class="muted">Chào ${me().name}. Đây là những việc đang chờ bạn.</p></div><a class="btn btn-primary" href="#/teach/new">${icon('plus')} Tạo khóa học</a></div>
      ${rejected ? html`<div style="margin-bottom:24px">${ui.alert({ type: 'danger', title: `"${rejected.title}" bị từ chối xuất bản`, body: rejected.rejectReason, actions: html`<a class="btn btn-secondary btn-sm" href="#/teach/courses/${rejected.id}/publish">Sửa và gửi lại</a>` })}</div>` : ''}
      <div class="grid-3">
        ${tile('/teach/grading', n.grading, 'Bài chờ chấm', 'Mở hàng chờ')}
        ${tile('/teach/questions?status=unanswered', n.questions, 'Câu hỏi chưa trả lời', 'Trả lời')}
        ${tile('/teach/reviews?filter=unreplied', n.reviews, 'Đánh giá chưa phản hồi', 'Phản hồi')}
      </div>
      <h2 class="section" style="font-size:var(--text-lg);margin-bottom:12px">Khoá học theo trạng thái</h2>
      <div class="grid-4">
        ${tile('/teach/courses?status=draft', by('draft'), 'Bản nháp', 'Xem')}
        ${tile('/teach/courses?status=pending', by('pending'), 'Chờ duyệt', 'Xem')}
        ${tile('/teach/courses?status=rejected', by('rejected'), 'Bị từ chối', 'Xem')}
        ${tile('/teach/courses?status=published', by('published'), 'Đã xuất bản', 'Xem')}
      </div>
      <div class="section-title section"><h2 style="font-size:var(--text-lg)">Khoá học của tôi</h2><a href="#/teach/courses">Xem tất cả</a></div>
      ${mine.length ? html`<ul class="list stack-3">${mine.slice(0, 4).map(courseRow)}</ul>`
        : html`<div class="card">${ui.empty({ icon: 'book-open', title: 'Bạn chưa có khoá học nào', body: 'Tạo khoá học đầu tiên chỉ với tên, mô tả ngắn, danh mục và trình độ. Bạn có thể bổ sung nội dung sau.', actions: html`<a class="btn btn-primary" href="#/teach/new">Tạo khóa học</a>` })}</div>`}
    `);
  }, { title: 'Giảng dạy', role: 'lecturer' });

  Codi.route('/teach/courses', (p, q) => {
    const status = q.status || 'all';
    const list = myCourses().filter((c) => status === 'all' || c.status === status);
    const opts = [['all', 'Tất cả'], ['draft', 'Bản nháp'], ['pending', 'Chờ duyệt'], ['rejected', 'Bị từ chối'], ['published', 'Đã xuất bản'], ['hidden', 'Đã ẩn']];
    return shell('/teach/courses', html`
      <div class="page-header"><div><h1>Khoá học của tôi</h1></div><a class="btn btn-primary" href="#/teach/new">${icon('plus')} Tạo khóa học</a></div>
      <div class="tabs" role="tablist">${opts.map(([v, l]) => html`<a class="tab" role="tab" aria-selected="${status === v}" href="#/teach/courses${v === 'all' ? '' : '?status=' + v}">${l} <span class="count">${v === 'all' ? myCourses().length : myCourses().filter((c) => c.status === v).length}</span></a>`)}</div>
      ${list.length ? html`<ul class="list stack-3">${list.map(courseRow)}</ul>` : html`<div class="card">${ui.empty({ icon: 'book-open', title: 'Không có khoá học ở trạng thái này' })}</div>`}
    `);
  }, { title: 'Khoá học của tôi', role: 'lecturer' });

  // ───────────────────────── S21 create course ─────────────────────────
  let createErr = {};
  let createVals = {};
  Codi.route('/teach/new', () => {
    const e = createErr; const v = createVals;
    const err = (k) => (e[k] ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${e[k]}</span></p>` : '');
    return shell('/teach/courses', html`
      <div class="page-header"><div><h1>Tạo khóa học</h1><p class="muted">Chỉ cần 4 thông tin. Khoá học được tạo ở trạng thái Bản nháp.</p></div></div>
      <form class="card" data-submit="tc-create" novalidate style="max-width:560px"><div class="card-body stack-4">
        <div class="field ${e.title ? 'is-invalid' : ''}"><label for="nc-title">Tên khoá học <span class="req">*</span></label><input id="nc-title" name="title" value="${v.title || ''}" placeholder="Ví dụ: Vue 3 cho người mới">${err('title')}</div>
        <div class="field ${e.summary ? 'is-invalid' : ''}"><label for="nc-sum">Mô tả ngắn <span class="req">*</span></label><textarea id="nc-sum" name="summary" rows="3">${v.summary || ''}</textarea><p class="field-help">1–2 câu: học viên sẽ làm được gì sau khoá học.</p>${err('summary')}</div>
        <div class="grid-2">
          <div class="field ${e.categoryId ? 'is-invalid' : ''}"><label for="nc-cat">Danh mục <span class="req">*</span></label><select id="nc-cat" name="categoryId"><option value="">Chọn danh mục</option>${Codi.db().categories.map((c) => html`<option value="${c.id}" ${v.categoryId === c.id ? Codi.raw('selected') : ''}>${c.name}</option>`)}</select>${err('categoryId')}</div>
          <div class="field ${e.level ? 'is-invalid' : ''}"><label for="nc-level">Trình độ <span class="req">*</span></label><select id="nc-level" name="level"><option value="">Chọn trình độ</option>${[['Beginner', 'Cơ bản'], ['Intermediate', 'Trung cấp'], ['Advanced', 'Nâng cao']].map(([k, l]) => html`<option value="${k}" ${v.level === k ? Codi.raw('selected') : ''}>${l}</option>`)}</select>${err('level')}</div>
        </div>
        <div class="row"><button class="btn btn-primary" type="submit">Tạo bản nháp</button><a class="btn btn-ghost" href="#/teach">Huỷ</a></div>
      </div></form>
    `);
  }, { title: 'Tạo khóa học', role: 'lecturer' });

  Codi.action('tc-create', (form, e, v) => {
    const err = {};
    if (!v.title || v.title.trim().length < 5) err.title = 'Tên khoá học cần ít nhất 5 ký tự.';
    if (!v.summary || v.summary.trim().length < 20) err.summary = 'Mô tả cần ít nhất 20 ký tự.';
    if (!v.categoryId) err.categoryId = 'Chọn một danh mục.';
    if (!v.level) err.level = 'Chọn trình độ.';
    createErr = err; createVals = v;
    if (Object.keys(err).length) { Codi.rerender(); return; }
    const id = 'course-' + Date.now().toString(36);
    const slug = v.title.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const course = { id, slug: slug + '-' + id.slice(-4), title: v.title.trim(), summary: v.summary.trim(), categoryId: v.categoryId, level: v.level, lecturerId: me().id, price: 0, proposedPrice: null, status: 'draft', rating: 0, ratingCount: 0, ratingBreakdown: [0, 0, 0, 0, 0], learnersCount: 0, durationMin: 0, outcomes: [], requirements: [], hue: Math.floor(Math.random() * 360), concepts: [], prerequisites: [], chapters: [], entryTest: null, defaultOrder: [], aiPath: [], pathUpdates: [] };
    Codi.set((st) => { st.db.courses.push(course); st.db.knowledgeMaps[id] = { status: 'empty', updatedAt: new Date().toISOString(), concepts: [], edges: [] }; }, { render: false });
    createErr = {}; createVals = {};
    ui.toast('Đã tạo bản nháp. Bắt đầu thêm chương và bài học.', { type: 'success' });
    Codi.go('/teach/courses/' + id + '/content');
  });

  // ───────────────────────── course helpers ─────────────────────────
  function recompute(c) {
    const ls = Codi.lessons(c);
    c.durationMin = ls.reduce((s, l) => s + (Number(l.durationMin) || 0), 0);
    c.defaultOrder = ls.map((l) => l.id);
  }
  // Content changed after the map was confirmed → mark it stale (needs re-analysis).
  function contentChanged(c) {
    recompute(c);
    const m = Codi.db().knowledgeMaps[c.id];
    if (m && m.status === 'confirmed') { m.status = 'stale'; ui.toast('Nội dung đã đổi: bản đồ kiến thức cần phân tích lại.', { type: 'warn' }); }
    if (m && m.status === 'empty' && ls(c).length) m.status = 'ready';
  }
  const ls = (c) => Codi.lessons(c);
  const locked = (c) => c.status === 'pending';
  function findLesson(c, id) { for (const ch of c.chapters) { const i = ch.lessons.findIndex((l) => l.id === id); if (i >= 0) return { ch, i, l: ch.lessons[i] }; } return null; }

  function editorHeader(c, tab) {
    const tabs = [['content', 'Nội dung'], ['info', 'Thông tin'], ['kmap', 'Bản đồ kiến thức'], ['publish', 'Xuất bản']];
    return html`<div class="stack-3" style="margin-bottom:16px">
      <a class="small" href="#/teach/courses">${icon('arrow-left', { cls: 'icon-sm' })} Khoá học của tôi</a>
      <div class="row-between"><div class="stack-1"><h1>${c.title}</h1><div class="row" style="gap:8px">${ui.courseStatus(c.status)}<span class="xsmall muted">${c.chapters.length} chương · ${ls(c).length} bài · ${fmt.duration(c.durationMin)}</span></div></div>
        ${c.status === 'published' ? html`<a class="btn btn-ghost btn-sm" href="#/courses/${c.slug}">${icon('eye', { cls: 'icon-sm' })} Xem trang bán</a>` : ''}</div>
      ${locked(c) ? ui.alert({ type: 'info', title: 'Đang chờ duyệt — nội dung chỉ đọc', body: `Gửi lúc ${fmt.datetime(c.submittedAt)}. Bạn sửa được sau khi quản trị viên duyệt hoặc từ chối.` }) : ''}
      ${c.status === 'published' ? ui.alert({ type: 'info', title: 'Khoá học đang bán', body: 'Thay đổi nội dung sẽ áp dụng ngay cho học viên mới; với thay đổi lớn, hãy gửi lại yêu cầu xuất bản để quản trị duyệt.' }) : ''}
      <div class="tabs" role="tablist" style="margin-bottom:0">${tabs.map(([k, l]) => html`<a class="tab" role="tab" aria-selected="${tab === k}" href="#/teach/courses/${c.id}/${k}">${l}${k === 'kmap' && ['stale', 'failed', 'ready'].includes((Codi.db().knowledgeMaps[c.id] || {}).status) ? html` <span class="count count-accent">!</span>` : ''}</a>`)}</div>
    </div>`;
  }

  // ───────────────────────── S22 content tab ─────────────────────────
  let renaming = null; // id of chapter/lesson being renamed
  function contentTab(c) {
    const ro = locked(c);
    // open reviewer flags of the last decided round, shown on the lesson they point at
    const rr = Codi.review.lecturerRound(c);
    const openFlags = (l) => Codi.review.flagsFor(rr, l.id).filter((x) => x.status === 'open');
    const flagBadge = (l) => { const n = openFlags(l); return n.length ? html`<a class="badge ${n.some((x) => x.severity === 'must') ? 'badge-danger' : 'badge-warn'}" href="#/teach/courses/${c.id}/publish">${icon('flag')}${n.length} góp ý từ quản trị</a>` : ''; };
    const aiPending = (l) => (l.quiz ? l.quiz.questions.filter((q) => q.aiGenerated && q.aiReviewed === false).length : 0);
    const hl = Codi.query && Codi.query().lesson;
    const lessonRow = (ch, l, i) => html`<li class="tc-lesson ${hl === l.id ? 'is-target' : ''}" ${ro ? '' : Codi.raw(`draggable="true" data-drag="lesson" data-id="${l.id}"`)} data-drop="lesson" data-id="${l.id}">
      ${ro ? '' : html`<span class="tc-grip" aria-hidden="true">${icon('grip-vertical', { cls: 'icon-sm' })}</span>`}
      <span class="tc-type">${icon(TYPE_ICON[l.type], { cls: 'icon-sm' })}</span>
      ${renaming === l.id ? html`<form class="input-group od-fill" data-submit="tc-rename" data-id="${l.id}"><input class="input" name="title" value="${l.title}" aria-label="Tên bài học" autofocus><button class="btn btn-primary btn-sm" type="submit">Lưu</button><button class="btn btn-ghost btn-sm" type="button" data-action="tc-rename-cancel">Huỷ</button></form>`
        : html`<div class="od-fill stack-1"><span class="small strong">${l.title}</span><span class="row xsmall muted" style="gap:8px">${TYPE_LABEL[l.type]} · ${fmt.duration(l.durationMin)}${codeBadge(l)}${l.quiz ? html`<span class="badge badge-neutral">Quiz ${l.quiz.questions.length} câu</span>` : ''}${l.assignment ? html`<span class="badge badge-neutral">Bài tập${(l.assignment.rubric || []).length ? '' : ' · chưa có thang chấm'}</span>` : ''}${l.aiDraft ? html`<span class="badge badge-neutral">${icon('sparkles')}AI soạn</span>` : ''}${aiPending(l) ? html`<span class="badge badge-accent">${icon('sparkles')}${aiPending(l)} câu AI chưa duyệt</span>` : ''}${l.materialError ? html`<span class="badge badge-danger">Lỗi tải tài liệu</span>` : ''}${flagBadge(l)}</span></div>`}
      ${ro || renaming === l.id ? '' : html`<div class="tc-row-actions">
        ${l.code ? html`<a class="btn btn-ghost btn-sm" href="#/teach/courses/${c.id}/code/${l.id}">${icon('code', { cls: 'icon-sm' })} ${l.code.kind === 'tutorial' ? 'Sửa hướng dẫn' : 'Sửa bài code'}</a>`
          : html`<button class="btn btn-ghost btn-sm" data-action="tc-lesson-edit" data-course="${c.id}" data-id="${l.id}">Sửa</button>`}
        <a class="btn btn-ghost btn-sm" href="#/teach/courses/${c.id}/quiz/${l.id}">${l.quiz ? 'Sửa quiz' : 'Thêm quiz'}</a>
        ${l.code || l.assignment ? '' : html`<button class="btn btn-ghost btn-sm" data-action="tc-add-assignment" data-course="${c.id}" data-id="${l.id}">Thêm bài tập</button>`}
        ${l.code ? '' : html`<button class="btn btn-ghost btn-icon btn-sm" data-action="tc-ai-import" data-course="${c.id}" data-id="${l.id}" aria-label="Tạo nội dung cho ${l.title} bằng AI từ tài liệu" title="Tạo bằng AI từ tài liệu">${icon('sparkles', { cls: 'icon-sm' })}</button>`}
        <button class="btn btn-ghost btn-icon btn-sm" data-action="tc-rename-start" data-id="${l.id}" aria-label="Đổi tên ${l.title}">${icon('pencil', { cls: 'icon-sm' })}</button>
        <button class="btn btn-ghost btn-icon btn-sm" data-action="tc-move" data-course="${c.id}" data-kind="lesson" data-id="${l.id}" data-dir="-1" aria-label="Chuyển ${l.title} lên">${icon('arrow-up', { cls: 'icon-sm' })}</button>
        <button class="btn btn-ghost btn-icon btn-sm" data-action="tc-move" data-course="${c.id}" data-kind="lesson" data-id="${l.id}" data-dir="1" aria-label="Chuyển ${l.title} xuống">${icon('arrow-down', { cls: 'icon-sm' })}</button>
        <button class="btn btn-ghost btn-icon btn-sm" data-action="tc-delete" data-course="${c.id}" data-kind="lesson" data-id="${l.id}" aria-label="Xoá ${l.title}">${icon('trash', { cls: 'icon-sm' })}</button>
      </div>`}
    </li>`;
    // Two structural actions only: a chapter, or a lesson (its type is chosen in the next step).
    // Quiz and assignment belong to a lesson, so they live on the lesson row ("Thêm quiz", "Sửa").
    const addBar = ro ? '' : html`<div class="row" style="gap:8px">
      <button class="btn btn-secondary" data-action="tc-add" data-course="${c.id}" data-kind="chapter">${icon('layers', { cls: 'icon-sm' })} Thêm chương</button>
      ${c.chapters.length ? html`<button class="btn btn-primary" data-action="tc-add-lesson" data-course="${c.id}">${icon('plus', { cls: 'icon-sm' })} Thêm bài học</button>` : ''}</div>`;
    return html`<div class="stack-4">
      <div class="row-between"><p class="small muted">Kéo thả biểu tượng ${icon('grip-vertical', { cls: 'icon-sm' })} hoặc dùng nút mũi tên để sắp xếp. ${c.entryTest ? html`Bài kiểm tra đầu vào: <a href="#/teach/courses/${c.id}/quiz/entry">${c.entryTest.questions.length} câu</a>.` : html`<span class="text-warn">Chưa có bài kiểm tra đầu vào.</span> ${ro ? '' : html`<a href="#/teach/courses/${c.id}/quiz/entry">Tạo bài kiểm tra đầu vào</a>`}`}</p>${addBar}</div>
      ${!c.chapters.length ? html`<div class="card">${ui.empty({ icon: 'layers', title: 'Khoá học chưa có nội dung', body: 'Bắt đầu bằng một chương, sau đó thêm bài học, quiz và bài tập.', actions: ro ? '' : html`<button class="btn btn-primary" data-action="tc-add" data-course="${c.id}" data-kind="chapter">${icon('plus')} Thêm chương đầu tiên</button>` })}</div>` : ''}
      ${c.chapters.map((ch, ci) => html`<section class="card tc-chapter" ${ro ? '' : Codi.raw(`draggable="true" data-drag="chapter" data-id="${ch.id}"`)} data-drop="chapter" data-id="${ch.id}">
        <div class="card-header">
          <div class="row od-fill">${ro ? '' : html`<span class="tc-grip" aria-hidden="true">${icon('grip-vertical', { cls: 'icon-sm' })}</span>`}
            ${renaming === ch.id ? html`<form class="input-group od-fill" data-submit="tc-rename" data-id="${ch.id}"><input class="input" name="title" value="${ch.title}" aria-label="Tên chương" autofocus><button class="btn btn-primary btn-sm" type="submit">Lưu</button><button class="btn btn-ghost btn-sm" type="button" data-action="tc-rename-cancel">Huỷ</button></form>`
              : html`<h2 class="tc-h">Chương ${ci + 1}: ${ch.title}</h2>`}</div>
          ${ro || renaming === ch.id ? '' : html`<div class="tc-row-actions">
            <button class="btn btn-ghost btn-sm" data-action="tc-add-lesson" data-course="${c.id}" data-chapter="${ch.id}">${icon('plus', { cls: 'icon-sm' })} Bài học</button>
            <button class="btn btn-ghost btn-icon btn-sm" data-action="tc-rename-start" data-id="${ch.id}" aria-label="Đổi tên chương">${icon('pencil', { cls: 'icon-sm' })}</button>
            <button class="btn btn-ghost btn-icon btn-sm" data-action="tc-move" data-course="${c.id}" data-kind="chapter" data-id="${ch.id}" data-dir="-1" aria-label="Chuyển chương lên">${icon('arrow-up', { cls: 'icon-sm' })}</button>
            <button class="btn btn-ghost btn-icon btn-sm" data-action="tc-move" data-course="${c.id}" data-kind="chapter" data-id="${ch.id}" data-dir="1" aria-label="Chuyển chương xuống">${icon('arrow-down', { cls: 'icon-sm' })}</button>
            <button class="btn btn-ghost btn-icon btn-sm" data-action="tc-delete" data-course="${c.id}" data-kind="chapter" data-id="${ch.id}" aria-label="Xoá chương">${icon('trash', { cls: 'icon-sm' })}</button></div>`}
        </div>
        <ol class="list tc-lessons" data-drop-zone="${ch.id}">${ch.lessons.map((l, i) => lessonRow(ch, l, i))}
          ${!ch.lessons.length ? html`<li class="tc-empty-drop small muted" data-drop="chapter-end" data-id="${ch.id}">Chương chưa có bài học. ${ro ? '' : 'Thả bài học vào đây hoặc bấm "+ Bài học".'}</li>` : ''}</ol>
      </section>`)}
      ${ro ? '' : dangerZone(c)}
    </div>`;
  }

  function dangerZone(c) {
    const enrolled = Codi.db().enrolments.filter((e) => e.courseId === c.id).length;
    return html`<section class="card tc-danger"><div class="card-body row-between">
      <div class="stack-1"><strong>Xoá khoá học</strong><span class="small muted">${enrolled ? `Khoá học có ${enrolled} học viên nên không thể xoá. Liên hệ quản trị viên nếu cần ẩn khoá học.` : 'Xoá vĩnh viễn khoá học và toàn bộ nội dung.'}</span></div>
      <button class="btn btn-danger-outline" data-action="tc-delete-course" data-course="${c.id}" ${enrolled ? Codi.raw('disabled') : ''}>Xoá khoá học</button>
    </div></section>`;
  }

  // Lesson editor (side sheet) with simulated material uploads.
  let lessonDraft = null;
  function lessonEditorBody() {
    const d = lessonDraft;
    const up = d.upload;
    return html`<form class="stack-4" id="tc-lesson-form" novalidate>
      <div class="field"><label for="le-title">Tên bài học <span class="req">*</span></label><input id="le-title" value="${d.title}" data-le="title"></div>
      <div class="grid-2">
        <div class="field"><label for="le-type">Loại nội dung chính</label><select id="le-type" data-le="type">${MATERIAL_TYPES.map((k) => html`<option value="${k}" ${d.type === k ? Codi.raw('selected') : ''}>${TYPE_LABEL[k]}</option>`)}</select></div>
        <div class="field"><label for="le-dur">Thời lượng (phút)</label><input id="le-dur" type="number" min="1" value="${d.durationMin}" data-le="durationMin"></div>
      </div>
      ${d.type !== 'reading' ? html`<div class="field"><label for="le-file">${d.type === 'video' ? 'Tệp video' : 'Tệp PDF / slide'}</label>
        <input id="le-file" type="file" accept="${d.type === 'video' ? 'video/*' : '.pdf,.ppt,.pptx'}" data-le-file>
        ${d.fileName && (!up || up.state === 'done') ? html`<span class="small">${icon('check-circle', { cls: 'icon-sm text-success' })} ${d.fileName}</span>` : ''}
        ${up && up.state === 'uploading' ? html`<div class="stack-1" role="status"><div class="progress"><span style="width:${up.pct}%"></span></div><span class="xsmall muted">Đang tải lên ${up.name}… ${up.pct}%</span></div>` : ''}
        ${up && up.state === 'error' ? html`<p class="field-error" role="alert">${icon('alert-circle', { cls: 'icon-sm' })}<span>Tải lên thất bại: ${up.error} <button type="button" class="btn-link" data-le-retry>Thử lại</button></span></p>` : ''}
        <span class="field-help">Mô phỏng: tên tệp chứa "loi" hoặc tệp lớn hơn 200MB sẽ gặp lỗi tải lên.</span></div>` : ''}
      <div class="field"><label for="le-read">Nội dung bài đọc / tóm tắt</label><textarea id="le-read" rows="6" data-le="reading">${d.reading || ''}</textarea></div>
      <label class="switch"><input type="checkbox" data-le-assign ${d.assignment ? Codi.raw('checked') : ''}><span class="switch-track"></span>Có bài tập</label>
      ${d.assignment ? assignmentBuilder(d.assignment) : ''}
      ${d.error ? html`<p class="field-error" role="alert">${icon('alert-circle', { cls: 'icon-sm' })}<span>${d.error}</span></p>` : ''}
      <div class="panel row-between la-cta"><div class="stack-1"><strong class="small">${icon('sparkles', { cls: 'icon-sm' })} Tạo nội dung từ tài liệu</strong><span class="xsmall muted">Tải PDF/slide lên, AI soạn tóm tắt, câu hỏi quiz và khái niệm để bạn duyệt.</span></div>
        <button type="button" class="btn btn-secondary btn-sm" data-le-ai>Nhập tài liệu & tạo bằng AI</button></div>
    </form>`;
  }
  // Assignment builder: instructions, how to submit, scoring, deadline, late policy and rubric (sum = max score).
  const LATE = { accept: 'Vẫn nhận, không trừ điểm', penalty: 'Nhận và trừ điểm', reject: 'Không nhận bài nộp muộn' };
  const newAssignment = () => ({ instructions: '', requiresFile: false, requiresLink: true, acceptedTypes: '', maxScore: 10, passScore: 5, dueDays: 7, latePolicy: 'penalty', latePenalty: 20, rubric: [] });
  const rubricTotal = (a) => (a.rubric || []).reduce((s, k) => s + (Number(k.points) || 0), 0);
  function assignmentBuilder(a) {
    const total = rubricTotal(a); const sel = (v, x) => (v === x ? Codi.raw('selected') : '');
    const ai = lessonDraft.rubricAI;
    return html`<div class="stack-4 panel tc-assign">
      <div class="field"><label for="le-ins">Yêu cầu bài tập <span class="req">*</span></label><textarea id="le-ins" rows="4" data-le-a="instructions" placeholder="Mô tả sản phẩm cần nộp, yêu cầu bắt buộc và cách nộp.">${a.instructions}</textarea></div>
      <fieldset class="stack-2"><legend class="field-label">Học viên nộp</legend>
        <label class="check"><input type="checkbox" data-le-a-check="requiresLink" ${a.requiresLink ? Codi.raw('checked') : ''}> Đường dẫn (GitHub, CodeSandbox…)</label>
        <label class="check"><input type="checkbox" data-le-a-check="requiresFile" ${a.requiresFile ? Codi.raw('checked') : ''}> Tệp</label>
        ${a.requiresFile ? html`<div class="field"><label for="le-types">Định dạng tệp được nhận</label><input id="le-types" value="${a.acceptedTypes}" data-le-a="acceptedTypes" placeholder=".zip, .pdf"><span class="field-help">Để trống nếu nhận mọi loại tệp. Học viên nộp tối đa 20MB.</span></div>` : ''}
      </fieldset>
      <div class="grid-3">
        <div class="field"><label for="le-max">Điểm tối đa</label><input id="le-max" type="number" min="1" max="100" value="${a.maxScore}" data-le-a="maxScore" data-num></div>
        <div class="field"><label for="le-pass">Điểm đạt</label><input id="le-pass" type="number" min="0" value="${a.passScore}" data-le-a="passScore" data-num></div>
        <div class="field"><label for="le-due">Hạn nộp (ngày sau khi mở bài)</label><input id="le-due" type="number" min="1" value="${a.dueDays}" data-le-a="dueDays" data-num></div>
      </div>
      <div class="grid-2">
        <div class="field"><label for="le-late">Nộp muộn</label><select id="le-late" data-le-a-sel="latePolicy">${Object.keys(LATE).map((k) => html`<option value="${k}" ${sel(a.latePolicy, k)}>${LATE[k]}</option>`)}</select></div>
        ${a.latePolicy === 'penalty' ? html`<div class="field"><label for="le-pen">Trừ (% điểm)</label><input id="le-pen" type="number" min="1" max="100" value="${a.latePenalty}" data-le-a="latePenalty" data-num></div>` : ''}
      </div>
      <fieldset class="stack-3"><legend class="field-label">Thang chấm</legend>
        <p class="field-help">Học viên thấy thang chấm trước khi nộp. Tổng điểm các tiêu chí phải bằng điểm tối đa.</p>
        ${a.rubric.length ? html`<ol class="tc-rubric">${a.rubric.map((k, i) => html`<li class="tc-rubric-row">
          <div class="field od-fill"><label class="sr-only" for="le-rn-${i}">Tiêu chí ${i + 1}</label><input id="le-rn-${i}" value="${k.name}" placeholder="Tên tiêu chí" data-le-r="${i}" data-f="name">
            <label class="sr-only" for="le-rd-${i}">Mô tả tiêu chí ${i + 1}</label><input id="le-rd-${i}" class="small" value="${k.desc}" placeholder="Thế nào là đạt đủ điểm" data-le-r="${i}" data-f="desc"></div>
          <div class="field tc-rubric-pts"><label class="sr-only" for="le-rp-${i}">Điểm tiêu chí ${i + 1}</label><input id="le-rp-${i}" type="number" min="0" step="0.5" value="${k.points}" data-le-r="${i}" data-f="points"><span class="xsmall muted">điểm</span></div>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-le-r-del="${i}" aria-label="Xoá tiêu chí ${i + 1}">${icon('trash', { cls: 'icon-sm' })}</button></li>`)}</ol>
          <p class="small ${total === Number(a.maxScore) ? 'text-success' : 'text-warn'}" role="status" data-le-total>Tổng: ${total}/${a.maxScore} điểm${total === Number(a.maxScore) ? '' : ' — chưa khớp điểm tối đa'}</p>` : html`<p class="small muted">Chưa có tiêu chí.</p>`}
        <div class="row"><button type="button" class="btn btn-secondary btn-sm" data-le-r-add>${icon('plus', { cls: 'icon-sm' })} Thêm tiêu chí</button>
          <button type="button" class="btn btn-ghost btn-sm" data-le-r-ai ${!a.instructions.trim() || ai === 'loading' ? Codi.raw('disabled') : ''}>${icon('sparkles', { cls: 'icon-sm' })} Gợi ý thang chấm bằng AI</button></div>
        ${!a.instructions.trim() ? html`<p class="xsmall muted">Nhập yêu cầu bài tập để AI gợi ý thang chấm.</p>` : ''}
        ${ai === 'loading' ? html`<div class="ai-thinking-row" aria-busy="true"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span>AI đang đọc yêu cầu và đề xuất tiêu chí…</span><button type="button" class="btn btn-ghost btn-sm" data-le-r-stop>Dừng</button></div>` : ''}
        ${ai === 'error' ? html`<p class="field-error" role="alert">${icon('alert-circle', { cls: 'icon-sm' })}<span>AI chưa gợi ý được. <button type="button" class="btn-link" data-le-r-ai>Thử lại</button></span></p>` : ''}
        ${ai === 'limit' ? html`<p class="small text-warn" role="status">${icon('alert-triangle', { cls: 'icon-sm' })} Đã dùng hết lượt gợi ý bằng AI trong giờ này.</p>` : ''}
      </fieldset>
    </div>`;
  }
  function assignmentProblem(a) {
    if (!a.instructions.trim()) return 'Nhập yêu cầu bài tập hoặc tắt "Có bài tập".';
    if (!a.requiresFile && !a.requiresLink) return 'Chọn ít nhất một cách nộp bài: đường dẫn hoặc tệp.';
    if (!(a.maxScore > 0)) return 'Điểm tối đa phải lớn hơn 0.';
    if (a.passScore < 0 || a.passScore > a.maxScore) return 'Điểm đạt phải nằm trong khoảng 0 đến điểm tối đa.';
    if (a.rubric.some((k) => !k.name.trim())) return 'Mỗi tiêu chí chấm cần có tên.';
    if (a.rubric.length && rubricTotal(a) !== Number(a.maxScore)) return `Tổng điểm thang chấm (${rubricTotal(a)}) phải bằng điểm tối đa (${a.maxScore}).`;
    return null;
  }
  function openLessonEditor(courseId, lessonId, opts) {
    const c = Codi.course(courseId); const f = findLesson(c, lessonId);
    lessonDraft = { courseId, lessonId, title: f.l.title, type: f.l.type, durationMin: f.l.durationMin, reading: f.l.reading || '', fileName: f.l.fileName || '', assignment: f.l.assignment ? Object.assign(newAssignment(), JSON.parse(JSON.stringify(f.l.assignment))) : (opts && opts.withAssignment ? newAssignment() : null), upload: null, error: null, rubricAI: null };
    let rubricJob = null;
    const h = ui.sheet({
      title: 'Sửa bài học', wide: true, body: lessonEditorBody(),
      footer: html`<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn btn-primary" data-le-save>Lưu bài học</button>`,
      onClose: () => { if (rubricJob) rubricJob.stop(); lessonDraft = null; },
      onMount(handle) {
        const refresh = () => handle.setBody(lessonEditorBody());
        const runUpload = (file) => {
          lessonDraft.upload = { name: file.name, size: file.size, state: 'uploading', pct: 0 }; refresh();
          const fail = /loi/i.test(file.name) || file.size > 200 * 1024 * 1024;
          const t = setInterval(() => {
            if (!lessonDraft) return clearInterval(t);
            const u = lessonDraft.upload; u.pct = Math.min(100, u.pct + 20);
            if (fail && u.pct >= 60) { clearInterval(t); u.state = 'error'; u.error = file.size > 200 * 1024 * 1024 ? 'tệp vượt quá 200MB.' : 'mất kết nối khi tải lên.'; lessonDraft.lastFile = file; }
            else if (u.pct >= 100) { clearInterval(t); u.state = 'done'; lessonDraft.fileName = file.name; }
            refresh();
          }, 250);
        };
        handle.el.addEventListener('input', (e) => {
          const t = e.target;
          if (t.dataset.le) lessonDraft[t.dataset.le] = t.dataset.le === 'durationMin' ? Number(t.value) : t.value;
          const a = lessonDraft.assignment;
          if (t.dataset.leA) a[t.dataset.leA] = t.hasAttribute('data-num') ? Number(t.value) : t.value;
          if (t.dataset.leR) { const k = a.rubric[t.dataset.leR]; k[t.dataset.f] = t.dataset.f === 'points' ? Number(t.value) : t.value; }
          // live total without re-rendering (keeps focus in the field being typed)
          if (t.dataset.leA === 'instructions') { const b = handle.el.querySelector('[data-le-r-ai]'); if (b && lessonDraft.rubricAI !== 'loading') b.disabled = !t.value.trim(); }
          if (t.dataset.leR || t.dataset.leA === 'maxScore') {
            const out = handle.el.querySelector('[data-le-total]'); const total = rubricTotal(a); const ok = total === Number(a.maxScore);
            if (out) { out.textContent = `Tổng: ${total}/${a.maxScore} điểm${ok ? '' : ' — chưa khớp điểm tối đa'}`; out.className = `small ${ok ? 'text-success' : 'text-warn'}`; }
          }
        });
        handle.el.addEventListener('change', (e) => {
          const t = e.target;
          if (t.dataset.le === 'type') { lessonDraft.type = t.value; refresh(); }
          if (t.hasAttribute('data-le-file') && t.files[0]) runUpload(t.files[0]);
          if (t.hasAttribute('data-le-assign')) { lessonDraft.assignment = t.checked ? newAssignment() : null; refresh(); }
          if (t.dataset.leACheck) { lessonDraft.assignment[t.dataset.leACheck] = t.checked; refresh(); }
          if (t.dataset.leASel) { lessonDraft.assignment[t.dataset.leASel] = t.value; refresh(); }
        });
        const save = () => {
          const d = lessonDraft;
          if (!d.title.trim()) { d.error = 'Tên bài học không được để trống.'; refresh(); return false; }
          const ap = d.assignment && assignmentProblem(d.assignment);
          if (ap) { d.error = ap; refresh(); return false; }
          if (d.upload && d.upload.state === 'uploading') { d.error = 'Đợi tải lên xong rồi lưu.'; refresh(); return false; }
          const cc = Codi.course(d.courseId); const ff = findLesson(cc, d.lessonId);
          Object.assign(ff.l, { title: d.title.trim(), type: d.type, durationMin: Math.max(1, d.durationMin || 1), reading: d.reading, fileName: d.fileName, assignment: d.assignment, materialError: d.upload && d.upload.state === 'error' });
          if (d.fileName && (!ff.l.material || ff.l.material.fileName !== d.fileName)) ff.l.material = { fileName: d.fileName, kind: (d.fileName.split('.').pop() || '').toLowerCase() };
          contentChanged(cc); persist(); return true;
        };
        handle.el.addEventListener('click', (e) => {
          const d = lessonDraft; const a = d.assignment;
          if (e.target.closest('[data-le-retry]') && d.lastFile) runUpload(d.lastFile);
          if (e.target.closest('[data-le-r-add]')) { a.rubric.push({ id: Codi.uid('r'), name: '', points: Math.max(0, a.maxScore - rubricTotal(a)), desc: '' }); refresh(); }
          const del = e.target.closest('[data-le-r-del]');
          if (del) { a.rubric.splice(Number(del.dataset.leRDel), 1); refresh(); }
          if (e.target.closest('[data-le-r-stop]')) { if (rubricJob) rubricJob.stop(); d.rubricAI = null; refresh(); }
          if (e.target.closest('[data-le-r-ai]')) {
            const apply = (rubric) => { d.rubricAI = null; a.rubric = rubric; refresh(); ui.toast('AI đã đề xuất thang chấm. Kiểm tra lại tên, mô tả và điểm từng tiêu chí.', { type: 'success' }); };
            const run = () => {
              rubricJob = Codi.lecturerAI.task({
                onLimit() { d.rubricAI = 'limit'; refresh(); },
                onStart() { d.rubricAI = 'loading'; refresh(); },
                onError() { d.rubricAI = 'error'; refresh(); },
                onDone(r) { if (lessonDraft) apply(r); },
              }, () => Codi.lecturerAI.suggestRubric(a.instructions, a.maxScore), 1200);
            };
            if (a.rubric.length) ui.confirm({ title: 'Thay thang chấm hiện tại?', body: `AI sẽ đề xuất thang chấm mới thay cho ${a.rubric.length} tiêu chí đang có.`, confirmLabel: 'Thay bằng gợi ý AI' }).then((r) => { if (r.ok) run(); });
            else run();
          }
          if (e.target.closest('[data-le-ai]')) {
            // the import works on the saved lesson, so save the draft first
            if (!save()) return;
            const ids = [d.courseId, d.lessonId]; handle.close();
            Codi.lecturerAI.openImport(ids[0], ids[1]);
          }
          if (e.target.closest('[data-le-save]') && save()) { handle.close(); ui.toast('Đã lưu bài học.', { type: 'success' }); }
        });
      },
    });
    return h;
  }

  // ───────────────────────── S22 info tab ─────────────────────────
  let infoDraft = null;
  function infoTab(c) {
    const ro = locked(c);
    if (!infoDraft || infoDraft.id !== c.id) infoDraft = { id: c.id, title: c.title, summary: c.summary, categoryId: c.categoryId, level: c.level, outcomes: c.outcomes.join('\n'), requirements: c.requirements.join('\n'), proposedPrice: c.proposedPrice === null ? '' : String(c.proposedPrice), errors: {} };
    const d = infoDraft; const e = d.errors;
    const err = (k) => (e[k] ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${e[k]}</span></p>` : '');
    const dis = ro ? Codi.raw('disabled') : '';
    return html`<form class="card" data-submit="tc-info-save" data-course="${c.id}" novalidate data-dirty-scope><div class="card-body stack-4">
      <div class="field ${e.title ? 'is-invalid' : ''}"><label for="in-title">Tên khoá học</label><input id="in-title" name="title" value="${d.title}" data-input="tc-info-input" ${dis}>${err('title')}</div>
      <div class="field ${e.summary ? 'is-invalid' : ''}"><label for="in-sum">Mô tả</label><textarea id="in-sum" name="summary" rows="3" data-input="tc-info-input" ${dis}>${d.summary}</textarea>${err('summary')}</div>
      <div class="grid-2">
        <div class="field"><label for="in-cat">Danh mục</label><select id="in-cat" name="categoryId" data-input="tc-info-input" ${dis}>${Codi.db().categories.map((x) => html`<option value="${x.id}" ${d.categoryId === x.id ? Codi.raw('selected') : ''}>${x.name}</option>`)}</select></div>
        <div class="field"><label for="in-level">Trình độ</label><select id="in-level" name="level" data-input="tc-info-input" ${dis}>${[['Beginner', 'Cơ bản'], ['Intermediate', 'Trung cấp'], ['Advanced', 'Nâng cao']].map(([k, l]) => html`<option value="${k}" ${d.level === k ? Codi.raw('selected') : ''}>${l}</option>`)}</select></div>
      </div>
      <div class="field"><label for="in-out">Bạn sẽ học được gì? (mỗi dòng một ý)</label><textarea id="in-out" name="outcomes" rows="4" data-input="tc-info-input" ${dis}>${d.outcomes}</textarea></div>
      <div class="field"><label for="in-req">Yêu cầu trước khi học (mỗi dòng một ý)</label><textarea id="in-req" name="requirements" rows="3" data-input="tc-info-input" ${dis}>${d.requirements}</textarea></div>
      <div class="field ${e.proposedPrice ? 'is-invalid' : ''}" style="max-width:320px"><label for="in-price">Giá đề xuất (VND)</label><input id="in-price" name="proposedPrice" inputmode="numeric" value="${d.proposedPrice}" data-input="tc-info-input" ${dis}>
        <p class="field-help">Quản trị viên xác nhận giá cuối cùng khi duyệt. Nhập 0 cho khoá miễn phí.${c.status === 'published' ? ` Giá đang bán: ${fmt.vnd(c.price)}.` : ''}</p>${err('proposedPrice')}</div>
      ${ro ? '' : html`<div class="row tc-savebar" data-savebar ${dirty ? '' : Codi.raw('hidden')}><button class="btn btn-primary" type="submit">Lưu thay đổi</button><button class="btn btn-ghost" type="button" data-action="tc-info-cancel" data-course="${c.id}">Huỷ thay đổi</button><span class="small muted">Có thay đổi chưa lưu</span></div>`}
    </div></form>`;
  }
  Codi.action('tc-info-input', (el) => {
    if (!infoDraft) return;
    infoDraft[el.name] = el.value;
    if (!dirty) { dirty = { label: 'Thông tin khoá học', scope: '#/teach/courses/' + infoDraft.id + '/info' }; }
    const bar = document.querySelector('[data-savebar]'); if (bar) bar.hidden = false;
  });
  Codi.action('tc-info-cancel', () => { infoDraft = null; dirty = null; Codi.rerender(); });
  Codi.action('tc-info-save', (form) => {
    const c = Codi.course(form.dataset.course); const d = infoDraft; const e = {};
    if (!d.title.trim() || d.title.trim().length < 5) e.title = 'Tên khoá học cần ít nhất 5 ký tự.';
    if (!d.summary.trim() || d.summary.trim().length < 20) e.summary = 'Mô tả cần ít nhất 20 ký tự.';
    const priceStr = String(d.proposedPrice).replace(/[.\s₫]/g, '');
    if (priceStr !== '' && !/^\d+$/.test(priceStr)) e.proposedPrice = 'Giá phải là số nguyên không âm, ví dụ 790000.';
    d.errors = e;
    if (Object.keys(e).length) { Codi.rerender(); return; }
    Object.assign(c, { title: d.title.trim(), summary: d.summary.trim(), categoryId: d.categoryId, level: d.level, outcomes: d.outcomes.split('\n').map((x) => x.trim()).filter(Boolean), requirements: d.requirements.split('\n').map((x) => x.trim()).filter(Boolean), proposedPrice: priceStr === '' ? null : Number(priceStr) });
    infoDraft = null; dirty = null; persist(); ui.toast('Đã lưu thông tin khoá học.', { type: 'success' });
  });

  // ───────────────────────── S24 knowledge map ─────────────────────────
  const kmapOf = (c) => { const db = Codi.db(); if (!db.knowledgeMaps[c.id]) db.knowledgeMaps[c.id] = { status: ls(c).length ? 'ready' : 'empty', updatedAt: new Date().toISOString(), concepts: [], edges: [] }; return db.knowledgeMaps[c.id]; };
  const activeEdges = (m) => m.edges.filter((e) => e.review !== 'declined' && m.concepts.some((k) => k.id === e.from && k.review !== 'declined') && m.concepts.some((k) => k.id === e.to && k.review !== 'declined'));
  function findCycle(m) {
    const adj = {}; activeEdges(m).forEach((e) => { (adj[e.from] = adj[e.from] || []).push(e.to); });
    const state = {}; const stack = [];
    const dfs = (n) => {
      state[n] = 1; stack.push(n);
      for (const x of adj[n] || []) {
        if (state[x] === 1) return stack.slice(stack.indexOf(x)).concat(x);
        if (!state[x]) { const r = dfs(x); if (r) return r; }
      }
      state[n] = 2; stack.pop(); return null;
    };
    for (const k of m.concepts) if (!state[k.id]) { const r = dfs(k.id); if (r) return r; }
    return null;
  }
  function topoLessons(c, m) {
    const concepts = m.concepts.filter((k) => k.review !== 'declined');
    const indeg = {}; concepts.forEach((k) => { indeg[k.id] = 0; });
    const edges = activeEdges(m); edges.forEach((e) => { indeg[e.to] = (indeg[e.to] || 0) + 1; });
    const queue = concepts.filter((k) => !indeg[k.id]).map((k) => k.id); const out = [];
    while (queue.length) { const n = queue.shift(); out.push(n); edges.filter((e) => e.from === n).forEach((e) => { indeg[e.to] -= 1; if (!indeg[e.to]) queue.push(e.to); }); }
    const seen = new Set(); const lessons = [];
    out.forEach((cid) => { const k = m.concepts.find((x) => x.id === cid); (k.lessonIds || []).forEach((lid) => { if (!seen.has(lid)) { seen.add(lid); const l = Codi.lesson(c, lid); if (l) lessons.push(l); } }); });
    ls(c).forEach((l) => { if (!seen.has(l.id)) lessons.push(l); });
    return lessons;
  }
  const cname = (m, id) => (m.concepts.find((k) => k.id === id) || { name: id }).name;
  const REVIEW = { suggested: ['Đề xuất', 'badge-warn'], accepted: ['Đã chấp nhận', 'badge-success'], edited: ['Đã sửa', 'badge-info'], declined: ['Đã bỏ', 'badge-neutral'] };
  let renamingConcept = null;
  let kmapView = 'graph'; // 'graph' or 'list'
  let kmapSelectedNode = null;

  function runAnalysis(courseId) {
    const c = Codi.course(courseId); const m = kmapOf(c);
    m.status = 'analysing'; persist();
    setTimeout(() => {
      const mm = kmapOf(c); const sc = Codi.state.scenario.kmap;
      if (sc === 'fail') { mm.status = 'failed'; persist(Codi.path().startsWith('/teach/courses/' + courseId)); return; }
      // AI suggestions: keep confirmed concepts, re-suggest them; new courses get one concept per lesson.
      if (!mm.concepts.length) {
        mm.concepts = ls(c).map((l, i) => ({ id: 'k-' + l.id, name: l.title.replace(/^Bài \d+[:.]\s*/i, ''), lessonIds: [l.id], review: 'suggested' }));
        mm.edges = mm.concepts.slice(1).map((k, i) => ({ from: mm.concepts[i].id, to: k.id, review: 'suggested' }));
      } else {
        mm.concepts.forEach((k) => { k.review = 'suggested'; k.lessonIds = (k.lessonIds || []).filter((lid) => Codi.lesson(c, lid)); });
        mm.edges.forEach((e) => { e.review = 'suggested'; });
      }
      if (sc === 'cycle' && mm.concepts.length > 1) mm.edges.push({ from: mm.concepts[mm.concepts.length - 1].id, to: mm.concepts[0].id, review: 'suggested' });
      mm.status = 'ready'; mm.updatedAt = new Date().toISOString();
      Codi.notify(me().id, { title: 'Bản đồ kiến thức đã sẵn sàng', body: `${c.title}: ${mm.concepts.length} khái niệm cần bạn xem lại.`, link: '/teach/courses/' + courseId + '/kmap' });
      persist(Codi.path().startsWith('/teach/courses/' + courseId));
    }, 2500);
  }

  function kmapTab(c) {
    const m = kmapOf(c); const ro = locked(c);
    if (m.status === 'empty') return html`<div class="card">${ui.empty({ icon: 'map', title: 'Chưa có nội dung để phân tích', body: 'Thêm ít nhất một bài học, sau đó Codi sẽ đề xuất các khái niệm và quan hệ học trước.', actions: html`<a class="btn btn-primary" href="#/teach/courses/${c.id}/content">Thêm nội dung</a>` })}</div>`;
    if (m.status === 'analysing') return html`<div class="card"><div class="card-body stack-3" role="status"><p class="row strong">${icon('loader')} Đang phân tích nội dung…</p><p class="small muted">AI đang trích xuất khái niệm từ ${ls(c).length} bài học. Bạn sẽ nhận thông báo khi xong; có thể rời trang.</p>${ui.spinnerBlock('Đang trích xuất khái niệm')}</div></div>`;
    if (m.status === 'failed') return ui.alert({ type: 'danger', title: 'Phân tích bản đồ kiến thức thất bại', body: 'Dịch vụ AI không phản hồi. Nội dung khoá học không bị ảnh hưởng.', actions: html`<button class="btn btn-secondary btn-sm" data-action="tc-kmap-analyse" data-course="${c.id}">${icon('refresh', { cls: 'icon-sm' })} Thử lại</button>` });
    if (!m.concepts.length) return html`<div class="card">${ui.empty({ icon: 'sparkles', title: 'Chưa phân tích bản đồ kiến thức', body: 'Codi sẽ đọc nội dung các bài học và đề xuất khái niệm cùng quan hệ "cần học trước". Bạn xem lại và xác nhận trước khi dùng.', actions: ro ? '' : html`<button class="btn btn-primary" data-action="tc-kmap-analyse" data-course="${c.id}">${icon('sparkles')} Phân tích nội dung</button>` })}</div>`;
    const cycle = findCycle(m);
    const pending = m.concepts.filter((k) => k.review === 'suggested').length + m.edges.filter((e) => e.review === 'suggested').length;
    const live = m.concepts.filter((k) => k.review !== 'declined');
    const canConfirm = !ro && !cycle && !pending && live.length && m.status !== 'confirmed' && m.status !== 'stale';
    const statusLine = m.status === 'confirmed' ? ui.alert({ type: 'success', title: 'Bản đồ kiến thức đã được xác nhận', body: `Cập nhật ${fmt.datetime(m.updatedAt)}. Lộ trình của học viên dùng thứ tự này.` })
      : m.status === 'stale' ? ui.alert({ type: 'warn', title: 'Nội dung đã thay đổi sau khi xác nhận', body: 'Bản đồ có thể không còn khớp với bài học. Hãy phân tích lại và xác nhận.', actions: ro ? '' : html`<button class="btn btn-secondary btn-sm" data-action="tc-kmap-analyse" data-course="${c.id}">${icon('refresh', { cls: 'icon-sm' })} Phân tích lại</button>` })
      : ui.alert({ type: 'accent', title: pending ? `AI đề xuất — còn ${pending} mục chờ bạn xem lại` : 'Đã xem lại mọi đề xuất', body: 'Chấp nhận, sửa hoặc bỏ từng khái niệm và quan hệ "cần học trước". Bản đồ chỉ được dùng sau khi bạn xác nhận.' });
    const actBtns = (kind, id, review) => ro ? '' : html`<div class="tc-row-actions">
      ${review !== 'accepted' && review !== 'edited' ? html`<button class="btn btn-secondary btn-sm" data-action="tc-kmap-review" data-course="${c.id}" data-kind="${kind}" data-id="${id}" data-v="accepted">${icon('check', { cls: 'icon-sm' })} Chấp nhận</button>` : ''}
      ${kind === 'concept' ? html`<button class="btn btn-ghost btn-sm" data-action="tc-kmap-rename" data-id="${id}">Sửa</button>` : ''}
      ${review !== 'declined' ? html`<button class="btn btn-ghost btn-sm" data-action="tc-kmap-review" data-course="${c.id}" data-kind="${kind}" data-id="${id}" data-v="declined">Bỏ</button>` : html`<button class="btn btn-ghost btn-sm" data-action="tc-kmap-review" data-course="${c.id}" data-kind="${kind}" data-id="${id}" data-v="suggested">Khôi phục</button>`}
    </div>`;
    const graphNodes = live.map((k) => ({ id: k.id, label: k.name }));
    const graphEdges = activeEdges(m).filter((e) => live.some((k) => k.id === e.from) && live.some((k) => k.id === e.to)).map((e) => ({ from: e.from, to: e.to }));
    const selectedConcept = kmapSelectedNode ? m.concepts.find((k) => k.id === kmapSelectedNode) : null;
    const nodePanel = selectedConcept ? html`<aside class="tc-kmap-panel card" style="position:sticky;top:calc(var(--header-h) + 16px);max-height:calc(100vh - var(--header-h) - 32px);overflow-y:auto">
      <div class="card-header"><h3 class="small strong">${selectedConcept.name}</h3><button class="btn btn-ghost btn-icon btn-sm" data-action="tc-kmap-select-node" data-id="">✕</button></div>
      <div class="card-body stack-3">
        <div><span class="xsmall muted">Trạng thái</span><div class="badge ${REVIEW[selectedConcept.review][1]}">${REVIEW[selectedConcept.review][0]}</div></div>
        <div><span class="xsmall muted">Bài học liên quan</span><ul class="list" style="margin:8px 0">${(selectedConcept.lessonIds || []).map((lid) => { const l = Codi.lesson(c, lid); return html`<li class="small">${l ? l.title : ''}</li>`; })}</ul></div>
        ${!ro ? html`<button class="btn btn-secondary btn-sm" data-action="tc-kmap-rename" data-id="${selectedConcept.id}">${icon('pencil', { cls: 'icon-sm' })} Sửa tên</button>` : ''}
      </div>
    </aside>` : '';
    return html`<div class="stack-4">
      <div class="row-between">${statusLine}</div>
      <div class="row" style="gap:8px">${!ro && pending ? html`<button class="btn btn-secondary" data-action="tc-kmap-accept-all" data-course="${c.id}">Chấp nhận tất cả</button>` : ''}
        ${!ro && m.status !== 'stale' ? html`<button class="btn btn-ghost" data-action="tc-kmap-analyse" data-course="${c.id}">${icon('refresh', { cls: 'icon-sm' })} Phân tích lại</button>` : ''}
        <span style="margin-left:auto"></span>
        <button class="btn ${kmapView === 'graph' ? 'btn-primary' : 'btn-ghost'}" data-action="tc-kmap-toggle-view" data-view="graph">Dạng sơ đồ</button>
        <button class="btn ${kmapView === 'list' ? 'btn-primary' : 'btn-ghost'}" data-action="tc-kmap-toggle-view" data-view="list">Danh sách</button>
      </div>
      ${cycle ? ui.alert({ type: 'danger', title: 'Phát hiện vòng lặp: ' + cycle.map((id) => cname(m, id)).join(' → '), body: 'Hãy bỏ hoặc sửa một quan hệ để phá vòng lặp trước khi xác nhận.' }) : ''}
      ${kmapView === 'graph' ? html`<div class="split-view ${nodePanel ? 'tc-split' : ''}" style="grid-template-columns:${nodePanel ? 'minmax(0,1fr) 320px' : 'minmax(0,1fr)'}">
        <div class="card">${Codi.charts.graph({ nodes: graphNodes, edges: graphEdges, cycle: cycle || [], onSelectAction: ro ? null : 'tc-kmap-select-node' })}</div>
        ${nodePanel}
      </div>` : html`<section class="card"><div class="card-header"><h2 class="tc-h">Khái niệm (${live.length})</h2></div>
        <ul class="list">${m.concepts.map((k) => html`<li class="list-row ${k.review === 'declined' ? 'tc-declined' : ''}">
          <div class="list-main">${renamingConcept === k.id ? html`<form class="input-group" data-submit="tc-kmap-rename-save" data-course="${c.id}" data-id="${k.id}"><input class="input" name="name" value="${k.name}" aria-label="Tên khái niệm"><button class="btn btn-primary btn-sm" type="submit">Lưu</button><button class="btn btn-ghost btn-sm" type="button" data-action="tc-kmap-rename" data-id="">Huỷ</button></form>`
            : html`<span class="row" style="gap:8px"><strong class="small">${k.name}</strong><span class="badge ${REVIEW[k.review][1]}">${REVIEW[k.review][0]}</span></span>`}
            <span class="xsmall muted">Bài học: ${(k.lessonIds || []).map((lid) => (Codi.lesson(c, lid) || {}).title).filter(Boolean).join(', ') || 'chưa gắn bài học'}</span></div>
          ${renamingConcept === k.id ? '' : actBtns('concept', k.id, k.review)}</li>`)}</ul></section>
        <section class="card"><div class="card-header"><h2 class="tc-h">Quan hệ "cần học trước"</h2></div>
          <ul class="list">${m.edges.map((e, i) => html`<li class="list-row ${e.review === 'declined' ? 'tc-declined' : ''}"><div class="list-main"><span class="small"><strong>${cname(m, e.from)}</strong> cần học trước <strong>${cname(m, e.to)}</strong></span><span class="badge ${REVIEW[e.review][1]}" style="justify-self:start">${REVIEW[e.review][0]}</span></div>${actBtns('edge', String(i), e.review)}</li>`)}
            ${!m.edges.length ? html`<li class="list-row small muted">Chưa có quan hệ nào.</li>` : ''}</ul>
          ${ro || live.length < 2 ? '' : html`<form class="card-footer" data-submit="tc-kmap-add-edge" data-course="${c.id}" style="justify-content:flex-start">
            <label class="sr-only" for="edge-from">Khái niệm học trước</label><select id="edge-from" name="from" class="select" style="max-width:220px">${live.map((k) => html`<option value="${k.id}">${k.name}</option>`)}</select>
            <span class="small">cần học trước</span>
            <label class="sr-only" for="edge-to">Khái niệm học sau</label><select id="edge-to" name="to" class="select" style="max-width:220px">${live.map((k, i) => html`<option value="${k.id}" ${i === 1 ? Codi.raw('selected') : ''}>${k.name}</option>`)}</select>
            <button class="btn btn-secondary" type="submit">${icon('plus', { cls: 'icon-sm' })} Thêm quan hệ</button></form>`}
        </section>
        <section class="card"><div class="card-header"><h2 class="tc-h">Xem trước thứ tự học mặc định</h2></div><div class="card-body">
          ${cycle ? html`<p class="small muted">Không xếp được thứ tự khi còn vòng lặp.</p>` : html`<ol class="tc-order">${topoLessons(c, m).map((l) => html`<li class="small">${l.title}</li>`)}</ol>`}</div></section>`}
      ${ro ? '' : html`<div class="row"><button class="btn btn-primary btn-lg" data-action="tc-kmap-confirm" data-course="${c.id}" ${canConfirm ? '' : Codi.raw('disabled')}>Xác nhận bản đồ kiến thức</button>
        ${!canConfirm && m.status !== 'confirmed' ? html`<span class="small muted">${cycle ? 'Cần phá vòng lặp trước.' : pending ? `Còn ${pending} đề xuất chưa xem lại.` : m.status === 'stale' ? 'Hãy phân tích lại trước.' : ''}</span>` : ''}</div>`}
    </div>`;
  }

  // ───────────────────────── S25 publication ─────────────────────────
  function readiness(c) {
    const m = kmapOf(c);
    const challenges = ls(c).filter((l) => l.code && l.code.kind === 'challenge');
    const badCode = challenges.filter((l) => !l.code.tests.length || !(l.code.solutionCheck && l.code.solutionCheck.ok));
    const codeItem = challenges.length ? [{ ok: !badCode.length, label: 'Bài code có test và lời giải chạy đạt', hint: badCode.length ? `Cần sửa: ${badCode.map((l) => `"${l.title}"`).join(', ')} — mỗi bài cần ít nhất 1 test và lời giải chạy đạt tất cả test.` : '', href: badCode.length ? `/teach/courses/${c.id}/code/${badCode[0].id}` : '' }] : [];
    // AI-generated questions must be reviewed by the lecturer before learners see them
    const unreviewed = (quiz) => (quiz ? quiz.questions.filter((q) => q.aiGenerated && q.aiReviewed === false).length : 0);
    const aiLessons = ls(c).filter((l) => unreviewed(l.quiz));
    const aiCount = aiLessons.reduce((s, l) => s + unreviewed(l.quiz), 0) + unreviewed(c.entryTest);
    const aiItem = aiCount ? [{ ok: false, label: 'Câu hỏi do AI tạo đã được duyệt', hint: `Còn ${aiCount} câu do AI tạo chưa duyệt.`, href: aiLessons.length ? `/teach/courses/${c.id}/quiz/${aiLessons[0].id}` : `/teach/courses/${c.id}/quiz/entry` }]
      : ls(c).some((l) => l.quiz && l.quiz.questions.some((q) => q.aiGenerated)) ? [{ ok: true, label: 'Câu hỏi do AI tạo đã được duyệt' }] : [];
    const assigns = ls(c).filter((l) => l.assignment);
    const noRubric = assigns.filter((l) => !(l.assignment.rubric || []).length);
    const rubricItem = assigns.length ? [{ ok: !noRubric.length, label: 'Bài tập có thang chấm', hint: `Cần thêm thang chấm: ${noRubric.map((l) => `"${l.title}"`).join(', ')}.`, href: noRubric.length ? `/teach/courses/${c.id}/content?lesson=${noRubric[0].id}` : '' }] : [];
    return codeItem.concat(aiItem, rubricItem, [
      { ok: (c.summary || '').trim().length >= 20, label: 'Mô tả khoá học', hint: 'Mô tả ít nhất 20 ký tự.', href: `/teach/courses/${c.id}/info` },
      { ok: ls(c).length >= 1, label: 'Ít nhất 1 bài học', hint: 'Thêm chương và bài học.', href: `/teach/courses/${c.id}/content` },
      { ok: c.proposedPrice !== null && c.proposedPrice !== undefined, label: 'Giá đề xuất', hint: 'Nhập giá đề xuất (quản trị viên xác nhận giá cuối).', href: `/teach/courses/${c.id}/info` },
      { ok: !!(c.entryTest && c.entryTest.questions.length >= ENTRY_MIN), label: `Bài kiểm tra đầu vào (≥ ${ENTRY_MIN} câu)`, hint: c.entryTest ? `Hiện có ${c.entryTest.questions.length} câu.` : 'Chưa có bài kiểm tra đầu vào.', href: `/teach/courses/${c.id}/quiz/entry` },
      { ok: m.status === 'confirmed', label: 'Bản đồ kiến thức đã xác nhận', hint: m.status === 'stale' ? 'Bản đồ đã cũ, cần phân tích lại.' : 'Xem lại và xác nhận bản đồ.', href: `/teach/courses/${c.id}/kmap` },
    ]);
  }
  // Result of the last decided review round: criterion verdicts + flags the lecturer works through.
  const CRIT_TXT = { pass: ['badge-success', 'Đạt'], fix: ['badge-danger', 'Cần sửa'], na: ['badge-neutral', 'Không áp dụng'] };
  function reviewBlock(c) {
    const R = Codi.review; const r = R.lecturerRound(c);
    if (!r) return '';
    const ro = locked(c);
    const open = r.flags.filter((f) => f.status === 'open');
    const flags = r.flags.slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || (a.severity === 'must' ? 0 : 1) - (b.severity === 'must' ? 0 : 1));
    return html`<section class="card tc-review" aria-labelledby="tc-review-h">
      <div class="card-header"><div class="stack-1"><h2 class="tc-h" id="tc-review-h">Kết quả duyệt lần ${r.round}</h2><span class="xsmall muted">${r.decidedAt ? fmt.datetime(r.decidedAt) : ''}${r.note ? ` · ${r.note}` : ''}</span></div>
        ${open.length ? html`<span class="badge badge-warn">${open.length} góp ý cần xử lý</span>` : r.flags.length ? html`<span class="badge badge-success">Đã xử lý mọi góp ý</span>` : ''}</div>
      <div class="card-body stack-4">
        <div class="stack-2"><strong class="small">Tiêu chí</strong>
          <ul class="rv-crit">${R.CRITERIA.map((k) => { const v = r.criteria[k.id] || {}; const t = CRIT_TXT[v.status]; return html`<li class="rv-crit-row"><div class="rv-crit-main"><span class="small strong">${k.label}</span>${v.note ? html`<span class="xsmall">${v.note}</span>` : ''}</div>${t ? html`<span class="badge ${t[0]}">${t[1]}</span>` : html`<span class="badge badge-neutral">Chưa chấm</span>`}</li>`; })}</ul></div>
        ${flags.length ? html`<div class="stack-2"><strong class="small">Góp ý chi tiết</strong>
          <ul class="rv-flags">${flags.map((f) => html`<li class="rv-flag ${f.status !== 'open' ? 'is-closed' : ''}">
            <div class="row-between"><span class="row" style="gap:8px"><span class="badge ${f.severity === 'must' ? 'badge-danger' : 'badge-warn'}">${R.SEVERITY[f.severity]}</span><span class="badge badge-neutral">${R.FLAG_STATUS[f.status]}</span></span>
              <span class="xsmall muted">${f.source === 'ai' ? 'Gợi ý AI được người duyệt xác nhận' : 'Người duyệt'}</span></div>
            <span class="rv-flag-target small strong">${f.target.label}</span>
            <p class="small">${f.comment}</p>
            ${f.reply ? html`<p class="rv-reply small"><strong>Bạn trả lời:</strong> ${f.reply}</p>` : ''}
            <div class="row" style="gap:8px"><a class="btn btn-secondary btn-sm" href="#${R.targetHref(c, f.target)}">${icon('external-link', { cls: 'icon-sm' })} Mở để sửa</a>
              ${ro ? '' : f.status === 'open' ? html`<button class="btn btn-ghost btn-sm" data-action="tc-flag-fixed" data-course="${c.id}" data-id="${f.id}">${icon('check', { cls: 'icon-sm' })} Đánh dấu đã sửa</button>`
                : f.status === 'fixed' ? html`<button class="btn btn-ghost btn-sm" data-action="tc-flag-reopen" data-course="${c.id}" data-id="${f.id}">Bỏ đánh dấu</button>` : ''}</div></li>`)}</ul></div>` : ''}
        ${open.some((f) => f.severity === 'must') && ['rejected', 'draft'].includes(c.status) ? html`<p class="small text-warn">${icon('alert-triangle', { cls: 'icon-sm' })} Gửi lại khi còn góp ý "Bắt buộc sửa" chưa xử lý thì khoá học sẽ khó được duyệt.</p>` : ''}
      </div></section>`;
  }
  function publishTab(c) {
    const items = readiness(c); const allOk = items.every((x) => x.ok);
    const status = {
      draft: ui.alert({ type: 'info', title: 'Bản nháp', body: 'Hoàn thành danh sách bên dưới rồi gửi yêu cầu xuất bản.' }),
      pending: ui.alert({ type: 'warn', title: 'Chờ duyệt', body: `Đã gửi lúc ${fmt.datetime(c.submittedAt)}. Quản trị viên sẽ kiểm tra nội dung và xác nhận giá.` }),
      rejected: c.reviewOutcome === 'changes'
        ? ui.alert({ type: 'warn', title: 'Quản trị viên yêu cầu sửa', body: c.rejectReason, actions: html`<span class="small">Sửa theo các góp ý bên dưới, đánh dấu đã sửa rồi bấm "Sửa và gửi lại".</span>` })
        : ui.alert({ type: 'danger', title: 'Bị từ chối — lý do của quản trị viên', body: c.rejectReason, actions: html`<span class="small">Khoá học chưa phù hợp để bán. Bạn vẫn có thể sửa lớn rồi gửi lại.</span>` }),
      published: ui.alert({ type: 'success', title: 'Đã xuất bản', body: `Đang bán với giá ${fmt.vnd(c.price)} (do quản trị viên xác nhận).` }),
      hidden: ui.alert({ type: 'warn', title: 'Đã ẩn', body: `Lý do: ${c.hideReason}. Học viên cũ vẫn học được; học viên mới không mua được.` }),
    }[c.status];
    const canSubmit = ['draft', 'rejected'].includes(c.status);
    return html`<div class="stack-4">
      ${status}
      ${reviewBlock(c)}
      <section class="card"><div class="card-header"><h2 class="tc-h">Điều kiện xuất bản</h2><span class="small muted">${items.filter((x) => x.ok).length}/${items.length} đạt</span></div>
        <ul class="list">${items.map((x) => html`<li class="list-row">${icon(x.ok ? 'check-circle' : 'alert-circle', { cls: x.ok ? 'text-success' : 'text-warn' })}
          <div class="list-main"><strong class="small">${x.label}</strong><span class="xsmall muted">${x.ok ? 'Đã đạt' : x.hint}</span></div>
          ${x.ok ? html`<span class="badge badge-success">Đạt</span>` : html`<a class="btn btn-secondary btn-sm" href="#${x.href}">Sửa ngay</a>`}</li>`)}</ul></section>
      ${canSubmit ? html`<div class="row"><button class="btn btn-primary btn-lg" data-action="tc-submit" data-course="${c.id}" ${allOk ? '' : Codi.raw('disabled')}>${c.status === 'rejected' ? 'Sửa và gửi lại' : 'Gửi yêu cầu xuất bản'}</button>
        ${allOk ? '' : html`<span class="small muted">Hoàn thành ${items.filter((x) => !x.ok).length} điều kiện còn thiếu để gửi.</span>`}</div>` : ''}
    </div>`;
  }

  function editorRoute(p) {
    const c = Codi.course(p.courseId);
    if (!isMine(c)) return notMine();
    const tab = ['content', 'info', 'kmap', 'publish'].includes(p.tab) ? p.tab : 'content';
    const body = { content: contentTab, info: infoTab, kmap: kmapTab, publish: publishTab }[tab](c);
    return shell('/teach/courses', html`${editorHeader(c, tab)}${body}`);
  }
  Codi.route('/teach/courses/:courseId', editorRoute, { title: 'Soạn khoá học', role: 'lecturer' });
  Codi.route('/teach/courses/:courseId/:tab', editorRoute, { title: 'Soạn khoá học', role: 'lecturer' });

  // ───────────────────────── S23 quiz builder ─────────────────────────
  let qb = null; // { key, courseId, lessonId, quiz, entryFlag, showErrors }
  const qbKey = (cid, lid) => cid + '/' + lid;
  function qbProblems(quiz) {
    const probs = [];
    if (!quiz.questions.length) probs.push('Cần ít nhất một câu hỏi.');
    quiz.questions.forEach((q, i) => {
      if (!q.text.trim()) probs.push(`Câu ${i + 1}: chưa có nội dung câu hỏi.`);
      if (q.options.filter((o) => o.trim()).length < 2) probs.push(`Câu ${i + 1}: cần ít nhất 2 lựa chọn có nội dung.`);
      if (q.correctIndex === null || q.correctIndex === undefined || !q.options[q.correctIndex] || !q.options[q.correctIndex].trim()) probs.push(`Câu ${i + 1}: Cần ít nhất một đáp án đúng.`);
    });
    const ps = Number(quiz.passingScore);
    if (!(ps >= 1 && ps <= 100)) probs.push('Điểm đạt phải từ 1 đến 100%.');
    return probs;
  }
  Codi.route('/teach/courses/:courseId/quiz/:lessonId', (p) => {
    const c = Codi.course(p.courseId);
    if (!isMine(c)) return notMine();
    const isEntry = p.lessonId === 'entry';
    const lesson = isEntry ? null : Codi.lesson(c, p.lessonId);
    if (!isEntry && !lesson) return notMine();
    const key = qbKey(c.id, p.lessonId);
    if (!qb || qb.key !== key) {
      const src = isEntry ? c.entryTest : lesson.quiz;
      const quiz = src ? JSON.parse(JSON.stringify(src)) : { id: isEntry ? c.id + '-entry' : lesson.id + '-quiz', passingScore: 70, questions: [] };
      quiz.passingScore = quiz.passingScore || 70;
      quiz.questions.forEach((q) => { q.explanation = q.explanation || ''; });
      qb = { key, courseId: c.id, lessonId: p.lessonId, isEntry, quiz, entryFlag: isEntry || !!(c.entryTest && c.entryTest.sourceLessonId === p.lessonId), showErrors: false };
    }
    const quiz = qb.quiz; const probs = qbProblems(quiz); const ro = locked(c);
    const qErr = (q) => qb.showErrors || q.touched;
    return shell('/teach/courses', html`
      <div class="stack-3" style="margin-bottom:16px"><a class="small" href="#/teach/courses/${c.id}/content">${icon('arrow-left', { cls: 'icon-sm' })} ${c.title}</a>
        <h1>${isEntry ? 'Bài kiểm tra đầu vào' : 'Quiz: ' + lesson.title}</h1>
        ${isEntry ? html`<p class="muted">Codi dùng bài này để xếp lộ trình cho từng học viên. Cần ít nhất ${ENTRY_MIN} câu để xuất bản.</p>` : ''}
        ${ro ? ui.alert({ type: 'info', title: 'Khoá học đang chờ duyệt — chỉ đọc' }) : ''}</div>
      <div class="tc-qb">
        <div class="stack-3">
          ${quiz.questions.map((q, i) => html`<section class="card ${q.aiGenerated && q.aiReviewed === false ? 'tc-q-ai' : ''}"><div class="card-body stack-3">
            <div class="row-between"><span class="row" style="gap:8px"><strong class="small">Câu ${i + 1}</strong>${q.aiGenerated ? html`<span class="badge ${q.aiReviewed === false ? 'badge-accent' : 'badge-neutral'}">${icon('sparkles')}${q.aiReviewed === false ? 'AI tạo · chưa duyệt' : 'AI tạo · đã duyệt'}</span>` : ''}
              ${!ro && q.aiGenerated && q.aiReviewed === false ? html`<button class="btn btn-secondary btn-sm" data-action="tc-qb-ai-ok" data-i="${i}">${icon('check', { cls: 'icon-sm' })} Đã kiểm tra câu này</button>` : ''}</span>${ro ? '' : html`<div class="tc-row-actions">
              <button class="btn btn-ghost btn-icon btn-sm" data-action="tc-qb-move" data-i="${i}" data-dir="-1" ${i === 0 ? Codi.raw('disabled') : ''} aria-label="Chuyển câu ${i + 1} lên">${icon('arrow-up', { cls: 'icon-sm' })}</button>
              <button class="btn btn-ghost btn-icon btn-sm" data-action="tc-qb-move" data-i="${i}" data-dir="1" ${i === quiz.questions.length - 1 ? Codi.raw('disabled') : ''} aria-label="Chuyển câu ${i + 1} xuống">${icon('arrow-down', { cls: 'icon-sm' })}</button>
              <button class="btn btn-ghost btn-icon btn-sm" data-action="tc-qb-del" data-i="${i}" aria-label="Xoá câu ${i + 1}">${icon('trash', { cls: 'icon-sm' })}</button></div>`}</div>
            <div class="field ${qErr(q) && !q.text.trim() ? 'is-invalid' : ''}"><label for="qt-${i}">Nội dung câu hỏi</label><textarea id="qt-${i}" rows="2" data-input="tc-qb-text" data-i="${i}" ${ro ? Codi.raw('disabled') : ''}>${q.text}</textarea></div>
            <fieldset class="stack-2" style="border:0;padding:0;margin:0"><legend class="field-label" style="margin-bottom:8px">Lựa chọn — chọn "Đúng" cho đáp án đúng</legend>
              ${q.options.map((o, k) => html`<div class="tc-opt ${q.correctIndex === k ? 'is-correct' : ''}">
                <label class="tc-correct"><input type="radio" name="correct-${i}" ${q.correctIndex === k ? Codi.raw('checked') : ''} data-change="tc-qb-correct" data-i="${i}" data-k="${k}" ${ro ? Codi.raw('disabled') : ''}> ${q.correctIndex === k ? 'Đúng' : 'Sai'}</label>
                <input class="input od-fill" value="${o}" aria-label="Lựa chọn ${k + 1} của câu ${i + 1}" data-input="tc-qb-opt" data-i="${i}" data-k="${k}" ${ro ? Codi.raw('disabled') : ''}>
                ${ro ? '' : html`<button class="btn btn-ghost btn-icon btn-sm" data-action="tc-qb-opt-del" data-i="${i}" data-k="${k}" ${q.options.length <= 2 ? Codi.raw('disabled') : ''} aria-label="Xoá lựa chọn ${k + 1}">${icon('x', { cls: 'icon-sm' })}</button>`}</div>`)}
              ${ro ? '' : html`<button class="btn btn-ghost btn-sm" style="justify-self:start" data-action="tc-qb-opt-add" data-i="${i}">${icon('plus', { cls: 'icon-sm' })} Thêm lựa chọn</button>`}
              ${qErr(q) && (q.correctIndex === null || q.correctIndex === undefined) ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>Cần ít nhất một đáp án đúng</span></p>` : ''}
            </fieldset>
            <div class="field"><label for="qe-${i}">Giải thích (hiện sau khi học viên nộp bài)</label><textarea id="qe-${i}" rows="2" data-input="tc-qb-expl" data-i="${i}" ${ro ? Codi.raw('disabled') : ''}>${q.explanation}</textarea></div>
          </div></section>`)}
          ${!quiz.questions.length ? html`<div class="card">${ui.empty({ icon: 'clipboard-check', title: 'Chưa có câu hỏi', body: 'Thêm câu hỏi trắc nghiệm, đánh dấu rõ đáp án đúng.' })}</div>` : ''}
          ${ro ? '' : html`<button class="btn btn-secondary" style="justify-self:start" data-action="tc-qb-add">${icon('plus')} Thêm câu hỏi</button>`}
        </div>
        <aside class="card tc-qb-side"><div class="card-body stack-4">
          <h2 class="tc-h">Cài đặt quiz</h2>
          <div class="field"><label for="qb-pass">Điểm đạt (%)</label><input id="qb-pass" type="number" min="1" max="100" value="${quiz.passingScore}" data-input="tc-qb-pass" ${ro ? Codi.raw('disabled') : ''}></div>
          ${isEntry ? html`<p class="small"><span class="badge badge-accent">${icon('target')}Bài kiểm tra đầu vào</span></p>` : html`<label class="switch"><input type="checkbox" data-change="tc-qb-entry" ${qb.entryFlag ? Codi.raw('checked') : ''} ${ro ? Codi.raw('disabled') : ''}><span class="switch-track"></span>Dùng làm bài kiểm tra đầu vào</label>
            <p class="xsmall muted">Mỗi khoá có một bài kiểm tra đầu vào. Bật ở đây sẽ thay bài hiện tại.</p>`}
          <div class="stack-1"><strong class="small">${quiz.questions.length} câu hỏi</strong>${probs.length && (qb.showErrors || quiz.questions.some((q) => q.touched)) ? html`<ul class="small text-danger tc-probs">${probs.slice(0, 5).map((x) => html`<li>${x}</li>`)}</ul>` : ''}</div>
          ${ro ? '' : qbAIPanel(c, lesson)}
          ${ro ? '' : html`<button class="btn btn-primary btn-block" data-action="tc-qb-save">Lưu quiz</button>`}
          <a class="btn btn-ghost btn-block" href="#/teach/courses/${c.id}/content">Quay lại nội dung</a>
        </div></aside>
      </div>`);
  }, { title: 'Soạn quiz', role: 'lecturer' });

  // AI question generation inside the quiz builder. New questions are appended as "AI tạo · chưa duyệt";
  // the course cannot be submitted until each one is checked (see readiness).
  function qbAIPanel(c, lesson) {
    const a = qb.ai || { count: 5, difficulty: 'medium', state: null };
    const pending = qb.quiz.questions.filter((q) => q.aiGenerated && q.aiReviewed === false).length;
    return html`<div class="stack-3 tc-qb-ai">
      <strong class="small">${icon('sparkles', { cls: 'icon-sm' })} Tạo câu hỏi bằng AI</strong>
      <p class="xsmall muted">AI soạn từ nội dung ${lesson ? 'bài học' : 'các bài trong khoá'}${lesson && lesson.material ? ` và tài liệu ${lesson.material.fileName}` : ''}. Câu được thêm vào cuối, bạn duyệt từng câu.</p>
      <div class="grid-2"><div class="field"><label for="qb-ai-n">Số câu</label><select id="qb-ai-n" data-change="tc-qb-ai-opt" data-k="count">${[3, 5, 8].map((n) => html`<option ${a.count === n ? Codi.raw('selected') : ''}>${n}</option>`)}</select></div>
        <div class="field"><label for="qb-ai-d">Độ khó</label><select id="qb-ai-d" data-change="tc-qb-ai-opt" data-k="difficulty">${[['easy', 'Dễ'], ['medium', 'Vừa'], ['hard', 'Khó']].map(([v, t]) => html`<option value="${v}" ${a.difficulty === v ? Codi.raw('selected') : ''}>${t}</option>`)}</select></div></div>
      ${a.state === 'loading' ? html`<div class="ai-thinking-row" aria-busy="true"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span>AI đang soạn câu hỏi…</span><button class="btn btn-ghost btn-sm" data-action="tc-qb-ai-stop">Dừng</button></div>`
        : html`<button class="btn btn-secondary btn-block" data-action="tc-qb-ai">${icon('sparkles', { cls: 'icon-sm' })} Tạo ${a.count} câu bằng AI</button>`}
      ${a.state === 'error' ? html`<p class="field-error" role="alert">${icon('alert-circle', { cls: 'icon-sm' })}<span>AI chưa tạo được câu hỏi. Bấm tạo lại để thử lần nữa.</span></p>` : ''}
      ${a.state === 'limit' ? html`<p class="small text-warn" role="status">${icon('alert-triangle', { cls: 'icon-sm' })} Đã dùng hết lượt tạo bằng AI trong giờ này.</p>` : ''}
      ${!lesson ? '' : html`<button class="btn btn-ghost btn-sm" data-action="tc-ai-import" data-course="${c.id}" data-id="${lesson.id}">${icon('upload', { cls: 'icon-sm' })} Tạo từ tài liệu / slide khác</button>`}
      ${pending ? html`<p class="small" role="status"><span class="badge badge-accent">${pending} câu chưa duyệt</span> <button class="btn-link" data-action="tc-qb-ai-ok" data-i="all">Duyệt tất cả</button></p>` : ''}
    </div>`;
  }
  let qbJob = null;
  Codi.action('tc-qb-ai-opt', (el) => { qb.ai = Object.assign({ count: 5, difficulty: 'medium', state: null }, qb.ai); qb.ai[el.dataset.k] = el.dataset.k === 'count' ? Number(el.value) : el.value; Codi.rerender(); });
  Codi.action('tc-qb-ai', () => {
    const d = qb; d.ai = Object.assign({ count: 5, difficulty: 'medium', state: null }, d.ai);
    const c = Codi.course(d.courseId);
    // entry test: draw from the first lessons so the questions span the course
    const sources = d.isEntry ? ls(c).slice(0, 3) : [Codi.lesson(c, d.lessonId)];
    qbJob = Codi.lecturerAI.task({
      onLimit() { d.ai.state = 'limit'; Codi.rerender(); },
      onStart() { d.ai.state = 'loading'; Codi.rerender(); },
      onError() { d.ai.state = 'error'; Codi.rerender(); },
      onDone(qs) {
        if (qb !== d) return;
        const seen = new Set(d.quiz.questions.map((q) => q.text));
        const fresh = qs.filter((q) => !seen.has(q.text));
        d.ai.state = null; d.quiz.questions.push(...fresh); qbTouch(); Codi.rerender();
        ui.toast(fresh.length ? `AI đã thêm ${fresh.length} câu vào cuối quiz. Kiểm tra đáp án từng câu rồi bấm "Đã kiểm tra".` : 'AI không tìm thêm được câu mới cho bài này — hãy thử "Tạo từ tài liệu / slide khác".', { type: fresh.length ? 'success' : 'warn' });
      },
    }, () => sources.flatMap((l) => Codi.lecturerAI.generateQuestions(c, l, { count: Math.ceil(d.ai.count / sources.length), difficulty: d.ai.difficulty })).slice(0, d.ai.count), 1500);
  });
  Codi.action('tc-qb-ai-stop', () => { if (qbJob) qbJob.stop(); if (qb && qb.ai) qb.ai.state = null; Codi.rerender(); });
  Codi.action('tc-qb-ai-ok', (el) => {
    const qs = el.dataset.i === 'all' ? qb.quiz.questions : [qb.quiz.questions[el.dataset.i]];
    qs.forEach((q) => { if (q.aiGenerated) q.aiReviewed = true; }); qbTouch(); Codi.rerender();
  });
  const qbTouch = () => { if (!dirty) dirty = { label: 'Quiz', scope: '#/teach/courses/' + qb.courseId + '/quiz/' }; };
  Codi.action('tc-qb-text', (el) => { const q = qb.quiz.questions[el.dataset.i]; q.text = el.value; q.touched = true; qbTouch(); });
  Codi.action('tc-qb-expl', (el) => { qb.quiz.questions[el.dataset.i].explanation = el.value; qbTouch(); });
  Codi.action('tc-qb-opt', (el) => { qb.quiz.questions[el.dataset.i].options[el.dataset.k] = el.value; qbTouch(); });
  Codi.action('tc-qb-pass', (el) => { qb.quiz.passingScore = Number(el.value); qbTouch(); });
  Codi.action('tc-qb-correct', (el) => { qb.quiz.questions[el.dataset.i].correctIndex = Number(el.dataset.k); qbTouch(); Codi.rerender(); });
  Codi.action('tc-qb-add', () => { qb.quiz.questions.push({ id: Codi.uid('q'), conceptId: null, text: '', options: ['', ''], correctIndex: null, explanation: '' }); qbTouch(); Codi.rerender(); const t = document.getElementById('qt-' + (qb.quiz.questions.length - 1)); if (t) t.focus(); });
  Codi.action('tc-qb-opt-add', (el) => { qb.quiz.questions[el.dataset.i].options.push(''); qbTouch(); Codi.rerender(); });
  Codi.action('tc-qb-opt-del', (el) => { const q = qb.quiz.questions[el.dataset.i]; const k = Number(el.dataset.k); q.options.splice(k, 1); if (q.correctIndex === k) q.correctIndex = null; else if (q.correctIndex > k) q.correctIndex -= 1; qbTouch(); Codi.rerender(); });
  Codi.action('tc-qb-move', (el) => { const a = qb.quiz.questions; const i = Number(el.dataset.i); const j = i + Number(el.dataset.dir); if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; qbTouch(); Codi.rerender(); });
  Codi.action('tc-qb-del', async (el) => {
    const r = await ui.confirm({ title: `Xoá câu ${Number(el.dataset.i) + 1}?`, body: 'Câu hỏi sẽ bị xoá khỏi bản nháp quiz.', reversible: 'Thay đổi chỉ có hiệu lực khi bạn bấm "Lưu quiz".', confirmLabel: 'Xoá câu hỏi', danger: true });
    if (!r.ok) return; qb.quiz.questions.splice(Number(el.dataset.i), 1); qbTouch(); Codi.rerender();
  });
  Codi.action('tc-qb-entry', async (el) => {
    const c = Codi.course(qb.courseId);
    if (el.checked && c.entryTest && c.entryTest.sourceLessonId !== qb.lessonId) {
      const r = await ui.confirm({ title: 'Thay bài kiểm tra đầu vào?', body: `Khoá học đã có bài kiểm tra đầu vào (${c.entryTest.questions.length} câu).`, consequence: 'Khi lưu, quiz này sẽ trở thành bài kiểm tra đầu vào duy nhất của khoá; bài cũ bị thay thế.', confirmLabel: 'Dùng quiz này' });
      if (!r.ok) { el.checked = false; return; }
    }
    qb.entryFlag = el.checked; qbTouch();
  });
  Codi.action('tc-qb-save', () => {
    const probs = qbProblems(qb.quiz);
    if (probs.length) { qb.showErrors = true; Codi.rerender(); ui.toast('Quiz chưa hợp lệ — xem các lỗi ở bên phải.', { type: 'danger' }); return; }
    const c = Codi.course(qb.courseId);
    const clean = JSON.parse(JSON.stringify(qb.quiz)); clean.questions.forEach((q) => { delete q.touched; });
    if (qb.isEntry) c.entryTest = Object.assign(clean, { title: 'Bài kiểm tra đầu vào', isEntryTest: true });
    else {
      const l = Codi.lesson(c, qb.lessonId); l.quiz = clean;
      if (qb.entryFlag) c.entryTest = Object.assign(JSON.parse(JSON.stringify(clean)), { id: c.id + '-entry', title: 'Bài kiểm tra đầu vào', isEntryTest: true, sourceLessonId: l.id });
      else if (c.entryTest && c.entryTest.sourceLessonId === l.id) delete c.entryTest.sourceLessonId;
    }
    dirty = null; qb = null; persist(false);
    ui.toast('Đã lưu quiz.', { type: 'success' });
    Codi.go('/teach/courses/' + c.id + '/content');
  });

  // ───────────────────────── content actions ─────────────────────────
  Codi.action('tc-rename-start', (el) => { renaming = el.dataset.id; Codi.rerender(); const i = document.querySelector('[data-submit="tc-rename"] input'); if (i) { i.focus(); i.select(); } });
  Codi.action('tc-rename-cancel', () => { renaming = null; Codi.rerender(); });
  Codi.action('tc-rename', (form, e, v) => {
    const c = Codi.course(Codi._current.params.courseId); const id = form.dataset.id; const name = (v.title || '').trim();
    if (!name) { ui.toast('Tên không được để trống.', { type: 'danger' }); return; }
    const ch = c.chapters.find((x) => x.id === id); if (ch) ch.title = name; else { const f = findLesson(c, id); if (f) f.l.title = name; }
    renaming = null; persist();
  });
  Codi.action('tc-move', (el) => {
    const c = Codi.course(el.dataset.course); const dir = Number(el.dataset.dir);
    if (el.dataset.kind === 'chapter') { const i = c.chapters.findIndex((x) => x.id === el.dataset.id); const j = i + dir; if (j < 0 || j >= c.chapters.length) return; [c.chapters[i], c.chapters[j]] = [c.chapters[j], c.chapters[i]]; }
    else {
      const f = findLesson(c, el.dataset.id); const ci = c.chapters.indexOf(f.ch); const j = f.i + dir;
      if (j >= 0 && j < f.ch.lessons.length) { [f.ch.lessons[f.i], f.ch.lessons[j]] = [f.ch.lessons[j], f.ch.lessons[f.i]]; }
      else if (dir < 0 && ci > 0) { f.ch.lessons.splice(f.i, 1); c.chapters[ci - 1].lessons.push(f.l); }
      else if (dir > 0 && ci < c.chapters.length - 1) { f.ch.lessons.splice(f.i, 1); c.chapters[ci + 1].lessons.unshift(f.l); }
      else return;
    }
    contentChanged(c); persist();
  });
  Codi.action('tc-delete', async (el) => {
    const c = Codi.course(el.dataset.course);
    if (el.dataset.kind === 'chapter') {
      const ch = c.chapters.find((x) => x.id === el.dataset.id);
      const r = await ui.confirm({ title: `Xoá chương "${ch.title}"?`, body: ch.lessons.length ? `Chương có ${ch.lessons.length} bài học, sẽ bị xoá cùng chương.` : 'Chương đang trống.', reversible: false, confirmLabel: 'Xoá chương', danger: true });
      if (!r.ok) return; c.chapters = c.chapters.filter((x) => x !== ch);
    } else {
      const f = findLesson(c, el.dataset.id);
      const r = await ui.confirm({ title: `Xoá bài "${f.l.title}"?`, body: 'Video, tài liệu, quiz và bài tập của bài này sẽ bị xoá.', reversible: false, confirmLabel: 'Xoá bài học', danger: true });
      if (!r.ok) return; f.ch.lessons.splice(f.i, 1);
    }
    contentChanged(c); persist(); ui.toast('Đã xoá.');
  });
  // Creates a lesson of the chosen type in the chosen chapter, then opens its editor.
  function addLesson(c, chapterId, kind) {
    const ch = c.chapters.find((x) => x.id === chapterId) || c.chapters[c.chapters.length - 1];
    const id = 'lesson-' + Date.now().toString(36);
    const isCode = kind === 'code' || kind === 'tutorial';
    const type = isCode ? kind : kind === 'lesson' ? 'reading' : kind;
    const l = { id, title: isCode ? (kind === 'code' ? 'Bài code mới' : 'Hướng dẫn code mới') : 'Bài học mới', type, durationMin: isCode ? 20 : 10, conceptIds: [], reading: '', quiz: null, assignment: null };
    if (isCode) l.code = Codi.code.blank(kind === 'code' ? 'challenge' : 'tutorial');
    ch.lessons.push(l); contentChanged(c); persist();
    if (isCode) Codi.go(`/teach/courses/${c.id}/code/${id}`); else openLessonEditor(c.id, id);
    return l;
  }
  // Step 2 of "Thêm bài học": pick the chapter and the lesson type (manual or AI).
  const LESSON_KINDS = [
    { group: 'Tự soạn', items: [
      ['video', 'video', 'Video', 'Tải video lên, thêm tóm tắt, quiz hoặc bài tập.'],
      ['reading', 'book-open', 'Bài đọc', 'Nội dung chữ có định dạng, đọc ngay trên Codi.'],
      ['pdf', 'presentation', 'Slide / PDF', 'Tải slide hoặc tài liệu PDF lên.'],
      ['code', 'code', 'Bài code', 'Đề bài, code khởi đầu, lời giải và test chấm tự động.'],
      ['tutorial', 'terminal', 'Hướng dẫn code', 'Từng bước có code chạy thử, kiểu Replit.'],
    ] },
    { group: 'Tạo bằng AI', items: [
      ['ai-lesson', 'sparkles', 'Bài giảng bằng AI', 'Nhập chủ đề, AI soạn bài đọc và câu quiz để bạn duyệt.'],
      ['ai-code', 'sparkles', 'Bài code bằng AI', 'AI soạn đề, lời giải, test và gợi ý; lời giải được chạy thử.'],
      ['ai-import', 'upload', 'Từ tài liệu / slide', 'Tải PDF, PPTX hoặc DOCX; AI tạo tóm tắt, quiz, khái niệm.'],
    ] },
  ];
  Codi.action('tc-add-lesson', (el) => {
    const c = Codi.course(el.dataset.course);
    const chId = el.dataset.chapter || c.chapters[c.chapters.length - 1].id;
    const h = ui.modal({
      title: 'Thêm bài học', size: 'lg',
      body: html`<div class="stack-4">
        <div class="field"><label for="al-ch">Thêm vào chương</label><select id="al-ch">${c.chapters.map((ch, i) => html`<option value="${ch.id}" ${ch.id === chId ? Codi.raw('selected') : ''}>Chương ${i + 1}: ${ch.title}</option>`)}</select></div>
        ${LESSON_KINDS.map((g) => html`<fieldset class="tc-kinds"><legend class="field-label">${g.group}</legend>
          <div class="tc-kind-grid">${g.items.map(([k, ic, t, d]) => html`<button type="button" class="tc-kind" data-al-kind="${k}">
            <span class="tc-kind-icon" aria-hidden="true">${icon(ic, { cls: 'icon-sm' })}</span>
            <span class="tc-kind-text"><strong class="small">${t}</strong><span class="xsmall muted">${d}</span></span></button>`)}</div></fieldset>`)}
        <p class="xsmall muted">Quiz và bài tập gắn vào từng bài: dùng "Thêm quiz" hoặc "Sửa" trên dòng bài học.</p>
      </div>`,
      footer: html`<button class="btn btn-ghost" data-close>Huỷ</button>`,
      onMount(m) {
        m.el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-al-kind]'); if (!b) return;
          const kind = b.dataset.alKind; const ch = m.el.querySelector('#al-ch').value;
          m.close();
          if (kind === 'ai-lesson' || kind === 'ai-code') Codi.lecturerAI.openCreate(c.id, kind === 'ai-code' ? 'code' : 'lesson', ch);
          else if (kind === 'ai-import') { const l = addLessonQuiet(c, ch); Codi.lecturerAI.openImport(c.id, l.id); }
          else addLesson(c, ch, kind);
        });
      },
    });
    return h;
  });
  // Blank PDF lesson for "Từ tài liệu / slide": the import sheet fills it, without opening the lesson editor.
  function addLessonQuiet(c, chapterId) {
    const ch = c.chapters.find((x) => x.id === chapterId) || c.chapters[c.chapters.length - 1];
    const l = { id: 'lesson-' + Date.now().toString(36), title: 'Bài học mới', type: 'pdf', durationMin: 10, conceptIds: [], reading: '', quiz: null, assignment: null };
    ch.lessons.push(l); contentChanged(c); persist(); return l;
  }
  Codi.action('tc-add', (el) => {
    const c = Codi.course(el.dataset.course); const kind = el.dataset.kind;
    const menu = el.closest('details'); if (menu) menu.open = false;
    if (kind === 'chapter') { c.chapters.push({ id: c.id + '-ch' + Date.now().toString(36), title: 'Chương mới', lessons: [] }); persist(); renaming = c.chapters[c.chapters.length - 1].id; Codi.rerender(); return; }
    if (['lesson', 'video', 'reading', 'pdf', 'code', 'tutorial'].includes(kind)) addLesson(c, el.dataset.chapter, kind);
  });
  // Lesson-level additions live on the lesson row.
  Codi.action('tc-add-assignment', (el) => {
    const c = Codi.course(el.dataset.course); const f = findLesson(c, el.dataset.id);
    // the assignment is only stored when the lecturer saves the editor; cancelling leaves the lesson as it was
    openLessonEditor(c.id, f.l.id, { withAssignment: true });
  });
  Codi.action('tc-lesson-edit', (el) => openLessonEditor(el.dataset.course, el.dataset.id));
  Codi.action('tc-delete-course', async (el) => {
    const c = Codi.course(el.dataset.course);
    if (Codi.db().enrolments.some((e) => e.courseId === c.id)) return;
    const r = await ui.confirm({ title: 'Xoá vĩnh viễn khoá học?', body: `"${c.title}" và toàn bộ nội dung sẽ bị xoá.`, reversible: false, typeToConfirm: c.title, confirmLabel: 'Xoá khoá học', danger: true });
    if (!r.ok) return;
    Codi.set((st) => { st.db.courses = st.db.courses.filter((x) => x.id !== c.id); delete st.db.knowledgeMaps[c.id]; }, { render: false });
    ui.toast('Đã xoá khoá học.'); Codi.go('/teach/courses');
  });

  // Drag and drop (pointer users); keyboard users have the arrow buttons.
  let drag = null;
  document.addEventListener('dragstart', (e) => {
    const el = e.target.closest && e.target.closest('[data-drag]');
    if (!el || !Codi.path().startsWith('/teach/courses/')) return;
    e.stopPropagation();
    drag = { kind: el.dataset.drag, id: el.dataset.id };
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', el.dataset.id);
    el.classList.add('is-dragging');
  });
  document.addEventListener('dragend', (e) => { document.querySelectorAll('.is-dragging, .is-drop-target').forEach((x) => x.classList.remove('is-dragging', 'is-drop-target')); drag = null; });
  document.addEventListener('dragover', (e) => {
    if (!drag) return;
    const t = e.target.closest('[data-drop]'); if (!t) return;
    const ok = drag.kind === 'lesson' ? ['lesson', 'chapter-end', 'chapter'].includes(t.dataset.drop) : t.dataset.drop === 'chapter';
    if (!ok) return;
    e.preventDefault();
    document.querySelectorAll('.is-drop-target').forEach((x) => x.classList.remove('is-drop-target'));
    t.classList.add('is-drop-target');
  });
  document.addEventListener('drop', (e) => {
    if (!drag) return;
    const t = e.target.closest('[data-drop]'); if (!t) return;
    e.preventDefault();
    const c = Codi.course(Codi._current.params.courseId); if (!c) return;
    if (drag.kind === 'chapter' && t.dataset.drop === 'chapter' && t.dataset.id !== drag.id) {
      const from = c.chapters.findIndex((x) => x.id === drag.id); const [moved] = c.chapters.splice(from, 1);
      c.chapters.splice(c.chapters.findIndex((x) => x.id === t.dataset.id), 0, moved);
    } else if (drag.kind === 'lesson') {
      if (t.dataset.drop === 'lesson' && t.dataset.id === drag.id) return;
      const f = findLesson(c, drag.id); f.ch.lessons.splice(f.i, 1);
      if (t.dataset.drop === 'lesson') { const g = findLesson(c, t.dataset.id); g.ch.lessons.splice(g.i, 0, f.l); }
      else { const ch = c.chapters.find((x) => x.id === t.dataset.id); ch.lessons.push(f.l); }
    } else return;
    drag = null; contentChanged(c); persist(); ui.toast('Đã sắp xếp lại nội dung.');
  });

  // Knowledge map actions
  Codi.action('tc-kmap-analyse', (el) => runAnalysis(el.dataset.course));
  Codi.action('tc-kmap-review', (el) => {
    const c = Codi.course(el.dataset.course); const m = kmapOf(c);
    const item = el.dataset.kind === 'concept' ? m.concepts.find((k) => k.id === el.dataset.id) : m.edges[Number(el.dataset.id)];
    item.review = el.dataset.v; if (m.status === 'confirmed') m.status = 'ready'; persist();
  });
  Codi.action('tc-kmap-accept-all', (el) => { const m = kmapOf(Codi.course(el.dataset.course)); m.concepts.concat(m.edges).forEach((x) => { if (x.review === 'suggested') x.review = 'accepted'; }); persist(); ui.toast('Đã chấp nhận mọi đề xuất. Kiểm tra lại rồi xác nhận bản đồ.'); });
  Codi.action('tc-kmap-rename', (el) => { renamingConcept = el.dataset.id || null; Codi.rerender(); });
  Codi.action('tc-kmap-rename-save', (form, e, v) => {
    const m = kmapOf(Codi.course(form.dataset.course)); const k = m.concepts.find((x) => x.id === form.dataset.id);
    if (!(v.name || '').trim()) { ui.toast('Tên khái niệm không được để trống.', { type: 'danger' }); return; }
    k.name = v.name.trim(); k.review = 'edited'; renamingConcept = null; persist();
  });
  Codi.action('tc-kmap-add-edge', (form, e, v) => {
    const m = kmapOf(Codi.course(form.dataset.course));
    if (v.from === v.to) { ui.toast('Một khái niệm không thể cần học trước chính nó.', { type: 'danger' }); return; }
    if (m.edges.some((x) => x.from === v.from && x.to === v.to && x.review !== 'declined')) { ui.toast('Quan hệ này đã có.', { type: 'warn' }); return; }
    m.edges.push({ from: v.from, to: v.to, review: 'accepted' }); if (m.status === 'confirmed') m.status = 'ready'; persist();
  });
  Codi.action('tc-kmap-confirm', (el) => {
    const c = Codi.course(el.dataset.course); const m = kmapOf(c);
    if (findCycle(m)) return;
    m.status = 'confirmed'; m.updatedAt = new Date().toISOString();
    const live = m.concepts.filter((k) => k.review !== 'declined');
    c.concepts = live.map((k) => ({ id: k.id, name: k.name }));
    c.prerequisites = activeEdges(m).map((e) => ({ from: e.from, to: e.to }));
    ls(c).forEach((l) => { l.conceptIds = live.filter((k) => (k.lessonIds || []).includes(l.id)).map((k) => k.id); });
    persist(); ui.toast('Đã xác nhận bản đồ kiến thức.', { type: 'success' });
  });
  Codi.action('tc-kmap-toggle-view', (el) => { kmapView = el.dataset.view; Codi.rerender(); });
  Codi.action('tc-kmap-select-node', (el) => { kmapSelectedNode = el.dataset.id || null; Codi.rerender(); });

  // Publication
  Codi.action('tc-submit', async (el) => {
    const c = Codi.course(el.dataset.course);
    if (!readiness(c).every((x) => x.ok)) return;
    const r = await ui.confirm({ title: 'Gửi yêu cầu xuất bản?', body: `"${c.title}" sẽ chuyển sang Chờ duyệt.`, consequence: 'Trong lúc chờ duyệt, nội dung khoá học chỉ đọc. Quản trị viên sẽ xác nhận giá và duyệt hoặc từ chối kèm lý do.', reversible: 'Sau khi có kết quả, bạn sửa được như bình thường.', confirmLabel: 'Gửi yêu cầu' });
    if (!r.ok) return;
    const prev = Codi.review.latest(c);
    c.status = 'pending'; c.submittedAt = new Date().toISOString(); c.rejectReason = null; c.reviewOutcome = null;
    // resubmission opens a new review round; open/fixed flags are carried over for the reviewer to verify
    if (!prev || prev.status !== 'in_review') Codi.review.startNextRound(c, prev);
    const fixed = prev ? prev.flags.filter((f) => f.status === 'fixed').length : 0;
    const admin = Codi.db().users.find((u) => u.role === 'admin');
    if (admin) Codi.notify(admin.id, { title: prev ? `Gửi lại sau góp ý (lần ${prev.round + 1})` : 'Yêu cầu xuất bản mới', body: `${c.title} — ${me().name}${fixed ? ` · đã sửa ${fixed} góp ý` : ''}`, link: '/admin/publication?id=' + c.id });
    persist(); ui.toast('Đã gửi yêu cầu xuất bản.', { type: 'success' });
  });
  Codi.action('tc-flag-fixed', async (el) => {
    const c = Codi.course(el.dataset.course); const f = Codi.review.lecturerRound(c).flags.find((x) => x.id === el.dataset.id);
    const r = await ui.confirm({ title: 'Đánh dấu góp ý đã sửa?', body: html`<p class="small"><strong>${f.target.label}</strong></p><p class="small muted">${f.comment}</p>`, requireReason: true, reasonLabel: 'Bạn đã sửa gì?', reasonPlaceholder: 'Ví dụ: đã đổi đáp án đúng thành "Thêm use client" và cập nhật giải thích.', confirmLabel: 'Đánh dấu đã sửa', reversible: 'Người duyệt sẽ kiểm tra lại ở lần duyệt sau.' });
    if (!r.ok) return;
    Object.assign(f, { status: 'fixed', reply: r.reason, repliedAt: new Date().toISOString() });
    persist(); ui.toast('Đã đánh dấu đã sửa.', { type: 'success' });
  });
  Codi.action('tc-flag-reopen', (el) => {
    const c = Codi.course(el.dataset.course); const f = Codi.review.lecturerRound(c).flags.find((x) => x.id === el.dataset.id);
    Object.assign(f, { status: 'open', reply: '' }); persist();
  });
  Codi.action('tc-ai-import', (el) => {
    const id = el.dataset.id;
    // the quiz builder keeps its own draft; it must be saved first, then reloads with the imported questions
    if (qb && qb.lessonId === id && dirty) { ui.toast('Lưu quiz trước rồi mới nhập tài liệu, để không mất thay đổi.', { type: 'warn' }); return; }
    Codi.lecturerAI.openImport(el.dataset.course, id, { onApplied() { if (qb && qb.lessonId === id) { qb = null; Codi.rerender(); } } });
  });

  // ───────────────────────── S26 grading ─────────────────────────
  let gradeErr = {};
  let editingGradeId = null;
  let rubricDraft = null; // unsaved criterion scores kept across a validation re-render
  // Rubric scoring: one input per criterion, total computed live; the assignment's rubric is the source.
  const rubricOf = (s) => { const l = Codi.lesson(Codi.course(s.courseId), s.lessonId); return (l && l.assignment && l.assignment.rubric) || []; };
  function rubricGrader(s) {
    const rb = rubricOf(s); const prev = (rubricDraft && rubricDraft.id === s.id ? rubricDraft.scores : s.rubricScores) || {};
    const val = (k) => (prev[k.id] === undefined || isNaN(prev[k.id]) ? '' : prev[k.id]);
    const total = rb.reduce((t, k) => t + (Number(val(k)) || 0), 0);
    return html`<fieldset class="stack-2 tc-rubric-grade ${gradeErr.score ? 'is-invalid' : ''}" data-rubric-grade data-max="${s.maxScore}"><legend class="field-label">Chấm theo thang điểm <span class="req">*</span></legend>
      ${rb.map((k) => html`<div class="tc-rg-row"><label class="stack-1 od-fill" for="g-r-${k.id}"><span class="small strong">${k.name}</span><span class="xsmall muted">${k.desc}</span></label>
        <span class="row" style="gap:4px"><input id="g-r-${k.id}" name="r_${k.id}" type="number" min="0" max="${k.points}" step="0.5" value="${val(k)}" data-rubric-input><span class="xsmall muted od-nowrap">/ ${k.points}</span></span></div>`)}
      <p class="small strong" role="status" data-rubric-total>Tổng: ${String(total).replace('.', ',')}/${s.maxScore} · ngưỡng đạt ${s.passScore || 5}</p>
      ${gradeErr.score ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${gradeErr.score}</span></p>` : ''}</fieldset>`;
  }
  // live total for rubric inputs (no re-render, keeps focus)
  document.addEventListener('input', (e) => {
    if (!e.target.hasAttribute || !e.target.hasAttribute('data-rubric-input')) return;
    const fs = e.target.closest('[data-rubric-grade]');
    const total = [...fs.querySelectorAll('[data-rubric-input]')].reduce((t, i) => t + (Number(String(i.value).replace(',', '.')) || 0), 0);
    fs.querySelector('[data-rubric-total]').textContent = `Tổng: ${String(total).replace('.', ',')}/${fs.dataset.max}`;
  });
  let gradeAI = null; let gradeJob = null; // {id, state}
  const gradeAIStatus = (id) => (!gradeAI || gradeAI.id !== id ? html`<button type="button" class="btn btn-ghost btn-sm" data-action="tc-grade-ai" data-id="${id}">${icon('sparkles', { cls: 'icon-sm' })} AI gợi ý điểm và nhận xét</button>`
    : gradeAI.state === 'loading' ? html`<div class="ai-thinking-row" aria-busy="true"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span>AI đang đọc bài nộp…</span><button type="button" class="btn btn-ghost btn-sm" data-action="tc-grade-ai-stop">Dừng</button></div>`
    : gradeAI.state === 'error' ? html`<p class="field-error" role="alert">${icon('alert-circle', { cls: 'icon-sm' })}<span>AI chưa gợi ý được. <button type="button" class="btn-link" data-action="tc-grade-ai" data-id="${gradeAI.id}">Thử lại</button></span></p>`
    : gradeAI.state === 'limit' ? html`<p class="small text-warn" role="status">${icon('alert-triangle', { cls: 'icon-sm' })} Đã dùng hết lượt gợi ý bằng AI trong giờ này.</p>`
    : html`<p class="xsmall muted ai-draft-note" role="status">${icon('sparkles', { cls: 'icon-sm' })} Đã điền bản nháp do AI gợi ý — xem lại từng điểm và nhận xét trước khi lưu.</p>`);
  Codi.action('tc-grade-ai', (el) => {
    const s = Codi.db().submissions.find((x) => x.id === el.dataset.id);
    const l = Codi.lesson(Codi.course(s.courseId), s.lessonId);
    const id = s.id;
    // status is patched in place so feedback the lecturer already typed is not lost by a re-render
    const set = (state) => { gradeAI = { id, state }; const box = document.querySelector('[data-grade-ai]'); if (box) box.innerHTML = String(gradeAIStatus(id)); };
    gradeJob = Codi.lecturerAI.task({
      onLimit() { set('limit'); },
      onStart() { set('loading'); },
      onError() { set('error'); },
      onDone(r) {
        set('done');
        // fill the form without saving; the lecturer stays in control
        const form = document.querySelector(`[data-submit="tc-grade"][data-id="${id}"]`); if (!form) return;
        const rb = (l.assignment && l.assignment.rubric) || [];
        if (rb.length) { rb.forEach((k) => { const i = form.querySelector(`[name="r_${k.id}"]`); if (i) { i.value = r.scores[k.id]; i.dispatchEvent(new Event('input', { bubbles: true })); } }); }
        else { const sc = form.querySelector('[name="score"]'); if (sc) sc.value = Math.round(s.maxScore * 0.75 * 2) / 2; }
        const fb = form.querySelector('#g-fb'); if (fb) fb.value = fb.value.trim() ? fb.value + '\n\n' + r.feedback : r.feedback;
      },
    }, () => Codi.lecturerAI.gradeSuggestion(s, Object.assign({ rubric: [] }, l.assignment)), 1300);
  });
  Codi.action('tc-grade-ai-stop', () => { if (gradeJob) gradeJob.stop(); const id = gradeAI && gradeAI.id; gradeAI = null; const box = document.querySelector('[data-grade-ai]'); if (box) box.innerHTML = String(gradeAIStatus(id)); });
  function gradingRoute(p, q) {
    const status = q.status === 'graded' ? 'graded' : 'pending';
    const courseF = q.course || 'all';
    const all = byCourse(Codi.db().submissions);
    const list = all.filter((s) => s.status === status && (courseF === 'all' || s.courseId === courseF)).sort((a, b) => (status === 'pending' ? (a.submittedAt > b.submittedAt ? 1 : -1) : (a.gradedAt < b.gradedAt ? 1 : -1)));
    const sel = p.submissionId ? all.find((s) => s.id === p.submissionId) : list[0];
    const qs = (extra) => '?' + new URLSearchParams(Object.assign({ status, course: courseF }, extra || {})).toString();
    const item = (s) => { const u = Codi.user(s.userId); const c = Codi.course(s.courseId); const l = Codi.lesson(c, s.lessonId); return html`<a class="split-list-item" href="#/teach/grading/${s.id}${qs()}" aria-current="${sel && sel.id === s.id}">
      <span class="row-between"><strong class="small">${u.name}</strong>${s.status === 'graded' ? html`<span class="badge badge-success">${String(s.score).replace('.', ',')}/${s.maxScore}</span>` : html`<span class="xsmall muted">${fmt.relative(s.submittedAt)}</span>`}</span>
      <span class="xsmall muted od-truncate">${l ? l.title : ''} · ${c.title}</span></a>`; };
    let detail;
    if (!sel) detail = html`<div class="card">${ui.empty({ icon: 'clipboard-check', title: status === 'pending' ? 'Không có bài nào chờ chấm' : 'Chưa có bài đã chấm', body: status === 'pending' ? 'Bạn đã chấm hết bài nộp. Bài mới sẽ xuất hiện ở đây.' : '' })}</div>`;
    else {
      const u = Codi.user(sel.userId); const c = Codi.course(sel.courseId); const l = Codi.lesson(c, sel.lessonId);
      const nextPending = all.filter((s) => s.status === 'pending' && s.id !== sel.id && (courseF === 'all' || s.courseId === courseF))[0];
      detail = html`<div class="tc-grade">
        <section class="card"><div class="card-body stack-4">
          <div class="stack-1"><span class="xsmall muted">${c.title}</span><h2 class="tc-h">${l ? l.title : ''}</h2><span class="small muted">Nộp lúc ${fmt.datetime(sel.submittedAt)}</span></div>
          <div class="panel stack-1"><span class="xsmall muted">Yêu cầu bài tập</span><p class="small">${l && l.assignment ? l.assignment.instructions : ''}</p></div>
          <div class="stack-2"><strong class="small">Bài nộp</strong>
            ${sel.fileName ? html`<div class="row small">${icon('file-text', { cls: 'icon-sm' })} <span class="mono">${sel.fileName}</span> <button class="btn btn-ghost btn-sm" data-action="tc-fake-download" data-name="${sel.fileName}">${icon('download', { cls: 'icon-sm' })} Tải về</button></div>` : ''}
            ${sel.link ? html`<div class="row small">${icon('link', { cls: 'icon-sm' })} <a href="${sel.link}" target="_blank" rel="noopener">${sel.link}</a></div>` : ''}
            ${sel.note ? html`<div class="panel small"><span class="xsmall muted">Ghi chú của học viên</span><p>${sel.note}</p></div>` : html`<p class="small muted">Không có ghi chú.</p>`}
          </div>
        </div></section>
        <aside class="card"><form class="card-body stack-4" data-submit="tc-grade" data-id="${sel.id}" data-next="${nextPending ? nextPending.id : ''}" novalidate>
          <div class="row">${ui.avatar(u)}<div class="stack-1"><strong class="small">${u.name}</strong><span class="xsmall muted">${u.email}</span></div></div>
          <span class="badge ${sel.status === 'graded' ? 'badge-success' : 'badge-warn'}" style="justify-self:start">${sel.status === 'graded' ? 'Đã chấm' : 'Chờ chấm'}</span>
          ${rubricOf(sel).length ? rubricGrader(sel) : html`<div class="field ${gradeErr.score ? 'is-invalid' : ''}"><label for="g-score">Điểm (0–${sel.maxScore}) <span class="req">*</span></label><input id="g-score" name="score" type="number" min="0" max="${sel.maxScore}" step="0.5" value="${sel.score === null ? '' : sel.score}">
            <span class="field-help">Ngưỡng đạt: ${sel.passScore || 5}/${sel.maxScore}</span>${gradeErr.score ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${gradeErr.score}</span></p>` : ''}</div>`}
          <div data-grade-ai>${gradeAIStatus(sel.id)}</div>
          <div class="field"><label for="g-fb">Nhận xét cho học viên</label><div class="row" style="margin-bottom:8px"><textarea id="g-fb" name="feedback" rows="6" placeholder="Điểm làm tốt, điểm cần cải thiện, gợi ý tiếp theo" style="flex:1">${sel.feedback || ''}</textarea>
            <button type="button" class="btn btn-ghost btn-sm" data-action="tc-snippet-open" style="margin-left:8px;align-self:flex-start">${icon('list', { cls: 'icon-sm' })}</button></div>
            <span class="xsmall muted">Bấm ${icon('list', { cls: 'icon-xs', style: 'display:inline;margin:0 2px' })} để chèn mẫu nhận xét đã lưu</span></div>
          <button class="btn btn-primary" type="submit" name="go" value="stay">${sel.status === 'graded' ? 'Cập nhật điểm' : 'Lưu điểm'}</button>
          ${sel.status === 'graded' && !nextPending ? html`<button type="button" class="btn btn-secondary" data-action="tc-grade-history" data-id="${sel.id}">Xem lịch sử</button>` : ''}
          ${nextPending ? html`<button class="btn btn-secondary" type="submit" name="go" value="next">Lưu và chấm bài tiếp theo</button><a class="btn btn-ghost" href="#/teach/grading/${nextPending.id}${qs()}">Bỏ qua, sang bài tiếp theo</a>` : html`<p class="xsmall muted">Đây là bài chờ chấm cuối cùng.</p>`}
        </form></aside>
      </div>`;
    }
    return shell('/teach/grading', html`
      <div class="page-header"><div><h1>Chấm bài</h1><p class="muted">Chấm từng bài; học viên nhận thông báo ngay khi có điểm.</p></div></div>
      <div class="row-between" style="margin-bottom:16px">
        <div class="tabs" role="tablist" style="margin:0;border:0">${[['pending', 'Chờ chấm'], ['graded', 'Đã chấm']].map(([k, l]) => html`<a class="tab" role="tab" aria-selected="${status === k}" href="#/teach/grading?status=${k}&course=${courseF}">${l} <span class="count">${all.filter((s) => s.status === k && (courseF === 'all' || s.courseId === courseF)).length}</span></a>`)}</div>
        <div class="field" style="min-width:220px"><label class="sr-only" for="g-course">Lọc theo khoá học</label><select id="g-course" data-change="tc-grade-filter" data-status="${status}"><option value="all">Tất cả khoá học</option>${myCourses().map((c) => html`<option value="${c.id}" ${courseF === c.id ? Codi.raw('selected') : ''}>${c.title}</option>`)}</select></div>
      </div>
      <div class="split-view tc-split"><div class="split-list" role="list">${list.length ? list.map(item) : html`<p class="small muted" style="padding:16px">Không có bài nào.</p>`}</div><div class="split-detail">${detail}</div></div>
    `);
  }
  Codi.route('/teach/grading', gradingRoute, { title: 'Chấm bài', role: 'lecturer' });
  Codi.route('/teach/grading/:submissionId', gradingRoute, { title: 'Chấm bài', role: 'lecturer' });
  Codi.action('tc-grade-filter', (el) => Codi.go(`/teach/grading?status=${el.dataset.status}&course=${el.value}`));
  Codi.action('tc-fake-download', (el) => ui.toast(`Bản thử nghiệm: tệp ${el.dataset.name} không có nội dung thật.`));
  // Snippet management for feedback
  function feedbackSnippets() {
    return Codi.db().feedbackSnippets || [];
  }
  Codi.action('tc-snippet-open', (btn) => {
    const snippets = feedbackSnippets();
    const textarea = btn.closest('.field').querySelector('textarea');
    if (!snippets.length) { ui.toast('Chưa có mẫu nhận xét nào. Tạo mẫu trong cài đặt.', { type: 'info' }); return; }
    ui.sheet({
      title: 'Mẫu nhận xét',
      body: html`<div class="stack-3">${snippets.map((s) => html`<div class="panel stack-2"><strong class="small">${s.title}</strong>
        <p class="xsmall">${s.text}</p>
        <button type="button" class="btn btn-secondary btn-sm" data-action="tc-snippet-insert" data-id="${s.id}" data-target="g-fb">Chèn</button></div>`)}</div>`,
      footer: html`<button class="btn btn-ghost" data-close>Đóng</button><button class="btn btn-secondary btn-sm" data-go="/teach/snippets">Quản lý mẫu</button>`
    });
  });
  Codi.action('tc-snippet-insert', (btn) => {
    const id = btn.dataset.id;
    const snippet = feedbackSnippets().find((s) => s.id === id);
    if (!snippet) return;
    const textarea = document.getElementById(btn.dataset.target);
    if (!textarea) return;
    const current = textarea.value;
    const insert = snippet.text
      .replace(/{ten_hoc_vien}/g, (textarea.closest('form').parentElement.querySelector('strong.small')?.textContent || 'em'))
      .replace(/{diem}/g, (textarea.closest('form').querySelector('input[name="score"]')?.value || '—'));
    textarea.value = current ? current + '\n\n' + insert : insert;
    ui.closeAll();
    textarea.focus();
  });

  Codi.action('tc-grade', async (form, e, v) => {
    const s = Codi.db().submissions.find((x) => x.id === form.dataset.id);
    const rb = rubricOf(s); let score; let rubricScores = null;
    if (rb.length) {
      // every criterion must be scored within its own points; the total becomes the score
      rubricScores = {};
      const bad = rb.find((k) => { const t = String(v['r_' + k.id] || '').replace(',', '.'); const n = Number(t); rubricScores[k.id] = n; return t === '' || isNaN(n) || n < 0 || n > k.points; });
      if (bad) { rubricDraft = { id: s.id, scores: rubricScores }; gradeErr ={ score: `Chấm "${bad.name}" từ 0 đến ${bad.points} điểm.` }; Codi.rerender(); return; }
      score = Math.round(rb.reduce((t, k) => t + rubricScores[k.id], 0) * 10) / 10;
    } else {
      const raw = String(v.score || '').replace(',', '.');
      score = Number(raw);
      if (raw === '' || isNaN(score) || score < 0 || score > s.maxScore) { gradeErr = { score: `Nhập điểm từ 0 đến ${s.maxScore}.` }; Codi.rerender(); return; }
    }
    gradeErr = {}; gradeAI = null; rubricDraft = null;
    const wasGraded = s.status === 'graded';
    if (wasGraded && score !== s.score) {
      const res = await ui.confirm({
        title: 'Sửa điểm bài đã chấm',
        body: `Sửa điểm từ ${String(s.score).replace('.', ',')} thành ${String(score).replace('.', ',')}`,
        consequence: 'Học viên sẽ nhận thông báo điểm đã thay đổi.',
        confirmLabel: 'Cập nhật điểm',
        requireReason: true
      });
      if (!res.ok) return;
    }
    if (!s.history) s.history = [];
    if (wasGraded && score !== s.score) s.history.push({ oldScore: s.score, feedback: s.feedback, at: s.gradedAt });
    Object.assign(s, { score, feedback: (v.feedback || '').trim(), status: 'graded', gradedAt: new Date().toISOString() });
    if (rubricScores) s.rubricScores = rubricScores;
    const l = Codi.lesson(Codi.course(s.courseId), s.lessonId);
    Codi.notify(s.userId, { title: wasGraded ? 'Điểm bài tập đã được cập nhật' : 'Bài tập đã được chấm', body: `${l ? l.title : ''} — ${String(score).replace('.', ',')}/${s.maxScore}`, link: '/progress' });
    persist(false);
    ui.toast('Đã lưu điểm và thông báo cho học viên.', { type: 'success' });
    const go = e.submitter && e.submitter.value === 'next' && form.dataset.next;
    Codi.go(go ? `/teach/grading/${form.dataset.next}` : `/teach/grading/${s.id}?status=graded`);
  });
  Codi.action('tc-grade-history', (el) => {
    const s = Codi.db().submissions.find((x) => x.id === el.dataset.id);
    if (!s || !s.history || !s.history.length) { ui.toast('Không có lịch sử chỉnh sửa.'); return; }
    ui.sheet({ title: 'Lịch sử điểm', body: html`<div class="stack-2">${s.history.map((h, i) => html`<div class="panel stack-1"><span class="small strong">Lần ${s.history.length - i}</span><span class="xsmall muted">${fmt.datetime(h.at)}</span><p class="small">Điểm: ${String(h.oldScore).replace('.', ',')}</p><p class="xsmall muted">${h.feedback || '(không có nhận xét)'}</p></div>`)}</div>` });
  });

  // ───────────────────────── S27 Q&A inbox + conversations ─────────────────────────
  let replyErr = null;
  Codi.route('/teach/questions', (p, q) => {
    const view = q.view === 'conversations' ? 'conversations' : 'questions';
    const status = q.status === 'answered' ? 'answered' : 'unanswered';
    const allQuestions = byCourse(Codi.db().questions);
    const allConversations = byCourse(Codi.db().conversations || []);
    const aiConversations = allConversations.filter((c) => c.fromAI);
    const questionList = allQuestions.filter((x) => x.status === status).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const conversationList = aiConversations.filter((x) => view === 'conversations').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const selQuestion = allQuestions.find((x) => x.id === q.id);
    const selConversation = allConversations.find((x) => x.id === q.id);
    const sel = view === 'conversations' ? selConversation || conversationList[0] : selQuestion || questionList[0];

    let detail;
    if (!sel) {
      const msg = view === 'conversations'
        ? 'Không có cuộc hội thoại nào từ AI'
        : (status === 'unanswered' ? 'Không còn câu hỏi chưa trả lời' : 'Chưa có câu hỏi đã trả lời');
      detail = html`<div class="card">${ui.empty({ icon: 'inbox', title: msg })}</div>`;
    } else if (view === 'conversations') {
      const u = Codi.user(sel.learnerId); const c = Codi.course(sel.courseId);
      detail = html`<section class="card"><div class="card-body stack-4">
        <div class="stack-1"><span class="xsmall muted">${c.title} › ${sel.lessonId ? (Codi.lesson(c, sel.lessonId) || {}).title : 'Khóa học'}</span><div class="row">${ui.avatar(u, 'sm')}<strong class="small">${u.name}</strong><span class="xsmall muted">${fmt.relative(sel.createdAt)}</span><span class="badge ${sel.status === 'resolved' ? 'badge-success' : 'badge-warn'}" style="margin-left:auto">${sel.status === 'resolved' ? 'Đã giải quyết' : 'Đang mở'}</span></div></div>
        ${sel.aiContext ? html`<div class="panel stack-1"><span class="xsmall muted">Ngữ cảnh từ AI trợ lý</span><p class="xsmall">${sel.aiContext.summary || ''}</p>${sel.aiContext.code ? html`<div class="xsmall" style="background:var(--canvas);padding:8px;border-radius:var(--radius-sm);font-family:monospace;overflow:auto">${sel.aiContext.code.slice(0, 200)}${sel.aiContext.code.length > 200 ? '...' : ''}</div>` : ''}${sel.aiContext.failingTest ? html`<p class="xsmall"><strong>Test không đạt:</strong> ${sel.aiContext.failingTest}</p>` : ''}</div>` : ''}
        ${sel.messages.map((m) => { const mu = m.from === 'lecturer' ? me() : u; return html`<div class="${m.from === 'lecturer' ? 'tc-reply' : ''} stack-1"><span class="row xsmall"><strong>${mu.name}</strong>${m.from === 'lecturer' ? html`<span class="badge badge-accent">Giảng viên</span>` : ''}<span class="muted">${fmt.relative(m.at)}</span></span><p class="small">${m.text}</p></div>`; })}
        <form class="stack-2 field ${replyErr ? 'is-invalid' : ''}" data-submit="tc-conversation-reply" data-id="${sel.id}" novalidate><label for="reply">Trả lời ${u.name}</label><textarea id="reply" name="text" rows="4"></textarea>
          ${replyErr ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${replyErr}</span></p>` : ''}
          <div class="row"><button class="btn btn-primary" type="submit" style="justify-self:start">${icon('send', { cls: 'icon-sm' })} Gửi trả lời</button>
            ${sel.status === 'resolved' ? html`<button type="button" class="btn btn-secondary btn-sm" data-action="tc-conversation-reopen" data-id="${sel.id}">Mở lại</button>` : html`<button type="button" class="btn btn-secondary btn-sm" data-action="tc-conversation-resolve" data-id="${sel.id}">Đánh dấu đã giải quyết</button>`}</div></form>
      </div></section>`;
    } else {
      const c = Codi.course(sel.courseId); const l = Codi.lesson(c, sel.lessonId); const u = Codi.user(sel.userId);
      detail = html`<section class="card"><div class="card-body stack-4">
        <div class="stack-1"><span class="xsmall muted">${c.title} › ${l ? l.title : ''}</span><div class="row">${ui.avatar(u, 'sm')}<strong class="small">${u.name}</strong><span class="xsmall muted">${fmt.relative(sel.createdAt)}</span><span class="badge ${sel.status === 'answered' ? 'badge-success' : 'badge-warn'}" style="margin-left:auto">${sel.status === 'answered' ? 'Đã trả lời' : 'Chưa trả lời'}</span></div></div>
        <p>${sel.text}</p>
        ${sel.replies.map((r) => { const ru = Codi.user(r.userId) || { name: '' }; return html`<div class="tc-reply stack-1"><span class="row xsmall"><strong>${ru.name}</strong>${r.isLecturer ? html`<span class="badge badge-accent">Giảng viên</span>` : ''}<span class="muted">${fmt.relative(r.at)}</span></span><p class="small">${r.text}</p></div>`; })}
        <form class="stack-2 field ${replyErr ? 'is-invalid' : ''}" data-submit="tc-reply" data-id="${sel.id}" novalidate><label for="reply">Trả lời ${u.name}</label><textarea id="reply" name="text" rows="4"></textarea>
          ${replyErr ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${replyErr}</span></p>` : html`<span class="field-help">Câu trả lời hiển thị công khai cho học viên của bài học này.</span>`}
          <button class="btn btn-primary" type="submit" style="justify-self:start">${icon('send', { cls: 'icon-sm' })} Gửi trả lời</button></form>
      </div></section>`;
    }
    return shell('/teach/questions', html`
      <div class="page-header"><div><h1>Hỏi đáp</h1><p class="muted">${view === 'conversations' ? 'Cuộc hội thoại từ AI trợ lý.' : 'Câu hỏi của học viên theo từng bài học.'}</p></div></div>
      ${view === 'questions' ? html`<div class="tabs" role="tablist">${[['unanswered', 'Chưa trả lời'], ['answered', 'Đã trả lời']].map(([k, l]) => html`<a class="tab" role="tab" aria-selected="${status === k}" href="#/teach/questions?status=${k}&view=questions">${l} <span class="count ${k === 'unanswered' && allQuestions.filter((x) => x.status === k).length ? 'count-accent' : ''}">${allQuestions.filter((x) => x.status === k).length}</span></a>`)}</div>`
        : html`<div class="tabs" role="tablist"><a class="tab" role="tab" aria-selected="true" href="#/teach/questions?view=conversations">Từ AI trợ lý <span class="count">${aiConversations.length}</span></a></div>`}
      <div class="row" style="gap:8px;margin-bottom:16px"><button aria-pressed="${view === 'questions'}" class="btn btn-ghost" data-go="/teach/questions?view=questions">Câu hỏi từ học viên (${allQuestions.length})</button>
        <button aria-pressed="${view === 'conversations'}" class="btn btn-ghost" data-go="/teach/questions?view=conversations">Cuộc hội thoại AI (${aiConversations.length})</button></div>
      <div class="split-view"><div class="split-list">${(view === 'conversations' ? conversationList : questionList).length ? (view === 'conversations'
        ? conversationList.map((x) => { const c = Codi.course(x.courseId); const u = Codi.user(x.learnerId); return html`<a class="split-list-item" href="#/teach/questions?view=conversations&id=${x.id}" aria-current="${sel && sel.id === x.id}">
          <span class="xsmall muted od-truncate">${c.title}${x.lessonId ? ' › ' + ((Codi.lesson(c, x.lessonId) || {}).title || '') : ''}</span><span class="small od-clamp-2">${x.aiContext?.summary || '—'}</span><span class="xsmall muted">${u.name} · ${fmt.relative(x.createdAt)}</span></a>`; })
        : questionList.map((x) => { const c = Codi.course(x.courseId); const l = Codi.lesson(c, x.lessonId); return html`<a class="split-list-item" href="#/teach/questions?status=${status}&id=${x.id}&view=questions" aria-current="${sel && sel.id === x.id}">
          <span class="xsmall muted od-truncate">${c.title} › ${l ? l.title : ''}</span><span class="small od-clamp-2">${x.text}</span><span class="xsmall muted">${(Codi.user(x.userId) || {}).name} · ${fmt.relative(x.createdAt)}</span></a>`; }))
        : html`<p class="small muted" style="padding:16px">${view === 'conversations' ? 'Không có cuộc hội thoại' : 'Không có câu hỏi'}.</p>`}</div>
        <div class="split-detail">${detail}</div></div>
    `);
  }, { title: 'Hỏi đáp', role: 'lecturer' });
  Codi.action('tc-conversation-reply', (form, e, v) => {
    const text = (v.text || '').trim();
    if (text.length < 5) { replyErr = 'Câu trả lời cần ít nhất 5 ký tự.'; Codi.rerender(); return; }
    replyErr = null;
    const db = Codi.db();
    if (!db.conversations) db.conversations = [];
    const conv = db.conversations.find((x) => x.id === form.dataset.id);
    if (!conv) return;
    conv.messages.push({ from: 'lecturer', text, at: new Date().toISOString() });
    const u = Codi.user(conv.learnerId);
    Codi.notify(conv.learnerId, { title: 'Có trả lời từ giảng viên', body: `${me().name} đã trả lời cuộc hội thoại của bạn.`, link: `/learn/${conv.courseId}${conv.lessonId ? '/' + conv.lessonId : ''}` });
    persist(false); ui.toast('Đã gửi câu trả lời.', { type: 'success' });
    Codi.go('/teach/questions?view=conversations&id=' + conv.id);
  });
  Codi.action('tc-conversation-resolve', (btn) => {
    const db = Codi.db();
    if (!db.conversations) return;
    const conv = db.conversations.find((x) => x.id === btn.dataset.id);
    if (!conv) return;
    conv.status = 'resolved';
    persist(false); ui.toast('Đã đánh dấu cuộc hội thoại đã giải quyết.', { type: 'success' });
    Codi.rerender();
  });
  Codi.action('tc-conversation-reopen', (btn) => {
    const db = Codi.db();
    if (!db.conversations) return;
    const conv = db.conversations.find((x) => x.id === btn.dataset.id);
    if (!conv) return;
    conv.status = 'open';
    persist(false); ui.toast('Đã mở lại cuộc hội thoại.', { type: 'success' });
    Codi.rerender();
  });

  Codi.action('tc-reply', (form, e, v) => {
    const text = (v.text || '').trim();
    if (text.length < 5) { replyErr = 'Câu trả lời cần ít nhất 5 ký tự.'; Codi.rerender(); return; }
    replyErr = null;
    const qn = Codi.db().questions.find((x) => x.id === form.dataset.id);
    qn.replies.push({ userId: me().id, isLecturer: true, text, at: new Date().toISOString() }); qn.status = 'answered';
    Codi.notify(qn.userId, { title: 'Câu hỏi đã có trả lời', body: `${me().name} đã trả lời câu hỏi của bạn.`, link: `/learn/${qn.courseId}/${qn.lessonId}` });
    persist(false); ui.toast('Đã gửi câu trả lời.', { type: 'success' });
    Codi.go('/teach/questions?status=answered&id=' + qn.id);
  });

  // ───────────────────────── S28 reviews ─────────────────────────
  Codi.route('/teach/reviews', (p, q) => {
    const filter = q.filter === 'unreplied' ? 'unreplied' : 'all';
    const all = byCourse(Codi.db().reviews).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const list = all.filter((r) => filter === 'all' || !r.reply);
    return shell('/teach/reviews', html`
      <div class="page-header"><div><h1>Đánh giá</h1><p class="muted">Phản hồi của bạn hiển thị công khai dưới đánh giá trên trang khoá học.</p></div></div>
      <div class="segmented" role="group" aria-label="Lọc đánh giá" style="margin-bottom:16px"><button aria-pressed="${filter === 'all'}" data-go="/teach/reviews">Tất cả (${all.length})</button><button aria-pressed="${filter === 'unreplied'}" data-go="/teach/reviews?filter=unreplied">Chưa phản hồi (${all.filter((r) => !r.reply).length})</button></div>
      ${list.length ? html`<ul class="list stack-3">${list.map((r) => { const u = Codi.user(r.userId) || { name: 'Học viên' }; const c = Codi.course(r.courseId); return html`<li class="card"><div class="card-body stack-2">
        <div class="row">${ui.avatar(u, 'sm')}<strong class="small">${u.name}</strong>${ui.stars(r.stars)}<span class="xsmall muted">${fmt.date(r.createdAt)} · ${c.title}</span></div>
        ${r.text ? html`<p>${r.text}</p>` : html`<p class="small muted">Không có nhận xét, chỉ chấm sao.</p>`}
        ${r.reply ? html`<div class="panel stack-1"><span class="row xsmall"><strong>Phản hồi của bạn</strong><span class="badge badge-success">Đã phản hồi</span><span class="muted">${fmt.date(r.reply.at)}</span></span><p class="small">${r.reply.text}</p>
          <div class="row"><button class="btn btn-ghost btn-sm" data-action="tc-review-reply" data-id="${r.id}">Sửa</button><button class="btn btn-ghost btn-sm" data-action="tc-review-del" data-id="${r.id}">Xoá phản hồi</button></div></div>`
          : html`<button class="btn btn-secondary btn-sm" style="justify-self:start" data-action="tc-review-reply" data-id="${r.id}">${icon('message-circle', { cls: 'icon-sm' })} Phản hồi</button>`}
      </div></li>`; })}</ul>` : html`<div class="card">${ui.empty({ icon: 'star', title: filter === 'unreplied' ? 'Bạn đã phản hồi mọi đánh giá' : 'Chưa có đánh giá nào' })}</div>`}
    `);
  }, { title: 'Đánh giá', role: 'lecturer' });
  Codi.action('tc-review-reply', (el) => {
    const r = Codi.db().reviews.find((x) => x.id === el.dataset.id); const u = Codi.user(r.userId) || { name: 'Học viên' };
    ui.sheet({
      title: r.reply ? 'Sửa phản hồi' : 'Phản hồi đánh giá',
      body: html`<div class="stack-4"><div class="panel stack-1"><span class="row small"><strong>${u.name}</strong>${ui.stars(r.stars)}</span><p class="small">${r.text || 'Không có nhận xét.'}</p></div>
        <div class="field"><label for="rv-reply">Phản hồi công khai</label><textarea id="rv-reply" rows="5">${r.reply ? r.reply.text : ''}</textarea><span class="field-help">Ngắn gọn, cảm ơn và giải đáp góp ý (nếu có).</span><p class="field-error" data-err hidden>${icon('alert-circle', { cls: 'icon-sm' })}<span>Nhập nội dung phản hồi.</span></p></div></div>`,
      footer: html`<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn btn-primary" data-save>Đăng phản hồi</button>`,
      onMount(h) {
        h.el.querySelector('[data-save]').addEventListener('click', () => {
          const t = h.el.querySelector('#rv-reply').value.trim();
          if (!t) { h.el.querySelector('[data-err]').hidden = false; return; }
          r.reply = { text: t, at: new Date().toISOString() };
          h.close(); persist(); ui.toast('Đã đăng phản hồi công khai.', { type: 'success' });
        });
      },
    });
  });
  Codi.action('tc-review-del', async (el) => {
    const r = Codi.db().reviews.find((x) => x.id === el.dataset.id);
    const res = await ui.confirm({ title: 'Xoá phản hồi?', body: 'Phản hồi công khai sẽ bị gỡ khỏi trang khoá học. Đánh giá của học viên vẫn giữ nguyên.', reversible: 'Bạn có thể viết phản hồi mới bất cứ lúc nào.', confirmLabel: 'Xoá phản hồi', danger: true });
    if (!res.ok) return; r.reply = null; persist(); ui.toast('Đã xoá phản hồi.');
  });

  // ───────────────────────── S29 learner progress ─────────────────────────
  function progressRows(c) {
    const total = ls(c).length;
    const enrolled = Codi.db().enrolments.filter((e) => e.courseId === c.id).map((e) => e.userId);
    return enrolled.map((uid) => {
      const p = Codi.db().learnerProgress.find((x) => x.userId === uid && x.courseId === c.id) || { completed: [], quizScores: {}, answers: {}, lastActive: null };
      const scores = Object.values(p.quizScores);
      const hints = (Codi.db().hintUsage || []).filter((h) => h.userId === uid && myCourses().some((c) => c.id === h.courseId));
      const hintCount = hints.length;
      const maxHintLevel = Math.max(...hints.map((h) => h.level || 0), 0);
      return { u: Codi.user(uid), p, pct: total ? Math.round((p.completed.length / total) * 100) : 0, avg: scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null, hintCount, maxHintLevel };
    });
  }
  Codi.route('/teach/progress', () => {
    const courses = myCourses().filter((c) => ['published', 'hidden'].includes(c.status));
    return shell('/teach/progress', html`
      <div class="page-header"><div><h1>Tiến độ học viên</h1><p class="muted">Chọn khoá học để xem tiến độ và kết quả quiz.</p></div></div>
      ${courses.length ? html`<div class="grid-2">${courses.map((c) => { const rows = progressRows(c); return html`<a class="card card-link" href="#/teach/progress/${c.id}"><div class="card-body stack-2"><strong>${c.title}</strong><span class="small muted">${rows.length} học viên · hoàn thành TB ${rows.length ? Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length) : 0}%</span>${ui.courseStatus(c.status)}</div></a>`; })}</div>`
        : html`<div class="card">${ui.empty({ icon: 'bar-chart', title: 'Chưa có khoá học đang bán', body: 'Tiến độ học viên xuất hiện khi khoá học được xuất bản và có người học.' })}</div>`}
    `);
  }, { title: 'Tiến độ học viên', role: 'lecturer' });

  Codi.route('/teach/progress/:courseId', (p, q) => {
    const c = Codi.course(p.courseId);
    if (!isMine(c)) return notMine();
    const hasCode = ls(c).some((l) => l.code);
    const tab = q.tab === 'quiz' ? 'quiz' : q.tab === 'code' && hasCode ? 'code' : 'learners';
    const rows = progressRows(c);
    const avgPct = rows.length ? Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length) : 0;
    const quizAvgs = rows.filter((r) => r.avg !== null);
    const avgQuiz = quizAvgs.length ? Math.round(quizAvgs.reduce((s, r) => s + r.avg, 0) / quizAvgs.length) : null;
    const questions = ls(c).filter((l) => l.quiz).flatMap((l) => l.quiz.questions.map((qq) => ({ l, qq })));
    const qStats = questions.map(({ l, qq }) => { const ans = rows.map((r) => r.p.answers[qq.id]).filter((x) => x !== undefined); const pct = ans.length ? Math.round((ans.filter(Boolean).length / ans.length) * 100) : null; return { l, qq, n: ans.length, pct }; });
    return shell('/teach/progress', html`
      <div class="stack-2" style="margin-bottom:16px"><a class="small" href="#/teach/progress">${icon('arrow-left', { cls: 'icon-sm' })} Tất cả khoá học</a><h1>${c.title}</h1></div>
      <div class="grid-3" style="margin-bottom:24px">
        <div class="stat-tile"><span class="stat-value">${rows.length}</span><span class="stat-label">Học viên</span></div>
        <div class="stat-tile"><span class="stat-value">${avgPct}%</span><span class="stat-label">Tỉ lệ hoàn thành trung bình</span></div>
        <div class="stat-tile"><span class="stat-value">${avgQuiz === null ? '—' : avgQuiz + '%'}</span><span class="stat-label">Điểm quiz trung bình</span></div>
      </div>
      <div class="tabs" role="tablist"><a class="tab" role="tab" aria-selected="${tab === 'learners'}" href="#/teach/progress/${c.id}">Học viên</a><a class="tab" role="tab" aria-selected="${tab === 'quiz'}" href="#/teach/progress/${c.id}?tab=quiz">Kết quả quiz</a>${hasCode ? html`<a class="tab" role="tab" aria-selected="${tab === 'code'}" href="#/teach/progress/${c.id}?tab=code">Bài code</a>` : ''}</div>
      ${!rows.length ? html`<div class="card">${ui.empty({ icon: 'users', title: 'Chưa có học viên', body: 'Khi có người mua khoá học, tiến độ của họ sẽ hiện ở đây.' })}</div>`
      : tab === 'code' ? Codi.teachCode.analytics(c)
      : tab === 'learners' ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Học viên</th><th>Tiến độ</th><th class="num">Bài hoàn thành</th><th class="num">Quiz TB</th><th class="num">Gợi ý dùng</th><th>Hoạt động gần nhất</th><th></th></tr></thead><tbody>
          ${rows.map((r) => html`<tr><td><div class="row">${ui.avatar(r.u, 'sm')}<span>${r.u.name}</span></div></td><td style="min-width:140px"><div class="row" style="gap:8px">${ui.progress(r.pct)}<span class="xsmall">${r.pct}%</span></div></td><td class="num">${r.p.completed.length}/${ls(c).length}</td><td class="num">${r.avg === null ? '—' : r.avg + '%'}</td><td class="num">${r.hintCount > 0 ? `${r.hintCount} (L${r.maxHintLevel})` : '0'}</td><td class="od-nowrap">${r.p.lastActive ? fmt.date(r.p.lastActive) : '—'}</td><td><button class="btn btn-ghost btn-sm" data-action="tc-learner" data-course="${c.id}" data-user="${r.u.id}">Xem chi tiết</button></td></tr>`)}
        </tbody></table></div>`
      : html`<p class="small muted" style="margin-bottom:12px">Câu có tỉ lệ đúng dưới 60% được đánh dấu để bạn xem lại cách giảng hoặc đề bài.</p>
        <div class="table-wrap"><table class="table"><thead><tr><th>Bài học</th><th>Câu hỏi</th><th class="num">Lượt trả lời</th><th class="num">Tỉ lệ đúng</th><th></th></tr></thead><tbody>
          ${qStats.map((s) => html`<tr><td class="small">${s.l.title}</td><td class="small">${s.qq.text}</td><td class="num">${s.n}</td><td class="num">${s.pct === null ? '—' : s.pct + '%'}</td><td>${s.pct !== null && s.pct < 60 ? html`<span class="badge badge-warn">${icon('alert-triangle')}Cần xem lại</span>` : ''}</td></tr>`)}
        </tbody></table></div>`}
    `);
  }, { title: 'Tiến độ học viên', role: 'lecturer' });
  Codi.action('tc-learner', (el) => {
    const c = Codi.course(el.dataset.course); const r = progressRows(c).find((x) => x.u.id === el.dataset.user);
    const courseHints = (Codi.db().hintUsage || []).filter((h) => h.userId === r.u.id && myCourses().some((c) => c.id === h.courseId));
    ui.sheet({ title: r.u.name, body: html`<div class="stack-4">
      <div class="row">${ui.ring(r.pct, { size: 88 })}<div class="stack-1"><strong>${r.p.completed.length}/${ls(c).length} bài hoàn thành</strong><span class="small muted">Quiz trung bình: ${r.avg === null ? 'chưa có' : r.avg + '%'}</span></div></div>
      ${courseHints.length ? html`<div class="panel stack-1"><span class="small strong">Sử dụng gợi ý</span><span class="xsmall muted">${courseHints.length} lần, cấp độ cao nhất: ${Math.max(...courseHints.map((h) => h.level || 0), 0)}</span></div>` : ''}
      <ul class="list">${ls(c).map((l) => { const done = r.p.completed.includes(l.id); const sc = r.p.quizScores[l.id]; const sub = Codi.db().submissions.find((s) => s.userId === r.u.id && s.lessonId === l.id);
        return html`<li class="list-row" style="padding-inline:0">${icon(done ? 'check-circle' : 'circle', { cls: done ? 'text-success' : '' })}<span class="list-main"><span class="small">${l.title}</span><span class="xsmall muted">${done ? 'Hoàn thành' : 'Chưa hoàn thành'}${sc !== undefined ? ` · Quiz ${sc}%` : ''}${sub ? ` · Bài tập: ${sub.status === 'graded' ? sub.score + '/' + sub.maxScore : 'chờ chấm'}` : ''}</span></span></li>`; })}</ul></div>` });
  });

  // ───────────────────────── snippets management ─────────────────────────
  let snippetErr = {};
  let editingSnippet = null;
  Codi.route('/teach/snippets', (p, q) => {
    const snippets = Codi.db().feedbackSnippets || [];
    const list = snippets.filter((s) => s.lecturerId === me().id);
    return shell('/teach/progress', html`
      <div class="page-header"><div><h1>Mẫu nhận xét</h1><p class="muted">Tạo và quản lý mẫu nhận xét để tái sử dụng khi chấm bài.</p></div>
        <button class="btn btn-primary" data-action="tc-snippet-create">${icon('plus')} Tạo mẫu</button></div>
      ${list.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Tiêu đề</th><th>Nội dung</th><th></th></tr></thead><tbody>
        ${list.map((s) => html`<tr><td><strong class="small">${s.title}</strong></td><td class="small">${s.text.slice(0, 80)}${s.text.length > 80 ? '...' : ''}</td><td>
          <button class="btn btn-ghost btn-sm" data-action="tc-snippet-edit" data-id="${s.id}">Sửa</button>
          <button class="btn btn-ghost btn-sm" data-action="tc-snippet-delete" data-id="${s.id}">Xoá</button></td></tr>`)}</tbody></table></div>`
        : html`<div class="card">${ui.empty({ icon: 'list', title: 'Chưa có mẫu nào', body: 'Tạo mẫu nhận xét để tiết kiệm thời gian chấm bài.' })}</div>`}
    `);
  }, { title: 'Mẫu nhận xét', role: 'lecturer' });

  Codi.action('tc-snippet-create', () => {
    editingSnippet = { title: '', text: '' };
    ui.sheet({
      title: 'Tạo mẫu nhận xét',
      body: html`<form class="stack-4" data-submit="tc-snippet-save" novalidate>
        <div class="field"><label for="sn-title">Tiêu đề</label><input id="sn-title" name="title" required></div>
        <div class="field"><label for="sn-text">Nội dung nhận xét</label><textarea id="sn-text" name="text" rows="6" required placeholder="Dùng {ten_hoc_vien} và {diem} để chèn tên và điểm"></textarea>
          <span class="xsmall muted">Gợi ý: dùng {ten_hoc_vien} cho tên học viên, {diem} cho điểm</span></div>
        <div class="row"><button class="btn btn-primary" type="submit">Lưu mẫu</button><button class="btn btn-ghost" type="button" data-close>Huỷ</button></div>
      </form>`,
      onMount(h) {
        const form = h.el.querySelector('form');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const title = form.querySelector('#sn-title').value.trim();
          const text = form.querySelector('#sn-text').value.trim();
          if (!title || !text) { ui.toast('Cần nhập tiêu đề và nội dung.', { type: 'danger' }); return; }
          const db = Codi.db();
          if (!db.feedbackSnippets) db.feedbackSnippets = [];
          db.feedbackSnippets.push({ id: Codi.uid('snip'), lecturerId: me().id, title, text });
          editingSnippet = null;
          h.close();
          persist(false);
          ui.toast('Đã tạo mẫu nhận xét.', { type: 'success' });
          Codi.rerender();
        });
      }
    });
  });

  Codi.action('tc-snippet-edit', (btn) => {
    const id = btn.dataset.id;
    const snippets = Codi.db().feedbackSnippets || [];
    const s = snippets.find((x) => x.id === id);
    if (!s) return;
    editingSnippet = { ...s };
    ui.sheet({
      title: 'Sửa mẫu nhận xét',
      body: html`<form class="stack-4" data-submit="tc-snippet-save-edit" data-id="${id}" novalidate>
        <div class="field"><label for="sn-title">Tiêu đề</label><input id="sn-title" name="title" value="${s.title}" required></div>
        <div class="field"><label for="sn-text">Nội dung nhận xét</label><textarea id="sn-text" name="text" rows="6" required>${s.text}</textarea></div>
        <div class="row"><button class="btn btn-primary" type="submit">Lưu thay đổi</button><button class="btn btn-ghost" type="button" data-close>Huỷ</button></div>
      </form>`,
      onMount(h) {
        const form = h.el.querySelector('form');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const title = form.querySelector('#sn-title').value.trim();
          const text = form.querySelector('#sn-text').value.trim();
          if (!title || !text) { ui.toast('Cần nhập tiêu đề và nội dung.', { type: 'danger' }); return; }
          const snippets = Codi.db().feedbackSnippets || [];
          const snippet = snippets.find((x) => x.id === id);
          if (snippet) { snippet.title = title; snippet.text = text; }
          editingSnippet = null;
          h.close();
          persist(false);
          ui.toast('Đã cập nhật mẫu nhận xét.', { type: 'success' });
          Codi.rerender();
        });
      }
    });
  });

  Codi.action('tc-snippet-delete', async (btn) => {
    const id = btn.dataset.id;
    const snippets = Codi.db().feedbackSnippets || [];
    const s = snippets.find((x) => x.id === id);
    if (!s) return;
    const r = await ui.confirm({ title: 'Xoá mẫu nhận xét?', body: `"${s.title}" sẽ bị xoá vĩnh viễn.`, reversible: false, confirmLabel: 'Xoá', danger: true });
    if (!r.ok) return;
    const idx = snippets.findIndex((x) => x.id === id);
    snippets.splice(idx, 1);
    persist(false);
    ui.toast('Đã xoá mẫu nhận xét.', { type: 'success' });
    Codi.rerender();
  });

  // Shared with js/lecturer-coding.js (code exercise editor + coding analytics).
  Codi.teach = { shell, isMine, notMine, findLesson, contentChanged, persist };

  // ───────────────────────── scoped styles ─────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .tc-h { font-size: var(--text-lg); }
    .tc-add { position: relative; }
    .tc-add > summary { list-style: none; }
    .tc-add > summary::-webkit-details-marker { display: none; }
    .tc-chapter .card-header { gap: var(--space-2); flex-wrap: wrap; }
    .tc-lessons { padding: var(--space-2); }
    .tc-lesson { display: flex; gap: var(--space-2); align-items: center; padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); flex-wrap: wrap; }
    .tc-lesson:hover { background: var(--canvas); }
    .tc-grip { cursor: grab; color: var(--faint); display: inline-grid; }
    .tc-type { width: 28px; height: 28px; border-radius: var(--radius-sm); background: var(--subtle); display: grid; place-items: center; color: var(--muted); flex: none; }
    .tc-row-actions { display: flex; gap: 2px; flex-wrap: wrap; }
    .tc-empty-drop { padding: var(--space-4); border: 1px dashed var(--border-strong); border-radius: var(--radius-sm); text-align: center; }
    .is-dragging { opacity: .5; }
    .is-drop-target { outline: 2px dashed var(--accent); outline-offset: 2px; }
    .tc-danger { border-color: #fecaca; }
    .tc-declined { opacity: .6; }
    .tc-order { display: grid; gap: var(--space-1); }
    .tc-qb { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--space-4); align-items: start; }
    .tc-qb-side { position: sticky; top: calc(var(--header-h) + var(--space-4)); }
    @media (max-width: 1024px) { .tc-qb { grid-template-columns: minmax(0, 1fr); } .tc-qb-side { position: static; } }
    .tc-opt { display: flex; gap: var(--space-2); align-items: center; padding: var(--space-1); border-radius: var(--radius-sm); }
    .tc-opt.is-correct { background: var(--success-soft); }
    .tc-correct { display: inline-flex; align-items: center; gap: 6px; min-width: 64px; min-height: 44px; font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
    .tc-correct input { accent-color: var(--success); width: 18px; height: 18px; }
    .tc-probs { padding-left: 18px; }
    .tc-savebar { position: sticky; bottom: 0; background: var(--surface); padding: var(--space-3) 0; border-top: 1px solid var(--border); }
    .tc-split { grid-template-columns: minmax(240px, 320px) minmax(0, 1fr); }
    .tc-grade { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--space-4); align-items: start; }
    @media (max-width: 1280px) { .tc-grade { grid-template-columns: minmax(0, 1fr); } }
    .tc-reply { margin-left: var(--space-4); padding-left: var(--space-3); border-left: 2px solid var(--border); }
  `;
  document.head.appendChild(style);
})();
