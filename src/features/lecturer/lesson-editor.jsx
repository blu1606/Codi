// S22 lesson editor (real "Biên tập chi tiết bài học": description, duration 1–360, free preview, body, URL-only
// materials, load / error / retry, save guard) plus the port-only assignment builder with rubric, and the typed
// "Thêm bài học" menu (chapter + lesson kind, manual or AI).
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Codi } from '../../lib/codi';
import { Alert, Icon } from '../../components/ui/primitives';
import { findLesson, contentChanged, persist, locked, lecturerAI, AIThinking, FieldError } from './teach-api';

const LATE = { accept: 'Vẫn nhận, không trừ điểm', penalty: 'Nhận và trừ điểm', reject: 'Không nhận bài nộp muộn' };
const newAssignment = () => ({ instructions: '', requiresFile: false, requiresLink: true, acceptedTypes: '', maxScore: 10, passingScore: 50, passScore: 5, dueDays: 7, latePolicy: 'penalty', latePenalty: 20, rubric: [] });
const rubricTotal = (a) => (a.rubric || []).reduce((s, k) => s + (Number(k.points) || 0), 0);
const num = (v) => (v === '' ? '' : Number(v));
const pctOf = (a) => (a.passingScore != null ? a.passingScore : Number(a.maxScore) > 0 ? Math.round(((Number(a.passScore) || 0) / Number(a.maxScore)) * 100) : 50);

/** Real lesson material types (actions.ts LessonMaterialInput); URL only, no upload. */
export const MATERIAL_KINDS = [
  ['video', 'Video bài giảng', 'video'],
  ['pdf', 'Tài liệu PDF', 'file-text'],
  ['slide', 'Slide thuyết trình', 'presentation'],
  ['document', 'Tài liệu đính kèm', 'clipboard'],
  ['link', 'Liên kết ngoài (URL)', 'link'],
];
const kindIcon = (t) => (MATERIAL_KINDS.find((k) => k[0] === t) || MATERIAL_KINDS[4])[2];
/** Materials stored on the lesson, or the legacy single `material` file of older seed rows. */
export function lessonMaterials(l) {
  if (Array.isArray(l.materials)) return l.materials.map((m) => ({ ...m }));
  if (l.material && l.material.fileName) {
    const kind = { pdf: 'pdf', pptx: 'slide', ppt: 'slide', mp4: 'video', video: 'video' }[l.material.kind] || 'document';
    return [{ id: Codi.uid('mat'), type: kind, title: l.material.fileName, url: l.material.url || '' }];
  }
  return [];
}
/** Learner-facing lesson type follows the first material (reading when there is none). */
const typeFromMaterials = (list) => { const t = list[0] && list[0].type; return t === 'video' ? 'video' : t === 'pdf' || t === 'slide' ? 'pdf' : 'reading'; };

function assignmentProblem(a) {
  if (!a.instructions.trim()) return 'Nhập yêu cầu bài tập hoặc tắt "Có bài tập".';
  if (!a.requiresFile && !a.requiresLink) return 'Chọn ít nhất một cách nộp bài: đường dẫn hoặc tệp.';
  if (!(Number(a.maxScore) > 0)) return 'Điểm tối đa phải lớn hơn 0.';
  const pct = Number(a.passingScore);
  if (a.passingScore === '' || !Number.isFinite(pct) || pct < 1 || pct > 100) return 'Điểm đạt phải từ 1 đến 100%.';
  if (a.rubric.some((k) => !k.name.trim())) return 'Mỗi tiêu chí chấm cần có tên.';
  if (a.rubric.length && rubricTotal(a) !== Number(a.maxScore)) return `Tổng điểm thang chấm (${rubricTotal(a)}) phải bằng điểm tối đa (${a.maxScore}).`;
  return null;
}
const cleanAssignment = (a) => {
  const maxScore = Number(a.maxScore) || 0; const passingScore = Number(a.passingScore) || 50;
  return {
    ...a, maxScore, passingScore,
    passScore: Math.round(((passingScore / 100) * maxScore) * 10) / 10, // absolute threshold kept for older readers
    dueDays: Math.max(1, Number(a.dueDays) || 1), latePenalty: Number(a.latePenalty) || 0,
    rubric: a.rubric.map((k) => ({ ...k, name: k.name.trim(), points: Number(k.points) || 0 })),
  };
};

