/**
 * /profile — port of the real app's app/profile/page.tsx, profile-view.tsx, profile-tabs.ts and
 * components/profile/profile-card.tsx, avatar-picker.tsx, student-profile-overview.tsx (incl. ProfileStats).
 *
 * Tabs: Tổng quan (activity heatmap with year switch + courses), Khoá học, Giao dịch, Hồ sơ năng lực (learners
 * only; others fall back to the overview).
 *
 * Backend: GET /api/student/profile (enrolments with progress) and GET /api/student/profile/summary?year=
 * (activity days derived from real learning records + the user's orders). A name-only change goes to Better Auth
 * POST /api/auth/update-user; a new avatar goes with the name to POST /api/user/avatar, which stores it in R2.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, ROLE_LABEL, useCodi } from '../../lib/codi';
import { api } from '../../lib/api';
import { useApi } from '../../lib/use-api';
import { Icon, OrderStatus, Progress } from '../../components/ui/primitives';
import { ListRowsSkeleton, LoadingRegion, ShellIcon, Skel } from './shell-ui';
import AvatarPicker from './avatar-picker';
import { EmailVerificationCard } from './settings-page';
import { GithubProfilePanel } from './github-api';
import { accountUser, authMessage, refreshAccount } from './account-store';
import { useMounted } from './auth';

const PROFILE_TABS = [
  { id: 'overview', label: 'Tổng quan', learnerOnly: false },
  { id: 'courses', label: 'Khoá học', learnerOnly: false },
  { id: 'transactions', label: 'Giao dịch', learnerOnly: false },
  { id: 'nang-luc', label: 'Hồ sơ năng lực', learnerOnly: true },
];
const resolveTab = (value, isLearner) => {
  if (value === 'nang-luc') return isLearner ? 'nang-luc' : 'overview';
  return value === 'courses' || value === 'transactions' ? value : 'overview';
};
const tabHref = (id) => (id === 'overview' ? '/profile' : `/profile?tab=${id}`);
const joinDate = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '');
const LOAD_ERROR = 'Không thể tải dữ liệu hồ sơ.';

/** Enrolments + this year's summary, shared by the stats card and the tab bodies. */
function useProfileData() {
  const profile = useApi('/api/student/profile');
  const summary = useApi('/api/student/profile/summary');
  const status = profile.error || summary.error ? 'error' : profile.data && summary.data ? 'ready' : 'loading';
  const courses = ((profile.data && profile.data.enrollments) || []).map(({ enrollment, course }) => ({
    id: course.id, title: course.title, progress: enrollment.progress || 0, done: (enrollment.progress || 0) >= 100,
  }));
  return { status, error: status === 'error' ? LOAD_ERROR : null, courses, summary: summary.data };
}

// ───────────────────────── stats ─────────────────────────
function ProfileStats({ data }) {
  const Stat = ({ icon, label, value }) => (
    <div className="stat-tile shell-stat"><span className="shell-stat-icon"><ShellIcon name={icon} /></span>
      <span className="stack-1"><span className="stat-label">{label}</span>{value === undefined ? <Skel w={96} h={18} /> : <span className="strong">{value}</span>}</span></div>
  );
  if (data.status === 'loading') {
    return <LoadingRegion label="Đang tải thống kê hồ sơ…" className="grid-2 shell-stats"><Stat icon="trending-up" label="Tiến độ trung bình" /><Stat icon="clock" label="Ngày hoạt động" /></LoadingRegion>;
  }
  if (data.status === 'error') return <p className="small text-danger" role="alert">Không thể tải thống kê hồ sơ.</p>;
  const { courses } = data;
  const progress = courses.length ? `${Math.round(courses.reduce((s, x) => s + x.progress, 0) / courses.length)}%` : 'Chưa có dữ liệu';
  const days = data.summary.days.length;
  return (
    <div className="grid-2 shell-stats">
      <Stat icon="trending-up" label="Tiến độ trung bình" value={progress} />
      <Stat icon="clock" label="Ngày hoạt động" value={days ? `${days} ngày` : 'Chưa có dữ liệu'} />
    </div>
  );
}

// ───────────────────────── profile card ─────────────────────────
/** Cropped JPEG or preset SVG data URL → File for the multipart avatar upload. */
async function dataUrlToFile(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type.includes('svg') ? 'svg' : 'jpg';
  return new File([blob], `avatar.${ext}`, { type: blob.type });
}

