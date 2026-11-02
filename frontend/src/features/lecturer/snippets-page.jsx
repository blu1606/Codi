// Feedback snippet management ('/teach/snippets'). Port of the real snippets-client.tsx / snippets/actions.ts:
// title 2–100 chars, body 5–2000 chars, {{ten_hoc_vien}} / {{diem}} placeholders, newest first, delete at once
// with an undo toast (no confirm). Backend: snippets/actions.ts (get / create / update / delete / restore).
import { useCallback, useEffect, useState } from 'react';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Empty, Icon } from '../../components/ui/primitives';
import { shell, Loading, LoadError } from './teach-api';
import { act } from './teach-data';

const bodyOf = (s) => s.body || '';
const firstError = (r, fallback) => (r && r.errors && Object.values(r.errors)[0]) || (r && r.error) || fallback;

/** Client + server rules of the real snippet form. Returns an error message or null. */
export function snippetProblem(title, body) {
  const t = title.trim(); const b = body.trim();
  if (!t) return 'Tiêu đề mẫu không được để trống.';
  if (t.length < 2) return 'Tiêu đề phải có ít nhất 2 ký tự.';
  if (t.length > 100) return 'Tiêu đề mẫu tối đa 100 ký tự.';
  if (!b) return 'Nội dung mẫu không được để trống.';
  if (b.length < 5) return 'Nội dung nhận xét phải có ít nhất 5 ký tự.';
  if (b.length > 2000) return 'Nội dung mẫu tối đa 2000 ký tự.';
  return null;
}

function SnippetForm({ handle, snippet, onSaved }) {
  const [title, setTitle] = useState(snippet ? snippet.title : '');
  const [body, setBody] = useState(snippet ? bodyOf(snippet) : '');
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const p = snippetProblem(title, body);
    if (p) { setErr(p); return; }
    const input = { title: title.trim(), body: body.trim() };
    setSaving(true);
    let r;
    try { r = snippet ? await act('snippets', 'updateFeedbackSnippet', snippet.id, input) : await act('snippets', 'createFeedbackSnippet', input); }
    catch (ex) { r = { success: false, error: ex.message }; }
    setSaving(false);
    if (!r || !r.success) { setErr(firstError(r, 'Không thể lưu mẫu nhận xét.')); return; }
    handle.close();
    onSaved();
    Codi.ui.toast(snippet ? 'Đã cập nhật mẫu nhận xét.' : 'Đã tạo mẫu nhận xét.', { type: 'success' });
  };
  return (
    <form onSubmit={submit} noValidate>
      <div className="dialog-body stack-4">
        <p className="small muted">Bạn có thể dùng biến <code>{'{{ten_hoc_vien}}'}</code> và <code>{'{{diem}}'}</code> để tự động điền khi chấm.</p>
        {err && <Alert type="danger" body={err} />}
        <div className="field"><label htmlFor="sn-title">Tiêu đề</label><input id="sn-title" name="title" maxLength={120} value={title} onChange={(e) => { setTitle(e.target.value); setErr(null); }} placeholder="Ví dụ: Lời khen bài tập xuất sắc" autoFocus /></div>
        <div className="field"><label htmlFor="sn-body">Nội dung nhận xét</label><textarea id="sn-body" name="body" rows={6} value={body} onChange={(e) => { setBody(e.target.value); setErr(null); }} placeholder="Ví dụ: Chào {{ten_hoc_vien}}, bài làm của em rất tốt, đạt {{diem}} điểm. Cố gắng phát huy nhé!" />
          <span className="field-help row-between"><span>Gợi ý: Dùng <strong>{'{{ten_hoc_vien}}'}</strong> cho tên học viên và <strong>{'{{diem}}'}</strong> cho điểm số bài nộp.</span><span className={body.trim().length > 2000 ? 'text-danger' : ''}>{body.trim().length}/2000</span></span></div>
      </div>
      <div className="dialog-footer"><button className="btn btn-ghost" type="button" onClick={() => handle.close()}>Huỷ</button><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Đang lưu...' : snippet ? 'Lưu thay đổi' : 'Lưu mẫu'}</button></div>
    </form>
  );
}

const openSnippetForm = (snippet, onSaved) => Codi.ui.modal({ title: snippet ? 'Sửa mẫu nhận xét' : 'Tạo mẫu nhận xét', raw: true, body: (h) => <SnippetForm handle={h} snippet={snippet} onSaved={onSaved} /> });

async function deleteSnippet(snippet, reload) {
  let r;
  try { r = await act('snippets', 'deleteFeedbackSnippet', snippet.id); } catch (e) { r = { success: false, error: e.message }; }
  if (!r || !r.success) { Codi.ui.toast(firstError(r, 'Mẫu nhận xét không tồn tại hoặc không thuộc quyền quản lý của bạn.'), { type: 'danger' }); return; }
  reload();
  const removed = r.deletedSnippet || snippet;
  Codi.ui.toast(`Đã xoá mẫu "${removed.title}".`, {
    action: {
      label: 'Hoàn tác',
      onClick: async () => {
        // restored as a new row, like the real undo
        try {
          const back = await act('snippets', 'restoreFeedbackSnippet', { title: removed.title, body: removed.body });
          if (!back || !back.success) throw new Error(firstError(back, 'Không thể khôi phục mẫu nhận xét.'));
          reload(); Codi.ui.toast('Đã khôi phục mẫu nhận xét.', { type: 'success' });
        } catch (e) { Codi.ui.toast(e.message, { type: 'danger' }); }
      },
    },
  });
}

export function SnippetsPage() {
  useCodi();
  const [st, setSt] = useState({ list: null, error: null });
  const reload = useCallback(async () => {
    try { setSt({ list: await act('snippets', 'getFeedbackSnippets'), error: null }); } catch (error) { setSt((x) => ({ ...x, error })); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const head = <div className="page-header"><div><h1>Mẫu nhận xét</h1><p className="muted">Tạo và quản lý mẫu nhận xét để tái sử dụng khi chấm bài.</p></div>
    <button type="button" className="btn btn-primary" onClick={() => openSnippetForm(null, reload)}><Icon name="plus" /> Tạo mẫu</button></div>;
  if (!st.list) return shell('/teach/grading', <>{head}{st.error ? <LoadError error={st.error} onRetry={reload} /> : <Loading rows={3} />}</>);
  const list = st.list;
  return shell('/teach/grading', <>
    {head}
    {list.length ? (
      <div className="table-wrap"><table className="table"><thead><tr><th scope="col">Tiêu đề</th><th scope="col">Nội dung</th><th scope="col" className="num">Thao tác</th></tr></thead><tbody>
        {list.map((s) => { const b = bodyOf(s); return (
          <tr key={s.id}><td><strong className="small">{s.title}</strong></td><td className="small" style={{ maxWidth: 520 }}><span className="od-clamp-2">{b}</span></td><td className="num od-nowrap">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openSnippetForm(s, reload)} aria-label={`Sửa mẫu ${s.title}`}><Icon name="pencil" className="icon-sm" /> Sửa</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteSnippet(s, reload)} aria-label={`Xoá mẫu ${s.title}`}><Icon name="trash" className="icon-sm" /> Xoá</button></td></tr>
        ); })}</tbody></table></div>
    ) : <div className="card"><Empty icon="list" title="Chưa có mẫu nào" body="Tạo mẫu nhận xét để tiết kiệm thời gian chấm bài." actions={<button type="button" className="btn btn-primary" onClick={() => openSnippetForm(null, reload)}><Icon name="plus" /> Tạo mẫu</button>} /></div>}
  </>);
}
