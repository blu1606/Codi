// Admin seed patch: a realistic 6-month platform history so the admin dashboard, "Đơn hàng & giao dịch",
// "Quan sát hệ thống" (A1–A9) and "Tài chính" (B1–B9) all read the same rows.
//
// Adds (additive only, never rewrites existing rows):
//  - users: historical learners (role learner) with createdAt / lastActive / emailVerified.
//  - orders: their purchase attempts with the lifecycle fields of the order contract (received, expiresAt,
//    failReason, cancelledAt, timeline [{at,type,by,note}]) plus admin-owned `needsReconciliation` and
//    `updatedAt` / `isBuyNow`. A few recent rows cover the reconciliation queue (underpaid, stale, flagged).
//  - enrolments: one per paid course line (+ free-course enrolments) with status, completedAt, orderId,
//    startMode ('diagnostic' | 'lesson1') and pathStatus for diagnostic starts.
//  - learnerProgress: per enrolment, completed lessons with completedAt timestamps.
//  - studyLog: [{ userId, days: { 'YYYY-MM-DD': { m: minutes, ai?: [latencyMs…], err?, rl? } } }] — daily study
//    time and AI-assistant requests per learner (GMT+7 day keys).
//  - checkoutEvents: [{ userId, courseId, kind: 'cart' | 'buy_now', at, orderId | null }] — add-to-cart and
//    buy-now clicks, linked to the order they produced (null = abandoned).
//  - Missing fields on existing rows: users.emailVerified, enrolments.startMode/pathStatus,
//    learnerProgress.completedAt, orders.needsReconciliation.
//
// History ends at seed time (Date.now()), so every analytics window has data after a reseed. Rows are
// deterministic (seeded PRNG); only their absolute dates follow the seed time.
patchSeed((db) => {
  const DAY = 86400000;
  const MIN = 60000;
  const TZ = 7 * 3600000;
  const NOW = Date.now();
  const HISTORY_DAYS = 178;

  let state = 0x70a3d1;
  const rnd = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + rnd() * (b - a);
  const iso = (t) => new Date(t).toISOString();
  const dayKey = (t) => new Date(t + TZ).toISOString().slice(0, 10);
  const startOfDay = (t) => Date.parse(dayKey(t) + 'T00:00:00Z') - TZ; // GMT+7 midnight, as UTC ms
  const atLocalHour = (dayStart, h) => dayStart + Math.round(h * 60) * MIN;
  const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

  db.users = db.users || [];
  db.orders = db.orders || [];
  db.enrolments = db.enrolments || [];
  db.learnerProgress = db.learnerProgress || [];

  // ---------- catalogue facts ----------
  const lessonIds = (c) => (c.defaultOrder && c.defaultOrder.length ? c.defaultOrder : c.chapters.flatMap((ch) => ch.lessons.map((l) => l.id)));
  const quizLessons = (c) => new Set(c.chapters.flatMap((ch) => ch.lessons).filter((l) => l.quiz && l.quiz.questions && l.quiz.questions.length).map((l) => l.id));
  // When a course became purchasable: approval/publication date if known, else the review submission + 2 days,
  // else the start of the history window.
  const availableFrom = (c) => {
    const known = c.approvedAt || c.publishedAt;
    if (known) return Date.parse(known);
    if (c.submittedAt) return Date.parse(c.submittedAt) + 2 * DAY;
    return NOW - HISTORY_DAYS * DAY;
  };
  const paidCourses = db.courses.filter((c) => c.status === 'published' && c.price > 0);
  const freeCourses = db.courses.filter((c) => c.status === 'published' && !c.price);
  const courseById = Object.fromEntries(db.courses.map((c) => [c.id, c]));
  const voucherByCode = Object.fromEntries((db.vouchers || []).map((v) => [v.code, v]));

  // ---------- existing rows: fill admin-read fields that are missing ----------
  db.users.forEach((u) => { if (u.emailVerified === undefined) u.emailVerified = true; });
  db.orders.forEach((o) => { if (o.needsReconciliation === undefined) o.needsReconciliation = false; });
  db.enrolments.forEach((e) => {
    if (e.startMode !== undefined) return;
    const c = courseById[e.courseId];
    const seedCourse = db.learnerSeed && db.learnerSeed.userId === e.userId && db.learnerSeed.courses && db.learnerSeed.courses[e.courseId];
    const tookDiagnostic = seedCourse ? !!(seedCourse.diagnostic && seedCourse.diagnostic.status === 'done') : !!(c && c.entryTest) && rnd() < 0.55;
    e.startMode = tookDiagnostic ? 'diagnostic' : 'lesson1';
    if (tookDiagnostic && e.pathStatus === undefined) e.pathStatus = 'ready';
  });
  db.learnerProgress.forEach((p) => {
    if (p.completedAt || !Array.isArray(p.completed) || !p.completed.length) return;
    const en = db.enrolments.find((e) => e.userId === p.userId && e.courseId === p.courseId);
    const from = en ? Date.parse(en.enrolledAt) : Date.parse(p.lastActive) - 30 * DAY;
    const to = Math.max(from + DAY, Date.parse(p.lastActive || iso(NOW)));
    const step = (to - from) / p.completed.length;
    p.completedAt = {};
    p.completed.forEach((id, i) => { p.completedAt[id] = iso(atLocalHour(startOfDay(from + step * (i + 1)), between(19, 22.5))); });
  });

  // ---------- historical learners ----------
  const SURNAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Trịnh', 'Mai'];
  const MIDDLES = ['Văn', 'Thị', 'Minh', 'Đức', 'Ngọc', 'Thanh', 'Quang', 'Hoài', 'Gia', 'Khánh', 'Bảo', 'Hữu', 'Phương', 'Tuấn'];
  const GIVEN = ['An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hạnh', 'Hiếu', 'Hòa', 'Huy', 'Khoa', 'Lan', 'Linh', 'Long', 'Mai', 'Nam', 'Nhi', 'Phúc', 'Quân', 'Quyên', 'Sơn', 'Tâm', 'Thảo', 'Trang', 'Trí', 'Tú', 'Uyên', 'Việt', 'Yến', 'Khôi', 'Ngân'];
  const MAIL = ['gmail.com', 'gmail.com', 'gmail.com', 'outlook.com', 'yahoo.com', 'fpt.edu.vn'];
  const LEARNERS = 96;
  const seeds = [];
  for (let i = 0; i < LEARNERS; i++) {
    const ago = Math.floor(HISTORY_DAYS * (1 - Math.sqrt(rnd()))); // more sign-ups recently (slow growth)
    let created = atLocalHour(startOfDay(NOW - ago * DAY), between(7, 23.5));
    if (created > NOW - 30 * MIN) created = NOW - Math.round(between(1, 6) * 3600000);
    seeds.push({ created, surname: pick(SURNAMES), middle: pick(MIDDLES), given: pick(GIVEN), verifiedRoll: rnd(), buyRoll: rnd(), engagement: between(0.25, 1) });
  }
  seeds.sort((a, b) => a.created - b.created);
  const newUsers = seeds.map((s, i) => {
    const n = String(i + 1).padStart(3, '0');
    const verified = s.verifiedRoll < 0.84;
    return {
      id: 'usr-learner-h' + n,
      name: `${s.surname} ${s.middle} ${s.given}`,
      email: `${ascii(s.given)}.${ascii(s.surname)}${n}@${MAIL[i % MAIL.length]}`,
      role: 'learner',
      status: 'active',
      createdAt: iso(s.created),
      lastActive: iso(s.created),
      emailVerified: verified,
      emailVerifiedAt: verified ? iso(s.created + Math.round(between(2, 90)) * MIN) : null,
      _seed: s,
    };
  });

  // ---------- purchase attempts ----------
  const drafts = []; // order drafts, ids assigned after sorting by createdAt
  const owned = {}; // userId -> Set(courseId) of paid, non-refunded courses
  const freeEnrolments = [];
  const ownedBy = (uid) => (owned[uid] = owned[uid] || new Set());
  const PAY_WINDOW = 30 * MIN;

  function voucherFor(items, subtotal, created, firstOrder) {
    const day = dayKey(created);
    const valid = (code) => { const v = voucherByCode[code]; return v && (!v.expiresAt || day <= v.expiresAt) && subtotal >= (v.minOrder || 0) ? v : null; };
    const has = (id) => items.some((i) => i.courseId === id);
    const tries = [];
    if (firstOrder && rnd() < 0.38) tries.push('WELCOME20');
    if (has('course-react-001') && rnd() < 0.3) tries.push('REACT10');
    if (has('course-node-001') && rnd() < 0.3) tries.push('BACKEND50K');
    if (day <= '2026-08-31' && rnd() < 0.18) tries.push('SUMMER15');
    if (rnd() < 0.06) tries.push('GIAM100K');
    for (const code of tries) {
      const v = valid(code);
      if (!v) continue;
      const discount = v.type === 'percent' ? Math.round((subtotal * v.value) / 100 / 1000) * 1000 : Math.min(v.value, subtotal);
      return { code, discount };
    }
    return null;
  }

  function paymentDelayMinutes() {
    const r = rnd();
    if (r < 0.16) return between(0.2, 0.95);
    if (r < 0.62) return between(1, 4.9);
    if (r < 0.86) return between(5, 14.9);
    if (r < 0.98) return between(15, 29.5);
    return between(31, 180); // transfer arrived after the 30-minute window
  }

  function addDraft(user, items, created, opts) {
    const subtotal = items.reduce((s, i) => s + i.price, 0);
    const v = opts.voucher === false ? null : voucherFor(items, subtotal, created, opts.firstOrder);
    const d = { userId: user.id, items, created, subtotal, voucher: v, isBuyNow: !!opts.isBuyNow, outcome: opts.outcome, payDelay: opts.payDelay, refundAfter: opts.refundAfter, received: opts.received, flagged: !!opts.flagged };
    drafts.push(d);
    return d;
  }

  newUsers.forEach((u) => {
    const s = u._seed;
    if (u.emailVerified && rnd() < 0.25 && freeCourses.length) {
      const c = pick(freeCourses);
      const at = Math.min(NOW - 10 * MIN, s.created + Math.round(between(10, 9 * 24 * 60)) * MIN);
      if (at >= availableFrom(c)) freeEnrolments.push({ userId: u.id, courseId: c.id, enrolledAt: at });
    }
    if (!u.emailVerified || s.buyRoll > 0.78) return;
    let at = s.created + (rnd() < 0.5 ? between(5, 120) * MIN : between(1, 14) * DAY);
    const sessions = 1 + (rnd() < 0.35 ? 1 : 0) + (rnd() < 0.12 ? 1 : 0);
    for (let k = 0; k < sessions && at < NOW - 5 * MIN; k++) {
      const pool = paidCourses.filter((c) => !ownedBy(u.id).has(c.id) && availableFrom(c) <= at);
      if (!pool.length) break;
      const first = pick(pool);
      const second = rnd() < 0.25 ? pick(pool.filter((c) => c.id !== first.id)) : null;
      const items = [first, second].filter(Boolean).map((c) => ({ courseId: c.id, price: c.price }));
      const isBuyNow = items.length === 1 && rnd() < 0.4;
      const r = rnd();
      const outcome = NOW - at < PAY_WINDOW ? 'pending' : r < 0.8 ? 'paid' : r < 0.9 ? 'expired' : r < 0.98 ? 'cancelled' : 'refunded';
      addDraft(u, items, at, { isBuyNow, outcome, firstOrder: k === 0, payDelay: paymentDelayMinutes(), refundAfter: between(1, 6) * DAY });
      if (outcome === 'paid' || outcome === 'refunded') {
        if (outcome === 'paid') items.forEach((i) => ownedBy(u.id).add(i.courseId));
      } else if ((outcome === 'expired' || outcome === 'cancelled') && rnd() < 0.6) {
        const retry = at + between(10, 2 * 24 * 60) * MIN;
        if (retry < NOW - PAY_WINDOW) {
          addDraft(u, items, retry, { isBuyNow, outcome: 'paid', firstOrder: k === 0, payDelay: paymentDelayMinutes() });
          items.forEach((i) => ownedBy(u.id).add(i.courseId));
          at = retry;
        }
      }
      at += between(3, 40) * DAY;
    }
  });

  // Recent rows for the reconciliation queue and the overdue filter (deterministic, one of each case).
  const buyerWithout = (courseId, skip) => newUsers.find((u, i) => i >= skip && u.emailVerified && !ownedBy(u.id).has(courseId));
  const special = [
    { courseId: 'course-node-001', agoMin: 5 * 60, outcome: 'pending', received: 500000, skip: 50 },         // underpaid, still pending
    { courseId: 'course-python-001', agoMin: 2 * 24 * 60 + 190, outcome: 'pending', received: 0, skip: 58 }, // pending > 24 h
    { courseId: 'course-react-001', agoMin: 6 * 24 * 60 + 75, outcome: 'expired', received: 1000000, flagged: true, skip: 64 }, // expired while underpaid
    { courseId: 'course-js-001', agoMin: 9 * 24 * 60 + 400, outcome: 'paid', payDelay: 4, received: 600000, flagged: true, skip: 70 }, // overpaid
    { courseId: 'course-react-001', agoMin: 8, outcome: 'pending', received: 0, skip: 76 },                  // just created
  ];
  special.forEach((sp) => {
    const u = buyerWithout(sp.courseId, sp.skip);
    const c = courseById[sp.courseId];
    if (!u || !c) return;
    const created = NOW - sp.agoMin * MIN;
    if (created <= Date.parse(u.createdAt)) return;
    addDraft(u, [{ courseId: c.id, price: c.price }], created, { outcome: sp.outcome, payDelay: sp.payDelay, received: sp.received, flagged: sp.flagged, voucher: false });
    if (sp.outcome === 'paid') ownedBy(u.id).add(c.id);
  });

  // ---------- orders ----------
  drafts.sort((a, b) => a.created - b.created);
  const ADMIN = (db.users.find((u) => u.role === 'admin') || { id: null }).id;
  const vnd = (n) => new Intl.NumberFormat('vi-VN').format(n) + ' ₫';
  const newOrders = drafts.map((d, i) => {
    const code = 'CODI' + String(20001 + i);
    const discount = d.voucher ? d.voucher.discount : 0;
    const total = d.subtotal - discount;
    const created = d.created;
    const timeline = [{ at: iso(created), type: 'created', by: d.userId }];
    const o = {
      id: 'order-h' + String(i + 1).padStart(4, '0'), code, userId: d.userId, items: d.items,
      voucherCode: d.voucher ? d.voucher.code : null, discount, total, method: 'Chuyển khoản ngân hàng',
      status: 'pending', createdAt: iso(created), paidAt: null, content: code, timeline,
      received: d.received || 0, expiresAt: iso(created + PAY_WINDOW), failReason: null, cancelledAt: null, cancelReason: null,
      needsReconciliation: !!d.flagged, isBuyNow: d.isBuyNow, updatedAt: iso(created),
    };
    if (d.outcome === 'paid' || d.outcome === 'refunded') {
      const paid = created + Math.round(d.payDelay * MIN);
      const received = d.received || total;
      o.status = 'paid'; o.paidAt = iso(paid); o.received = received; o.updatedAt = o.paidAt;
      const late = paid - created > PAY_WINDOW;
      if (late) o.needsReconciliation = true;
      timeline.push({ at: o.paidAt, type: received > total ? 'overpaid' : late ? 'late_payment' : 'paid', by: null, note: received > total ? `Nhận ${vnd(received)}, thừa ${vnd(received - total)}` : undefined });
      if (d.outcome === 'refunded') {
        const refunded = Math.min(NOW - MIN, paid + d.refundAfter);
        o.status = 'refunded'; o.updatedAt = iso(refunded);
        timeline.push({ at: o.updatedAt, type: 'refunded', by: ADMIN, note: 'Hoàn tiền ngoài hệ thống theo yêu cầu của học viên' });
      }
    } else if (d.outcome === 'expired') {
      if (d.received) timeline.push({ at: iso(created + 12 * MIN), type: 'partial_payment', by: null, note: vnd(d.received) });
      o.status = 'failed'; o.failReason = 'expired'; o.updatedAt = o.expiresAt;
      timeline.push({ at: o.expiresAt, type: 'expired', by: null });
    } else if (d.outcome === 'cancelled') {
      const at = created + Math.round(between(2, 25)) * MIN;
      o.status = 'cancelled'; o.cancelledAt = iso(at); o.cancelReason = 'Người mua huỷ đơn'; o.updatedAt = o.cancelledAt;
      timeline.push({ at: o.cancelledAt, type: 'cancelled', by: d.userId });
    } else if (d.received) {
      timeline.push({ at: iso(Math.min(NOW - MIN, created + 9 * MIN)), type: 'partial_payment', by: null, note: vnd(d.received) });
    }
    timeline.forEach((t) => { if (t.note === undefined) delete t.note; });
    return o;
  });

  // ---------- enrolments, progress and study log ----------
  const newEnrolments = [];
  newOrders.filter((o) => o.status === 'paid').forEach((o) => o.items.forEach((it) => newEnrolments.push({ userId: o.userId, courseId: it.courseId, enrolledAt: Date.parse(o.paidAt), orderId: o.id })));
  freeEnrolments.forEach((e) => newEnrolments.push({ ...e, orderId: null }));
  newEnrolments.sort((a, b) => a.enrolledAt - b.enrolledAt);

  const engagementOf = Object.fromEntries(newUsers.map((u) => [u.id, u._seed.engagement]));
  const studyLog = {}; // userId -> { day: { m, ai?, err?, rl? } }
  const logDay = (uid, t, minutes) => {
    const days = (studyLog[uid] = studyLog[uid] || {});
    const k = dayKey(t);
    const cur = (days[k] = days[k] || { m: 0 });
    cur.m += minutes;
    return cur;
  };
  const lastActive = {};
  const newProgress = [];

  newEnrolments.forEach((e) => {
    const c = courseById[e.courseId];
    const lessons = lessonIds(c);
    const quizzes = quizLessons(c);
    const eng = engagementOf[e.userId] || 0.5;
    const diagnostic = !!c.entryTest && rnd() < 0.58;
    const row = { userId: e.userId, courseId: c.id, enrolledAt: iso(e.enrolledAt), status: 'active', completedAt: null, orderId: e.orderId, startMode: diagnostic ? 'diagnostic' : 'lesson1' };
    if (diagnostic) row.pathStatus = rnd() < 0.035 ? 'error' : 'ready';
    const progress = { userId: e.userId, courseId: c.id, completed: [], completedAt: {}, quizScores: {}, answers: {}, lastActive: row.enrolledAt };
    // Diagnostic starters may skip what they already know (path starts later in the course).
    let next = diagnostic && row.pathStatus === 'ready' && rnd() < 0.5 ? Math.min(lessons.length - 1, Math.floor(rnd() * 3)) : 0;
    const first = startOfDay(e.enrolledAt);
    for (let day = first, idx = 0; day < NOW; day += DAY, idx++) {
      const week = Math.floor(idx / 7);
      const done = next >= lessons.length;
      let p = idx === 0 ? 0.75 : eng * 0.45 * Math.pow(0.78, week) + 0.015;
      if (done) p *= 0.25;
      if (rnd() >= p) continue;
      const startAt = idx === 0 ? Math.max(e.enrolledAt + 5 * MIN, atLocalHour(day, 19)) : atLocalHour(day, between(18, 22));
      if (startAt >= NOW) break;
      const minutes = Math.round(between(10, 80));
      const cell = logDay(e.userId, startAt, minutes);
      // AI assistant use on that study day (tutor questions, hints): latency per request in ms.
      if (rnd() < 0.42) {
        const n = 1 + Math.floor(rnd() * 4);
        const recent = NOW - day < 9 * DAY;
        cell.ai = cell.ai || [];
        for (let q = 0; q < n; q++) cell.ai.push(Math.round(650 + rnd() * 850 + (rnd() < 0.08 ? 900 + rnd() * 1400 : 0) + (recent ? 180 : 0)));
        const err = Array.from({ length: n }).filter(() => rnd() < 0.012).length;
        if (err) cell.err = (cell.err || 0) + err;
        if (rnd() < 0.012) cell.rl = (cell.rl || 0) + 1;
      }
      lastActive[e.userId] = Math.max(lastActive[e.userId] || 0, startAt + minutes * MIN);
      progress.lastActive = iso(startAt + minutes * MIN);
      if (done) continue;
      const count = rnd() < 0.7 ? (rnd() < 0.3 ? 2 : 1) : 0; // some sessions end without finishing a lesson
      for (let k = 0; k < count && next < lessons.length; k++) {
        const id = lessons[next++];
        const at = Math.min(NOW - MIN, startAt + Math.round(minutes * (k + 1) / count) * MIN);
        progress.completed.push(id);
        progress.completedAt[id] = iso(at);
        if (quizzes.has(id)) progress.quizScores[id] = Math.round(between(45, 100) / 5) * 5;
      }
      if (next >= lessons.length) { row.status = 'completed'; row.completedAt = progress.completedAt[lessons[lessons.length - 1]]; }
    }
    e.row = row;
    newProgress.push(progress);
  });

  // Learners who signed up but never bought still open the platform a few times.
  newUsers.forEach((u) => {
    if (studyLog[u.id]) return;
    const created = Date.parse(u.createdAt);
    const visits = Math.floor(rnd() * 3);
    for (let k = 0; k < visits; k++) {
      const t = created + between(0, 10) * DAY;
      if (t < NOW) { logDay(u.id, t, Math.round(between(5, 20))); lastActive[u.id] = Math.max(lastActive[u.id] || 0, t); }
    }
  });

  // Existing learners: study days from their recorded lesson completions and last activity.
  db.learnerProgress.forEach((p) => {
    if (p.userId === (db.learnerSeed && db.learnerSeed.userId)) return; // the demo learner has learnerStudyDays
    Object.values(p.completedAt || {}).forEach((at) => logDay(p.userId, Date.parse(at), Math.round(between(15, 60))));
    if (p.lastActive) logDay(p.userId, Date.parse(p.lastActive), Math.round(between(10, 40)));
  });

  newUsers.forEach((u) => { if (lastActive[u.id]) u.lastActive = iso(lastActive[u.id]); delete u._seed; });

  // ---------- checkout clicks ----------
  const allOrders = db.orders.concat(newOrders);
  const checkoutEvents = [];
  allOrders.forEach((o) => {
    const created = Date.parse(o.createdAt);
    if (o.isBuyNow) checkoutEvents.push({ userId: o.userId, courseId: o.items[0].courseId, kind: 'buy_now', at: iso(created - Math.round(between(1, 3)) * MIN), orderId: o.id });
    else o.items.forEach((it) => checkoutEvents.push({ userId: o.userId, courseId: it.courseId, kind: 'cart', at: iso(created - Math.round(between(5, 240)) * MIN), orderId: o.id }));
  });
  // Abandoned add-to-cart / buy-now clicks from verified learners.
  db.users.concat(newUsers).filter((u) => u.role === 'learner' && u.emailVerified).forEach((u) => {
    const created = Date.parse(u.createdAt);
    const n = Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const t = created + between(0.02, 30) * DAY;
      const c = pick(paidCourses);
      if (t < NOW && availableFrom(c) <= t) checkoutEvents.push({ userId: u.id, courseId: c.id, kind: rnd() < 0.2 ? 'buy_now' : 'cart', at: iso(t), orderId: null });
    }
  });
  checkoutEvents.sort((a, b) => (a.at < b.at ? -1 : 1));

  // ---------- write ----------
  db.users.push(...newUsers);
  db.orders.push(...newOrders);
  db.enrolments.push(...newEnrolments.map((e) => e.row));
  db.learnerProgress.push(...newProgress);
  db.studyLog = (db.studyLog || []).concat(Object.entries(studyLog).map(([userId, days]) => ({ userId, days })));
  db.checkoutEvents = (db.checkoutEvents || []).concat(checkoutEvents);
});
