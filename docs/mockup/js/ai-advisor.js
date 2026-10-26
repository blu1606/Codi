/**
 * Codi AI Advisor — /ai route personalized landing, guided intake, and course discovery chat.
 * Redesign (B4, Flow L13, S17): personalised landing for signed-in learners, guest variant,
 * guided intake chips, structured answers (course cards, comparison table, suggested order),
 * per-message feedback, thinking/error/ratelimit states.
 *
 * Intake answers stored in Codi.ensure('advisorIntake') for reuse by onboarding (Flow L4).
 */
(function () {
  'use strict';
  const { html, icon, fmt, ui, esc, raw } = Codi;

  // ───────────────────────── state & helpers ─────────────────────────
  const uid = () => Codi.state.currentUserId;
  const isGuest = () => !uid();
  const store = () => Codi.ensure('advisorIntake', () => ({ goal: null, level: null, hoursPerWeek: null, chat: { messages: [], busy: false } }));
  const save = (render) => Codi.set(() => {}, { render: render !== false });

  function ownedCourses() {
    if (!uid()) return [];
    return Codi.db().enrolments.filter((e) => e.userId === uid()).map((e) => Codi.course(e.courseId)).filter(Boolean);
  }

  function courseOwnedBy(userId, courseId) {
    return !!Codi.db().enrolments.find((e) => e.userId === userId && e.courseId === courseId);
  }

  function courseCTA(c) {
    const own = Codi.ownership(c.id);
    if (own === 'owned') return html`<a class="btn btn-primary btn-sm" href="#/learn/${c.id}">Tiếp tục học</a>`;
    if (own === 'in-cart') return html`<a class="btn btn-secondary btn-sm" href="#/cart">Đã có trong giỏ · Xem giỏ hàng</a>`;
    if (own === 'pending-payment') return html`<a class="btn btn-secondary btn-sm" href="#/cart">Tiếp tục thanh toán</a>`;
    if (!c.price) return html`<button class="btn btn-primary btn-sm" data-action="advisor-enroll-free" data-id="${c.id}">Đăng ký miễn phí</button>`;
    return html`<button class="btn btn-primary btn-sm" data-action="advisor-add-cart" data-id="${c.id}">Thêm vào giỏ</button>`;
  }

  // ───────────────────────── page ─────────────────────────
  // Two layouts on one route. Empty: heading → large composer (visible on first screen) → 4 suggestion
  // cards → guest sign-in line. Conversation: one 720px column, compact header, "Codi đang hiểu về bạn"
  // chip row, the thread, and a composer pinned to the bottom of the viewport.
  function suggestions(user, currentCourse) {
    // The GitHub card triggers an action (connect/view analysis) instead of sending a chat prompt.
    const ghConnected = user && Codi.github && Codi.github.isConnected();
    const ghCard = user ? (ghConnected
      ? { icon: 'github', title: 'Xem lại phân tích GitHub của mình', desc: 'Codi gợi ý khoá dựa trên repo và ngôn ngữ của bạn', action: 'advisor-github-view' }
      : { icon: 'github', title: 'Phân tích GitHub của mình', desc: 'Kết nối GitHub để Codi gợi ý khoá sát với kỹ năng', action: 'advisor-github-connect' }) : null;
    const base = [
      currentCourse
        ? { icon: 'route', title: `Học gì sau “${currentCourse.title}”?`, desc: 'Gợi ý khoá tiếp theo dựa trên khoá bạn đang học', prompt: `Sau ${currentCourse.title} nên học gì tiếp?` }
        : { icon: 'book-open', title: 'Mới bắt đầu học lập trình', desc: 'Nên học ngôn ngữ và khoá nào trước', prompt: 'Mình mới bắt đầu học lập trình, nên học gì trước?' },
      { icon: 'search', title: 'Tìm khoá cho mục tiêu', desc: 'Làm dự án, đổi nghề hay chuẩn bị phỏng vấn', prompt: 'Dựa vào mục tiêu của tôi, nên học khoá nào?' },
      { icon: 'list', title: 'So sánh các khoá phù hợp', desc: 'Trình độ, số bài, học phí đặt cạnh nhau', prompt: 'So sánh các khoá học phù hợp với tôi' },
      user
        ? { icon: 'clock', title: 'Mình bị chậm tiến độ', desc: 'Cách lấy lại nhịp học mỗi tuần', prompt: 'Mình bị chậm tiến độ, nên làm gì?' }
        : { icon: 'git-branch', title: 'Lên lộ trình học', desc: 'Thứ tự các khoá để đi từ cơ bản đến dự án', prompt: 'Lộ trình học để trở thành fullstack developer theo thứ tự nào?' },
    ];
    if (ghCard) { base.splice(1, 0, ghCard); base.length = 4; }
    return base;
  }

  function composer(busy, big) {
    return html`<form class="ai-composer ${big ? 'is-big' : 'is-sticky'}" data-submit="advisor-send">
      <label class="sr-only" for="advisor-q">Câu hỏi cho Codi</label>
      <input id="advisor-q" type="text" name="text" class="ai-composer-input" placeholder="${big ? 'Ví dụ: Mình muốn làm web, nên học khoá nào trước?' : 'Hỏi tiếp…'}" autocomplete="off" ${busy ? raw('disabled') : ''}>
      <button type="submit" class="btn btn-primary ai-composer-send" ${busy ? raw('disabled') : ''} aria-label="Gửi câu hỏi">${icon('send', { cls: 'icon-sm' })}${big ? html`<span>Hỏi Codi</span>` : ''}</button>
    </form>`;
  }

  function landingPage(query) {
    const intake = store();
    const user = Codi.currentUser();
    const owned = ownedCourses();
    const currentCourse = owned.length ? owned[0] : null;
    const { messages, busy } = intake.chat;

    Codi.onMount(() => {
      if (query.prompt && !messages.length) { setTimeout(() => askAI(query.prompt), 0); return; }
      const q = document.getElementById('advisor-q');
      if (query.topic && q && !q.value) q.value = `Mình muốn tìm hiểu về ${query.topic}`;
      if (messages.length) { const last = document.querySelector('.ai-thread > :last-child'); if (last) last.scrollIntoView({ block: 'end' }); }
    });

    if (!messages.length) {
      const sub = user && currentCourse
        ? `Bạn đang học ${currentCourse.title} (${Codi.courseProgress(currentCourse.id).done}/${Codi.courseProgress(currentCourse.id).total} bài). Hỏi Codi nên học gì tiếp, hoặc so sánh các khoá trước khi mua.`
        : 'Kể mục tiêu của bạn, Codi gợi ý khoá học phù hợp, so sánh các lựa chọn và thứ tự nên học.';
      return html`<div class="page ai-page is-empty"><div class="ai-col">
        <header class="ai-hero"><h1>Tư vấn khoá học cùng AI</h1><p>${sub}</p></header>
        ${composer(busy, true)}
        ${!user ? html`<p class="ai-guest-line">Bạn đang dùng với tư cách khách. <button type="button" class="btn-link" data-action="advisor-signin">Đăng nhập</button> để Codi gợi ý theo tiến độ học của bạn.</p>` : ''}
        ${intakeRow()}
        <section aria-labelledby="ai-suggest-title" class="ai-suggest-wrap">
          <h2 id="ai-suggest-title" class="ai-suggest-title">Thử hỏi</h2>
          <ul class="ai-suggest">${suggestions(user, currentCourse).map((s) => html`<li><button type="button" class="ai-suggest-card" ${s.action ? Codi.raw(`data-action="${s.action}"`) : Codi.raw(`data-action="advisor-prompt" data-prompt="${s.prompt}"`)}>
            ${icon(s.icon, { cls: 'icon-sm' })}<span class="ai-suggest-text"><span class="ai-suggest-name">${s.title}</span><span class="ai-suggest-desc">${s.desc}</span></span></button></li>`)}</ul>
        </section>
        <p class="ai-disclaimer">AI có thể trả lời sai. Hãy xem kỹ trang chi tiết khoá học trước khi mua.</p>
      </div></div>`;
    }

    return html`<div class="page ai-page is-chat"><div class="ai-col">
      <header class="ai-chat-head">
        <h1>Tư vấn khoá học cùng AI</h1>
        <button type="button" class="btn btn-secondary btn-sm" data-action="advisor-new-chat" ${busy ? raw('disabled') : ''}>${icon('plus', { cls: 'icon-sm' })} Cuộc trò chuyện mới</button>
      </header>
      ${intakeRow()}
      <div class="ai-thread" role="log" aria-live="polite" aria-label="Cuộc trò chuyện với Codi">${messages.map((m, i) => renderMessage(m, i))}</div>
      ${composer(busy, false)}
    </div></div>`;
  }

  // "Codi đang hiểu về bạn": one quiet row of removable chips + "Sửa"; hidden until something is known.
  function intakeRow() {
    const intake = store();
    const items = [['goal', intake.goal], ['level', intake.level], ['hours', intake.hoursPerWeek && `${intake.hoursPerWeek}/tuần`]].filter((x) => x[1]);
    if (!items.length) return '';
    return html`<div class="ai-intake" role="group" aria-label="Codi đang hiểu về bạn">
      <span class="ai-intake-label">Codi đang hiểu về bạn</span>
      ${items.map(([k, v]) => html`<span class="ai-chip ai-chip-sm is-static">${v}<button type="button" data-action="advisor-clear-intake" data-field="${k}" aria-label="Bỏ “${v}”">${icon('x', { cls: 'icon-sm' })}</button></span>`)}
      <button type="button" class="btn-link" data-action="advisor-edit-intake">Sửa</button>
    </div>`;
  }

  function renderMessage(m, i) {
    if (m.role === 'user') return html`<div class="msg msg-user">${m.text}</div>`;
    if (m.role === 'error') return ui.alert({ type: 'danger', title: 'Codi tạm thời không phản hồi', body: 'Câu hỏi chưa được trả lời. Bạn có thể thử lại hoặc tự xem danh mục khoá học.', actions: html`<button type="button" class="btn btn-secondary btn-sm" data-action="advisor-retry" data-i="${i}">${icon('rotate-ccw', { cls: 'icon-sm' })} Thử lại</button><a class="btn btn-ghost btn-sm" href="#/courses">Xem danh mục</a>` });
    if (m.role === 'ratelimit') return ui.alert({ type: 'warn', title: 'Bạn đã hỏi quá nhiều trong thời gian ngắn', body: 'Đợi vài phút rồi thử lại.', actions: html`<button type="button" class="btn btn-secondary btn-sm" data-action="advisor-retry" data-i="${i}">${icon('rotate-ccw', { cls: 'icon-sm' })} Thử lại</button>` });
    if (m.role === 'intake-question') {
      return html`<div class="msg msg-ai msg-md"><p>${m.text}</p>
        <div class="ai-chips" role="group" aria-label="${m.text}">${m.options.map((opt) => html`<button type="button" class="ai-chip" data-action="advisor-intake-answer" data-q="${m.key}" data-a="${opt}">${opt}</button>`)}
          ${m.canSkip ? html`<button type="button" class="ai-chip is-quiet" data-action="advisor-intake-skip" data-q="${m.key}">Bỏ qua</button>` : ''}</div></div>`;
    }
    if (m.streaming) return html`<div class="ai-thinking-row" aria-busy="true"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span>Codi đang suy nghĩ…</span><button type="button" class="btn btn-ghost btn-sm" data-action="advisor-stop">${icon('x', { cls: 'icon-sm' })} Dừng</button></div>`;

    const courses = (m.courses || []).map((id) => Codi.course(id)).filter(Boolean);
    return html`<div class="msg msg-ai msg-md">
      ${m.text ? ui.md(m.text) : ''}
      ${m.table ? html`<div class="table-wrap ai-table"><table class="table"><caption class="sr-only">So sánh khoá học</caption>
        <thead><tr>${m.table.headers.map((h) => html`<th scope="col">${h}</th>`)}</tr></thead>
        <tbody>${m.table.rows.map((row) => html`<tr>${row.map((cell, k) => (k === 0 ? html`<th scope="row">${cell}</th>` : html`<td>${cell}</td>`))}</tr>`)}</tbody></table></div>` : ''}
      ${courses.length ? html`<ul class="ai-courses">${courses.map((c, k) => html`<li class="ai-course">
        ${ui.thumb(c, { small: true })}
        <div class="ai-course-main">
          <a class="ai-course-title" href="#/courses/${c.slug}">${c.title}</a>
          <span class="ai-course-meta">${Codi.levelLabel(c.level)} · ${Codi.lessons(c).length} bài · <span class="od-nowrap">${c.price ? fmt.vnd(c.price) : 'Miễn phí'}</span></span>
          ${m.courseReasons && m.courseReasons[c.id] ? html`<span class="ai-course-why">${m.courseReasons[c.id]}</span>` : ''}
        </div>
        <div class="ai-course-cta">${k === 0 && courses.length > 1 ? html`<span class="badge badge-accent">Phù hợp nhất</span>` : ''}${courseCTA(c)}</div>
      </li>`)}</ul>` : ''}
      ${m.order ? html`<ol class="ai-order">${m.order.map((cid) => { const c = Codi.course(cid); return c ? html`<li><a href="#/courses/${c.slug}">${c.title}</a><span class="ai-course-why">${(m.orderReasons && m.orderReasons[cid] || '').replace(/^ — /, '')}</span></li>` : ''; })}</ol>` : ''}
      ${m.stopped ? '' : Codi.aiFeedbackRow('advisor', m, i)}
      ${m.followups && m.followups.length ? html`<div class="ai-chips" role="group" aria-label="Hỏi tiếp">${m.followups.map((t) => html`<button type="button" class="ai-chip" data-action="advisor-prompt" data-prompt="${t}">${t}</button>`)}</div>` : ''}
    </div>`;
  }
  // ───────────────────────── main route ─────────────────────────
  function aiPage(params, query) {
    return landingPage(query);
  }

  // ───────────────────────── asking (simulated) ─────────────────────────
  // Intake (decision: ask only what is missing, every question skippable). The question that triggered
  // the intake is kept in chat.pending and answered as soon as the last intake chip is picked or skipped.
  const INTAKE = [
    { key: 'goal', text: 'Mục tiêu của bạn là gì?', options: ['Làm được dự án', 'Hoàn thành khoá học', 'Chuẩn bị phỏng vấn'] },
    { key: 'level', text: 'Trình độ hiện tại của bạn?', options: ['Mới bắt đầu', 'Có kinh nghiệm cơ bản', 'Trung cấp'] },
    { key: 'hours', text: 'Bạn có thể dành bao nhiêu giờ/tuần để học?', options: ['< 5 giờ', '5-10 giờ', '> 10 giờ'] },
  ];
  const intakeValue = (intake, key) => (key === 'goal' ? intake.goal : key === 'level' ? intake.level : intake.hoursPerWeek);
  const missingIntake = (intake) => INTAKE.filter((q) => !intakeValue(intake, q.key) && !(intake.skipped || []).includes(q.key));
  const catalog = () => Codi.db().courses.filter((c) => c.status === 'published');

  // Builds a structured answer from the real catalog: cards, comparison table or suggested order.
  function respond(prompt) {
    const intake = store();
    const owned = new Set(ownedCourses().map((c) => c.id));
    const beginner = !intake.level || intake.level === 'Mới bắt đầu' || /mới bắt đầu|người mới/i.test(prompt);
    const rank = { Beginner: 0, Intermediate: 1, Advanced: 2 };
    const list = catalog().slice().sort((a, b) => (owned.has(a.id) - owned.has(b.id)) || ((rank[a.level] || 0) - (rank[b.level] || 0)) * (beginner ? 1 : -1) || (b.rating || 0) - (a.rating || 0));
    const pick = list.slice(0, 3);
    const why = (c) => `${Codi.levelLabel(c.level)} · ${c.rating ? c.rating + '★ · ' : ''}${(c.learnersCount || 0).toLocaleString('vi-VN')} học viên`;
    if (/so sánh/i.test(prompt)) {
      const cs = pick.slice(0, 3);
      return {
        text: 'Đây là bảng so sánh các khoá phù hợp nhất với bạn. Cột cuối là gợi ý của Codi.',
        table: { headers: ['Khoá học', 'Trình độ', 'Số bài', 'Học phí', 'Phù hợp khi'], rows: cs.map((c) => [c.title, Codi.levelLabel(c.level), String(Codi.lessons(c).length), c.price ? fmt.vnd(c.price) : 'Miễn phí', (rank[c.level] || 0) === 0 ? 'Bạn mới bắt đầu' : 'Bạn đã nắm nền tảng']) },
        courses: cs.map((c) => c.id), courseReasons: Object.fromEntries(cs.map((c) => [c.id, why(c)])),
        followups: ['Nên học theo thứ tự nào?', 'Khoá nào hợp với 5 giờ/tuần?'],
      };
    }
    if (/thứ tự|lộ trình|tiếp theo|nên học gì tiếp/i.test(prompt)) {
      const order = list.filter((c) => !owned.has(c.id)).sort((a, b) => (rank[a.level] || 0) - (rank[b.level] || 0)).slice(0, 3);
      return {
        text: `Lộ trình gợi ý${intake.hoursPerWeek ? ` với ${intake.hoursPerWeek}/tuần` : ''}: học lần lượt, khoá sau dựa trên kiến thức khoá trước.`,
        order: order.map((c) => c.id), orderReasons: Object.fromEntries(order.map((c, i) => [c.id, i === 0 ? ' — nền tảng, học trước' : ' — dựa trên khoá trước'])),
        followups: ['So sánh các khoá này', 'Mình bị chậm tiến độ, nên làm gì?'],
      };
    }
    if (/chậm tiến độ/i.test(prompt)) {
      return { text: 'Một vài cách lấy lại nhịp:\n- Đặt mục tiêu tuần nhỏ hơn ở **Bàn làm việc**\n- Học 15 phút mỗi ngày thay vì dồn cuối tuần\n- Dùng **Tìm điểm bắt đầu của tôi** để bỏ qua phần đã biết', followups: ['Nên học gì tiếp?'] };
    }
    return {
      text: `Dựa trên ${[intake.goal, intake.level, intake.hoursPerWeek].filter(Boolean).join(', ') || 'câu hỏi của bạn'}, đây là các khoá phù hợp:`,
      courses: pick.map((c) => c.id), courseReasons: Object.fromEntries(pick.map((c) => [c.id, why(c)])),
      followups: ['So sánh các khoá này', 'Nên học theo thứ tự nào?'],
    };
  }

  function askAI(prompt) {
    const intake = store();
    const { messages } = intake.chat;
    if (intake.chat.busy) return;
    if (prompt) messages.push({ role: 'user', text: prompt, at: new Date().toISOString() });
    const missing = missingIntake(intake);
    if (prompt && missing.length) {
      intake.chat.pending = prompt;
      missing.forEach((q) => { if (!messages.some((m) => m.role === 'intake-question' && m.key === q.key)) messages.push(Object.assign({ role: 'intake-question', canSkip: true }, q)); });
      save();
      return;
    }
    const q = prompt || intake.chat.pending; intake.chat.pending = null;
    if (!q) { save(); return; }
    const flag = Codi.state.scenario.aiAssistant;
    if (flag === 'ratelimit') { messages.push({ role: 'ratelimit', question: q }); save(); return; }
    intake.chat.busy = true;
    const m = { role: 'ai', text: '', streaming: true, id: `msg-${Date.now()}` };
    messages.push(m);
    save();
    if (flag === 'thinking') return; // stays in the thinking state; "Dừng" ends it
    setTimeout(() => {
      if (!m.streaming) return; // stopped meanwhile
      if (flag === 'error') { m.role = 'error'; m.question = q; m.streaming = false; intake.chat.busy = false; save(); return; }
      Object.assign(m, respond(q), { streaming: false, vote: null });
      intake.chat.busy = false;
      save();
    }, 1200);
  }
  // After an intake chip: answer the waiting question once nothing is missing.
  function afterIntake() {
    const intake = store();
    if (!missingIntake(intake).length && intake.chat.pending) askAI(null); else save();
  }
  // ───────────────────────── action handlers ─────────────────────────
  Codi.action('advisor-prompt', (el) => {
    const prompt = el.getAttribute('data-prompt');
    if (prompt) askAI(prompt);
  });

  // GitHub-analysis entry points surfaced from the advisor landing.
  Codi.action('advisor-github-connect', () => { if (Codi.github) Codi.github.openConnect({ returnTo: '/ai' }); });
  Codi.action('advisor-github-view', () => Codi.go('/github/analysis'));

  Codi.action('advisor-send', (form) => {
    const text = form.querySelector('[name="text"]').value.trim();
    if (text) {
      askAI(text);
      form.querySelector('[name="text"]').value = '';
    }
  });

  Codi.action('advisor-intake-answer', (el) => {
    const q = el.getAttribute('data-q');
    const a = el.getAttribute('data-a');
    const intake = store();
    if (q === 'goal') intake.goal = a;
    else if (q === 'level') intake.level = a;
    else if (q === 'hours') intake.hoursPerWeek = a;
    intake.skipped = (intake.skipped || []).filter((k) => k !== q);
    // the answered question turns into a normal user reply in the thread
    const i = intake.chat.messages.findIndex((m) => m.role === 'intake-question' && m.key === q);
    if (i >= 0) intake.chat.messages.splice(i, 1, { role: 'user', text: a, at: new Date().toISOString() });
    afterIntake();
  });

  Codi.action('advisor-intake-skip', (el) => {
    const q = el.getAttribute('data-q');
    const intake = store();
    intake.skipped = (intake.skipped || []).concat(q); // not asked again until the learner edits the summary
    intake.chat.messages = intake.chat.messages.filter((m) => !(m.role === 'intake-question' && m.key === q));
    afterIntake();
  });

  Codi.action('advisor-stop', () => {
    const intake = store();
    const m = intake.chat.messages.find((x) => x.streaming);
    if (m) { m.streaming = false; m.text = 'Bạn đã dừng câu trả lời này.'; m.stopped = true; }
    intake.chat.busy = false;
    save();
  });

  Codi.action('advisor-edit-intake', () => {
    const intake = store();
    intake.skipped = [];
    const questions = [
      { key: 'goal', text: 'Mục tiêu của bạn?', options: ['Làm được dự án', 'Hoàn thành khoá học', 'Chuẩn bị phỏng vấn'] },
      { key: 'level', text: 'Trình độ hiện tại?', options: ['Mới bắt đầu', 'Có kinh nghiệm cơ bản', 'Trung cấp'] },
      { key: 'hours', text: 'Thời gian/tuần?', options: ['< 5 giờ', '5-10 giờ', '> 10 giờ'] }
    ];
    // Add intake questions to chat if not already there
    for (const q of questions) {
      if (!intake.chat.messages.some(m => m.role === 'intake-question' && m.key === q.key)) {
        intake.chat.messages.push({
          role: 'intake-question',
          key: q.key,
          text: q.text,
          options: q.options,
          canSkip: true
        });
      }
    }
    save();
  });

  Codi.action('advisor-clear-intake', (el) => {
    const field = el.getAttribute('data-field');
    const intake = store();
    if (field === 'goal') intake.goal = null;
    else if (field === 'level') intake.level = null;
    else if (field === 'hours') intake.hoursPerWeek = null;
    save();
  });

  Codi.action('advisor-new-chat', () => {
    const intake = store();
    intake.chat.messages = [];
    intake.chat.busy = false;
    save();
  });

  Codi.action('advisor-vote', (el) => {
    const i = parseInt(el.getAttribute('data-i'));
    const v = el.getAttribute('data-v');
    const intake = store();
    const m = intake.chat.messages[i];
    if (!m) return;
    m.vote = m.vote === v ? null : v; m.reason = null;
    save();
    if (m.vote === 'up') ui.toast('Cảm ơn phản hồi của bạn.');
  });

  Codi.action('advisor-reason', (el) => {
    const m = store().chat.messages[Number(el.getAttribute('data-i'))];
    if (!m) return;
    m.reason = el.getAttribute('data-reason');
    save();
    ui.toast('Cảm ơn, góp ý của bạn giúp Codi trả lời tốt hơn.');
  });

  Codi.action('advisor-retry', (el) => {
    const i = parseInt(el.getAttribute('data-i'));
    const intake = store();
    const m = intake.chat.messages[i];
    if (!m || intake.chat.busy) return;
    intake.chat.messages.splice(i, 1);
    if (m.question) askAI(m.question); else save();
  });

  Codi.action('advisor-signin', () => {
    Codi.requireAuth(() => {}, { reason: 'Đăng nhập để nhận gợi ý cá nhân hoá' });
  });

  Codi.action('advisor-add-cart', (el) => {
    const courseId = el.getAttribute('data-id');
    const course = Codi.course(courseId);
    Codi.requireAuth(() => {
      if (Codi.ownership(courseId) !== 'not-owned') { save(); return; } // owned / pending / already in cart → CTA updates on re-render
      if (!Codi.cart().includes(courseId)) Codi.setCart(Codi.cart().concat(courseId));
      save();
      ui.toast(`Đã thêm “${course.title}” vào giỏ hàng.`, { type: 'success', actions: html`<a href="#/cart">Xem giỏ hàng</a>` });
    }, { reason: 'Đăng nhập để thêm khoá học vào giỏ', courseTitle: course.title });
  });

  Codi.action('advisor-enroll-free', (el) => {
    const courseId = el.getAttribute('data-id');
    const course = Codi.course(courseId);
    Codi.requireAuth(() => {
      Codi.enroll(courseId);
      ui.toast(`Đã đăng ký "${course.title}"`, { type: 'success' });
    }, { reason: 'Đăng nhập để đăng ký khoá học miễn phí' });
  });

  // ───────────────────────── register route ─────────────────────────
  Codi.route('/ai', aiPage, {
    role: ['guest', 'learner'],
    title: 'Tư vấn khoá học cùng AI',
    layout: 'default'
  });
})();
