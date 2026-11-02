/**
 * S35 "Voucher" — port of the real vouchers page: list with usage meter and active switch (deactivation confirmed),
 * create / edit sheet with radio options, ?filter=expiring (active, limited, used >= 90 %). Vouchers apply to the
 * whole cart, one voucher per order (PO decision 14/10).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Icon, Empty, Progress } from '../../components/ui/primitives';
import { AdminShell, db, persist } from './admin-shell';

const { fmt } = Codi;

async function toggleVoucher(v, on) {
  if (!on) {
    const r = await Codi.ui.confirm({ title: `Tắt mã ${v.code}?`, consequence: 'Mã ngừng áp dụng ngay cho đơn hàng mới. Đơn đã tạo trước đó giữ nguyên giảm giá.', reversible: 'Bật lại bất cứ lúc nào.', confirmLabel: 'Tắt mã', danger: true });
    if (!r.ok) return; // the switch is controlled by v.active, so it stays on
  }
  v.active = on; persist(); Codi.ui.toast(v.active ? `Đã bật mã ${v.code}.` : `Đã tắt mã ${v.code}.`);
}

const draftOf = (v) => (v
  ? { id: v.id, code: v.code, type: v.type, value: String(v.value), minMode: v.minOrder ? 'set' : 'none', minOrder: String(v.minOrder || ''), limitMode: v.usageLimit === null ? 'none' : 'set', usageLimit: v.usageLimit === null ? '' : String(v.usageLimit), expMode: v.expiresAt ? 'set' : 'none', expiresAt: v.expiresAt || '' }
  : { id: null, code: '', type: 'percent', value: '', minMode: 'none', minOrder: '', limitMode: 'none', usageLimit: '', expMode: 'none', expiresAt: '' });

const toNum = (s) => (/^\d+$/.test(String(s).replace(/[.\s,]/g, '')) ? Number(String(s).replace(/[.\s,]/g, '')) : null);

function VoucherForm({ handle, voucherId }) {
  const v = voucherId ? db().vouchers.find((x) => x.id === voucherId) : null;
  const [d, setD] = useState(() => draftOf(v));
  const [e, setE] = useState({});
  const set = (k, val) => setD((cur) => ({ ...cur, [k]: k === 'code' ? String(val).toUpperCase() : val }));

  const save = () => {
    const err = {};
    const code = d.code.trim();
    if (!d.id && !/^[A-Z0-9]{4,20}$/.test(code)) err.code = 'Mã gồm 4–20 ký tự chữ in hoa hoặc số.';
    else if (!d.id && db().vouchers.some((x) => x.code === code)) err.code = 'Mã này đã tồn tại.';
    const val = toNum(d.value);
    if (val === null || val <= 0) err.value = 'Nhập số lớn hơn 0.';
    else if (d.type === 'percent' && val > 100) err.value = 'Phần trăm tối đa là 100.';
    const min = d.minMode === 'set' ? toNum(d.minOrder) : 0;
    if (d.minMode === 'set' && (min === null || min <= 0)) err.minOrder = 'Nhập giá trị đơn tối thiểu hợp lệ.';
    const lim = d.limitMode === 'set' ? toNum(d.usageLimit) : null;
    if (d.limitMode === 'set' && (lim === null || lim < 1)) err.usageLimit = 'Số lượt phải từ 1 trở lên.';
    if (d.expMode === 'set' && (!d.expiresAt || new Date(d.expiresAt + 'T23:59:59') < new Date())) err.expiresAt = 'Chọn một ngày từ hôm nay trở đi.';
    if (Object.keys(err).length) { setE(err); return; }
    const data = { code, type: d.type, value: val, minOrder: min || 0, usageLimit: lim, expiresAt: d.expMode === 'set' ? d.expiresAt : null, scope: 'all' };
    if (v) Object.assign(v, data); else db().vouchers.unshift({ id: Codi.uid('v'), used: 0, active: true, ...data });
    handle.close(); persist(); Codi.ui.toast(v ? `Đã lưu thay đổi cho voucher ${v.code}.` : `Đã tạo voucher ${code}.`, { type: 'success' });
  };

  const fe = (k) => (e[k] ? <p className="field-error"><Icon name="alert-circle" className="icon-sm" /><span>{e[k]}</span></p> : null);
  const radio = (name, val, label) => (
    <label className="check"><input type="radio" name={name} value={val} checked={d[name] === val} onChange={() => set(name, val)} /> {label}</label>
  );
  const fs = { border: 0, padding: 0, margin: 0 };
  return (
    <>
      <div className="sheet-body">
        <p className="small muted" style={{ marginTop: 0 }}>Mã giảm giá áp dụng khi thanh toán toàn giỏ hàng.</p>
        <form className="stack-4" id="vf" noValidate onSubmit={(ev) => { ev.preventDefault(); save(); }}>
          <div className={`field ${e.code ? 'is-invalid' : ''}`}><label htmlFor="vf-code">Mã voucher <span className="req">*</span></label>
            <input id="vf-code" name="code" value={d.code} placeholder="Ví dụ: CODI2026" style={{ textTransform: 'uppercase' }} readOnly={!!d.id} onChange={(ev) => set('code', ev.target.value)} />
            <span className="field-help">{d.id ? 'Không thể đổi mã sau khi tạo.' : '4–20 ký tự, chữ in hoa và chữ số.'}</span>{fe('code')}</div>
          <fieldset className="field" style={fs}><legend className="field-label">Loại giảm giá</legend><div className="row">{radio('type', 'percent', 'Phần trăm (%)')}{radio('type', 'amount', 'Số tiền (VND)')}</div></fieldset>
          <div className={`field ${e.value ? 'is-invalid' : ''}`}><label htmlFor="vf-value">{d.type === 'percent' ? 'Mức giảm (%)' : 'Số tiền giảm (VND)'} <span className="req">*</span></label>
            <input id="vf-value" name="value" inputMode="numeric" placeholder={d.type === 'percent' ? 'Ví dụ: 20' : 'Ví dụ: 100000'} value={d.value} onChange={(ev) => set('value', ev.target.value)} />{fe('value')}</div>
          <fieldset className="field" style={fs}><legend className="field-label">Đơn tối thiểu</legend><div className="row">{radio('minMode', 'none', 'Không yêu cầu')}{radio('minMode', 'set', 'Từ số tiền')}</div>
            {d.minMode === 'set' && <div className={`field ${e.minOrder ? 'is-invalid' : ''}`}><label htmlFor="vf-min">Giá trị đơn tối thiểu (VND)</label><input id="vf-min" name="minOrder" inputMode="numeric" placeholder="Ví dụ: 500000" value={d.minOrder} onChange={(ev) => set('minOrder', ev.target.value)} />{fe('minOrder')}</div>}</fieldset>
          <fieldset className="field" style={fs}><legend className="field-label">Giới hạn lượt dùng</legend><div className="row">{radio('limitMode', 'none', 'Không giới hạn')}{radio('limitMode', 'set', 'Giới hạn N lượt')}</div>
            {d.limitMode === 'set' && <div className={`field ${e.usageLimit ? 'is-invalid' : ''}`}><label htmlFor="vf-limit">Số lượt tối đa</label><input id="vf-limit" name="usageLimit" inputMode="numeric" placeholder="Ví dụ: 100" value={d.usageLimit} onChange={(ev) => set('usageLimit', ev.target.value)} />{fe('usageLimit')}</div>}</fieldset>
          <fieldset className="field" style={fs}><legend className="field-label">Hạn dùng</legend><div className="row">{radio('expMode', 'none', 'Không hết hạn')}{radio('expMode', 'set', 'Đến ngày cụ thể')}</div>
            {d.expMode === 'set' && <div className={`field ${e.expiresAt ? 'is-invalid' : ''}`}><label htmlFor="vf-exp">Ngày hết hạn</label><input id="vf-exp" name="expiresAt" type="date" value={d.expiresAt} onChange={(ev) => set('expiresAt', ev.target.value)} />{fe('expiresAt')}</div>}</fieldset>
          <div className="panel stack-1"><span className="small strong">Phạm vi áp dụng</span><span className="xsmall muted">Áp dụng cho toàn bộ đơn hàng (cả giỏ hàng), 1 voucher / đơn (theo Quyết định PO 14/10).</span></div>
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </div>
      <div className="sheet-footer">
        <button type="button" className="btn btn-ghost" onClick={() => handle.close()}>Huỷ</button>
        <button type="button" className="btn btn-primary" onClick={save}>{v ? 'Lưu thay đổi' : 'Tạo voucher'}</button>
      </div>
    </>
  );
}

function openVoucherForm(v) {
  Codi.ui.sheet({ title: v ? `Sửa voucher ${v.code}` : 'Tạo voucher', raw: true, body: (h) => <VoucherForm handle={h} voucherId={v ? v.id : null} /> });
}

/** Same usage-exhaustion predicate as the dashboard tile (not calendar expiry). */
const nearLimit = (v) => v.active && Number(v.usageLimit) > 0 && Number(v.used) * 10 >= Number(v.usageLimit) * 9;

