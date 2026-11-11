// S20 lecturer home, course list, S21 create course (rules and copy from the real dashboard/lecturer pages).
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Empty, Icon, Thumb, CourseStatus } from '../../components/ui/primitives';
import { shell, me, counts, FieldError, LEVELS, levelLabel, categoryOptions, Loading, LoadError } from './teach-api';
import { useView, rerender } from './view-store';
import { act, reloadMine, useMine } from './teach-data';

const { fmt } = Codi;

/** One row of the lecturer course list (LecturerCourseItem from getLecturerCourses). */
export function CourseRow({ c }) {
  const lessons = c.lessonsCount;
  return (
    <li className="card"><div className="card-body compact row">
      <Thumb course={c} small />
      <div className="od-fill stack-1"><Link className="strong" to={`/teach/courses/${c.id}`}>{c.title}</Link>
        <div className="row" style={{ gap: 8 }}><CourseStatus status={c.status} /><span className="xsmall muted">{c.chaptersCount} chương · {lessons} bài · {fmt.num(c.learnersCount)} học viên · Trình độ: {levelLabel(c.level)}</span></div>
        {c.status === 'rejected' && c.rejectReason && <span className="small text-danger od-clamp-2">Lý do từ chối: {c.rejectReason}</span>}
        {c.status === 'hidden' && c.hideReason && <span className="small muted od-clamp-2">Lý do ẩn: {c.hideReason}</span>}</div>
      <Link className="btn btn-secondary btn-sm" to={`/teach/courses/${c.id}${c.status === 'rejected' ? '/publish' : ''}`}>{c.status === 'rejected' ? 'Sửa và gửi lại' : 'Mở'}</Link>
    </div></li>
  );
}

const Tile = ({ href, v, label, meta }) => (
  <Link className="stat-tile" to={href}><span className="stat-value">{v}</span><span className="stat-label">{label}</span><span className="stat-go">{meta} <Icon name="arrow-right" className="icon-sm" /></span></Link>
);

export function TeachHomePage() {
  useCodi();
  const m = useMine();
  const n = counts(); const mine = m.list || [];
  const by = (s) => mine.filter((c) => c.status === s).length;
  const alert = m.stats && m.stats.rejectedCourseAlert;
  const rejected = alert ? { id: alert.id, title: alert.title, rejectReason: alert.rejectReason } : null;
  if (!m.list) return shell('/teach', <>
    <div className="page-header"><div><h1>Tổng quan giảng dạy</h1></div></div>
    {m.error ? <LoadError error={m.error} onRetry={reloadMine} /> : <Loading rows={4} />}
  </>);
  return shell('/teach', <>
    <div className="page-header"><div><h1>Tổng quan giảng dạy</h1><p className="muted">Chào {(me() || {}).name || "bạn"}. Đây là những việc đang chờ bạn.</p></div><Link className="btn btn-primary" to="/teach/new"><Icon name="plus" /> Tạo khoá học</Link></div>
    {rejected && <div style={{ marginBottom: 24 }}><Alert type="danger" title={`“${rejected.title}” bị từ chối xuất bản`} body={`Lý do từ chối: ${rejected.rejectReason || 'Chưa nêu'}`} actions={<Link className="btn btn-secondary btn-sm" to={`/teach/courses/${rejected.id}/publish`}>Sửa và gửi lại <Icon name="arrow-right" className="icon-sm" /></Link>} /></div>}
    <div className="grid-3">
      <Tile href="/teach/grading" v={n.grading} label="Bài chờ chấm" meta="Mở hàng chờ" />
      <Tile href="/teach/questions?status=unanswered" v={n.questions} label="Câu hỏi chưa trả lời" meta="Trả lời" />
      <Tile href="/teach/reviews?filter=unreplied" v={n.reviews} label="Đánh giá chưa phản hồi" meta="Phản hồi" />
    </div>
    <h2 className="section" style={{ fontSize: 'var(--text-lg)', marginBottom: 12 }}>Khoá học theo trạng thái</h2>
    <div className="grid-4">
      <Tile href="/teach/courses?status=draft" v={by('draft')} label="Bản nháp" meta="Xem" />
      <Tile href="/teach/courses?status=pending" v={by('pending')} label="Chờ duyệt" meta="Xem" />
      <Tile href="/teach/courses?status=rejected" v={by('rejected')} label="Bị từ chối" meta="Xem" />
      <Tile href="/teach/courses?status=published" v={by('published')} label="Đã xuất bản" meta="Xem" />
    </div>
    <div className="section-title section"><h2 style={{ fontSize: 'var(--text-lg)' }}>Khoá học của tôi</h2><Link to="/teach/courses">Xem tất cả ({mine.length})</Link></div>
    {mine.length ? <ul className="list stack-3">{mine.slice(0, 4).map((c) => <CourseRow key={c.id} c={c} />)}</ul>
      : <div className="card"><Empty icon="book-open" title="Bạn chưa có khoá học nào" body="Tạo khoá học đầu tiên chỉ với tên, mô tả ngắn, danh mục và trình độ. Bạn có thể bổ sung nội dung sau." actions={<Link className="btn btn-primary" to="/teach/new">Tạo khoá học</Link>} /></div>}
  </>);
}

