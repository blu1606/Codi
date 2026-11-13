/**
 * Admin "Chứng chỉ" ('/admin/certificates'): every issued certificate, newest first. Search by holder, email, course or
 * code; filter valid / revoked. Revoke and restore happen on the certificate's own /verify page (one place for it).
 * Data: GET /api/admin/certificates.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmt } from '../../lib/format';
import { Empty, Icon } from '../../components/ui/primitives';
import { AdminShell, Loaded } from './admin-shell';
import { useAdminGet } from './admin-data';

const FILTERS = [['all', 'Tất cả'], ['valid', 'Hợp lệ'], ['revoked', 'Đã thu hồi']];
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function CertificatesPage() {
  const res = useAdminGet('/api/admin/certificates');
  return (
    <AdminShell active="/admin/certificates">
      <Loaded res={res} text="Đang tải chứng chỉ…">{() => <CertificatesView list={res.data.certificates} />}</Loaded>
    </AdminShell>
  );
}

function CertificatesView({ list }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const counts = { all: list.length, valid: list.filter((c) => c.status === 'valid').length, revoked: list.filter((c) => c.status === 'revoked').length };
  const shown = useMemo(() => {
    const needle = fold(q.trim());
    return list.filter((c) => (filter === 'all' || c.status === filter)
      && (!needle || [c.recipientName, c.email, c.courseTitle, c.code].some((v) => fold(v).includes(needle))));
  }, [list, q, filter]);
  return (
    <>
      <div className="page-header"><div><h1>Chứng chỉ</h1>
        <p className="muted">Chứng chỉ được cấp tự động khi học viên hoàn thành mọi bài bắt buộc. Mở một chứng chỉ để xem bản in, thu hồi hoặc khôi phục.</p>
        <p className="small muted" style={{ margin: 0 }}>{fmt.num(counts.all)} chứng chỉ · {fmt.num(counts.valid)} hợp lệ · {fmt.num(counts.revoked)} đã thu hồi</p></div>
        <Link className="btn btn-secondary" to="/verify"><Icon name="shield" className="icon-sm" /> Trang xác minh công khai</Link></div>
      <div className="row ad-cert-tools">
        <label className="sr-only" htmlFor="ad-cert-q">Tìm chứng chỉ</label>
        <input id="ad-cert-q" className="input ad-cert-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên, email, khoá học hoặc mã CODI-…" />
        <div className="row" role="group" aria-label="Lọc theo trạng thái">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" className={`chip ${filter === k ? 'is-on' : ''}`.trim()} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} <span className="muted">{counts[k]}</span></button>
          ))}
        </div>
      </div>
      {shown.length ? (
        <div className="table-wrap"><table className="table"><thead><tr><th>Mã</th><th>Người nhận</th><th>Khoá học</th><th>Ngày cấp</th><th>Trạng thái</th><th /></tr></thead><tbody>
          {shown.map((c) => (
            <tr key={c.code}>
              <td className="mono strong od-nowrap">{c.code}</td>
              <td><div className="stack-1"><span className="strong">{c.recipientName}</span>{c.email && <span className="xsmall muted">{c.email}</span>}{c.nameEdited && <span className="xsmall muted">Đã sửa tên một lần</span>}</div></td>
              <td>{c.courseTitle}</td>
              <td className="od-nowrap small">{fmt.date(c.issuedAt)}</td>
              <td>{c.status === 'valid'
                ? <span className="badge badge-success">Hợp lệ</span>
                : <div className="stack-1"><span className="badge badge-danger">Đã thu hồi</span><span className="xsmall muted" title={c.revokedReason || ''}>{fmt.date(c.revokedAt)}</span></div>}</td>
              <td><Link className="btn btn-ghost btn-sm" to={`/verify/${c.code}`}>Mở</Link></td>
            </tr>
          ))}
        </tbody></table></div>
      ) : list.length
        ? <Empty icon="search" title="Không có chứng chỉ khớp" body="Thử từ khoá khác hoặc bỏ bộ lọc." actions={<button type="button" className="btn btn-secondary" onClick={() => { setQ(''); setFilter('all'); }}>Xoá bộ lọc</button>} />
        : <Empty icon="graduation-cap" title="Chưa có chứng chỉ nào" body="Chứng chỉ xuất hiện ở đây khi học viên đầu tiên hoàn thành một khoá học." />}
    </>
  );
}
