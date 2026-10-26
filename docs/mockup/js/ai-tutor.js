/**
 * Codi AI tutor — the docked "AI trợ lý" panel inside a lesson (Flow L6c/L6d, S11a, S11a', S11h).
 *
 * Public seam (placeholder in core.js, replaced here):
 *   Codi.tutor = { open(courseId, lessonId, ctx), explainError(courseId, lessonId, testId) }
 *   ctx: { selection?: string, testId?: string, ask?: string }  — ask is sent right away.
 *
 * Rules the panel follows:
 *  - Never writes a full solution. Help is Socratic; the hint ladder has 3 steps
 *    (hướng nghĩ → chỉ chỗ cần xem → khung cách làm) and every step taken is recorded in db.hintUsage
 *    so the lecturer sees it on S29.
 *  - A code change suggestion is at most 3 lines and is applied only when the learner presses
 *    "Áp dụng"; "Hoàn tác" restores the exact code from before.
 *  - Scenario flag aiAssistant drives the async states: ok | thinking (stays until "Dừng") | ratelimit | error.
 *  - Threads persist per learner + lesson in state.aiLessonChats["<userId>:<lessonId>"] (array, max 40).
 */
(function () {
  'use strict';
  const { html, icon, ui } = Codi;
  const uid = () => Codi.state.currentUserId;
  const LOG_MAX = 40;
  const HINT_NAMES = ['Hướng nghĩ', 'Chỗ cần xem lại', 'Khung cách làm'];
  const DOWN_REASONS = ['Chưa đúng', 'Khó hiểu', 'Lộ lời giải', 'Không liên quan bài'];
  const wide = () => window.matchMedia('(min-width: 1024px)').matches;
  const now = () => new Date().toISOString();

  let panel = null; // { courseId, lessonId, handle, busy, ctx, removed:{}, current, convOpen }

  // Shared by the lesson tutor and the /ai advisor (ai-advisor.js loads after this file) so both
  // surfaces show the same quiet feedback row: 👍/👎, and after 👎 a one-tap reason.
  function feedbackRow(prefix, m, i) {
    return html`<div class="ai-feedback">
      <button type="button" class="ai-feedback-btn" data-action="${prefix}-vote" data-i="${i}" data-v="up" aria-pressed="${String(m.vote === 'up')}" aria-label="Câu trả lời hữu ích">${icon('thumbs-up', { cls: 'icon-sm' })}</button>
      <button type="button" class="ai-feedback-btn" data-action="${prefix}-vote" data-i="${i}" data-v="down" aria-pressed="${String(m.vote === 'down')}" aria-label="Câu trả lời chưa tốt">${icon('thumbs-down', { cls: 'icon-sm' })}</button>
      ${m.vote === 'down' && !m.reason ? html`<span class="ai-feedback-reasons"><span class="xsmall muted">Chưa tốt ở điểm nào?</span>${DOWN_REASONS.map((r) => html`<button type="button" class="ai-chip ai-chip-sm" data-action="${prefix}-reason" data-i="${i}" data-reason="${r}">${r}</button>`)}</span>` : ''}
      ${m.reason ? html`<span class="xsmall muted">Đã ghi nhận: ${m.reason}</span>` : ''}
    </div>`;
  }
  Codi.aiFeedbackRow = feedbackRow;
  // Picking an item in a "⋯" menu closes it (the panel may not re-render, e.g. when a dialog opens).
  document.addEventListener('click', (e) => {
    const item = e.target.closest && e.target.closest('.tutor-menu-list [role="menuitem"]');
    if (item) { const d = item.closest('details'); if (d) d.open = false; return; }
    document.querySelectorAll('.tutor-menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  });

  // ───────────────────────── data helpers ─────────────────────────
  function thread(lessonId) {
    const all = Codi.ensure('aiLessonChats', () => ({}));
    const k = uid() + ':' + lessonId;
    return (all[k] = all[k] || []);
  }
  function persist(lessonId) {
    const log = thread(lessonId);
    if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
    Codi.set(null, { render: false });
  }
  const lessonOf = (p) => Codi.lesson(Codi.course(p.courseId), p.lessonId);
  function attempt(l) {
    return (Codi.db().codeAttempts || []).find((x) => x.userId === uid() && x.lessonId === l.id) || null;
  }
  function lastRun(l) {
    const e = attempt(l); if (!e) return null;
    return l.code.kind === 'tutorial' ? (e.stepRuns || {})[e.tutorialStep] : e.lastRun;
  }
  function failingTest(l, testId) {
    if (!l.code) return null;
    const r = lastRun(l);
    const o = r && r.outcomes ? (testId ? r.outcomes.find((x) => x.id === testId) : r.outcomes.find((x) => !x.pass)) : null;
    if (!o || o.pass) return null;
    const tests = l.code.tests || (l.code.steps || []).flatMap((s) => s.tests || []);
    const t = tests.find((x) => x.id === o.id);
    return { id: o.id, name: t ? t.name : o.id, expected: o.expected, actual: o.actual, error: o.error };
  }
  // The learner's current code: the editor on screen if any, else the saved draft, else the starter.
  function editorEl() { return document.querySelector('.cp-textarea:not([readonly])'); }
  function currentCode(l) {
    const ta = editorEl(); if (ta) return ta.value;
    const e = attempt(l);
    if (l.code.kind === 'tutorial') return (e && e.stepDrafts[e.tutorialStep]) || (l.code.steps[0] || {}).starter || '';
    return (e && e.draft) || l.code.starter || '';
  }
  // Line the hints point at: the first `return` (where wrong values usually surface), else the 2nd non-empty line.
  function targetLine(code) {
    const lines = code.split('\n');
    let i = lines.findIndex((s) => /\breturn\b/.test(s));
    if (i < 0) i = lines.findIndex((s, n) => n > 0 && s.trim());
    if (i < 0) i = 0;
    return { n: i + 1, text: lines[i] || '', indent: (/^\s*/.exec(lines[i] || '') || [''])[0] };
  }
  // Where a run error most likely comes from: the first line using the name the error mentions
  // ("x is not defined", "x is not a function", "reading 'y'"), else the usual target line.
  function errorLine(code, err) {
    const m = /ReferenceError: (\S+) is not defined/.exec(err) || /TypeError: (?:\S+\.)?([\w$]+) is not a function/.exec(err) || /reading '([\w$]+)'/.exec(err);
    const lines = code.split('\n');
    if (m) { const re = new RegExp('(^|[^\\w$])' + m[1].replace(/\$/g, '\\$') + '([^\\w$]|$)'); const i = lines.findIndex((s) => re.test(s) && !/^\s*\/\//.test(s)); if (i >= 0) return { n: i + 1, text: lines[i], name: m[1] }; }
    // timeout: point at the first loop
    if (/quá .* giây|timeout/i.test(err)) { const i = lines.findIndex((s) => /\b(while|for)\b/.test(s)); if (i >= 0) return { n: i + 1, text: lines[i], loop: true }; }
    return null;
  }
  const runError = (l) => { const r = l.code ? lastRun(l) : null; return r && r.error ? r : null; };
  function hintLevel(l) {
    return (Codi.db().hintUsage || []).filter((h) => h.userId === uid() && h.lessonId === l.id).reduce((m, h) => Math.max(m, h.level), 0);
  }
  function myConversations(p) {
    return (Codi.db().conversations || []).filter((c) => c.learnerId === uid() && c.lessonId === p.lessonId);
  }

  // ───────────────────────── answers (simulated, Socratic) ─────────────────────────
  const short = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 60 ? s.slice(0, 57) + '…' : String(s); };
  function answerFor(l, text, p) {
    const sel = p.ctx.selection && !p.removed.sel ? p.ctx.selection : '';
    const parts = []; const lines = [];
    if (sel) parts.push(`Về đoạn bạn chọn: \`${short(sel.split('\n')[0])}\``);
    if (l.code) {
      const ft = !p.removed.test ? failingTest(l, p.ctx.testId) : null;
      const re = !p.removed.err ? runError(l) : null;
      const err = re ? re.error : Codi.code.lastErrorText(l);
      const code = currentCode(l);
      const el = re ? errorLine(code, re.error) : null;
      const tl = el || targetLine(code);
      if (ft) parts.push(`Ở test **${ft.name}**, kết quả mong đợi là \`${short(ft.expected)}\` nhưng code đang trả về \`${short(ft.actual)}\`.`);
      if (re) {
        // run-level error: say what kind it is, where it most likely is, and what to check — never the fix itself
        const kind = re.phase === 'syntax' ? 'Lỗi cú pháp — code chưa chạy được dòng nào' : re.phase === 'timeout' ? 'Code chạy quá lâu nên bị dừng' : 'Code bị dừng giữa chừng vì lỗi khi chạy';
        parts.push(`**${kind}.** Thông báo: \`${short(re.error)}\``);
        if (Codi.code.explain(re.error)) parts.push(Codi.code.explain(re.error));
        if (el && el.name) parts.push(`Tên \`${el.name}\` xuất hiện lần đầu ở **dòng ${el.n}**: \`${short(el.text.trim())}\`. So tên này với chỗ bạn khai báo — sai chính tả, sai hoa/thường, hoặc khai báo sau khi dùng là các nguyên nhân hay gặp.`);
        else if (el && el.loop) parts.push(`Vòng lặp ở **dòng ${el.n}** có thể không bao giờ dừng. Kiểm tra điều kiện dừng và biến đếm có thay đổi sau mỗi vòng không.`);
        else if (re.phase === 'syntax') parts.push('Đếm lại cặp ngoặc `(` `)` `{` `}` `[` `]`, dấu nháy và dấu phẩy giữa các phần tử — thường lỗi nằm ngay trước chỗ trình soạn báo.');
      } else if (err) parts.push(Codi.code.explain(err) || `Lỗi khi chạy: \`${short(err)}\`.`);
      if (!ft && !err) parts.push('Mình chưa thấy test nào chưa đạt ở lần chạy gần nhất. Bấm **Chạy** rồi hỏi lại nếu có test sai.');
      if (!re) parts.push('Thử tự trả lời mấy câu này trước:\n- Với input của test, bạn tự tính tay thì ra kết quả gì?\n- Giá trị nào trong code khác với kết quả bạn tính tay?\n- Trường hợp đặc biệt (mảng rỗng, số âm) code đã xử lý chưa?');
      if (!p.removed.code && re && re.phase === 'syntax') { if (el) lines.push(el.n); }
      else if (!p.removed.code) { parts.push(`Bắt đầu từ **dòng ${tl.n}** — đặt một \`console.log\` ngay trước đó để xem giá trị thật.`); lines.push(tl.n); }
      parts.push('Mình không viết sẵn lời giải. Cần thêm trợ giúp thì bấm **Gợi ý tiếp theo**.');
    } else {
      // Built from what the lesson really has; never a placeholder sentence that reads like a bug.
      const c = Codi.course(p.courseId); const ch = Codi.chapterOf(c, l.id);
      const idea = (l.reading || l.summary || '').split('.')[0].trim();
      const concepts = (c.concepts || []).filter((k) => (l.concepts || []).includes(k.id)).map((k) => k.name);
      if (idea) parts.push(`Ý chính của bài **${l.title}**: ${idea}.`);
      else parts.push(`Bài **${l.title}**${ch ? ` thuộc chương “${ch.title}”` : ''}${concepts.length ? `, tập trung vào ${concepts.join(', ')}` : ''}. Mình tóm tắt dựa trên tiêu đề và vị trí của bài, vì bài này chưa có phần đọc.`);
      parts.push('Để chắc là bạn đã nắm bài, thử:\n- Nói lại bằng lời của bạn điều bài muốn bạn làm được\n- Làm lại ví dụ trong video mà không nhìn màn hình\n- Ghi ra một chỗ bạn còn chưa chắc rồi hỏi mình cụ thể chỗ đó');
    }
    return { text: parts.join('\n\n'), lines };
  }
  function hintFor(l, level) {
    const tl = targetLine(currentCode(l));
    const ft = failingTest(l, panel.ctx.testId);
    if (level === 1) return { text: `**Gợi ý 1/3 · ${HINT_NAMES[0]}**\n\n${ft ? `Test **${ft.name}** đang sai. ` : ''}Đọc lại yêu cầu và tự hỏi: hàm cần trả về kiểu dữ liệu gì, và trong trường hợp nào? Viết ra 2–3 cặp input → output trước khi sửa code.` };
    if (level === 2) return { text: `**Gợi ý 2/3 · ${HINT_NAMES[1]}**\n\nGiá trị sai nhiều khả năng hình thành ở **dòng ${tl.n}**. So sánh giá trị ở đó với kết quả bạn tính tay ở gợi ý 1.`, lines: [tl.n] };
    return {
      text: `**Gợi ý 3/3 · ${HINT_NAMES[2]}**\n\nThêm một dòng in giá trị ngay trước **dòng ${tl.n}**, chạy lại và đối chiếu với kết quả mong đợi. Phần sửa logic vẫn do bạn tự viết.`,
      lines: [tl.n],
      diff: { at: tl.n, ctx: tl.text, add: `${tl.indent}console.log('Kiểm tra trước dòng ${tl.n}:', ${/\breturn\s+(.+?);?\s*$/.test(tl.text) ? /\breturn\s+(.+?);?\s*$/.exec(tl.text)[1] : 'arguments'});`, state: null, original: null },
    };
  }

  // ───────────────────────── rendering ─────────────────────────
  function chipsFor(p, l) {
    const ft = l.code ? failingTest(l, p.ctx.testId) : null;
    const sel = p.ctx.selection;
    return [
      { id: 'lesson', label: `Bài: ${l.title}`, fixed: true },
      l.code ? { id: 'code', label: 'Code bạn đang viết' } : null,
      ft ? { id: 'test', label: `Test chưa đạt: ${ft.name}` } : null,
      runError(l) ? { id: 'err', label: `Lỗi: ${short(runError(l).error)}` } : null,
      sel ? { id: 'sel', label: `Đoạn đã chọn · ${sel.split('\n').length} dòng` } : null,
    ].filter((x) => x && !p.removed[x.id]);
  }
  function lineRefs(m) {
    return (m.lines || []).length ? html`<span class="tutor-lines">${m.lines.map((n) => html`<button type="button" class="tutor-lineref" data-action="tutor-line" data-line="${n}">${icon('code', { cls: 'icon-sm' })} Xem dòng ${n}</button>`)}</span>` : '';
  }
  function diffView(m, i) {
    const d = m.diff; if (!d) return '';
    return html`<div class="tutor-diff2" role="group" aria-label="Đề xuất thay đổi ${d.state === 'applied' ? '(đã áp dụng)' : ''}">
      <div class="tutor-diff2-head"><span>Đề xuất thêm 1 dòng · trước dòng ${d.at}</span>${d.state === 'applied' ? html`<span class="badge badge-success">Đã áp dụng</span>` : d.state === 'skipped' ? html`<span class="badge">Đã bỏ qua</span>` : ''}</div>
      <pre class="tutor-diff2-code"><span class="is-add">+ ${d.add}</span>
<span class="is-ctx">  ${d.ctx}</span></pre>
      ${d.state === 'skipped' ? '' : html`<div class="tutor-diff2-actions">${d.state === 'applied'
        ? html`<button type="button" class="btn btn-primary btn-sm" data-action="tutor-rerun">${icon('play', { cls: 'icon-sm' })} Chạy lại test</button><button type="button" class="btn btn-ghost btn-sm" data-action="tutor-diff" data-op="undo" data-i="${i}">${icon('rotate-ccw', { cls: 'icon-sm' })} Hoàn tác</button>`
        : html`<button type="button" class="btn btn-primary btn-sm" data-action="tutor-diff" data-op="apply" data-i="${i}">Áp dụng</button><button type="button" class="btn btn-ghost btn-sm" data-action="tutor-diff" data-op="skip" data-i="${i}">Bỏ qua</button>`}</div>`}
    </div>`;
  }
  function msgView(m, i, p) {
    if (m.role === 'user') return html`<div class="msg msg-user">${m.text}</div>`;
    if (m.role === 'limit') return ui.alert({ type: 'warn', title: 'Bạn đã hỏi quá nhiều trong thời gian ngắn', body: 'Thử lại sau ít phút, hoặc hỏi riêng giảng viên.', actions: html`<button type="button" class="btn btn-secondary btn-sm" data-action="tutor-lecturer">Hỏi giảng viên</button>` });
    if (m.role === 'error') return ui.alert({ type: 'danger', title: 'AI trợ lý tạm thời không khả dụng', body: 'Câu hỏi chưa được trả lời. Bạn vẫn học tiếp bình thường.', actions: html`<button type="button" class="btn btn-secondary btn-sm" data-action="tutor-retry" data-i="${i}">${icon('rotate-ccw', { cls: 'icon-sm' })} Thử lại</button><button type="button" class="btn btn-ghost btn-sm" data-action="tutor-lecturer">Hỏi giảng viên</button>` });
    if (m.streaming && p.busy) return html`<div class="msg msg-ai msg-md" aria-busy="true"><div data-stream="${m.id}">${ui.md(m.text)}</div><div class="ai-thinking-row"><button type="button" class="btn btn-ghost btn-sm" data-action="tutor-stop">${icon('x', { cls: 'icon-sm' })} Dừng</button></div></div>`;
    return html`<div class="msg msg-ai msg-md">${ui.md(m.text)}${m.stopped ? html`<p class="xsmall muted">Đã dừng câu trả lời.</p>` : ''}
      ${lineRefs(m)}${diffView(m, i)}
      ${feedbackRow('tutor', m, i)}
    </div>`;
  }
  // Panel layout (top → bottom): one row of context chips + "⋯" menu, an optional one-line status of the
  // private lecturer question, the conversation (the main content), then a sticky zone with the hint
  // ladder and the composer. Rare actions (clear, ask lecturer) live in the menu so they don't compete.
  function convStatus(p) {
    const convs = myConversations(p); if (!convs.length) return '';
    const c = convs[convs.length - 1];
    const last = c.messages[c.messages.length - 1];
    const replied = last && last.from === 'lecturer';
    return html`<div class="tutor-status">
      <button type="button" class="tutor-status-row" data-action="tutor-conv-toggle" aria-expanded="${String(!!p.convOpen)}">
        <span class="tutor-status-dot ${replied ? 'is-done' : 'is-wait'}" aria-hidden="true"></span>
        <span class="tutor-status-text">Câu hỏi riêng cho giảng viên · ${replied ? 'Đã có trả lời' : 'Đang chờ trả lời'}</span>
        ${icon(p.convOpen ? 'chevron-down' : 'chevron-right', { cls: 'icon-sm' })}</button>
      ${p.convOpen ? html`<div class="tutor-status-body">${replied ? html`<p>${last.text}</p>` : html`<p class="muted">Giảng viên thường trả lời trong 24 giờ. Bạn sẽ nhận thông báo khi có trả lời.</p>`}</div>` : ''}
    </div>`;
  }
  function body(p) {
    const l = lessonOf(p); const log = thread(p.lessonId); const busy = p.busy;
    const level = l.code ? hintLevel(l) : 0;
    const chips = chipsFor(p, l);
    const prompts = l.code ? ['Vì sao code của mình chưa chạy đúng?', 'Giải thích lại yêu cầu của bài', 'Lỗi hay gặp ở bài này là gì?'] : ['Tóm tắt ý chính của bài', 'Cho mình một ví dụ khác', 'Lỗi hay gặp ở bài này là gì?'];
    return html`<div class="ai-panel tutor">
      <div class="tutor-bar">
        <ul class="tutor-chips" aria-label="Ngữ cảnh gửi kèm câu hỏi">${chips.map((c) => html`<li class="tutor-chip">${c.label}${c.fixed ? '' : html`<button type="button" data-action="tutor-chip-off" data-id="${c.id}" aria-label="Bỏ “${c.label}” khỏi ngữ cảnh">${icon('x', { cls: 'icon-sm' })}</button>`}</li>`)}</ul>
        <details class="tutor-menu">
          <summary class="btn btn-ghost btn-icon btn-sm" aria-label="Thêm thao tác">${icon('more-horizontal', { cls: 'icon-sm' })}</summary>
          <div class="tutor-menu-list" role="menu">
            <button type="button" role="menuitem" data-action="tutor-lecturer">${icon('message-circle', { cls: 'icon-sm' })} Hỏi riêng giảng viên</button>
            <button type="button" role="menuitem" class="is-danger" data-action="tutor-clear" ${!log.length || busy ? Codi.raw('disabled') : ''}>${icon('trash', { cls: 'icon-sm' })} Xoá cuộc trò chuyện</button>
          </div>
        </details>
      </div>
      ${convStatus(p)}
      <div class="ai-panel-log">
        ${log.length ? '' : html`<div class="ai-panel-empty">
          <span class="ai-panel-empty-title">Hỏi về bài “${l.title}”</span>
          <ul class="ai-panel-prompts">${prompts.map((t) => html`<li><button type="button" class="ai-panel-prompt" data-action="tutor-ask" data-text="${t}"><span>${t}</span>${icon('arrow-right', { cls: 'icon-sm' })}</button></li>`)}</ul>
          <p class="ai-disclaimer">${l.code ? 'AI chỉ ra hướng và chỗ cần xem, không viết sẵn lời giải. ' : ''}AI có thể trả lời sai, hãy đối chiếu với tài liệu bài học.</p></div>`}
        <div class="chat-log" aria-live="polite">${log.map((m, i) => msgView(m, i, p))}
          ${busy && !log.some((m) => m.streaming) ? html`<div class="ai-thinking-row" aria-busy="true"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span>Codi đang suy nghĩ…</span><button type="button" class="btn btn-ghost btn-sm" data-action="tutor-stop">${icon('x', { cls: 'icon-sm' })} Dừng</button></div>` : ''}</div>
      </div>
      <div class="ai-panel-composer">
        ${l.code ? html`<div class="tutor-hintbar">${level < 3
          ? html`<button type="button" class="tutor-hint-btn" data-action="tutor-hint" ${busy ? Codi.raw('disabled') : ''}>${icon('lightbulb', { cls: 'icon-sm' })}<span>Gợi ý ${level + 1}/3 · ${HINT_NAMES[level]}</span></button>`
          : html`<span class="xsmall muted">Đã dùng hết 3 gợi ý. Cần thêm trợ giúp? Mở “⋯” › Hỏi riêng giảng viên.</span>`}</div>` : ''}
        <form data-submit="tutor-send"><label class="sr-only" for="tutor-q">Câu hỏi cho AI trợ lý</label>
          <div class="input-group"><input id="tutor-q" name="q" class="input" placeholder="Hỏi AI về bài học này…" autocomplete="off" ${busy ? Codi.raw('disabled') : ''}><button class="btn btn-primary btn-icon" type="submit" aria-label="Gửi câu hỏi" ${busy ? Codi.raw('disabled') : ''}>${icon('send', { cls: 'icon-sm' })}</button></div></form>
      </div>
    </div>`;
  }
  // Re-paints the panel body, keeping what the learner was typing and scrolling the log to the end.
  function refresh() {
    if (!panel || !panel.handle) return;
    const q = document.getElementById('tutor-q');
    const draft = q ? q.value : ''; const hadFocus = q && document.activeElement === q;
    panel.handle.setBody(body(panel));
    const nq = document.getElementById('tutor-q');
    if (nq && draft) nq.value = draft;
    if (nq && hadFocus && !nq.disabled) nq.focus();
    const scroller = panel.handle.el && panel.handle.el.querySelector('[data-overlay-body]');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  // ───────────────────────── asking ─────────────────────────
  // Runs one assistant turn: user message (optional) → thinking → streamed answer, honouring the scenario flag.
  function turn(userText, make) {
    const p = panel; if (!p || p.busy) return;
    const log = thread(p.lessonId);
    if (userText) log.push({ role: 'user', text: userText, at: now() });
    const flag = Codi.state.scenario.aiAssistant;
    if (flag === 'ratelimit') { log.push({ role: 'limit', at: now() }); persist(p.lessonId); refresh(); return; }
    persist(p.lessonId);
    p.busy = true; const token = (p.current = {}); refresh();
    if (flag === 'thinking') return; // stays "Codi đang suy nghĩ…" until the learner presses Dừng
    setTimeout(() => {
      if (panel !== p || p.current !== token) return;
      if (flag === 'error') { p.busy = false; log.push({ role: 'error', question: userText, at: now() }); persist(p.lessonId); refresh(); return; }
      const a = make();
      const m = Object.assign({ role: 'ai', id: 'tut-' + Date.now(), text: '', streaming: true, at: now() }, a, { text: '' });
      log.push(m); refresh();
      ui.stream(a.text, (part) => {
        if (m.stopped || !m.streaming) return;
        m.text = part;
        const el = document.querySelector(`[data-stream="${m.id}"]`);
        if (el) el.innerHTML = String(ui.md(part));
      }).then(() => {
        if (m.stopped) return;
        m.text = a.text; delete m.streaming; p.busy = false; persist(p.lessonId);
        if (panel === p) refresh();
      });
    }, 900);
  }
  function ask(text) { const p = panel; if (!p) return; turn(text, () => answerFor(lessonOf(p), text, p)); }

  // ───────────────────────── public API ─────────────────────────
  const tutor = {
    open(courseId, lessonId, ctx) {
      const c = Codi.course(courseId); const l = c && Codi.lesson(c, lessonId);
      if (!l) return null;
      ctx = ctx || {};
      if (panel && panel.handle && panel.lessonId === lessonId) {
        // already open on this lesson: just add the new context
        panel.ctx = Object.assign({}, panel.ctx, ctx); panel.removed = {};
        refresh();
      } else {
        ui.closeAll();
        const p = { courseId, lessonId, ctx, removed: {}, busy: false };
        panel = p;
        p.handle = ui.sheet({ docked: true, title: 'AI trợ lý', body: body(p), onClose: () => { if (panel === p) panel = null; } });
        refresh();
      }
      if (ctx.ask) ask(ctx.ask);
      else setTimeout(() => { const q = document.getElementById('tutor-q'); if (q && wide()) q.focus(); }, 50);
      return panel && panel.handle;
    },
    explainError(courseId, lessonId, testId) {
      const l = Codi.lesson(Codi.course(courseId), lessonId);
      const ft = l && failingTest(l, testId);
      tutor.open(courseId, lessonId, { testId, ask: ft ? `Giải thích giúp mình vì sao test “${ft.name}” chưa đạt?` : 'Giải thích giúp mình lỗi ở lần chạy gần nhất?' });
    },
    // Syntax / runtime / timeout error from the console: the error text, code and line go along as context.
    explainRunError(courseId, lessonId) {
      const l = Codi.lesson(Codi.course(courseId), lessonId);
      const re = l && runError(l);
      tutor.open(courseId, lessonId, { ask: re ? `Code của mình báo lỗi “${short(re.error)}”. Lỗi này nghĩa là gì và mình nên xem chỗ nào?` : 'Giải thích giúp mình lỗi ở lần chạy gần nhất?' });
    },
  };
  Codi.tutor = tutor;

  // ───────────────────────── actions ─────────────────────────
  Codi.action('tutor-send', (form, e, v) => { const t = (v.q || '').trim(); if (t) ask(t); });
  Codi.action('tutor-ask', (el) => ask(el.dataset.text));
  Codi.action('tutor-chip-off', (el) => { if (!panel) return; panel.removed[el.dataset.id] = true; refresh(); });
  Codi.action('tutor-conv-toggle', () => { if (!panel) return; panel.convOpen = !panel.convOpen; refresh(); });
  Codi.action('tutor-stop', () => {
    const p = panel; if (!p || !p.busy) return;
    p.current = null; p.busy = false;
    const log = thread(p.lessonId); const m = log[log.length - 1];
    if (m && m.streaming) { m.stopped = true; delete m.streaming; if (!m.text) m.text = '…'; }
    else log.push({ role: 'ai', id: 'tut-' + Date.now(), text: 'Bạn đã dừng câu trả lời này.', stopped: true, at: now() });
    persist(p.lessonId); refresh();
  });
  Codi.action('tutor-retry', (el) => {
    const p = panel; if (!p || p.busy) return;
    const log = thread(p.lessonId); const i = Number(el.dataset.i);
    if (!log[i] || log[i].role !== 'error') return;
    const q = log[i].question;
    log.splice(i - (log[i - 1] && log[i - 1].role === 'user' ? 1 : 0), log[i - 1] && log[i - 1].role === 'user' ? 2 : 1);
    if (q) ask(q); else { persist(p.lessonId); refresh(); }
  });
  Codi.action('tutor-hint', () => {
    const p = panel; if (!p || p.busy) return;
    const l = lessonOf(p); const level = hintLevel(l) + 1;
    if (level > 3) return;
    const db = Codi.db(); if (!db.hintUsage) db.hintUsage = [];
    db.hintUsage.push({ userId: uid(), courseId: p.courseId, lessonId: p.lessonId, level, at: now() });
    turn(`Cho mình gợi ý ${level}/3`, () => hintFor(l, level));
  });
  Codi.action('tutor-vote', (el) => {
    if (!panel) return;
    const m = thread(panel.lessonId)[Number(el.dataset.i)]; if (!m) return;
    m.vote = m.vote === el.dataset.v ? null : el.dataset.v; m.reason = null;
    persist(panel.lessonId); refresh();
    if (m.vote === 'up') ui.toast('Cảm ơn phản hồi của bạn.');
  });
  Codi.action('tutor-reason', (el) => {
    if (!panel) return;
    const m = thread(panel.lessonId)[Number(el.dataset.i)]; if (!m) return;
    m.reason = el.dataset.reason; persist(panel.lessonId); refresh();
    ui.toast('Cảm ơn, góp ý của bạn giúp Codi trả lời tốt hơn.');
  });
  Codi.action('tutor-clear', async () => {
    const p = panel; if (!p || p.busy) return;
    const r = await ui.confirm({ title: 'Xoá cuộc trò chuyện của bài này?', body: 'Các câu hỏi và câu trả lời của AI trợ lý trong bài học này sẽ bị xoá. Cuộc trò chuyện ở các bài khác giữ nguyên.', reversible: false, confirmLabel: 'Xoá cuộc trò chuyện', danger: true });
    if (!r.ok) return;
    thread(p.lessonId).length = 0; persist(p.lessonId);
    if (panel === p) refresh();
    ui.toast('Đã xoá cuộc trò chuyện.');
  });

  // Line references: select the line in the editor (on phones the sheet closes first so the editor is visible).
  Codi.action('tutor-line', (el) => {
    const n = Number(el.dataset.line); const ta = editorEl();
    if (!ta) { ui.toast('Mở phần code của bài để xem dòng này.', { type: 'info' }); return; }
    if (!wide() && panel) panel.handle.close();
    const lines = ta.value.split('\n'); const idx = Math.min(Math.max(n, 1), lines.length) - 1;
    const start = lines.slice(0, idx).reduce((s, x) => s + x.length + 1, 0);
    ta.focus({ preventScroll: true }); ta.setSelectionRange(start, start + lines[idx].length);
    ta.scrollTop = Math.max(0, idx * (parseFloat(getComputedStyle(ta).lineHeight) || 20) - ta.clientHeight / 2);
    ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  // ≤3-line suggestion: apply inserts the line into the editor, undo restores the exact previous code.
  Codi.action('tutor-diff', (el) => {
    const p = panel; if (!p) return;
    const m = thread(p.lessonId)[Number(el.dataset.i)]; if (!m || !m.diff) return;
    const d = m.diff; const op = el.dataset.op; const ta = editorEl();
    if (op === 'skip') { d.state = 'skipped'; persist(p.lessonId); refresh(); return; }
    if (!ta) { ui.toast('Mở phần code của bài để áp dụng đề xuất.', { type: 'warn' }); return; }
    if (op === 'apply') {
      d.original = ta.value;
      const lines = ta.value.split('\n'); lines.splice(Math.min(d.at - 1, lines.length), 0, d.add);
      ta.value = lines.join('\n'); d.state = 'applied';
      ui.toast('Đã thêm 1 dòng vào code. Bấm “Hoàn tác” nếu muốn bỏ.', { type: 'success' });
    } else if (op === 'undo' && d.original !== null) {
      ta.value = d.original; d.original = null; d.state = null;
      ui.toast('Đã hoàn tác, code trở lại như trước.');
    }
    ta.dispatchEvent(new Event('input', { bubbles: true })); // coding-practice saves the draft on input
    persist(p.lessonId); refresh();
  });
  Codi.action('tutor-rerun', () => {
    const btn = document.querySelector('[data-action="cp-run"][data-mode="submit"]') || document.querySelector('[data-action="cp-run"]');
    if (!btn) { ui.toast('Không tìm thấy nút chạy test trong bài này.', { type: 'warn' }); return; }
    if (!wide() && panel) panel.handle.close();
    btn.click();
  });

  // S11h — private question to the lecturer, pre-filled with the AI context (shown in the lecturer inbox S27).
  Codi.action('tutor-lecturer', () => {
    const p = panel; if (!p) return;
    const l = lessonOf(p); const c = Codi.course(p.courseId);
    const lastQ = thread(p.lessonId).filter((m) => m.role === 'user').pop();
    const ft = l.code ? failingTest(l, p.ctx.testId) : null;
    const lect = Codi.user(c.lecturerId) || { name: 'Giảng viên' };
    ui.modal({
      title: 'Hỏi riêng giảng viên',
      body: html`<form class="stack-3" data-submit="tutor-lecturer-send" novalidate>
        <p class="small muted">Chỉ bạn và ${lect.name} xem được cuộc trao đổi này.</p>
        <div class="field"><label for="tl-text">Câu hỏi của bạn</label><textarea id="tl-text" name="text" rows="4">${lastQ ? lastQ.text : ''}</textarea><span class="field-help" data-tl-help>Ít nhất 10 ký tự.</span></div>
        <fieldset class="stack-1"><legend class="small"><strong>Gửi kèm</strong></legend>
          ${l.code ? html`<label class="check"><input type="checkbox" name="withCode" checked> Code hiện tại của bạn</label>` : ''}
          ${ft ? html`<label class="check"><input type="checkbox" name="withTest" checked> Test chưa đạt: ${ft.name}</label>` : ''}
          <label class="check"><input type="checkbox" name="withAi" checked> Tóm tắt trao đổi với AI trợ lý</label></fieldset>
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-close>Huỷ</button><button type="submit" class="btn btn-primary">Gửi cho giảng viên</button></div>
      </form>`,
    });
  });
  Codi.action('tutor-lecturer-send', (form, e, v) => {
    const p = panel; if (!p) return;
    const text = (v.text || '').trim();
    if (text.length < 10) { const h = form.querySelector('[data-tl-help]'); if (h) { h.textContent = 'Câu hỏi cần ít nhất 10 ký tự để giảng viên hiểu rõ.'; h.classList.add('field-error'); } return; }
    const l = lessonOf(p); const c = Codi.course(p.courseId);
    const ft = l.code ? failingTest(l, p.ctx.testId) : null;
    const aiSummary = thread(p.lessonId).filter((m) => m.role === 'user').slice(-3).map((m) => m.text).join(' · ');
    const conv = {
      id: Codi.uid('conv'), courseId: p.courseId, lessonId: p.lessonId, learnerId: uid(), lecturerId: c.lecturerId,
      status: 'open', fromAI: true,
      aiContext: { summary: v.withAi ? aiSummary : '', code: v.withCode && l.code ? currentCode(l) : '', failingTest: v.withTest && ft ? ft.name : null },
      messages: [{ from: 'learner', text, at: now() }], createdAt: now(),
    };
    Codi.set((st) => { if (!st.db.conversations) st.db.conversations = []; st.db.conversations.push(conv); }, { render: false });
    if (Codi.notify) Codi.notify(c.lecturerId, { title: 'Câu hỏi riêng từ học viên', body: `Bài "${l.title}"`, link: '/teach/questions?view=conversations&id=' + conv.id });
    const ov = form.closest('.overlay'); const closeBtn = ov && ov.querySelector('[data-close]'); if (closeBtn) closeBtn.click();
    refresh();
    ui.toast('Đã gửi câu hỏi cho giảng viên. Bạn sẽ nhận thông báo khi có trả lời.', { type: 'success' });
  });

  // ───────────────────────── S11a' selection toolbar ─────────────────────────
  // Selecting text in a lesson (reading or the code editor) shows "Hỏi AI" / "Giải thích" next to it.
  let selText = '';
  const bar = document.createElement('div');
  bar.className = 'tutor-seltool'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Hỏi AI về đoạn đã chọn'); bar.hidden = true;
  bar.innerHTML = `<button type="button" class="btn btn-primary btn-sm" data-sel="explain">Giải thích</button><button type="button" class="btn btn-secondary btn-sm" data-sel="ask">Hỏi AI</button>`;
  const lessonRoute = () => /^#\/learn\/([^/?]+)\/([^/?]+)/.exec(location.hash || '');
  const hideBar = () => { bar.hidden = true; selText = ''; };
  function readSelection(ev) {
    if (!lessonRoute()) return hideBar();
    const a = document.activeElement;
    let text = ''; let rect = null;
    if (a && a.classList && a.classList.contains('cp-textarea') && a.selectionEnd > a.selectionStart) {
      text = a.value.slice(a.selectionStart, a.selectionEnd);
      const r = a.getBoundingClientRect();
      rect = ev && ev.clientX ? { left: ev.clientX, top: ev.clientY - 12 } : { left: r.left + 40, top: r.top };
    } else {
      const s = window.getSelection();
      const node = s && s.rangeCount ? s.anchorNode : null;
      const host = node && (node.nodeType === 1 ? node : node.parentElement);
      if (host && host.closest('#app-main') && !host.closest('.overlay, .tutor-seltool, input, textarea, button')) {
        text = s.toString();
        const r = s.getRangeAt(0).getBoundingClientRect(); rect = { left: r.left + r.width / 2, top: r.top };
      }
    }
    text = text.trim();
    if (text.length < 3 || !rect) return hideBar();
    selText = text.slice(0, 1200);
    bar.hidden = false;
    const w = bar.offsetWidth || 180;
    bar.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left - w / 2)) + 'px';
    bar.style.top = Math.max(8, rect.top - 48) + 'px';
  }
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(bar));
  if (document.body) document.body.appendChild(bar);
  document.addEventListener('mouseup', (e) => { if (!bar.contains(e.target)) setTimeout(() => readSelection(e), 0); });
  document.addEventListener('keyup', (e) => { if (e.key === 'Escape') hideBar(); else if (e.shiftKey) readSelection(null); });
  window.addEventListener('hashchange', hideBar);
  window.addEventListener('scroll', hideBar, true);
  bar.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection while clicking
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sel]'); const m = lessonRoute();
    if (!b || !m || !selText) return;
    const text = selText; hideBar();
    tutor.open(m[1], m[2], { selection: text, ask: b.dataset.sel === 'explain' ? 'Giải thích giúp mình đoạn này.' : undefined });
  });
})();
