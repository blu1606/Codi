/**
 * admin.js — admin console (PRODUCT.md Flow D1; screens S30–S35).
 * Routes (role admin): '/admin' · '/admin/publication' · '/admin/courses' · '/admin/users' · '/admin/orders' · '/admin/vouchers'.
 * Every change is written to Codi.db() so lecturers and learners see it immediately.
 */
(function () {
  'use strict';
  const { html, icon, fmt, ui } = Codi;
  const db = () => Codi.db();
  const me = () => Codi.currentUser();
  const persist = (render) => Codi.set(() => {}, { render: render !== false });
  const DAY = 86400000;
  const isOverdue = (o) => o.status === 'pending' && Date.now() - new Date(o.createdAt).getTime() > DAY;
  const ENTRY_MIN = 5;

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
      ],
    });
  }
  const courseTitles = (o) => o.items.map((i) => (Codi.course(i.courseId) || { title: '(đã xoá)' }).title).join(', ');
  const buyer = (o) => Codi.user(o.userId) || { name: 'Người dùng đã xoá', email: '' };

  // ───────────────────────── S30 dashboard ─────────────────────────
  Codi.route('/admin', () => {
    const since = Date.now() - 30 * DAY;
    const orders = db().orders;
    const paid = orders.filter((o) => o.status === 'paid' && new Date(o.paidAt).getTime() >= since);
    const allUsers = db().users;
    const newUsers = allUsers.filter((u) => u.role === 'learner' && new Date(u.createdAt).getTime() >= since).length;
    const kpis = [
      ['Doanh thu', fmt.vnd(paid.reduce((s, o) => s + o.total, 0)), `${paid.length} đơn đã thanh toán`],
      ['Đơn hàng', fmt.num(orders.filter((o) => new Date(o.createdAt).getTime() >= since).length), 'Mọi trạng thái'],
      ['Học viên mới', fmt.num(newUsers), 'Tài khoản đăng ký mới'],
      ['Khóa học đang bán', fmt.num(db().courses.filter((c) => c.status === 'published').length), 'Trạng thái Đã xuất bản'],
    ];
    const todo = [
      ['/admin/publication', db().courses.filter((c) => c.status === 'pending').length, 'Khoá học chờ duyệt', 'Giảng viên đã gửi yêu cầu xuất bản'],
      ['/admin/orders?status=pending&overdue=1', orders.filter(isOverdue).length, 'Đơn chờ thanh toán quá hạn', 'Đơn chờ thanh toán quá 24 giờ, có thể cần đối soát'],
      ['/admin/vouchers', db().vouchers.filter((v) => v.active && v.usageLimit && v.used / v.usageLimit >= 0.9).length, 'Voucher sắp hết lượt', 'Đã dùng từ 90% số lượt'],
      ['/admin/users?status=inactive', db().users.filter((u) => u.status === 'inactive').length, 'Tài khoản bị vô hiệu hoá', 'Xem lý do hoặc kích hoạt lại'],
    ];
    const recent = orders.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);
    return shell('/admin', html`
      <div class="page-header"><div><h1>Tổng quan</h1><p class="muted">30 ngày gần nhất · đến ${fmt.date(new Date().toISOString())}</p></div></div>
      <div class="grid-4">${kpis.map(([l, v, m]) => html`<div class="stat-tile"><span class="stat-label">${l}</span><span class="stat-value od-nowrap">${v}</span><span class="stat-meta">${m}</span></div>`)}</div>
      <h2 class="section" style="font-size:var(--text-lg);margin-bottom:12px">Cần xử lý</h2>
      <div class="grid-4">${todo.map(([href, n, l, m]) => html`<a class="stat-tile" href="#${href}"><span class="stat-value">${n}</span><span class="stat-label">${l}</span><span class="stat-meta">${m}</span><span class="stat-go">Mở danh sách ${icon('arrow-right', { cls: 'icon-sm' })}</span></a>`)}</div>
      <h2 class="section" style="font-size:var(--text-lg);margin-top:32px;margin-bottom:12px">Phân tích</h2>
      <div class="grid-2">
        <a class="stat-tile" href="#/admin/insights" style="text-align:left"><div><h3 style="margin:0;font-size:var(--text-base)">Quan sát hệ thống</h3><p class="small muted">DAU, đăng ký mới, ghi danh, phân tích chỉ tiêu hoạt động</p></div><div class="stat-value">${fmt.num(newUsers)}<span class="small muted" style="display:block;font-size:var(--text-xs)">học viên mới</span></div></a>
        <a class="stat-tile" href="#/admin/finance" style="text-align:left"><div><h3 style="margin:0;font-size:var(--text-base)">Tài chính</h3><p class="small muted">Doanh thu, đơn hàng, thanh toán, hoàn tiền</p></div><div class="stat-value">${fmt.vnd(paid.reduce((s, o) => s + o.total, 0))}<span class="small muted" style="display:block;font-size:var(--text-xs)">30 ngày</span></div></a>
      </div>
      <div class="section-title section"><h2 style="font-size:var(--text-lg)">Đơn hàng gần đây</h2><a href="#/admin/orders">Xem tất cả</a></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Mã</th><th>Người mua</th><th>Khoá học</th><th class="num">Số tiền</th><th>Trạng thái</th></tr></thead><tbody>
        ${recent.map((o) => html`<tr class="is-clickable" data-action="ad-order" data-id="${o.id}"><td class="mono">${o.code}</td><td>${buyer(o).name}</td><td class="small">${courseTitles(o)}</td><td class="num">${fmt.vnd(o.total)}</td><td>${ui.orderStatus(o.status)}${isOverdue(o) ? html` <span class="badge badge-danger">Quá hạn</span>` : ''}</td></tr>`)}
      </tbody></table></div>
    `);
  }, { title: 'Quản trị', role: 'admin' });

  // S32 publication review lives in js/admin-review.js (criteria, content preview, flags, rounds).

  // ───────────────────────── S33 published courses ─────────────────────────
  Codi.route('/admin/courses', () => {
    const list = db().courses.filter((c) => ['published', 'hidden'].includes(c.status));
    return shell('/admin/courses', html`
      <div class="page-header"><div><h1>Khóa học đã xuất bản</h1><p class="muted">Ẩn khoá học hoặc đổi giá. Mọi thay đổi đều được thông báo cho giảng viên.</p></div></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Khoá học</th><th>Giảng viên</th><th class="num">Giá</th><th class="num">Học viên</th><th>Đánh giá</th><th>Trạng thái</th><th></th></tr></thead><tbody>
        ${list.map((c) => html`<tr><td><a href="#/courses/${c.slug}">${c.title}</a></td><td>${(Codi.user(c.lecturerId) || {}).name}</td><td class="num">${c.price ? fmt.vnd(c.price) : 'Miễn phí'}</td><td class="num">${fmt.num(c.learnersCount)}</td>
          <td class="od-nowrap">${c.ratingCount ? html`${c.rating.toFixed(1)} ${icon('star-filled', { cls: 'icon-sm ad-star' })} (${c.ratingCount})` : '—'}</td>
          <td>${ui.courseStatus(c.status)}${c.status === 'hidden' ? html`<span class="xsmall muted" style="display:block;max-width:220px">${c.hideReason}</span>` : ''}</td>
          <td><div class="row" style="gap:4px;flex-wrap:nowrap">${c.status === 'published' ? html`<button class="btn btn-ghost btn-sm" data-action="ad-hide" data-id="${c.id}">Ẩn khóa học</button>` : html`<button class="btn btn-ghost btn-sm" data-action="ad-unhide" data-id="${c.id}">Hiện lại</button>`}<button class="btn btn-ghost btn-sm" data-action="ad-price" data-id="${c.id}">Đổi giá</button></div></td></tr>`)}
      </tbody></table></div>
    `);
  }, { title: 'Khóa học đã xuất bản', role: 'admin' });
  Codi.action('ad-hide', async (el) => {
    const c = Codi.course(el.dataset.id);
    const learners = db().enrolments.filter((e) => e.courseId === c.id).length;
    const r = await ui.confirm({ title: `Ẩn "${c.title}"?`, consequence: `Học viên mới sẽ không tìm thấy và không mua được khoá học. ${learners} học viên đã mua vẫn tiếp tục học bình thường. Giảng viên nhận thông báo kèm lý do.`, reversible: 'Có thể hiện lại bất cứ lúc nào.', requireReason: true, reasonLabel: 'Lý do ẩn (gửi cho giảng viên)', confirmLabel: 'Ẩn khoá học', danger: true });
    if (!r.ok) return;
    Object.assign(c, { status: 'hidden', hideReason: r.reason });
    Codi.notify(c.lecturerId, { title: 'Khoá học đã bị ẩn', body: `${c.title}: ${r.reason}`, link: `/teach/courses/${c.id}/publish` });
    persist(); ui.toast('Đã ẩn khoá học.');
  });
  Codi.action('ad-unhide', async (el) => {
    const c = Codi.course(el.dataset.id);
    const r = await ui.confirm({ title: `Hiện lại "${c.title}"?`, consequence: 'Khoá học xuất hiện lại trong danh sách và mở bán.', reversible: true, confirmLabel: 'Hiện lại' });
    if (!r.ok) return;
    Object.assign(c, { status: 'published', hideReason: null });
    Codi.notify(c.lecturerId, { title: 'Khoá học đã hiện lại', body: c.title, link: `/teach/courses/${c.id}/publish` });
    persist(); ui.toast('Khoá học đã mở bán trở lại.', { type: 'success' });
  });
  Codi.action('ad-price', (el) => {
    const c = Codi.course(el.dataset.id);
    const body = (val, err) => html`<div class="stack-3"><p class="small">Giá hiện tại: <strong>${c.price ? fmt.vnd(c.price) : 'Miễn phí'}</strong></p>
      <div class="field ${err ? 'is-invalid' : ''}"><label for="np">Giá mới (VND)</label><input id="np" inputmode="numeric" value="${val}"><span class="field-help" data-hint>${parsePrice(val) !== null ? '= ' + fmt.vnd(parsePrice(val)) : 'Nhập số, ví dụ 990000'}</span>${err ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${err}</span></p>` : ''}</div>
      ${ui.alert({ type: 'warn', title: 'Điều gì sẽ xảy ra', body: 'Giá mới áp dụng cho đơn hàng mới; đơn đang chờ thanh toán giữ giá cũ. Giảng viên nhận thông báo.' })}</div>`;
    ui.modal({
      title: `Đổi giá "${c.title}"`, body: body(String(c.price), null),
      footer: html`<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn btn-primary" data-save>Lưu giá mới</button>`,
      onMount(h) {
        h.el.addEventListener('input', (e) => { if (e.target.id === 'np') { const v = parsePrice(e.target.value); h.el.querySelector('[data-hint]').textContent = v !== null ? '= ' + fmt.vnd(v) : 'Nhập số, ví dụ 990000'; } });
        h.el.querySelector('[data-save]').addEventListener('click', () => {
          const val = h.el.querySelector('#np').value; const price = parsePrice(val);
          if (price === null) { h.setBody(body(val, 'Giá phải là số nguyên không âm.')); return; }
          if (price === c.price) { h.setBody(body(val, 'Giá mới đang trùng giá hiện tại.')); return; }
          const old = c.price; c.price = price;
          Codi.notify(c.lecturerId, { title: 'Giá khoá học đã thay đổi', body: `${c.title}: ${fmt.vnd(old)} → ${fmt.vnd(price)}`, link: `/teach/courses/${c.id}/publish` });
          h.close(); persist(); ui.toast('Đã cập nhật giá.', { type: 'success' });
        });
      },
    });
  });

  // ───────────────────────── S31 users ─────────────────────────
  const ROLE = Codi.ROLE_LABEL;
  Codi.route('/admin/users', (p, q) => {
    const role = q.role || 'all'; const status = q.status || 'all'; const term = (q.q || '').toLowerCase();
    const all = db().users;
    const list = all.filter((u) => (role === 'all' || u.role === role) && (status === 'all' || u.status === status) && (!term || (u.name + ' ' + u.email).toLowerCase().includes(term)));
    const link = (patch) => '/admin/users?' + new URLSearchParams(Object.assign({ role, status, q: q.q || '' }, patch)).toString();
    return shell('/admin/users', html`
      <div class="page-header"><div><h1>Người dùng</h1><p class="muted">${all.length} tài khoản</p></div></div>
      <form class="ad-filters" data-submit="ad-user-search">
        <div class="field"><label for="u-q">Tìm theo tên hoặc email</label><div class="input-group"><input id="u-q" name="q" class="input" value="${q.q || ''}"><button class="btn btn-secondary" type="submit">${icon('search', { cls: 'icon-sm' })} Tìm</button></div></div>
        <div class="field"><label for="u-status">Trạng thái</label><select id="u-status" data-change="ad-user-filter" data-key="status"><option value="all">Tất cả</option><option value="active" ${status === 'active' ? Codi.raw('selected') : ''}>Đang hoạt động</option><option value="inactive" ${status === 'inactive' ? Codi.raw('selected') : ''}>Đã vô hiệu hoá</option></select></div>
      </form>
      <div class="od-cluster" style="margin:12px 0" role="group" aria-label="Lọc theo vai trò">${[['all', 'Tất cả'], ['learner', 'Học viên'], ['lecturer', 'Giảng viên'], ['admin', 'Quản trị viên']].map(([k, l]) => html`<a class="chip chip-btn ${role === k ? 'ad-chip-on' : ''}" href="#${link({ role: k })}" aria-pressed="${role === k}">${l} (${k === 'all' ? all.length : all.filter((u) => u.role === k).length})</a>`)}</div>
      ${list.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Người dùng</th><th>Vai trò</th><th>Trạng thái</th><th>Tham gia</th><th></th></tr></thead><tbody>
        ${list.map((u) => { const self = u.id === me().id; return html`<tr>
          <td><div class="row">${ui.avatar(u, 'sm')}<div class="stack-1"><strong class="small">${u.name}${self ? ' (bạn)' : ''}</strong><span class="xsmall muted">${u.email}</span></div></div></td>
          <td><label class="sr-only" for="role-${u.id}">Vai trò của ${u.name}</label><select id="role-${u.id}" class="select ad-role" data-change="ad-role" data-id="${u.id}" ${self ? Codi.raw('disabled title="Không thể đổi vai trò của chính bạn"') : ''}>${Object.keys(ROLE).map((k) => html`<option value="${k}" ${u.role === k ? Codi.raw('selected') : ''}>${ROLE[k]}</option>`)}</select></td>
          <td>${u.status === 'active' ? html`<span class="badge badge-success"><span class="status-dot"></span>Đang hoạt động</span>` : html`<div class="stack-1"><span class="badge badge-neutral"><span class="status-dot"></span>Đã vô hiệu hoá</span>${u.deactivation ? html`<span class="xsmall muted">Lý do (nội bộ): ${u.deactivation.reason} · ${fmt.date(u.deactivation.at)}</span>` : ''}</div>`}</td>
          <td class="od-nowrap small">${fmt.date(u.createdAt)}</td>
          <td>${self ? html`<span class="xsmall muted">Tài khoản của bạn</span>` : u.status === 'active' ? html`<button class="btn btn-danger-outline btn-sm" data-action="ad-deactivate" data-id="${u.id}">Vô hiệu hoá</button>` : html`<button class="btn btn-secondary btn-sm" data-action="ad-reactivate" data-id="${u.id}">Kích hoạt lại</button>`}</td></tr>`; })}
      </tbody></table></div>` : html`<div class="card">${ui.empty({ icon: 'users', title: 'Không có người dùng phù hợp', actions: html`<a class="btn btn-secondary" href="#/admin/users">Xóa bộ lọc</a>` })}</div>`}
    `);
  }, { title: 'Người dùng', role: 'admin' });
  Codi.action('ad-user-search', (form, e, v) => { const q = Codi.query(); Codi.go('/admin/users?' + new URLSearchParams({ role: q.role || 'all', status: q.status || 'all', q: (v.q || '').trim() }).toString()); });
  Codi.action('ad-user-filter', (el) => { const q = Object.assign({ role: 'all', status: 'all', q: '' }, Codi.query(), { [el.dataset.key]: el.value }); Codi.go('/admin/users?' + new URLSearchParams(q).toString()); });
  Codi.action('ad-role', async (el) => {
    const u = Codi.user(el.dataset.id); const to = el.value;
    const what = { learner: 'chỉ học và mua khoá học', lecturer: 'tạo và quản lý khoá học của mình, chấm bài', admin: 'toàn quyền quản trị (người dùng, giá, đơn hàng)' }[to];
    const r = await ui.confirm({ title: `Đổi vai trò của ${u.name}?`, body: `${ROLE[u.role]} → ${ROLE[to]}.`, consequence: `Người dùng sẽ ${what}. Thay đổi có hiệu lực ở lần tải trang tiếp theo của họ.`, reversible: true, confirmLabel: 'Đổi vai trò' });
    if (!r.ok) { el.value = u.role; return; }
    u.role = to; persist(); ui.toast(`Đã đổi vai trò của ${u.name}.`, { type: 'success' });
  });
  Codi.action('ad-deactivate', async (el) => {
    const u = Codi.user(el.dataset.id);
    const d = db();
    const ownedCourses = d.enrolments.filter((e) => e.userId === u.id && d.courses.find((c) => c.id === e.courseId && c.status === 'published')).length;
    const pendingOrders = d.orders.filter((o) => o.userId === u.id && o.status === 'pending').length;
    const taughtCourses = d.courses.filter((c) => c.lecturerId === u.id && c.status === 'published').length;
    const impactBody = html`<div class="stack-2">
      <p>${u.email}</p>
      <div class="ad-impact-list">
        <div class="ad-impact-item"><span class="ad-impact-icon">${Codi.icon('book-open', { cls: 'icon-sm' })}</span><span class="ad-impact-text"><strong>${ownedCourses}</strong> khoá học đang sở hữu</span></div>
        <div class="ad-impact-item"><span class="ad-impact-icon">${Codi.icon('receipt', { cls: 'icon-sm' })}</span><span class="ad-impact-text"><strong>${pendingOrders}</strong> đơn hàng chờ thanh toán</span></div>
        <div class="ad-impact-item"><span class="ad-impact-icon">${Codi.icon('presentation', { cls: 'icon-sm' })}</span><span class="ad-impact-text">Đang giảng dạy <strong>${taughtCourses}</strong> khoá học</span></div>
      </div>
    </div>`;
    const r = await ui.confirm({
      title: `Vô hiệu hoá ${u.name}?`,
      body: impactBody,
      consequence: 'Tài khoản bị đăng xuất khỏi mọi thiết bị và không thể đăng nhập. Dữ liệu học tập và đơn hàng được giữ nguyên.',
      reversible: 'Có thể kích hoạt lại bất cứ lúc nào.',
      requireReason: true,
      reasonLabel: 'Lý do (chỉ quản trị viên xem được)',
      reasonPlaceholder: 'Ví dụ: vi phạm điều khoản dịch vụ, spam...',
      confirmLabel: 'Vô hiệu hoá',
      danger: true,
      requireConsent: 'Tôi hiểu tác động'
    });
    if (!r.ok) return;
    u.status = 'inactive'; u.deactivation = { reason: r.reason, at: new Date().toISOString(), by: me().id };
    persist(); ui.toast(`Đã vô hiệu hoá ${u.name}.`);
  });
  Codi.action('ad-reactivate', async (el) => {
    const u = Codi.user(el.dataset.id);
    const r = await ui.confirm({ title: `Kích hoạt lại ${u.name}?`, consequence: 'Người dùng đăng nhập lại được và truy cập toàn bộ dữ liệu cũ.', reversible: true, confirmLabel: 'Kích hoạt lại' });
    if (!r.ok) return;
    u.status = 'active'; u.deactivation = null; persist(); ui.toast(`Đã kích hoạt lại ${u.name}.`, { type: 'success' });
  });

  // ───────────────────────── S34 orders ─────────────────────────
  function filteredOrders(q) {
    const range = q.range || '30'; const status = q.status || 'all'; const term = (q.q || '').toLowerCase();
    const since = range === 'all' ? 0 : Date.now() - Number(range) * DAY;
    return db().orders.filter((o) => new Date(o.createdAt).getTime() >= since && (status === 'all' || o.status === status) && (!q.overdue || isOverdue(o))
      && (!term || (o.code + ' ' + buyer(o).email + ' ' + buyer(o).name).toLowerCase().includes(term))).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  Codi.route('/admin/orders', (p, q) => {
    const range = q.range || '30'; const status = q.status || 'all';
    const list = filteredOrders(q);
    const link = (patch) => '#/admin/orders?' + new URLSearchParams(Object.assign({ range, status, q: q.q || '' }, q.overdue ? { overdue: '1' } : {}, patch)).toString();
    const paid = list.filter((o) => o.status === 'paid');
    if (q.id) Codi.onMount(() => openOrder(q.id));
    return shell('/admin/orders', html`
      <div class="page-header"><div><h1>Đơn hàng & giao dịch</h1><p class="muted">Thanh toán chuyển khoản VietQR, xác nhận tự động theo nội dung chuyển khoản.</p></div>
        <button class="btn btn-secondary" data-action="ad-export">${icon('download')} Xuất CSV</button></div>
      <div class="grid-4" style="margin-bottom:16px">
        <div class="stat-tile"><span class="stat-value">${list.length}</span><span class="stat-label">Đơn trong bộ lọc</span></div>
        <div class="stat-tile"><span class="stat-value">${paid.length}</span><span class="stat-label">Đã thanh toán</span></div>
        <div class="stat-tile"><span class="stat-value">${list.filter((o) => o.status === 'pending').length}</span><span class="stat-label">Chờ thanh toán</span><span class="stat-meta">${list.filter(isOverdue).length} quá hạn</span></div>
        <div class="stat-tile"><span class="stat-value od-nowrap">${fmt.vnd(paid.reduce((s, o) => s + o.total, 0))}</span><span class="stat-label">Doanh thu</span></div>
      </div>
      <div class="ad-filters">
        <div class="field"><span class="field-label">Thời gian</span><div class="segmented" role="group" aria-label="Khoảng thời gian">${[['7', '7 ngày'], ['30', '30 ngày'], ['90', '90 ngày'], ['all', 'Tất cả']].map(([k, l]) => html`<button aria-pressed="${range === k}" data-go="${link({ range: k }).slice(1)}">${l}</button>`)}</div></div>
        <div class="field"><label for="o-status">Trạng thái</label><select id="o-status" data-change="ad-order-filter"><option value="all">Tất cả</option>${['pending', 'paid', 'failed', 'cancelled', 'refunded'].map((s) => html`<option value="${s}" ${status === s ? Codi.raw('selected') : ''}>${ui.orderStatusLabel(s)}</option>`)}</select></div>
        <div class="field"><label for="o-method">Phương thức</label><select id="o-method" disabled><option>Chuyển khoản ngân hàng</option></select></div>
        <form class="field" data-submit="ad-order-search"><label for="o-q">Mã đơn hoặc email</label><div class="input-group"><input id="o-q" name="q" class="input" value="${q.q || ''}"><button class="btn btn-secondary" type="submit">${icon('search', { cls: 'icon-sm' })}<span class="sr-only">Tìm</span></button></div></form>
      </div>
      ${q.overdue ? html`<div style="margin:12px 0">${ui.alert({ type: 'warn', title: 'Đang lọc: đơn chờ thanh toán quá 24 giờ', actions: html`<a class="btn btn-secondary btn-sm" href="${link({ overdue: '' })}">Bỏ lọc quá hạn</a>` })}</div>` : ''}
      ${list.length ? html`<div class="table-wrap" style="margin-top:16px"><table class="table"><thead><tr><th>Mã giao dịch</th><th>Người mua</th><th>Khoá học</th><th>Ngày tạo</th><th class="num">Số tiền</th><th>Trạng thái</th></tr></thead><tbody>
        ${list.map((o) => html`<tr class="is-clickable" data-action="ad-order" data-id="${o.id}" tabindex="0"><td class="mono">${o.code}</td><td><div class="stack-1"><span class="small">${buyer(o).name}</span><span class="xsmall muted">${buyer(o).email}</span></div></td><td class="small">${courseTitles(o)}</td><td class="od-nowrap small">${fmt.datetime(o.createdAt)}</td><td class="num">${fmt.vnd(o.total)}</td><td><div class="row" style="gap:4px">${ui.orderStatus(o.status)}${isOverdue(o) ? html`<span class="badge badge-danger">Quá hạn</span>` : ''}</div></td></tr>`)}
      </tbody></table></div>` : html`<div class="card" style="margin-top:16px">${ui.empty({ icon: 'receipt', title: 'Không có đơn hàng phù hợp', body: 'Thử mở rộng khoảng thời gian hoặc bỏ bớt bộ lọc.', actions: html`<a class="btn btn-secondary" href="#/admin/orders?range=all">Xóa bộ lọc</a>` })}</div>`}
    `);
  }, { title: 'Đơn hàng & giao dịch', role: 'admin' });
  function openOrder(id) {
    const o = db().orders.find((x) => x.id === id); if (!o) return;
    const b = buyer(o);
    ui.closeAll();
    ui.sheet({
      title: 'Đơn ' + o.code,
      body: html`<div class="stack-4">
        <div class="row">${ui.orderStatus(o.status)}${isOverdue(o) ? html`<span class="badge badge-danger">Quá hạn</span>` : ''}</div>
        <div class="stack-1"><span class="xsmall muted">Người mua</span><strong class="small">${b.name}</strong><span class="small muted">${b.email}</span></div>
        <div class="stack-2"><span class="xsmall muted">Khoá học</span><ul class="list">${o.items.map((i) => html`<li class="list-row" style="padding-inline:0"><span class="list-main small">${(Codi.course(i.courseId) || { title: '(đã xoá)' }).title}</span><span class="small od-nowrap">${fmt.vnd(i.price)}</span></li>`)}</ul>
          ${o.voucherCode ? html`<div class="row-between small"><span>Voucher ${o.voucherCode}</span><span class="text-success">−${fmt.vnd(o.discount)}</span></div>` : ''}
          <div class="row-between strong"><span>Tổng</span><span>${fmt.vnd(o.total)}</span></div>${o.received && o.status === 'pending' ? html`<div class="row-between small text-warn"><span>Đã nhận</span><span>${fmt.vnd(o.received)}</span></div>` : ''}</div>
        <div class="copy-row is-emphasis"><div class="copy-main"><span class="copy-label">Nội dung chuyển khoản</span><span class="copy-value">${o.content}</span></div><button class="btn btn-secondary btn-sm" data-action="ad-copy" data-value="${o.content}">${icon('copy', { cls: 'icon-sm' })}<span data-copy-label>Sao chép</span></button></div>
        <div class="stack-2"><span class="xsmall muted">Phương thức</span><span class="small">${o.method}</span></div>
        <div class="stack-2"><span class="xsmall muted">Lịch sử trạng thái</span><ol class="ad-timeline">${o.timeline.map((t) => html`<li><span class="small">${t.label}</span><span class="xsmall muted">${fmt.datetime(t.at)}</span></li>`)}</ol></div>
      </div>`,
    });
  }
  Codi.action('ad-order', (el) => openOrder(el.dataset.id));
  Codi.action('ad-copy', (el) => ui.copy(el.dataset.value, el));
  Codi.action('ad-order-filter', (el) => { const q = Object.assign({ range: '30' }, Codi.query(), { status: el.value }); delete q.id; Codi.go('/admin/orders?' + new URLSearchParams(q).toString()); });
  Codi.action('ad-order-search', (form, e, v) => { const q = Object.assign({ range: '30', status: 'all' }, Codi.query(), { q: (v.q || '').trim() }); delete q.id; Codi.go('/admin/orders?' + new URLSearchParams(q).toString()); });
  Codi.action('ad-export', () => {
    const exportState = {
      range: '30',
      applyFilter: true,
      columns: { code: true, buyer: true, email: true, courses: true, voucher: true, discount: true, total: true, status: true, createdAt: true, paidAt: true }
    };
    const updateSummary = (h) => {
      const selectedCols = Object.values(exportState.columns).filter(Boolean).length;
      const expQ = Object.assign({}, Codi.query(), exportState.applyFilter ? {} : { range: exportState.range });
      const list = filteredOrders(expQ);
      h.el.querySelector('[data-summary]').innerHTML = `<span class="small muted">${fmt.num(list.length)} đơn · ${fmt.num(selectedCols)} cột · ${fmt.vnd(list.reduce((s, o) => s + o.total, 0))} tổng tiền</span>`;
    };
    const exportForm = html`<form class="stack-4" id="exp">
      <div class="stack-2">
        <h4 style="margin:0">Khoảng thời gian</h4>
        <div class="segmented" style="width:100%" role="group">${[['7', '7 ngày'], ['30', '30 ngày'], ['90', '90 ngày'], ['all', 'Tất cả']].map(([k, l]) => html`<label style="flex:1"><input type="radio" name="range" value="${k}" data-input="exp-range" ${k === exportState.range ? Codi.raw('checked') : ''}> ${l}</label>`)}</div>
        <p class="xsmall muted">Múi giờ: GMT+7 (Hà Nội)</p>
      </div>
      <label class="check"><input type="checkbox" data-input="exp-filter" ${exportState.applyFilter ? Codi.raw('checked') : ''}> Áp dụng bộ lọc hiện tại (trạng thái: ${Codi.query().status || 'all'}, tìm kiếm)</label>
      <div class="stack-2">
        <h4 style="margin:0">Chọn cột xuất (${Object.values(exportState.columns).filter(Boolean).length}/10)</h4>
        <div class="ad-export-cols">
          <label class="check"><input type="checkbox" data-input="exp-col" data-col="code" ${exportState.columns.code ? Codi.raw('checked') : ''}> Mã giao dịch</label>
          <label class="check"><input type="checkbox" data-input="exp-col" data-col="buyer" ${exportState.columns.buyer ? Codi.raw('checked') : ''}> Người mua</label>
          <label class="check"><input type="checkbox" data-input="exp-col" data-col="email" ${exportState.columns.email ? Codi.raw('checked') : ''}> Email</label>
          <label class="check"><input type="checkbox" data-input="exp-col" data-col="courses" ${exportState.columns.courses ? Codi.raw('checked') : ''}> Khoá học</label>
          <label class="check"><input type="checkbox" data-input="exp-col" data-col="voucher" ${exportState.columns.voucher ? Codi.raw('checked') : ''}> Voucher</label>
          <label class="check"><input type="checkbox" data-input="exp-col" data-col="discount" ${exportState.columns.discount ? Codi.raw('checked') : ''}> Giảm giá</label>
          <label class="check"><input type="checkbox" data-input="exp-col" data-col="total" ${exportState.columns.total ? Codi.raw('checked') : ''}> Tổng tiền</label>
          <label class="check"><input type="checkbox" data-input="exp-col" data-col="status" ${exportState.columns.status ? Codi.raw('checked') : ''}> Trạng thái</label>
          <label class="check"><input type="checkbox" data-input="exp-col" data-col="createdAt" ${exportState.columns.createdAt ? Codi.raw('checked') : ''}> Ngày tạo</label>
          <label class="check"><input type="checkbox" data-input="exp-col" data-col="paidAt" ${exportState.columns.paidAt ? Codi.raw('checked') : ''}> Ngày thanh toán</label>
        </div>
      </div>
      <div class="ad-export-summary" data-summary></div>
    </form>`;
    ui.modal({
      size: 'md',
      title: 'Xuất CSV',
      body: exportForm,
      footer: html`<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn btn-primary" data-export-do>Xuất CSV</button>`,
      onMount(h) {
        updateSummary(h);
        h.el.addEventListener('input', (e) => {
          if (e.target.name === 'range') exportState.range = e.target.value;
          if (e.target.dataset.input === 'exp-filter') exportState.applyFilter = e.target.checked;
          if (e.target.dataset.input === 'exp-col') exportState.columns[e.target.dataset.col] = e.target.checked;
          updateSummary(h);
        });
        h.el.querySelector('[data-export-do]').addEventListener('click', () => {
          const expQ = Object.assign({}, Codi.query(), exportState.applyFilter ? {} : { range: exportState.range });
          const list = filteredOrders(expQ);
          const cols = Object.entries(exportState.columns).filter(([_, v]) => v).map(([k]) => k);
          const header = { code: 'Mã giao dịch', buyer: 'Người mua', email: 'Email', courses: 'Khoá học', voucher: 'Voucher', discount: 'Giảm giá', total: 'Tổng tiền', status: 'Trạng thái', createdAt: 'Ngày tạo', paidAt: 'Ngày thanh toán' };
          const esc = (v) => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
          const rows = [[...cols.map((c) => header[c])]]
            .concat(list.map((o) => [
              cols.includes('code') ? o.code : null,
              cols.includes('buyer') ? buyer(o).name : null,
              cols.includes('email') ? buyer(o).email : null,
              cols.includes('courses') ? courseTitles(o) : null,
              cols.includes('voucher') ? (o.voucherCode || '') : null,
              cols.includes('discount') ? o.discount : null,
              cols.includes('total') ? o.total : null,
              cols.includes('status') ? ui.orderStatusLabel(o.status) : null,
              cols.includes('createdAt') ? o.createdAt : null,
              cols.includes('paidAt') ? (o.paidAt || '') : null
            ].filter((_, i) => cols[i])));
          const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `codi-don-hang-${new Date().toISOString().slice(0, 10)}.csv`;
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          h.close(); ui.toast(`Đã xuất ${list.length} đơn hàng (${cols.length} cột) ra CSV.`, { type: 'success' });
        });
      }
    });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest && e.target.closest('tr[data-action="ad-order"]'); if (tr) openOrder(tr.dataset.id); } });

  // ───────────────────────── S35 vouchers ─────────────────────────
  Codi.route('/admin/vouchers', () => {
    const list = db().vouchers;
    const today = new Date();
    return shell('/admin/vouchers', html`
      <div class="page-header"><div><h1>Voucher</h1><p class="muted">Mã giảm giá áp dụng ở giỏ hàng. Tắt mã để ngừng áp dụng cho đơn mới.</p></div><button class="btn btn-primary" data-action="ad-voucher-form">${icon('plus')} Tạo voucher</button></div>
      ${list.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Mã</th><th>Giảm</th><th>Đơn tối thiểu</th><th>Đã dùng</th><th>Hạn dùng</th><th>Hoạt động</th><th></th></tr></thead><tbody>
        ${list.map((v) => { const expired = v.expiresAt && new Date(v.expiresAt + 'T23:59:59') < today; const full = v.usageLimit !== null && v.used >= v.usageLimit; return html`<tr>
          <td class="mono strong">${v.code}</td><td class="od-nowrap">${v.type === 'percent' ? v.value + '%' : fmt.vnd(v.value)}</td><td class="od-nowrap">${v.minOrder ? fmt.vnd(v.minOrder) : 'Không yêu cầu'}</td>
          <td style="min-width:140px">${v.usageLimit === null ? html`<span class="small">${fmt.num(v.used)} / Không giới hạn</span>` : html`<div class="stack-1">${ui.progress((v.used / v.usageLimit) * 100)}<span class="xsmall ${full ? 'text-danger' : ''}">${fmt.num(v.used)}/${fmt.num(v.usageLimit)}${full ? ' · hết lượt' : ''}</span></div>`}</td>
          <td class="od-nowrap small">${v.expiresAt ? html`<span class="${expired ? 'text-danger' : ''}">${fmt.date(v.expiresAt)}${expired ? ' · đã hết hạn' : ''}</span>` : 'Không hết hạn'}</td>
          <td><label class="switch"><input type="checkbox" data-change="ad-voucher-toggle" data-id="${v.id}" ${v.active ? Codi.raw('checked') : ''} aria-label="Bật/tắt ${v.code}"><span class="switch-track"></span><span class="small">${v.active ? 'Đang bật' : 'Đã tắt'}</span></label></td>
          <td><button class="btn btn-ghost btn-sm" data-action="ad-voucher-form" data-id="${v.id}">Sửa</button></td></tr>`; })}
      </tbody></table></div>` : html`<div class="card">${ui.empty({ icon: 'ticket', title: 'Chưa có voucher', actions: html`<button class="btn btn-primary" data-action="ad-voucher-form">Tạo voucher</button>` })}</div>`}
    `);
  }, { title: 'Voucher', role: 'admin' });
  Codi.action('ad-voucher-toggle', async (el) => {
    const v = db().vouchers.find((x) => x.id === el.dataset.id);
    if (!el.checked) {
      const r = await ui.confirm({ title: `Tắt mã ${v.code}?`, consequence: 'Mã ngừng áp dụng ngay cho đơn hàng mới. Đơn đã tạo trước đó giữ nguyên giảm giá.', reversible: 'Bật lại bất cứ lúc nào.', confirmLabel: 'Tắt mã', danger: true });
      if (!r.ok) { el.checked = true; return; }
    }
    v.active = el.checked; persist(); ui.toast(v.active ? `Đã bật mã ${v.code}.` : `Đã tắt mã ${v.code}.`);
  });

  function voucherForm(d, err) {
    const e = err || {};
    const fe = (k) => (e[k] ? html`<p class="field-error">${icon('alert-circle', { cls: 'icon-sm' })}<span>${e[k]}</span></p>` : '');
    const radio = (name, val, label, cur) => html`<label class="check"><input type="radio" name="${name}" value="${val}" ${cur === val ? Codi.raw('checked') : ''}> ${label}</label>`;
    return html`<form class="stack-4" id="vf" novalidate>
      <div class="field ${e.code ? 'is-invalid' : ''}"><label for="vf-code">Mã voucher <span class="req">*</span></label><input id="vf-code" name="code" value="${d.code}" style="text-transform:uppercase" ${d.id ? Codi.raw('readonly') : ''}><span class="field-help">4–20 ký tự, chữ in hoa và số. ${d.id ? 'Không đổi được mã sau khi tạo.' : ''}</span>${fe('code')}</div>
      <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="field-label">Loại giảm giá</legend><div class="row">${radio('type', 'percent', 'Phần trăm', d.type)}${radio('type', 'amount', 'Số tiền (VND)', d.type)}</div></fieldset>
      <div class="field ${e.value ? 'is-invalid' : ''}"><label for="vf-value">${d.type === 'percent' ? 'Mức giảm (%)' : 'Số tiền giảm (VND)'} <span class="req">*</span></label><input id="vf-value" name="value" inputmode="numeric" value="${d.value}">${fe('value')}</div>
      <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="field-label">Đơn tối thiểu</legend><div class="row">${radio('minMode', 'none', 'Không yêu cầu', d.minMode)}${radio('minMode', 'set', 'Từ số tiền', d.minMode)}</div>
        ${d.minMode === 'set' ? html`<div class="field ${e.minOrder ? 'is-invalid' : ''}"><label for="vf-min">Giá trị đơn tối thiểu (VND)</label><input id="vf-min" name="minOrder" inputmode="numeric" value="${d.minOrder}">${fe('minOrder')}</div>` : ''}</fieldset>
      <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="field-label">Giới hạn lượt dùng</legend><div class="row">${radio('limitMode', 'none', 'Không giới hạn', d.limitMode)}${radio('limitMode', 'set', 'Giới hạn N lượt', d.limitMode)}</div>
        ${d.limitMode === 'set' ? html`<div class="field ${e.usageLimit ? 'is-invalid' : ''}"><label for="vf-limit">Số lượt tối đa</label><input id="vf-limit" name="usageLimit" inputmode="numeric" value="${d.usageLimit}">${fe('usageLimit')}</div>` : ''}</fieldset>
      <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="field-label">Hạn dùng</legend><div class="row">${radio('expMode', 'none', 'Không hết hạn', d.expMode)}${radio('expMode', 'set', 'Đến ngày cụ thể', d.expMode)}</div>
        ${d.expMode === 'set' ? html`<div class="field ${e.expiresAt ? 'is-invalid' : ''}"><label for="vf-exp">Ngày hết hạn</label><input id="vf-exp" name="expiresAt" type="date" value="${d.expiresAt}">${fe('expiresAt')}</div>` : ''}</fieldset>
      <div class="field"><span class="field-label">Áp dụng cho</span><span class="small">Tất cả khoá học</span><span class="field-help">Giới hạn theo khoá học hoặc giảng viên chưa có trong bản thử nghiệm (câu hỏi mở Q16).</span></div>
    </form>`;
  }
  Codi.action('ad-voucher-form', (el) => {
    const v = el.dataset.id ? db().vouchers.find((x) => x.id === el.dataset.id) : null;
    const d = v ? { id: v.id, code: v.code, type: v.type, value: String(v.value), minMode: v.minOrder ? 'set' : 'none', minOrder: String(v.minOrder || ''), limitMode: v.usageLimit === null ? 'none' : 'set', usageLimit: v.usageLimit === null ? '' : String(v.usageLimit), expMode: v.expiresAt ? 'set' : 'none', expiresAt: v.expiresAt || '' }
      : { id: null, code: '', type: 'percent', value: '', minMode: 'none', minOrder: '', limitMode: 'none', usageLimit: '', expMode: 'none', expiresAt: '' };
    ui.sheet({
      title: v ? `Sửa voucher ${v.code}` : 'Tạo voucher', body: voucherForm(d),
      footer: html`<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn btn-primary" data-vf-save>${v ? 'Lưu thay đổi' : 'Tạo voucher'}</button>`,
      onMount(h) {
        const read = () => { const f = h.el.querySelector('#vf'); new FormData(f).forEach((val, k) => { d[k] = val; }); d.code = String(d.code || '').toUpperCase(); };
        h.el.addEventListener('change', (e) => { if (e.target.type === 'radio') { read(); h.setBody(voucherForm(d)); } });
        h.el.querySelector('[data-vf-save]').addEventListener('click', () => {
          read();
          const err = {}; const num = (s) => (/^\d+$/.test(String(s).replace(/[.\s]/g, '')) ? Number(String(s).replace(/[.\s]/g, '')) : null);
          if (!/^[A-Z0-9]{4,20}$/.test(d.code)) err.code = 'Mã gồm 4–20 ký tự chữ in hoa hoặc số.';
          else if (!d.id && db().vouchers.some((x) => x.code === d.code)) err.code = 'Mã này đã tồn tại.';
          const val = num(d.value);
          if (val === null || val <= 0) err.value = 'Nhập số lớn hơn 0.';
          else if (d.type === 'percent' && val > 100) err.value = 'Phần trăm tối đa là 100.';
          const min = d.minMode === 'set' ? num(d.minOrder) : 0;
          if (d.minMode === 'set' && (min === null || min <= 0)) err.minOrder = 'Nhập giá trị đơn tối thiểu hợp lệ.';
          const lim = d.limitMode === 'set' ? num(d.usageLimit) : null;
          if (d.limitMode === 'set' && (lim === null || lim < 1)) err.usageLimit = 'Số lượt phải từ 1 trở lên.';
          if (d.expMode === 'set' && (!d.expiresAt || new Date(d.expiresAt + 'T23:59:59') < new Date())) err.expiresAt = 'Chọn một ngày từ hôm nay trở đi.';
          if (Object.keys(err).length) { h.setBody(voucherForm(d, err)); return; }
          const data = { code: d.code, type: d.type, value: val, minOrder: min || 0, usageLimit: lim, expiresAt: d.expMode === 'set' ? d.expiresAt : null, scope: 'all' };
          if (v) Object.assign(v, data); else db().vouchers.unshift(Object.assign({ id: Codi.uid('v'), used: 0, active: true }, data));
          h.close(); persist(); ui.toast(v ? 'Đã lưu voucher.' : `Đã tạo voucher ${d.code}.`, { type: 'success' });
        });
      },
    });
  });

  // ───────────────────────── scoped styles ─────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .ad-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3); align-items: end; }
    .ad-chip-on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-active); }
    .ad-role { min-height: 36px; padding: 4px 8px; font-size: var(--text-sm); }
    .ad-price { max-width: 320px; }
    .ad-star { color: var(--star); }
    .ad-timeline { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-3); border-left: 2px solid var(--border); padding-left: var(--space-4); }
    .ad-timeline li { display: grid; gap: 2px; position: relative; }
    .ad-timeline li::before { content: ""; position: absolute; left: calc(-1 * var(--space-4) - 6px); top: 6px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); }
  `;
  document.head.appendChild(style);
})();
