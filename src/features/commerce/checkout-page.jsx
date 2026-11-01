/**
 * S06 Checkout '/checkout?order=…' (real app/checkout/page.tsx, VietQR bank transfer) and S07 success
 * '/checkout/success?order=…' (real app/checkout/success/page.tsx).
 * States: creating, create error / payments unavailable / order not found (with support line), awaiting payment
 * (QR + countdown + copy rows + tracker + live status line), qr-failed (text fallback), manual check (30 s cooldown,
 * inline result, D5), underpaid, slow notice, expired (incl. late payment honoured afterwards), failed, paid,
 * cancelled, refunded.
 *
 * Payment is simulated in-browser: scenario.paymentOutcome picks the transfer that "arrives" and the pure
 * applyTransfer rules in commerce-lib decide what it does. Outcomes: success | slow | expired | underpaid | qrfail,
 * plus late | overpaid | unavailable when the scenario switcher offers them.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Empty, Icon, Stepper, Thumb, orderStatusLabel } from '../../components/ui/primitives';
import {
  SUPPORT_EMAIL, amountDue, cancelOrder, createOrderFromCart, expireOrder, findMyOrder, isExpiredPending, mmss,
  newCodeFor, receiveTransfer, timeLeft,
} from './commerce-lib';

const fmt = Codi.fmt;
const clock = (ms) => new Date(ms).toLocaleTimeString('vi-VN');
const Mail = () => <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
const TRANSFER_AFTER_MS = 6000;
const SLOW_NOTICE_MS = 15000;
const LATE_TRANSFER_MS = 8000;
const OVERPAY_EXTRA = 50000;

// ───────────────────────── payment simulation ─────────────────────────
// One running simulation for the order on screen: { orderId, start, checkedAt, slowShown, manualCheckCooldown,
// manualChecking, manualCheckedAt, transferred }. Leaving the page stops it; the order stays pending.
let sim = null;

/** A transfer that "arrives" after expiry (scenario 'late'): the webhook rules decide whether it is honoured. */
function scheduleLateTransfer(orderId) {
  setTimeout(() => {
    const o = Codi.db().orders.find((x) => x.id === orderId);
    if (!o || o.status !== 'failed') return;
    receiveTransfer(orderId, amountDue(o), o.code);
    Codi.set(() => {});
  }, LATE_TRANSFER_MS);
}

function settle(o, amount) {
  const kind = receiveTransfer(o.id, amount, o.code);
  if (kind === 'paid' || kind === 'late_paid') { sim = null; Codi.go('/checkout/success?order=' + o.id); return; }
  Codi.set(() => {});
}

function tickSim(orderId) {
  const s = sim;
  if (!s || s.orderId !== orderId) return;
  const o = Codi.db().orders.find((x) => x.id === orderId);
  if (!o || o.status !== 'pending') { sim = null; return; }
  if (timeLeft(o) <= 0) { sim = null; Codi.set(() => expireOrder(o)); return; } // 30 minute expiry
  if (Date.now() - s.checkedAt >= 3000) s.checkedAt = Date.now(); // auto-check every 3 seconds
  if (s.manualCheckCooldown > 0) s.manualCheckCooldown -= 1;
  const elapsed = Date.now() - s.start;
  if (elapsed >= SLOW_NOTICE_MS) s.slowShown = true;
  const outcome = Codi.state.scenario.paymentOutcome;
  // The QR image fails to load right away (real: <img onError>); "Tải lại mã QR" clears it for this visit.
  if (outcome === 'qrfail' && !s.qrTried) { s.qrTried = true; if (!o.qrFailed) Codi.set(() => { o.qrFailed = true; }); }
  if (elapsed < TRANSFER_AFTER_MS || s.transferred) return;
  if (outcome === 'success') { s.transferred = true; settle(o, amountDue(o)); }
  else if (outcome === 'overpaid') { s.transferred = true; settle(o, amountDue(o) + OVERPAY_EXTRA); }
  else if (outcome === 'underpaid') { s.transferred = true; if (!o.received) settle(o, Math.round(amountDue(o) * 0.5)); }
  else if (outcome === 'expired') { sim = null; Codi.set(() => expireOrder(o)); }
  else if (outcome === 'late') { sim = null; Codi.set(() => expireOrder(o)); scheduleLateTransfer(o.id); }
  // 'qrfail', 'slow' and anything else: no transfer arrives; auto-check keeps running until expiry.
}

