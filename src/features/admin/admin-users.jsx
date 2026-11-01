/**
 * S31 "Người dùng" — port of the real users page: status chips with counts, search, status select, role chips
 * (active chip removable), role change by select + "Lưu" + confirm dialog (real role-select), deactivate dialog with
 * impact counts + reason + "Tôi hiểu tác động" gate, reactivate.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Icon, Avatar, Empty } from '../../components/ui/primitives';
import { AdminShell, db, me, persist, confirmImpact } from './admin-shell';

const { fmt, ROLE_LABEL: ROLE } = Codi;
const ROLE_CHIPS = [['all', 'Tất cả'], ['learner', 'Học viên'], ['lecturer', 'Giảng viên'], ['admin', 'Quản trị viên']];
const STATUS_CHIPS = [['all', 'Tất cả'], ['active', 'Đang hoạt động'], ['inactive', 'Đã vô hiệu hoá']];

const ROLE_DESC = { learner: 'chỉ học và mua khoá học', lecturer: 'tạo và quản lý khoá học của mình, chấm bài', admin: 'toàn quyền quản trị (người dùng, giá, đơn hàng)' };

/** Real role-select: pick a role, "Lưu" (enabled only when changed) opens the confirm; cancel reverts the draft. */
function RoleSelect({ u, disabled }) {
  const [draft, setDraft] = useState(u.role);
  const changed = draft !== u.role;
  const save = async () => {
    if (!changed) return;
    const r = await Codi.ui.confirm({ title: `Đổi vai trò của ${u.name}?`, body: `${ROLE[u.role]} → ${ROLE[draft]}. Người dùng sẽ ${ROLE_DESC[draft]}. Thay đổi có hiệu lực ở lần tải trang tiếp theo của họ.`, confirmLabel: 'Đổi vai trò' });
    if (!r.ok) { setDraft(u.role); return; }
    u.role = draft; persist(); Codi.ui.toast('Đã cập nhật vai trò người dùng.', { type: 'success' });
  };
  return (
    <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
      <label className="sr-only" htmlFor={`role-${u.id}`}>Vai trò của {u.name}</label>
      <select id={`role-${u.id}`} className="select ad-role" value={draft} disabled={disabled} title={disabled ? 'Không thể đổi vai trò của chính bạn' : undefined} onChange={(e) => setDraft(e.target.value)}>
        {Object.keys(ROLE).filter((k) => k !== 'guest').map((k) => <option key={k} value={k}>{ROLE[k]}</option>)}
      </select>
      <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || !changed} onClick={save}>Lưu</button>
    </div>
  );
}

async function deactivate(u) {
  const d = db();
  const ownedCourses = d.enrolments.filter((e) => e.userId === u.id && d.courses.find((c) => c.id === e.courseId && c.status === 'published')).length;
  const pendingOrders = d.orders.filter((o) => o.userId === u.id && o.status === 'pending').length;
  const taughtCourses = d.courses.filter((c) => c.lecturerId === u.id && c.status === 'published').length;
  const r = await confirmImpact({
    title: `Vô hiệu hoá ${u.name}?`,
    body: (
      <div className="stack-2">
        <p>{u.email}</p>
        <div className="ad-impact-list">
          <div className="ad-impact-item"><span className="ad-impact-icon"><Icon name="book-open" className="icon-sm" /></span><span className="ad-impact-text"><strong>{ownedCourses}</strong> khoá học đang sở hữu</span></div>
          <div className="ad-impact-item"><span className="ad-impact-icon"><Icon name="receipt" className="icon-sm" /></span><span className="ad-impact-text"><strong>{pendingOrders}</strong> đơn hàng chờ thanh toán</span></div>
          <div className="ad-impact-item"><span className="ad-impact-icon"><Icon name="presentation" className="icon-sm" /></span><span className="ad-impact-text">Đang giảng dạy <strong>{taughtCourses}</strong> khoá học</span></div>
        </div>
      </div>
    ),
    consequence: 'Tài khoản bị đăng xuất khỏi mọi thiết bị và không thể đăng nhập. Dữ liệu học tập và đơn hàng được giữ nguyên.',
    reversible: 'Có thể kích hoạt lại bất cứ lúc nào.',
    requireReason: true,
    reasonLabel: 'Lý do (chỉ quản trị viên xem được)',
    reasonPlaceholder: 'Ví dụ: vi phạm điều khoản dịch vụ, spam...',
    confirmLabel: 'Vô hiệu hoá',
    danger: true,
    requireConsent: 'Tôi hiểu tác động',
  });
  if (!r.ok) return;
  u.status = 'inactive'; u.deactivation = { reason: r.reason, at: new Date().toISOString(), by: me().id };
  persist(); Codi.ui.toast(`Đã vô hiệu hoá ${u.name}.`);
}

async function reactivate(u) {
  const r = await Codi.ui.confirm({ title: `Kích hoạt lại ${u.name}?`, consequence: 'Người dùng đăng nhập lại được và truy cập toàn bộ dữ liệu cũ.', reversible: true, confirmLabel: 'Kích hoạt lại' });
  if (!r.ok) return;
  u.status = 'active'; u.deactivation = null; persist(); Codi.ui.toast(`Đã kích hoạt lại ${u.name}.`, { type: 'success' });
}

