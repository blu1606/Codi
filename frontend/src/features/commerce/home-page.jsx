/**
 * S00 Home '/' (real app/page.tsx + components/{hero,home-features,home-courses,home-mentor,home-footer}.tsx):
 * hero with CTAs and stats, a sample product window (learning path, lesson, AI explanation), features, popular
 * courses (GET /api/courses?sort=popular&limit=4: loading / error / empty), AI Mentor, closing band, footer.
 * The product window shows the first chapter of the most popular course (GET /api/courses/:slug).
 */
import { Link, Navigate } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { useApi } from '../../lib/use-api';
import { Icon, Thumb } from '../../components/ui/primitives';
import { BrandMark } from '../shell/brand-link';
import { levelLabel, useCatalog } from './commerce-api';

const fmt = Codi.fmt;

const STATS = [['Lộ trình', 'Theo mục tiêu học tập'], ['Khoá học', 'Khám phá chủ đề lập trình'], ['Trợ lý AI', 'Hỗ trợ học tập']];
const FEATURES = [
  { icon: 'route', title: 'Lộ trình cá nhân hóa', text: 'Trực quan hóa kế hoạch học tập độc bản cho riêng trình độ và quỹ thời gian của bạn.', highlighted: true },
  { icon: 'book-open', title: 'Khoá học chuyên sâu', text: 'Học qua các dự án thực tế được xây dựng bởi đội ngũ chuyên gia công nghệ hàng đầu.' },
  { icon: 'message-circle', title: 'AI Mentor 24/7', text: 'Hỏi đáp lập trình tức thì mọi lúc mọi nơi, giải thích bug chi tiết từng dòng code.' },
  { icon: 'terminal', title: 'Thực hành trực tiếp', text: 'Trình biên dịch tích hợp trên trình duyệt giúp bạn viết code và kiểm thử ngay lập tức.' },
];
const BENEFITS = [
  ['Giải thích logic code phức tạp', 'Chỉ cần gửi đoạn code, AI sẽ phân tích và giải nghĩa dễ hiểu nhất.'],
  ['Phát hiện lỗi logic & gợi ý sửa đổi', 'Cùng tìm lỗi, hiểu nguyên nhân và cải thiện cách viết code của bạn.'],
];
const FOOTER_GROUPS = [
  ['Nền tảng', [['Lộ trình học tập', '/ai'], ['Danh sách khoá học', '/courses'], ['Trang học tập', '/dashboard'], ['AI Mentor', '#home-mentor']]],
  ['Tài nguyên', [['Khám phá công nghệ', '/courses'], ['Tư vấn chọn khoá học', '/ai'], ['Tính năng Codi', '#home-features-title'], ['Hồ sơ học tập', '/profile']]],
  ['Hỗ trợ', [['Hỏi đáp cùng AI', '/ai'], ['Quản lý tài khoản', '/profile'], ['Đăng nhập', '/login'], ['Khôi phục mật khẩu', '/forgot-password']]],
];
const FooterLink = ({ to, children }) => (to.startsWith('#') ? <a href={to}>{children}</a> : <Link to={to}>{children}</Link>);

/** Sample lesson path for the product window: the first chapter of a course detail, when it has 3+ lessons. */
function samplePath(detail) {
  const ch = detail && detail.chapters && detail.chapters[0];
  if (!ch || ch.lessons.length < 3) return null;
  const lessons = ch.lessons.slice(0, 4).map((l, i) => ({ id: l.id, title: l.title, state: i === 0 ? 'done' : i === 1 ? 'current' : 'next' }));
  return { course: detail.course, chapter: ch.title, lessons };
}

