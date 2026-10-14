/**
 * learner-learning.js — the learning loop (PRODUCT.md Flows L4–L10; screens S08–S14).
 * Routes (role learner): '/dashboard' S12 · '/progress' S13 · '/learn/:courseId' S10 path ·
 *   '/learn/:courseId/onboarding' S08–S09 · '/learn/:courseId/:lessonId' S11 player.
 * State: Codi.state.learning[userId][courseId] (see newRecord). Grades/questions/reviews live in Codi.db().
 * Overrides Codi.courseProgress so other modules show the same progress.
 */
(function () {
  'use strict';
  const { html, icon, fmt, ui } = Codi;

  // ───────────────────────── state ─────────────────────────
  const uid = () => Codi.state.currentUserId;
  const store = () => Codi.ensure('learning', () => ({}));
  const save = (render) => Codi.set(() => {}, { render: render !== false });

  function newRecord() {
    return {
      goal: null, goalDraft: {}, goalStep: 0, goalEditing: false,
      diag: { status: 'none', index: 0, answers: {}, diagCardDismissed: false },
      pathStatus: 'none', pathSource: null, order: [], skippable: [],
      completed: [], studied: [], video: {}, pdf: {}, quiz: {}, draft: {},
      mastery: {}, highlight: [], lastUpdate: null, lastActive: null,
    };
  }

  // Seed the demo learner's owned course from CodiData.learnerSeed the first time it is read.
  function seedRecord(courseId, c) {
    const rec = newRecord();
    const seed = Codi.db().learnerSeed;
    const s = seed && seed.userId === uid() && seed.courses[courseId];
    if (s) {
      rec.goal = { goal: s.goal.goal, level: s.goal.level, hours: s.goal.hours };
      rec.diag = { status: 'done', index: 0, answers: {} };
      rec.pathStatus = 'ready'; rec.pathSource = 'ai';
      rec.order = aiOrder(c);
      rec.skippable = (c.aiPath || []).filter((p) => p.skippable).map((p) => p.lessonId);
      rec.completed = s.completed.slice(); rec.studied = s.studied.slice();
      Object.keys(s.quizScores).forEach((lid) => { rec.quiz[lid] = { answers: {}, submitted: true, score: s.quizScores[lid], passed: s.quizScores[lid] >= 70, attempts: 1 }; });
      rec.mastery = Object.assign({}, s.mastery);
      rec.lastActive = '2026-10-10T20:00:00Z';
    }
    return rec;
  }

  function rec(courseId) {
    const all = store();
    if (!all[uid()]) all[uid()] = {};
    if (!all[uid()][courseId]) all[uid()][courseId] = seedRecord(courseId, Codi.course(courseId));
    return all[uid()][courseId];
  }
  const hasRec = (courseId) => !!(store()[uid()] && store()[uid()][courseId]);

  // ───────────────────────── course logic ─────────────────────────
  const aiOrder = (c) => (c.aiPath && c.aiPath.length ? c.aiPath.map((p) => p.lessonId) : c.defaultOrder.slice());
  // Lessons added after the path was generated (e.g. new practice lessons) are appended so they stay reachable.
  const orderOf = (c, r) => {
    const base = r.order && r.order.length ? r.order : c.defaultOrder;
    const extra = c.defaultOrder.filter((id) => !base.includes(id));
    return extra.length ? base.concat(extra) : base;
  };
  const conceptName = (c, id) => ((c.concepts || []).find((x) => x.id === id) || { name: id }).name;
  const lessonsTeaching = (c, conceptId) => Codi.lessons(c).filter((l) => l.conceptIds.includes(conceptId));
  const reasonFor = (c, r, lessonId) => {
    if (r.pathSource !== 'ai') return 'Theo thứ tự mặc định của khoá học (thứ tự bài học tiên quyết).';
    const p = (c.aiPath || []).find((x) => x.lessonId === lessonId);
    return p ? p.reason : 'Theo thứ tự bài học tiên quyết.';
  };

  // Hard lock (Q8): every prerequisite concept must be completed in at least one lesson, or already mastered (≥3).
  function lockInfo(c, r, lesson) {
    for (const e of c.prerequisites || []) {
      if (!lesson.conceptIds.includes(e.to) || lesson.conceptIds.includes(e.from)) continue;
      const teach = lessonsTeaching(c, e.from).filter((l) => l.id !== lesson.id);
      if (!teach.length) continue;
      const ok = teach.some((l) => r.completed.includes(l.id)) || (r.mastery[e.from] || 0) >= 3;
      if (!ok) return { concept: conceptName(c, e.from), lesson: teach[0] };
    }
    return null;
  }

  function lessonStatus(c, r, lesson, currentId) {
    if (r.completed.includes(lesson.id)) return 'done';
    if (lockInfo(c, r, lesson)) return 'locked';
    if (lesson.id === currentId) return (r.studied.includes(lesson.id) || r.quiz[lesson.id]) ? 'active' : 'next';
    if (r.pathSource === 'ai' && r.skippable.includes(lesson.id)) return 'skippable';
    return 'todo';
  }
  const STATUS = {
    done: ['Đã học', 'badge-success', 'check-circle'],
    active: ['Đang học', 'badge-accent', 'circle-dot'],
    next: ['Tiếp theo', 'badge-accent', 'arrow-right'],
    skippable: ['Có thể bỏ qua', 'badge-neutral', 'skip-forward'],
    locked: ['Bị khoá', 'badge-outline', 'lock'],
    todo: ['Chưa học', 'badge-neutral', 'circle'],
  };
  const statusBadge = (st) => html`<span class="badge ${STATUS[st][1]}">${icon(STATUS[st][2])}${STATUS[st][0]}</span>`;

  function currentLessonId(c, r) {
    const order = orderOf(c, r);
    const open = (id) => { const l = Codi.lesson(c, id); return l && !r.completed.includes(id) && !lockInfo(c, r, l); };
    return order.find((id) => open(id) && !(r.pathSource === 'ai' && r.skippable.includes(id))) || order.find(open) || null;
  }
  const requiredLessons = (c, r) => orderOf(c, r).filter((id) => !(r.pathSource === 'ai' && r.skippable.includes(id)));
  const isCourseComplete = (c, r) => requiredLessons(c, r).every((id) => r.completed.includes(id));

  // Lesson checklist mirrors the UC precondition: study + quiz + assignment before completion.
  function mySubmission(lessonId) {
    return Codi.db().submissions.filter((s) => s.userId === uid() && s.lessonId === lessonId).sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))[0] || null;
  }
  function checklist(r, lesson) {
    let items;
    if (lesson.code) {
      // Coding lessons: the practice itself is the "study" step.
      const s = Codi.code.status(lesson);
      items = s.kind === 'tutorial'
        ? [{ key: 'study', label: 'Đi hết các bước hướng dẫn', done: s.done, note: s.done ? '' : `Bước ${s.step + 1}/${s.total}` }]
        : [{ key: 'code', label: 'Hoàn thành bài code', done: s.done, note: s.done ? (s.solutionViewed ? 'Đạt · đã xem lời giải' : 'Đạt tất cả test') : s.submits ? `Lần nộp gần nhất: ${s.passedCount}/${s.total} test` : 'Nộp bài để chấm' }];
    } else {
      items = [{ key: 'study', label: 'Học nội dung', done: r.studied.includes(lesson.id) }];
    }
    if (lesson.quiz) { const q = r.quiz[lesson.id]; items.push({ key: 'quiz', label: `Đạt quiz (≥ ${lesson.quiz.passingScore}%)`, done: !!(q && q.submitted && q.passed), note: q && q.submitted ? (q.passed ? `${q.score}%` : `${q.score}% · chưa đạt, làm lại`) : '' }); }
    if (lesson.assignment) { const s = mySubmission(lesson.id); items.push({ key: 'assignment', label: 'Nộp bài tập', done: !!s, note: s ? (s.status === 'graded' ? `Đã chấm ${String(s.score).replace('.', ',')}/${s.maxScore}` : 'Chờ chấm') : '' }); }
    return items;
  }

  // Override the shared progress selector so dashboard, profile and course detail agree.
  const baseProgress = Codi.courseProgress;
  Codi.courseProgress = (courseId, userId) => {
    if (userId && userId !== uid()) return baseProgress(courseId, userId);
    const c = Codi.course(courseId);
    if (!c || !Codi.isEnrolled(courseId)) return baseProgress(courseId, userId);
    const r = rec(courseId);
    const total = Codi.lessons(c).length;
    const done = r.completed.length;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0, completed: total > 0 && isCourseComplete(c, r), currentLessonId: currentLessonId(c, r) };
  };

  function masteryFromScore(score) { return score >= 90 ? 4 : score >= 70 ? 3 : score >= 50 ? 2 : 1; }

  // AI path generation (simulated). Failure falls back to the default prerequisite order — learner never blocked.
  const genPending = new Set();
  function generatePath(courseId) {
    const c = Codi.course(courseId);
    const r = rec(courseId);
    r.pathStatus = 'generating'; r.highlight = [];
    genPending.add(courseId);
    save(false);
    setTimeout(() => {
      genPending.delete(courseId);
      const rr = rec(courseId);
      if (Codi.state.scenario.pathAI === 'fail') {
        rr.pathStatus = 'failed'; rr.pathSource = 'default'; rr.order = c.defaultOrder.slice(); rr.skippable = [];
      } else {
        rr.pathStatus = 'ready'; rr.pathSource = c.aiPath && c.aiPath.length ? 'ai' : 'default';
        rr.order = aiOrder(c); rr.skippable = (c.aiPath || []).filter((p) => p.skippable).map((p) => p.lessonId);
      }
      save(Codi.path().startsWith('/learn/' + courseId));
    }, 2800);
  }

  // ───────────────────────── shared pieces ─────────────────────────
  const TYPE_ICON = { video: 'video', pdf: 'presentation', reading: 'book-open', tutorial: 'terminal', code: 'code' };
  const TYPE_LABEL = { video: 'Video', pdf: 'Slide/PDF', reading: 'Bài đọc', tutorial: 'Hướng dẫn code', code: 'Bài code' };
  const GOALS = [
    ['project', 'Làm được dự án', 'Ưu tiên bài thực hành và dự án cuối khoá.'],
    ['finish', 'Hoàn thành khóa học', 'Học đủ mọi bài theo thứ tự khoá học.'],
    ['interview', 'Chuẩn bị phỏng vấn', 'Ưu tiên khái niệm cốt lõi hay được hỏi.'],
  ];
  const LEVELS = [
    ['new', 'Mới bắt đầu', 'Chưa từng học chủ đề này.'],
    ['basic', 'Đã biết cơ bản', 'Đã đọc hoặc làm thử vài ví dụ.'],
    ['solid', 'Khá vững', 'Đã dùng trong dự án nhỏ.'],
  ];
  const HOURS = [2, 5, 10];
  const goalLabel = (g) => (GOALS.find((x) => x[0] === (g && g.goal)) || [0, 'Chưa đặt mục tiêu'])[1];
  const weeksFor = (c, h) => Math.max(1, Math.ceil((c.durationMin * 2.5) / (h * 60)));

  function notEnrolled(c) {
    return html`<div class="page page-narrow">${ui.empty({ icon: 'lock', title: 'Bạn chưa sở hữu khoá học này', body: 'Mua hoặc đăng ký khoá học để bắt đầu học.', actions: html`<a class="btn btn-primary" href="#/courses/${c.slug}">Xem khoá học</a>` })}</div>`;
  }
  const notFound = () => html`<div class="page page-narrow">${ui.empty({ icon: 'map', title: 'Không tìm thấy khoá học', actions: html`<a class="btn btn-primary" href="#/dashboard">Về bàn làm việc</a>` })}</div>`;

  function updateNotice(c, r, inPlayer) {
    const u = r.lastUpdate;
    if (!u) return '';
    const done = Codi.lesson(c, u.afterLessonId);
    const next = u.nextLessonId ? Codi.lesson(c, u.nextLessonId) : null;
    const icons = { 'moved-up': 'arrow-up', 'now-skippable': 'skip-forward', unlocked: 'unlock' };
    return html`<section class="card ln-update" aria-live="polite"><div class="card-body stack-3">
      <div class="row-between"><span class="row strong">${icon('check-circle', { cls: 'text-success' })} Đã hoàn thành: ${done ? done.title : ''}</span>
        <button class="btn btn-ghost btn-sm" data-action="ln-dismiss-update" data-course="${c.id}">Ẩn thông báo</button></div>
      <div class="stack-2"><strong>Lộ trình đã được cập nhật</strong>
        <ul class="list ln-changes">${u.changes.map((ch) => html`<li>${icon(icons[ch.type] || 'info', { cls: 'icon-sm' })}<span>${ch.text}</span></li>`)}</ul>
        ${!inPlayer ? '' : html`<a class="small" href="#/learn/${c.id}">Xem lộ trình đầy đủ</a>`}
      </div>
      ${next ? html`<div class="panel row-between"><div class="stack-1"><span class="xsmall muted">Bài tiếp theo</span><strong>${next.title}</strong><span class="xsmall muted">${TYPE_LABEL[next.type]} · ${fmt.duration(next.durationMin)}</span></div><a class="btn btn-primary" href="#/learn/${c.id}/${next.id}">Học tiếp</a></div>`
        : isCourseComplete(c, r) ? html`<div class="panel row-between"><strong>Bạn đã hoàn thành khoá học</strong><a class="btn btn-primary" href="#/learn/${c.id}">Xem tổng kết</a></div>` : ''}
    </div></section>`;
  }

  function reviewBlock(c) {
    const mine = Codi.db().reviews.find((x) => x.courseId === c.id && x.userId === uid());
    if (mine) return html`<div class="row">${ui.stars(mine.stars)}<span class="small muted">Bạn đã đánh giá</span><button class="btn btn-secondary btn-sm" data-action="ln-review" data-course="${c.id}" data-stars="${mine.stars}">Sửa đánh giá</button></div>`;
    return html`<div class="stack-2"><span class="small">Bạn thấy khoá học thế nào?</span>
      <div class="star-input" role="group" aria-label="Chọn số sao">${[1, 2, 3, 4, 5].map((n) => html`<button type="button" data-action="ln-review" data-course="${c.id}" data-stars="${n}" aria-label="${n} sao">${icon('star')}</button>`)}</div></div>`;
  }

  function completionCard(c) {
    const next = Codi.db().courses.find((x) => x.status === 'published' && !Codi.isEnrolled(x.id) && x.id !== c.id);
    return html`<section class="card ln-complete"><div class="card-body stack-4">
      <div class="row">${icon('graduation-cap', { cls: 'icon-lg text-success' })}<div class="stack-1"><h2>Chúc mừng! Bạn đã hoàn thành khoá học</h2><p class="small muted">${c.title}</p></div></div>
      ${reviewBlock(c)}
      ${next ? html`<div class="panel row-between"><div class="stack-1"><span class="xsmall muted">Khoá học gợi ý tiếp theo</span><strong>${next.title}</strong></div><a class="btn btn-secondary" href="#/courses/${next.slug}">Xem khoá học</a></div>` : ''}
    </div></section>`;
  }

  // ───────────────────────── S12 Dashboard helpers ─────────────────────────
  const weeklyGoalInfo = (userId) => {
    const enrolled = Codi.db().enrolments.filter((e) => e.userId === userId).map((e) => Codi.course(e.courseId)).filter(Boolean);
    for (const c of enrolled) {
      const r = rec(c.id);
      if (r && r.goal && r.goal.hours) return { hours: r.goal.hours, hasGoal: true };
    }
    return { hours: 5, hasGoal: false };
  };
  const streakDays = (userId) => {
    const today = new Date().toISOString().slice(0, 10);
    const db = Codi.db();
    const days = db.learnerStudyDays || [];
    const myDays = days.filter((d) => d.userId === userId && d.minutes > 0).map((d) => d.date).sort().reverse();
    let streak = 0; const checkDate = new Date(today);
    for (let i = 0; i < 365; i++) {
      const dateStr = checkDate.toISOString().slice(0, 10);
      const studied = myDays.includes(dateStr);
      if (!studied && i > 0) break;
      if (studied) streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
    return streak;
  };
  const minutesThisWeek = (userId) => {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const db = Codi.db();
    const days = (db.learnerStudyDays || []).filter((d) => d.userId === userId && new Date(d.date) >= weekAgo);
    return days.reduce((s, d) => s + (d.minutes || 0), 0);
  };
  const skillBadges = (userId) => {
    const enrolled = Codi.db().enrolments.filter((e) => e.userId === userId).map((e) => Codi.course(e.courseId)).filter(Boolean);
    const skills = new Map();
    enrolled.forEach((c) => {
      const r = rec(c.id);
      (c.concepts || []).forEach((k) => {
        if (r && (r.mastery[k.id] || 0) >= 3) skills.set(k.id, k);
      });
    });
    return Array.from(skills.values());
  };

  // ───────────────────────── S12 Dashboard ─────────────────────────
  Codi.route('/dashboard', () => {
    const u = Codi.currentUser();
    const enrolled = Codi.db().enrolments.filter((e) => e.userId === u.id).map((e) => Codi.course(e.courseId)).filter(Boolean);
    const subs = Codi.db().submissions.filter((s) => s.userId === u.id);
    const pendingSubs = subs.filter((s) => s.status === 'pending');
    const graded = subs.filter((s) => s.status === 'graded').sort((a, b) => (a.gradedAt < b.gradedAt ? 1 : -1));
    const answered = Codi.db().questions.filter((q) => q.userId === u.id && q.status === 'answered');
    const items = enrolled.map((c) => ({ c, p: Codi.courseProgress(c.id), r: rec(c.id) }));
    const active = items.filter((x) => !x.p.completed);
    const cont = active.slice().sort((a, b) => String(b.r.lastActive || '').localeCompare(String(a.r.lastActive || '')))[0];
    const doneLessons = items.reduce((s, x) => s + x.p.done, 0);
    const goalInfo = weeklyGoalInfo(u.id);
    const streak = streakDays(u.id);
    const minutesWeek = minutesThisWeek(u.id);
    const badges = skillBadges(u.id);
    const head = html`<div class="page-header"><div><h1>Bàn làm việc</h1><p class="muted">Chào mừng trở lại, ${u.name}!</p></div>
      <div class="row"><a class="btn btn-secondary" href="#/insights">${icon('bar-chart', { cls: 'icon-sm' })} Tiến độ & kết quả</a><a class="btn btn-ghost" href="#/ai">${icon('sparkles', { cls: 'icon-sm' })} Hỏi AI Codi</a></div></div>`;
    if (!enrolled.length) {
      return html`<div class="page">${head}<div class="card">${ui.empty({ icon: 'book-open', title: 'Bàn làm việc của bạn đang trống', body: 'Chọn một khoá học để bắt đầu. Codi sẽ xếp lộ trình riêng cho bạn sau bài kiểm tra đầu vào.', actions: html`<a class="btn btn-primary" href="#/courses">Khám phá khoá học</a><a class="btn btn-secondary" href="#/ai">${icon('sparkles')} Khám phá lộ trình cùng AI</a>` })}</div></div>`;
    }
    // Hero: the single "continue learning" focus (large course media + progress + one primary CTA).
    let contCard = '';
    if (cont) {
      const c = cont.c; const needsSetup = cont.r.pathStatus === 'none';
      const lesson = cont.p.currentLessonId ? Codi.lesson(c, cont.p.currentLessonId) : null;
      contCard = html`<section class="dash-hero" aria-labelledby="dash-cont-title">
        <div class="dash-hero-media">${ui.thumb(c)}</div>
        <div class="dash-hero-body">
          <span class="dash-kicker">Tiếp tục học</span>
          <h2 id="dash-cont-title" class="dash-hero-title">${c.title}</h2>
          <p class="dash-hero-next">${needsSetup ? 'Bước tiếp theo: đặt mục tiêu và làm bài kiểm tra đầu vào' : lesson ? html`Bài hiện tại: <strong>${lesson.title}</strong>` : 'Bạn đã học hết các bài khả dụng'}</p>
          ${needsSetup ? '' : html`<div class="dash-hero-progress">${ui.progress(cont.p.pct)}<span class="od-nowrap">${cont.p.done}/${cont.p.total} bài · ${cont.p.pct}%</span></div>`}
          <div class="row"><a class="btn btn-primary btn-lg" href="#/learn/${c.id}${needsSetup ? '/onboarding' : lesson ? '/' + lesson.id : ''}">${needsSetup ? 'Bắt đầu thiết lập' : 'Học tiếp'}</a>
            ${needsSetup ? '' : html`<a class="btn btn-ghost" href="#/learn/${c.id}">Xem lộ trình</a>`}</div>
        </div>
      </section>`;
    }
    // Side column: what needs attention (grading, latest lecturer feedback, answered questions).
    const latest = graded[0];
    const latestLesson = latest ? Codi.lesson(Codi.course(latest.courseId), latest.lessonId) : null;
    const aside = html`<aside class="dash-aside" aria-label="Cập nhật từ giảng viên">
      <h2 class="dash-h">Cập nhật cho bạn</h2>
      <ul class="dash-updates">
        <li><a href="#/progress"><span class="dash-update-value">${pendingSubs.length}</span><span class="dash-update-label">Bài tập đang chờ chấm</span></a></li>
        <li><a href="#/progress"><span class="dash-update-value">${answered.length}</span><span class="dash-update-label">Câu hỏi đã được trả lời</span></a></li>
        <li><a href="#/progress"><span class="dash-update-value">${doneLessons}</span><span class="dash-update-label">Bài học đã hoàn thành</span></a></li>
      </ul>
      ${latest ? html`<div class="dash-feedback">
          <span class="dash-kicker">Nhận xét mới nhất</span>
          <p class="dash-feedback-lesson">${(latestLesson || {}).title} · <span class="od-nowrap">${String(latest.score).replace('.', ',')}/${latest.maxScore}</span></p>
          <p class="dash-feedback-text od-clamp-3">${latest.feedback}</p>
          <a class="dash-link" href="#/progress">Xem tất cả nhận xét</a>
        </div>` : ''}
    </aside>`;
    // Recommendations: published courses the learner does not own yet.
    const recs = Codi.db().courses.filter((c) => c.status === 'published' && Codi.ownership(c.id) !== 'owned').slice(0, 3);
    return html`<div class="page stack-8">
      ${head}
      ${streak > 0 || badges.length ? html`<section class="card"><div class="card-body stack-4">
        <h2 class="dash-h">Mục tiêu & tiến độ</h2>
        ${goalInfo ? html`<div class="stack-2"><div class="row-between"><strong class="small">Mục tiêu hàng tuần</strong>${!goalInfo.hasGoal ? html`<span class="badge badge-neutral">Giả định</span>` : ''}</div>
          <div class="goal-tracker"><div class="goal-tracker-bar" style="width:${Math.min(100, (minutesWeek / (goalInfo.hours * 60)) * 100)}%"></div></div>
          <span class="small muted">${minutesWeek} phút / ${goalInfo.hours * 60} phút (${Math.round((minutesWeek / (goalInfo.hours * 60)) * 100)}% tuần này)</span></div>` : ''}
        ${streak > 0 ? html`<div class="streak"><span class="streak-number">${streak}</span><span class="streak-label">ngày<br/>liên tiếp</span></div>` : ''}
        ${badges.length ? html`<div class="stack-2"><strong class="small">Kỹ năng thành thạo</strong>
          <div class="badge-list">${badges.slice(0, 5).map((b) => html`<span class="badge badge-accent">${b.name}</span>`)}</div>
          ${badges.length > 5 ? html`<span class="small muted">+${badges.length - 5} kỹ năng khác</span>` : ''}</div>` : ''}
      </div></section>` : ''}
      <div class="dash-grid">
        <div class="dash-main stack-8">
          ${contCard}
          ${cont && cont.r.pathSource === 'default' && cont.r.pathStatus === 'ready' && cont.r.diag.status === 'skipped' && !cont.r.diag.diagCardDismissed ? html`<section class="card"><div class="card-body stack-3" role="status"><div class="row-between"><strong>Cá nhân hoá lộ trình — làm bài kiểm tra đầu vào (~10 phút)</strong><button class="btn btn-ghost btn-icon btn-sm" data-action="ln-dismiss-diag-card" data-course="${cont.c.id}" aria-label="Ẩn thông báo">${icon('x', { cls: 'icon-sm' })}</button></div><p class="small muted">Giúp Codi bỏ qua phần bạn đã biết và tập trung vào phần còn thiếu.</p><button class="btn btn-secondary btn-sm" data-action="ln-take-diag" data-course="${cont.c.id}">Làm bài kiểm tra đầu vào</button></div></section>` : ''}
          <section aria-labelledby="dash-mine">
            <div class="section-title"><h2 id="dash-mine" class="dash-h">Khoá học của tôi</h2><a class="dash-link" href="#/courses">Tìm thêm khoá học</a></div>
            <ul class="dash-courses">${items.map(({ c, p, r }) => html`<li class="dash-course">
              ${ui.thumb(c, { small: true })}
              <div class="dash-course-body">
                <a class="dash-course-title" href="#/learn/${c.id}">${c.title}</a>
                ${r.pathStatus === 'none' ? html`<span class="dash-course-meta">Chưa thiết lập lộ trình</span>` : html`${ui.progress(p.pct)}<span class="dash-course-meta">${p.done}/${p.total} bài · ${p.completed ? 'Đã hoàn thành' : goalLabel(r.goal)}</span>`}
              </div>
              <a class="btn btn-secondary btn-sm" href="#/learn/${c.id}${r.pathStatus === 'none' ? '/onboarding' : ''}">${r.pathStatus === 'none' ? 'Bắt đầu' : p.completed ? 'Xem lại' : 'Mở lộ trình'}</a>
            </li>`)}</ul>
          </section>
        </div>
        ${aside}
      </div>
      ${recs.length ? html`<section aria-labelledby="dash-recs">
        <div class="section-title"><h2 id="dash-recs" class="dash-h">Gợi ý cho bạn</h2><a class="dash-link" href="#/ai">Hỏi AI Codi</a></div>
        <div class="dash-recs">${recs.map((c) => html`<a class="dash-rec" href="#/courses/${c.slug}">
          ${ui.thumb(c)}
          <span class="dash-rec-title">${c.title}</span>
          <span class="dash-rec-meta">${Codi.levelLabel(c.level)} · ${Codi.lessons(c).length} bài</span>
          <span class="price">${c.price ? fmt.vnd(c.price) : 'Miễn phí'}</span>
        </a>`)}</div>
      </section>` : ''}
    </div>`;
  }, { title: 'Bàn làm việc', role: 'learner' });

  // ───────────────────────── S08–S09 Onboarding ─────────────────────────
  function goalStepView(c, r) {
    const step = r.goalStep || 0;
    const d = r.goalDraft || {};
    const defs = [
      ['goal', 'Bạn muốn đạt được gì với khoá học này?', GOALS.map(([v, t, s]) => [v, t, s])],
      ['level', 'Bạn đang ở mức nào với chủ đề này?', LEVELS.map(([v, t, s]) => [v, t, s])],
      ['hours', 'Mỗi tuần bạn dành được bao nhiêu thời gian?', HOURS.map((h) => [String(h), `${h} giờ mỗi tuần`, `≈ ${weeksFor(c, h)} tuần để hoàn thành`])],
    ];
    const [key, q, opts] = defs[step];
    const cur = d[key] !== undefined ? String(d[key]) : '';
    return html`<div class="page page-focus stack-6">
      <div class="stack-2"><span class="small muted">${r.goalEditing ? 'Chỉnh mục tiêu' : 'Thiết lập lộ trình'} · Bước ${step + 1}/3</span>
        <div class="progress-segments" aria-hidden="true">${[0, 1, 2].map((i) => html`<i class="${i < step ? 'done' : i === step ? 'current' : ''}"></i>`)}</div></div>
      <div class="stack-2"><h1>${q}</h1><p class="muted">${c.title}</p></div>
      <div class="choice-list" role="radiogroup" aria-label="${q}">${opts.map(([v, t, s]) => html`<button type="button" class="choice" role="radio" aria-checked="${cur === v}" data-action="ln-goal-pick" data-course="${c.id}" data-key="${key}" data-value="${v}">
        <span class="choice-body"><span class="choice-title">${t}</span><span class="choice-desc">${s}</span></span></button>`)}</div>
      <div class="row-between">
        ${step > 0 ? html`<button class="btn btn-ghost" data-action="ln-goal-back" data-course="${c.id}">${icon('arrow-left')} Quay lại</button>` : html`<span></span>`}
        <div class="row" style="gap:var(--space-2)"><button class="btn btn-ghost btn-sm" data-action="ln-goal-skip" data-course="${c.id}">Bỏ qua</button>
          <button class="btn btn-primary btn-lg" data-action="ln-goal-next" data-course="${c.id}" ${cur ? '' : Codi.raw('disabled')}>${step < 2 ? 'Tiếp tục' : r.goalEditing ? 'Lưu và xếp lại lộ trình' : 'Tiếp tục'}</button></div>
      </div>
    </div>`;
  }

  function startForkView(c, r) {
    // S08b: choose between default order or diagnostic path
    return html`<div class="page page-focus stack-6">
      <div class="stack-2"><span class="small muted">Chọn cách bắt đầu</span><h1>Bạn muốn học như thế nào?</h1>
        <p class="muted">Hai cách bắt đầu — chọn một và bạn có thể thay đổi sau.</p></div>
      <div class="grid-2 stack-3">
        <button class="choice-card" data-action="ln-fork-default" data-course="${c.id}">
          <span class="choice-card-icon">${icon('list')}</span>
          <span class="choice-card-title">Học từ bài 1</span>
          <span class="choice-card-desc">Học theo thứ tự mặc định của giảng viên. Bạn có thể làm bài kiểm tra đầu vào bất cứ lúc nào để Codi cá nhân hoá lộ trình.</span>
          <span class="choice-card-note">Tất cả bài đều mở, cần tiên quyết</span>
        </button>
        <button class="choice-card is-recommended" data-action="ln-fork-diagnostic" data-course="${c.id}">
          <span class="badge badge-accent" style="align-self:start">Khuyến nghị</span>
          <span class="choice-card-icon">${icon('target')}</span>
          <span class="choice-card-title">Tìm điểm bắt đầu của tôi</span>
          <span class="choice-card-desc">~10 phút, giúp bỏ qua phần bạn đã biết.</span>
          <span class="choice-card-note">Codi xếp lộ trình riêng cho bạn</span>
        </button>
      </div>
    </div>`;
  }

  function diagIntroView(c, r) {
    const test = c.entryTest;
    if (!test || !test.questions.length) {
      return html`<div class="page page-focus stack-4"><h1>Sẵn sàng bắt đầu</h1>
        ${ui.alert({ type: 'info', title: 'Khoá học này chưa có bài kiểm tra đầu vào', body: 'Bạn sẽ học theo thứ tự mặc định của khoá học.' })}
        <button class="btn btn-primary btn-lg" data-action="ln-diag-skip" data-course="${c.id}">Xem lộ trình</button></div>`;
    }
    const resume = r.diag.status === 'in-progress';
    return html`<div class="page page-focus stack-6">
      <div class="stack-2"><span class="small muted">Bài kiểm tra đầu vào</span><h1>Giúp Codi xếp lộ trình phù hợp với bạn</h1>
        <p class="muted">Kết quả cho biết bạn đã nắm những khái niệm nào để bỏ qua phần đã biết và tập trung vào phần còn thiếu.</p></div>
      <ul class="ln-facts">
        <li>${icon('list')}<span><strong>${test.questions.length} câu hỏi</strong> trắc nghiệm</span></li>
        <li>${icon('clock')}<span>Khoảng <strong>${Math.ceil(test.questions.length * 0.75)} phút</strong>, không giới hạn thời gian</span></li>
        <li>${icon('shield')}<span><strong>Không tính điểm</strong>. Chưa biết thì chọn "Tôi chưa biết"</span></li>
      </ul>
      ${resume ? ui.alert({ type: 'info', title: `Bạn đang làm dở ở câu ${r.diag.index + 1}`, body: 'Các câu đã trả lời vẫn được giữ.' }) : ''}
      <div class="stack-2">
        <button class="btn btn-primary btn-lg" data-action="ln-diag-start" data-course="${c.id}">${resume ? `Tiếp tục từ câu ${r.diag.index + 1}` : 'Bắt đầu làm bài'}</button>
        <button class="btn btn-ghost" data-action="ln-diag-skip" data-course="${c.id}">Để sau</button>
        <p class="xsmall muted">Để sau: bạn vẫn học được ngay theo thứ tự mặc định, và có thể làm bài kiểm tra sau để có lộ trình cá nhân hoá.</p>
      </div>
    </div>`;
  }

  function diagQuestionView(c, r) {
    const qs = c.entryTest.questions;
    const i = Math.min(r.diag.index, qs.length - 1);
    const q = qs[i];
    const a = r.diag.answers[q.id];
    return html`<div class="page page-focus stack-6">
      <div class="stack-2"><div class="row-between"><span class="small strong">Câu ${i + 1}/${qs.length}</span><span class="xsmall muted">Không tính điểm · không giới hạn thời gian</span></div>
        <div class="progress-segments" aria-hidden="true">${qs.map((x, k) => html`<i class="${r.diag.answers[x.id] !== undefined ? 'done' : k === i ? 'current' : ''}"></i>`)}</div></div>
      <h1 class="ln-question">${q.text}</h1>
      <div class="choice-list" role="radiogroup" aria-label="Các lựa chọn">
        ${q.options.map((o, k) => html`<label class="choice ${a === k ? 'is-selected' : ''}"><input type="radio" name="diag" value="${k}" data-change="ln-diag-answer" data-course="${c.id}" data-q="${q.id}" ${a === k ? Codi.raw('checked') : ''}><span class="choice-body"><span class="choice-title">${o}</span></span></label>`)}
        <label class="choice ${a === 'unknown' ? 'is-selected' : ''}"><input type="radio" name="diag" value="unknown" data-change="ln-diag-answer" data-course="${c.id}" data-q="${q.id}" ${a === 'unknown' ? Codi.raw('checked') : ''}><span class="choice-body"><span class="choice-title">Tôi chưa biết</span><span class="choice-desc">Được ghi nhận riêng, không tính là sai</span></span></label>
      </div>
      <div class="row-between">
        <button class="btn btn-ghost" data-action="ln-diag-prev" data-course="${c.id}" ${i === 0 ? Codi.raw('disabled') : ''}>${icon('arrow-left')} Câu trước</button>
        <button class="btn btn-primary btn-lg" data-action="ln-diag-next" data-course="${c.id}" ${a === undefined ? Codi.raw('disabled') : ''}>${i === qs.length - 1 ? 'Xem kết quả' : 'Câu tiếp theo'}</button>
      </div>
    </div>`;
  }

  function diagResultView(c, r) {
    const qs = c.entryTest.questions;
    let right = 0, wrong = 0, unknown = 0;
    qs.forEach((q) => { const a = r.diag.answers[q.id]; if (a === 'unknown' || a === undefined) unknown++; else if (a === q.correctIndex) right++; else wrong++; });
    const tested = Array.from(new Set(qs.map((q) => q.conceptId)));
    const strengths = tested.filter((id) => (r.mastery[id] || 0) >= 3);
    const gaps = tested.filter((id) => (r.mastery[id] || 0) <= 1);
    return html`<div class="page page-focus stack-6">
      <div class="stack-2"><span class="small muted">Kết quả bài kiểm tra đầu vào</span><h1>Codi đã hiểu điểm xuất phát của bạn</h1></div>
      <div class="grid-3">
        <div class="stat-tile"><span class="stat-value">${right}</span><span class="stat-label">${icon('check-circle', { cls: 'icon-sm text-success' })} Đúng</span></div>
        <div class="stat-tile"><span class="stat-value">${wrong}</span><span class="stat-label">${icon('x-circle', { cls: 'icon-sm text-danger' })} Sai</span></div>
        <div class="stat-tile"><span class="stat-value">${unknown}</span><span class="stat-label">${icon('help-circle', { cls: 'icon-sm' })} Chưa biết</span></div>
      </div>
      <section class="card"><div class="card-body stack-3"><h2 class="ln-h">Mức thành thạo theo khái niệm</h2>
        <ul class="list">${tested.map((id) => html`<li class="list-row" style="padding-inline:0"><span class="list-main">${conceptName(c, id)}</span>${ui.mastery(r.mastery[id] || 0, { detail: true })}</li>`)}</ul></div></section>
      <div class="grid-2">
        <div class="panel stack-2"><strong>Điểm mạnh</strong>${strengths.length ? html`<ul>${strengths.map((id) => html`<li>${conceptName(c, id)}</li>`)}</ul>` : html`<p class="small muted">Chưa có khái niệm nào ở mức Thành thạo.</p>`}</div>
        <div class="panel stack-2"><strong>Cần tập trung</strong>${gaps.length ? html`<ul>${gaps.map((id) => html`<li>${conceptName(c, id)}</li>`)}</ul>` : html`<p class="small muted">Không có lỗ hổng lớn.</p>`}</div>
      </div>
      <button class="btn btn-primary btn-lg" data-action="ln-make-path" data-course="${c.id}">Xem lộ trình của tôi</button>
    </div>`;
  }

  Codi.route('/learn/:courseId/onboarding', (p) => {
    const c = Codi.course(p.courseId);
    if (!c) return notFound();
    if (!Codi.isEnrolled(c.id)) return notEnrolled(c);
    const r = rec(c.id);
    if (!r.goal || r.goalEditing) return goalStepView(c, r);
    if (r.diag.status === 'fork') return startForkView(c, r);
    if (r.diag.status === 'in-progress' && Codi.query().view !== 'intro') return diagQuestionView(c, r);
    if (r.diag.status === 'done' && (r.pathStatus === 'none' || Codi.query().view === 'result')) return diagResultView(c, r);
    if (r.pathStatus !== 'none' && r.diag.status !== 'intro') {
      return html`<div class="page page-focus">${ui.empty({ icon: 'route', title: 'Lộ trình đã sẵn sàng', actions: html`<a class="btn btn-primary" href="#/learn/${c.id}">Mở lộ trình</a>` })}</div>`;
    }
    return diagIntroView(c, r);
  }, { title: 'Thiết lập lộ trình', role: 'learner', layout: 'focus', exit: { href: '/dashboard', label: 'Để sau' } });

  // ───────────────────────── S10 Personal path / course home ─────────────────────────
  Codi.route('/learn/:courseId', (p) => {
    const c = Codi.course(p.courseId);
    if (!c) return notFound();
    if (!Codi.isEnrolled(c.id)) return notEnrolled(c);
    const r = rec(c.id);
    if (r.pathStatus === 'none') {
      return html`<div class="page page-narrow stack-4"><h1>${c.title}</h1><div class="card">${ui.empty({ icon: 'route', title: 'Hãy thiết lập lộ trình học của bạn', body: 'Đặt mục tiêu (3 câu hỏi ngắn) và làm bài kiểm tra đầu vào để Codi xếp thứ tự bài học phù hợp với bạn.', actions: html`<a class="btn btn-primary" href="#/learn/${c.id}/onboarding">Bắt đầu thiết lập</a>` })}</div></div>`;
    }
    if (r.pathStatus === 'generating') {
      if (!genPending.has(c.id)) generatePath(c.id);
      return html`<div class="page page-narrow stack-4"><h1>${c.title}</h1>
        <div class="card"><div class="card-body stack-4" role="status" aria-live="polite">
          <p class="row strong">${icon('loader')} Codi đang xếp lộ trình cho bạn…</p>
          <ol class="ln-gen-steps"><li>Phân tích kết quả bài kiểm tra đầu vào</li><li>Áp dụng thứ tự bài học tiên quyết (bắt buộc)</li><li>Ước lượng thời gian theo mục tiêu ${goalLabel(r.goal).toLowerCase()}</li></ol>
          <p class="small muted">Thường mất vài giây. Bạn có thể rời trang, lộ trình vẫn được tạo.</p>
        </div></div></div>`;
    }
    const order = orderOf(c, r);
    const cur = currentLessonId(c, r);
    const prog = Codi.courseProgress(c.id);
    const complete = isCourseComplete(c, r);
    const highlight = r.highlight.slice();
    if (highlight.length) Codi.onMount(() => { r.highlight = []; save(false); });
    // Group the ordered lessons by chapter, keeping the path order inside each chapter.
    const groups = c.chapters.map((ch) => ({ ch, ids: order.filter((id) => ch.lessons.some((l) => l.id === id)) })).filter((g) => g.ids.length);
    const curLesson = cur ? Codi.lesson(c, cur) : null;
    return html`<div class="page stack-4">
      <nav class="small muted"><a href="#/dashboard">Bàn làm việc</a> / <span aria-current="page">${c.title}</span></nav>
      <header class="card"><div class="card-body ln-path-head">
        <div class="stack-2 od-fill"><h1>${c.title}</h1>
          <p class="small"><span class="muted">Mục tiêu:</span> <strong>${goalLabel(r.goal)}</strong>${r.goal ? html` · ${r.goal.hours} giờ/tuần` : ''} <button class="btn-link small" data-action="ln-edit-goal" data-course="${c.id}">Chỉnh mục tiêu</button></p>
          <div class="row" style="gap:12px">${ui.progress(prog.pct)}<span class="small od-nowrap">${prog.done}/${prog.total} bài</span></div>
        </div>
        <div class="stack-2 ln-path-cta">
          ${curLesson && !complete ? html`<a class="btn btn-primary btn-lg" href="#/learn/${c.id}/${curLesson.id}">Học tiếp</a><span class="xsmall muted od-truncate">${curLesson.title}</span>` : ''}
          <button class="btn btn-secondary btn-sm" data-action="ln-review" data-course="${c.id}" data-stars="0">${Codi.db().reviews.some((x) => x.courseId === c.id && x.userId === uid()) ? 'Sửa đánh giá' : 'Đánh giá khóa học'}</button>
        </div>
      </div></header>
      ${r.pathStatus === 'failed' ? ui.alert({ type: 'warn', title: 'Lộ trình cá nhân hoá chưa sẵn sàng', body: 'AI chưa xếp được lộ trình. Bạn vẫn học được ngay theo thứ tự mặc định của khoá học.', actions: html`<button class="btn btn-secondary btn-sm" data-action="ln-retry-path" data-course="${c.id}">${icon('refresh', { cls: 'icon-sm' })} Thử lại</button>` }) : ''}
      ${r.pathSource === 'default' && r.pathStatus === 'ready' && r.diag.status === 'skipped' && !r.diag.diagCardDismissed ? html`<section class="card"><div class="card-body stack-3" role="status"><div class="row-between"><strong>Cá nhân hoá lộ trình — làm bài kiểm tra đầu vào (~10 phút)</strong><button class="btn btn-ghost btn-icon btn-sm" data-action="ln-dismiss-diag-card" data-course="${c.id}" aria-label="Ẩn thông báo">${icon('x', { cls: 'icon-sm' })}</button></div><p class="small muted">Giúp Codi bỏ qua phần bạn đã biết và tập trung vào phần còn thiếu.</p><button class="btn btn-secondary btn-sm" data-action="ln-take-diag" data-course="${c.id}">Làm bài kiểm tra đầu vào</button></div></section>` : ''}
      ${r.pathSource === 'ai' ? html`<p class="small muted row">${icon('sparkles', { cls: 'icon-sm' })} Thứ tự do AI xếp theo kết quả của bạn, luôn tôn trọng bài học tiên quyết. Mỗi bài có giải thích "Vì sao?".</p>` : ''}
      ${updateNotice(c, r, false)}
      ${complete ? completionCard(c) : ''}
      <div class="stack-4">${groups.map((g) => html`<section class="card"><div class="card-header"><h2 class="ln-h">${g.ch.title}</h2><span class="small muted">${g.ids.filter((id) => r.completed.includes(id)).length}/${g.ids.length} bài</span></div>
        <ol class="list">${g.ids.map((id) => {
          const l = Codi.lesson(c, id); const st = lessonStatus(c, r, l, cur); const lock = st === 'locked' ? lockInfo(c, r, l) : null;
          const concept = l.conceptIds[0];
          return html`<li class="ln-row ${st === 'next' || st === 'active' ? 'is-current' : ''} ${highlight.includes(id) ? 'is-updated' : ''}">
            <span class="ln-row-icon">${icon(TYPE_ICON[l.type] || 'file-text')}</span>
            <div class="od-fill stack-1">
              <div class="row" style="gap:8px">${st === 'locked' ? html`<span class="strong ln-locked-title">${l.title}</span>` : html`<a class="strong" href="#/learn/${c.id}/${l.id}">${l.title}</a>`}${highlight.includes(id) ? html`<span class="badge badge-info">Mới cập nhật</span>` : ''}</div>
              <div class="row xsmall muted" style="gap:12px"><span>${TYPE_LABEL[l.type]} · ${fmt.duration(l.durationMin)}</span>${concept ? ui.mastery(r.mastery[concept] || 0) : ''}</div>
              ${lock ? html`<p class="small">${icon('lock', { cls: 'icon-sm' })} Cần học trước: <a href="#/learn/${c.id}/${lock.lesson.id}">${lock.concept} (${lock.lesson.title})</a></p>`
                : html`<details class="ln-why" ${st === 'next' || st === 'active' ? Codi.raw('open') : ''}><summary>Vì sao?</summary><p class="small">${reasonFor(c, r, id)}</p></details>`}
            </div>
            <div class="ln-row-side">${statusBadge(st)}${st === 'next' || st === 'active' ? html`<a class="btn btn-primary btn-sm" href="#/learn/${c.id}/${l.id}">Học tiếp</a>` : ''}</div>
          </li>`;
        })}</ol></section>`)}</div>
    </div>`;
  }, { title: 'Lộ trình học', role: 'learner' });

  // ───────────────────────── S11 Lesson player ─────────────────────────
  let quizView = { lessonId: null, index: 0, open: false };
  let upload = { lessonId: null, state: 'idle', pct: 0, error: null, fileName: '', fileSize: 0 };
  let videoTimer = null;
  let videoLessonId = null;
  const stopVideo = () => { if (videoTimer) clearInterval(videoTimer); videoTimer = null; };
  const PDF_PAGES = 8;
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function materialView(c, r, l) {
    if (Codi.state.scenario.materials === 'error') {
      return html`<div class="ln-media ln-media-error" role="alert"><div class="stack-2" style="text-align:center">${icon('alert-triangle', { cls: 'icon-lg' })}<strong>Không tải được ${l.type === 'video' ? 'video' : l.type === 'pdf' ? 'tài liệu PDF' : 'nội dung'}</strong><span class="small">Kiểm tra kết nối rồi thử lại. Phần tóm tắt bên dưới vẫn đọc được.</span><button class="btn btn-secondary btn-sm" data-action="ln-retry-material">${icon('refresh', { cls: 'icon-sm' })} Thử lại</button></div></div>`;
    }
    if (l.type === 'video') {
      const pct = r.video[l.id] || 0; const total = l.durationMin * 60;
      const playing = videoTimer && videoLessonId === l.id;
      return html`<div class="ln-media ln-video" data-video="${l.id}">
        <div class="ln-video-screen"><span class="ln-video-title">${l.title}</span>
          <button class="ln-play" data-action="ln-video-toggle" data-course="${c.id}" data-lesson="${l.id}" aria-label="${playing ? 'Tạm dừng' : 'Phát video'}">${icon(playing ? 'pause' : 'play', { cls: 'icon-lg' })}</button></div>
        <div class="ln-video-bar"><div class="progress od-fill" aria-label="Tiến độ video"><span data-video-fill style="width:${pct}%"></span></div><span class="xsmall mono od-nowrap" data-video-time>${mmss((total * pct) / 100)} / ${mmss(total)}</span></div>
        ${pct > 0 && pct < 100 ? html`<p class="xsmall ln-video-note">Tiếp tục từ ${mmss((total * pct) / 100)} — vị trí xem được lưu tự động.</p>` : ''}
      </div>`;
    }
    if (l.type === 'pdf') {
      const page = r.pdf[l.id] || 1;
      return html`<div class="ln-media ln-pdf"><div class="ln-slide"><span class="xsmall muted">Slide ${page}</span><strong>${l.title}</strong><span class="small muted">${page === 1 ? 'Mục tiêu bài học' : page === PDF_PAGES ? 'Tóm tắt và bài tập về nhà' : 'Nội dung chính · phần ' + (page - 1)}</span></div>
        <div class="row-between ln-pdf-nav"><button class="btn btn-secondary btn-sm" data-action="ln-pdf" data-course="${c.id}" data-lesson="${l.id}" data-dir="-1" ${page <= 1 ? Codi.raw('disabled') : ''}>${icon('chevron-left', { cls: 'icon-sm' })} Trang trước</button>
          <span class="small strong">Trang ${page}/${PDF_PAGES}</span>
          <button class="btn btn-secondary btn-sm" data-action="ln-pdf" data-course="${c.id}" data-lesson="${l.id}" data-dir="1" ${page >= PDF_PAGES ? Codi.raw('disabled') : ''}>Trang sau ${icon('chevron-right', { cls: 'icon-sm' })}</button></div></div>`;
    }
    return '';
  }

  function readingText(l) {
    const text = l.reading || 'Phần tóm tắt nhanh của bài: các khái niệm chính, ví dụ minh hoạ và lưu ý thường gặp. Dùng phần này để ôn lại sau khi học xong video hoặc slide.';
    return html`<article class="ln-reading stack-3">${text.split('\n\n').map((para) => html`<p>${para}</p>`)}</article>`;
  }

  function quizSection(c, r, l) {
    const qz = l.quiz; const st = r.quiz[l.id] || { answers: {}, submitted: false, attempts: 0 };
    if (st.submitted) {
      return html`<section class="card" id="quiz"><div class="card-body stack-4">
        <div class="row-between"><h2 class="ln-h">Quiz: kết quả</h2><span class="badge ${st.passed ? 'badge-success' : 'badge-warn'}">${icon(st.passed ? 'check-circle' : 'alert-triangle')}${st.passed ? 'Đạt' : 'Chưa đạt'}</span></div>
        <div class="row">${ui.ring(st.score, { size: 88, ariaLabel: `Điểm ${st.score}%` })}<div class="stack-1"><strong>${st.score}% đúng</strong><span class="small muted">Điểm đạt: ${qz.passingScore}% · Lần làm: ${st.attempts}</span><span class="small muted">Làm lại không giới hạn; lần gần nhất được tính.</span></div></div>
        ${Object.keys(st.answers).length ? html`<ol class="stack-3 ln-review-list">${qz.questions.map((q, i) => { const a = st.answers[q.id]; const ok = a === q.correctIndex; return html`<li class="panel stack-1">
          <strong class="small">Câu ${i + 1}. ${q.text}</strong>
          <span class="small ${ok ? 'text-success' : 'text-danger'}">${icon(ok ? 'check-circle' : 'x-circle', { cls: 'icon-sm' })} Câu trả lời của bạn: ${a === undefined ? 'Chưa trả lời' : q.options[a]}</span>
          ${ok ? '' : html`<span class="small">Đáp án đúng: <strong>${q.options[q.correctIndex]}</strong></span>`}
          <span class="small muted">${q.explanation}</span></li>`; })}</ol>` : html`<p class="small muted">Kết quả từ lần làm trước (không lưu chi tiết từng câu).</p>`}
        <div class="row"><button class="btn btn-secondary" data-action="ln-quiz-retake" data-course="${c.id}" data-lesson="${l.id}">${icon('rotate-ccw', { cls: 'icon-sm' })} Làm lại</button><a class="btn btn-ghost" href="#checklist" data-action="ln-scroll" data-target="checklist">Tiếp tục</a></div>
      </div></section>`;
    }
    if (!(quizView.open && quizView.lessonId === l.id)) {
      return html`<section class="card" id="quiz"><div class="card-body row-between"><div class="stack-1"><h2 class="ln-h">Quiz cuối bài</h2><span class="small muted">${qz.questions.length} câu · điểm đạt ${qz.passingScore}%</span></div>
        <button class="btn btn-primary" data-action="ln-quiz-open" data-lesson="${l.id}">Làm quiz</button></div></section>`;
    }
    const i = Math.min(quizView.index, qz.questions.length - 1); const q = qz.questions[i]; const a = st.answers[q.id];
    return html`<section class="card" id="quiz"><div class="card-body stack-4">
      <div class="stack-2"><div class="row-between"><span class="small strong">Câu ${i + 1}/${qz.questions.length}</span><span class="xsmall muted">${Object.keys(st.answers).length}/${qz.questions.length} đã trả lời</span></div>
        <div class="progress-segments" aria-hidden="true">${qz.questions.map((x, k) => html`<i class="${st.answers[x.id] !== undefined ? 'done' : k === i ? 'current' : ''}"></i>`)}</div></div>
      <h2 class="ln-question">${q.text}</h2>
      <div class="choice-list" role="radiogroup" aria-label="Các lựa chọn">${q.options.map((o, k) => html`<label class="choice ${a === k ? 'is-selected' : ''}"><input type="radio" name="quiz-${q.id}" value="${k}" data-change="ln-quiz-answer" data-course="${c.id}" data-lesson="${l.id}" data-q="${q.id}" ${a === k ? Codi.raw('checked') : ''}><span class="choice-body"><span class="choice-title">${o}</span></span></label>`)}</div>
      <div class="row-between">
        <button class="btn btn-ghost" data-action="ln-quiz-nav" data-dir="-1" ${i === 0 ? Codi.raw('disabled') : ''}>${icon('arrow-left')} Câu trước</button>
        ${i < qz.questions.length - 1 ? html`<button class="btn btn-secondary" data-action="ln-quiz-nav" data-dir="1">Câu tiếp ${icon('arrow-right')}</button>`
          : html`<button class="btn btn-primary" data-action="ln-quiz-submit" data-course="${c.id}" data-lesson="${l.id}">Nộp bài</button>`}
      </div>
    </div></section>`;
  }

  function assignmentSection(c, r, l) {
    const a = l.assignment; const sub = mySubmission(l.id);
    const draft = r.draft[l.id] || {};
    const editing = !sub || (sub.status === 'pending' && draft.resubmit);
    let head = '';
    if (sub && sub.status === 'graded') {
      const pass = sub.score >= (sub.passScore || 5);
      head = html`<div class="ln-grade ${pass ? 'is-pass' : 'is-fail'} stack-2"><div class="row-between"><strong>${icon(pass ? 'check-circle' : 'alert-triangle')} Đã chấm: ${String(sub.score).replace('.', ',')}/${sub.maxScore}</strong><span class="small">Ngưỡng đạt ${sub.passScore || 5}/${sub.maxScore}</span></div>
        <div class="stack-1"><span class="xsmall muted">Nhận xét của giảng viên · ${fmt.date(sub.gradedAt)}</span><p class="small">${sub.feedback || 'Không có nhận xét.'}</p></div>
        <p class="xsmall muted">Bài đã chấm không nộp lại được trong bản thử nghiệm (giả định Q10).</p></div>`;
    } else if (sub && !editing) {
      head = html`${ui.alert({ type: 'info', title: 'Đã nộp — chờ chấm', body: `Nộp lúc ${fmt.datetime(sub.submittedAt)}. Bạn đã có thể hoàn thành bài học; điểm sẽ có sau khi giảng viên chấm.` })}
        <ul class="small stack-1">${sub.fileName ? html`<li>${icon('file-text', { cls: 'icon-sm' })} ${sub.fileName}</li>` : ''}${sub.link ? html`<li>${icon('link', { cls: 'icon-sm' })} ${sub.link}</li>` : ''}${sub.note ? html`<li>${icon('message-circle', { cls: 'icon-sm' })} ${sub.note}</li>` : ''}</ul>
        <button class="btn btn-secondary btn-sm" data-action="ln-resubmit" data-course="${c.id}" data-lesson="${l.id}">Nộp lại (trước khi được chấm)</button>`;
    }
    const up = upload.lessonId === l.id ? upload : { state: 'idle' };
    const fileName = up.fileName || draft.fileName || '';
    const ready = (!a.requiresFile || (fileName && up.state !== 'error')) && (!a.requiresLink || draft.link) && (a.requiresFile || a.requiresLink || fileName || draft.link);
    const form = editing ? html`<form class="stack-4" data-submit="ln-assign-submit" data-course="${c.id}" data-lesson="${l.id}" novalidate>
      ${a.requiresFile || !a.requiresLink ? html`<div class="field"><label for="as-file">Tệp bài làm ${a.requiresFile ? html`<span class="req">*</span>` : html`<span class="muted">(không bắt buộc)</span>`}</label>
        <input id="as-file" type="file" data-change="ln-assign-file" data-course="${c.id}" data-lesson="${l.id}">
        ${fileName ? html`<span class="small">${icon('file-text', { cls: 'icon-sm' })} ${fileName}</span>` : html`<span class="field-help">${a.acceptedTypes || 'Mọi loại tệp'} · tối đa 20MB</span>`}
        ${up.state === 'uploading' ? html`<div class="stack-1" role="status"><div class="progress"><span style="width:${up.pct}%"></span></div><span class="xsmall muted">Đang tải lên… ${up.pct}%</span></div>` : ''}
        ${up.state === 'error' ? html`<p class="field-error" role="alert">${icon('alert-circle', { cls: 'icon-sm' })}<span>${up.error} <button type="button" class="btn-link" data-action="ln-upload-retry" data-course="${c.id}" data-lesson="${l.id}">Thử lại</button></span></p>` : ''}
      </div>` : ''}
      ${a.requiresLink || !a.requiresFile ? html`<div class="field"><label for="as-link">Đường dẫn bài làm ${a.requiresLink ? html`<span class="req">*</span>` : html`<span class="muted">(không bắt buộc)</span>`}</label>
        <input id="as-link" name="link" type="url" value="${draft.link || ''}" placeholder="https://github.com/…" data-input="ln-assign-draft" data-course="${c.id}" data-lesson="${l.id}" data-field="link"></div>` : ''}
      <div class="field"><label for="as-note">Ghi chú cho giảng viên <span class="muted">(không bắt buộc)</span></label>
        <textarea id="as-note" name="note" rows="3" data-input="ln-assign-draft" data-course="${c.id}" data-lesson="${l.id}" data-field="note">${draft.note || ''}</textarea><span class="field-help">Bản nháp được lưu tự động.</span></div>
      <div class="row"><button class="btn btn-primary" type="submit" data-assign-submit ${ready && up.state !== 'uploading' ? '' : Codi.raw('disabled')}>Nộp bài tập</button>
        ${!ready ? html`<span class="small muted" data-assign-hint>Cần ${[a.requiresFile && !fileName ? 'tệp bài làm' : '', a.requiresLink && !draft.link ? 'đường dẫn' : ''].filter(Boolean).join(' và ') || 'tệp hoặc đường dẫn'} trước khi nộp.</span>` : ''}
        ${sub ? html`<button type="button" class="btn btn-ghost" data-action="ln-resubmit-cancel" data-course="${c.id}" data-lesson="${l.id}">Huỷ nộp lại</button>` : ''}</div>
    </form>` : '';
    return html`<section class="card" id="assignment"><div class="card-body stack-4">
      <h2 class="ln-h">Bài tập</h2>
      <div class="panel stack-1"><span class="xsmall muted">Yêu cầu</span><p class="small">${a.instructions}</p></div>
      ${a.maxScore ? html`<p class="xsmall muted">Điểm đạt ${a.passScore}/${a.maxScore} · hạn nộp ${a.dueDays} ngày sau khi mở bài · nộp muộn: ${{ accept: 'vẫn nhận, không trừ điểm', penalty: `trừ ${a.latePenalty}% điểm`, reject: 'không nhận' }[a.latePolicy] || 'vẫn nhận'}</p>` : ''}
      ${(a.rubric || []).length ? html`<details class="panel ln-rubric" ${sub && sub.status === 'graded' ? Codi.raw('open') : ''}><summary class="small strong">Thang chấm · ${a.rubric.length} tiêu chí</summary>
        <ul class="list">${a.rubric.map((k) => html`<li class="list-row"><div class="list-main"><strong class="small">${k.name}</strong><span class="xsmall muted">${k.desc}</span></div>
          <span class="small od-nowrap">${sub && sub.status === 'graded' && sub.rubricScores && sub.rubricScores[k.id] != null ? html`<strong>${String(sub.rubricScores[k.id]).replace('.', ',')}</strong>/${k.points}` : `${k.points} điểm`}</span></li>`)}</ul></details>` : ''}
      ${head}${form}
    </div></section>`;
  }

  // inSheet: the list is shown in the "Danh sách bài học" sheet; picking a lesson closes the sheet
  // (data-close) so it never stays open over the next lesson with the old one highlighted.
  function sidebarList(c, r, activeId, inSheet) {
    const order = orderOf(c, r); const cur = currentLessonId(c, r);
    return html`<ol class="list ln-side-list">${order.map((id, i) => {
      const l = Codi.lesson(c, id); const st = lessonStatus(c, r, l, cur);
      return html`<li><a href="#/learn/${c.id}/${id}" class="ln-side-item ${id === activeId ? 'is-active' : ''}" ${id === activeId ? Codi.raw('aria-current="page"') : ''} ${inSheet ? Codi.raw('data-close') : ''}>
        <span class="ln-side-check">${st === 'done' ? icon('check-circle', { cls: 'icon-sm text-success' }) : st === 'locked' ? icon('lock', { cls: 'icon-sm' }) : html`<span class="xsmall">${i + 1}</span>`}</span>
        <span class="od-fill stack-1"><span class="small od-clamp-2">${l.title}</span><span class="xsmall muted">${TYPE_LABEL[l.type]} · ${fmt.duration(l.durationMin)}${st === 'skippable' ? ' · có thể bỏ qua' : ''}</span></span></a></li>`;
    })}</ol>`;
  }

  Codi.route('/learn/:courseId/:lessonId', (p) => {
    const c = Codi.course(p.courseId);
    if (!c) return notFound();
    if (!Codi.isEnrolled(c.id)) return notEnrolled(c);
    const r = rec(c.id);
    const l = Codi.lesson(c, p.lessonId);
    if (!l) return html`<div class="page page-narrow">${ui.empty({ icon: 'map', title: 'Không tìm thấy bài học', actions: html`<a class="btn btn-primary" href="#/learn/${c.id}">Về lộ trình</a>` })}</div>`;
    if (r.pathStatus === 'none') return html`<div class="page page-narrow">${ui.empty({ icon: 'route', title: 'Thiết lập lộ trình trước khi học', body: 'Chỉ mất vài phút: đặt mục tiêu và làm bài kiểm tra đầu vào.', actions: html`<a class="btn btn-primary" href="#/learn/${c.id}/onboarding">Bắt đầu thiết lập</a>` })}</div>`;
    const lock = lockInfo(c, r, l);
    if (lock && !r.completed.includes(l.id)) {
      return html`<div class="page page-narrow">${ui.empty({ icon: 'lock', title: 'Bài học này đang bị khoá', body: `Bạn cần học "${lock.concept}" trước (bài "${lock.lesson.title}"). Codi giữ đúng thứ tự bài học tiên quyết của khoá học.`, actions: html`<a class="btn btn-primary" href="#/learn/${c.id}/${lock.lesson.id}">Đến bài cần học trước</a><a class="btn btn-secondary" href="#/learn/${c.id}">Về lộ trình</a>` })}</div>`;
    }
    if (r.lastActive !== new Date().toISOString().slice(0, 10)) { r.lastActive = new Date().toISOString(); }
    const order = orderOf(c, r); const idx = order.indexOf(l.id);
    const prev = idx > 0 ? order[idx - 1] : null; const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
    const prog = Codi.courseProgress(c.id);
    const items = checklist(r, l);
    const missing = items.filter((x) => !x.done).map((x) => x.label);
    const done = r.completed.includes(l.id);
    const chapter = Codi.chapterOf(c, l.id);
    Codi.onMount(() => { if (videoTimer && videoLessonId !== l.id) stopVideo(); });
    return html`<div class="ln-player">
      <aside class="ln-side" aria-label="Danh sách bài học">
        <div class="ln-side-head"><a class="small ln-side-back" href="#/learn/${c.id}">${icon('arrow-left', { cls: 'icon-sm' })} Về lộ trình</a><strong class="ln-side-course">${c.title}</strong>${ui.progress(prog.pct)}<span class="xsmall muted">${prog.done}/${prog.total} bài</span></div>
        ${sidebarList(c, r, l.id)}
      </aside>
      <div class="ln-main">
        <div class="ln-topbar">
          <button class="btn btn-secondary btn-sm ln-mobile-only" data-action="ln-lesson-sheet" data-course="${c.id}" data-lesson="${l.id}">${icon('list', { cls: 'icon-sm' })} Danh sách bài học</button>
          <div class="row" style="gap:4px">
            <a class="btn btn-ghost btn-sm ${prev ? '' : 'is-disabled'}" ${prev ? Codi.raw(`href="#/learn/${c.id}/${prev}"`) : Codi.raw('aria-disabled="true"')}>${icon('chevron-left', { cls: 'icon-sm' })} Bài trước</a>
            <a class="btn btn-ghost btn-sm ${next ? '' : 'is-disabled'}" ${next ? Codi.raw(`href="#/learn/${c.id}/${next}"`) : Codi.raw('aria-disabled="true"')}>Bài sau ${icon('chevron-right', { cls: 'icon-sm' })}</a>
          </div>
          <div class="row" style="gap:4px;margin-left:auto">
            <button class="btn btn-secondary btn-sm" data-action="ln-panel" data-panel="ai" data-course="${c.id}" data-lesson="${l.id}">${icon('sparkles', { cls: 'icon-sm' })} AI trợ lý</button>
            <button class="btn btn-secondary btn-sm" data-action="ln-panel" data-panel="qa" data-course="${c.id}" data-lesson="${l.id}">${icon('message-circle', { cls: 'icon-sm' })} Hỏi đáp</button>
          </div>
        </div>
        <div class="ln-content stack-4 ${l.code ? 'is-wide' : ''}">
          ${r.lastUpdate && r.lastUpdate.afterLessonId === l.id ? updateNotice(c, r, true) : ''}
          ${done && isCourseComplete(c, r) && r.lastUpdate && r.lastUpdate.afterLessonId === l.id ? completionCard(c) : ''}
          <header class="stack-1"><span class="xsmall muted">${chapter ? chapter.title : ''} · ${TYPE_LABEL[l.type]} · ${fmt.duration(l.durationMin)}</span><h1 class="ln-title">${l.title}</h1></header>
          ${l.code ? Codi.code.view(c, l) : html`
          ${materialView(c, r, l)}
          ${l.type !== 'reading' ? html`<details class="card ln-notes" ${Codi.state.scenario.materials === 'error' ? Codi.raw('open') : ''}><summary class="card-body compact strong">Tóm tắt bài học (bài đọc)</summary><div class="card-body compact">${readingText(l)}</div></details>` : html`<div class="card"><div class="card-body">${readingText(l)}</div></div>`}
          <div class="row">${r.studied.includes(l.id) ? html`<span class="badge badge-success">${icon('check')}Đã học xong nội dung</span>` : html`<button class="btn btn-secondary" data-action="ln-mark-studied" data-course="${c.id}" data-lesson="${l.id}">${icon('check', { cls: 'icon-sm' })} Đánh dấu đã học xong</button>`}</div>`}
          ${l.quiz ? quizSection(c, r, l) : ''}
          ${l.assignment ? assignmentSection(c, r, l) : ''}
          <section class="card ln-checklist" id="checklist"><div class="card-body stack-3">
            <h2 class="ln-h">Để hoàn thành bài học</h2>
            <ol class="ln-check-items">${items.map((it) => html`<li class="${it.done ? 'is-done' : ''}">${icon(it.done ? 'check-circle' : 'circle', { cls: it.done ? 'text-success' : '' })}<span>${it.label}</span>${it.note ? html`<span class="xsmall muted">${it.note}</span>` : ''}<span class="sr-only">${it.done ? 'đã xong' : 'chưa xong'}</span></li>`)}</ol>
            ${done ? html`<p class="row strong text-success">${icon('check-circle')} Đã hoàn thành bài học</p>${next ? html`<a class="btn btn-primary" href="#/learn/${c.id}/${next}">Bài tiếp theo</a>` : ''}`
              : html`<div class="ln-complete-bar"><button class="btn btn-primary btn-lg" data-action="ln-complete" data-course="${c.id}" data-lesson="${l.id}" ${missing.length ? Codi.raw('disabled') : ''}>Hoàn thành bài học</button>${missing.length ? html`<span class="small muted">Còn thiếu: ${missing.join(', ')}</span>` : html`<span class="small text-success">Bạn đã đủ điều kiện hoàn thành bài học.</span>`}</div>`}
          </div></section>
        </div>
      </div>
    </div>`;
  }, { title: 'Bài học', role: 'learner' });

  // ───────────────────────── S11a/S11b side panels ─────────────────────────
  // The AI trợ lý panel lives in ai-tutor.js (Codi.tutor); this file only keeps the public Hỏi đáp panel.
  let panel = null;  // { kind: 'qa', courseId, lessonId, handle, qaError }
  function qaBody(c, l) {
    const qs = Codi.db().questions.filter((q) => q.lessonId === l.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const err = panel && panel.qaError;
    return html`<div class="stack-4">
      <form class="stack-2 field ${err ? 'is-invalid' : ''}" data-submit="ln-qa-post" novalidate><label for="qa-text">Câu hỏi của bạn về bài "${l.title}"</label>
        <textarea id="qa-text" name="text" rows="3" placeholder="Mô tả chỗ bạn chưa hiểu, kèm đoạn mã nếu có"></textarea>
        ${err ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${err}</span></p>` : html`<span class="field-help">Giảng viên và học viên cùng khoá đều xem được câu hỏi.</span>`}
        <button class="btn btn-primary" type="submit">Gửi câu hỏi</button></form>
      ${qs.length ? html`<ul class="list stack-3">${qs.map((q) => { const u = Codi.user(q.userId) || { name: 'Học viên' }; return html`<li class="panel stack-2">
        <div class="row">${ui.avatar(u, 'sm')}<strong class="small">${u.name}${q.userId === uid() ? ' (bạn)' : ''}</strong><span class="xsmall muted">${fmt.relative(q.createdAt)}</span>
          <span class="badge ${q.status === 'answered' ? 'badge-success' : 'badge-warn'}" style="margin-left:auto">${q.status === 'answered' ? 'Đã trả lời' : 'Đang chờ giảng viên trả lời'}</span></div>
        <p class="small">${q.text}</p>
        ${q.replies.map((rp) => { const ru = Codi.user(rp.userId) || { name: '' }; return html`<div class="ln-reply stack-1"><span class="row xsmall"><strong>${ru.name}</strong>${rp.isLecturer ? html`<span class="badge badge-accent">Giảng viên</span>` : ''}<span class="muted">${fmt.relative(rp.at)}</span></span><p class="small">${rp.text}</p></div>`; })}
      </li>`; })}</ul>` : ui.empty({ icon: 'message-circle', title: 'Hãy là người đầu tiên đặt câu hỏi', body: 'Câu hỏi về bài học này sẽ hiện ở đây.' })}
    </div>`;
  }
  function refreshPanel() {
    if (!panel || !panel.handle) return;
    const c = Codi.course(panel.courseId); const l = Codi.lesson(c, panel.lessonId);
    panel.handle.setBody(qaBody(c, l));
  }
  function openPanel(kind, courseId, lessonId) {
    if (kind === 'ai') { Codi.tutor.open(courseId, lessonId); return; }
    ui.closeAll();
    const c = Codi.course(courseId); const l = Codi.lesson(c, lessonId);
    const p = { kind: 'qa', courseId, lessonId };
    panel = p;
    // docked: on desktop the panel sits beside the lesson, which stays visible and usable
    p.handle = ui.sheet({ docked: true, title: 'Hỏi đáp', body: qaBody(c, l), onClose: () => { if (panel === p) panel = null; } });
  }

  // ───────────────────────── S13 Progress & results ─────────────────────────
  Codi.route('/progress', (p, q) => {
    const u = Codi.currentUser();
    const tab = q.tab === 'done' ? 'done' : 'active';
    const items = Codi.db().enrolments.filter((e) => e.userId === u.id).map((e) => Codi.course(e.courseId)).filter(Boolean).map((c) => ({ c, p: Codi.courseProgress(c.id), r: rec(c.id) }));
    const list = items.filter((x) => (tab === 'done' ? x.p.completed : !x.p.completed));
    return html`<div class="page stack-4">
      <div class="page-header"><div><h1>Tiến độ & kết quả</h1><p class="muted">Điểm quiz, bài tập, nhận xét của giảng viên và mức thành thạo — tất cả ở một nơi.</p></div>
      <div class="row"><a class="btn btn-secondary btn-sm" href="#/insights">${icon('bar-chart', { cls: 'icon-sm' })} Xem thống kê</a></div></div>
      <div class="tabs" role="tablist"><a class="tab" role="tab" href="#/progress" aria-selected="${tab === 'active'}">Đang học <span class="count">${items.filter((x) => !x.p.completed).length}</span></a><a class="tab" role="tab" href="#/progress?tab=done" aria-selected="${tab === 'done'}">Đã hoàn thành <span class="count">${items.filter((x) => x.p.completed).length}</span></a></div>
      ${!list.length ? html`<div class="card">${ui.empty({ icon: 'bar-chart', title: tab === 'done' ? 'Chưa có khoá học hoàn thành' : 'Chưa có khoá học đang học', body: tab === 'done' ? 'Khoá học bạn hoàn thành sẽ xuất hiện ở đây.' : 'Đăng ký một khoá học để bắt đầu.', actions: html`<a class="btn btn-primary" href="#/courses">Khám phá khoá học</a>` })}</div>`
      : html`<div class="stack-3">${list.map(({ c, p: pr, r }, i) => html`<details class="card ln-acc" ${i === 0 ? Codi.raw('open') : ''}>
        <summary class="card-body compact row"><span class="od-fill stack-1"><strong>${c.title}</strong><span class="xsmall muted">${pr.done}/${pr.total} bài · ${goalLabel(r.goal)}</span></span><span style="width:160px">${ui.progress(pr.pct)}</span>${icon('chevron-down', { cls: 'icon-sm' })}</summary>
        <div class="card-body stack-4" style="border-top:1px solid var(--border)">
          ${(c.concepts || []).length ? html`<div class="stack-2"><strong class="small">Mức thành thạo theo khái niệm</strong><div class="ln-mastery-grid">${c.concepts.map((k) => html`<div class="row-between small"><span>${k.name}</span>${ui.mastery(r.mastery[k.id] || 0)}</div>`)}</div></div>` : ''}
          <div class="table-wrap"><table class="table"><thead><tr><th>Bài học</th><th>Trạng thái</th><th>Quiz</th><th>Bài tập</th></tr></thead><tbody>
            ${orderOf(c, r).map((id) => { const l = Codi.lesson(c, id); const s = l.assignment ? mySubmission(id) : null; const qz = r.quiz[id]; return html`<tr>
              <td><a href="#/learn/${c.id}/${id}">${l.title}</a></td>
              <td>${r.completed.includes(id) ? html`<span class="badge badge-success">${icon('check')}Hoàn thành</span>` : html`<span class="small muted">Chưa hoàn thành</span>`}</td>
              <td class="od-nowrap">${l.quiz ? (qz && qz.submitted ? html`<span class="${qz.passed ? 'text-success' : 'text-warn'}">${qz.score}% · ${qz.passed ? 'Đạt' : 'Chưa đạt'}</span>` : html`<span class="muted">Chưa làm</span>`) : html`<span class="muted">—</span>`}</td>
              <td>${!l.assignment ? html`<span class="muted">—</span>` : !s ? html`<span class="muted">Chưa nộp</span>` : s.status === 'pending' ? html`<span class="badge badge-warn">Chờ chấm</span>`
                : html`<div class="stack-1"><strong>${String(s.score).replace('.', ',')}/${s.maxScore}</strong>${s.feedback ? html`<span class="small muted">${s.feedback}</span>` : ''}</div>`}</td></tr>`; })}
          </tbody></table></div>
          <div class="row"><a class="btn btn-secondary btn-sm" href="#/learn/${c.id}">Mở lộ trình</a></div>
        </div></details>`)}</div>`}
    </div>`;
  }, { title: 'Tiến độ & kết quả', role: 'learner' });

  // ───────────────────────── review (S14) ─────────────────────────
  function openReview(courseId, stars) {
    const c = Codi.course(courseId);
    const mine = Codi.db().reviews.find((x) => x.courseId === courseId && x.userId === uid());
    let val = stars || (mine ? mine.stars : 0);
    const body = () => html`<form class="stack-4" id="review-form" novalidate>
      <div class="stack-2"><span class="field-label">Đánh giá của bạn <span class="req">*</span></span>
        <div class="star-input" role="radiogroup" aria-label="Số sao">${[1, 2, 3, 4, 5].map((n) => html`<button type="button" role="radio" aria-checked="${val === n}" class="${n <= val ? 'on' : ''}" data-star="${n}" aria-label="${n} sao">${icon(n <= val ? 'star-filled' : 'star')}</button>`)}</div>
        ${val ? '' : html`<span class="field-help">Chọn số sao để gửi đánh giá.</span>`}</div>
      <div class="field"><label for="rv-text">Nhận xét <span class="muted">(không bắt buộc)</span></label><textarea id="rv-text" rows="4">${mine ? mine.text : ''}</textarea></div>
    </form>`;
    ui.modal({
      title: mine ? 'Sửa đánh giá' : `Đánh giá "${c.title}"`, body: body(),
      footer: html`<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn btn-primary" data-review-save>${mine ? 'Lưu thay đổi' : 'Gửi đánh giá'}</button>`,
      onMount(h) {
        const sync = () => { const t = h.el.querySelector('#rv-text').value; h.setBody(body()); h.el.querySelector('#rv-text').value = t; h.el.querySelector('[data-review-save]').disabled = !val; };
        h.el.addEventListener('click', (e) => { const b = e.target.closest('[data-star]'); if (b) { val = Number(b.dataset.star); sync(); } });
        h.el.querySelector('[data-review-save]').disabled = !val;
        h.el.querySelector('[data-review-save]').addEventListener('click', () => {
          if (!val) return;
          const text = h.el.querySelector('#rv-text').value.trim();
          Codi.set((st) => {
            if (mine) { mine.stars = val; mine.text = text; }
            else st.db.reviews.push({ id: Codi.uid('rv'), courseId, userId: uid(), stars: val, text, createdAt: new Date().toISOString(), reply: null });
            const rs = st.db.reviews.filter((x) => x.courseId === courseId);
            c.ratingCount = Math.max(c.ratingCount, rs.length);
          });
          h.close();
          ui.toast(mine ? 'Đã cập nhật đánh giá.' : 'Cảm ơn bạn! Đánh giá đã hiển thị trên trang khoá học.', { type: 'success' });
        });
      },
    });
  }

  // ───────────────────────── actions ─────────────────────────
  const R = (el) => rec(el.dataset.course);
  // Goal setup
  Codi.action('ln-goal-pick', (el) => { const r = R(el); r.goalDraft = Object.assign({}, r.goalDraft, { [el.dataset.key]: el.dataset.key === 'hours' ? Number(el.dataset.value) : el.dataset.value }); save(); });
  Codi.action('ln-goal-back', (el) => { const r = R(el); r.goalStep = Math.max(0, (r.goalStep || 0) - 1); save(); });
  Codi.action('ln-goal-skip', (el) => {
    const r = R(el); const id = el.dataset.course;
    // Set defaults and move to start fork
    const defaults = { goal: GOALS[1][0], level: LEVELS[0][0], hours: HOURS[1] };
    r.goal = defaults; r.goalDraft = {}; r.goalStep = 0;
    r.diag.status = 'fork';
    save(false); Codi.rerender();
  });
  Codi.action('ln-goal-next', (el) => {
    const r = R(el); const id = el.dataset.course;
    if ((r.goalStep || 0) < 2) { r.goalStep = (r.goalStep || 0) + 1; save(); return; }
    r.goal = Object.assign({}, r.goalDraft); r.goalStep = 0;
    if (r.goalEditing) { r.goalEditing = false; generatePath(id); Codi.go('/learn/' + id); ui.toast('Đã lưu mục tiêu. Codi đang xếp lại lộ trình.'); return; }
    // Move to start fork (S08b)
    r.diag.status = 'fork';
    save(false); Codi.rerender();
  });
  Codi.action('ln-fork-default', (el) => {
    const r = R(el); const id = el.dataset.course;
    r.diag.status = 'skipped'; r.pathStatus = 'ready'; r.pathSource = 'default';
    const c = Codi.course(id);
    r.order = c.defaultOrder.slice(); r.skippable = [];
    save(false); Codi.go('/learn/' + id);
  });
  Codi.action('ln-fork-diagnostic', (el) => {
    const r = R(el); const id = el.dataset.course;
    r.diag.status = 'intro'; r.diag.index = 0; r.diag.answers = {};
    save(false); Codi.go('/learn/' + id + '/onboarding?view=intro');
  });
  Codi.action('ln-edit-goal', async (el) => {
    const res = await ui.confirm({ title: 'Chỉnh mục tiêu học tập?', body: 'Bạn sẽ chọn lại mục tiêu, trình độ và thời gian mỗi tuần.', consequence: 'Sau khi lưu, Codi xếp lại thứ tự các bài chưa học. Bài đã hoàn thành và điểm số giữ nguyên.', reversible: 'Bạn có thể chỉnh lại bất cứ lúc nào.', confirmLabel: 'Chỉnh mục tiêu' });
    if (!res.ok) return;
    const r = R(el); r.goalEditing = true; r.goalStep = 0; r.goalDraft = Object.assign({}, r.goal);
    save(false); Codi.go('/learn/' + el.dataset.course + '/onboarding');
  });
  // Diagnostic
  Codi.action('ln-diag-start', (el) => { const r = R(el); r.diag.status = 'in-progress'; save(false); Codi.go('/learn/' + el.dataset.course + '/onboarding'); });
  Codi.action('ln-diag-skip', (el) => {
    const c = Codi.course(el.dataset.course); const r = R(el);
    r.diag.status = 'skipped';
    // Postponing a retake never throws away a personalised path (D11); default order only when there is no AI path yet.
    if (!(r.pathSource === 'ai' && r.order && r.order.length)) { r.pathStatus = 'ready'; r.pathSource = 'default'; r.order = c.defaultOrder.slice(); r.skippable = []; }
    save(false); Codi.go('/learn/' + c.id);
  });
  Codi.action('ln-take-diag', (el) => { const r = R(el); r.diag = { status: 'intro', index: 0, answers: {}, diagCardDismissed: r.diag.diagCardDismissed }; save(false); Codi.go('/learn/' + el.dataset.course + '/onboarding?view=intro'); });
  Codi.action('ln-dismiss-diag-card', (el) => { const r = R(el); r.diag.diagCardDismissed = true; save(); });
  Codi.action('ln-diag-answer', (el) => {
    const r = R(el); r.diag.answers[el.dataset.q] = el.value === 'unknown' ? 'unknown' : Number(el.value);
    save(false);
    el.closest('.choice-list').querySelectorAll('.choice').forEach((x) => x.classList.toggle('is-selected', x.contains(el)));
    const next = document.querySelector('[data-action="ln-diag-next"]'); if (next) next.disabled = false;
  });
  Codi.action('ln-diag-prev', (el) => { const r = R(el); r.diag.index = Math.max(0, r.diag.index - 1); save(); });
  Codi.action('ln-diag-next', (el) => {
    const c = Codi.course(el.dataset.course); const r = R(el); const qs = c.entryTest.questions;
    if (r.diag.index < qs.length - 1) { r.diag.index += 1; save(); return; }
    // Finish: compute mastery per tested concept (right → 3, wrong → 1, "Tôi chưa biết" → 0).
    const m = {};
    qs.forEach((q) => { const a = r.diag.answers[q.id]; const lv = a === q.correctIndex ? 3 : a === 'unknown' || a === undefined ? 0 : 1; m[q.conceptId] = Math.max(m[q.conceptId] === undefined ? 0 : m[q.conceptId], lv); });
    r.mastery = Object.assign({}, r.mastery, m); r.diag.status = 'done';
    save(false); Codi.go('/learn/' + c.id + '/onboarding?view=result');
  });
  Codi.action('ln-make-path', (el) => { generatePath(el.dataset.course); Codi.go('/learn/' + el.dataset.course); });
  Codi.action('ln-retry-path', (el) => { generatePath(el.dataset.course); Codi.rerender(); });
  Codi.action('ln-dismiss-update', (el) => { const r = R(el); r.lastUpdate = null; save(); });

  // Player: materials
  Codi.action('ln-retry-material', (el) => { el.setAttribute('aria-busy', 'true'); el.disabled = true; setTimeout(() => { Codi.rerender(); if (Codi.state.scenario.materials === 'error') ui.toast('Vẫn chưa tải được tài liệu. Bạn có thể đọc phần tóm tắt trong lúc chờ.', { type: 'warn' }); }, 900); });
  const markStudied = (courseId, lessonId, render) => { const r = rec(courseId); if (!r.studied.includes(lessonId)) { r.studied.push(lessonId); save(render); ui.toast('Đã đánh dấu học xong nội dung.', { type: 'success' }); } };
  Codi.action('ln-mark-studied', (el) => markStudied(el.dataset.course, el.dataset.lesson));
  Codi.action('ln-video-toggle', (el) => {
    const courseId = el.dataset.course; const lessonId = el.dataset.lesson;
    if (videoTimer) { stopVideo(); save(); return; }
    videoLessonId = lessonId;
    const total = Codi.lesson(Codi.course(courseId), lessonId).durationMin * 60;
    const r = rec(courseId); if ((r.video[lessonId] || 0) >= 100) r.video[lessonId] = 0;
    videoTimer = setInterval(() => {
      if (Codi.path() !== `/learn/${courseId}/${lessonId}`) { stopVideo(); save(false); return; }
      const rr = rec(courseId); rr.video[lessonId] = Math.min(100, (rr.video[lessonId] || 0) + 4);
      const fill = document.querySelector('[data-video-fill]'); const time = document.querySelector('[data-video-time]');
      if (fill) fill.style.width = rr.video[lessonId] + '%';
      if (time) time.textContent = `${mmss((total * rr.video[lessonId]) / 100)} / ${mmss(total)}`;
      if (rr.video[lessonId] >= 100) { stopVideo(); markStudied(courseId, lessonId, true); }
      else save(false);
    }, 400);
    Codi.rerender();
  });
  Codi.action('ln-pdf', (el) => {
    const r = R(el); const id = el.dataset.lesson;
    r.pdf[id] = Math.max(1, Math.min(PDF_PAGES, (r.pdf[id] || 1) + Number(el.dataset.dir)));
    if (r.pdf[id] === PDF_PAGES && !r.studied.includes(id)) { r.studied.push(id); ui.toast('Bạn đã xem hết tài liệu — đã đánh dấu học xong.', { type: 'success' }); }
    save();
  });
  Codi.action('ln-lesson-sheet', (el) => {
    const c = Codi.course(el.dataset.course);
    // opens on the left (where the sidebar normally is), so an open AI / Q&A panel on the right stays visible
    ui.sheet({ title: 'Danh sách bài học', side: 'left', body: sidebarList(c, rec(c.id), el.dataset.lesson, true),
      onMount(h) { const a = h.el.querySelector('.ln-side-item.is-active'); if (a) { a.scrollIntoView({ block: 'center' }); a.focus(); } } });
  });
  Codi.action('ln-scroll', (el) => { const t = document.getElementById(el.dataset.target); if (t) t.scrollIntoView({ behavior: 'smooth' }); });

  // Quiz
  Codi.action('ln-quiz-open', (el) => { quizView = { lessonId: el.dataset.lesson, index: 0, open: true }; Codi.rerender(); const q = document.getElementById('quiz'); if (q) q.scrollIntoView(); });
  Codi.action('ln-quiz-nav', (el) => { quizView.index = Math.max(0, quizView.index + Number(el.dataset.dir)); Codi.rerender(); });
  Codi.action('ln-quiz-answer', (el) => {
    const r = R(el); const lid = el.dataset.lesson;
    if (!r.quiz[lid]) r.quiz[lid] = { answers: {}, submitted: false, attempts: 0 };
    r.quiz[lid].answers[el.dataset.q] = Number(el.value);
    save(false);
    el.closest('.choice-list').querySelectorAll('.choice').forEach((x) => x.classList.toggle('is-selected', x.contains(el)));
  });
  Codi.action('ln-quiz-submit', async (el) => {
    const c = Codi.course(el.dataset.course); const l = Codi.lesson(c, el.dataset.lesson); const r = rec(c.id);
    if (!r.quiz[l.id]) r.quiz[l.id] = { answers: {}, submitted: false, attempts: 0 };
    const st = r.quiz[l.id];
    const missing = l.quiz.questions.filter((q) => st.answers[q.id] === undefined).length;
    if (missing) {
      const res = await ui.confirm({ title: `Còn ${missing} câu chưa trả lời`, body: 'Câu chưa trả lời sẽ được tính là sai. Bạn muốn nộp bài ngay?', confirmLabel: 'Vẫn nộp bài', cancelLabel: 'Quay lại làm tiếp' });
      if (!res.ok) return;
    }
    const right = l.quiz.questions.filter((q) => st.answers[q.id] === q.correctIndex).length;
    st.score = Math.round((right / l.quiz.questions.length) * 100); st.passed = st.score >= l.quiz.passingScore; st.submitted = true; st.attempts = (st.attempts || 0) + 1;
    quizView = { lessonId: null, index: 0, open: false };
    save();
    ui.toast(st.passed ? `Bạn đạt ${st.score}%. Tốt lắm!` : `Bạn đạt ${st.score}%, chưa đến ${l.quiz.passingScore}%. Có thể làm lại.`, { type: st.passed ? 'success' : 'warn' });
  });
  Codi.action('ln-quiz-retake', (el) => { const r = R(el); const st = r.quiz[el.dataset.lesson]; st.submitted = false; st.answers = {}; quizView = { lessonId: el.dataset.lesson, index: 0, open: true }; save(); });

  // Assignment
  function runUpload(courseId, lessonId) {
    const f = upload;
    if (f.fileSize > 20 * 1024 * 1024 || /loi/i.test(f.fileName)) {
      upload = Object.assign({}, f, { state: 'uploading', pct: 0 });
      Codi.rerender();
      setTimeout(() => { upload = Object.assign({}, upload, { state: 'error', error: f.fileSize > 20 * 1024 * 1024 ? 'Tệp vượt quá 20MB. Hãy nén lại hoặc nộp đường dẫn.' : 'Tải lên thất bại do mất kết nối.' }); Codi.rerender(); }, 900);
      return;
    }
    upload = Object.assign({}, f, { state: 'uploading', pct: 0 });
    const t = setInterval(() => {
      upload.pct = Math.min(100, upload.pct + 25);
      if (upload.pct >= 100) { clearInterval(t); upload.state = 'done'; const r = rec(courseId); r.draft[lessonId] = Object.assign({}, r.draft[lessonId], { fileName: upload.fileName }); save(Codi.path() === `/learn/${courseId}/${lessonId}`); }
      else if (Codi.path() === `/learn/${courseId}/${lessonId}`) Codi.rerender();
    }, 300);
    Codi.rerender();
  }
  Codi.action('ln-assign-file', (el) => {
    const file = el.files && el.files[0]; if (!file) return;
    upload = { lessonId: el.dataset.lesson, state: 'idle', pct: 0, error: null, fileName: file.name, fileSize: file.size };
    runUpload(el.dataset.course, el.dataset.lesson);
  });
  Codi.action('ln-upload-retry', (el) => runUpload(el.dataset.course, el.dataset.lesson));
  Codi.action('ln-assign-draft', (el) => {
    const r = R(el); const id = el.dataset.lesson;
    r.draft[id] = Object.assign({}, r.draft[id], { [el.dataset.field]: el.value });
    save(false);
    // Update the submit gate in place (no re-render while typing).
    const l = Codi.lesson(Codi.course(el.dataset.course), id); const a = l.assignment; const d = r.draft[id];
    const fileName = (upload.lessonId === id && upload.state === 'done' ? upload.fileName : '') || d.fileName;
    const ok = (!a.requiresFile || fileName) && (!a.requiresLink || (d.link || '').trim()) && (a.requiresFile || a.requiresLink || fileName || (d.link || '').trim());
    const btn = document.querySelector('[data-assign-submit]'); if (btn) btn.disabled = !ok;
    const hint = document.querySelector('[data-assign-hint]'); if (hint) hint.hidden = !!ok;
  });
  Codi.action('ln-assign-submit', (form) => {
    const courseId = form.dataset.course; const lessonId = form.dataset.lesson;
    const r = rec(courseId); const d = r.draft[lessonId] || {};
    const link = (d.link || '').trim();
    if (link && !/^https?:\/\/\S+\.\S+/.test(link)) { ui.toast('Đường dẫn chưa hợp lệ. Hãy bắt đầu bằng https://', { type: 'danger' }); return; }
    const sub = mySubmission(lessonId);
    const a = Codi.lesson(Codi.course(courseId), lessonId).assignment;
    Codi.set((st) => {
      if (sub && sub.status === 'pending') { sub.link = link || null; sub.fileName = d.fileName || sub.fileName; sub.note = d.note || ''; sub.submittedAt = new Date().toISOString(); }
      else st.db.submissions.push({ id: Codi.uid('sub'), courseId, lessonId, userId: uid(), submittedAt: new Date().toISOString(), fileName: d.fileName || null, link: link || null, note: d.note || '', status: 'pending', score: null, maxScore: Number(a.maxScore) || 10, passScore: a.passScore != null ? Number(a.passScore) : 5, feedback: '', gradedAt: null });
      r.draft[lessonId] = {};
    });
    upload = { lessonId: null, state: 'idle' };
    ui.toast('Đã nộp bài tập. Bạn có thể hoàn thành bài học ngay.', { type: 'success' });
  });
  Codi.action('ln-resubmit', (el) => { const r = R(el); const s = mySubmission(el.dataset.lesson); r.draft[el.dataset.lesson] = { link: s.link || '', note: s.note || '', fileName: s.fileName || '', resubmit: true }; save(); });
  Codi.action('ln-resubmit-cancel', (el) => { const r = R(el); r.draft[el.dataset.lesson] = {}; save(); });

  // Complete lesson → mastery, path update notice (no auto-advance)
  Codi.action('ln-complete', (el) => {
    const c = Codi.course(el.dataset.course); const l = Codi.lesson(c, el.dataset.lesson); const r = rec(c.id);
    if (checklist(r, l).some((x) => !x.done)) return;
    r.completed.push(l.id);
    if (!r.studied.includes(l.id)) r.studied.push(l.id);
    const q = r.quiz[l.id];
    // Coding lessons feed mastery from the test score (capped when the solution was viewed first).
    const evidence = l.code ? Codi.code.score(l) : q && q.submitted ? q.score : null;
    l.conceptIds.forEach((k) => { r.mastery[k] = Math.max(r.mastery[k] || 0, evidence !== null ? masteryFromScore(evidence) : 2); });
    // Apply the AI path update for this lesson (prerequisite order stays intact).
    const upd = (c.pathUpdates || []).find((u) => u.afterLessonId === l.id) || (c.pathUpdates || []).find((u) => u.afterLessonId === '*');
    const changes = [];
    if (upd && r.pathSource === 'ai') {
      upd.changes.forEach((ch) => {
        if (ch.lessonId && r.completed.includes(ch.lessonId)) return;
        if (ch.type === 'moved-up' && ch.lessonId) {
          const order = r.order.filter((x) => x !== ch.lessonId);
          const at = order.findIndex((x) => !r.completed.includes(x));
          order.splice(at < 0 ? order.length : at, 0, ch.lessonId); r.order = order;
        }
        if (ch.type === 'now-skippable' && ch.lessonId && !r.skippable.includes(ch.lessonId)) r.skippable.push(ch.lessonId);
        changes.push(ch);
      });
    }
    if (!changes.length) changes.push({ type: 'info', lessonId: null, text: r.pathSource === 'ai' ? 'Thứ tự các bài còn lại giữ nguyên; mức thành thạo đã được cập nhật.' : 'Bạn đang học theo thứ tự mặc định; mức thành thạo đã được cập nhật.' });
    if (l.code && l.code.kind === 'challenge') {
      const s = Codi.code.status(l);
      changes.push({ type: 'info', lessonId: null, text: `Kết quả bài code (${s.submits} lần nộp${s.solutionViewed ? ', đã xem lời giải' : ''}) được dùng để cập nhật mức thành thạo "${l.conceptIds.map((k) => conceptName(c, k)).join(', ')}".` });
    }
    const nextId = currentLessonId(c, r);
    r.lastUpdate = { afterLessonId: l.id, changes, nextLessonId: nextId };
    r.highlight = changes.map((x) => x.lessonId).filter(Boolean);
    Codi.notify(uid(), { title: 'Lộ trình đã được cập nhật', body: `Sau bài "${l.title}".`, link: '/learn/' + c.id });
    save();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Panels
  Codi.action('ln-panel', (el) => openPanel(el.dataset.panel, el.dataset.course, el.dataset.lesson));
  Codi.action('ln-qa-post', (form, e, v) => {
    const text = (v.text || '').trim();
    if (text.length < 10) { panel.qaError = 'Câu hỏi cần ít nhất 10 ký tự để giảng viên hiểu rõ.'; refreshPanel(); return; }
    panel.qaError = null;
    Codi.set((st) => st.db.questions.push({ id: Codi.uid('qa'), courseId: panel.courseId, lessonId: panel.lessonId, userId: uid(), text, createdAt: new Date().toISOString(), status: 'unanswered', replies: [] }), { render: false });
    refreshPanel();
    ui.toast('Đã gửi câu hỏi. Bạn sẽ nhận thông báo khi giảng viên trả lời.', { type: 'success' });
  });

  // Review
  Codi.action('ln-review', (el) => openReview(el.dataset.course, Number(el.dataset.stars) || 0));

  // ───────────────────────── scoped styles ─────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .ln-h { font-size: var(--text-lg); }
    .ln-question { font-size: var(--text-xl); }
    .ln-title { font-size: var(--text-2xl); }
    .ln-facts { list-style: none; padding: 0; display: grid; gap: var(--space-3); }
    .ln-facts li { display: flex; gap: var(--space-3); align-items: flex-start; }
    .ln-gen-steps { display: grid; gap: var(--space-2); color: var(--muted); }
    .ln-continue .card-body { flex-wrap: wrap; }
    .ln-path-head { display: flex; gap: var(--space-6); align-items: flex-end; flex-wrap: wrap; }
    .ln-path-cta { align-items: flex-end; max-width: 280px; }
    .ln-row { display: flex; gap: var(--space-3); padding: var(--space-4); border-bottom: 1px solid var(--border); align-items: flex-start; }
    .ln-row:last-child { border-bottom: 0; }
    .ln-row.is-current { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
    .ln-row.is-updated { background: var(--info-soft); }
    .ln-row a { color: var(--fg); text-decoration: none; }
    .ln-row a:hover { color: var(--accent); text-decoration: underline; }
    .ln-row-icon { width: 36px; height: 36px; border-radius: var(--radius-sm); background: var(--subtle); display: grid; place-items: center; flex: none; color: var(--muted); }
    .ln-row-side { display: grid; justify-items: end; gap: var(--space-2); flex: none; }
    .ln-locked-title { color: var(--muted); }
    .ln-why summary { cursor: pointer; font-size: var(--text-sm); color: var(--accent); min-height: 32px; display: inline-flex; align-items: center; }
    .ln-why p { padding: var(--space-2) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); }
    @media (max-width: 640px) { .ln-row { flex-wrap: wrap; } .ln-row-side { justify-items: start; width: 100%; grid-auto-flow: column; justify-content: start; } }
    .ln-update { border-color: var(--accent-soft-border); }
    .ln-changes { display: grid; gap: var(--space-2); }
    .ln-changes li { display: flex; gap: var(--space-2); align-items: flex-start; font-size: var(--text-sm); }
    .ln-complete { border-color: #bbf7d0; }
    .ln-player { display: grid; grid-template-columns: 300px minmax(0, 1fr); min-height: calc(100vh - var(--header-h)); }
    .ln-side { background: var(--surface); border-right: 1px solid var(--border); position: sticky; top: var(--header-h); height: calc(100vh - var(--header-h)); overflow-y: auto; }
    .ln-side-head { display: grid; gap: var(--space-2); padding: var(--space-4); border-bottom: 1px solid var(--border); }
    .ln-side-back { display: inline-flex; align-items: center; gap: var(--space-1); justify-self: start; min-height: 32px; }
    .ln-side-course { display: block; font-size: var(--text-base); line-height: var(--leading-tight); }
    .ln-side-list { padding: var(--space-2); }
    .ln-side-item { display: flex; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); color: var(--fg); text-decoration: none; min-height: 44px; }
    .ln-side-item:hover { background: var(--subtle); color: var(--fg); }
    .ln-side-item.is-active { background: var(--accent-soft); }
    .ln-side-check { width: 20px; flex: none; display: grid; place-items: center; color: var(--muted); }
    .ln-main { min-width: 0; }
    .ln-topbar { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; padding: var(--space-3) var(--space-6); border-bottom: 1px solid var(--border); background: var(--surface); }
    .ln-topbar .is-disabled { opacity: .4; pointer-events: none; }
    .ln-content { max-width: 860px; margin: 0 auto; padding: var(--space-6) var(--space-6) var(--space-12); }
    .ln-mobile-only { display: none; }
    @media (max-width: 860px) {
      .ln-player { grid-template-columns: minmax(0, 1fr); }
      .ln-side { display: none; }
      .ln-mobile-only { display: inline-flex; }
      .ln-topbar, .ln-content { padding-left: var(--space-4); padding-right: var(--space-4); }
    }
    .ln-media { border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border); background: var(--surface); }
    .ln-video-screen { aspect-ratio: 16 / 9; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; position: relative; }
    .ln-video-title { position: absolute; top: var(--space-3); left: var(--space-4); font-size: var(--text-sm); }
    .ln-play { width: 72px; height: 72px; border-radius: 50%; border: 0; background: rgba(255,255,255,.92); color: #0f172a; display: grid; place-items: center; cursor: pointer; }
    .ln-play:focus-visible { box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--accent); }
    .ln-video-bar { display: flex; gap: var(--space-3); align-items: center; padding: var(--space-3) var(--space-4); }
    .ln-video-note { padding: 0 var(--space-4) var(--space-3); color: var(--muted); }
    .ln-media-error { aspect-ratio: 16 / 9; display: grid; place-items: center; background: var(--danger-soft); color: #7f1d1d; padding: var(--space-6); }
    .ln-slide { aspect-ratio: 16 / 9; display: grid; place-content: center; gap: var(--space-2); text-align: center; padding: var(--space-6); background: var(--canvas); }
    .ln-slide strong { font-family: var(--font-display); font-size: var(--text-xl); }
    .ln-pdf-nav { padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border); }
    .ln-reading p { max-width: 70ch; }
    .ln-notes summary { cursor: pointer; }
    .ln-check-items { list-style: none; padding: 0; display: grid; gap: var(--space-2); }
    .ln-check-items li { display: flex; gap: var(--space-2); align-items: center; }
    .ln-check-items li.is-done > span:first-of-type { color: var(--muted); }
    .ln-complete-bar { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; position: sticky; bottom: 0; background: var(--surface); padding: var(--space-3) 0; }
    .ln-grade { padding: var(--space-4); border-radius: var(--radius-md); border: 1px solid; }
    .ln-grade.is-pass { background: var(--success-soft); border-color: #bbf7d0; }
    .ln-grade.is-fail { background: var(--warn-soft); border-color: #fde68a; }
    .ln-review-list { padding-left: 0; list-style: none; }
    .ln-reply { margin-left: var(--space-4); padding-left: var(--space-3); border-left: 2px solid var(--border); }
    .ln-acc > summary { cursor: pointer; list-style: none; }
    .ln-acc > summary::-webkit-details-marker { display: none; }
    .ln-mastery-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2) var(--space-6); }
    @media (max-width: 640px) { .ln-mastery-grid { grid-template-columns: minmax(0, 1fr); } }
  `;
  document.head.appendChild(style);
})();
