// S22 lesson editor (real "Biên tập chi tiết bài học": description, duration 1–360, free preview, body, URL-only
// materials, load / error / retry, save guard) plus the port-only assignment builder with rubric, and the typed
// "Thêm bài học" menu (chapter + lesson kind, manual or AI).
// Backend: getLessonDetails / updateLesson / addLesson actions; the assignment (instructions, submission format,
// scores, rubric) goes to /api/lecturer/courses/:courseId/lessons/:lessonId/assignment, a new guided tutorial to
// …/tutorial. Late-submission policy and accepted file types have no column in Codi, so they stay on the draft only.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Codi } from '../../lib/codi';
import { api } from '../../lib/api';
import { Alert, Icon } from '../../components/ui/primitives';
import { findLesson, locked, lecturerAI, AIThinking, FieldError } from './teach-api';
import { act, cachedCourse, reloadCourse, reloadMine } from './teach-data';
import { ReviewNotes, useFlagFocus } from './review-notes';
import { ACCEPT, checkFile, fmtClock, fmtSize, uploadLessonFile } from './lesson-media-api';

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
const assignmentUrl = (courseId, lessonId) => `/api/lecturer/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/assignment`;
/** Builder draft from the stored assignment (GET …/assignment). */
const fromServerAssignment = (a) => Object.assign(newAssignment(), {
  instructions: a.instructions || '', requiresFile: a.submissionFormat === 'file' || a.submissionFormat === 'file_or_link',
  requiresLink: a.submissionFormat === 'link' || a.submissionFormat === 'file_or_link' || a.submissionFormat === 'text',
  maxScore: Number(a.maxScore) || 10, passingScore: a.passingScore ?? 50, dueDays: a.dueDays || 7,
  rubric: (a.rubric || []).map((k) => ({ id: k.id, name: k.name || '', desc: k.desc || '', points: Number(k.points) || 0 })),
});
const submissionFormat = (a) => (a.requiresFile && a.requiresLink ? 'file_or_link' : a.requiresFile ? 'file' : 'link');

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

/** "Thêm tài liệu" form: a URL, or a file uploaded to Codi (video, PDF, PPTX, DOCX) that fills type, URL and size. */
function MaterialForm({ courseId, onAdd, onClose, disabled }) {
  const [type, setType] = useState('video');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [up, setUp] = useState(null); // { pct } while uploading
  const ctrl = useRef(null);
  useEffect(() => () => { if (ctrl.current) ctrl.current.abort(); }, []);
  const add = () => {
    if (!title.trim()) { setErr('Vui lòng nhập tên tài liệu.'); return; }
    if (!url.trim()) { setErr('Vui lòng nhập URL tài liệu.'); return; }
    onAdd({ id: Codi.uid('mat'), type, title: title.trim(), url: url.trim() }); // string id = not saved yet
  };
  const upload = (file) => {
    const problem = checkFile(file, 'any');
    if (problem) { setErr(problem); return; }
    ctrl.current = new AbortController(); setErr(''); setUp({ pct: 0 });
    uploadLessonFile(courseId, file, { signal: ctrl.current.signal, onProgress: (pct) => setUp({ pct }) })
      .then((res) => {
        setUp(null);
        if (!res.material) { setErr(res.storageError || 'Chưa lưu được tệp.'); return; }
        onAdd({ id: Codi.uid('mat'), ...res.material, title: title.trim() || res.material.title });
      })
      .catch((e) => { setUp(null); if (!(e && e.name === 'AbortError')) setErr((e && e.message) || 'Không tải được tệp lên.'); });
  };
  return (
    <div className="panel stack-3 tc-mat-form">
      <div className="row-between"><strong className="small">Thêm tài liệu mới</strong><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Đóng</button></div>
      <div className="grid-3">
        <div className="field"><label htmlFor="mat-type">Loại tài liệu</label><select id="mat-type" value={type} onChange={(e) => setType(e.target.value)}>{MATERIAL_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field tc-span-2"><label htmlFor="mat-title">Tiêu đề tài liệu</label><input id="mat-title" value={title} onChange={(e) => { setTitle(e.target.value); setErr(''); }} placeholder="Ví dụ: Slide bài giảng Chương 1" /></div>
      </div>
      <div className={`field ${err ? 'is-invalid' : ''}`}><label htmlFor="mat-url">Đường dẫn (URL)</label><input id="mat-url" type="url" inputMode="url" value={url} onChange={(e) => { setUrl(e.target.value); setErr(''); }} placeholder="https://..." />
        <span className="field-help">Dán đường dẫn (YouTube, Drive…) hoặc tải tệp lên Codi: video tối đa 500MB, PDF/PPTX/DOCX tối đa 50MB.</span><FieldError>{err}</FieldError></div>
      {up && <div className="progress" role="progressbar" aria-label="Tiến độ tải lên" aria-valuenow={up.pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: up.pct + '%' }} /></div>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        {up ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => ctrl.current && ctrl.current.abort()}>Huỷ tải lên ({up.pct}%)</button> : <>
          <label className={`btn btn-secondary btn-sm ${disabled ? 'is-disabled' : ''}`} htmlFor="mat-file"><Icon name="upload" className="icon-sm" /> Tải tệp lên</label>
          <input id="mat-file" className="sr-only" type="file" accept={ACCEPT.any} disabled={disabled} onChange={(e) => { const file = e.target.files && e.target.files[0]; e.target.value = ''; if (file) upload(file); }} />
        </>}
        <button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={disabled || !!up}>Thêm đường dẫn</button></div>
    </div>
  );
}