function ProfileCard({ u }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(u.name);
  const [pendingImage, setPendingImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const mounted = useMounted();
  const dirty = draft.trim() !== u.name || pendingImage !== null;
  const start = () => { setDraft(u.name); setPendingImage(null); setEditing(true); };
  const cancel = () => { if (saving) return; setDraft(u.name); setPendingImage(null); setEditing(false); };
  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    const name = draft.trim();
    if (!name) { Codi.ui.toast('Họ và tên không được để trống', { type: 'danger' }); return; }
    if (!dirty) return;
    setSaving(true);
    try {
      // The avatar route uploads the image to R2 and commits name + image together.
      if (pendingImage) {
        const form = new FormData();
        form.append('name', name);
        form.append('file', await dataUrlToFile(pendingImage));
        await api.post('/api/user/avatar', form);
      } else {
        await api.post('/api/auth/update-user', { name });
      }
      await refreshAccount();
    } catch (err) {
      if (!mounted.current) return;
      setSaving(false);
      Codi.ui.toast(authMessage(err, 'Đã xảy ra lỗi khi lưu hồ sơ. Vui lòng thử lại.'), { type: 'danger' });
      return;
    }
    if (!mounted.current) return;
    setSaving(false); setPendingImage(null); setEditing(false);
    Codi.ui.toast('Cập nhật thông tin hồ sơ thành công!', { type: 'success' });
  };

  if (editing) {
    return (
      <div className="card"><div className="card-body stack-4">
        <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Chỉnh sửa hồ sơ</h2>
        <div className="stack-2"><span className="field-label">Ảnh đại diện</span>
          <AvatarPicker current={pendingImage || u.image || null} userName={draft} onSelected={setPendingImage} disabled={saving} /></div>
        <form className="stack-4 shell-divided" noValidate onSubmit={save}>
          <div className="field"><label htmlFor="displayName">Họ và tên</label><input id="displayName" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nhập họ và tên của bạn" disabled={saving} /></div>
          <div className="field"><label htmlFor="displayEmail">Email đăng ký</label><input id="displayEmail" value={u.email} disabled /><p className="field-help">Email là định danh tài khoản, không thể thay đổi trực tiếp.</p></div>
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={saving || !draft.trim() || !dirty}>{saving ? <Icon name="loader" className="icon-sm shell-spin" /> : <Icon name="check" className="icon-sm" />} Lưu thay đổi</button>
            <button type="button" className="btn btn-secondary" onClick={cancel} disabled={saving}>Huỷ</button>
          </div>
        </form>
      </div></div>
    );
  }
  return (
    <div className="stack-4">
      <div className="shell-profile-photo">{u.image ? <img src={u.image} alt={u.name} /> : <span aria-hidden="true">{(u.name || 'C').trim().split(/\s+/).slice(-2).map((p) => p[0]).join('').toUpperCase()}</span>}</div>
      <div className="stack-3">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>{u.name}</h2>
          <span className="badge badge-neutral">{ROLE_LABEL[u.role]}</span>
          {u.emailVerified !== false
            ? <span className="badge badge-accent"><ShellIcon name="shield-check" className="icon-sm" />Đã xác thực</span>
            : <span className="badge badge-neutral"><Icon name="alert-circle" />Chưa xác thực</span>}
        </div>
        <div className="stack-1 small muted">
          <span className="row" style={{ gap: 8 }}><Icon name="mail" className="icon-sm" /><span style={{ overflowWrap: 'anywhere' }}>{u.email}</span></span>
          {u.createdAt && <span className="row xsmall" style={{ gap: 8 }}><Icon name="calendar" className="icon-sm" /><span>Tham gia: {joinDate(u.createdAt)}</span></span>}
        </div>
        <button type="button" className="btn btn-secondary btn-block" onClick={start}><Icon name="pencil" className="icon-sm" /> Chỉnh sửa hồ sơ</button>
      </div>
    </div>
  );
}

// ───────────────────────── activity heatmap ─────────────────────────
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const longDate = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Real heatmap layout: Sunday-first week columns covering the whole year (53–54 columns × 7 rows). */
function buildWeeks(counts, year) {
  const DAY = 86400000;
  const start = Date.UTC(year, 0, 1); const end = Date.UTC(year, 11, 31);
  const first = start - new Date(start).getUTCDay() * DAY;
  const weeks = [];
  for (let cur = first; cur <= end || new Date(cur).getUTCDay() !== 0; cur += 7 * DAY) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const t = cur + d * DAY; const date = new Date(t); const key = date.toISOString().slice(0, 10);
      const inYear = date.getUTCFullYear() === year;
      days.push({ key, date, inYear, count: inYear ? counts.get(key) || 0 : 0 });
    }
    weeks.push(days);
  }
  return weeks;
}

