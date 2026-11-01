/**
 * S02 Course detail '/courses/:slug' — two-column layout, sticky purchase card with ownership states,
 * curriculum accordion with typed lesson rows, requirements, lecturer, rating summary and reviews.
 */
import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Avatar, Empty, Icon, Progress, Stars, Thumb } from '../../components/ui/primitives';
import { TYPE_ICON, TYPE_LABEL, priceLabel } from './commerce-lib';
import { AddToCartButton, buyNow, enrollFree } from './course-card';

const fmt = Codi.fmt;

const ROLE_VIEW = { lecturer: 'giảng viên', admin: 'quản trị viên' };

/** Purchase card (real course-detail-view sidebar): "Mua ngay" primary + "Thêm vào giỏ" secondary (decision 42). */
function PurchaseCard({ course: c }) {
  const role = Codi.role();
  const own = Codi.ownership(c.id);
  const lessons = Codi.lessons(c);
  let cta;
  if (role === 'lecturer' || role === 'admin') {
    cta = <p className="small muted">Bạn đang xem với vai trò {ROLE_VIEW[role]}. Chỉ tài khoản học viên mới mua được khoá học.</p>;
  } else if (own === 'owned') {
    const p = Codi.courseProgress(c.id);
    cta = (<>
      <div className="stack-2"><div className="row-between small"><span>Tiến độ của bạn</span><strong>{p.done}/{p.total} bài</strong></div><Progress pct={p.pct} /></div>
      <Link className="btn btn-primary btn-block btn-lg" to={`/learn/${c.id}`}>Tiếp tục học</Link>
    </>);
  } else if (own === 'pending-payment') {
    const o = Codi.pendingOrderFor(c.id);
    cta = (<>
      <Alert type="warn" title="Đơn hàng đang chờ thanh toán." body={`Mã đơn: ${o.code}`} />
      <Link className="btn btn-primary btn-block btn-lg" to={`/checkout?order=${o.id}`}>Tiếp tục thanh toán</Link>
    </>);
  } else if (own === 'in-cart') {
    cta = (<>
      <p className="cm-pill" role="status"><Icon name="check" className="icon-sm" /> Đã trong giỏ hàng</p>
      <Link className="btn btn-primary btn-block btn-lg" to="/cart">Thanh toán</Link>
      <button type="button" className="btn btn-secondary btn-block" onClick={() => buyNow(c)}>Mua ngay</button>
    </>);
  } else if (c.price === 0) {
    cta = (<>
      <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => enrollFree(c)}>Đăng ký miễn phí</button>
      <p className="xsmall muted">Khoá miễn phí: vào học ngay, không cần thanh toán.</p>
    </>);
  } else {
    cta = (<>
      <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => buyNow(c)}>Mua ngay</button>
      <AddToCartButton course={c} className="btn btn-secondary btn-block" />
    </>);
  }
  return (
    <div className="card cm-card">
      <div className="cm-card-media" aria-hidden="true"><Thumb course={c} /></div>
      <div className="card-body stack-4">
      <h2 className="h-card">Đăng ký khóa học</h2>
      <div className="stack-1"><span className="small muted">Học phí khóa học</span><span className="price cm-price-lg">{priceLabel(c)}</span></div>
      {cta}
      <dl className="cm-facts">
        <div><dt>Trình độ</dt><dd>{Codi.levelLabel(c.level)}</dd></div>
        <div><dt>Số chương</dt><dd>{c.chapters.length}</dd></div>
        <div><dt>Số bài học</dt><dd>{lessons.length}</dd></div>
        <div><dt>Thời lượng</dt><dd>{fmt.duration(c.durationMin)}</dd></div>
      </dl>
      <Link className="small cm-ask" to={`/ai?prompt=${encodeURIComponent('Khoá "' + c.title + '" có phù hợp với tôi không?')}`}><Icon name="sparkles" className="icon-sm" /> Hỏi trợ lý AI Codi</Link>
    </div></div>
  );
}

