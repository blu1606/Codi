/**
 * S02 Course detail '/courses/:slug' — proof before price: outcomes, what the AI path does for this course, reviews,
 * curriculum accordion with typed lesson rows, requirements, lecturer. A sticky purchase panel carries the one primary
 * action with ownership states.
 * Data: GET /api/courses/:slug (+ /lesson-kinds for typed rows), POST /api/courses/ownership, and the learner's
 * progress from GET /api/learner/overview when the course is owned.
 */
import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { useApi } from '../../lib/use-api';
import { Alert, Avatar, Empty, Icon, Progress, Stars, Thumb } from '../../components/ui/primitives';
import { TYPE_ICON, TYPE_LABEL, priceLabel } from './commerce-lib';
import { levelLabel, useOwnership } from './commerce-api';
import { AddToCartButton, buyNow, enrollFree } from './course-card';

const fmt = Codi.fmt;

const ROLE_VIEW = { lecturer: 'giảng viên', admin: 'quản trị viên' };

/** What the AI path does for a learner of this course (product positioning: ordered, explained, never silent). */
const AI_STEPS = [
  ['route', 'Đúng thứ tự tiên quyết', 'Lộ trình sắp xếp các bài theo thứ tự tiên quyết của khoá học.'],
  ['sparkles', 'Có lý do cho từng bước', 'Trợ lý AI nêu lý do cho mỗi bài trong lộ trình, để bạn hiểu vì sao học bài này trước.'],
  ['check', 'Bạn quyết định', 'Lộ trình chỉ đổi khi bạn đồng ý. Mọi điều chỉnh đều được nêu rõ trước khi áp dụng.'],
];

