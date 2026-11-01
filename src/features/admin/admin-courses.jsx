/** S33 "Khóa học đã xuất bản" — hide / unhide with consequence dialogs, price change dialog. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Icon, Alert, CourseStatus } from '../../components/ui/primitives';
import { AdminShell, db, persist, parsePrice } from './admin-shell';

const { fmt } = Codi;
const priceText = (p) => (p ? fmt.vnd(p) : 'Miễn phí');

async function hideCourse(c) {
  const learners = db().enrolments.filter((e) => e.courseId === c.id).length;
  const r = await Codi.ui.confirm({ title: `Ẩn "${c.title}"?`, consequence: `Học viên mới sẽ không tìm thấy và không mua được khoá học. ${learners} học viên đã mua vẫn tiếp tục học bình thường. Giảng viên nhận thông báo kèm lý do.`, reversible: 'Có thể hiện lại bất cứ lúc nào.', requireReason: true, reasonLabel: 'Lý do ẩn (gửi cho giảng viên)', confirmLabel: 'Ẩn khoá học', danger: true });
  if (!r.ok) return;
  Object.assign(c, { status: 'hidden', hideReason: r.reason });
  Codi.notify(c.lecturerId, { title: 'Khoá học đã bị ẩn', body: `${c.title}: ${r.reason}`, link: `/teach/courses/${c.id}/publish` });
  persist(); Codi.ui.toast('Đã ẩn khoá học.');
}

async function unhideCourse(c) {
  const r = await Codi.ui.confirm({ title: `Hiện lại "${c.title}"?`, consequence: 'Khoá học xuất hiện lại trong danh sách và mở bán.', reversible: true, confirmLabel: 'Hiện lại' });
  if (!r.ok) return;
  Object.assign(c, { status: 'published', hideReason: null });
  Codi.notify(c.lecturerId, { title: 'Khoá học đã hiện lại', body: c.title, link: `/teach/courses/${c.id}/publish` });
  persist(); Codi.ui.toast('Khoá học đã mở bán trở lại.', { type: 'success' });
}

function PriceDialog({ handle, courseId }) {
  const c = Codi.course(courseId);
  const [val, setVal] = useState(String(c ? c.price : ''));
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!c) return null;
  const parsed = parsePrice(val);
  const save = async () => {
    const price = parsePrice(val);
    if (price === null) { setErr('Giá phải là số nguyên không âm.'); return; }
    if (price === c.price) { setErr('Giá mới đang trùng giá hiện tại.'); return; }
    // Price change is confirmed with old → new and its scope before it applies.
    setBusy(true);
    const r = await Codi.ui.confirm({ title: `Đổi giá "${c.title}"?`, body: `${priceText(c.price)} → ${priceText(price)}.`, consequence: 'Giá mới áp dụng cho đơn hàng mới; đơn đang chờ thanh toán giữ giá cũ. Giảng viên nhận thông báo.', reversible: true, confirmLabel: 'Lưu giá mới' });
    setBusy(false);
    if (!r.ok) return;
    const old = c.price; c.price = price;
    Codi.notify(c.lecturerId, { title: 'Giá khoá học đã thay đổi', body: `${c.title}: ${fmt.vnd(old)} → ${fmt.vnd(price)}`, link: `/teach/courses/${c.id}/publish` });
    handle.close(); persist(); Codi.ui.toast('Đã cập nhật giá.', { type: 'success' });
  };
  return (
    <>
      <div className="dialog-body">
        <div className="stack-3">
          <p className="small">Giá hiện tại: <strong>{priceText(c.price)}</strong></p>
          <div className={`field ${err ? 'is-invalid' : ''}`}>
            <label htmlFor="np">Giá mới (VND)</label>
            <input id="np" inputMode="numeric" value={val} autoFocus onChange={(e) => { setVal(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
            <span className="field-help">{parsed !== null ? '= ' + fmt.vnd(parsed) : 'Nhập số, ví dụ 990000'}</span>
            {err && <p className="field-error"><Icon name="alert-circle" className="icon-sm" /><span>{err}</span></p>}
          </div>
          <Alert type="warn" title="Điều gì sẽ xảy ra" body="Giá mới áp dụng cho đơn hàng mới; đơn đang chờ thanh toán giữ giá cũ. Giảng viên nhận thông báo." />
        </div>
      </div>
      <div className="dialog-footer">
        <button type="button" className="btn btn-ghost" onClick={() => handle.close()}>Huỷ</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>Lưu giá mới</button>
      </div>
    </>
  );
}

const changePrice = (c) => Codi.ui.modal({ title: `Đổi giá "${c.title}"`, raw: true, body: (h) => <PriceDialog handle={h} courseId={c.id} /> });

export function CoursesPage() {
  useCodi();
  const list = db().courses.filter((c) => ['published', 'hidden'].includes(c.status));
  return (
    <AdminShell active="/admin/courses">
      <div className="page-header"><div><h1>Khóa học đã xuất bản</h1><p className="muted">Ẩn khoá học hoặc đổi giá. Mọi thay đổi đều được thông báo cho giảng viên.</p></div></div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Khoá học</th><th>Giảng viên</th><th className="num">Giá</th><th className="num">Học viên</th><th>Đánh giá</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        {list.map((c) => (
          <tr key={c.id}>
            <td><Link to={`/courses/${c.slug}`}>{c.title}</Link></td>
            <td>{(Codi.user(c.lecturerId) || {}).name}</td>
            <td className="num">{priceText(c.price)}</td>
            <td className="num">{fmt.num(db().enrolments.filter((e) => e.courseId === c.id).length)}</td>
            <td className="od-nowrap">{c.ratingCount ? <>{c.rating.toFixed(1)} <Icon name="star-filled" className="icon-sm ad-star" /> ({c.ratingCount})</> : '—'}</td>
            <td><CourseStatus status={c.status} />{c.status === 'hidden' && <span className="xsmall muted" style={{ display: 'block', maxWidth: 220 }}>{c.hideReason}</span>}</td>
            <td><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
              {c.status === 'published'
                ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => hideCourse(c)}>Ẩn khóa học</button>
                : <button type="button" className="btn btn-ghost btn-sm" onClick={() => unhideCourse(c)}>Hiện lại</button>}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => changePrice(c)}>Đổi giá</button>
            </div></td>
          </tr>
        ))}
      </tbody></table></div>
    </AdminShell>
  );
}