function AssignmentBuilder({ d, refresh, rubricJob, ro }) {
  const a = d.assignment;
  const total = rubricTotal(a); const ok = total === Number(a.maxScore);
  const ai = d.rubricAI;
  const set = (k, v) => { a[k] = v; refresh(); };
  const runAI = () => {
    const AI = lecturerAI(); if (!AI) return;
    const apply = (rubric) => { d.rubricAI = null; a.rubric = rubric; refresh(); Codi.ui.toast('AI đã đề xuất thang chấm. Kiểm tra lại tên, mô tả và điểm từng tiêu chí.', { type: 'success' }); };
    const run = () => {
      rubricJob.current = AI.task({
        onLimit() { d.rubricAI = 'limit'; refresh(); },
        onStart() { d.rubricAI = 'loading'; refresh(); },
        onError() { d.rubricAI = 'error'; refresh(); },
        onDone(r) { if (!d.closed) apply(r); },
      }, () => AI.suggestRubric(a.instructions, Number(a.maxScore)), 1200);
    };
    if (a.rubric.length) Codi.ui.confirm({ title: 'Thay thang chấm hiện tại?', body: `AI sẽ đề xuất thang chấm mới thay cho ${a.rubric.length} tiêu chí đang có.`, confirmLabel: 'Thay bằng gợi ý AI' }).then((r) => { if (r.ok) run(); });
    else run();
  };
  const stopAI = () => { if (rubricJob.current) rubricJob.current.stop(); d.rubricAI = null; refresh(); };
  return (
    <fieldset className="stack-4 panel tc-assign" disabled={ro}>
      <div className="field"><label htmlFor="le-ins">Yêu cầu bài tập <span className="req">*</span></label><textarea id="le-ins" rows={4} value={a.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Mô tả sản phẩm cần nộp, yêu cầu bắt buộc và cách nộp." /></div>
      <fieldset className="stack-2"><legend className="field-label">Học viên nộp</legend>
        <label className="check"><input type="checkbox" checked={a.requiresLink} onChange={(e) => set('requiresLink', e.target.checked)} /> Đường dẫn (GitHub, CodeSandbox…)</label>
        <label className="check"><input type="checkbox" checked={a.requiresFile} onChange={(e) => set('requiresFile', e.target.checked)} /> Tệp</label>
        {a.requiresFile && <div className="field"><label htmlFor="le-types">Định dạng tệp được nhận</label><input id="le-types" value={a.acceptedTypes} onChange={(e) => set('acceptedTypes', e.target.value)} placeholder=".zip, .pdf" /><span className="field-help">Để trống nếu nhận mọi loại tệp. Học viên nộp tối đa 20MB.</span></div>}
      </fieldset>
      <div className="grid-3">
        <div className="field"><label htmlFor="le-max">Điểm tối đa</label><input id="le-max" type="number" min="1" max="100" value={a.maxScore} onChange={(e) => set('maxScore', num(e.target.value))} /></div>
        <div className="field"><label htmlFor="le-pass">Ngưỡng đạt (%)</label><input id="le-pass" type="number" min="1" max="100" value={a.passingScore} onChange={(e) => set('passingScore', num(e.target.value))} />
          <span className="field-help">Đạt khi điểm ≥ {Math.round(((Number(a.passingScore) || 0) / 100) * (Number(a.maxScore) || 0) * 10) / 10}/{Number(a.maxScore) || 0}.</span></div>
        <div className="field"><label htmlFor="le-due">Hạn nộp (ngày sau khi mở bài)</label><input id="le-due" type="number" min="1" value={a.dueDays} onChange={(e) => set('dueDays', num(e.target.value))} /></div>
      </div>
      <div className="grid-2">
        <div className="field"><label htmlFor="le-late">Nộp muộn</label><select id="le-late" value={a.latePolicy} onChange={(e) => set('latePolicy', e.target.value)}>{Object.keys(LATE).map((k) => <option key={k} value={k}>{LATE[k]}</option>)}</select></div>
        {a.latePolicy === 'penalty' && <div className="field"><label htmlFor="le-pen">Trừ (% điểm)</label><input id="le-pen" type="number" min="1" max="100" value={a.latePenalty} onChange={(e) => set('latePenalty', num(e.target.value))} /></div>}
      </div>
      <fieldset className="stack-3"><legend className="field-label">Thang chấm</legend>
        <p className="field-help">Học viên thấy thang chấm trước khi nộp. Tổng điểm các tiêu chí phải bằng điểm tối đa.</p>
        {a.rubric.length ? <>
          <ol className="tc-rubric">{a.rubric.map((k, i) => (
            <li key={k.id || i} className="tc-rubric-row">
              <div className="field od-fill"><label className="sr-only" htmlFor={`le-rn-${i}`}>Tiêu chí {i + 1}</label><input id={`le-rn-${i}`} value={k.name} placeholder="Tên tiêu chí" onChange={(e) => { k.name = e.target.value; refresh(); }} />
                <label className="sr-only" htmlFor={`le-rd-${i}`}>Mô tả tiêu chí {i + 1}</label><input id={`le-rd-${i}`} className="small" value={k.desc} placeholder="Thế nào là đạt đủ điểm" onChange={(e) => { k.desc = e.target.value; refresh(); }} /></div>
              <div className="field tc-rubric-pts"><label className="sr-only" htmlFor={`le-rp-${i}`}>Điểm tiêu chí {i + 1}</label><input id={`le-rp-${i}`} type="number" min="0" step="0.5" value={k.points} onChange={(e) => { k.points = num(e.target.value); refresh(); }} /><span className="xsmall muted">điểm</span></div>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => { a.rubric.splice(i, 1); refresh(); }} aria-label={`Xoá tiêu chí ${i + 1}`}><Icon name="trash" className="icon-sm" /></button></li>
          ))}</ol>
          <p className={`small ${ok ? 'text-success' : 'text-warn'}`} role="status">Tổng: {total}/{a.maxScore} điểm{ok ? '' : ' — chưa khớp điểm tối đa'}</p>
        </> : <p className="small muted">Chưa có tiêu chí.</p>}
        <div className="row"><button type="button" className="btn btn-secondary btn-sm" onClick={() => { a.rubric.push({ id: Codi.uid('r'), name: '', points: Math.max(0, (Number(a.maxScore) || 0) - rubricTotal(a)), desc: '' }); refresh(); }}><Icon name="plus" className="icon-sm" /> Thêm tiêu chí</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!a.instructions.trim() || ai === 'loading'} onClick={runAI}><Icon name="sparkles" className="icon-sm" /> Gợi ý thang chấm bằng AI</button></div>
        {!a.instructions.trim() && <p className="xsmall muted">Nhập yêu cầu bài tập để AI gợi ý thang chấm.</p>}
        {ai === 'loading' && <AIThinking text="AI đang đọc yêu cầu và đề xuất tiêu chí…" onStop={stopAI} />}
        {ai === 'error' && <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>AI chưa gợi ý được. <button type="button" className="btn-link" onClick={runAI}>Thử lại</button></span></p>}
        {ai === 'limit' && <p className="small text-warn" role="status"><Icon name="alert-triangle" className="icon-sm" /> Đã dùng hết lượt gợi ý bằng AI trong giờ này.</p>}
      </fieldset>
    </fieldset>
  );
}