// Deterministic QR-like pattern drawn from the transfer content (a designed placeholder, not a scannable code).
function QrSvg({ seedText }) {
  const n = 25; let h = 0;
  for (const ch of seedText) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  const finder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  const cells = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!finder(x, y) && rnd() > 0.52) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
  const fp = (x, y) => (
    <g key={`fp-${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" /><rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" /><rect x={x + 2} y={y + 2} width="3" height="3" />
    </g>
  );
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} className="cm-qr" role="img" aria-label={`Mã VietQR (minh hoạ) cho nội dung ${seedText}`} shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
      <g fill="#111827">{cells}{fp(0, 0)}{fp(n - 7, 0)}{fp(0, n - 7)}</g>
    </svg>
  );
}

function CopyRow({ label, value, copyValue, emphasis }) {
  return (
    <div className={`copy-row ${emphasis ? 'is-emphasis' : ''}`}>
      <div className="copy-main"><span className="copy-label">{label}</span><span className="copy-value">{value}</span></div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => Codi.ui.copy(copyValue, e.currentTarget)} aria-label={`Sao chép ${label}`}>
        <Icon name="copy" className="icon-sm" /><span data-copy-label>Sao chép</span>
      </button>
    </div>
  );
}

function OrderSummary({ order }) {
  const subtotal = order.items.reduce((n, i) => n + i.price, 0);
  return (
    <div className="card"><div className="card-body stack-3">
      <h2 className="h-card">Thông tin đơn hàng</h2>
      <ul className="list">{order.items.map((i) => {
        const c = Codi.course(i.courseId);
        return (
          <li key={i.courseId} className="list-row" style={{ paddingInline: 0 }}>
            <span className="list-main"><span>{c ? c.title : i.courseId}</span><span className="xsmall muted">Khóa học</span></span>
            <span className="price od-nowrap">{fmt.vnd(i.price)}</span>
          </li>
        );
      })}</ul>
      <dl className="cm-sum">
        <div><dt>Tạm tính</dt><dd>{fmt.vnd(subtotal)}</dd></div>
        {order.discount > 0 && <div><dt>Giảm giá {order.voucherCode ? `(${order.voucherCode})` : ''}</dt><dd className="text-success">−{fmt.vnd(order.discount)}</dd></div>}
        <div className="cm-sum-total"><dt>Tổng thanh toán</dt><dd>{fmt.vnd(order.total)}</dd></div>
      </dl>
      <p className="xsmall muted">Mã giao dịch (để đối soát): <span className="mono">{order.code}</span></p>
    </div></div>
  );
}

/** Creation / unavailable / not-found states share one layout with the support line (real error branch). */
function CheckoutError({ type, message, orderParam }) {
  const title = type === 'unavailable' ? 'Thanh toán tạm thời không khả dụng' : type === 'create' ? 'Lỗi tạo đơn hàng' : 'Không tìm thấy đơn hàng';
  return (
    <div className="page page-narrow"><div className="card">
      <Empty icon="receipt" title={title}
        body={<span className="stack-2" style={{ display: 'grid' }}>
          <span>{message || 'Đơn hàng không tồn tại hoặc không thuộc tài khoản của bạn.'}</span>
          {orderParam && <span className="xsmall">Mã đơn: <span className="mono strong">{orderParam}</span></span>}
          <span className="xsmall muted">Cần hỗ trợ? Email <Mail />{orderParam ? ` kèm mã giao dịch ${orderParam}` : ''}.</span>
        </span>}
        actions={<><Link className="btn btn-primary" to="/cart">Về giỏ hàng</Link><Link className="btn btn-secondary" to="/courses">Xem khoá học</Link></>} />
    </div></div>
  );
}

/** Entry without an order: resume the pending order (real 409 PENDING_ORDER_EXISTS path) or create one. */
function CreatingOrder() {
  const navigate = useNavigate();
  const ran = useRef(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const r = createOrderFromCart();
    if (r.order) navigate('/checkout?order=' + r.order.id, { replace: true });
    else if (r.code === 'PENDING_ORDER_EXISTS') navigate('/checkout?order=' + r.pending.id, { replace: true });
    else setErr({ type: r.code === 'UNAVAILABLE' ? 'unavailable' : 'create', message: r.error });
  }, [navigate]);
  if (err) return <CheckoutError {...err} />;
  return (
    <div className="page page-narrow stack-4" aria-busy="true">
      <div className="skeleton skeleton-line" style={{ width: '40%', height: 28 }} />
      <div className="skeleton" style={{ height: 220 }} />
      <p className="sr-only" role="status">Đang tạo đơn hàng…</p>
    </div>
  );
}

async function cancelCheckout(order) {
  const r = await Codi.ui.confirm({
    title: 'Huỷ giao dịch này?',
    consequence: `Đơn ${order.code} sẽ bị huỷ và mã thanh toán không dùng được nữa. Các khoá học quay lại giỏ hàng. Nếu bạn đã chuyển khoản, đừng huỷ — hãy chờ hoặc liên hệ ${SUPPORT_EMAIL}.`,
    reversible: 'Bạn có thể tạo đơn mới từ giỏ hàng bất cứ lúc nào.', confirmLabel: 'Huỷ giao dịch', cancelLabel: 'Giữ đơn hàng', danger: true,
  });
  if (!r.ok) return;
  let ok = false;
  Codi.set(() => { ok = cancelOrder(order); }, { render: false });
  if (!ok) { Codi.ui.toast('Đơn hàng không tồn tại, đã hoàn tất thanh toán hoặc đã được huỷ trước đó.', { type: 'danger' }); Codi.set(() => {}); return; }
  sim = null;
  Codi.ui.toast('Đã huỷ giao dịch. Khoá học đã quay lại giỏ hàng.', { type: 'success' });
  Codi.go('/cart');
}

/** Awaiting payment: QR + countdown, copy rows, tracker, live status line, manual check, cancel. */
function PendingCheckout({ order }) {
  const [, setTick] = useState(0);
  const rerender = () => setTick((n) => n + 1);
  useEffect(() => {
    if (!sim || sim.orderId !== order.id) {
      sim = { orderId: order.id, start: Date.now(), checkedAt: Date.now(), slowShown: false, manualCheckCooldown: 0, manualChecking: false, manualCheckedAt: null, transferred: false };
    }
    const t = setInterval(() => { tickSim(order.id); rerender(); }, 1000);
    return () => { clearInterval(t); if (sim && sim.orderId === order.id) sim = null; };
  }, [order.id]);

  const s = sim && sim.orderId === order.id ? sim : null;
  const bank = Codi.db().bankInfo || {};
  const left = timeLeft(order);
  const slow = !!(s && s.slowShown);
  const qrFailed = !!order.qrFailed;
  const due = amountDue(order);
  const underpaid = order.received > 0 && order.received < order.total;
  const cooldown = s ? s.manualCheckCooldown : 0;
  const checking = !!(s && s.manualChecking);

  // "Tôi đã chuyển khoản" (D5): 30 s cooldown, one extra check, result shown inline; auto-check keeps running.
  const iPaid = () => {
    const cur = sim;
    if (!cur || cur.orderId !== order.id || cur.manualCheckCooldown > 0 || cur.manualChecking) return;
    cur.manualCheckCooldown = 30; cur.manualChecking = true;
    rerender();
    setTimeout(() => {
      if (sim !== cur) return;
      cur.manualChecking = false; cur.manualCheckedAt = Date.now(); cur.checkedAt = Date.now();
      rerender();
    }, 1200);
  };
  const reloadQr = () => Codi.set(() => { order.qrFailed = false; });

  return (
    <div className="page stack-4">
      <div className="stack-1"><h1>Thanh toán khóa học</h1><p className="muted">Quét mã bằng ứng dụng ngân hàng, hoặc chuyển khoản theo thông tin bên dưới.</p></div>
      <Stepper steps={['Đã tạo đơn', 'Đang chờ thanh toán', 'Đã nhận tiền']} current={1} />
      {underpaid && (
        <Alert type="warn" title={`Đã nhận ${fmt.vnd(order.received)} / cần ${fmt.vnd(order.total)}`}>
          Hãy chuyển thêm <strong>{fmt.vnd(due)}</strong> với cùng nội dung <span className="mono strong">{order.code}</span>. Cần hỗ trợ? Email <Mail /> kèm mã giao dịch.
        </Alert>
      )}
      <div className="layout-aside">
        <div className="stack-4">
          <div className="card"><div className="card-body stack-4">
            <div className="row-between">
              <h2 className="h-card">{qrFailed ? 'Chuyển khoản thủ công' : 'Quét mã thanh toán'}</h2>
              <span className="badge badge-warn od-nowrap"><Icon name="clock" />Hết hạn sau <span data-countdown aria-live="off">{mmss(left)}</span></span>
            </div>
            <p className="xsmall muted">Sau thời gian này mã QR và nội dung chuyển khoản sẽ không còn hiệu lực.</p>
            {qrFailed ? (
              <Alert type="danger" title="Không tải được mã QR"
                actions={<button type="button" className="btn btn-secondary btn-sm" onClick={reloadQr}><Icon name="refresh" className="icon-sm" /> Tải lại mã QR</button>}>
                Hãy chuyển khoản thủ công bằng thông tin bên dưới, nội dung <span className="mono strong">{order.code}</span>. Cần hỗ trợ? Email <Mail />.
              </Alert>
            ) : (
              <div className="cm-qr-wrap"><QrSvg seedText={order.code} /><span className="xsmall muted">VietQR · {bank.bank} · minh hoạ trong bản thử nghiệm</span></div>
            )}
            <div>
              <CopyRow label="Ngân hàng" value={bank.bank} copyValue={bank.bank} />
              <CopyRow label="Số tài khoản" value={bank.accountNumber} copyValue={bank.accountNumber} />
              <CopyRow label="Chủ tài khoản" value={bank.accountName} copyValue={bank.accountName} />
              <CopyRow label="Số tiền" value={fmt.vnd(due)} copyValue={String(due)} />
              <CopyRow label="Nội dung chuyển khoản" value={order.code} copyValue={order.code} emphasis />
            </div>
            <Alert type="warn" title="Nhập chính xác nội dung chuyển khoản">
              Nội dung phải là <strong className="mono">{order.code}</strong>. Sai nội dung thì hệ thống không tự xác nhận được.
            </Alert>
          </div></div>
        </div>
        <aside className="stack-4">
          <OrderSummary order={order} />
          <div className="card"><div className="card-body stack-3">
            <p className="small muted cm-poll" role="status"><Icon name="loader" className="icon-sm cm-spin" /> <span>Đang kiểm tra thanh toán… <span className="xsmall" style={{ color: 'var(--fg)' }}>(lần gần nhất {clock(s ? s.checkedAt : Date.now())})</span></span></p>
            <p className="xsmall muted">Thường mất vài giây đến vài phút sau khi bạn chuyển. Bạn có thể rời trang — đơn hàng vẫn được lưu trong Giỏ hàng và Hồ sơ › Giao dịch.</p>
            <button type="button" className="btn btn-secondary btn-block" onClick={iPaid} disabled={checking || cooldown > 0} aria-busy={checking ? 'true' : undefined}>
              {checking && <Icon name="loader" className="icon-sm cm-spin" />}
              {cooldown > 0 ? `Tôi đã chuyển khoản (${cooldown}s)` : 'Tôi đã chuyển khoản'}
            </button>
            {s && s.manualCheckedAt && !checking && (
              <Alert type="info" title={`Đã kiểm tra lúc ${clock(s.manualCheckedAt)}: Codi chưa nhận được tiền`}>
                <ol className="stack-1 xsmall cm-steps-list">
                  <li>Một số ngân hàng xử lý chậm — Codi vẫn tự kiểm tra tới khi mã hết hạn.</li>
                  <li>Sau đó kế toán đối soát thủ công theo nội dung <span className="mono strong">{order.code}</span>, thường trong 2 giờ làm việc.</li>
                  <li>Khi xác nhận xong, khoá học mở ngay và bạn nhận được thông báo. Cần hỗ trợ: <Mail />.</li>
                </ol>
              </Alert>
            )}
            {(slow || qrFailed) && <p className="xsmall muted">Cần hỗ trợ? Email <Mail /> kèm mã giao dịch <span className="mono strong">{order.code}</span>.</p>}
            <button type="button" className="btn btn-ghost btn-block" onClick={() => cancelCheckout(order)}>Hủy giao dịch</button>
          </div></div>
        </aside>
      </div>
    </div>
  );
}

function FailedCheckout({ order, summary }) {
  const [busy, setBusy] = useState(false);
  const newCode = () => {
    if (busy) return;
    setBusy(true);
    setTimeout(() => {
      const o = newCodeFor(order);
      Codi.ui.toast(`Đã tạo mã thanh toán mới ${o.code}.`, { type: 'success' });
      Codi.go('/checkout?order=' + o.id);
    }, 400);
  };
  return (
    <div className="page page-narrow stack-4"><h1>Thanh toán khóa học</h1>
      <Alert type="danger" title={order.failReason === 'expired' ? 'Mã thanh toán đã hết hạn' : 'Thanh toán không thành công'}
        actions={<>
          <button type="button" className="btn btn-primary btn-sm" onClick={newCode} disabled={busy} aria-busy={busy ? 'true' : undefined}><Icon name={busy ? 'loader' : 'refresh'} className={`icon-sm ${busy ? 'cm-spin' : ''}`} /> Tạo mã mới</button>
          <Link className="btn btn-secondary btn-sm" to="/cart">Về giỏ hàng</Link>
        </>}>
        <span className="stack-2" style={{ display: 'grid' }}>
          <span>Nếu bạn đã chuyển khoản sau thời điểm hết hạn, Codi sẽ đối soát thủ công và liên hệ qua email. Bạn có thể tạo mã mới để thanh toán lại.</span>
          <span className="xsmall">Cần hỗ trợ? Email <Mail /> kèm mã giao dịch <span className="mono strong">{order.code}</span>.</span>
        </span>
      </Alert>
      {summary}
    </div>
  );
}

export function CheckoutPage({ query: q }) {
  useCodi();
  const order = q.order ? findMyOrder(q.order) : null;
  const lazyExpired = !!order && isExpiredPending(order);
  // Expiry is lazy, like the real GET /api/orders/[id]: a pending order past its deadline becomes failed on view.
  useEffect(() => { if (lazyExpired) Codi.set(() => expireOrder(order)); }, [lazyExpired]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!q.order) return <CreatingOrder />;
  if (!order) return <CheckoutError type="notfound" orderParam={q.order} />;
  const summary = <OrderSummary order={order} />;
  if (order.status === 'paid') {
    return (
      <div className="page page-narrow stack-4"><h1>Thanh toán khóa học</h1>
        <Alert type="success" title="Đơn hàng đã được thanh toán" body={`Codi đã nhận đủ tiền lúc ${fmt.datetime(order.paidAt)}.`}
          actions={<Link className="btn btn-primary btn-sm" to={`/checkout/success?order=${order.id}`}>Xem kết quả và bắt đầu học</Link>} />
        {summary}
      </div>
    );
  }
  if (order.status === 'cancelled') {
    return (
      <div className="page page-narrow stack-4"><h1>Thanh toán khóa học</h1>
        <Alert type="info" title="Đơn hàng đã huỷ" actions={<Link className="btn btn-primary btn-sm" to="/cart">Về giỏ hàng</Link>}>
          <span className="stack-1" style={{ display: 'grid' }}>
            <span>Các khoá học đã được đưa lại vào giỏ hàng của bạn.</span>
            <span className="xsmall">Mã giao dịch: <span className="mono strong">{order.code}</span> · Cần hỗ trợ? Email <Mail />.</span>
          </span>
        </Alert>
        {summary}
      </div>
    );
  }
  if (order.status === 'refunded') {
    return <div className="page page-narrow stack-4"><h1>Thanh toán khóa học</h1><Alert type="info" title={orderStatusLabel(order.status)} />{summary}</div>;
  }
  if (order.status === 'failed') return <FailedCheckout order={order} summary={summary} />;
  if (lazyExpired) return <div className="page page-narrow" aria-busy="true"><p className="sr-only" role="status">Đang tải thông tin thanh toán…</p></div>;
  return <PendingCheckout key={order.id} order={order} />;
}

/** S07 Payment success — primary "Bắt đầu học" → onboarding; no forced redirect (G3). */
export function CheckoutSuccessPage({ query: q }) {
  useCodi();
  const order = findMyOrder(q.order);
  const courses = order ? order.items.map((i) => Codi.course(i.courseId)).filter(Boolean) : [];
  if (!order || order.status !== 'paid' || !courses.length) {
    return (
      <div className="page page-narrow"><div className="card">
        <Empty icon="receipt" title="Chưa có xác nhận thanh toán cho đơn này" body="Đơn hàng chưa hoàn tất thanh toán hoặc không tồn tại."
          actions={<Link className="btn btn-primary" to="/profile?tab=transactions">Xem giao dịch</Link>} />
      </div></div>
    );
  }
  return (
    <div className="page page-narrow stack-6">
      <div className="stack-2" style={{ textAlign: 'center' }}>
        <span className="cm-success-icon"><Icon name="check" /></span>
        <h1>Thanh toán thành công!</h1>
        <p className="muted">Đơn <span className="mono strong">{order.code}</span> · {fmt.vnd(order.total)} · {fmt.datetime(order.paidAt)}</p>
      </div>
      <div className="card"><div className="card-body stack-3"><h2 className="h-card">Bạn đã sở hữu khóa học</h2>
        <ul className="list">{courses.map((c) => (
          <li key={c.id} className="list-row" style={{ paddingInline: 0 }}>
            <Thumb course={c} small />
            <span className="list-main"><strong>{c.title}</strong><span className="small muted">Khóa học tại Codi</span></span>
            {courses.length > 1 && <Link className="btn btn-secondary btn-sm" to={`/learn/${c.id}/onboarding`}>Bắt đầu</Link>}
          </li>
        ))}</ul>
      </div></div>
      <div className="stack-2">
        <Link className="btn btn-primary btn-lg btn-block" to={`/learn/${courses[0].id}/onboarding`}>Bắt đầu học</Link>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-ghost" to="/dashboard">Về bàn làm việc</Link>
          <Link className="btn btn-ghost" to="/profile?tab=transactions">Xem biên lai trong Giao dịch</Link>
        </div>
      </div>
    </div>
  );
}