function ActivityHeatmap({ currentDays }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  // The current year comes with the page data; earlier years are fetched when picked.
  const other = useApi(year === currentYear ? null : `/api/student/profile/summary?year=${year}`);
  const yearStatus = year === currentYear ? 'ready' : other.error ? 'error' : other.data && other.data.year === year ? 'ready' : 'loading';
  const days = year === currentYear ? currentDays : (yearStatus === 'ready' ? other.data.days : []);

  const counts = useMemo(() => new Map(days.map((d) => [d.day, d.count])), [days]);
  const weeks = useMemo(() => buildWeeks(counts, year), [counts, year]);
  const months = useMemo(() => {
    const labels = new Map(); let last = -1;
    weeks.forEach((w, i) => { const d = w.find((x) => x.inYear); if (d && d.date.getUTCMonth() !== last) { last = d.date.getUTCMonth(); labels.set(i, `Th${last + 1}`); } });
    return labels;
  }, [weeks]);
  const activeDays = counts.size;

  return (
    <div className="card"><div className="card-body stack-4">
      <h2 className="small strong" style={{ margin: 0 }} aria-live="polite">
        {yearStatus === 'loading' ? <span className="muted" style={{ fontWeight: 400 }}>Đang tải hoạt động {year}…</span>
          : yearStatus === 'error' ? <span className="row" style={{ gap: 8 }}><span className="text-danger" style={{ fontWeight: 400 }}>Không thể tải dữ liệu heatmap.</span><button type="button" className="btn-link small" onClick={() => other.reload()}>Thử lại</button></span>
            : <span>{activeDays} ngày hoạt động trong {year}</span>}
      </h2>
      <div className="shell-heat-layout">
        <div className="shell-heat-years" role="group" aria-label="Chọn năm">
          {[currentYear, currentYear - 1, currentYear - 2].map((y) => <button key={y} type="button" aria-pressed={year === y} onClick={() => setYear(y)}>{y}</button>)}
        </div>
        <div className="shell-heat-box">
          <div className="shell-heat-scroll" role="region" aria-label={`Lịch hoạt động năm ${year}`} tabIndex={0}>
            <div className="shell-heat" style={{ '--weeks': weeks.length, opacity: yearStatus === 'ready' ? 1 : 0.4 }}>
              <span />
              <div className="shell-heat-months" aria-hidden="true">{weeks.map((_, i) => <span key={i}>{months.get(i) || ''}</span>)}</div>
              <div className="shell-heat-days" aria-hidden="true">{WEEKDAYS.map((d, i) => <span key={d}>{i % 2 === 1 ? d : ''}</span>)}</div>
              <div className="shell-heat-grid">
                {weeks.flatMap((w, wi) => w.map((c, di) => {
                  const label = longDate.format(c.date);
                  const tip = c.count ? `${c.count} hoạt động vào ${label}` : `Không có hoạt động vào ${label}`;
                  return <span key={`${wi}-${di}`} className={`shell-heat-cell ${c.inYear ? 'lv-' + Math.min(4, c.count) : 'is-out'}`} title={c.inYear ? tip : undefined} />;
                }))}
              </div>
            </div>
          </div>
          <div className="shell-heat-legend" aria-hidden="true">Ít {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`shell-heat-cell lv-${l}`} />)} Nhiều</div>
        </div>
      </div>
    </div></div>
  );
}

// ───────────────────────── tab bodies ─────────────────────────
function CoursesCard({ courses }) {
  return (
    <div className="card"><div className="card-body stack-4">
      <h2 className="row" style={{ gap: 8, fontSize: 'var(--text-lg)', margin: 0 }}><Icon name="book-open" className="icon-sm" /> Khoá học của tôi</h2>
      {!courses.length ? <p className="small muted">Bạn chưa đăng ký khoá học nào.</p> : (
        <div className="grid-2">
          {courses.map((c) => (
            <div key={c.id} className="shell-course stack-3">
              <div className="row-between" style={{ alignItems: 'flex-start' }}><h3 className="small strong" style={{ margin: 0 }}>{c.title}</h3><span className="xsmall muted od-nowrap">{c.done ? 'Đã hoàn thành' : 'Đang học'}</span></div>
              <Progress pct={c.progress} label={`Tiến độ ${c.title}`} />
              <div className="row-between xsmall muted"><span>{c.progress}% hoàn thành</span><Link className="small" to={`/learn/${c.id}`}>{c.done ? 'Xem lại' : 'Tiếp tục học'}</Link></div>
            </div>
          ))}
        </div>
      )}
    </div></div>
  );
}

