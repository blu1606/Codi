/**
 * Ownership-aware course CTAs and the catalog course card (real components/courses/catalog-course-card.tsx,
 * STATE-MACHINES §2 CTA mapping). Gated actions (add to cart, buy now, free enrol) run through Codi.requireAuth
 * so they complete after sign-in.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Icon, Thumb } from '../../components/ui/primitives';
import { addToCart, createBuyNowOrder, lecturerName, priceLabel } from './commerce-lib';

const fmt = Codi.fmt;

/** "Thêm vào giỏ": shows "Đang thêm…" briefly, then adds and toasts "Xem giỏ hàng". */
export function AddToCartButton({ course, className, label = true }) {
  const [busy, setBusy] = useState(false);
  const onClick = () => {
    Codi.requireAuth(() => {
      setBusy(true);
      setTimeout(() => { addToCart(course.id); setBusy(false); }, 400);
    }, { reason: 'Đăng nhập để thêm khoá học vào giỏ. Sau khi đăng nhập, khoá học sẽ được thêm tự động.', courseTitle: course.title });
  };
  return (
    <button type="button" className={className} onClick={onClick} disabled={busy} aria-busy={busy ? 'true' : undefined}
      aria-label={label ? `Thêm vào giỏ: ${course.title}` : undefined}>
      <Icon name="cart" />{busy ? ' Đang thêm…' : ' Thêm vào giỏ'}
    </button>
  );
}

/** "Mua ngay" (real lib/buy-now.ts, D4): single-course order straight to checkout; cart untouched. */
export function buyNow(course) {
  Codi.requireAuth(() => {
    if (Codi.role() !== 'learner') { Codi.ui.toast('Chỉ tài khoản học viên mới mua được khoá học.', { type: 'warn' }); return; }
    if (Codi.ownership(course.id) === 'owned') { Codi.ui.toast('Bạn đã sở hữu khóa học này.', { type: 'success' }); Codi.set(() => {}); return; }
    const o = createBuyNowOrder(course.id);
    if (o) Codi.go('/checkout?order=' + o.id);
    else Codi.ui.toast('Không thể xử lý mua ngay.', { type: 'danger' });
  }, { reason: 'Đăng nhập để mua khoá học.', courseTitle: course.title });
}

/** "Đăng ký miễn phí". */
export function enrollFree(course) {
  Codi.requireAuth(() => {
    if (Codi.role() !== 'learner') { Codi.ui.toast('Chỉ tài khoản học viên mới đăng ký được khoá học.', { type: 'warn' }); return; }
    Codi.set(() => Codi.enroll(course.id));
    Codi.ui.toast(`Đã đăng ký “${course.title}”.`, { type: 'success' });
    Codi.go('/learn/' + course.id + '/onboarding');
  }, { reason: 'Đăng nhập để đăng ký khoá học miễn phí.', courseTitle: course.title });
}

/** Card CTA (real catalog-course-card ownership branches). */
export function CourseCta({ course: c, block }) {
  const b = block ? ' btn-block' : '';
  const role = Codi.role();
  const own = Codi.ownership(c.id);
  if (own === 'owned') return <Link className={'btn btn-primary' + b} to={`/learn/${c.id}`}>Tiếp tục học</Link>;
  if (role === 'lecturer' || role === 'admin') return <Link className={'btn btn-secondary' + b} to={`/courses/${c.slug}`}>Xem chi tiết</Link>;
  if (own === 'pending-payment') {
    const o = Codi.pendingOrderFor(c.id);
    return <Link className={'btn btn-secondary' + b} to={`/checkout?order=${o.id}`}><Icon name="clock" /> Chờ thanh toán</Link>;
  }
  if (own === 'in-cart') return <Link className={'btn btn-secondary' + b} to="/cart"><Icon name="check" /> Đã trong giỏ hàng · Xem giỏ</Link>;
  if (c.price === 0) return <button type="button" className={'btn btn-primary' + b} onClick={() => enrollFree(c)} aria-label={`Đăng ký miễn phí: ${c.title}`}>Đăng ký miễn phí</button>;
  return <AddToCartButton course={c} className={'btn btn-primary' + b} />;
}

export function CourseCard({ course: c }) {
  const own = Codi.isEnrolled(c.id);
  return (
    <article className="card cm-card">
      <Link className="cm-card-media" to={`/courses/${c.slug}`} tabIndex={-1} aria-hidden="true"><Thumb course={c} /></Link>
      <div className="card-body compact cm-card-body">
        <h3 className="cm-card-title"><Link to={`/courses/${c.slug}`}>{c.title}</Link></h3>
        <p className="small muted od-truncate">{lecturerName(c)}</p>
        <p className="cm-card-meta">
          <span className="badge badge-neutral">{Codi.levelLabel(c.level)}</span>
          {c.rating > 0
            ? <span className="od-nowrap"><Icon name="star-filled" className="icon-sm cm-star" /> <span className="strong cm-fg">{c.rating.toFixed(1)}</span> ({fmt.num(c.ratingCount || 0)})</span>
            : <span>Chưa có đánh giá</span>}
          <span className="od-nowrap"><Icon name="clock" className="icon-sm" /> {fmt.duration(c.durationMin)}</span>
        </p>
        {(own || Codi.cart().includes(c.id)) && (
          <div className="row" style={{ gap: 6 }}>
            {own ? <span className="badge badge-success"><Icon name="check" />Đã sở hữu</span> : <span className="badge badge-accent">Trong giỏ</span>}
          </div>
        )}
        <div className="cm-card-foot cm-card-buy">
          <span className="price">{priceLabel(c)}</span>
          <CourseCta course={c} />
        </div>
      </div>
    </article>
  );
}