/** Purchase panel: one filled primary per ownership state; "Thêm vào giỏ" stays secondary (decision 42). */
function PurchaseCard({ course: c, own, pendingOrderId }) {
  const role = Codi.role();
  const progress = useApi(own === 'owned' && role === 'learner' ? '/api/learner/overview' : null);
  let cta;
  if (role === 'lecturer' || role === 'admin') {
    cta = <p className="small muted">Bạn đang xem với vai trò {ROLE_VIEW[role]}. Chỉ tài khoản học viên mới mua được khoá học.</p>;
  } else if (!own) {
    cta = <div className="skeleton" style={{ height: 48 }} aria-hidden="true" />;
  } else if (own === 'owned') {
    const p = progress.data && progress.data.courses.find((x) => x.id === c.id);
    cta = (<>
      {p && <div className="stack-2"><div className="row-between small"><span>Tiến độ của bạn</span><strong>{p.done}/{p.total} bài</strong></div><Progress pct={p.percent} /></div>}
      <Link className="btn btn-primary btn-block btn-lg" to={`/learn/${c.id}`}>Tiếp tục học</Link>
    </>);
  } else if (own === 'pending-payment') {
    cta = (<>
      <Alert type="warn" title="Đơn hàng đang chờ thanh toán." body="Hoàn tất chuyển khoản để mở khoá học." />
      <Link className="btn btn-primary btn-block btn-lg" to={pendingOrderId ? `/checkout?order=${pendingOrderId}` : '/cart'}>Tiếp tục thanh toán</Link>
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
    <div className="card cm-card cm-buy">
      <div className="cm-card-media" aria-hidden="true"><Thumb course={c} /></div>
      <div className="card-body stack-4">
        {own === 'owned' && role === 'learner' ? (
          <h2 className="h-card row" style={{ gap: 8 }}><Icon name="check-circle" className="text-success" /> Bạn đã sở hữu khoá học</h2>
        ) : (<>
          <h2 className="h-card">Đăng ký khoá học</h2>
          <div className="stack-1"><span className="small muted">Học phí khoá học</span><span className="price cm-price-lg">{priceLabel(c)}</span></div>
        </>)}
        {cta}
        <dl className="cm-facts">
          <div><dt>Trình độ</dt><dd>{levelLabel(c.level)}</dd></div>
          <div><dt>Số chương</dt><dd>{c.chapterCount}</dd></div>
          <div><dt>Số bài học</dt><dd>{c.lessonCount}</dd></div>
          <div><dt>Thời lượng</dt><dd>{fmt.duration(c.durationMin)}</dd></div>
        </dl>
        <Link className="small cm-ask" to={`/ai?prompt=${encodeURIComponent('Khoá "' + c.title + '" có phù hợp với tôi không?')}`}><Icon name="sparkles" className="icon-sm" /> Hỏi trợ lý AI Codi</Link>
      </div>
    </div>
  );
}

/** Load failure (real: "Chưa thể tải khoá học" + "Thử lại"; no retry on 404). */
function DetailError({ notFound, onRetry }) {
  return (
    <div className="page page-narrow"><div className="card">
      <Empty icon="book-open" title={notFound ? 'Không tìm thấy khoá học' : 'Chưa thể tải khoá học'}
        body={<span role="alert">{notFound ? 'Không tìm thấy khoá học.' : 'Không thể tải khoá học. Vui lòng thử lại.'}</span>}
        actions={<>
          {!notFound && <button type="button" className="btn btn-primary" onClick={onRetry}><Icon name="refresh" className="icon-sm" /> Thử lại</button>}
          <Link className="btn btn-secondary" to="/courses">Xem danh sách khoá học</Link>
        </>} />
    </div></div>
  );
}

/** GET /api/courses/:slug (+ lesson kinds) → the course shape this page renders. */
function toDetail(d, kinds) {
  const k = (kinds && kinds.lessons) || {};
  const chapters = d.chapters.map((ch) => ({
    id: ch.id, title: ch.title,
    lessons: ch.lessons.map((l) => ({
      id: l.id, title: l.title, durationMin: Math.round((l.durationSeconds || 0) / 60),
      type: k[l.id] ? k[l.id].kind : null, quiz: !!(k[l.id] && k[l.id].quiz), assignment: !!(k[l.id] && k[l.id].assignment),
    })),
  }));
  return {
    ...d.course, summary: d.course.description || '', rating: d.rating || 0, ratingCount: d.reviewCount || 0,
    learnersCount: d.course.enrollmentCount || 0, coverImageUrl: d.coverImageUrl, chapters,
    chapterCount: d.summary.chapterCount, lessonCount: d.summary.lessonCount, durationMin: Math.round(d.summary.durationSeconds / 60),
    outcomes: d.learningOutcomes || [], requirements: d.requirements || [], instructor: d.instructor, reviews: d.reviews || [],
  };
}

function DetailSkeleton() {
  return (
    <div className="page stack-4" aria-busy="true">
      <div className="skeleton skeleton-line" style={{ width: '30%' }} />
      <div className="skeleton skeleton-line" style={{ width: '60%', height: 32 }} />
      <div className="skeleton skeleton-line" style={{ width: '80%' }} />
      <div className="skeleton" style={{ height: 260 }} />
      <p className="sr-only" role="status">Đang tải khoá học…</p>
    </div>
  );
}

export default function CourseDetailPage({ params }) {
  useCodi();
  const curRef = useRef(null);
  const slug = encodeURIComponent(params.slug);
  const detail = useApi(`/api/courses/${slug}`);
  const kinds = useApi(detail.data ? `/api/courses/${slug}/lesson-kinds` : null);
  const c = useMemo(() => (detail.data ? toDetail(detail.data, kinds.data) : null), [detail.data, kinds.data]);
  const ownership = useOwnership(c ? [c] : null);
  if (!c) {
    if (detail.error) return detail.error.status === 404 ? <DetailError notFound /> : <DetailError onRetry={() => detail.reload()} />;
    return <DetailSkeleton />;
  }
  const own = ownership.of(c.id);
  // Real lib/course-review-service.ts: visible reviews from enrolled learners, newest first, at most 50.
  const reviews = c.reviews;
  const lec = c.instructor ? { name: c.instructor.name, image: c.instructor.avatar } : null;
  const breakdown = [5, 4, 3, 2, 1].map((n) => reviews.filter((r) => r.stars === n).length);
  const totalBreak = breakdown.reduce((s, n) => s + n, 0) || 1;
  const outcomes = c.outcomes;
  const requirements = c.requirements;
  const expand = (open) => { if (curRef.current) curRef.current.querySelectorAll('details').forEach((d) => { d.open = open; }); };

  return (
    <div className="page">
      <nav className="small muted cm-crumb" aria-label="Breadcrumb"><Link to="/courses">Khoá học</Link> / <span>{c.category}</span> / <span aria-current="page">{c.title}</span></nav>
      <div className="cm-detail">
        <header className="stack-3 cm-detail-head">
          <h1>{c.title}</h1>
          <p className="cm-lede muted">{c.summary || 'Giảng viên đang cập nhật mô tả.'}</p>
          <ul className="cm-stats">
            <li><Icon name="bar-chart" className="icon-sm" /> {levelLabel(c.level)}</li>
            <li><Icon name="clock" className="icon-sm" /> {fmt.duration(c.durationMin)}</li>
            <li><Icon name="star-filled" className="icon-sm cm-star" /> {c.ratingCount ? `${c.rating.toFixed(1)} (${fmt.num(c.ratingCount)} đánh giá)` : 'Chưa có đánh giá'}</li>
            <li><Icon name="users" className="icon-sm" /> {fmt.num(c.learnersCount)} học viên</li>
            <li><Icon name="user" className="icon-sm" /> {lec ? lec.name : ''}</li>
          </ul>
        </header>
        <aside className="cm-detail-aside" aria-label="Đăng ký khoá học"><PurchaseCard course={c} own={own} pendingOrderId={ownership.pendingOrderId(c.id)} /></aside>
        <div className="stack-6 cm-detail-main">
          <section className="stack-3" aria-labelledby="detail-outcomes-title">
            <h2 id="detail-outcomes-title">Bạn sẽ học được gì?</h2>
            {outcomes.length
              ? <ul className="cm-outcomes">{outcomes.map((o, i) => <li key={i}><Icon name="check" className="icon-sm text-success" /><span>{o}</span></li>)}</ul>
              : <p className="muted">Giảng viên đang cập nhật mục tiêu khoá học.</p>}
          </section>

          <section className="stack-3" aria-labelledby="detail-ai-title">
            <h2 id="detail-ai-title">Trợ lý AI làm gì cho khoá học này?</h2>
            <ol className="cm-ai-path">{AI_STEPS.map(([icon, t, d], i) => (
              <li key={t}><span className="cm-ai-step" aria-hidden="true">{i + 1}</span><div className="stack-1"><h3 className="cm-ai-title"><Icon name={icon} className="icon-sm" /> {t}</h3><p className="small muted">{d}</p></div></li>
            ))}</ol>
          </section>

          <section className="stack-3" id="reviews" aria-labelledby="reviews-heading"><h2 id="reviews-heading">Đánh giá của học viên</h2>
            {(reviews.length > 0 || c.ratingCount > 0) ? (<>
              <div className="cm-rating"><div className="cm-rating-inner">
                <div className="cm-rating-score"><span className="cm-rating-num">{c.rating.toFixed(1)}</span><Stars n={c.rating} /><span className="small muted">{fmt.num(c.ratingCount)} đánh giá</span></div>
                <div className="stack-1 od-fill">{[5, 4, 3, 2, 1].map((s, i) => (
                  <div key={s} className="cm-rating-row small">
                    <span className="od-nowrap">{s} sao</span>
                    <div className="progress od-fill" aria-hidden="true"><span style={{ width: `${Math.round(((breakdown[i] || 0) / totalBreak) * 100)}%` }} /></div>
                    <span className="muted cm-rating-count">{breakdown[i] || 0}</span>
                  </div>
                ))}</div>
              </div></div>
              {reviews.length ? (
                <ul className="list cm-reviews">{reviews.map((r) => {
                  const u = { name: r.userName || 'Học viên', image: r.userAvatar };
                  return (
                    <li key={r.id} className="cm-review"><div className="stack-2">
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

          <section className="stack-3" aria-labelledby="detail-curriculum-title">
            <div className="row-between"><h2 id="detail-curriculum-title">Nội dung khoá học</h2>
              {c.chapters.length > 0 && (
                <div className="row">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => expand(true)}>Mở rộng tất cả</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => expand(false)}>Thu gọn tất cả</button>
                </div>
              )}
            </div>
            {c.chapters.length ? (<>
              <p className="small muted">{c.chapterCount} chương · {c.lessonCount} bài học · {fmt.duration(c.durationMin)}</p>
              <div className="cm-curriculum" ref={curRef}>{c.chapters.map((ch, i) => (
                <details key={ch.id || i} className="cm-chapter" open={i === 0 ? true : undefined}>
                  <summary><span className="strong">Chương {i + 1}: {ch.title}</span><span className="small muted od-nowrap">{ch.lessons.length} bài · {fmt.duration(ch.lessons.reduce((s, l) => s + l.durationMin, 0))}</span></summary>
                  <ul className="list">{ch.lessons.map((l) => (
                    <li key={l.id} className="list-row">
                      <Icon name={TYPE_ICON[l.type] || 'file-text'} className="icon-sm" />
                      <span className="list-main"><span>{l.title}</span><span className="xsmall muted">{TYPE_LABEL[l.type] || l.type}{l.quiz && l.type !== 'quiz' ? ' · Quiz' : ''}{l.assignment ? ' · Bài tập' : ''}</span></span>
                      <span className="small muted od-nowrap">{fmt.duration(l.durationMin)}</span>
                    </li>
                  ))}</ul>
                </details>
              ))}</div>
            </>) : <Alert type="info" title="Nội dung học đang được chuẩn bị" body="Giảng viên sẽ sớm cập nhật đề cương." />}
          </section>

          <section className="stack-3" aria-labelledby="detail-req-title"><h2 id="detail-req-title">Yêu cầu trước khi học</h2>
            {requirements.length ? <ul>{requirements.map((r, i) => <li key={i}>{r}</li>)}</ul> : <p className="muted">Không có yêu cầu đặc biệt.</p>}
          </section>

          <section className="stack-3" aria-labelledby="detail-lecturer-title"><h2 id="detail-lecturer-title">Giảng viên</h2>
            <div className="card"><div className="card-body compact row"><Avatar user={lec} size="lg" /><div className="stack-1"><strong>{lec ? lec.name : ''}</strong><span className="small muted">Giảng viên tại Codi</span></div></div></div>
          </section>
        </div>
      </div>
    </div>
  );
}