/** Builds the editable draft from the backend (lesson details + assignment); throws on a load failure. */
async function loadDraft(courseId, lessonId, withAssignment) {
  const [det, asg] = await Promise.all([act('course', 'getLessonDetails', courseId, lessonId), api.get(assignmentUrl(courseId, lessonId))]);
  if (!det || !det.lesson) throw new Error('Không thể tải chi tiết bài học. Vui lòng thử lại.');
  const l = det.lesson;
  const assignment = asg && asg.assignment ? fromServerAssignment(asg.assignment) : (withAssignment ? newAssignment() : null);
  if (assignment) assignment.passingScore = pctOf(assignment);
  return {
    title: l.title, description: l.description || '', durationMin: Math.round((Number(l.durationSeconds) || 0) / 60) || 10,
    body: l.body || '', isFreePreview: !!l.isFreePreview, hadAssignment: !!(asg && asg.assignment),
    materials: (det.materials || []).map((m) => ({ id: m.id, type: m.type, title: m.title, url: m.url, fileSizeKb: m.fileSizeKb, durationSeconds: m.durationSeconds })),
    assignment,
  };
}

function LessonEditor({ handle, courseId, lessonId, withAssignment, flagId }) {
  const ref = useRef({ rubricAI: null, closed: false, error: null, addingMaterial: false });
  const d = ref.current;
  const [, refresh] = useReducer((x) => x + 1, 0);
  const [load, setLoad] = useState({ state: 'loading', message: '' });
  const [saving, setSaving] = useState(false);
  const rubricJob = useRef(null);
  const request = useRef(0);
  const c = cachedCourse(courseId);
  const ro = !!c && locked(c);

  const fetchDetails = useCallback(async () => {
    const req = ++request.current;
    setLoad({ state: 'loading', message: '' });
    try {
      const draft = await loadDraft(courseId, lessonId, withAssignment);
      if (req !== request.current || d.closed) return;
      Object.assign(d, draft, { error: null });
      setLoad({ state: 'ready', message: '' });
    } catch (err) {
      if (req !== request.current || d.closed) return;
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

  useFlagFocus(load.state === 'ready' ? flagId : null);
  // reviewer comments of this lesson, each shown at the block it points at
  const matIds = new Set((load.state === 'ready' ? d.materials : []).map((m) => String(m.id)));
  const notes = (match, title) => <ReviewNotes courseId={courseId} known={matIds} title={title} match={(a) => a.lessonId === lessonId && match(a)} />;
  const canSave = !ro && !saving && load.state === 'ready';
  const fail = (msg) => { d.error = msg; refresh(); return false; };
  const save = async () => {
    if (!canSave) return false;
    const title = (d.title || '').trim();
    if (!title) { Codi.ui.toast('Tên bài học không được để trống.', { type: 'danger' }); return fail('Tên bài học không được để trống.'); }
    if (title.length < 2) return fail('Tên bài học cần ít nhất 2 ký tự.');
    const dur = Number(d.durationMin);
    if (!Number.isFinite(dur) || dur < 1 || dur > 360) return fail('Thời lượng (phút) phải từ 1 đến 360.');
    const ap = d.assignment && assignmentProblem(d.assignment);
    if (ap) return fail(ap);
    setSaving(true);
    try {
      const materials = d.materials.map((m) => ({ ...(typeof m.id === 'number' ? { id: m.id } : {}), type: m.type, title: m.title, url: m.url, fileSizeKb: m.fileSizeKb || undefined, durationSeconds: m.durationSeconds || undefined }));
      await act('course', 'updateLesson', courseId, lessonId, { title, description: d.description.trim(), durationMinutes: Math.round(dur), body: d.body, isFreePreview: !!d.isFreePreview, materials });
      if (d.assignment || d.hadAssignment) {
        const a = d.assignment ? cleanAssignment(d.assignment) : null;
        await api.put(assignmentUrl(courseId, lessonId), a ? { instructions: a.instructions, submissionFormat: submissionFormat(a), maxScore: a.maxScore, passingScore: a.passingScore, dueDays: a.dueDays, rubric: a.rubric } : null);
        d.hadAssignment = !!a;
      }
      return true;
    } catch (e) {
      return fail((e && e.message) || 'Không thể lưu bài học.');
    } finally {
      setSaving(false);
      reloadCourse(courseId); reloadMine();
    }
  };
  const importAI = async () => {
    // the import works on the saved lesson, so save the draft first
    if (!(await save())) return;
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
        {notes((a) => a.type === 'lesson', 'Góp ý cho bài học')}
        <div className="field"><label htmlFor="le-title">Tên bài học <span className="req">*</span></label><input id="le-title" value={d.title} onChange={set('title')} placeholder="Nhập tên bài học..." disabled={ro || saving} /></div>
        <div className="grid-3">
          <div className="field tc-span-2"><label htmlFor="le-desc">Mô tả tóm tắt bài học</label><input id="le-desc" value={d.description} onChange={set('description')} placeholder="Tóm tắt nội dung chính của bài..." disabled={ro || saving} /></div>
          <div className="field"><label htmlFor="le-dur">Thời lượng (phút)</label><input id="le-dur" type="number" min="1" max="360" value={d.durationMin} onChange={(e) => { d.durationMin = num(e.target.value); d.error = null; refresh(); }} disabled={ro || saving} /></div>
        </div>
        <label className="panel row tc-preview-opt" htmlFor="le-preview" style={{ alignItems: 'flex-start', gap: 10 }}>
          <input id="le-preview" type="checkbox" checked={d.isFreePreview} onChange={set('isFreePreview')} disabled={ro || saving} style={{ marginTop: 3 }} />
          <span className="stack-1"><span className="small strong">Cho phép học thử (Free Preview)</span><span className="xsmall muted">Học viên chưa đăng ký mua khoá học có thể xem trước nội dung bài học này trên trang bán.</span></span>
        </label>
        <div className="field"><label htmlFor="le-body">Nội dung bài học / Ghi chú lý thuyết</label><textarea id="le-body" className="mono" rows={6} value={d.body} onChange={set('body')} placeholder="Soạn nội dung chi tiết bài đọc hoặc hướng dẫn thực hành..." disabled={ro || saving} />{notes((a) => a.type === 'reading', 'Góp ý cho bài đọc')}</div>

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
                {m.id != null && <div className="tc-mat-notes">{notes((a) => a.type === 'material' && a.itemId === String(m.id))}</div>}
              </li>
            ))}</ul>
          )}
          {d.addingMaterial && !ro && <MaterialForm courseId={courseId} disabled={saving} onClose={() => { d.addingMaterial = false; refresh(); }}
            onAdd={(m) => { d.materials.push(m); d.addingMaterial = false; refresh(); Codi.ui.toast('Đã thêm tài liệu vào danh sách chuẩn bị lưu.', { type: 'success' }); }} />}
        </section>

        <label className="switch"><input type="checkbox" checked={!!d.assignment} disabled={ro} onChange={(e) => { d.assignment = e.target.checked ? newAssignment() : null; refresh(); }} /><span className="switch-track" />Có bài tập</label>
        {notes((a) => a.type === 'assignment', 'Góp ý cho bài tập')}
        {d.assignment && <AssignmentBuilder d={d} refresh={refresh} rubricJob={rubricJob} ro={ro} />}
        {notes((a) => ['quiz', 'question', 'code', 'test'].includes(a.type), 'Góp ý cho quiz / bài code của bài này (sửa ở màn hình riêng)')}
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
        <button type="button" className="btn btn-primary" disabled={!canSave} onClick={async () => { if (await save()) { handle.close(); Codi.ui.toast('Đã cập nhật bài học thành công!', { type: 'success' }); } }}>
          {saving ? <><Icon name="loader" className="icon-sm" /> Đang lưu...</> : <><Icon name="save" className="icon-sm" /> Lưu bài học</>}</button>
      </div>
    </>
  );
}