/** The product, working: path strip, lesson, and AI explanation. Sample data, labelled as such. */
function ProductWindow({ slug }) {
  const { data } = useApi(slug ? `/api/courses/${encodeURIComponent(slug)}` : null);
  const path = samplePath(data);
  const stateLabel = { done: 'Đã học', current: 'Đang học', next: 'Tiếp theo' };
  return (
    <figure className="cm-window" aria-label="Minh họa giao diện học: lộ trình, bài học và giải thích của trợ lý AI">
      <div className="cm-window-bar">
        <span className="cm-window-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="cm-window-title">{path ? path.course.title : 'Lộ trình học'}</span>
        <span className="badge badge-neutral cm-window-tag">Minh họa · dữ liệu mẫu</span>
      </div>
      <div className="cm-window-body">
        <ol className="cm-path" aria-label="Lộ trình của bạn">
          <li className="cm-path-head">{path ? path.chapter : 'Chương 1'}</li>
          {(path ? path.lessons : [
            { id: 'a', title: 'Bài 1', state: 'done' }, { id: 'b', title: 'Bài 2', state: 'current' }, { id: 'c', title: 'Bài 3', state: 'next' },
          ]).map((l) => (
            <li key={l.id} className={`cm-path-stop is-${l.state}`}>
              <span className="cm-path-dot" aria-hidden="true">{l.state === 'done' ? <Icon name="check" className="icon-sm" /> : null}</span>
              <span className="cm-path-text"><span className="cm-path-name">{l.title}</span><span className="cm-path-state">{stateLabel[l.state]}</span></span>
            </li>
          ))}
        </ol>
        <div className="cm-lesson">
          <h3 className="cm-lesson-title">Loại bỏ phần tử trùng lặp trong mảng</h3>
          <p className="xsmall muted">Bài đang học · {path ? path.chapter : 'Chương 1'}</p>
          <p className="small">Một mảng có thể chứa giá trị lặp lại. Với Set, mỗi giá trị chỉ được giữ một lần.</p>
          <pre className="cm-code"><code>{'const unique = [...new Set(arr)];'}</code></pre>
        </div>
        <div className="cm-ai" aria-label="Trợ lý AI giải thích">
          <p className="cm-ai-q"><Icon name="message-circle" className="icon-sm" /> Vì sao Set loại được trùng?</p>
          <p className="cm-ai-a small">Set chỉ cho phép mỗi giá trị xuất hiện một lần. Khi trải lại bằng dấu <code>...</code>, ta được một mảng không còn phần tử lặp.</p>
          <p className="xsmall muted">Trợ lý giải thích từng bước và để bạn quyết định bước tiếp theo.</p>
        </div>
      </div>
    </figure>
  );
}

function HomeCourseCard({ course: c }) {
  return (
    <article className="card cm-card cm-home-course">
      <div className="cm-card-media" aria-hidden="true"><Thumb course={c} /><span className="cm-cover-label">{c.category}</span></div>
      <div className="card-body compact cm-card-body">
        <h3 className="cm-card-title" title={c.title}>{c.title}</h3>
        <p className="small muted od-truncate">{c.lecturerName}</p>
        <p className="cm-card-meta">
          <span className="badge badge-neutral">{levelLabel(c.level)}</span>
          <span className="od-nowrap" title="Số học viên đã đăng ký"><Icon name="users" className="icon-sm" /> {fmt.num(c.learnersCount || 0)} học viên</span>
          <span className="od-nowrap"><Icon name="clock" className="icon-sm" /> {c.duration}</span>
        </p>
        <Link className="btn btn-secondary btn-block cm-card-foot" to={`/courses/${c.slug}`} aria-label={`Bắt đầu học: ${c.title}`}>Bắt đầu học</Link>
      </div>
    </article>
  );
}

function PopularCourses({ courses, loading, error, reload }) {
  let body;
  if (!courses && (loading || !error)) {
    body = (
      <div role="status" aria-label="Đang tải khoá học"><span className="sr-only">Đang tải khoá học…</span>
        <div className="grid-4" aria-hidden="true">{[1, 2, 3, 4].map((i) => (
          <div key={i} className="card card-body stack-3"><div className="skeleton" style={{ aspectRatio: '16 / 9' }} /><div className="skeleton skeleton-line" style={{ width: '30%' }} /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line" style={{ width: '50%' }} /></div>
        ))}</div>
      </div>
    );
  } else if (!courses) {
    body = (
      <div className="card card-body cm-home-state">
        <p role="alert" className="small muted">Không thể tải khoá học. Vui lòng thử lại.</p>
        <button type="button" className="btn btn-secondary" onClick={() => reload()}>Thử lại</button>
      </div>
    );
  } else if (!courses.length) {
    body = (
      <div className="card card-body cm-home-state">
        <Icon name="book-open" className="icon-lg" />
        <p role="status" className="small muted">Các khoá học sẽ sớm được cập nhật. Hãy quay lại sau nhé!</p>
      </div>
    );
  } else {
    body = <div className="grid-4">{courses.map((c) => <HomeCourseCard key={c.id} course={c} />)}</div>;
  }
  return (
    <section className="section cm-home-section" aria-labelledby="home-courses-title">
      <div className="cm-home-head">
        <div className="stack-2">
          <h2 id="home-courses-title">Khoá học phổ biến nhất</h2>
          <p className="muted">Khám phá các khoá học được nhiều học viên lựa chọn nhất.</p>
        </div>
        <Link className="cm-home-link" to="/courses">Xem tất cả khoá học <Icon name="arrow-right" className="icon-sm" /></Link>
      </div>
      {body}
    </section>
  );
}