/** Load failure (real: "Chưa thể tải khoá học" + "Thử lại"; no retry on 404). Simulated with `?error=1`. */
function DetailError({ notFound, onRetry }) {
  return (
    <div className="page page-narrow"><div className="card">
      <Empty icon="book-open" title={notFound ? 'Không tìm thấy khoá học' : 'Chưa thể tải khoá học'}
        body={<span role="alert">{notFound ? 'Không tìm thấy khóa học.' : 'Không thể tải khóa học. Vui lòng thử lại.'}</span>}
        actions={<>
          {!notFound && <button type="button" className="btn btn-primary" onClick={onRetry}><Icon name="refresh" className="icon-sm" /> Thử lại</button>}
          <Link className="btn btn-secondary" to="/courses">Xem danh sách khoá học</Link>
        </>} />
    </div></div>
  );
}

export default function CourseDetailPage({ params, query = {} }) {
  useCodi();
  const navigate = useNavigate();
  const curRef = useRef(null);
  const c = Codi.course(params.slug);
  if (!c) return <DetailError notFound />;
  if (query.error === '1') return <DetailError onRetry={() => navigate(`/courses/${c.slug}`, { replace: true })} />;
  const enrolled = Codi.isEnrolled(c.id);
  if (c.status !== 'published' && !enrolled) {
    return <div className="page page-narrow"><Empty icon="eye-off" title="Khoá học tạm ngừng bán" body="Khoá học này hiện không mở bán cho học viên mới." actions={<Link className="btn btn-primary" to="/courses">Khám phá khoá học khác</Link>} /></div>;
  }
  // Real lib/course-review-service.ts: visible reviews from enrolled learners, newest first, at most 50.
  const reviews = Codi.db().reviews
    .filter((r) => r.courseId === c.id && r.isVisible !== false && Codi.isEnrolled(c.id, r.userId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 50);
  const lec = Codi.user(c.lecturerId);
  const breakdown = c.ratingBreakdown || [0, 0, 0, 0, 0];
  const totalBreak = breakdown.reduce((s, n) => s + n, 0) || 1;
  const outcomes = c.outcomes || [];
  const requirements = c.requirements || [];
  const expand = (open) => { if (curRef.current) curRef.current.querySelectorAll('details').forEach((d) => { d.open = open; }); };

  return (
    <div className="page">
      <nav className="small muted cm-crumb" aria-label="Breadcrumb"><Link to="/courses">Khoá học</Link> / <span>{Codi.category(c.categoryId).name}</span> / <span aria-current="page">{c.title}</span></nav>
      {c.status === 'hidden' && enrolled && <Alert type="info" title="Khoá học đang tạm ẩn với người mua mới" body="Bạn đã sở hữu khoá học nên vẫn học bình thường." />}
      <div className="cm-detail">
        <header className="stack-3 cm-detail-head">
            <h1>{c.title}</h1>
            <p className="cm-lede muted">{c.summary || 'Giảng viên đang cập nhật mô tả.'}</p>
            <ul className="cm-stats">
              <li><Icon name="bar-chart" className="icon-sm" /> {Codi.levelLabel(c.level)}</li>
              <li><Icon name="clock" className="icon-sm" /> {fmt.duration(c.durationMin)}</li>
              <li><Icon name="star-filled" className="icon-sm cm-star" /> {c.ratingCount ? `${c.rating.toFixed(1)} (${fmt.num(c.ratingCount)} đánh giá)` : 'Chưa có đánh giá'}</li>
              <li><Icon name="users" className="icon-sm" /> {fmt.num(c.learnersCount)} học viên</li>
              <li><Icon name="user" className="icon-sm" /> {lec ? lec.name : ''}</li>
            </ul>
        </header>
        <aside className="cm-detail-aside" aria-label="Đăng ký khóa học"><PurchaseCard course={c} /></aside>
        <div className="stack-6 cm-detail-main">
          <section className="stack-3"><h2>01 · Bạn sẽ học được gì?</h2>
            {outcomes.length
              ? <ul className="cm-outcomes">{outcomes.map((o, i) => <li key={i}><Icon name="check" className="icon-sm text-success" /><span>{o}</span></li>)}</ul>
              : <p className="muted">Giảng viên đang cập nhật mục tiêu khoá học.</p>}
          </section>
          <section className="stack-3">
            <div className="row-between"><h2>02 · Nội dung khóa học</h2>
              {c.chapters.length > 0 && (
                <div className="row">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => expand(true)}>Mở rộng tất cả</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => expand(false)}>Thu gọn tất cả</button>
                </div>
              )}
            </div>
            {c.chapters.length ? (<>
              <p className="small muted">{c.chapters.length} chương · {Codi.lessons(c).length} bài học · {fmt.duration(c.durationMin)}</p>
              <div className="cm-curriculum" ref={curRef}>{c.chapters.map((ch, i) => (
                <details key={ch.id || i} className="cm-chapter" open={i === 0 ? true : undefined}>
                  <summary><span className="strong">Chương {i + 1}: {ch.title}</span><span className="small muted od-nowrap">{ch.lessons.length} bài · {fmt.duration(ch.lessons.reduce((s, l) => s + l.durationMin, 0))}</span></summary>
                  <ul className="list">{ch.lessons.map((l) => (
                    <li key={l.id} className="list-row">
                      <Icon name={TYPE_ICON[l.type] || 'file-text'} className="icon-sm" />
                      <span className="list-main"><span>{l.title}</span><span className="xsmall muted">{TYPE_LABEL[l.type] || l.type}{l.quiz ? ' · Quiz' : ''}{l.assignment ? ' · Bài tập' : ''}</span></span>
                      <span className="small muted od-nowrap">{fmt.duration(l.durationMin)}</span>
                    </li>
                  ))}</ul>
                </details>
              ))}</div>
            </>) : <Alert type="info" title="Nội dung học đang được chuẩn bị" body="Giảng viên sẽ sớm cập nhật đề cương." />}
          </section>
          <section className="stack-3"><h2>03 · Yêu cầu trước khi học</h2>
            {requirements.length ? <ul>{requirements.map((r, i) => <li key={i}>{r}</li>)}</ul> : <p className="muted">Không có yêu cầu đặc biệt.</p>}
          </section>
          <section className="stack-3"><h2>04 · Giảng viên</h2>
            <div className="card"><div className="card-body compact row"><Avatar user={lec} size="lg" /><div className="stack-1"><strong>{lec ? lec.name : ''}</strong><span className="small muted">Giảng viên tại Codi</span></div></div></div>
          </section>
          <section className="stack-3" id="reviews" aria-labelledby="reviews-heading"><h2 id="reviews-heading">Đánh giá của học viên</h2>
            {(reviews.length > 0 || c.ratingCount > 0) ? (<>
              <div className="cm-rating card"><div className="card-body compact cm-rating-inner">
                <div className="od-stat" style={{ textAlign: 'center' }}><span className="cm-rating-num">{c.rating.toFixed(1)}</span><Stars n={c.rating} /><span className="small muted">{fmt.num(c.ratingCount)} đánh giá</span></div>
                <div className="stack-1 od-fill">{[5, 4, 3, 2, 1].map((s, i) => (
                  <div key={s} className="row small" style={{ gap: 8 }}>
                    <span className="od-nowrap" style={{ width: 40 }}>{s} sao</span>
                    <div className="progress od-fill" aria-hidden="true"><span style={{ width: `${Math.round(((breakdown[i] || 0) / totalBreak) * 100)}%` }} /></div>
                    <span className="muted" style={{ width: 36, textAlign: 'right' }}>{breakdown[i] || 0}</span>
                  </div>
                ))}</div>
              </div></div>
            {reviews.length ? (
              <ul className="list stack-3">{reviews.map((r) => {
                const u = Codi.user(r.userId) || { name: 'Học viên' };
                return (
                  <li key={r.id || r.userId + r.createdAt} className="card"><div className="card-body compact stack-2">
                    <div className="row-between"><span className="row"><Avatar user={u} size="sm" /><strong>{u.name}</strong></span><span className="row small" style={{ gap: 4 }}><Icon name="star-filled" className="icon-sm cm-star" />{r.stars}/5 sao</span></div>
                    <time className="xsmall muted" dateTime={r.createdAt}>{fmt.date(r.createdAt)}</time>
                    {r.text && <p className="cm-review-text">{r.text}</p>}
                    {r.reply && r.reply.text && (
                      <div className="panel stack-1"><span className="small strong">Phản hồi từ giảng viên</span><p className="small cm-review-text">{r.reply.text}</p></div>
                    )}
                  </div></li>
                );
              })}</ul>
            ) : <p className="muted">Chưa có đánh giá nào.</p>}
            </>) : (
              <div className="panel cm-review-empty">
                <p className="small strong">Chưa có đánh giá nào cho khoá học này.</p>
                <p className="xsmall muted">Đánh giá và nhận xét từ sinh viên đã học sẽ được hiển thị tại đây.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