/** "Thêm tài liệu" form: URL-only, title and URL required (real handleAddMaterial). */
function MaterialForm({ onAdd, onClose, disabled }) {
  const [type, setType] = useState('video');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const add = () => {
    if (!title.trim()) { setErr('Vui lòng nhập tên tài liệu.'); return; }
    if (!url.trim()) { setErr('Vui lòng nhập URL tài liệu.'); return; }
    onAdd({ id: Codi.uid('mat'), type, title: title.trim(), url: url.trim() });
  };
  return (
    <div className="panel stack-3 tc-mat-form">
      <div className="row-between"><strong className="small">Thêm tài liệu mới</strong><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Đóng</button></div>
      <div className="grid-3">
        <div className="field"><label htmlFor="mat-type">Loại tài liệu</label><select id="mat-type" value={type} onChange={(e) => setType(e.target.value)}>{MATERIAL_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field tc-span-2"><label htmlFor="mat-title">Tiêu đề tài liệu</label><input id="mat-title" value={title} onChange={(e) => { setTitle(e.target.value); setErr(''); }} placeholder="Ví dụ: Slide bài giảng Chương 1" /></div>
      </div>
      <div className={`field ${err ? 'is-invalid' : ''}`}><label htmlFor="mat-url">Đường dẫn (URL)</label><input id="mat-url" type="url" inputMode="url" value={url} onChange={(e) => { setUrl(e.target.value); setErr(''); }} placeholder="https://..." />
        <span className="field-help">Chỉ hỗ trợ đường dẫn (URL) tới tài liệu đã lưu trữ. Chưa hỗ trợ tải tệp lên.</span><FieldError>{err}</FieldError></div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={disabled}>Thêm vào danh sách</button></div>
    </div>
  );
}

/** Builds the editable draft from the stored lesson; throws when the lesson is gone (load error state). */
function loadDraft(courseId, lessonId, withAssignment) {
  const c = Codi.course(courseId);
  const f = c && findLesson(c, lessonId);
  if (!f) throw new Error('Không thể tải chi tiết bài học. Vui lòng thử lại.');
  const l = f.l;
  const assignment = l.assignment ? Object.assign(newAssignment(), JSON.parse(JSON.stringify(l.assignment))) : (withAssignment ? newAssignment() : null);
  if (assignment) assignment.passingScore = pctOf(assignment);
  return {
    title: l.title, description: l.description || '', durationMin: Math.round(Number(l.durationMin) || 0) || 10,
    body: l.reading || '', isFreePreview: !!l.isFreePreview, materials: lessonMaterials(l), assignment,
  };
}

function LessonEditor({ handle, courseId, lessonId, withAssignment }) {
  const ref = useRef({ rubricAI: null, closed: false, error: null, addingMaterial: false });
  const d = ref.current;
  const [, refresh] = useReducer((x) => x + 1, 0);
  const [load, setLoad] = useState({ state: 'loading', message: '' });
  const [saving, setSaving] = useState(false);
  const rubricJob = useRef(null);
  const request = useRef(0);
  const c = Codi.course(courseId);
  const ro = !!c && locked(c);

  const fetchDetails = useCallback(async () => {
    const req = ++request.current;
    setLoad({ state: 'loading', message: '' });
    await Codi.wait(250); // the real editor fetches lesson details before it allows saving
    if (req !== request.current || d.closed) return;
    try {
      Object.assign(d, loadDraft(courseId, lessonId, withAssignment), { error: null });
      setLoad({ state: 'ready', message: '' });
    } catch (err) {
      const message = err && err.message ? err.message : 'Không thể tải chi tiết bài học.';
      setLoad({ state: 'error', message });
      Codi.ui.toast(message, { type: 'danger' });
    }
  }, [courseId, lessonId, withAssignment, d]);

  useEffect(() => {
    d.closed = false; // StrictMode re-mounts once in dev
    fetchDetails();
    return () => { d.closed = true; request.current += 1; if (rubricJob.current) rubricJob.current.stop(); };
  }, [d, fetchDetails]);

  const canSave = !ro && !saving && load.state === 'ready';
  const fail = (msg) => { d.error = msg; refresh(); return false; };
  const save = () => {
    if (!canSave) return false;
    const title = (d.title || '').trim();
    if (!title) { Codi.ui.toast('Tên bài học không được để trống.', { type: 'danger' }); return fail('Tên bài học không được để trống.'); }
    if (title.length < 2) return fail('Tên bài học cần ít nhất 2 ký tự.');
    const dur = Number(d.durationMin);
    if (!Number.isFinite(dur) || dur < 1 || dur > 360) return fail('Thời lượng (phút) phải từ 1 đến 360.');
    const ap = d.assignment && assignmentProblem(d.assignment);
    if (ap) return fail(ap);
    const cc = Codi.course(courseId); const ff = cc && findLesson(cc, lessonId);
    if (!ff) return fail('Không tìm thấy bài học trong khoá học này.');
    setSaving(true);
    try {
      const mats = d.materials.map((m, i) => ({ id: m.id || Codi.uid('mat'), type: m.type, title: m.title, url: m.url, position: i }));
      const isCode = ff.l.type === 'code' || ff.l.type === 'tutorial';
      Object.assign(ff.l, {
        title, description: d.description.trim(), durationMin: Math.round(dur), reading: d.body, isFreePreview: !!d.isFreePreview,
        materials: mats, type: isCode ? ff.l.type : typeFromMaterials(mats),
        assignment: d.assignment ? cleanAssignment(d.assignment) : null, materialError: false,
      });
      // review checks read the first material as the lesson file
      ff.l.material = mats[0] ? { fileName: mats[0].title, kind: mats[0].type, url: mats[0].url } : null;
      contentChanged(cc); persist();
      return true;
    } finally {
      setSaving(false);
    }
  };
  const importAI = () => {
    // the import works on the saved lesson, so save the draft first
    if (!save()) return;
    const AI = lecturerAI();
    handle.close();
    if (AI && AI.openImport) AI.openImport(courseId, lessonId);
  };
  const set = (k) => (e) => { d[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; d.error = null; refresh(); };

  let body;
  if (load.state === 'loading') {
    body = (
      <div className="stack-3" role="status" aria-busy="true"><p className="row muted small"><Icon name="loader" className="icon-sm" /> Đang tải thông tin bài học…</p>
        <div className="skeleton skeleton-line" style={{ height: 40 }} /><div className="skeleton skeleton-line" style={{ height: 96 }} /><div className="skeleton skeleton-line" style={{ width: '66%', height: 40 }} /><div className="skeleton skeleton-line" style={{ height: 64 }} /></div>
    );
  } else if (load.state === 'error') {
    body = <Alert type="danger" title="Không thể tải chi tiết bài học" body={load.message} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={fetchDetails}><Icon name="refresh" className="icon-sm" /> Thử lại</button>} />;
  } else {
    body = (
      <form className="stack-4" id="tc-lesson-form" noValidate onSubmit={(e) => e.preventDefault()}>
        {ro && <Alert type="warn" title="Đang chờ duyệt — nội dung chỉ đọc" />}
        <div className="field"><label htmlFor="le-title">Tên bài học <span className="req">*</span></label><input id="le-title" value={d.title} onChange={set('title')} placeholder="Nhập tên bài học..." disabled={ro || saving} /></div>
        <div className="grid-3">
          <div className="field tc-span-2"><label htmlFor="le-desc">Mô tả tóm tắt bài học</label><input id="le-desc" value={d.description} onChange={set('description')} placeholder="Tóm tắt nội dung chính của bài..." disabled={ro || saving} /></div>
          <div className="field"><label htmlFor="le-dur">Thời lượng (phút)</label><input id="le-dur" type="number" min="1" max="360" value={d.durationMin} onChange={(e) => { d.durationMin = num(e.target.value); d.error = null; refresh(); }} disabled={ro || saving} /></div>
        </div>
        <label className="panel row tc-preview-opt" htmlFor="le-preview" style={{ alignItems: 'flex-start', gap: 10 }}>
          <input id="le-preview" type="checkbox" checked={d.isFreePreview} onChange={set('isFreePreview')} disabled={ro || saving} style={{ marginTop: 3 }} />
          <span className="stack-1"><span className="small strong">Cho phép học thử (Free Preview)</span><span className="xsmall muted">Học viên chưa đăng ký mua khoá học có thể xem trước nội dung bài học này trên trang bán.</span></span>
        </label>
        <div className="field"><label htmlFor="le-body">Nội dung bài học / Ghi chú lý thuyết</label><textarea id="le-body" className="mono" rows={6} value={d.body} onChange={set('body')} placeholder="Soạn nội dung chi tiết bài đọc hoặc hướng dẫn thực hành..." disabled={ro || saving} /></div>

        <section className="stack-3 tc-materials" aria-labelledby="le-mat-h">
          <div className="row-between"><strong id="le-mat-h" className="small row" style={{ gap: 6 }}><Icon name="file-text" className="icon-sm" /> Tài liệu bài học ({d.materials.length} tài liệu)</strong>
            {!ro && !d.addingMaterial && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { d.addingMaterial = true; refresh(); }}><Icon name="plus" className="icon-sm" /> Thêm tài liệu</button>}</div>
          {!d.materials.length && !d.addingMaterial ? <p className="small muted">Chưa có tài liệu đính kèm (Video, PDF, Slide). Bấm &quot;Thêm tài liệu&quot; để bổ sung.</p> : (
            <ul className="tc-mat-list">{d.materials.map((m, i) => (
              <li key={m.id || i} className="tc-mat">
                <Icon name={kindIcon(m.type)} className="icon-sm" />
                <span className="od-fill stack-1" style={{ minWidth: 0 }}><span className="small strong od-truncate">{m.title}</span>
                  <span className="xsmall muted mono od-truncate">({m.type}) {m.url || 'Chưa có URL'}</span></span>
                {!ro && <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => { d.materials.splice(i, 1); refresh(); }} aria-label={`Xoá tài liệu ${m.title}`} title="Xoá tài liệu"><Icon name="trash" className="icon-sm" /></button>}
              </li>
            ))}</ul>
          )}
          {d.addingMaterial && !ro && <MaterialForm disabled={saving} onClose={() => { d.addingMaterial = false; refresh(); }}
            onAdd={(m) => { d.materials.push(m); d.addingMaterial = false; refresh(); Codi.ui.toast('Đã thêm tài liệu vào danh sách chuẩn bị lưu.', { type: 'success' }); }} />}
        </section>

        <label className="switch"><input type="checkbox" checked={!!d.assignment} disabled={ro} onChange={(e) => { d.assignment = e.target.checked ? newAssignment() : null; refresh(); }} /><span className="switch-track" />Có bài tập</label>
        {d.assignment && <AssignmentBuilder d={d} refresh={refresh} rubricJob={rubricJob} ro={ro} />}
        {d.error && <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{d.error}</span></p>}
        {!ro && <div className="panel row-between la-cta"><div className="stack-1"><strong className="small"><Icon name="sparkles" className="icon-sm" /> Tạo nội dung từ tài liệu</strong><span className="xsmall muted">Tải PDF/slide lên, AI soạn tóm tắt, câu hỏi quiz và khái niệm để bạn duyệt.</span></div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={importAI} disabled={!canSave}>Nhập tài liệu &amp; tạo bằng AI</button></div>}
      </form>
    );
  }
  return (
    <>
      <div className="sheet-body stack-4">
        <p className="small muted">Thiết lập nội dung bài giảng, thời lượng học tập và tài liệu đính kèm (Video, PDF, Slide, Link).</p>
        {body}
      </div>
      <div className="sheet-footer">
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => handle.close()}>Huỷ</button>
        <button type="button" className="btn btn-primary" disabled={!canSave} onClick={() => { if (save()) { handle.close(); Codi.ui.toast('Đã cập nhật bài học thành công!', { type: 'success' }); } }}>
          {saving ? <><Icon name="loader" className="icon-sm" /> Đang lưu...</> : <><Icon name="save" className="icon-sm" /> Lưu bài học</>}</button>
      </div>
    </>
  );
}