const STATUS_OPTS = [['all', 'Tất cả'], ['draft', 'Bản nháp'], ['pending', 'Chờ duyệt'], ['rejected', 'Bị từ chối'], ['published', 'Đã xuất bản'], ['hidden', 'Đã ẩn']];
export function CourseListPage({ query }) {
  useCodi();
  const m = useMine();
  const status = STATUS_OPTS.some(([v]) => v === query.status) ? query.status : 'all';
  const mine = m.list || [];
  const list = mine.filter((c) => status === 'all' || c.status === status);
  const label = (STATUS_OPTS.find(([v]) => v === status) || [])[1] || 'này';
  const head = <div className="page-header"><div><h1>Khoá học của tôi</h1></div><Link className="btn btn-primary" to="/teach/new"><Icon name="plus" /> Tạo khoá học</Link></div>;
  if (!m.list) return shell('/teach/courses', <>{head}{m.error ? <LoadError error={m.error} onRetry={reloadMine} /> : <Loading rows={4} />}</>);
  return shell('/teach/courses', <>
    {head}
    <div className="tabs" role="tablist">{STATUS_OPTS.map(([v, l]) => (
      <Link key={v} className="tab" role="tab" aria-selected={status === v} to={`/teach/courses${v === 'all' ? '' : '?status=' + v}`}>{l} <span className="count">{v === 'all' ? mine.length : mine.filter((c) => c.status === v).length}</span></Link>
    ))}</div>
    {list.length ? <ul className="list stack-3">{list.map((c) => <CourseRow key={c.id} c={c} />)}</ul>
      : <div className="card"><Empty icon="book-open" title="Không có khoá học ở trạng thái này"
        body={status === 'all' ? "Bạn chưa có khoá học nào. Hãy bấm 'Tạo khoá học' để bắt đầu." : `Hiện tại bạn không có khoá học nào ở trạng thái "${label}".`} /></div>}
  </>);
}

// ───────────────────────── S21 create course ─────────────────────────
let createErr = {};
let createVals = {};
let createState = null; // null | 'saving' | 'error'

/** Real course-schema.ts rules: title 5–120, summary 20–500, category from the fixed list, level from the enum. */
function validateCreate(v) {
  const err = {};
  const title = (v.title || '').trim(); const summary = (v.summary || '').trim();
  if (title.length < 5) err.title = 'Tên khoá học cần ít nhất 5 ký tự.';
  else if (title.length > 120) err.title = 'Tên khoá học tối đa 120 ký tự.';
  if (summary.length < 20) err.summary = 'Mô tả cần ít nhất 20 ký tự.';
  else if (summary.length > 500) err.summary = 'Mô tả tối đa 500 ký tự.';
  if (!v.category) err.category = 'Chọn một danh mục.';
  else if (!categoryOptions().includes(v.category)) err.category = 'Chọn một danh mục hợp lệ.';
  if (!v.level) err.level = 'Chọn trình độ.';
  else if (!LEVELS.some(([k]) => k === v.level)) err.level = 'Chọn trình độ hợp lệ.';
  return err;
}