export function VouchersPage({ query: q = {} }) {
  useCodi();
  const expiring = q.filter === 'expiring';
  const all = db().vouchers;
  const list = expiring ? all.filter(nearLimit) : all;
  const today = new Date();
  return (
    <AdminShell active="/admin/vouchers">
      <div className="page-header"><div><h1>Voucher</h1><p className="muted">Mã giảm giá áp dụng ở giỏ hàng. Tắt mã để ngừng áp dụng cho đơn mới.</p><p className="small muted" style={{ margin: 0 }}>{all.length} mã giảm giá trong hệ thống</p></div>
        <button type="button" className="btn btn-primary" onClick={() => openVoucherForm(null)}><Icon name="plus" /> Tạo voucher</button></div>
      {expiring && <p className="small ad-filter-note">Voucher sắp hết lượt · Đang bật, giới hạn lượt lớn hơn 0, đã dùng từ 90% số lượt. <Link to="/admin/vouchers">Xem tất cả voucher</Link></p>}
      {list.length ? (
        <div className="table-wrap"><table className="table"><thead><tr><th>Mã</th><th>Giảm</th><th>Đơn tối thiểu</th><th>Đã dùng</th><th>Hạn dùng</th><th>Hoạt động</th><th /></tr></thead><tbody>
          {list.map((v) => {
            const expired = v.expiresAt && new Date(v.expiresAt + 'T23:59:59') < today;
            const full = v.usageLimit !== null && v.used >= v.usageLimit;
            return (
              <tr key={v.id}>
                <td className="mono strong">{v.code}</td>
                <td className="od-nowrap">{v.type === 'percent' ? v.value + '%' : fmt.vnd(v.value)}</td>
                <td className="od-nowrap">{v.minOrder ? fmt.vnd(v.minOrder) : 'Không yêu cầu'}</td>
                <td style={{ minWidth: 140 }}>{v.usageLimit === null
                  ? <span className="small">{fmt.num(v.used)} / Không giới hạn</span>
                  : <div className="stack-1"><Progress pct={(v.used / v.usageLimit) * 100} label={`Đã dùng ${v.code}`} /><span className={`xsmall ${full ? 'text-danger' : ''}`}>{fmt.num(v.used)}/{fmt.num(v.usageLimit)}{full ? ' · hết lượt' : ''}</span></div>}</td>
                <td className="od-nowrap small">{v.expiresAt ? <span className={expired ? 'text-danger' : ''}>{fmt.date(v.expiresAt)}{expired ? ' · đã hết hạn' : ''}</span> : 'Không hết hạn'}</td>
                <td><label className="switch"><input type="checkbox" checked={!!v.active} onChange={(ev) => toggleVoucher(v, ev.target.checked)} aria-label={`Bật/tắt ${v.code}`} /><span className="switch-track" /><span className="small">{v.active ? 'Đang bật' : 'Đã tắt'}</span></label></td>
                <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => openVoucherForm(v)}>Sửa</button></td>
              </tr>
            );
          })}
        </tbody></table></div>
      ) : (
        <div className="card"><Empty icon="ticket" title={expiring ? 'Không có voucher sắp hết lượt' : 'Chưa có voucher'} body={expiring ? '' : 'Tạo mã giảm giá đầu tiên để áp dụng cho đơn hàng mới.'} actions={<button type="button" className="btn btn-primary" onClick={() => openVoucherForm(null)}>Tạo voucher</button>} /></div>
      )}
    </AdminShell>
  );
}