export function openLessonEditor(courseId, lessonId, opts) {
  const c = cachedCourse(courseId);
  if (!findLesson(c, lessonId)) { Codi.ui.toast('Không tìm thấy bài học trong khoá học này.', { type: 'danger' }); return null; }
  return Codi.ui.sheet({
    title: 'Biên tập chi tiết bài học', wide: true, raw: true,
    body: (h) => <LessonEditor handle={h} courseId={courseId} lessonId={lessonId} withAssignment={!!(opts && opts.withAssignment)} flagId={opts && opts.flag} />,
  });
}

// ───────────────────────── add lesson ─────────────────────────
const tutorialUrl = (courseId, lessonId) => `/api/lecturer/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/tutorial`;
/** Real addLesson (default "Bài học {n}", 10 min) in the chosen chapter; returns the new lesson row or null. */
async function createLesson(c, chapterId, title) {
  const ch = c.chapters.find((x) => x.id === chapterId) || c.chapters[0];
  if (!ch) return null;
  try {
    const r = await act('course', 'addLesson', c.id, ch.id, title);
    return r && r.lesson ? r.lesson : null;
  } catch (e) {
    Codi.ui.toast((e && e.message) || 'Không thể thêm bài học.', { type: 'danger' });
    return null;
  }
}
/** Creates a lesson of the chosen type, then opens its editor (code kinds open the code editor route). */
export async function addLesson(c, chapterId, kind) {
  const isCode = kind === 'code' || kind === 'tutorial';
  const l = await createLesson(c, chapterId, kind === 'code' ? 'Bài code mới' : kind === 'tutorial' ? 'Hướng dẫn code mới' : undefined);
  if (!l) return null;
  if (kind === 'tutorial') {
    try {
      await api.put(tutorialUrl(c.id, l.id), { title: l.title, durationMinutes: 20, fileName: 'main.js', steps: [{ title: 'Bước 1', body: '', starter: '' }] });
    } catch (e) {
      Codi.ui.toast((e && e.message) || 'Không thể tạo bài hướng dẫn.', { type: 'danger' });
    }
  }
  await reloadCourse(c.id); reloadMine();
  Codi.ui.toast('Đã thêm bài học mới.', { type: 'success' });
  if (isCode) Codi.go(`/teach/courses/${c.id}/code/${l.id}`); else openLessonEditor(c.id, l.id);
  return l;
}
// ───────────────────────── new video / reading / slide lesson ─────────────────────────
const NEW_KIND = {
  video: {
    title: 'Thêm bài video', accept: 'video', fileLabel: 'Tải video lên', urlLabel: 'Dán đường dẫn',
    fileHelp: 'MP4, MOV, WEBM hoặc MKV, tối đa 500MB. Thời lượng bài được lấy từ video.',
    urlHelp: 'Video YouTube phát và lưu tiến độ ngay trong bài; đường dẫn khác học viên mở ở tab mới.', urlPlaceholder: 'https://www.youtube.com/watch?v=...',
    ai: 'Dùng AI chép lời giảng (Whisper), xem khung hình rồi soạn tóm tắt bài đọc và câu hỏi quiz',
  },
  pdf: {
    title: 'Thêm bài slide / PDF', accept: 'pdf', fileLabel: 'Tải PDF / PPTX lên', urlLabel: 'Dán đường dẫn',
    fileHelp: 'PDF hoặc PPTX, tối đa 50MB.', urlHelp: 'Đường dẫn tới tệp PDF/slide đã lưu trữ (Google Drive, Canva…).', urlPlaceholder: 'https://...',
    ai: 'Dùng AI đọc tài liệu (trang dạng ảnh được nhận dạng bằng OCR) rồi soạn tóm tắt bài đọc và câu hỏi quiz',
  },
  reading: { title: 'Thêm bài đọc' },
};
const baseName = (name) => String(name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

function NewLessonForm({ handle, courseId, chapterId, kind }) {
  const cfg = NEW_KIND[kind];
  const c = cachedCourse(courseId);
  const [f, setF] = useState({ title: '', description: '', durationMin: 10, isFreePreview: false, body: '', source: kind === 'reading' ? null : 'file', url: '', ai: true });
  const [up, setUp] = useState({ state: 'idle', pct: 0, name: '', res: null, error: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const ctrl = useRef(null);
  const touched = useRef({ title: false, dur: false });
  useEffect(() => () => { if (ctrl.current) ctrl.current.abort(); }, []);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErr(''); };
  const ch = c && (c.chapters.find((x) => x.id === chapterId) || c.chapters[0]);

  const pick = (file) => {
    const problem = checkFile(file, cfg.accept);
    if (problem) { setUp({ state: 'error', pct: 0, name: file.name, res: null, error: problem }); return; }
    if (ctrl.current) ctrl.current.abort();
    ctrl.current = new AbortController();
    setUp({ state: 'uploading', pct: 0, name: file.name, res: null, error: '' }); setErr('');
    uploadLessonFile(courseId, file, { signal: ctrl.current.signal, onProgress: (pct) => setUp((u) => (u.state === 'uploading' ? { ...u, pct } : u)) })
      .then((res) => {
        setUp({ state: 'done', pct: 100, name: file.name, res, error: '' });
        setF((x) => ({
          ...x,
          title: touched.current.title && x.title.trim() ? x.title : baseName(file.name).slice(0, 120),
          durationMin: !touched.current.dur && res.upload.durationSeconds ? Math.max(1, Math.min(360, Math.ceil(res.upload.durationSeconds / 60))) : x.durationMin,
        }));
      })
      .catch((e) => { if (e && e.name === 'AbortError') return; setUp({ state: 'error', pct: 0, name: file.name, res: null, error: (e && e.message) || 'Không tải được tệp lên.' }); });
  };
  const uploaded = up.state === 'done' ? up.res : null;
  const useAI = f.source === 'file' && f.ai;

  const submit = async () => {
    const title = f.title.trim();
    if (title.length < 2) return setErr('Tên bài học cần ít nhất 2 ký tự.');
    const dur = Number(f.durationMin);
    if (!Number.isFinite(dur) || dur < 1 || dur > 360) return setErr('Thời lượng (phút) phải từ 1 đến 360.');
    let material = null;
    if (kind === 'reading') {
      if (!f.body.trim()) return setErr('Nhập nội dung bài đọc.');
    } else if (f.source === 'file') {
      if (up.state === 'uploading') return setErr('Đợi tệp tải lên xong.');
      if (!uploaded) return setErr(kind === 'video' ? 'Chọn video để tải lên.' : 'Chọn tệp PDF/PPTX để tải lên.');
      if (!uploaded.material && !f.ai) return setErr(uploaded.storageError || 'Chưa lưu được tệp. Hãy thử lại hoặc dán đường dẫn.');
      material = uploaded.material;
    } else {
      const url = f.url.trim();
      if (!/^https?:\/\/\S+$/i.test(url)) return setErr('Nhập đường dẫn bắt đầu bằng http:// hoặc https://.');
      material = { type: kind === 'video' ? 'video' : /\.pptx?(\?|$)/i.test(url) ? 'slide' : 'pdf', title, url };
    }
    setSaving(true);
    const l = await createLesson(c, ch && ch.id, title);
    if (!l) { setSaving(false); return; }
    try {
      await act('course', 'updateLesson', courseId, l.id, {
        title, description: f.description.trim(), durationMinutes: Math.round(dur), body: kind === 'reading' ? f.body : '',
        isFreePreview: !!f.isFreePreview, materials: material ? [{ type: material.type, title: material.title || title, url: material.url, fileSizeKb: material.fileSizeKb || undefined, durationSeconds: material.durationSeconds || undefined }] : [],
      });
    } catch (e) {
      setSaving(false); setErr((e && e.message) || 'Đã tạo bài nhưng chưa lưu được nội dung. Mở "Chi tiết" để sửa.');
      reloadCourse(courseId); reloadMine();
      return;
    }
    await reloadCourse(courseId); reloadMine();
    handle.close();
    if (useAI && uploaded) {
      const AI = lecturerAI();
      if (AI && AI.openImport) { AI.openImport(courseId, l.id, { upload: { ...uploaded, material: null } }); return; }
    }
    Codi.go(`/teach/courses/${courseId}/content?lesson=${l.id}`);
    Codi.ui.toast(`Đã thêm bài “${title}” vào ${ch ? ch.title : 'khoá học'}.`, { type: 'success' });
  };

  if (!c) return null;
  return (
    <>
      <div className="sheet-body stack-4">
        <p className="small muted">Bài được thêm vào <strong>{ch ? ch.title : ''}</strong>. Quiz và bài tập thêm sau ở dòng bài học.</p>
        {kind !== 'reading' && (
          <fieldset className="stack-3"><legend className="field-label">{kind === 'video' ? 'Video bài giảng' : 'Tài liệu bài giảng'} <span className="req">*</span></legend>
            <div className="viz-seg-ctrl" role="group" aria-label="Nguồn">
              {[['file', cfg.fileLabel], ['url', cfg.urlLabel]].map(([k, t]) => <button key={k} type="button" aria-pressed={f.source === k} disabled={saving} onClick={() => set('source', k)}>{t}</button>)}
            </div>
            {f.source === 'file' ? (
              <div className="stack-2">
                {up.state === 'idle' || up.state === 'error' ? (
                  <div className="la-drop">
                    <Icon name={kind === 'video' ? 'video' : 'upload'} className="icon-lg" /><span className="small muted">{cfg.fileHelp}</span>
                    <label className="btn btn-primary" htmlFor="nl-file">Chọn tệp</label>
                    <input id="nl-file" className="sr-only" type="file" accept={ACCEPT[cfg.accept]} onChange={(e) => { const file = e.target.files && e.target.files[0]; e.target.value = ''; if (file) pick(file); }} />
                  </div>
                ) : (
                  <div className="la-file"><Icon name={kind === 'video' ? 'video' : 'file-text'} className="icon-sm" />
                    <span className="small od-fill"><strong>{up.name}</strong>{uploaded ? ` · ${fmtSize(uploaded.upload.sizeKb)}${uploaded.upload.durationSeconds ? ` · ${fmtClock(uploaded.upload.durationSeconds)}` : ''}` : ` · đang tải ${up.pct}%`}</span>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => { if (ctrl.current) ctrl.current.abort(); setUp({ state: 'idle', pct: 0, name: '', res: null, error: '' }); }}>{up.state === 'uploading' ? 'Huỷ' : 'Đổi tệp'}</button></div>
                )}
                {up.state === 'uploading' && <div className="progress" role="progressbar" aria-label="Tiến độ tải lên" aria-valuenow={up.pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: up.pct + '%' }} /></div>}
                {up.state === 'error' && <FieldError>{up.error}</FieldError>}
                {uploaded && uploaded.storageError && <p className="small text-warn"><Icon name="alert-triangle" className="icon-sm" /> {uploaded.storageError}</p>}
                <label className="check"><input type="checkbox" checked={f.ai} disabled={saving} onChange={(e) => set('ai', e.target.checked)} /> {cfg.ai}</label>
                {f.ai && <p className="xsmall muted">Sau khi tạo bài, AI đọc tệp và đưa bản nháp để bạn duyệt; không có gì đến học viên trước khi bạn chấp nhận.</p>}
              </div>
            ) : (
              <div className="field"><label htmlFor="nl-url">Đường dẫn (URL)</label>
                <input id="nl-url" type="url" inputMode="url" value={f.url} onChange={(e) => set('url', e.target.value)} placeholder={cfg.urlPlaceholder} disabled={saving} />
                <span className="field-help">{cfg.urlHelp}</span></div>
            )}
          </fieldset>
        )}
        <div className="field"><label htmlFor="nl-title">Tên bài học <span className="req">*</span></label>
          <input id="nl-title" value={f.title} onChange={(e) => { touched.current.title = true; set('title', e.target.value); }} placeholder={kind === 'video' ? 'Ví dụ: useEffect và vòng đời component' : 'Nhập tên bài học...'} disabled={saving} /></div>
        <div className="grid-3">
          <div className="field tc-span-2"><label htmlFor="nl-desc">Mô tả ngắn</label><input id="nl-desc" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Tóm tắt nội dung chính của bài..." disabled={saving} /></div>
          <div className="field"><label htmlFor="nl-dur">Thời lượng (phút)</label><input id="nl-dur" type="number" min="1" max="360" value={f.durationMin} onChange={(e) => { touched.current.dur = true; set('durationMin', num(e.target.value)); }} disabled={saving} /></div>
        </div>
        {kind === 'reading' && (
          <div className="field"><label htmlFor="nl-body">Nội dung bài đọc <span className="req">*</span></label>
            <textarea id="nl-body" className="mono" rows={10} value={f.body} onChange={(e) => set('body', e.target.value)} placeholder={'## Tiêu đề\n\n**Mục tiêu:** ...\n\n- Ý chính 1\n- Ý chính 2'} disabled={saving} />
            <span className="field-help">Hỗ trợ Markdown: **in đậm**, `code`, khối ``` và danh sách bắt đầu bằng "- ". Có sẵn tài liệu? Dùng "Tạo bằng AI → Từ tài liệu / slide".</span></div>
        )}
        <label className="check"><input type="checkbox" checked={f.isFreePreview} onChange={(e) => set('isFreePreview', e.target.checked)} disabled={saving} /> Cho phép học thử (Free Preview)</label>
        {err && <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{err}</span></p>}
      </div>
      <div className="sheet-footer">
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => handle.close()}>Huỷ</button>
        <button type="button" className="btn btn-primary" disabled={saving || up.state === 'uploading'} onClick={submit}>
          {saving ? <><Icon name="loader" className="icon-sm" /> Đang tạo…</> : useAI && uploaded ? <><Icon name="sparkles" className="icon-sm" /> Tạo bài và soạn bằng AI</> : 'Tạo bài học'}</button>
      </div>
    </>
  );
}

function openNewLesson(c, chapterId, kind) {
  return Codi.ui.sheet({
    title: NEW_KIND[kind].title, wide: true, raw: true,
    body: (h) => <NewLessonForm handle={h} courseId={c.id} chapterId={chapterId} kind={kind} />,
  });
}

const LESSON_KINDS = [
  { group: 'Tự soạn', items: [
    ['video', 'video', 'Video', 'Tải video lên hoặc dán link YouTube; AI chép lời và soạn quiz nếu bạn muốn.'],
    ['reading', 'book-open', 'Bài đọc', 'Nội dung chữ có định dạng, đọc ngay trên Codi.'],
    ['pdf', 'presentation', 'Slide / PDF', 'Tải PDF/PPTX lên hoặc dán đường dẫn; AI đọc (kể cả bản scan) và soạn quiz.'],
    ['code', 'code', 'Bài code', 'Đề bài, code khởi đầu, lời giải và test chấm tự động.'],
    ['tutorial', 'terminal', 'Hướng dẫn code', 'Từng bước có code chạy thử, kiểu Replit.'],
  ] },
  { group: 'Tạo bằng AI', items: [
    ['ai-lesson', 'sparkles', 'Bài giảng bằng AI', 'Nhập chủ đề, AI soạn bài đọc và câu quiz để bạn duyệt.'],
    ['ai-code', 'sparkles', 'Bài code bằng AI', 'AI soạn đề, lời giải, test và gợi ý; lời giải được chạy thử.'],
    ['ai-import', 'upload', 'Từ tài liệu / video', 'Tải PDF, PPTX, DOCX hoặc video; AI soạn bài đọc và quiz để bạn duyệt.'],
  ] },
];

function AddLessonBody({ handle, courseId, chapterId }) {
  const c = cachedCourse(courseId);
  const [ch, setCh] = useState(chapterId);
  if (!c) return null;
  const pick = (kind) => {
    handle.close();
    if (kind === 'ai-lesson' || kind === 'ai-code') {
      const AI = lecturerAI();
      if (AI && AI.openCreate) AI.openCreate(c.id, kind === 'ai-code' ? 'code' : 'lesson', ch);
      else if (AI) Codi.ui.toast('Tạo bài bằng AI chưa sẵn sàng.', { type: 'danger' });
    } else if (kind === 'ai-import') {
      // The lesson is created when the reviewed draft is applied, so cancelling leaves no empty lesson behind.
      const AI = lecturerAI(); if (AI && AI.openImport) AI.openImport(c.id, null, { chapterId: ch });
    } else if (NEW_KIND[kind]) openNewLesson(c, ch, kind);
    else addLesson(c, ch, kind);
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
