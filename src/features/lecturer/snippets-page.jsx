// Feedback snippet management ('/teach/snippets'). Port of the real snippets-client.tsx / snippets/actions.ts:
// title 2–100 chars, body 5–2000 chars, {{ten_hoc_vien}} / {{diem}} placeholders, newest first, delete at once
// with an undo toast (no confirm).
import { useState } from 'react';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Empty, Icon } from '../../components/ui/primitives';
import { shell, me, persist } from './teach-api';

const bodyOf = (s) => (s.body != null ? s.body : s.text || '');

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

function SnippetForm({ handle, snippet }) {
  const [title, setTitle] = useState(snippet ? snippet.title : '');
  const [body, setBody] = useState(snippet ? bodyOf(snippet) : '');
  const [err, setErr] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    const p = snippetProblem(title, body);
    if (p) { setErr(p); return; }
    const db = Codi.db();
    if (!db.feedbackSnippets) db.feedbackSnippets = [];
    const t = title.trim(); const b = body.trim();
    if (snippet) {
      const s = db.feedbackSnippets.find((x) => x.id === snippet.id && x.lecturerId === me().id);
      if (!s) { setErr('Mẫu nhận xét không tồn tại hoặc không thuộc quyền quản lý của bạn.'); return; }
      Object.assign(s, { title: t, body: b, text: b, updatedAt: new Date().toISOString() });
    } else db.feedbackSnippets.push({ id: Codi.uid('snip'), lecturerId: me().id, title: t, body: b, text: b, createdAt: new Date().toISOString() });
    handle.close();
    persist();
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
      <div className="dialog-footer"><button className="btn btn-ghost" type="button" onClick={() => handle.close()}>Huỷ</button><button className="btn btn-primary" type="submit">{snippet ? 'Lưu thay đổi' : 'Lưu mẫu'}</button></div>
    </form>
  );
}

const openSnippetForm = (snippet) => Codi.ui.modal({ title: snippet ? 'Sửa mẫu nhận xét' : 'Tạo mẫu nhận xét', raw: true, body: (h) => <SnippetForm handle={h} snippet={snippet} /> });

function deleteSnippet(id) {
  const snippets = Codi.db().feedbackSnippets || [];
  const idx = snippets.findIndex((x) => x.id === id && x.lecturerId === me().id);
  if (idx < 0) { Codi.ui.toast('Mẫu nhận xét không tồn tại hoặc không thuộc quyền quản lý của bạn.', { type: 'danger' }); return; }
  const [removed] = snippets.splice(idx, 1);
  persist();
  Codi.ui.toast(`Đã xoá mẫu "${removed.title}".`, {
    action: {
      label: 'Hoàn tác',
      onClick: () => {
        const list = Codi.db().feedbackSnippets || (Codi.db().feedbackSnippets = []);
        // restored as a new row, like the real undo
        list.push({ ...removed, id: Codi.uid('snip'), createdAt: removed.createdAt || new Date().toISOString() });
        persist(); Codi.ui.toast('Đã khôi phục mẫu nhận xét.', { type: 'success' });
      },
    },
  });
}

export function SnippetsPage() {
  useCodi();
  const list = (Codi.db().feedbackSnippets || []).filter((s) => s.lecturerId === me().id).slice().sort((a, b) => ((a.createdAt || '') < (b.createdAt || '') ? 1 : -1));
  return shell('/teach/grading', <>
    <div className="page-header"><div><h1>Mẫu nhận xét</h1><p className="muted">Tạo và quản lý mẫu nhận xét để tái sử dụng khi chấm bài.</p></div>
      <button type="button" className="btn btn-primary" onClick={() => openSnippetForm(null)}><Icon name="plus" /> Tạo mẫu</button></div>
    {list.length ? (
      <div className="table-wrap"><table className="table"><thead><tr><th scope="col">Tiêu đề</th><th scope="col">Nội dung</th><th scope="col" className="num">Thao tác</th></tr></thead><tbody>
        {list.map((s) => { const b = bodyOf(s); return (
          <tr key={s.id}><td><strong className="small">{s.title}</strong></td><td className="small" style={{ maxWidth: 520 }}><span className="od-clamp-2">{b}</span></td><td className="num od-nowrap">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openSnippetForm(s)} aria-label={`Sửa mẫu ${s.title}`}><Icon name="pencil" className="icon-sm" /> Sửa</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteSnippet(s.id)} aria-label={`Xoá mẫu ${s.title}`}><Icon name="trash" className="icon-sm" /> Xoá</button></td></tr>
        ); })}</tbody></table></div>
    ) : <div className="card"><Empty icon="list" title="Chưa có mẫu nào" body="Tạo mẫu nhận xét để tiết kiệm thời gian chấm bài." actions={<button type="button" className="btn btn-primary" onClick={() => openSnippetForm(null)}><Icon name="plus" /> Tạo mẫu</button>} /></div>}
  </>);
}