export default function HomePage() {
  useCodi();
  const popular = useCatalog('sort=popular&limit=4');
  const top = popular.courses && popular.courses[0];
  // The landing page is for guests: a signed-in learner, lecturer or admin goes to their own home (also right after
  // signing in from the modal opened on this page).
  const home = Codi.homeFor(Codi.role());
  if (Codi.session.user && home !== '/') return <Navigate to={home} replace />;
  return (
    <>
      <div className="page cm-home">
        <section className="cm-hero" aria-labelledby="home-hero-title">
          <div className="cm-hero-copy">
            <h1 id="home-hero-title">Học đúng thứ bạn cần, theo thứ tự hợp lý với bạn</h1>
            <p className="muted cm-lede">Học lập trình thông minh hơn với trợ lý AI, đa dạng các khoá học từ cơ bản đến nâng cao, thực hành code trực tiếp và lộ trình học cá nhân hóa hoàn hảo.</p>
            <div className="cm-hero-actions">
              <Link className="btn btn-primary btn-lg" to="/dashboard">Bắt đầu học ngay</Link>
              <Link className="btn btn-secondary btn-lg" to="/courses">Khám phá khoá học</Link>
            </div>
            <dl className="cm-hero-stats">
              {STATS.map(([v, l]) => <div key={v}><dt>{v}</dt><dd>{l}</dd></div>)}
            </dl>
          </div>
          <div className="cm-hero-media"><ProductWindow slug={top ? top.slug : null} /></div>
        </section>

        <section className="section cm-home-section" aria-labelledby="home-features-title">
          <div className="stack-2 cm-home-intro">
            <h2 id="home-features-title">Phương pháp học thông minh &amp; hiệu quả hơn</h2>
            <p className="muted">Bỏ qua các giáo án lý thuyết dài dòng. AI Learning hướng bạn vào con đường thực hành thực chiến với sự đồng hành của siêu trợ lý AI thông minh.</p>
          </div>
          <ul className="cm-features">
            {FEATURES.map((f) => (
              <li key={f.title} className={f.highlighted ? 'is-highlighted' : undefined}>
                <h3 className="cm-feature-title"><Icon name={f.icon} className="cm-feature-icon" />{f.title}</h3>
                <p className="small muted">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <PopularCourses courses={popular.courses} loading={popular.loading} error={popular.error} reload={popular.reload} />

        <section className="section cm-home-section cm-mentor" id="home-mentor" aria-labelledby="home-mentor-title">
          <div className="stack-4">
            <h2 id="home-mentor-title">AI Mentor - Trợ lý học tập thông minh luôn kề vai</h2>
            <p className="muted">Không còn phải mòn mỏi chờ câu trả lời trên các diễn đàn công nghệ. AI Mentor của Codi cùng bạn tìm hiểu bài học, giải thích từng bước và khám phá lời giải với code minh họa trực quan.</p>
            <ul className="cm-benefits">
              {BENEFITS.map(([t, d]) => (
                <li key={t}><Icon name="sparkles" className="icon-sm" /><div><h3>{t}</h3><p className="small muted">{d}</p></div></li>
              ))}
            </ul>
            <Link className="cm-home-link" to="/ai">Trò chuyện với AI Mentor <Icon name="arrow-right" className="icon-sm" /></Link>
          </div>
        </section>

        <section className="cm-close" aria-labelledby="home-close-title">
          <img src="/images/hero-learner.webp" width="1200" height="800" alt="" loading="lazy" decoding="async" />
          <div className="stack-3">
            <h2 id="home-close-title">Bắt đầu từ bài học đầu tiên</h2>
            <p className="muted">Chọn một khoá học, xem đề cương và đăng ký. Lộ trình sẽ bắt đầu từ bài đầu tiên của bạn.</p>
            <div className="cm-hero-actions">
              <Link className="btn btn-primary btn-lg" to="/courses">Xem khoá học</Link>
              <Link className="btn btn-secondary btn-lg" to="/ai">Hỏi AI Codi</Link>
            </div>
          </div>
        </section>
      </div>

      <footer className="cm-footer" aria-label="Thông tin và liên kết Codi">
        <div className="cm-footer-inner">
          <div className="stack-2">
            <Link to="/" className="logo" aria-label="Codi - Trang chủ"><BrandMark size={28} /> Codi</Link>
            <p className="xsmall muted">Học lập trình cùng trợ lý AI và lộ trình thiết kế riêng cho mỗi cá nhân. Codi đồng hành từ những dòng code đầu tiên.</p>
          </div>
          {FOOTER_GROUPS.map(([title, links]) => (
            <nav key={title} aria-label={title}>
              <h2>{title}</h2>
              <ul>{links.map(([l, to]) => <li key={l}><FooterLink to={to}>{l}</FooterLink></li>)}</ul>
            </nav>
          ))}
          <div>
            <h2>Liên hệ</h2>
            <p className="xsmall muted">Bạn cần hỗ trợ học tập? Trao đổi cùng AI Mentor để tìm hướng đi phù hợp.</p>
            <Link className="cm-home-link" to="/ai">Trò chuyện với Codi <Icon name="external-link" className="icon-sm" /></Link>
          </div>
        </div>
      </footer>
    </>
  );
}