function TransactionsCard({ orders }) {
  return (
    <div className="card"><div className="card-body stack-4">
      <h2 className="row" style={{ gap: 8, fontSize: 'var(--text-lg)', margin: 0 }}><Icon name="wallet" className="icon-sm" /> Lịch sử giao dịch</h2>
      {!orders.length ? <p className="small muted">Chưa có giao dịch nào.</p> : (
        <div className="table-wrap"><table className="table"><thead><tr><th>Mã giao dịch</th><th>Khoá học</th><th>Ngày tạo</th><th className="num">Số tiền</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>
          {orders.map((o) => (
            <tr key={o.id}><td className="mono">{o.code}</td><td>{o.items.map((i) => i.title).join(', ')}</td><td className="od-nowrap">{Codi.fmt.date(o.createdAt)}</td><td className="num">{Codi.fmt.vnd(o.totalAmount)}</td><td><OrderStatus status={o.status} /></td>
              <td>{o.status === 'pending' && <Link className="btn btn-primary btn-sm" to={`/checkout?order=${encodeURIComponent(o.code)}`}>Tiếp tục thanh toán</Link>}</td></tr>
          ))}
        </tbody></table></div>
      )}
    </div></div>
  );
}

function OverviewBody({ data, tab }) {
  if (data.status === 'loading') {
    return <LoadingRegion label="Đang tải dữ liệu hồ sơ…" className="stack-4"><Skel h={160} style={{ borderRadius: 'var(--radius-md)' }} /><ListRowsSkeleton rows={3} withAvatar={false} /></LoadingRegion>;
  }
  if (data.status === 'error') return <p className="small text-danger" role="alert">{data.error}</p>;
  return (
    <div className="stack-4">
      {tab === 'overview' && <ActivityHeatmap currentDays={data.summary.days} />}
      {(tab === 'overview' || tab === 'courses') && <CoursesCard courses={data.courses} />}
      {tab === 'transactions' && <TransactionsCard orders={data.summary.orders} />}
    </div>
  );
}

function CapabilityBody({ query }) {
  return (
    <div className="stack-4" style={{ minWidth: 0 }}>
      <GithubProfilePanel linkError={query.error || null} />
    </div>
  );
}

function ProfileView({ u, query }) {
  const data = useProfileData();
  const isLearner = u.role === 'learner';
  const tab = resolveTab(query.tab, isLearner);
  const tabs = PROFILE_TABS.filter((t) => !t.learnerOnly || isLearner);
  return (
    <div className="page shell-profile">
      <div className="row-between" style={{ flexWrap: 'wrap' }}>
        <Link className="btn btn-ghost btn-sm" to={Codi.homeFor(u.role)}><Icon name="arrow-left" className="icon-sm" /> Quay lại trang chủ</Link>
        <span className="xsmall muted row" style={{ gap: 6 }}><ShellIcon name="shield-check" className="icon-sm" /> Tài khoản Codi an toàn</span>
      </div>
      <div className="shell-profile-title">
        <h1>Hồ sơ cá nhân & Bảo mật</h1>
        <p className="small muted">Quản lý thông tin tài khoản, ảnh đại diện và mật khẩu đăng nhập.</p>
      </div>
      {u.emailVerified === false && <EmailVerificationCard u={u} />}
      <nav className="tabs shell-profile-tabs" aria-label="Điều hướng hồ sơ">
        {tabs.map((t) => <Link key={t.id} className="tab" to={tabHref(t.id)} aria-current={t.id === tab ? 'page' : undefined}>{t.label}</Link>)}
      </nav>
      <div className="shell-profile-grid">
        <div className="stack-4" style={{ minWidth: 0 }}>
          <ProfileCard u={u} />
          <ProfileStats data={data} />
        </div>
        {tab === 'nang-luc' ? <CapabilityBody query={query} /> : <OverviewBody data={data} tab={tab} />}
      </div>
    </div>
  );
}

export function ProfilePage({ query }) {
  useCodi();
  const u = accountUser();
  if (!u) return null; // the role guard in App renders the sign-in page first
  return <ProfileView key={u.id} u={u} query={query} />;
}
