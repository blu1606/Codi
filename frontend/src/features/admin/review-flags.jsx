/**
 * Admin flag ("Gắn cờ") pieces shared by the review tabs and the in-context preview: the add dialog, the note card
 * shown at the flagged place, and the close / reopen / delete (with undo) writes on dashboard/admin/publication.
 */
import { useState } from 'react';
import { Codi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import { pubAction, attempt } from './admin-data';
import { SEVERITY, FLAG_STATUS } from './publication-rules';

export const SevBadge = ({ s }) => <span className={`badge ${s === 'must' ? 'badge-danger' : 'badge-warn'}`}><Icon name={s === 'must' ? 'alert-circle' : 'alert-triangle'} />{SEVERITY[s]}</span>;
export const StatusBadge = ({ f }) => <span className={`badge ${f.status === 'closed' ? 'badge-success' : f.status === 'fixed' ? 'badge-accent' : ''}`}>{FLAG_STATUS[f.status]}</span>;

/** target: { type, lessonId?, itemId?, label } */
export const addFlag = (ctx, target, severity, comment, source) => pubAction('addReviewFlag', ctx.courseId, ctx.requestId, {
  targetType: target.type, lessonId: target.lessonId || null, itemId: target.itemId == null ? null : String(target.itemId),
  targetLabel: target.label, severity, comment, source,
});

function FlagDialog({ handle, ctx, t }) {
  const [severity, setSeverity] = useState('must');
  const [comment, setComment] = useState('');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const text = comment.trim();
    if (text.length < 10) { setErr(true); return; }
    setBusy(true);
    const ok = await attempt(() => addFlag(ctx, t, severity, text, 'admin'), 'Đã gắn cờ.');
    setBusy(false);
    if (ok) handle.close();
  };
  return (
    <form className="stack-3" onSubmit={submit} noValidate>
      <p className="small"><span className="muted">Vị trí:</span> <strong>{t.label}</strong></p>
      <fieldset className="stack-1"><legend className="small"><strong>Mức độ</strong></legend>
        <label className="check"><input type="radio" name="severity" value="must" checked={severity === 'must'} onChange={() => setSeverity('must')} /> Bắt buộc sửa — chặn việc xuất bản</label>
        <label className="check"><input type="radio" name="severity" value="should" checked={severity === 'should'} onChange={() => setSeverity('should')} /> Nên sửa — góp ý, không chặn</label></fieldset>
      <div className={`field ${err ? 'is-invalid' : ''}`}><label htmlFor="rv-fc">Nhận xét cho giảng viên <span className="req">*</span></label>
        <textarea id="rv-fc" name="comment" rows={3} placeholder="Mô tả vấn đề và cách sửa mong muốn" value={comment} onChange={(e) => { setComment(e.target.value); setErr(false); }} />
        <span className={`field-help ${err ? 'field-error' : ''}`}>{err ? 'Nhận xét cần ít nhất 10 ký tự để giảng viên biết cần sửa gì.' : 'Ít nhất 10 ký tự.'}</span></div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-ghost" onClick={() => handle.close()}>Huỷ</button><button type="submit" className="btn btn-primary" disabled={busy}><Icon name="flag" className="icon-sm" /> Gắn cờ</button></div>
    </form>
  );
}
export const openFlag = (ctx, t) => Codi.ui.modal({ title: 'Gắn cờ', body: (h) => <FlagDialog handle={h} ctx={ctx} t={t} /> });

export const setFlagState = (id, v) => attempt(() => pubAction('updateFlagStatus', id, v));

let lastDeleted = null;
function undoDelete() {
  if (!lastDeleted) return;
  const { ctx, flag: f } = lastDeleted; lastDeleted = null;
  attempt(() => addFlag(ctx, f.target, f.severity, f.comment, f.source || 'admin'));
}
export async function deleteFlag(ctx, f) {
  const ok = await Codi.ui.confirm({ title: 'Xoá cờ?', body: 'Bạn có chắc chắn muốn xoá cờ này?', confirmLabel: 'Xoá cờ', danger: true });
  if (!ok.ok) return;
  if (!(await attempt(() => pubAction('deleteReviewFlag', f.id)))) return;
  lastDeleted = { ctx, flag: f };
  Codi.ui.toast('Đã xoá cờ.', { action: { label: 'Hoàn tác', onClick: undoDelete } });
}

/** One flag as the admin sees it: badges, comment, the lecturer's reply, and the decision buttons. */
export function FlagCard({ f, ctx, ro, target }) {
  return (
    <li id={`rv-flag-${f.id}`} className={`rv-flag ${f.status === 'closed' ? 'is-closed' : ''}`}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><SevBadge s={f.severity} /><StatusBadge f={f} />{f.source === 'ai' && <span className="badge badge-accent"><Icon name="sparkles" />AI đề xuất</span>}{f.carried && <span className="badge">Từ vòng trước</span>}</div>
      {target}
      <p className="small">{f.comment}</p>
      {f.reply && <p className="small rv-reply"><Icon name="message-circle" className="icon-sm" /> Giảng viên: {f.reply}</p>}
      {!ro && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {f.status !== 'closed'
            ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFlagState(f.id, 'closed')}><Icon name="check" className="icon-sm" /> Đóng cờ</button>
            : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFlagState(f.id, 'open')}>Mở lại</button>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteFlag(ctx, f)}><Icon name="trash" className="icon-sm" /> Xoá</button>
        </div>
      )}
    </li>
  );
}