export function openLessonEditor(courseId, lessonId, opts) {
  const c = Codi.course(courseId);
  if (!findLesson(c, lessonId)) { Codi.ui.toast('Không tìm thấy bài học trong khoá học này.', { type: 'danger' }); return null; }
  return Codi.ui.sheet({
    title: 'Biên tập chi tiết bài học', wide: true, raw: true,
    body: (h) => <LessonEditor handle={h} courseId={courseId} lessonId={lessonId} withAssignment={!!(opts && opts.withAssignment)} />,
  });
}

// ───────────────────────── add lesson ─────────────────────────
/** Creates a lesson of the chosen type in the chosen chapter, then opens its editor. Real default: "Bài học {n}", 10 min. */
export function addLesson(c, chapterId, kind) {
  const ch = c.chapters.find((x) => x.id === chapterId) || c.chapters[0];
  if (!ch) return null;
  const isCode = kind === 'code' || kind === 'tutorial';
  if (isCode && !(Codi.code && Codi.code.blank)) { Codi.ui.toast('Trình soạn bài code chưa sẵn sàng.', { type: 'danger' }); return null; }
  const id = 'lesson-' + Date.now().toString(36);
  const type = isCode ? kind : kind === 'lesson' ? 'reading' : kind;
  const l = { id, title: isCode ? (kind === 'code' ? 'Bài code mới' : 'Hướng dẫn code mới') : `Bài học ${ch.lessons.length + 1}`, type, durationMin: isCode ? 20 : 10, conceptIds: [], reading: '', description: '', isFreePreview: false, materials: [], quiz: null, assignment: null };
  if (isCode) l.code = Codi.code.blank(kind === 'code' ? 'challenge' : 'tutorial');
  ch.lessons.push(l); contentChanged(c); persist();
  Codi.ui.toast('Đã thêm bài học mới.', { type: 'success' });
  if (isCode) Codi.go(`/teach/courses/${c.id}/code/${id}`); else openLessonEditor(c.id, id);
  return l;
}
/** Blank PDF lesson for "Từ tài liệu / slide": the import sheet fills it, without opening the lesson editor. */
function addLessonQuiet(c, chapterId) {
  const ch = c.chapters.find((x) => x.id === chapterId) || c.chapters[0];
  const l = { id: 'lesson-' + Date.now().toString(36), title: `Bài học ${ch.lessons.length + 1}`, type: 'pdf', durationMin: 10, conceptIds: [], reading: '', description: '', isFreePreview: false, materials: [], quiz: null, assignment: null };
  ch.lessons.push(l); contentChanged(c); persist(); return l;
}