export function UsersPage({ query: q }) {
  useCodi();
  const role = q.role || 'all'; const status = q.status || 'all'; const term = (q.q || '').toLowerCase();
  const all = db().users;
  const list = all.filter((u) => (role === 'all' || u.role === role) && (status === 'all' || u.status === status) && (!term || (u.name + ' ' + u.email).toLowerCase().includes(term)));
  const link = (patch) => '/admin/users?' + new URLSearchParams({ role, status, q: q.q || '', ...patch }).toString();
  const self = me();

  const onSearch = (e) => { e.preventDefault(); Codi.go(link({ q: String(new FormData(e.currentTarget).get('q') || '').trim() })); };
  const anyFilter = role !== 'all' || status !== 'all' || !!term;

  return (
    <AdminShell active="/admin/users">
      <div className="page-header"><div><h1>Người dùng</h1><p className="muted">{all.length} tài khoản</p></div></div>
      <form className="ad-filters" onSubmit={onSearch}>
        <div className="field"><label htmlFor="u-q">Tìm theo tên hoặc email</label>
          <div className="input-group"><input id="u-q" name="q" className="input" placeholder="Nhập tên hoặc email..." defaultValue={q.q || ''} key={q.q || ''} /><button className="btn btn-secondary" type="submit"><Icon name="search" className="icon-sm" /> Tìm</button></div></div>
        <div className="field"><label htmlFor="u-status">Trạng thái</label>
          <select id="u-status" value={status} onChange={(e) => Codi.go(link({ status: e.target.value }))}>
            <option value="all">Tất cả</option><option value="active">Đang hoạt động</option><option value="inactive">Đã vô hiệu hoá</option>
          </select></div>
        {anyFilter && <div className="field ad-field-end"><Link className="btn btn-secondary btn-sm" to="/admin/users">Xoá bộ lọc</Link></div>}
      </form>
      <div className="od-cluster" style={{ margin: '12px 0 0' }} role="group" aria-label="Lọc theo trạng thái">
        {STATUS_CHIPS.map(([k, l]) => (
          <Link key={k} className={`chip chip-btn ${status === k ? 'ad-chip-on' : ''}`} to={link({ status: status === k && k !== 'all' ? 'all' : k })} aria-current={status === k ? 'true' : undefined}>
            {l} ({k === 'all' ? all.length : all.filter((u) => u.status === k).length})
          </Link>
        ))}
      </div>
      <div className="od-cluster" style={{ margin: '12px 0' }} role="group" aria-label="Lọc theo vai trò">
        {ROLE_CHIPS.map(([k, l]) => {
          const label = `${l} (${k === 'all' ? all.length : all.filter((u) => u.role === k).length})`;
          if (role === k && k !== 'all') {
            return (
              <span key={k} className="chip ad-chip-on" aria-current="true">{label}
                <button type="button" aria-label={`Bỏ lọc vai trò ${l}`} onClick={() => Codi.go(link({ role: 'all' }))}><Icon name="x" className="icon-sm" /></button>
              </span>
            );
          }
          return <Link key={k} className={`chip chip-btn ${role === k ? 'ad-chip-on' : ''}`} to={link({ role: k })} aria-current={role === k ? 'true' : undefined}>{label}</Link>;
        })}
      </div>
      {list.length ? (
        <div className="table-wrap"><table className="table"><thead><tr><th>Họ và tên</th><th>Email</th><th>Ngày tham gia</th><th>Vai trò</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>
          {list.map((u) => {
            const isSelf = !!self && u.id === self.id;
            return (
              <tr key={u.id}>
                <td><div className="row"><Avatar user={u} size="sm" /><strong className="small">{u.name}{isSelf && <span className="xsmall muted"> (bạn)</span>}</strong></div></td>
                <td className="small muted">{u.email}</td>
                <td className="od-nowrap small">{fmt.date(u.createdAt)}</td>
                <td><RoleSelect key={`${u.id}-${u.role}`} u={u} disabled={isSelf} /></td>
                <td>{u.status === 'active'
                  ? <span className="badge badge-success"><span className="status-dot" />Đang hoạt động</span>
                  : <div className="stack-1"><span className="badge badge-neutral"><span className="status-dot" />Đã vô hiệu hoá</span>{u.deactivation && <span className="xsmall muted">Lý do (nội bộ): {u.deactivation.reason} · {fmt.date(u.deactivation.at)}</span>}</div>}</td>
                <td>{isSelf ? <span className="xsmall muted">Tài khoản của bạn</span>
                  : u.status === 'active' ? <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => deactivate(u)}>Vô hiệu hoá</button>
                    : <button type="button" className="btn btn-secondary btn-sm" onClick={() => reactivate(u)}>Kích hoạt lại</button>}</td>
              </tr>
            );
          })}
        </tbody></table></div>
      ) : (
        <div className="card"><Empty icon="users" title="Không có người dùng phù hợp" body="Thử thay đổi từ khoá tìm kiếm hoặc bỏ bớt các bộ lọc đang chọn." actions={anyFilter ? <Link className="btn btn-secondary" to="/admin/users">Xoá bộ lọc</Link> : null} /></div>
      )}
    </AdminShell>
  );
}
