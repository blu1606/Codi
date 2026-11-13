/**
 * Public certificate verification ('/verify', '/verify/:code'), no sign-in needed.
 * States: no code (lookup form) · checking · valid · revoked · not found · bad format · rate limited · error (retry).
 * The same page gives the holder their actions (PDF, copy link, LinkedIn, correct the name once) and an admin
 * revoke / restore; a guest only reads. Never shows the holder's email.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { fmt } from '../../lib/format';
import { Alert, CopyButton, Icon } from '../../components/ui/primitives';
import CertificateRender, { lengthLabel } from './certificate-render';
import { certificateApi, linkedInUrl, normalizeCode, verifyPath, verifyUrl } from './certificates-api';

function Lookup({ initial = '', autoFocus = false }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    const code = normalizeCode(value);
    if (!code) { setError('Mã gồm 8 ký tự sau CODI-, ví dụ CODI-7KQ2-M9XA.'); return; }
    setError(null);
    navigate(verifyPath(code));
  };
  return (
    <form className="vf-lookup" onSubmit={submit} noValidate>
      <label htmlFor="vf-code" className="strong">Mã chứng chỉ</label>
      <div className="vf-lookup-row">
        <input id="vf-code" className="input vf-code-input" value={value} onChange={(e) => { setValue(e.target.value); setError(null); }}
          placeholder="CODI-XXXX-XXXX" autoComplete="off" spellCheck={false} autoFocus={autoFocus}
          aria-invalid={error ? true : undefined} aria-describedby={error ? 'vf-code-error' : 'vf-code-help'} />
        <button type="submit" className="btn btn-primary"><Icon name="shield" className="icon-sm" /> Xác minh</button>
      </div>
      {error
        ? <p id="vf-code-error" className="small text-danger" role="alert">{error}</p>
        : <p id="vf-code-help" className="small muted">Mã in ở góc trên bên phải chứng chỉ. Không phân biệt chữ hoa, chữ thường.</p>}
    </form>
  );
}

function LookupPage() {
  return (
    <div className="page page-narrow vf-page">
      <div className="stack-2">
        <h1>Xác minh chứng chỉ Codi</h1>
        <p className="muted">Nhập mã chứng chỉ để kiểm tra chứng chỉ do Codi cấp có thật và còn hiệu lực hay không.</p>
      </div>
      <div className="card"><div className="card-body"><Lookup autoFocus /></div></div>
    </div>
  );
}

function StatusBanner({ cert }) {
  if (cert.status === 'revoked') {
    return (
      <div className="vf-status is-revoked" role="status">
        <Icon name="x-circle" className="icon-lg" />
        <div className="stack-1">
          <strong>Chứng chỉ đã bị thu hồi</strong>
          <span className="small">Codi đã thu hồi chứng chỉ này ngày {fmt.date(cert.revokedAt)}. Chứng chỉ không còn hiệu lực.</span>
          {cert.revokedReason && <span className="small">Lý do: {cert.revokedReason}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className="vf-status is-valid" role="status">
      <Icon name="check-circle" className="icon-lg" />
      <div className="stack-1">
        <strong>Chứng chỉ hợp lệ</strong>
        <span className="small">Do Codi cấp ngày {fmt.date(cert.issuedAt)} cho {cert.recipientName}.</span>
      </div>
    </div>
  );
}

function RenameForm({ cert, onSaved, onCancel }) {
  const [name, setName] = useState(cert.recipientName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const ok = (await Codi.ui.confirm({
      title: 'Lưu tên mới trên chứng chỉ?',
      body: `Tên in trên chứng chỉ sẽ là “${name.trim()}”.`,
      consequence: 'Bạn chỉ sửa được tên một lần. Sau đó muốn sửa nữa phải liên hệ quản trị viên.',
      confirmLabel: 'Lưu tên', cancelLabel: 'Xem lại',
    })).ok;
    if (!ok) return;
    setBusy(true); setError(null);
    try { onSaved(await certificateApi.act(cert.code, { action: 'rename', name })); Codi.ui.toast('Đã cập nhật tên trên chứng chỉ.', { type: 'success' }); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <form className="stack-2" onSubmit={save}>
      <label htmlFor="vf-name" className="small strong">Tên in trên chứng chỉ</label>
      <input id="vf-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus
        aria-invalid={error ? true : undefined} aria-describedby="vf-name-note" />
      <p id="vf-name-note" className={`small ${error ? 'text-danger' : 'muted'}`} role={error ? 'alert' : undefined}>
        {error || 'Ví dụ viết đủ dấu. Chỉ sửa được một lần.'}
      </p>
      <div className="row">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || name.trim() === cert.recipientName} aria-busy={busy || undefined}>Lưu</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>Huỷ</button>
      </div>
    </form>
  );
}

function HolderActions({ cert, onChange }) {
  const [renaming, setRenaming] = useState(false);
  if (renaming) return <RenameForm cert={cert} onSaved={(c) => { onChange(c); setRenaming(false); }} onCancel={() => setRenaming(false)} />;
  const valid = cert.status === 'valid';
  return (
    <div className="stack-2">
      {valid && <button type="button" className="btn btn-primary" onClick={() => window.print()}><Icon name="download" className="icon-sm" /> Tải PDF</button>}
      <CopyButton text={verifyUrl(cert.code)} label="Sao chép link xác minh" className="btn btn-secondary" />
      {valid && <a className="btn btn-secondary" href={linkedInUrl(cert)} target="_blank" rel="noopener noreferrer"><Icon name="external-link" className="icon-sm" /> Thêm vào LinkedIn</a>}
      {cert.viewer.canRename
        ? <button type="button" className="btn btn-ghost" onClick={() => setRenaming(true)}><Icon name="pencil" className="icon-sm" /> Sửa tên trên chứng chỉ</button>
        : valid && cert.viewer.nameEdited && <p className="small muted">Bạn đã dùng lượt sửa tên. Liên hệ quản trị viên nếu cần sửa thêm.</p>}
      {valid && <p className="small muted">Mẹo: trong hộp thoại in, chọn “Lưu dưới dạng PDF”.</p>}
    </div>
  );
}

function AdminActions({ cert, onChange }) {
  const [busy, setBusy] = useState(false);
  const run = async (body, done) => {
    setBusy(true);
    try { onChange(await certificateApi.act(cert.code, body)); Codi.ui.toast(done, { type: 'success' }); }
    catch (err) { Codi.ui.toast(err.message, { type: 'danger' }); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    const r = await Codi.ui.confirm({
      title: `Thu hồi chứng chỉ ${cert.code}?`,
      consequence: `Trang xác minh sẽ báo chứng chỉ của ${cert.recipientName} không còn hiệu lực. Học viên nhận thông báo kèm lý do.`,
      reversible: 'Có thể khôi phục lại bất cứ lúc nào.',
      requireReason: true, reasonLabel: 'Lý do thu hồi (học viên sẽ thấy)', confirmLabel: 'Thu hồi chứng chỉ', danger: true,
    });
    if (r.ok) await run({ action: 'revoke', reason: r.reason }, 'Đã thu hồi chứng chỉ.');
  };
  const restore = async () => {
    const r = await Codi.ui.confirm({ title: `Khôi phục chứng chỉ ${cert.code}?`, consequence: 'Chứng chỉ hợp lệ trở lại trên trang xác minh. Học viên nhận thông báo.', reversible: true, confirmLabel: 'Khôi phục' });
    if (r.ok) await run({ action: 'restore' }, 'Đã khôi phục chứng chỉ.');
  };
  return (
    <div className="stack-2 vf-admin">
      <span className="xsmall muted strong">Quản trị viên</span>
      {cert.status === 'valid'
        ? <button type="button" className="btn btn-danger" onClick={revoke} disabled={busy} aria-busy={busy || undefined}><Icon name="x-circle" className="icon-sm" /> Thu hồi chứng chỉ</button>
        : <button type="button" className="btn btn-secondary" onClick={restore} disabled={busy} aria-busy={busy || undefined}><Icon name="rotate-ccw" className="icon-sm" /> Khôi phục chứng chỉ</button>}
    </div>
  );
}

function CertificateDetails({ cert, onChange }) {
  return (
    <aside className="vf-side card" aria-label="Thông tin chứng chỉ"><div className="card-body stack-4">
      <dl className="vf-facts">
        <div><dt>Người nhận</dt><dd>{cert.recipientName}</dd></div>
        <div><dt>Khoá học</dt><dd>{cert.courseSlug ? <Link to={`/courses/${cert.courseSlug}`}>{cert.courseTitle}</Link> : cert.courseTitle}</dd></div>
        <div><dt>Ngày cấp</dt><dd>{fmt.date(cert.issuedAt)}</dd></div>
        <div><dt>Thời lượng</dt><dd>{lengthLabel(cert)}</dd></div>
        <div><dt>Giảng viên</dt><dd>{cert.lecturerName || 'Đội ngũ Codi'}</dd></div>
        <div><dt>Mã chứng chỉ</dt><dd className="mono">{cert.code}</dd></div>
      </dl>
      {cert.viewer.isOwner && <HolderActions cert={cert} onChange={onChange} />}
      {cert.viewer.isAdmin && <AdminActions cert={cert} onChange={onChange} />}
    </div></aside>
  );
}

const FAILURE = {
  404: { title: 'Không tìm thấy chứng chỉ với mã này', body: 'Kiểm tra lại từng ký tự của mã. Chứng chỉ Codi có dạng CODI-XXXX-XXXX.', lookup: true },
  400: { title: 'Mã chứng chỉ không đúng định dạng', body: 'Chứng chỉ Codi có dạng CODI-XXXX-XXXX, gồm chữ và số.', lookup: true },
  429: { title: 'Bạn tra cứu quá nhanh', body: 'Vui lòng đợi một phút rồi thử lại.', retry: true },
};

export default function VerifyPage({ params }) {
  const raw = params.code;
  const code = raw ? normalizeCode(raw) : null;
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, cert: null, error: null });
  const load = useCallback(() => {
    if (!code) return;
    setState({ loading: true, cert: null, error: null });
    certificateApi.get(code)
      .then((cert) => setState({ loading: false, cert, error: null }))
      .catch((error) => setState({ loading: false, cert: null, error }));
  }, [code]);
  useEffect(() => { load(); }, [load]);
  // A link with a typo'd but readable code (lower case, missing dashes) lands on the canonical address.
  useEffect(() => { if (raw && code && raw !== code) navigate(verifyPath(code), { replace: true }); }, [raw, code, navigate]);
  useEffect(() => { if (state.cert) document.title = `Chứng chỉ ${state.cert.courseTitle} · ${state.cert.recipientName} · Codi`; }, [state.cert]);

  if (!raw) return <LookupPage />;
  if (!code) {
    return (
      <div className="page page-narrow vf-page">
        <h1>Xác minh chứng chỉ Codi</h1>
        <Alert type="warn" title={FAILURE[400].title} body={FAILURE[400].body} />
        <div className="card"><div className="card-body"><Lookup initial={raw} autoFocus /></div></div>
      </div>
    );
  }
  if (state.loading) {
    return (
      <div className="page vf-page" aria-busy="true">
        <p className="row small muted" role="status"><Icon name="loader" className="icon-sm ln-spin" /> Đang kiểm tra chứng chỉ {code}…</p>
        <div className="vf-layout"><div className="cert-frame"><div className="cert cert-skeleton" /></div><div className="vf-side card cert-skeleton-side" /></div>
      </div>
    );
  }
  if (state.error) {
    const f = FAILURE[state.error.status];
    return (
      <div className="page page-narrow vf-page">
        <h1>Xác minh chứng chỉ Codi</h1>
        <Alert type={state.error.status === 404 ? 'danger' : 'warn'} title={f ? f.title : 'Chưa kiểm tra được chứng chỉ'}
          body={f ? f.body : state.error.message}
          actions={!f || f.retry ? <button type="button" className="btn btn-secondary btn-sm" onClick={load}><Icon name="refresh" className="icon-sm" /> Thử lại</button> : null} />
        {f && f.lookup && <div className="card"><div className="card-body"><Lookup initial={code} /></div></div>}
      </div>
    );
  }
  const cert = state.cert;
  return (
    <div className="page vf-page">
      <div className="vf-title stack-1">
        <span className="xsmall muted">Xác minh chứng chỉ Codi</span>
        <h1>{cert.courseTitle}</h1>
      </div>
      <StatusBanner cert={cert} />
      <div className="vf-layout">
        <div className="cert-print"><CertificateRender cert={cert} /></div>
        <CertificateDetails cert={cert} onChange={(c) => setState({ loading: false, cert: c, error: null })} />
      </div>
      <p className="small muted vf-foot"><Icon name="shield" className="icon-sm" /> Trang này đọc trực tiếp từ hệ thống của Codi. Ảnh chụp hay bản in chứng chỉ chỉ có giá trị khi khớp với thông tin ở đây. <Link to="/verify">Xác minh mã khác</Link></p>
    </div>
  );
}
