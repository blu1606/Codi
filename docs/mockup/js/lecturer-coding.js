/**
 * Lecturer side of coding practice (proposed feature).
 *  - /teach/courses/:courseId/code/:lessonId — code exercise editor
 *      challenge tabs: Đề bài · Code khởi đầu · Lời giải · Test case · Gợi ý  (+ "Chạy thử với lời giải")
 *      tutorial tab:   Các bước (title, body, starter code per step)
 *  - Codi.teachCode.analytics(course) — "Bài code" tab in Tiến độ học viên
 * Depends on Codi.code (js/coding-practice.js) and Codi.teach (js/lecturer.js).
 */
(function () {
  const Codi = window.Codi;
  const { html, icon, fmt, ui } = Codi;
  const raw = Codi.raw;
  const T = () => Codi.teach;
  const CC = () => Codi.code;

  // ───────────────────────── editor draft ─────────────────────────
  let ce = null; // {key, courseId, lessonId, title, durationMin, code, tab, dirty, showErrors, check, running}
  const signature = (code) => JSON.stringify([code.solution, (code.tests || []).map((t) => [t.call, t.expectedText])]);
  function load(c, l) {
    const key = c.id + '/' + l.id;
    if (ce && ce.key === key) return ce;
    const code = JSON.parse(JSON.stringify(l.code));
    const toText = (t) => { t.expectedText = JSON.stringify(t.expected); };
    if (code.tests) code.tests.forEach(toText);
    if (code.steps) code.steps.forEach((s) => { s.tests = (s.tests || []); s.tests.forEach(toText); });
    ce = { key, courseId: c.id, lessonId: l.id, title: l.title, durationMin: l.durationMin, code, tab: code.kind === 'tutorial' ? 'steps' : 'brief', dirty: false, showErrors: false, check: null, stepChecks: {}, running: false };
    return ce;
  }
  const parseExpected = (t) => { try { return { ok: true, value: JSON.parse(t.expectedText) }; } catch (e) { return { ok: false }; } };

  function problems(d) {
    const p = {}; const list = [];
    const add = (k, msg) => { p[k] = msg; list.push(msg); };
    if (!d.title.trim()) add('title', 'Tên bài không được để trống.');
    if (d.code.kind === 'challenge') {
      if (!d.code.instructions.some((s) => s.trim())) add('instructions', 'Cần ít nhất một bước yêu cầu có nội dung.');
      if (!d.code.solution.trim()) add('solution', 'Lời giải không được để trống.');
      d.code.tests.forEach((t, i) => {
        if (!t.name.trim()) add(`tests.${i}.name`, `Test ${i + 1}: chưa có tên.`);
        if (!t.call.trim()) add(`tests.${i}.call`, `Test ${i + 1}: chưa có biểu thức gọi hàm.`);
        if (!parseExpected(t).ok) add(`tests.${i}.expected`, `Test ${i + 1}: giá trị mong đợi phải là JSON hợp lệ, ví dụ 5, "Giỏi", [1, 2] hoặc {"a": 1}.`);
      });
    } else {
      if (!d.code.steps.length) add('steps', 'Cần ít nhất một bước hướng dẫn.');
      d.code.steps.forEach((s, si) => (s.tests || []).forEach((t, i) => {
        const at = `Bước ${si + 1}, test ${i + 1}`;
        if (!t.name.trim()) add(`steps.${si}.tests.${i}.name`, `${at}: chưa có tên.`);
        if (!t.call.trim()) add(`steps.${si}.tests.${i}.call`, `${at}: chưa có biểu thức gọi hàm.`);
        if (!parseExpected(t).ok) add(`steps.${si}.tests.${i}.expected`, `${at}: giá trị mong đợi phải là JSON hợp lệ.`);
      }));
    }
    return { p, list };
  }
  const fieldErr = (pr, k) => (ce.showErrors && pr.p[k] ? html`<p class="field-error" role="alert">${icon('alert-circle', { cls: 'icon-sm' })}<span>${pr.p[k]}</span></p>` : '');

  // Editors (starter / solution / tutorial step) write straight into the draft.
  CC().onInput('te', (key, value) => {
    if (!ce) return;
    const field = key.split(':')[1];
    if (field === 'starter') ce.code.starter = value;
    else if (field === 'solution') ce.code.solution = value;
    else if (field === 'step') ce.code.steps[Number(key.split(':')[2])].starter = value;
    ce.dirty = true;
  });
  // Plain fields: data-path like "title", "tests.2.call", "steps.0.body".
  function setPath(path, value) {
    const parts = path.split('.');
    let o = parts[0] === 'title' || parts[0] === 'durationMin' ? ce : ce.code;
    for (let i = 0; i < parts.length - 1; i++) o = o[isNaN(parts[i]) ? parts[i] : Number(parts[i])];
    const last = parts[parts.length - 1];
    o[isNaN(last) ? last : Number(last)] = value;
    ce.dirty = true;
  }
  Codi.action('te-field', (el) => {
    if (!ce) return;
    const v = el.type === 'checkbox' ? el.checked : el.dataset.num !== undefined ? Number(el.value) : el.value;
    setPath(el.dataset.path, v);
    if (el.type === 'checkbox' || el.tagName === 'SELECT') Codi.rerender();
  });

  // ───────────────────────── tabs ─────────────────────────
  function briefTab(pr) {
    const d = ce;
    return html`<div class="stack-4">
      <div class="grid-2">
        <div class="field ${d.showErrors && pr.p.title ? 'is-invalid' : ''}"><label for="te-title">Tên bài <span class="req">*</span></label><input id="te-title" value="${d.title}" data-input="te-field" data-path="title">${fieldErr(pr, 'title')}</div>
        <div class="field"><label for="te-dur">Thời lượng dự kiến (phút)</label><input id="te-dur" type="number" min="1" value="${d.durationMin}" data-input="te-field" data-path="durationMin" data-num></div>
      </div>
      <div class="field"><label for="te-file">Tên tệp hiển thị cho học viên</label><input id="te-file" value="${d.code.fileName}" data-input="te-field" data-path="fileName"><span class="field-help">Ví dụ: <code>don-hang.js</code>. Ngôn ngữ: JavaScript (chạy thật trên trình duyệt).</span></div>
      <fieldset class="stack-3 te-fieldset"><legend class="field-label">Các bước yêu cầu <span class="req">*</span></legend>
        <p class="field-help">Mỗi bước hiện thành một dòng có dấu tick bên trái trình soạn code. Gắn test vào bước ở tab "Test case" để bước tự tick khi đạt. Dùng <code>\`tên\`</code> để đánh dấu code.</p>
        ${d.code.instructions.map((s, i) => html`<div class="te-row"><label class="sr-only" for="te-ins-${i}">Bước ${i + 1}</label><span class="te-n">${i + 1}</span><textarea id="te-ins-${i}" rows="2" data-input="te-field" data-path="instructions.${i}">${s}</textarea>
          <button class="btn btn-ghost btn-icon btn-sm" data-action="te-remove" data-what="instructions" data-i="${i}" aria-label="Xoá bước ${i + 1}" ${d.code.instructions.length < 2 ? raw('disabled') : ''}>${icon('trash', { cls: 'icon-sm' })}</button></div>`)}
        ${fieldErr(pr, 'instructions')}
        <div><button class="btn btn-secondary btn-sm" data-action="te-add" data-what="instructions">${icon('plus', { cls: 'icon-sm' })} Thêm bước</button></div>
      </fieldset>
    </div>`;
  }
  function codeTab(field, pr) {
    const d = ce; const isSol = field === 'solution';
    return html`<div class="stack-3">
      <p class="small muted">${isSol ? 'Lời giải mẫu dùng để chạy thử test và hiện cho học viên khi lời giải được mở. Học viên không thấy lời giải trước khi đạt hoặc nộp sai 3 lần.' : 'Code học viên thấy khi mở bài lần đầu. Nên để sẵn tên hàm và chú thích "Viết code của bạn ở đây".'}</p>
      ${CC().editor({ id: `te-${field}`, key: `te:${field}`, value: d.code[field], fileName: d.code.fileName, language: d.code.language, label: isSol ? 'Lời giải mẫu' : 'Code khởi đầu', minRows: 16, maxRows: 24 })}
      ${isSol ? fieldErr(pr, 'solution') : ''}
    </div>`;
  }
  function testsTab(pr) {
    const d = ce; const steps = d.code.instructions;
    return html`<div class="stack-3">
      <p class="small muted">Mỗi test là một biểu thức JavaScript chạy sau code của học viên, so với giá trị mong đợi (JSON). Test ẩn chỉ chạy khi học viên nộp bài.</p>
      ${!d.code.tests.length ? ui.alert({ type: 'warn', title: 'Bài chưa có test', body: 'Cần ít nhất một test để gửi xuất bản khoá học.' }) : ''}
      <ol class="te-tests">${d.code.tests.map((t, i) => html`<li class="te-test">
        <div class="row-between"><strong class="small">Test ${i + 1}</strong>
          <div class="row" style="gap:8px"><label class="check"><input type="checkbox" data-change="te-field" data-path="tests.${i}.hidden" ${t.hidden ? raw('checked') : ''}> Test ẩn</label>
            <button class="btn btn-ghost btn-icon btn-sm" data-action="te-remove" data-what="tests" data-i="${i}" aria-label="Xoá test ${i + 1}">${icon('trash', { cls: 'icon-sm' })}</button></div></div>
        <div class="grid-2">
          <div class="field ${d.showErrors && pr.p[`tests.${i}.name`] ? 'is-invalid' : ''}"><label for="te-tn-${i}">Tên hiển thị</label><input id="te-tn-${i}" value="${t.name}" data-input="te-field" data-path="tests.${i}.name">${fieldErr(pr, `tests.${i}.name`)}</div>
          <div class="field"><label for="te-ts-${i}">Thuộc bước</label><select id="te-ts-${i}" data-change="te-field" data-path="tests.${i}.step" data-num>${steps.map((_, k) => html`<option value="${k}" ${(t.step || 0) === k ? raw('selected') : ''}>Bước ${k + 1}</option>`)}</select></div>
        </div>
        <div class="grid-2">
          <div class="field ${d.showErrors && pr.p[`tests.${i}.call`] ? 'is-invalid' : ''}"><label for="te-tc-${i}">Biểu thức gọi</label><input id="te-tc-${i}" class="mono" value="${t.call}" data-input="te-field" data-path="tests.${i}.call" placeholder="tongTien([{ price: 1 }])">${fieldErr(pr, `tests.${i}.call`)}</div>
          <div class="field ${d.showErrors && pr.p[`tests.${i}.expected`] ? 'is-invalid' : ''}"><label for="te-te-${i}">Giá trị mong đợi (JSON)</label><input id="te-te-${i}" class="mono" value="${t.expectedText}" data-input="te-field" data-path="tests.${i}.expectedText" placeholder="350">${fieldErr(pr, `tests.${i}.expected`)}</div>
        </div></li>`)}</ol>
      <div class="row"><button class="btn btn-secondary btn-sm" data-action="te-add" data-what="tests">${icon('plus', { cls: 'icon-sm' })} Thêm test</button>
        <button class="btn btn-ghost btn-sm" data-action="te-ai-tests" ${!d.code.tests.length || !d.code.solution.trim() || (d.aiTests && d.aiTests.state === 'loading') ? raw('disabled') : ''}>${icon('sparkles', { cls: 'icon-sm' })} AI gợi ý test case biên</button></div>
      ${!d.code.tests.length || !d.code.solution.trim() ? html`<p class="xsmall muted">AI cần ít nhất một test và lời giải mẫu để đề xuất test biên.</p>` : ''}
      ${aiTestsPanel()}
    </div>`;
  }
  // AI test suggestions: derived from the first test's call shape; expected values come from running the solution.
  function aiTestsPanel() {
    const a = ce.aiTests; if (!a) return '';
    if (a.state === 'loading') return html`<div class="ai-thinking-row" aria-busy="true"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span>AI đang tìm trường hợp biên và chạy lời giải…</span><button class="btn btn-ghost btn-sm" data-action="te-ai-stop">${icon('x', { cls: 'icon-sm' })} Dừng</button></div>`;
    if (a.state === 'error') return ui.alert({ type: 'danger', title: 'AI chưa gợi ý được test', body: 'Các test hiện có không bị ảnh hưởng.', actions: html`<button class="btn btn-secondary btn-sm" data-action="te-ai-tests">Thử lại</button>` });
    if (a.state === 'limit') return ui.alert({ type: 'warn', title: 'Đã dùng hết lượt gợi ý bằng AI trong giờ này', body: 'Thử lại sau ít phút hoặc thêm test thủ công.' });
    if (!a.items.length) return html`<p class="small muted" role="status">AI không tìm thêm được trường hợp biên mới cho bài này.</p>`;
    return html`<section class="la-block" aria-label="Test do AI gợi ý"><div class="row-between"><strong class="small">${icon('sparkles', { cls: 'icon-sm' })} ${a.items.length} test AI gợi ý</strong><button class="btn btn-ghost btn-sm" data-action="te-ai-dismiss">Bỏ tất cả</button></div>
      <ul class="la-tests">${a.items.map((t, i) => html`<li class="te-test">
        <div class="stack-1"><span class="small strong">${t.name}${t.hidden ? ' (ẩn)' : ''}</span><code class="xsmall">${t.call}</code>
          ${t.ok ? html`<span class="xsmall muted">Lời giải trả về: <code>${t.expectedText}</code></span>` : html`<span class="xsmall text-warn">${icon('alert-triangle', { cls: 'icon-sm' })} ${t.error}</span>`}</div>
        <div class="row" style="gap:8px"><button class="btn btn-primary btn-sm" data-action="te-ai-add" data-i="${i}">Thêm</button><button class="btn btn-ghost btn-sm" data-action="te-ai-drop" data-i="${i}">Bỏ</button></div></li>`)}</ul>
      <p class="xsmall muted">Giá trị mong đợi lấy từ lời giải mẫu — kiểm tra lại cho đúng với đề bài trước khi lưu.</p></section>`;
  }
  function hintsTab() {
    const d = ce;
    return html`<div class="stack-3">
      <p class="small muted">Gợi ý mở dần: gợi ý 1 có sẵn, mỗi lần nộp chưa đạt mở thêm một gợi ý. Lời giải mở sau 3 lần nộp chưa đạt.</p>
      ${d.code.hints.map((h, i) => html`<div class="te-row"><label class="sr-only" for="te-h-${i}">Gợi ý ${i + 1}</label><span class="te-n">${i + 1}</span><textarea id="te-h-${i}" rows="2" data-input="te-field" data-path="hints.${i}">${h}</textarea>
        <button class="btn btn-ghost btn-icon btn-sm" data-action="te-remove" data-what="hints" data-i="${i}" aria-label="Xoá gợi ý ${i + 1}">${icon('trash', { cls: 'icon-sm' })}</button></div>`)}
      <div><button class="btn btn-secondary btn-sm" data-action="te-add" data-what="hints">${icon('plus', { cls: 'icon-sm' })} Thêm gợi ý</button></div>
    </div>`;
  }
  function stepsTab(pr) {
    const d = ce;
    return html`<div class="stack-4">
      <div class="grid-2">
        <div class="field ${d.showErrors && pr.p.title ? 'is-invalid' : ''}"><label for="te-title">Tên bài <span class="req">*</span></label><input id="te-title" value="${d.title}" data-input="te-field" data-path="title">${fieldErr(pr, 'title')}</div>
        <div class="field"><label for="te-dur">Thời lượng dự kiến (phút)</label><input id="te-dur" type="number" min="1" value="${d.durationMin}" data-input="te-field" data-path="durationMin" data-num></div>
      </div>
      <p class="small muted">Học viên đi qua từng bước với mục lục bên trái, trình soạn code và Console bên phải. Bước đánh dấu "Lời giải" được che cho đến khi học viên chủ động mở.</p>
      ${fieldErr(pr, 'steps')}
      ${d.code.steps.map((s, i) => html`<details class="card te-step" ${i === 0 ? raw('open') : ''}>
        <summary class="card-body compact row-between"><span class="row"><span class="te-n">${i + 1}</span><strong class="small">${s.title || 'Bước chưa đặt tên'}</strong>${s.isSolution ? html`<span class="badge badge-neutral">Lời giải</span>` : ''}${s.tests && s.tests.length ? html`<span class="badge badge-neutral">${s.tests.length} test</span>` : ''}</span>${icon('chevron-down', { cls: 'icon-sm' })}</summary>
        <div class="card-body stack-3">
          <div class="field"><label for="te-st-${i}">Tiêu đề bước</label><input id="te-st-${i}" value="${s.title}" data-input="te-field" data-path="steps.${i}.title"></div>
          <div class="field"><label for="te-sb-${i}">Nội dung hướng dẫn</label><textarea id="te-sb-${i}" rows="5" data-input="te-field" data-path="steps.${i}.body">${s.body}</textarea><span class="field-help">Hỗ trợ **in đậm**, \`code\` và danh sách bắt đầu bằng "- ".</span></div>
          <label class="check"><input type="checkbox" data-change="te-field" data-path="steps.${i}.isSolution" ${s.isSolution ? raw('checked') : ''}> Đây là bước lời giải (che cho đến khi học viên mở)</label>
          <span class="field-label">Code của bước</span>
          ${CC().editor({ id: `te-step-${i}`, key: `te:step:${i}`, value: s.starter || '', fileName: d.code.fileName, language: d.code.language, label: `Code của bước ${i + 1}`, minRows: 8, maxRows: 16 })}
          ${stepTestsEditor(s, i, pr)}
          <div><button class="btn btn-danger-outline btn-sm" data-action="te-remove" data-what="steps" data-i="${i}" ${d.code.steps.length < 2 ? raw('disabled') : ''}>${icon('trash', { cls: 'icon-sm' })} Xoá bước</button></div>
        </div></details>`)}
      <div><button class="btn btn-secondary btn-sm" data-action="te-add" data-what="steps">${icon('plus', { cls: 'icon-sm' })} Thêm bước</button></div>
    </div>`;
  }

  // Tests attached to one tutorial step (e.g. "Sửa code của mình!", "Thử thách"). Learners see them as
  // "Kiểm tra bước này" and run them with the Chạy button of that step.
  const solutionCode = (d) => { const s = d.code.steps.find((x) => x.isSolution); return s ? s.starter || '' : ''; };
  function stepTestsEditor(s, si, pr) {
    const d = ce; const tests = s.tests || [];
    const chk = d.stepChecks[si];
    const sol = solutionCode(d);
    const pass = chk ? chk.outcomes.filter((o) => o.pass).length : 0;
    return html`<fieldset class="te-fieldset stack-3"><legend class="field-label">Test kiểm tra của bước</legend>
      <p class="field-help">Không bắt buộc. Có test thì học viên thấy mục "Kiểm tra bước này" và bước được tick khi đạt. Mỗi test là một biểu thức chạy sau code của học viên, so với giá trị JSON mong đợi.</p>
      ${tests.length ? html`<ol class="te-tests">${tests.map((t, i) => {
        const base = `steps.${si}.tests.${i}`;
        return html`<li class="te-test">
          <div class="row-between"><strong class="small">Test ${i + 1}</strong><button class="btn btn-ghost btn-icon btn-sm" data-action="te-remove" data-what="steptests" data-i="${si}" data-j="${i}" aria-label="Xoá test ${i + 1} của bước ${si + 1}">${icon('trash', { cls: 'icon-sm' })}</button></div>
          <div class="field ${d.showErrors && pr.p[`${base}.name`] ? 'is-invalid' : ''}"><label for="te-sn-${si}-${i}">Tên hiển thị</label><input id="te-sn-${si}-${i}" value="${t.name}" data-input="te-field" data-path="${base}.name">${fieldErr(pr, `${base}.name`)}</div>
          <div class="grid-2">
            <div class="field ${d.showErrors && pr.p[`${base}.call`] ? 'is-invalid' : ''}"><label for="te-sc-${si}-${i}">Biểu thức gọi</label><input id="te-sc-${si}-${i}" class="mono" value="${t.call}" data-input="te-field" data-path="${base}.call" placeholder="xepLoai(9)">${fieldErr(pr, `${base}.call`)}</div>
            <div class="field ${d.showErrors && pr.p[`${base}.expected`] ? 'is-invalid' : ''}"><label for="te-se-${si}-${i}">Giá trị mong đợi (JSON)</label><input id="te-se-${si}-${i}" class="mono" value="${t.expectedText}" data-input="te-field" data-path="${base}.expectedText" placeholder="&quot;Giỏi&quot;">${fieldErr(pr, `${base}.expected`)}</div>
          </div></li>`; })}</ol>` : ''}
      <div class="row">
        <button class="btn btn-secondary btn-sm" data-action="te-add" data-what="steptests" data-i="${si}">${icon('plus', { cls: 'icon-sm' })} Thêm test</button>
        ${tests.length ? html`<button class="btn btn-ghost btn-sm" data-action="te-step-check" data-i="${si}" ${sol.trim() ? '' : raw('disabled')}>${icon('play', { cls: 'icon-sm' })} Chạy thử với code ở bước lời giải</button>` : ''}
      </div>
      ${tests.length && !sol.trim() ? html`<p class="xsmall muted">Thêm code vào bước đánh dấu "Lời giải" để chạy thử test.</p>` : ''}
      ${chk ? html`<p class="te-check-sum ${pass === chk.outcomes.length ? 'is-pass' : 'is-fail'}" role="status">${icon(pass === chk.outcomes.length ? 'check-circle' : 'x-circle', { cls: 'icon-sm' })} Code lời giải đạt ${pass}/${chk.outcomes.length} test của bước này</p>
        <ul class="cp-tests">${tests.map((t) => CC().testRow({ name: t.name || 'Test chưa đặt tên' }, chk.outcomes.find((o) => o.id === t.id)))}</ul>` : ''}
    </fieldset>`;
  }

  function checkPanel() {
    const d = ce; const chk = d.check; const tests = d.code.tests;
    const fresh = chk && chk.sig === signature(d.code);
    const passCount = chk ? chk.outcomes.filter((o) => o.pass).length : 0;
    return html`<section class="card te-check" aria-labelledby="te-check-h"><div class="card-body stack-3">
      <h2 class="tc-h" id="te-check-h">${icon('play', { cls: 'icon-sm' })} Chạy thử với lời giải</h2>
      <p class="small muted">Chạy lời giải mẫu với toàn bộ test (cả test ẩn). Bài chỉ đủ điều kiện xuất bản khi lời giải đạt tất cả test.</p>
      <button class="btn btn-primary" data-action="te-check" data-cp-run ${d.running || !tests.length ? raw('disabled') : ''} ${d.running ? raw('aria-busy="true"') : ''}>${d.running ? 'Đang chạy…' : 'Chạy thử với lời giải'}</button>
      ${!tests.length ? html`<p class="small text-warn">${icon('alert-triangle', { cls: 'icon-sm' })} Thêm ít nhất một test ở tab "Test case".</p>` : ''}
      ${chk ? html`
        <p class="te-check-sum ${chk.outcomes.length && passCount === chk.outcomes.length ? 'is-pass' : 'is-fail'}" role="status">${icon(passCount === chk.outcomes.length ? 'check-circle' : 'x-circle', { cls: 'icon-sm' })} Lời giải đạt ${passCount}/${chk.outcomes.length} test${fresh ? '' : ' · đã có thay đổi sau lần chạy này, hãy chạy lại'}</p>
        <ul class="cp-tests">${tests.map((t) => CC().testRow({ name: `${t.name}${t.hidden ? ' (ẩn)' : ''}` }, chk.outcomes.find((o) => o.id === t.id)))}</ul>
        <details class="cp-console-details"><summary class="small strong">Console</summary>${CC().consoleView(chk.res)}</details>` : ''}
    </div></section>`;
  }

  // ───────────────────────── route ─────────────────────────
  Codi.route('/teach/courses/:courseId/code/:lessonId', (p) => {
    const c = Codi.course(p.courseId);
    if (!T().isMine(c)) return T().notMine();
    const f = T().findLesson(c, p.lessonId);
    if (!f || !f.l.code) return T().shell('/teach/courses', ui.empty({ icon: 'code', title: 'Không tìm thấy bài code', actions: html`<a class="btn btn-primary" href="#/teach/courses/${c.id}/content">Về nội dung khoá học</a>` }));
    const d = load(c, f.l); const pr = problems(d);
    const isTut = d.code.kind === 'tutorial';
    const tabs = isTut ? [['steps', 'Các bước']] : [['brief', 'Đề bài'], ['starter', 'Code khởi đầu'], ['solution', 'Lời giải'], ['tests', `Test case (${d.code.tests.length})`], ['hints', 'Gợi ý']];
    const body = { brief: () => briefTab(pr), starter: () => codeTab('starter', pr), solution: () => codeTab('solution', pr), tests: () => testsTab(pr), hints: hintsTab, steps: () => stepsTab(pr) }[d.tab]();
    const ro = c.status === 'pending';
    Codi.onMount(CC().restoreFocus);
    return T().shell('/teach/courses', html`
      <div class="stack-3" style="margin-bottom:16px">
        <a class="small" href="#/teach/courses/${c.id}/content">${icon('arrow-left', { cls: 'icon-sm' })} ${c.title}</a>
        <div class="row-between"><div class="stack-1"><span class="xsmall muted">${isTut ? 'Hướng dẫn code' : 'Bài code'} · ${d.code.language === 'python' ? 'Python (mô phỏng)' : 'JavaScript'}</span><h1>${d.title || 'Bài chưa đặt tên'}</h1></div>
          <div class="row">${d.dirty ? html`<span class="badge badge-warn">${icon('pencil')}Có thay đổi chưa lưu</span>` : ''}
            <button class="btn btn-secondary" data-action="te-preview" data-course="${c.id}" data-lesson="${f.l.id}">${icon('eye', { cls: 'icon-sm' })} Xem như học viên</button>
            <button class="btn btn-primary" data-action="te-save" ${ro ? raw('disabled') : ''}>Lưu bài</button></div></div>
        ${ro ? ui.alert({ type: 'info', title: 'Khoá học đang chờ duyệt — chỉ đọc', body: 'Bạn sửa được sau khi quản trị viên duyệt hoặc từ chối.' }) : ''}
        ${d.showErrors && pr.list.length ? ui.alert({ type: 'danger', title: `Còn ${pr.list.length} lỗi cần sửa trước khi lưu`, body: html`<ul class="small">${pr.list.map((x) => html`<li>${x}</li>`)}</ul>` }) : ''}
      </div>
      <div class="te-layout" data-cp-workspace="te-editor">
        <div class="stack-4">
          <div class="tabs" role="tablist">${tabs.map(([k, label]) => html`<button class="tab" role="tab" aria-selected="${String(d.tab === k)}" data-action="te-tab" data-tab="${k}">${label}</button>`)}</div>
          ${body}
        </div>
        ${isTut ? html`<aside class="card te-check"><div class="card-body stack-2"><h2 class="tc-h">Học viên sẽ thấy</h2><p class="small muted">${d.code.steps.length} bước · ${d.code.steps.filter((s) => s.tests && s.tests.length).length} bước có test · ${d.code.steps.some((s) => s.isSolution) ? 'có bước lời giải được che' : 'chưa có bước lời giải'}.</p><p class="small muted">Bấm "Xem như học viên" để mở bài trong trình phát bài học.</p></div></aside>` : checkPanel()}
      </div>`);
  }, { title: 'Soạn bài code', role: 'lecturer' });

  Codi.action('te-tab', (el) => { if (ce) { ce.tab = el.dataset.tab; Codi.rerender(); } });
  Codi.action('te-add', (el) => {
    const w = el.dataset.what; const code = ce.code;
    if (w === 'instructions') code.instructions.push('');
    if (w === 'hints') code.hints.push('');
    if (w === 'tests') code.tests.push({ id: 'ct-' + Date.now().toString(36), name: '', call: '', expected: null, expectedText: '', step: 0, hidden: false });
    if (w === 'steps') code.steps.splice(Math.max(0, code.steps.length - (code.steps[code.steps.length - 1] && code.steps[code.steps.length - 1].isSolution ? 1 : 0)), 0, { title: 'Bước mới', body: '', starter: '', tests: [] });
    if (w === 'steptests') {
      const si = Number(el.dataset.i);
      code.steps[si].tests.push({ id: 'st-' + Date.now().toString(36), name: '', call: '', expected: null, expectedText: '' });
      delete ce.stepChecks[si];
    }
    ce.dirty = true; Codi.rerender();
  });
  let aiJob = null;
  Codi.action('te-ai-tests', () => {
    if (!ce) return;
    const d = ce;
    aiJob = Codi.lecturerAI.task({
      onLimit() { d.aiTests = { state: 'limit', items: [] }; Codi.rerender(); },
      onStart() { d.aiTests = { state: 'loading', items: [] }; Codi.rerender(); },
      onError() { d.aiTests = { state: 'error', items: [] }; Codi.rerender(); },
      onDone(items) { d.aiTests = { state: 'done', items }; Codi.rerender(); },
    }, () => Codi.lecturerAI.suggestTests(d.code), 1200);
  });
  Codi.action('te-ai-stop', () => { if (aiJob) aiJob.stop(); if (ce) ce.aiTests = null; Codi.rerender(); ui.toast('Đã dừng gợi ý test.'); });
  Codi.action('te-ai-dismiss', () => { if (ce) ce.aiTests = null; Codi.rerender(); });
  Codi.action('te-ai-drop', (el) => { ce.aiTests.items.splice(Number(el.dataset.i), 1); Codi.rerender(); });
  Codi.action('te-ai-add', (el) => {
    const t = ce.aiTests.items.splice(Number(el.dataset.i), 1)[0];
    ce.code.tests.push({ id: 'ct-' + Date.now().toString(36), name: t.name, call: t.call, expected: null, expectedText: t.ok ? t.expectedText : '', step: t.step, hidden: t.hidden });
    ce.dirty = true; Codi.rerender();
    ui.toast(t.ok ? 'Đã thêm test. Nhớ chạy thử với lời giải rồi lưu bài.' : 'Đã thêm test — hãy nhập giá trị mong đợi.', { type: t.ok ? 'success' : 'warn' });
  });
  Codi.action('te-step-check', async (el) => {
    if (!ce || ce.running) return;
    const d = ce; const si = Number(el.dataset.i);
    const tests = d.code.steps[si].tests.map((t) => { const pe = parseExpected(t); return { id: t.id, name: t.name, call: t.call, expected: pe.ok ? pe.value : '(JSON không hợp lệ)' }; });
    d.running = true; Codi.rerender();
    const res = await CC().run(solutionCode(d), tests, { language: d.code.language });
    d.stepChecks[si] = { outcomes: CC().grade(tests, res), res };
    d.running = false; Codi.rerender();
  });
  Codi.action('te-remove', async (el) => {
    const w = el.dataset.what; const i = Number(el.dataset.i);
    if (w === 'steps' || w === 'tests') {
      const r = await ui.confirm({ title: w === 'steps' ? 'Xoá bước này?' : 'Xoá test này?', body: 'Thay đổi chỉ được lưu khi bạn bấm "Lưu bài".', confirmLabel: 'Xoá', danger: true });
      if (!r.ok) return;
    }
    if (w === 'steptests') { ce.code.steps[i].tests.splice(Number(el.dataset.j), 1); delete ce.stepChecks[i]; }
    else { ce.code[w].splice(i, 1); if (w === 'steps') ce.stepChecks = {}; }
    ce.dirty = true; Codi.rerender();
  });
  Codi.action('te-check', async () => {
    if (!ce || ce.running) return;
    const d = ce;
    const tests = d.code.tests.map((t) => { const pe = parseExpected(t); return { id: t.id, name: t.name, call: t.call, expected: pe.ok ? pe.value : '(JSON không hợp lệ)' }; });
    CC().rememberFocus(); d.running = true; Codi.rerender();
    const res = await CC().run(d.code.solution, tests, { language: d.code.language, solution: d.code.solution });
    d.check = { at: new Date().toISOString(), sig: signature(d.code), outcomes: CC().grade(tests, res), res };
    d.running = false; Codi.rerender();
  });
  Codi.action('te-save', () => {
    const d = ce; const pr = problems(d);
    if (pr.list.length) { d.showErrors = true; Codi.rerender(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const c = Codi.course(d.courseId); const f = T().findLesson(c, d.lessonId);
    const code = JSON.parse(JSON.stringify(d.code));
    if (code.steps) {
      // Steps without tests are stored without the field, so learners see no empty "Kiểm tra bước này".
      code.steps.forEach((s) => {
        if (s.tests && s.tests.length) s.tests.forEach((t) => { t.expected = JSON.parse(t.expectedText); delete t.expectedText; });
        else delete s.tests;
      });
    }
    if (code.tests) {
      code.tests.forEach((t) => { t.expected = JSON.parse(t.expectedText); delete t.expectedText; });
      const fresh = d.check && d.check.sig === signature(d.code);
      code.solutionCheck = fresh ? { ok: d.check.outcomes.length > 0 && d.check.outcomes.every((o) => o.pass), passed: d.check.outcomes.filter((o) => o.pass).length, total: d.check.outcomes.length, at: d.check.at } : null;
    }
    Object.assign(f.l, { title: d.title.trim(), durationMin: Math.max(1, Number(d.durationMin) || 1), code });
    T().contentChanged(c);
    d.dirty = false; d.showErrors = false;
    T().persist();
    ui.toast(code.solutionCheck === null && code.kind === 'challenge' ? 'Đã lưu. Hãy bấm "Chạy thử với lời giải" để bài đủ điều kiện xuất bản.' : 'Đã lưu bài code.', { type: code.solutionCheck === null && code.kind === 'challenge' ? 'warn' : 'success' });
  });
  Codi.action('te-preview', (el) => {
    if (ce && ce.dirty) { ui.toast('Lưu bài trước để xem bản mới nhất như học viên.', { type: 'warn' }); return; }
    Codi.go(`/teach/courses/${el.dataset.course}/code/${el.dataset.lesson}/preview`);
  });
  // Full-page preview so runs re-render normally; lecturer attempts are excluded from analytics.
  Codi.route('/teach/courses/:courseId/code/:lessonId/preview', (p) => {
    const c = Codi.course(p.courseId);
    if (!T().isMine(c)) return T().notMine();
    const l = Codi.lesson(c, p.lessonId);
    if (!l || !l.code) return T().notMine();
    return T().shell('/teach/courses', html`<div class="stack-4">
      <a class="small" href="#/teach/courses/${c.id}/code/${l.id}">${icon('arrow-left', { cls: 'icon-sm' })} Quay lại trình soạn bài code</a>
      ${ui.alert({ type: 'info', title: 'Xem như học viên', body: 'Bạn thử bài đúng như học viên thấy. Lượt chạy của giảng viên không tính vào số liệu Tiến độ học viên.' })}
      <h1>${l.title}</h1>
      ${CC().view(c, l)}
    </div>`);
  }, { title: 'Xem bài code như học viên', role: 'lecturer' });

  // ───────────────────────── analytics ─────────────────────────
  function analytics(c) {
    const lessons = Codi.lessons(c).filter((l) => l.code);
    const isLearner = (id) => { const u = Codi.user(id); return !!u && u.role === 'learner'; };
    const all = (Codi.db().codeAttempts || []).filter((a) => a.courseId === c.id && isLearner(a.userId));
    const rows = lessons.map((l) => {
      const at = all.filter((a) => a.lessonId === l.id);
      if (l.code.kind === 'tutorial') {
        const last = l.code.steps.length - 1;
        const done = at.filter((a) => (a.tutorialVisited || []).includes(last)).length;
        return { l, n: at.length, rate: at.length ? Math.round((done / at.length) * 100) : null, avgSubmits: null, viewed: at.filter((a) => a.solutionViewed).length, worst: null, avgStep: at.length ? (at.reduce((s, a) => s + (a.tutorialStep || 0) + 1, 0) / at.length).toFixed(1) : null };
      }
      const submitted = at.filter((a) => a.submits > 0);
      const fails = {};
      at.forEach((a) => Object.keys(a.failedTests || {}).forEach((k) => { fails[k] = (fails[k] || 0) + a.failedTests[k]; }));
      const worstId = Object.keys(fails).sort((a, b) => fails[b] - fails[a])[0];
      const worstTest = worstId ? l.code.tests.find((t) => t.id === worstId) : null;
      return { l, n: at.length, rate: at.length ? Math.round((at.filter((a) => a.passed).length / at.length) * 100) : null, avgSubmits: submitted.length ? (submitted.reduce((s, a) => s + a.submits, 0) / submitted.length).toFixed(1) : null, viewed: at.filter((a) => a.solutionViewed).length, worst: worstTest ? { t: worstTest, count: fails[worstId] } : null };
    });
    return html`<div class="stack-3">
      <p class="small muted">Số liệu từ mọi lượt làm bài code của học viên. Tỉ lệ đạt dưới 60% hoặc một test bị sai nhiều lần là dấu hiệu nên xem lại đề bài hoặc thêm gợi ý.</p>
      <div class="table-wrap"><table class="table"><thead><tr><th>Bài</th><th class="num">Học viên làm</th><th class="num">Tỉ lệ đạt / hoàn thành</th><th class="num">Số lần nộp TB</th><th>Test sai nhiều nhất</th><th class="num">Xem lời giải</th></tr></thead><tbody>
        ${rows.map((r) => html`<tr>
          <td><div class="stack-1"><span class="small strong">${r.l.title}</span><span class="xsmall muted">${r.l.code.kind === 'tutorial' ? `Hướng dẫn · bước TB đạt tới: ${r.avgStep || '—'}` : `Bài code · ${r.l.code.tests.length} test`}</span></div></td>
          <td class="num">${r.n}</td>
          <td class="num"><span class="od-nowrap">${r.rate === null ? '—' : r.rate + '%'}</span>${r.rate !== null && r.rate < 60 ? html` <span class="badge badge-warn">${icon('alert-triangle')}Cần xem lại</span>` : ''}</td>
          <td class="num">${r.avgSubmits || '—'}</td>
          <td class="small">${r.worst ? html`<span class="stack-1"><span>${r.worst.t.name}${r.worst.t.hidden ? ' (ẩn)' : ''}</span><span class="xsmall muted">Sai ${r.worst.count} lần · bước ${(r.worst.t.step || 0) + 1}</span></span>` : '—'}</td>
          <td class="num">${r.viewed}</td></tr>`)}
      </tbody></table></div>
      <div class="row"><a class="btn btn-secondary btn-sm" href="#/teach/courses/${c.id}/content">${icon('code', { cls: 'icon-sm' })} Sửa bài code trong nội dung khoá học</a></div>
    </div>`;
  }
  Codi.teachCode = { analytics };
})();
