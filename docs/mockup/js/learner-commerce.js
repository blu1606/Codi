/**
 * learner-commerce.js — discovery & purchase (PRODUCT.md Flows L1, L2, L3; screens S01–S07).
 * Routes: '/' home · '/courses' catalog · '/courses/:slug' detail · '/cart' · '/checkout' · '/checkout/success'.
 * Data: Codi.db().courses / orders / vouchers / reviews. Own slice: Codi.state.commerce { voucher: {userId: code} }.
 */
(function () {
  'use strict';
  const { html, icon, fmt, ui } = Codi;

  // Persisted slice — always read through cm() so a data reset never leaves a stale reference.
  const cm = () => Codi.ensure('commerce', () => ({ voucher: {} }));
  const uid = () => Codi.state.currentUserId;
  const TODAY = new Date();

  // Transient UI state (not persisted)
  let catalogLoaded = false;
  let voucherUI = { draft: '', error: null };
  let lastRemoved = null;   // { courseId } for "Hoàn tác"
  let ownedNotice = [];     // titles auto-removed from the cart because already owned

  // ───────────────────────── helpers ─────────────────────────
  const lecturerName = (c) => (Codi.user(c.lecturerId) || { name: 'Codi' }).name;
  const published = () => Codi.db().courses.filter((c) => c.status === 'published');
  const priceLabel = (c) => (c.price ? fmt.vnd(c.price) : 'Miễn phí');
  const myPendingOrders = () => Codi.db().orders.filter((o) => o.userId === uid() && o.status === 'pending').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // TYPE_ICON and TYPE_LABEL: lesson content types with visual labels (S02 requirement)
  const TYPE_ICON = { video: 'video', pdf: 'presentation', reading: 'book-open', tutorial: 'terminal', code: 'code', quiz: 'clipboard-check', assignment: 'upload' };
  const TYPE_LABEL = { video: 'Video', pdf: 'Slide/PDF', reading: 'Bài đọc', tutorial: 'Hướng dẫn code', code: 'Bài code', quiz: 'Quiz', assignment: 'Bài tập' };

  // Voucher validation shared by cart render and "Áp dụng".
  function checkVoucher(code, subtotal) {
    const v = Codi.db().vouchers.find((x) => x.code.toUpperCase() === String(code || '').trim().toUpperCase());
    if (!v) return { error: 'Mã giảm giá không tồn tại. Kiểm tra lại chính tả.' };
    if (!v.active) return { error: 'Mã này đã ngừng áp dụng.' };
    if (v.expiresAt && new Date(v.expiresAt + 'T23:59:59') < TODAY) return { error: `Mã đã hết hạn từ ${fmt.date(v.expiresAt)}.` };
    if (v.usageLimit !== null && v.used >= v.usageLimit) return { error: 'Mã đã hết lượt sử dụng.' };
    if (v.minOrder && subtotal < v.minOrder) return { error: `Đơn hàng cần tối thiểu ${fmt.vnd(v.minOrder)} để dùng mã này.` };
    const discount = v.type === 'percent' ? Math.round((subtotal * v.value) / 100) : Math.min(v.value, subtotal);
    return { voucher: v, discount };
  }

  function cartSummary() {
    const courses = Codi.cart().map((id) => Codi.course(id)).filter(Boolean);
    const subtotal = courses.reduce((s, c) => s + c.price, 0);
    const code = cm().voucher[uid()];
    let discount = 0; let voucher = null; let voucherInvalid = null;
    if (code) {
      const r = checkVoucher(code, subtotal);
      if (r.error) voucherInvalid = r.error; else { discount = r.discount; voucher = r.voucher; }
    }
    return { courses, subtotal, discount, total: Math.max(0, subtotal - discount), voucher, voucherInvalid, code };
  }

  function addToCart(courseId) {
    const c = Codi.course(courseId);
    if (Codi.role() !== 'learner') { ui.toast('Chỉ tài khoản học viên mới mua được khoá học.', { type: 'warn' }); return; }
    const own = Codi.ownership(courseId);
    if (own === 'owned') { ui.toast('Bạn đã sở hữu khóa học này.', { type: 'info' }); Codi.rerender(); return; }
    if (own === 'pending-payment') { ui.toast('Khoá học này đang nằm trong một đơn chờ thanh toán.', { type: 'info' }); Codi.rerender(); return; }
    if (!Codi.cart().includes(courseId)) Codi.setCart(Codi.cart().concat(courseId));
    Codi.set(() => {});
    ui.toast(`Đã thêm “${c.title}” vào giỏ hàng.`, { type: 'success', actions: html`<a href="#/cart">Xem giỏ hàng</a>` });
  }

  function makeOrderCode() {
    const used = new Set(Codi.db().orders.map((o) => o.code));
    let code;
    do { code = 'CODI' + String(10000 + Math.floor(Math.random() * 89999)); } while (used.has(code));
    return code;
  }

  function buildOrder(items, voucherCode, discount, total) {
    const code = makeOrderCode();
    const now = new Date().toISOString();
    return {
      id: 'order-' + Date.now().toString(36), code, userId: uid(), items,
      voucherCode, discount, total, method: 'Chuyển khoản ngân hàng', status: 'pending',
      createdAt: now, paidAt: null, content: code, timeline: [{ at: now, label: 'Đã tạo đơn' }],
    };
  }

  // Creates a pending order from the cart (owned items already filtered out by the cart page).
  function createOrderFromCart() {
    const s = cartSummary();
    const items = s.courses.filter((c) => !Codi.isEnrolled(c.id)).map((c) => ({ courseId: c.id, price: c.price }));
    if (!items.length) return null;
    const order = buildOrder(items, s.voucher ? s.voucher.code : null, s.voucher ? s.discount : 0, s.voucher ? s.total : s.subtotal);
    Codi.set((st) => {
      st.db.orders.push(order);
      st.carts[uid()] = [];
      cm().voucher[uid()] = null;
    }, { render: false });
    return order;
  }

  // "Mua ngay": single-course order straight to checkout. Cart and cart voucher stay untouched.
  function createBuyNowOrder(courseId) {
    const c = Codi.course(courseId);
    const order = buildOrder([{ courseId: c.id, price: c.price }], null, 0, c.price);
    Codi.set((st) => { st.db.orders.push(order); }, { render: false });
    return order;
  }

  function cancelOrder(order, label) {
    order.status = 'cancelled';
    order.timeline.push({ at: new Date().toISOString(), label: label || 'Người mua đã huỷ' });
  }

  // ───────────────────────── shared components ─────────────────────────
  function ctaFor(c, opts) {
    const block = opts && opts.block ? 'btn-block' : '';
    const role = Codi.role();
    if (role === 'lecturer' || role === 'admin') return html`<a class="btn btn-secondary ${block}" href="#/courses/${c.slug}">Xem chi tiết</a>`;
    const own = Codi.ownership(c.id);
    if (own === 'owned') return html`<a class="btn btn-primary ${block}" href="#/learn/${c.id}">Tiếp tục học</a>`;
    if (own === 'pending-payment') { const o = Codi.pendingOrderFor(c.id); return html`<a class="btn btn-secondary ${block}" href="#/checkout?order=${o.id}">${icon('clock')} Chờ thanh toán</a>`; }
    if (own === 'in-cart') return html`<a class="btn btn-secondary ${block}" href="#/cart">${icon('check')} Đã trong giỏ hàng · Xem giỏ</a>`;
    if (c.price === 0) return html`<button class="btn btn-primary ${block}" data-action="cm-enroll-free" data-id="${c.id}">Đăng ký miễn phí</button>`;
    return html`<button class="btn btn-primary ${block}" data-action="cm-add" data-id="${c.id}">${icon('cart')} Thêm vào giỏ</button>`;
  }

  function courseCard(c) {
    const own = Codi.isEnrolled(c.id);
    return html`<article class="card cm-card">
      <a class="cm-card-media" href="#/courses/${c.slug}" aria-label="${c.title}">${ui.thumb(c)}</a>
      <div class="card-body compact stack-2">
        <div class="row" style="gap:6px">
          <span class="badge badge-neutral">${Codi.levelLabel(c.level)}</span>
          ${own ? html`<span class="badge badge-success">${icon('check')}Đã sở hữu</span>` : ''}
          ${!own && Codi.cart().includes(c.id) ? html`<span class="badge badge-accent">Trong giỏ</span>` : ''}
        </div>
        <h3 class="cm-card-title"><a href="#/courses/${c.slug}">${c.title}</a></h3>
        <p class="small muted od-truncate">${lecturerName(c)}</p>
        <p class="small muted row" style="gap:12px">
          <span class="od-nowrap">${icon('clock', { cls: 'icon-sm' })} ${fmt.duration(c.durationMin)}</span>
          ${c.ratingCount ? html`<span class="od-nowrap">${icon('star-filled', { cls: 'icon-sm cm-star' })} ${c.rating.toFixed(1)} (${fmt.num(c.ratingCount)})</span>` : html`<span>Chưa có đánh giá</span>`}
        </p>
        <div class="row-between cm-card-foot">
          <span class="price">${priceLabel(c)}</span>
          ${ctaFor(c)}
        </div>
      </div>
    </article>`;
  }

  // Deterministic QR-like pattern drawn from the transfer content (a designed placeholder, not a scannable code).
  function qrSvg(seedText) {
    const n = 25; let h = 0;
    for (const ch of seedText) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    const finder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    let rects = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!finder(x, y) && rnd() > 0.52) rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    const fp = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
    return Codi.raw(`<svg viewBox="-2 -2 ${n + 4} ${n + 4}" class="cm-qr" role="img" aria-label="Mã VietQR (minh hoạ) cho nội dung ${seedText}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><g fill="#111827">${rects}${fp(0, 0)}${fp(n - 7, 0)}${fp(0, n - 7)}</g></svg>`);
  }

  // ───────────────────────── S00 Home ─────────────────────────
  Codi.route('/', () => {
    const featured = published().slice(0, 3);
    const steps = [
      ['Chọn và mua khoá học', 'Xem đề cương, giảng viên, đánh giá rồi thanh toán bằng chuyển khoản VietQR.'],
      ['Đặt mục tiêu và làm bài đầu vào', 'Vài câu hỏi ngắn, không tính điểm, giúp Codi biết bạn đang ở đâu.'],
      ['Học theo lộ trình cá nhân', 'AI xếp thứ tự bài học, luôn tôn trọng bài học tiên quyết, và giải thích vì sao.'],
    ];
    return html`<div class="page">
      <section class="cm-hero">
        <span class="eyebrow">Khoá học lập trình · Lộ trình cá nhân hoá</span>
        <h1>Học đúng thứ bạn cần, theo thứ tự hợp lý với bạn</h1>
        <p class="muted cm-lede">Codi bán khoá học lập trình và xếp lộ trình riêng cho từng học viên dựa trên mục tiêu và bài kiểm tra đầu vào. Lộ trình tự cập nhật sau mỗi bài bạn hoàn thành.</p>
        <div class="row">
          <a class="btn btn-primary btn-lg" href="#/courses">Khám phá khoá học</a>
          <a class="btn btn-secondary btn-lg" href="#/ai">${icon('sparkles')} Hỏi AI Codi</a>
        </div>
      </section>
      <section class="section">
        <h2 class="section-title">Cách Codi hoạt động</h2>
        <ol class="grid-3 cm-steps">${steps.map(([t, d], i) => html`<li class="card card-body compact stack-2"><span class="cm-step-num">${i + 1}</span><h3>${t}</h3><p class="small muted">${d}</p></li>`)}</ol>
      </section>
      <section class="section">
        <div class="section-title"><h2>Khoá học nổi bật</h2><a href="#/courses">Xem tất cả</a></div>
        <div class="grid-3">${featured.map(courseCard)}</div>
      </section>
    </div>`;
  }, { title: 'Trang chủ' });

  // ───────────────────────── S01 Catalog with sort dropdown & filters ─────────────────────────
  // Typeahead state for catalog (S01 grouped keyboard-accessible typeahead)
  let typeaheadOpen = false;
  let typeaheadActive = -1; // -1 = none, >= 0 = index in flattened list
  let typeaheadList = [];  // { courseId, courseTitle, categoryName }

  Codi.route('/courses', (params, q) => {
    const db = Codi.db();
    const f = { q: q.q || '', cat: q.cat || 'all', level: q.level || 'all', price: q.price || 'all', sort: q.sort || 'popular' };
    if (!catalogLoaded) {
      setTimeout(() => { catalogLoaded = true; if (Codi.path() === '/courses') Codi.rerender(); }, 600);
      return html`<div class="page"><div class="page-header"><div><h1>Khoá học</h1></div></div>
        <div class="grid-3">${[1, 2, 3].map(() => html`<div class="card card-body stack-3" aria-busy="true"><div class="skeleton" style="aspect-ratio:16/9"></div><div class="skeleton skeleton-line" style="width:80%"></div><div class="skeleton skeleton-line" style="width:50%"></div></div>`)}</div>
        <p class="sr-only" role="status">Đang tải danh sách khoá học…</p></div>`;
    }
    let list = published();
    if (f.q) { const t = f.q.toLowerCase(); list = list.filter((c) => (c.title + ' ' + c.summary + ' ' + Codi.category(c.categoryId).name).toLowerCase().includes(t)); }
    if (f.cat !== 'all') list = list.filter((c) => c.categoryId === f.cat);
    if (f.level !== 'all') list = list.filter((c) => c.level === f.level);
    if (f.price === 'free') list = list.filter((c) => c.price === 0);
    if (f.price === 'paid') list = list.filter((c) => c.price > 0);
    // Sort options: popular (default), newest, price low-to-high, price high-to-low, rating highest
    if (f.sort === 'newest') list = list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    else if (f.sort === 'price-asc') list = list.sort((a, b) => a.price - b.price);
    else if (f.sort === 'price-desc') list = list.sort((a, b) => b.price - a.price);
    else if (f.sort === 'rating') list = list.sort((a, b) => b.rating - a.rating);
    else list = list.sort((a, b) => b.learnersCount - a.learnersCount); // popular by learner count
    const chips = [];
    if (f.q) chips.push(['q', `Từ khoá: "${f.q}"`]);
    if (f.cat !== 'all') chips.push(['cat', Codi.category(f.cat).name]);
    if (f.level !== 'all') chips.push(['level', Codi.levelLabel(f.level)]);
    if (f.price !== 'all') chips.push(['price', f.price === 'free' ? 'Miễn phí' : 'Trả phí']);
    const sel = (name, label, cur, opts) => html`<div class="field cm-filter"><label for="f-${name}">${label}</label>
      <select id="f-${name}" name="${name}" data-change="cm-filter">${opts.map(([v, l]) => html`<option value="${v}" ${cur === v ? Codi.raw('selected') : ''}>${l}</option>`)}</select></div>`;
    const error = q.error === '1';
    const typeaheadMatches = f.q ? published().filter((c) => (c.title + ' ' + c.summary).toLowerCase().includes(f.q.toLowerCase())).sort((a, b) => a.title.localeCompare(b.title)) : [];
    const typeaheadByCategory = {};
    typeaheadMatches.forEach((c) => {
      const cat = Codi.category(c.categoryId).name;
      if (!typeaheadByCategory[cat]) typeaheadByCategory[cat] = [];
      typeaheadByCategory[cat].push(c);
    });
    // Flatten for keyboard navigation
    typeaheadList = [];
    Object.entries(typeaheadByCategory).forEach(([cat, courses]) => {
      courses.forEach((c) => typeaheadList.push({ courseId: c.id, courseTitle: c.title, categoryName: cat }));
    });
    Codi.onMount(() => {
      const input = document.getElementById('f-q');
      if (!input) return;
      input.addEventListener('input', () => { typeaheadOpen = !!input.value; typeaheadActive = -1; });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { typeaheadOpen = false; }
        else if (e.key === 'ArrowDown' && typeaheadOpen) { e.preventDefault(); typeaheadActive = Math.min(typeaheadActive + 1, typeaheadList.length - 1); updateTypeahead(); }
        else if (e.key === 'ArrowUp' && typeaheadOpen) { e.preventDefault(); typeaheadActive = Math.max(typeaheadActive - 1, -1); updateTypeahead(); }
        else if (e.key === 'Enter' && typeaheadActive >= 0) { e.preventDefault(); const item = typeaheadList[typeaheadActive]; Codi.go('/courses/' + Codi.course(item.courseId).slug); }
      });
    });
    const updateTypeahead = () => {
      const items = document.querySelectorAll('[data-typeahead-item]');
      items.forEach((el, i) => { el.setAttribute('aria-selected', String(i === typeaheadActive)); if (i === typeaheadActive) el.scrollIntoView({ block: 'nearest' }); });
      const input = document.getElementById('f-q');
      if (input) input.setAttribute('aria-activedescendant', typeaheadActive >= 0 ? `typeahead-${typeaheadActive}` : '');
    };

    return html`<div class="page">
      <div class="page-header"><div><h1>Khoá học</h1><p class="muted">Tìm khoá học phù hợp với mục tiêu của bạn.</p></div></div>
      <form class="cm-filters" data-submit="cm-search" role="search">
        <div class="field cm-search"><label for="f-q">Tìm kiếm</label>
          <div class="input-group" style="position:relative">
            <input id="f-q" name="q" class="input" value="${f.q}" placeholder="Tìm khóa học theo tên, công nghệ (React, Node, AI...)" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="${typeaheadOpen && f.q && typeaheadList.length > 0}">
            <button class="btn btn-primary" type="submit">${icon('search')} Tìm</button>
            ${typeaheadOpen && f.q && typeaheadList.length > 0 ? html`<div class="cm-typeahead" role="listbox">${Object.entries(typeaheadByCategory).map(([cat, courses]) => html`
              <div class="cm-typeahead-group" role="group" aria-label="${cat}">
                <div class="cm-typeahead-header">${cat}</div>
                ${courses.map((c) => {
                  const idx = typeaheadList.findIndex((x) => x.courseId === c.id);
                  return html`<button type="button" class="cm-typeahead-item ${idx === typeaheadActive ? 'active' : ''}" id="typeahead-${idx}" data-typeahead-item="${idx}" aria-selected="${idx === typeaheadActive}" role="option" data-action="cm-typeahead-select" data-id="${c.id}">${c.title}</button>`;
                })}
              </div>
            `)}</div>` : ''}
          </div></div>
        ${sel('cat', 'Danh mục', f.cat, [['all', 'Tất cả']].concat(db.categories.map((c) => [c.id, c.name])))}
        ${sel('level', 'Trình độ', f.level, [['all', 'Tất cả'], ['Beginner', 'Cơ bản'], ['Intermediate', 'Trung cấp'], ['Advanced', 'Nâng cao']])}
        ${sel('price', 'Giá', f.price, [['all', 'Tất cả'], ['free', 'Miễn phí'], ['paid', 'Trả phí']])}
        ${sel('sort', 'Sắp xếp', f.sort, [['popular', 'Phổ biến nhất'], ['newest', 'Mới nhất'], ['price-asc', 'Giá: thấp → cao'], ['price-desc', 'Giá: cao → thấp'], ['rating', 'Đánh giá cao nhất']])}
      </form>
      ${chips.length ? html`<div class="od-cluster" style="margin:16px 0">${chips.map(([k, l]) => html`<span class="chip">${l}<button type="button" data-action="cm-chip-remove" data-key="${k}" aria-label="Bỏ bộ lọc ${l}">${icon('x', { cls: 'icon-sm' })}</button></span>`)}
        <button class="btn btn-link small" data-action="cm-clear">Xóa bộ lọc</button></div>` : ''}
      ${error ? ui.alert({ type: 'danger', title: 'Không tải được danh sách khoá học', body: 'Kết nối bị gián đoạn. Bộ lọc của bạn vẫn được giữ.', actions: html`<button class="btn btn-secondary btn-sm" data-go="/courses${chips.length ? '?' + new URLSearchParams(Object.fromEntries(chips.map(([k]) => [k, f[k]]))).toString() : ''}">${icon('refresh', { cls: 'icon-sm' })} Thử lại</button>` })
      : list.length ? html`<p class="small muted" style="margin:16px 0" role="status">${list.length} khoá học</p><div class="grid-3">${list.map(courseCard)}</div>`
      : html`<div class="card" style="margin-top:16px">${ui.empty({ icon: 'search', title: 'Không tìm thấy khóa học phù hợp', body: 'Thử bỏ bớt bộ lọc, hoặc mô tả mục tiêu để AI Codi gợi ý khoá học.', actions: html`<button class="btn btn-secondary" data-action="cm-clear">Đặt lại bộ lọc</button><a class="btn btn-secondary" href="#/ai?prompt=${encodeURIComponent('Gợi ý khóa học ' + (f.q || ''))}">${icon('sparkles')} Hỏi AI Codi</a>` })}</div>`}
    </div>`;
  }, { title: 'Khoá học' });

  // ───────────────────────── S02 Course detail ─────────────────────────
  function purchaseCard(c) {
    const role = Codi.role();
    const own = Codi.ownership(c.id);
    const lessons = Codi.lessons(c);
    let cta;
    if (role === 'lecturer' || role === 'admin') {
      cta = html`<p class="small muted">Bạn đang xem với vai trò ${Codi.ROLE_LABEL[role]}. Chỉ tài khoản học viên mới mua được khoá học.</p>`;
    } else if (own === 'owned') {
      const p = Codi.courseProgress(c.id);
      cta = html`<div class="stack-2"><div class="row-between small"><span>Tiến độ của bạn</span><strong>${p.done}/${p.total} bài</strong></div>${ui.progress(p.pct)}</div>
        <a class="btn btn-primary btn-block btn-lg" href="#/learn/${c.id}">Tiếp tục học</a>`;
    } else if (own === 'pending-payment') {
      const o = Codi.pendingOrderFor(c.id);
      cta = html`${ui.alert({ type: 'warn', title: 'Đang chờ thanh toán', body: `Đơn ${o.code} chưa nhận được tiền.` })}<a class="btn btn-primary btn-block btn-lg" href="#/checkout?order=${o.id}">Tiếp tục thanh toán</a>`;
    } else if (own === 'in-cart') {
      cta = html`<button class="btn btn-secondary btn-block btn-lg" disabled>${icon('check')} Đã trong giỏ hàng</button><a class="btn btn-primary btn-block" href="#/cart">Đến giỏ hàng / Thanh toán</a>`;
    } else if (c.price === 0) {
      cta = html`<button class="btn btn-primary btn-block btn-lg" data-action="cm-enroll-free" data-id="${c.id}">Đăng ký miễn phí</button><p class="xsmall muted">Khoá miễn phí: vào học ngay, không cần thanh toán.</p>`;
    } else {
      cta = html`<button class="btn btn-primary btn-block btn-lg" data-action="cm-add" data-id="${c.id}">${icon('cart')} Thêm vào giỏ</button>
        <button class="btn btn-secondary btn-block" data-action="cm-buy-now" data-id="${c.id}">Mua ngay</button>`;
    }
    return html`<div class="card"><div class="card-body stack-4">
      <h2 class="h-card">Đăng ký khóa học</h2>
      <div class="stack-1"><span class="small muted">${c.price ? 'Học phí khóa học' : 'Học phí'}</span><span class="price cm-price-lg">${priceLabel(c)}</span></div>
      ${cta}
      <dl class="cm-facts">
        <div><dt>Trình độ</dt><dd>${Codi.levelLabel(c.level)}</dd></div>
        <div><dt>Số chương</dt><dd>${c.chapters.length}</dd></div>
        <div><dt>Số bài học</dt><dd>${lessons.length}</dd></div>
        <div><dt>Thời lượng</dt><dd>${fmt.duration(c.durationMin)}</dd></div>
      </dl>
      <a class="small" href="#/ai?prompt=${encodeURIComponent('Khoá "' + c.title + '" có phù hợp với tôi không?')}">${icon('sparkles', { cls: 'icon-sm' })} Hỏi trợ lý AI Codi</a>
    </div></div>`;
  }

  // S02 Course detail with purchaseCard showing "Mua ngay" PRIMARY + "Thêm vào giỏ" secondary (decision 42)
  function purchaseCardDetail(c) {
    const role = Codi.role();
    const own = Codi.ownership(c.id);
    const lessons = Codi.lessons(c);
    let cta;
    if (role === 'lecturer' || role === 'admin') {
      cta = html`<p class="small muted">Bạn đang xem với vai trò ${Codi.ROLE_LABEL[role]}. Chỉ tài khoản học viên mới mua được khoá học.</p>`;
    } else if (own === 'owned') {
      const p = Codi.courseProgress(c.id);
      cta = html`<div class="stack-2"><div class="row-between small"><span>Tiến độ của bạn</span><strong>${p.done}/${p.total} bài</strong></div>${ui.progress(p.pct)}</div>
        <a class="btn btn-primary btn-block btn-lg" href="#/learn/${c.id}">Tiếp tục học</a>`;
    } else if (own === 'pending-payment') {
      const o = Codi.pendingOrderFor(c.id);
      cta = html`${ui.alert({ type: 'warn', title: 'Đang chờ thanh toán', body: `Đơn ${o.code} chưa nhận được tiền.` })}<a class="btn btn-primary btn-block btn-lg" href="#/checkout?order=${o.id}">Tiếp tục thanh toán</a>`;
    } else if (own === 'in-cart') {
      cta = html`<button class="btn btn-secondary btn-block btn-lg" disabled>${icon('check')} Đã trong giỏ hàng</button><a class="btn btn-primary btn-block" href="#/cart">Xem giỏ hàng / Thanh toán</a>`;
    } else if (c.price === 0) {
      cta = html`<button class="btn btn-primary btn-block btn-lg" data-action="cm-enroll-free" data-id="${c.id}">Đăng ký miễn phí</button><p class="xsmall muted">Khoá miễn phí: vào học ngay, không cần thanh toán.</p>`;
    } else {
      // Decision 42: "Mua ngay" PRIMARY (single course → checkout), "Thêm vào giỏ" secondary
      cta = html`<button class="btn btn-primary btn-block btn-lg" data-action="cm-buy-now" data-id="${c.id}">Mua ngay</button>
        <button class="btn btn-secondary btn-block" data-action="cm-add" data-id="${c.id}">${icon('cart')} Thêm vào giỏ</button>`;
    }
    return html`<div class="card"><div class="card-body stack-4">
      <h2 class="h-card">Đăng ký khóa học</h2>
      <div class="stack-1"><span class="small muted">${c.price ? 'Học phí khóa học' : 'Học phí'}</span><span class="price cm-price-lg">${priceLabel(c)}</span></div>
      ${cta}
      <dl class="cm-facts">
        <div><dt>Trình độ</dt><dd>${Codi.levelLabel(c.level)}</dd></div>
        <div><dt>Số chương</dt><dd>${c.chapters.length}</dd></div>
        <div><dt>Số bài học</dt><dd>${lessons.length}</dd></div>
        <div><dt>Thời lượng</dt><dd>${fmt.duration(c.durationMin)}</dd></div>
      </dl>
      <a class="small" href="#/ai?prompt=${encodeURIComponent('Khoá "' + c.title + '" có phù hợp với tôi không?')}">${icon('sparkles', { cls: 'icon-sm' })} Hỏi trợ lý AI Codi</a>
    </div></div>`;
  }

  Codi.route('/courses/:slug', (params) => {
    const c = Codi.course(params.slug);
    if (!c) return html`<div class="page page-narrow">${ui.empty({ icon: 'search', title: 'Không tìm thấy khoá học', body: 'Đường dẫn có thể đã thay đổi.', actions: html`<a class="btn btn-primary" href="#/courses">Xem danh sách khoá học</a>` })}</div>`;
    const enrolled = Codi.isEnrolled(c.id);
    if (c.status !== 'published' && !enrolled) {
      return html`<div class="page page-narrow">${ui.empty({ icon: 'eye-off', title: 'Khoá học tạm ngừng bán', body: 'Khoá học này hiện không mở bán cho học viên mới.', actions: html`<a class="btn btn-primary" href="#/courses">Khám phá khoá học khác</a>` })}</div>`;
    }
    const reviews = Codi.db().reviews.filter((r) => r.courseId === c.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const lec = Codi.user(c.lecturerId);
    const totalBreak = c.ratingBreakdown.reduce((s, n) => s + n, 0) || 1;
    return html`<div class="page">
      <nav class="small muted cm-crumb" aria-label="Breadcrumb"><a href="#/courses">Khoá học</a> / <span>${Codi.category(c.categoryId).name}</span> / <span aria-current="page">${c.title}</span></nav>
      ${c.status === 'hidden' && enrolled ? ui.alert({ type: 'info', title: 'Khoá học đang tạm ẩn với người mua mới', body: 'Bạn đã sở hữu khoá học nên vẫn học bình thường.' }) : ''}
      <div class="layout-aside" style="margin-top:16px">
        <div class="stack-6">
          <header class="stack-3">
            <h1>${c.title}</h1>
            <p class="cm-lede muted">${c.summary || 'Giảng viên đang cập nhật mô tả.'}</p>
            <ul class="cm-stats">
              <li>${icon('bar-chart', { cls: 'icon-sm' })} ${Codi.levelLabel(c.level)}</li>
              <li>${icon('clock', { cls: 'icon-sm' })} ${fmt.duration(c.durationMin)}</li>
              <li>${icon('star-filled', { cls: 'icon-sm cm-star' })} ${c.ratingCount ? `${c.rating.toFixed(1)} (${fmt.num(c.ratingCount)} đánh giá)` : 'Chưa có đánh giá'}</li>
              <li>${icon('users', { cls: 'icon-sm' })} ${fmt.num(c.learnersCount)} học viên</li>
              <li>${icon('user', { cls: 'icon-sm' })} ${lec ? lec.name : ''}</li>
            </ul>
          </header>
          <section class="stack-3"><h2>01 · Bạn sẽ học được gì?</h2>
            ${c.outcomes.length ? html`<ul class="cm-outcomes">${c.outcomes.map((o) => html`<li>${icon('check', { cls: 'icon-sm text-success' })}<span>${o}</span></li>`)}</ul>` : html`<p class="muted">Giảng viên đang cập nhật mục tiêu khoá học.</p>`}
          </section>
          <section class="stack-3">
            <div class="row-between"><h2>02 · Nội dung khóa học</h2>
              ${c.chapters.length ? html`<div class="row"><button class="btn btn-ghost btn-sm" data-action="cm-expand" data-open="1">Mở rộng tất cả</button><button class="btn btn-ghost btn-sm" data-action="cm-expand" data-open="0">Thu gọn tất cả</button></div>` : ''}</div>
            ${c.chapters.length ? html`<p class="small muted">${c.chapters.length} chương · ${Codi.lessons(c).length} bài học · ${fmt.duration(c.durationMin)}</p>
              <div class="cm-curriculum">${c.chapters.map((ch, i) => html`<details class="cm-chapter" ${i === 0 ? Codi.raw('open') : ''}>
                <summary><span class="strong">Chương ${i + 1}: ${ch.title}</span><span class="small muted od-nowrap">${ch.lessons.length} bài · ${fmt.duration(ch.lessons.reduce((s, l) => s + l.durationMin, 0))}</span></summary>
                <ul class="list">${ch.lessons.map((l) => html`<li class="list-row">${icon(TYPE_ICON[l.type] || 'file-text', { cls: 'icon-sm' })}<span class="list-main"><span>${l.title}</span><span class="xsmall muted">${TYPE_LABEL[l.type] || l.type}${l.quiz ? ' · Quiz' : ''}${l.assignment ? ' · Bài tập' : ''}</span></span><span class="small muted od-nowrap">${fmt.duration(l.durationMin)}</span></li>`)}</ul>
              </details>`)}</div>`
              : ui.alert({ type: 'info', title: 'Nội dung học đang được chuẩn bị', body: 'Giảng viên sẽ sớm cập nhật đề cương.' })}
          </section>
          <section class="stack-3"><h2>03 · Yêu cầu trước khi học</h2>
            ${c.requirements.length ? html`<ul>${c.requirements.map((r) => html`<li>${r}</li>`)}</ul>` : html`<p class="muted">Không có yêu cầu đặc biệt.</p>`}
          </section>
          <section class="stack-3"><h2>04 · Giảng viên</h2>
            <div class="card"><div class="card-body compact row">${ui.avatar(lec, 'lg')}<div class="stack-1"><strong>${lec ? lec.name : ''}</strong><span class="small muted">Giảng viên tại Codi</span></div></div></div>
          </section>
          <section class="stack-3"><h2>Đánh giá của học viên</h2>
            ${c.ratingCount ? html`<div class="cm-rating card"><div class="card-body compact cm-rating-inner">
                <div class="od-stat" style="text-align:center"><span class="cm-rating-num">${c.rating.toFixed(1)}</span>${ui.stars(c.rating)}<span class="small muted">${fmt.num(c.ratingCount)} đánh giá</span></div>
                <div class="stack-1 od-fill">${[5, 4, 3, 2, 1].map((s, i) => html`<div class="row small" style="gap:8px"><span class="od-nowrap" style="width:40px">${s} sao</span><div class="progress od-fill" aria-hidden="true"><span style="width:${Math.round((c.ratingBreakdown[i] / totalBreak) * 100)}%"></span></div><span class="muted" style="width:36px;text-align:right">${c.ratingBreakdown[i]}</span></div>`)}</div>
              </div></div>` : ''}
            ${reviews.length ? html`<ul class="list stack-3">${reviews.map((r) => { const u = Codi.user(r.userId) || { name: 'Học viên' }; return html`<li class="card"><div class="card-body compact stack-2">
                <div class="row">${ui.avatar(u, 'sm')}<strong>${u.name}${r.userId === uid() ? ' (bạn)' : ''}</strong>${ui.stars(r.stars)}<span class="xsmall muted">${fmt.date(r.createdAt)}</span></div>
                ${r.text ? html`<p>${r.text}</p>` : html`<p class="small muted">Không có nhận xét.</p>`}
                ${r.reply ? html`<div class="panel stack-1"><span class="row small strong">${icon('message-circle', { cls: 'icon-sm' })} Phản hồi của giảng viên <span class="badge badge-accent">Giảng viên</span></span><p class="small">${r.reply.text}</p></div>` : ''}
              </div></li>`; })}</ul>` : html`<p class="muted">Chưa có đánh giá nào.</p>`}
          </section>
        </div>
        <aside>${purchaseCardDetail(c)}</aside>
      </div>
    </div>`;
  }, { title: 'Chi tiết khoá học' });

  // ───────────────────────── S05 Cart ─────────────────────────
  Codi.route('/cart', () => {
    // Auto-remove courses the learner already owns (e.g. bought elsewhere) and explain why.
    const ownedInCart = Codi.cart().filter((id) => Codi.isEnrolled(id));
    if (ownedInCart.length) {
      ownedNotice = ownedInCart.map((id) => Codi.course(id).title);
      Codi.set(() => Codi.setCart(Codi.cart().filter((id) => !Codi.isEnrolled(id))), { render: false });
    }
    const s = cartSummary();
    const pending = myPendingOrders()[0];
    const notices = html`
      ${pending ? ui.alert({ type: 'warn', title: `Bạn có đơn hàng ${pending.code} đang chờ thanh toán`, body: `${pending.items.length} khoá học · ${fmt.vnd(pending.total)} · tạo lúc ${fmt.datetime(pending.createdAt)}`, actions: html`<a class="btn btn-primary btn-sm" href="#/checkout?order=${pending.id}">Tiếp tục thanh toán</a>` }) : ''}
      ${ownedNotice.length ? ui.alert({ type: 'info', title: 'Đã bỏ khoá học bạn đã sở hữu khỏi giỏ', body: ownedNotice.join(', ') }) : ''}
      ${lastRemoved ? ui.alert({ type: 'info', title: `Đã xoá "${Codi.course(lastRemoved).title}" khỏi giỏ hàng`, actions: html`<button class="btn btn-secondary btn-sm" data-action="cm-undo">${icon('rotate-ccw', { cls: 'icon-sm' })} Hoàn tác</button>` }) : ''}`;
    ownedNotice = [];
    if (!s.courses.length) {
      return html`<div class="page page-narrow stack-4"><h1>Giỏ hàng</h1>${notices}
        <div class="card">${ui.empty({ icon: 'cart', title: 'Giỏ hàng của bạn đang trống', body: 'Thêm khoá học từ danh sách, hoặc nhờ AI Codi gợi ý khoá phù hợp với mục tiêu.', actions: html`<a class="btn btn-primary" href="#/courses">Khám phá khoá học</a><a class="btn btn-secondary" href="#/ai">${icon('sparkles')} Hỏi AI Codi</a>` })}</div></div>`;
    }
    const verr = voucherUI.error || (s.code && s.voucherInvalid);
    return html`<div class="page stack-4">
      <h1>Giỏ hàng <span class="muted" style="font-weight:400">(${s.courses.length})</span></h1>
      ${notices}
      <div class="layout-aside">
        <ul class="list stack-3">${s.courses.map((c) => html`<li class="card"><div class="card-body compact row cm-cart-row">
          ${ui.thumb(c, { small: true })}
          <div class="od-fill stack-1"><a class="strong" href="#/courses/${c.slug}">${c.title}</a><span class="small muted">${lecturerName(c)} · ${Codi.levelLabel(c.level)}</span></div>
          <span class="price">${priceLabel(c)}</span>
          <button class="btn btn-ghost btn-icon" data-action="cm-remove" data-id="${c.id}" aria-label="Xoá ${c.title} khỏi giỏ">${icon('x')}</button>
        </div></li>`)}</ul>
        <aside><div class="card"><div class="card-body stack-4">
          <h2 class="h-card">Tóm tắt đơn hàng</h2>
          ${s.voucher ? html`<div class="row-between"><span class="chip">${icon('ticket', { cls: 'icon-sm' })} ${s.voucher.code}<button type="button" data-action="cm-voucher-remove" aria-label="Bỏ mã giảm giá">${icon('x', { cls: 'icon-sm' })}</button></span><span class="small text-success">Đã áp dụng</span></div>`
          : html`<form class="field ${verr ? 'is-invalid' : ''}" data-submit="cm-voucher" novalidate>
              <label for="voucher">Mã giảm giá</label>
              <div class="input-group"><input id="voucher" name="code" class="input" value="${voucherUI.draft}" autocomplete="off" aria-describedby="voucher-err" style="text-transform:uppercase"><button class="btn btn-secondary" type="submit">Áp dụng</button></div>
              ${verr ? html`<p class="field-error" id="voucher-err" role="alert">${icon('alert-circle', { cls: 'icon-sm' })}<span>${verr}</span></p>` : html`<p class="field-help" id="voucher-err">Thử WELCOME20 (đơn từ 500.000 ₫) hoặc SUMMER15 (đã hết hạn).</p>`}
            </form>`}
          <dl class="cm-sum">
            <div><dt>Tạm tính</dt><dd>${fmt.vnd(s.subtotal)}</dd></div>
            <div><dt>Giảm giá</dt><dd class="${s.discount ? 'text-success' : ''}">${s.discount ? '−' + fmt.vnd(s.discount) : fmt.vnd(0)}</dd></div>
            <div class="cm-sum-total"><dt>Tổng</dt><dd>${fmt.vnd(s.total)}</dd></div>
          </dl>
          <button class="btn btn-primary btn-block btn-lg" data-action="cm-checkout">Thanh toán</button>
          <a class="btn btn-ghost btn-block" href="#/courses">Tiếp tục xem khoá học</a>
          <p class="xsmall muted">Thanh toán bằng chuyển khoản ngân hàng (VietQR). Khoá học được mở ngay khi Codi nhận được tiền.</p>
        </div></div></aside>
      </div>
    </div>`;
  }, { title: 'Giỏ hàng', role: 'learner' });

  // ───────────────────────── S06 Checkout with VietQR & countdown ─────────────────────────
  let sim = null; // { orderId, start, timer, slowShown, checkedAt, manualCheckCooldown }
  const stopSim = () => { if (sim && sim.timer) clearInterval(sim.timer); sim = null; };

  function markPaid(order) {
    const now = new Date().toISOString();
    order.status = 'paid'; order.paidAt = now; order.received = order.total;
    order.timeline.push({ at: now, label: 'Đã nhận tiền' });
    order.items.forEach((i) => Codi.enroll(i.courseId));
    if (order.voucherCode) { const v = Codi.db().vouchers.find((x) => x.code === order.voucherCode); if (v) v.used += 1; }
    Codi.notify(order.userId, { title: 'Thanh toán thành công', body: `Đơn ${order.code} đã được xác nhận. Khoá học đã sẵn sàng.`, link: '/checkout/success?order=' + order.id });
  }

  // Payment simulation & countdown countdown (Flows L3, S06: decision 33, decision 37, decision 49)
  function startSim(order) {
    if (sim && sim.orderId === order.id) return;
    stopSim();
    sim = { orderId: order.id, start: Date.now(), slowShown: false, checkedAt: Date.now(), manualCheckCooldown: 0 };
    sim.timer = setInterval(() => {
      if (Codi.path() !== '/checkout' || Codi.query().order !== order.id) { stopSim(); return; }
      const o = Codi.db().orders.find((x) => x.id === order.id);
      if (!o || o.status !== 'pending') { stopSim(); Codi.rerender(); return; }
      // Live countdown (every second) — 30 minute expiry with stated consequence
      const left = new Date(o.createdAt).getTime() + 30 * 60000 - Date.now();
      const cd = document.querySelector('[data-countdown]');
      if (cd) cd.textContent = left > 0 ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : '0:00';
      if (left <= 0) { o.status = 'failed'; o.failReason = 'expired'; o.timeline.push({ at: new Date().toISOString(), label: 'Mã thanh toán hết hạn' }); Codi.set(() => {}); return; }
      // Payment check every 3 seconds
      const elapsed = Date.now() - sim.start;
      if (Date.now() - sim.checkedAt >= 3000) {
        sim.checkedAt = Date.now();
        const st = document.querySelector('[data-checked]');
        if (st) st.textContent = new Date().toLocaleTimeString('vi-VN');
      }
      // Update manual check cooldown display
      if (sim.manualCheckCooldown > 0) {
        sim.manualCheckCooldown--;
        const btn = document.querySelector('[data-action="cm-i-paid"]');
        if (btn) {
          btn.disabled = sim.manualCheckCooldown > 0;
          if (sim.manualCheckCooldown > 0) btn.textContent = `Tôi đã chuyển khoản (${sim.manualCheckCooldown}s)`;
          else btn.textContent = 'Tôi đã chuyển khoản';
        }
      }
      const outcome = Codi.state.scenario.paymentOutcome;
      if (elapsed < 6000) return;
      if (outcome === 'success') { markPaid(o); stopSim(); Codi.set(() => {}, { render: false }); Codi.go('/checkout/success?order=' + o.id); }
      else if (outcome === 'expired') { o.status = 'failed'; o.failReason = 'expired'; o.timeline.push({ at: new Date().toISOString(), label: 'Mã thanh toán hết hạn' }); stopSim(); Codi.set(() => {}); }
      else if (outcome === 'underpaid' && !o.received) { o.received = Math.round(o.total * 0.5); o.timeline.push({ at: new Date().toISOString(), label: `Đã nhận một phần: ${fmt.vnd(o.received)}` }); Codi.set(() => {}); }
      else if (outcome === 'qrfail' && !o.qrFailed) { o.qrFailed = true; Codi.rerender(); }
      else if (outcome === 'slow' && elapsed >= 15000 && !sim.slowShown) { sim.slowShown = true; Codi.rerender(); }
    }, 1000);
  }

  function copyRow(label, value, copyValue, emphasis) {
    return html`<div class="copy-row ${emphasis ? 'is-emphasis' : ''}">
      <div class="copy-main"><span class="copy-label">${label}</span><span class="copy-value">${value}</span></div>
      <button class="btn btn-secondary btn-sm" data-action="cm-copy" data-value="${copyValue}" aria-label="Sao chép ${label}">${icon('copy', { cls: 'icon-sm' })}<span data-copy-label>Sao chép</span></button>
    </div>`;
  }

  Codi.route('/checkout', (params, q) => {
    if (!q.order) {
      // Entry without an order: resume the pending one or create one from the cart.
      Codi.onMount(() => {
        const pending = myPendingOrders()[0];
        if (pending && !Codi.cart().length) { Codi.go('/checkout?order=' + pending.id); return; }
        const o = Codi.cart().length ? createOrderFromCart() : null;
        Codi.go(o ? '/checkout?order=' + o.id : '/cart');
      });
      return ui.spinnerBlock('Đang tạo đơn hàng…');
    }
    const order = Codi.db().orders.find((o) => o.id === q.order && o.userId === uid());
    if (!order) return html`<div class="page page-narrow">${ui.empty({ icon: 'receipt', title: 'Không tìm thấy đơn hàng', body: 'Đơn hàng không tồn tại hoặc không thuộc tài khoản này.', actions: html`<a class="btn btn-primary" href="#/cart">Về giỏ hàng</a>` })}</div>`;
    const courses = order.items.map((i) => Codi.course(i.courseId)).filter(Boolean);
    const bank = Codi.db().bankInfo;
    const summary = html`<div class="card"><div class="card-body stack-3">
      <h2 class="h-card">Thông tin đơn hàng</h2>
      <ul class="list">${order.items.map((i) => { const c = Codi.course(i.courseId); return html`<li class="list-row" style="padding-inline:0"><span class="list-main"><span>${c.title}</span><span class="xsmall muted">${lecturerName(c)}</span></span><span class="price od-nowrap">${fmt.vnd(i.price)}</span></li>`; })}</ul>
      <dl class="cm-sum">
        ${order.discount ? html`<div><dt>Giảm giá (${order.voucherCode})</dt><dd class="text-success">−${fmt.vnd(order.discount)}</dd></div>` : ''}
        <div class="cm-sum-total"><dt>Tổng thanh toán</dt><dd>${fmt.vnd(order.total)}</dd></div>
      </dl>
      <p class="xsmall muted">Mã giao dịch (để đối soát): <span class="mono">${order.code}</span></p>
    </div></div>`;

    if (order.status === 'paid') {
      return html`<div class="page page-narrow stack-4"><h1>Thanh toán khóa học</h1>${ui.alert({ type: 'success', title: 'Đơn hàng đã được thanh toán', body: `Nhận tiền lúc ${fmt.datetime(order.paidAt)}.`, actions: html`<a class="btn btn-primary btn-sm" href="#/checkout/success?order=${order.id}">Xem kết quả và bắt đầu học</a>` })}${summary}</div>`;
    }
    if (order.status === 'cancelled') {
      return html`<div class="page page-narrow stack-4"><h1>Thanh toán khóa học</h1>${ui.alert({ type: 'info', title: 'Đơn hàng đã huỷ', body: 'Các khoá học đã được đưa lại vào giỏ hàng.', actions: html`<a class="btn btn-primary btn-sm" href="#/cart">Về giỏ hàng</a>` })}${summary}</div>`;
    }
    if (order.status === 'failed') {
      return html`<div class="page page-narrow stack-4"><h1>Thanh toán khóa học</h1>
        ${ui.alert({ type: 'danger', title: order.failReason === 'expired' ? 'Mã thanh toán đã hết hạn' : 'Thanh toán không thành công', body: `Nếu bạn đã chuyển khoản sau thời điểm hết hạn, Codi sẽ đối soát thủ công và liên hệ qua email. Bạn có thể tạo mã mới để thanh toán lại. Cần hỗ trợ? Email hotro@codi.vn kèm mã giao dịch ${order.code}.`, actions: html`<button class="btn btn-primary btn-sm" data-action="cm-new-code" data-id="${order.id}">${icon('refresh', { cls: 'icon-sm' })} Tạo mã mới</button><a class="btn btn-secondary btn-sm" href="#/cart">Về giỏ hàng</a>` })}
        ${summary}</div>`;
    }

    // Pending → payment screen with countdown, QR failed state & text fallback (S06, decisions 33, 37, 49)
    Codi.onMount(() => startSim(order));
    const leftMs = new Date(order.createdAt).getTime() + 30 * 60000 - Date.now();
    const slow = sim && sim.orderId === order.id && sim.slowShown;
    const qrFailed = order.qrFailed || Codi.state.scenario.paymentOutcome === 'qrfail';
    return html`<div class="page stack-4">
      <div class="stack-1"><h1>Thanh toán khóa học</h1><p class="muted">Quét mã bằng ứng dụng ngân hàng, hoặc chuyển khoản theo thông tin bên dưới.</p></div>
      ${ui.stepper(['Đã tạo đơn', 'Đang chờ thanh toán', 'Đã nhận tiền'], 1)}
      ${order.received ? ui.alert({ type: 'warn', title: `Đã nhận ${fmt.vnd(order.received)} / cần ${fmt.vnd(order.total)}`, body: `Hãy chuyển thêm ${fmt.vnd(order.total - order.received)} với cùng nội dung ${order.code}. Cần hỗ trợ? Email hotro@codi.vn kèm mã giao dịch.` }) : ''}
      <div class="layout-aside">
        <div class="stack-4">
          <div class="card"><div class="card-body stack-4">
            <div class="row-between"><h2 class="h-card">${qrFailed ? 'Chuyển khoản thủ công' : 'Quét mã thanh toán'}</h2><span class="badge badge-warn od-nowrap">${icon('clock')}Hết hạn sau <span data-countdown>${leftMs > 0 ? `${Math.floor(leftMs / 60000)}:${String(Math.floor((leftMs % 60000) / 1000)).padStart(2, '0')}` : '0:00'}</span></span></div>
            <p class="xsmall muted" style="margin-bottom:var(--space-2)">Sau thời gian này mã QR và nội dung chuyển khoản sẽ không còn hiệu lực.</p>
            ${qrFailed
              ? html`${ui.alert({ type: 'danger', title: 'Không tải được mã QR', body: `Hãy chuyển khoản thủ công bằng thông tin bên dưới, nội dung ${order.code}. Cần hỗ trợ? Email hotro@codi.vn.`, actions: html`<button class="btn btn-secondary btn-sm" data-action="cm-reload-qr">${icon('refresh', { cls: 'icon-sm' })} Tải lại mã QR</button>` })}`
              : html`<div class="cm-qr-wrap">${qrSvg(order.code)}<span class="xsmall muted">VietQR · ${bank.bank} · minh hoạ trong bản thử nghiệm</span></div>`}
            <div>
              ${copyRow('Ngân hàng', bank.bank, bank.bank)}
              ${copyRow('Số tài khoản', bank.accountNumber, bank.accountNumber)}
              ${copyRow('Chủ tài khoản', bank.accountName, bank.accountName)}
              ${copyRow('Số tiền', fmt.vnd(order.received ? order.total - order.received : order.total), String(order.received ? order.total - order.received : order.total))}
              ${copyRow('Nội dung chuyển khoản', order.code, order.code, true)}
            </div>
            ${ui.alert({ type: 'warn', title: 'Nhập chính xác nội dung chuyển khoản', body: `Nội dung phải là <strong>${order.code}</strong>. Sai nội dung thì hệ thống không tự xác nhận được.` })}
          </div></div>
        </div>
        <aside class="stack-4">
          ${summary}
          <div class="card"><div class="card-body stack-3">
            <p class="row" role="status">${icon('loader')} <span>Đang kiểm tra thanh toán… (lần gần nhất <span data-checked>${new Date().toLocaleTimeString('vi-VN')}</span>)</span></p>
            <p class="small muted">Thường mất vài giây đến vài phút sau khi bạn chuyển. Bạn có thể rời trang — đơn hàng vẫn được lưu trong Giỏ hàng và Hồ sơ › Giao dịch.</p>
            <button class="btn btn-secondary btn-block" data-action="cm-i-paid">Tôi đã chuyển khoản</button>
            ${slow || qrFailed ? html`<p class="xsmall muted">Cần hỗ trợ? Email hotro@codi.vn kèm mã giao dịch <span class="mono">${order.code}</span>.</p>` : ''}
            <button class="btn btn-ghost btn-block" data-action="cm-cancel" data-id="${order.id}">Hủy giao dịch</button>
          </div></div>
        </aside>
      </div>
    </div>`;
  }, { title: 'Thanh toán', role: 'learner', layout: 'focus', exit: { href: '/cart', label: 'Về giỏ hàng' } });

  // ───────────────────────── S07 Success ─────────────────────────
  Codi.route('/checkout/success', (params, q) => {
    const order = Codi.db().orders.find((o) => o.id === q.order && o.userId === uid());
    if (!order || order.status !== 'paid') return html`<div class="page page-narrow">${ui.empty({ icon: 'receipt', title: 'Chưa có xác nhận thanh toán cho đơn này', actions: html`<a class="btn btn-primary" href="#/profile?tab=transactions">Xem giao dịch</a>` })}</div>`;
    const courses = order.items.map((i) => Codi.course(i.courseId)).filter(Boolean);
    return html`<div class="page page-narrow stack-6">
      <div class="stack-2" style="text-align:center">
        <span class="cm-success-icon">${icon('check')}</span>
        <h1>Thanh toán thành công!</h1>
        <p class="muted">Đơn ${order.code} · ${fmt.vnd(order.total)} · ${fmt.datetime(order.paidAt)}</p>
      </div>
      <div class="card"><div class="card-body stack-3"><h2 class="h-card">Bạn đã sở hữu khóa học</h2>
        <ul class="list">${courses.map((c) => html`<li class="list-row" style="padding-inline:0">${ui.thumb(c, { small: true })}<span class="list-main"><strong>${c.title}</strong><span class="small muted">${lecturerName(c)}</span></span>
          ${courses.length > 1 ? html`<a class="btn btn-secondary btn-sm" href="#/learn/${c.id}/onboarding">Bắt đầu</a>` : ''}</li>`)}</ul>
      </div></div>
      <div class="stack-2">
        <a class="btn btn-primary btn-lg btn-block" href="#/learn/${courses[0].id}/onboarding">Bắt đầu học</a>
        <div class="row" style="justify-content:center"><a class="btn btn-ghost" href="#/dashboard">Về bàn làm việc</a><a class="btn btn-ghost" href="#/profile?tab=transactions">Xem biên lai trong Giao dịch</a></div>
      </div>
    </div>`;
  }, { title: 'Thanh toán thành công', role: 'learner' });

  // ───────────────────────── gated actions with course context (Flow L2, S03, decision 32) ─────────────────────────
  Codi.action('cm-add', (el) => {
    const id = el.dataset.id;
    const course = Codi.course(id);
    Codi.requireAuth(() => {
      el.setAttribute('aria-busy', 'true'); el.disabled = true; el.lastChild.textContent = ' Đang thêm…';
      setTimeout(() => addToCart(id), 400); // addToCart shows the confirmation toast with "Xem giỏ hàng"
    }, { reason: 'Đăng nhập để thêm khoá học vào giỏ. Sau khi đăng nhập, khoá học sẽ được thêm tự động.', courseTitle: course.title });
  });
  Codi.action('cm-buy-now', (el) => {
    const id = el.dataset.id;
    const course = Codi.course(id);
    Codi.requireAuth(() => {
      if (Codi.role() !== 'learner') { ui.toast('Chỉ tài khoản học viên mới mua được khoá học.', { type: 'warn' }); return; }
      const own = Codi.ownership(id);
      if (own === 'owned') { ui.toast('Bạn đã sở hữu khóa học này.', { type: 'info' }); Codi.rerender(); return; }
      if (own === 'pending-payment') { Codi.go('/checkout?order=' + Codi.pendingOrderFor(id).id); return; }
      const o = createBuyNowOrder(id);
      Codi.go('/checkout?order=' + o.id);
    }, { reason: 'Đăng nhập để mua khoá học.', courseTitle: course.title });
  });
  Codi.action('cm-enroll-free', (el) => {
    const id = el.dataset.id;
    const course = Codi.course(id);
    Codi.requireAuth(() => {
      if (Codi.role() !== 'learner') { ui.toast('Chỉ tài khoản học viên mới đăng ký được khoá học.', { type: 'warn' }); return; }
      Codi.set(() => Codi.enroll(id));
      ui.toast(`Đã đăng ký "${course.title}".`, { type: 'success' });
      Codi.go('/learn/' + id + '/onboarding');
    }, { reason: 'Đăng nhập để đăng ký khoá học miễn phí.', courseTitle: course.title });
  });

  // Catalog filters → URL query (so back/forward keeps them)
  function goCatalog(patch) {
    const cur = Object.assign({}, Codi.query(), patch);
    delete cur.error;
    Object.keys(cur).forEach((k) => { if (!cur[k] || cur[k] === 'all') delete cur[k]; });
    const qs = new URLSearchParams(cur).toString();
    Codi.go('/courses' + (qs ? '?' + qs : ''));
  }
  Codi.action('cm-search', (form, e, v) => goCatalog({ q: (v.q || '').trim() }));
  Codi.action('cm-filter', (el) => goCatalog({ [el.name]: el.value }));
  Codi.action('cm-chip-remove', (el) => goCatalog({ [el.dataset.key]: '' }));
  Codi.action('cm-clear', () => Codi.go('/courses'));
  Codi.action('cm-expand', (el) => document.querySelectorAll('.cm-curriculum details').forEach((d) => { d.open = el.dataset.open === '1'; }));

  // Cart
  Codi.action('cm-remove', (el) => { lastRemoved = el.dataset.id; Codi.set(() => Codi.setCart(Codi.cart().filter((x) => x !== el.dataset.id))); });
  Codi.action('cm-undo', () => { if (lastRemoved && !Codi.cart().includes(lastRemoved)) Codi.setCart(Codi.cart().concat(lastRemoved)); lastRemoved = null; Codi.set(() => {}); });
  Codi.action('cm-voucher', (form, e, v) => {
    voucherUI.draft = (v.code || '').trim().toUpperCase();
    if (!voucherUI.draft) { voucherUI.error = 'Nhập mã giảm giá trước khi bấm Áp dụng.'; Codi.rerender(); return; }
    const r = checkVoucher(voucherUI.draft, cartSummary().subtotal);
    if (r.error) { voucherUI.error = r.error; Codi.rerender(); return; }
    voucherUI = { draft: '', error: null };
    Codi.set(() => { cm().voucher[uid()] = r.voucher.code; });
    ui.toast(`Đã áp dụng mã ${r.voucher.code}: giảm ${fmt.vnd(r.discount)}.`, { type: 'success' });
  });
  Codi.action('cm-voucher-remove', () => Codi.set(() => { cm().voucher[uid()] = null; }));
  Codi.action('cm-checkout', (el) => {
    lastRemoved = null;
    const pending = myPendingOrders()[0];
    const create = () => {
      el.setAttribute('aria-busy', 'true'); el.disabled = true; el.textContent = 'Đang tạo đơn…';
      setTimeout(() => { const o = createOrderFromCart(); Codi.go(o ? '/checkout?order=' + o.id : '/cart'); }, 500);
    };
    if (!pending) { create(); return; }
    ui.modal({
      title: 'Bạn còn một đơn hàng chưa thanh toán',
      body: html`<p>Đơn <strong>${pending.code}</strong> (${fmt.vnd(pending.total)}) đang chờ thanh toán. Bạn muốn làm gì?</p>
        <p class="small muted">Tạo đơn mới sẽ huỷ đơn cũ. Nếu bạn đã chuyển khoản cho đơn cũ, hãy chọn tiếp tục đơn cũ.</p>`,
      footer: html`<button class="btn btn-ghost" data-close>Đóng</button><a class="btn btn-secondary" href="#/checkout?order=${pending.id}" data-close>Tiếp tục đơn cũ</a><button class="btn btn-primary" data-action="cm-replace-order" data-id="${pending.id}">Huỷ đơn cũ, tạo đơn mới</button>`,
    });
  });
  Codi.action('cm-replace-order', (el) => {
    const old = Codi.db().orders.find((o) => o.id === el.dataset.id);
    if (old) cancelOrder(old, 'Huỷ để tạo đơn mới');
    ui.closeAll();
    const o = createOrderFromCart();
    Codi.go(o ? '/checkout?order=' + o.id : '/cart');
  });

  // Checkout
  Codi.action('cm-copy', (el) => ui.copy(el.dataset.value, el));
  Codi.action('cm-cancel', async (el) => {
    const order = Codi.db().orders.find((o) => o.id === el.dataset.id);
    const r = await ui.confirm({
      title: 'Huỷ giao dịch này?', body: `Đơn ${order.code} sẽ bị huỷ và mã thanh toán không dùng được nữa.`,
      consequence: 'Các khoá học quay lại giỏ hàng. Nếu bạn đã chuyển khoản, đừng huỷ — hãy chờ hoặc liên hệ hotro@codi.vn.',
      reversible: 'Bạn có thể tạo đơn mới từ giỏ hàng bất cứ lúc nào.', confirmLabel: 'Huỷ giao dịch', cancelLabel: 'Giữ đơn hàng', danger: true,
    });
    if (!r.ok) return;
    stopSim();
    Codi.set(() => {
      cancelOrder(order);
      Codi.setCart(Array.from(new Set(Codi.cart().concat(order.items.map((i) => i.courseId)))));
    }, { render: false });
    ui.toast('Đã huỷ giao dịch. Khoá học đã quay lại giỏ hàng.');
    Codi.go('/cart');
  });
  Codi.action('cm-new-code', (el) => {
    const old = Codi.db().orders.find((o) => o.id === el.dataset.id);
    const code = makeOrderCode(); const now = new Date().toISOString();
    const o = Object.assign({}, old, { id: 'order-' + Date.now().toString(36), code, content: code, status: 'pending', createdAt: now, paidAt: null, received: 0, failReason: null, timeline: [{ at: now, label: `Đã tạo đơn (thay cho ${old.code})` }] });
    Codi.set((st) => st.db.orders.push(o), { render: false });
    ui.toast(`Đã tạo mã thanh toán mới ${code}.`, { type: 'success' });
    Codi.go('/checkout?order=' + o.id);
  });
  // Manual check button with 30s cooldown (Flow L3, S06, decision 33)
  Codi.action('cm-i-paid', () => {
    if (sim && sim.manualCheckCooldown > 0) return; // Ignore if still in cooldown
    if (sim) sim.manualCheckCooldown = 30; // Start 30-second cooldown
    ui.modal({
      title: 'Bạn đã chuyển khoản?',
      body: html`<div class="stack-3">
        <p>Cảm ơn bạn. Một số ngân hàng xử lý chậm, nên Codi chưa nhận được tín hiệu tự động.</p>
        <ol class="stack-2 small">
          <li>Codi tiếp tục tự kiểm tra trong 30 phút tới.</li>
          <li>Sau đó, bộ phận kế toán đối soát thủ công theo nội dung chuyển khoản — thường trong 2 giờ làm việc.</li>
          <li>Khi xác nhận xong, khoá học mở ngay và bạn nhận được thông báo.</li>
        </ol>
        <p class="small muted">Đơn hàng vẫn được lưu. Cần hỗ trợ: hotro@codi.vn (kèm mã giao dịch).</p>
      </div>`,
      footer: html`<a class="btn btn-secondary" href="#/dashboard" data-close>Về bàn làm việc</a><button class="btn btn-primary" data-close>Tiếp tục chờ</button>`,
    });
  });

  // Reload QR button (when QR failed to load)
  Codi.action('cm-reload-qr', () => {
    const order = Codi.db().orders.find((o) => o.id === Codi.query().order && o.userId === uid());
    if (order) { order.qrFailed = false; Codi.rerender(); }
  });

  // Typeahead selection (S01 keyboard-accessible typeahead)
  Codi.action('cm-typeahead-select', (el) => {
    const courseId = el.dataset.id;
    const c = Codi.course(courseId);
    if (c) Codi.go('/courses/' + c.slug);
  });

  // ───────────────────────── scoped styles ─────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .cm-hero { display: grid; gap: var(--space-4); max-width: 760px; padding: var(--space-8) 0; }
    .cm-hero h1 { font-size: var(--text-3xl); }
    .cm-lede { font-size: var(--text-lg); max-width: 62ch; }
    .cm-steps { list-style: none; padding: 0; margin: 0; }
    .cm-step-num { width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-active); display: grid; place-items: center; font-weight: 700; }
    .cm-card { display: flex; flex-direction: column; overflow: hidden; }
    .cm-card .card-body { flex: 1; display: flex; flex-direction: column; }
    .cm-card-media { display: block; padding: var(--space-3) var(--space-3) 0; text-decoration: none; }
    .cm-card-title { font-size: var(--text-base); }
    .cm-card-title a { color: var(--fg); text-decoration: none; }
    .cm-card-title a:hover { color: var(--accent); }
    .cm-card-foot { margin-top: auto; padding-top: var(--space-2); }
    .cm-star { color: var(--star); }
    .cm-filters { display: grid; grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr)); gap: var(--space-3); align-items: end; }
    @media (max-width: 860px) { .cm-filters { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .cm-search { grid-column: 1 / -1; } }
    @media (max-width: 480px) { .cm-filters { grid-template-columns: minmax(0, 1fr); } }
    .cm-crumb a { color: var(--muted); }
    .cm-stats { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); color: var(--muted); font-size: var(--text-sm); }
    .cm-stats li { display: inline-flex; gap: 6px; align-items: center; }
    .cm-outcomes { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2) var(--space-4); }
    .cm-outcomes li { display: flex; gap: var(--space-2); align-items: flex-start; }
    @media (max-width: 640px) { .cm-outcomes { grid-template-columns: minmax(0, 1fr); } }
    .cm-curriculum { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); overflow: hidden; }
    .cm-chapter + .cm-chapter { border-top: 1px solid var(--border); }
    .cm-chapter summary { display: flex; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); cursor: pointer; min-height: 48px; align-items: center; }
    .cm-chapter[open] summary { background: var(--canvas); }
    .cm-chapter .list-row { padding-left: var(--space-6); }
    .cm-rating-inner { display: flex; gap: var(--space-6); align-items: center; }
    .cm-rating-num { font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 600; }
    @media (max-width: 480px) { .cm-rating-inner { flex-direction: column; align-items: stretch; } }
    .h-card { font-size: var(--text-lg); }
    .cm-price-lg { font-size: var(--text-xl); }
    .cm-facts, .cm-sum { display: grid; gap: var(--space-2); margin: 0; font-size: var(--text-sm); }
    .cm-facts > div, .cm-sum > div { display: flex; justify-content: space-between; gap: var(--space-3); }
    .cm-facts dt, .cm-sum dt { color: var(--muted); }
    .cm-facts dd, .cm-sum dd { margin: 0; font-weight: 600; white-space: nowrap; }
    .cm-sum-total { border-top: 1px solid var(--border); padding-top: var(--space-2); font-size: var(--text-base); }
    .cm-sum-total dt { color: var(--fg); font-weight: 600; }
    .cm-cart-row { align-items: center; }
    @media (max-width: 480px) { .cm-cart-row { flex-wrap: wrap; } .cm-cart-row .thumb-sm { display: none; } }
    .cm-qr-wrap { display: grid; justify-items: center; gap: var(--space-2); padding: var(--space-4); background: var(--canvas); border-radius: var(--radius-md); }
    .cm-qr { width: 200px; height: 200px; border-radius: var(--radius-sm); }
    .cm-success-icon { width: 56px; height: 56px; margin: 0 auto; border-radius: 50%; background: var(--success-soft); color: var(--success); display: grid; place-items: center; }
    .cm-success-icon .icon { width: 28px; height: 28px; }
    .cm-typeahead { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); max-height: 300px; overflow-y: auto; z-index: 10; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); }
    .cm-typeahead-group { border-bottom: 1px solid var(--border); }
    .cm-typeahead-group:last-child { border-bottom: none; }
    .cm-typeahead-header { padding: var(--space-2) var(--space-3); font-size: var(--text-sm); font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .cm-typeahead-item { display: block; width: 100%; text-align: left; padding: var(--space-2) var(--space-3); border: none; background: none; cursor: pointer; color: var(--fg); font-size: var(--text-sm); }
    .cm-typeahead-item:hover, .cm-typeahead-item.active { background: var(--canvas); color: var(--accent); }
    .cm-typeahead-item[aria-selected="true"] { background: var(--accent-soft); color: var(--accent-active); font-weight: 500; }
  `;
  document.head.appendChild(style);
})();