const LESSON_KINDS = [
  { group: 'Tự soạn', items: [
    ['video', 'video', 'Video', 'Gắn đường dẫn video, thêm tóm tắt, quiz hoặc bài tập.'],
    ['reading', 'book-open', 'Bài đọc', 'Nội dung chữ có định dạng, đọc ngay trên Codi.'],
    ['pdf', 'presentation', 'Slide / PDF', 'Gắn đường dẫn slide hoặc tài liệu PDF đã lưu trữ.'],
    ['code', 'code', 'Bài code', 'Đề bài, code khởi đầu, lời giải và test chấm tự động.'],
    ['tutorial', 'terminal', 'Hướng dẫn code', 'Từng bước có code chạy thử, kiểu Replit.'],
  ] },
  { group: 'Tạo bằng AI', items: [
    ['ai-lesson', 'sparkles', 'Bài giảng bằng AI', 'Nhập chủ đề, AI soạn bài đọc và câu quiz để bạn duyệt.'],
    ['ai-code', 'sparkles', 'Bài code bằng AI', 'AI soạn đề, lời giải, test và gợi ý; lời giải được chạy thử.'],
    ['ai-import', 'upload', 'Từ tài liệu / slide', 'Tải PDF, PPTX hoặc DOCX; AI tạo tóm tắt, quiz, khái niệm.'],
  ] },
];