async function createCourse(e) {
  e.preventDefault();
  if (createState === 'saving') return;
  const v = createVals;
  createErr = validateCreate(v);
  if (Object.keys(createErr).length) { rerender(); return; }
  createState = 'saving'; rerender();
  try {
    const r = await act('lecturer', 'createCourseDraft', { title: v.title.trim(), summary: v.summary.trim(), category: v.category, level: v.level });
    if (!r || !r.success) { createErr = (r && r.errors) || {}; createState = Object.keys(createErr).length ? null : 'error'; rerender(); return; }
    createErr = {}; createVals = {}; createState = null;
    reloadMine();
    Codi.ui.toast('Đã tạo bản nháp. Bắt đầu thêm chương và bài học.', { type: 'success' });
    Codi.go('/teach/courses/' + r.courseId + '/content');
  } catch {
    createState = 'error'; rerender();
  }
}

export function CreateCoursePage() {
  useCodi(); useView();
  const e = createErr; const v = createVals; const saving = createState === 'saving';
  const on = (k) => (ev) => { createVals = { ...createVals, [k]: ev.target.value }; if (createState === 'error') createState = null; rerender(); };
  return shell('/teach/courses', <>
    <div className="page-header"><div><h1>Tạo khoá học</h1><p className="muted">Chỉ cần 4 thông tin. Khoá học được tạo ở trạng thái Bản nháp.</p></div></div>
    <ol className="steps" aria-label="Các bước sau khi tạo khoá học" style={{ maxWidth: 760, marginBottom: 24 }}>
      {[['Thông tin', 'Mô tả, giá đề xuất'], ['Nội dung', 'Chương, bài học, quiz'], ['Bản đồ kiến thức', 'Phân tích và xác nhận'], ['Xuất bản', 'Gửi khi đủ điều kiện']].map(([t, h], i) => (
        <li key={t} className="step-item"><div className="step-link"><span className="step-num" aria-hidden="true">{i + 1}</span><span className="step-text"><strong className="small">{t}</strong><span className="xsmall muted">{h}</span></span></div></li>
      ))}
    </ol>
    <form className="card" onSubmit={createCourse} noValidate style={{ maxWidth: 560 }} aria-busy={saving}><div className="card-body stack-4">
      {createState === 'error' && <Alert type="danger" title="Không tạo được khoá học" body="Không thể tạo khoá học lúc này. Vui lòng thử lại." />}
      <div className={`field ${e.title ? 'is-invalid' : ''}`}><label htmlFor="nc-title">Tên khoá học <span className="req">*</span></label><input id="nc-title" name="title" maxLength={120} value={v.title || ''} onChange={on('title')} placeholder="Ví dụ: Vue 3 cho người mới" disabled={saving} aria-invalid={!!e.title} /><FieldError>{e.title}</FieldError></div>
      <div className={`field ${e.summary ? 'is-invalid' : ''}`}><label htmlFor="nc-sum">Mô tả ngắn <span className="req">*</span></label><textarea id="nc-sum" name="summary" rows={3} maxLength={500} value={v.summary || ''} onChange={on('summary')} disabled={saving} aria-invalid={!!e.summary} /><p className="field-help">1–2 câu: học viên sẽ làm được gì sau khoá học.</p><FieldError>{e.summary}</FieldError></div>
      <div className="grid-2">
        <div className={`field ${e.category ? 'is-invalid' : ''}`}><label htmlFor="nc-cat">Danh mục <span className="req">*</span></label><select id="nc-cat" name="category" value={v.category || ''} onChange={on('category')} disabled={saving} aria-invalid={!!e.category}><option value="">Chọn danh mục</option>{categoryOptions().map((c) => <option key={c} value={c}>{c}</option>)}</select><FieldError>{e.category}</FieldError></div>
        <div className={`field ${e.level ? 'is-invalid' : ''}`}><label htmlFor="nc-level">Trình độ <span className="req">*</span></label><select id="nc-level" name="level" value={v.level || ''} onChange={on('level')} disabled={saving} aria-invalid={!!e.level}><option value="">Chọn trình độ</option>{LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><FieldError>{e.level}</FieldError></div>
      </div>
      <div className="row"><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? <><Icon name="loader" className="icon-sm" /> Đang tạo...</> : 'Tạo bản nháp'}</button><Link className="btn btn-ghost" to="/teach">Huỷ</Link></div>
    </div></form>
  </>);
}