function AddLessonBody({ handle, courseId, chapterId }) {
  const c = Codi.course(courseId);
  const [ch, setCh] = useState(chapterId);
  if (!c) return null;
  const pick = (kind) => {
    handle.close();
    if (kind === 'ai-lesson' || kind === 'ai-code') {
      const AI = lecturerAI();
      if (AI && AI.openCreate) AI.openCreate(c.id, kind === 'ai-code' ? 'code' : 'lesson', ch);
      else if (AI) Codi.ui.toast('Tạo bài bằng AI chưa sẵn sàng.', { type: 'danger' });
    } else if (kind === 'ai-import') {
      const AI = lecturerAI(); if (!AI || !AI.openImport) return;
      const l = addLessonQuiet(c, ch); AI.openImport(c.id, l.id);
    } else addLesson(c, ch, kind);
  };
  return (
    <div className="stack-4">
      <div className="field"><label htmlFor="al-ch">Thêm vào chương</label><select id="al-ch" value={ch} onChange={(e) => setCh(e.target.value)}>{c.chapters.map((x, i) => <option key={x.id} value={x.id}>Chương {i + 1}: {x.title}</option>)}</select></div>
      {LESSON_KINDS.map((g) => (
        <fieldset key={g.group} className="tc-kinds"><legend className="field-label">{g.group}</legend>
          <div className="tc-kind-grid">{g.items.map(([k, ic, t, desc]) => (
            <button key={k} type="button" className="tc-kind" onClick={() => pick(k)}>
              <span className="tc-kind-icon" aria-hidden="true"><Icon name={ic} className="icon-sm" /></span>
              <span className="tc-kind-text"><strong className="small">{t}</strong><span className="xsmall muted">{desc}</span></span></button>
          ))}</div></fieldset>
      ))}
      <p className="xsmall muted">Quiz và bài tập gắn vào từng bài: dùng &quot;Quiz&quot; hoặc &quot;Chi tiết&quot; trên dòng bài học.</p>
    </div>
  );
}

/** Step 2 of "Thêm bài học": pick the chapter and the lesson type (manual or AI). */
export function openAddLesson(c, chapterId) {
  if (!c.chapters.length) return null;
  const chId = chapterId || c.chapters[0].id;
  return Codi.ui.modal({
    title: 'Thêm bài học', size: 'lg',
    body: (h) => <AddLessonBody handle={h} courseId={c.id} chapterId={chId} />,
    footer: <button type="button" className="btn btn-ghost" data-close>Huỷ</button>,
  });
}
