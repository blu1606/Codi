// S22 course editor: header + tabs Nội dung (curriculum tree, reorder, delete guards with undo) · Thông tin (real
// validation, unsaved guard) · Bản đồ kiến thức (kmap-tab.jsx) · Xuất bản (status banners, review round, readiness).
// Behaviour and copy follow the real app (dashboard/lecturer/courses/[courseId]/course-editor.tsx, actions.ts,
// publish/publish-tab-client.tsx). Drag-and-drop reorder and course delete are port-only extras.
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Empty, Icon, CourseStatus } from '../../components/ui/primitives';
import {
  shell, notMine, isMine, me, ls, locked, findLesson, contentChanged, persist, guard,
  TYPE_ICON, TYPE_LABEL, ENTRY_MIN, LEVELS, levelLabel, categoryOptions, categoryName, PRICE_MAX,
  FieldError, reviewRound, reviewFlagsFor, promptReason,
} from './teach-api';
import { rerender, useView } from './view-store';
import { KmapTab, kmapOf } from './kmap-tab';
import { openLessonEditor, openAddLesson } from './lesson-editor';
import { aiImport } from './quiz-builder';

const { fmt } = Codi;
const TABS = [['content', 'Nội dung'], ['info', 'Thông tin'], ['kmap', 'Bản đồ kiến thức'], ['publish', 'Xuất bản']];

function EditorHeader({ c, tab }) {
  const km = Codi.db().knowledgeMaps[c.id] || {};
  const cat = categoryName(c.categoryId);
  return (
    <div className="stack-3" style={{ marginBottom: 16 }}>
      <Link className="small" to="/teach/courses"><Icon name="arrow-left" className="icon-sm" /> Khoá học của tôi</Link>
      <div className="row-between"><div className="stack-1"><div className="row" style={{ gap: 12, flexWrap: 'wrap' }}><h1>{c.title}</h1><CourseStatus status={c.status} /></div>
        <span className="xsmall muted">{c.chapters.length} chương · {ls(c).length} bài học{cat ? ` · ${cat}` : ''} · Trình độ: {levelLabel(c.level)} · {fmt.duration(c.durationMin)}</span></div>
        {c.status === 'published' && <Link className="btn btn-ghost btn-sm" to={`/courses/${c.slug}`}><Icon name="eye" className="icon-sm" /> Xem trang bán</Link>}</div>
      {locked(c) && <Alert type="warn" title="Đang chờ duyệt — nội dung chỉ đọc" body="Khoá học đang được ban quản trị kiểm duyệt. Bạn có thể xem lại nhưng không thể chỉnh sửa cho đến khi có kết quả duyệt." />}
      {c.status === 'published' && <Alert type="info" title="Khoá học đang bán" body="Các thay đổi nội dung sẽ áp dụng trực tiếp cho học viên. Sau khi sửa, bạn hãy cập nhật lại bản đồ kiến thức." />}
      <div className="tabs" role="tablist" style={{ marginBottom: 0 }}>{TABS.map(([k, l]) => (
        <Link key={k} className="tab" role="tab" aria-selected={tab === k} to={`/teach/courses/${c.id}/${k}`}>{l}{k === 'kmap' && ['stale', 'failed', 'ready'].includes(km.status) ? <> <span className="count count-accent" aria-label="cần xem lại">!</span></> : null}</Link>
      ))}</div>
    </div>
  );
}

// ───────────────────────── Nội dung ─────────────────────────
let renaming = null; // id of chapter/lesson being renamed
let drag = null;

const codeBadge = (l) => {
  if (!l.code || l.code.kind !== 'challenge') return null;
  const chk = l.code.solutionCheck; const tests = l.code.tests || [];
  if (!tests.length) return <span className="badge badge-warn"><Icon name="alert-triangle" />Chưa có test</span>;
  return chk && chk.ok ? <span className="badge badge-success"><Icon name="check" />{tests.length} test · lời giải đạt</span> : <span className="badge badge-warn"><Icon name="alert-triangle" />Chưa chạy thử lời giải</span>;
};
const materialCount = (l) => (Array.isArray(l.materials) ? l.materials.length : l.material && l.material.fileName ? 1 : 0);

function RenameForm({ c, id, value, label }) {
  const submit = (e) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('title') || '').trim();
    if (!name) return; // real: empty rename is a silent no-op
    const ch = c.chapters.find((x) => x.id === id);
    if (ch) ch.title = name; else { const f = findLesson(c, id); if (f) f.l.title = name; }
    renaming = null; contentChanged(c); persist();
    Codi.ui.toast(ch ? 'Đã đổi tên chương.' : 'Đã đổi tên bài học.', { type: 'success' });
  };
  return (
    <form className="input-group od-fill" onSubmit={submit}>
      <input className="input" name="title" defaultValue={value} aria-label={label} autoFocus onFocus={(e) => e.target.select()} />
      <button className="btn btn-primary btn-sm" type="submit">Lưu</button>
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => { renaming = null; rerender(); }}>Huỷ</button>
    </form>
  );
}

/** Arrow moves stay inside the list (real: disabled at the ends); cross-chapter moves use drag and drop. */
function move(c, kind, id, dir) {
  if (kind === 'chapter') { const i = c.chapters.findIndex((x) => x.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= c.chapters.length) return; [c.chapters[i], c.chapters[j]] = [c.chapters[j], c.chapters[i]]; }
  else {
    const f = findLesson(c, id); if (!f) return;
    const j = f.i + dir;
    if (j < 0 || j >= f.ch.lessons.length) return;
    [f.ch.lessons[f.i], f.ch.lessons[j]] = [f.ch.lessons[j], f.ch.lessons[f.i]];
  }
  contentChanged(c); persist();
}

/**
 * Real deleteLesson guards (actions.ts): learner work blocks first, then any dependent row that Undo could not
 * restore (assessments: quiz / code / assignment, progress, concept links, Q&A, conversations, review flags, path).
 */
export function lessonDeleteBlock(c, l) {
  const db = Codi.db();
  const worked = (db.submissions || []).some((s) => s.lessonId === l.id)
    || (db.codeAttempts || []).some((a) => a.lessonId === l.id && ((a.submits || 0) > 0 || (a.runs || 0) > 0))
    || (db.learnerProgress || []).some((p) => p.courseId === c.id && p.quizScores && p.quizScores[l.id] !== undefined);
  if (worked) return 'Không thể xoá bài học vì đã có học viên làm bài kiểm tra hoặc nộp bài trong bài học này.';
  const m = db.knowledgeMaps[c.id];
  const linked = !!(l.quiz || l.code || l.assignment)
    || (db.learnerProgress || []).some((p) => p.courseId === c.id && (p.completed || []).includes(l.id))
    || (l.conceptIds || []).length > 0
    || !!(m && (m.concepts || []).some((k) => (k.lessonIds || []).includes(l.id)))
    || (db.questions || []).some((q) => q.lessonId === l.id)
    || (db.conversations || []).some((x) => x.lessonId === l.id)
    || (db.courseReviews || []).some((r) => r.courseId === c.id && (r.flags || []).some((f) => f.target && f.target.lessonId === l.id))
    || (c.aiPath || []).some((p) => p.lessonId === l.id)
    || (c.entryTest && (c.entryTest.questions || []).some((q) => q.lessonId === l.id));
  if (linked) return 'Không thể xoá bài học vì có dữ liệu liên kết không thể phục hồi khi Hoàn tác. Hãy giữ lại bài học này.';
  return null;
}

function restoreLesson(courseId, snap) {
  const c = Codi.course(courseId);
  const ch = c && c.chapters.find((x) => x.id === snap.chapterId);
  if (!ch || findLesson(c, snap.lesson.id)) { Codi.ui.toast('Không thể khôi phục bài học.', { type: 'danger' }); return; }
  ch.lessons.splice(Math.min(snap.index, ch.lessons.length), 0, snap.lesson);
  contentChanged(c); persist();
  Codi.ui.toast(`Đã khôi phục "${snap.lesson.title}"`, { type: 'success' });
}

async function removeLesson(c, id) {
  const f = findLesson(c, id); if (!f) return;
  const t = f.l.title;
  const blocked = lessonDeleteBlock(c, f.l);
  if (blocked) { Codi.ui.toast(blocked, { type: 'danger' }); return; }
  const r = await Codi.ui.confirm({
    title: 'Xoá bài học?',
    consequence: c.status === 'published' ? `Khoá học đang xuất bản. Xoá bài học "${t}" có thể làm gián đoạn tiến độ của học viên đã đăng ký.` : `Bài học "${t}" sẽ bị xoá khỏi chương này.`,
    reversible: 'Bạn có thể hoàn tác ngay sau khi xoá.', confirmLabel: 'Xoá', danger: true,
  });
  if (!r.ok) return;
  const g = findLesson(c, id); if (!g) return;
  const again = lessonDeleteBlock(c, g.l); // state may have changed while the dialog was open
  if (again) { Codi.ui.toast(again, { type: 'danger' }); return; }
  const snap = { chapterId: g.ch.id, index: g.i, lesson: JSON.parse(JSON.stringify(g.l)) };
  g.ch.lessons.splice(g.i, 1);
  contentChanged(c); persist();
  Codi.ui.toast(`Đã xoá "${t}"`, { action: { label: 'Hoàn tác', onClick: () => restoreLesson(c.id, snap) } });
}

async function removeChapter(c, id) {
  const ch = c.chapters.find((x) => x.id === id); if (!ch) return;
  if (ch.lessons.length) { Codi.ui.toast('Không thể xoá chương còn bài học. Hãy xoá từng bài học đủ điều kiện trước, rồi xoá chương trống.', { type: 'danger' }); return; }
  const r = await Codi.ui.confirm({
    title: 'Xoá chương?',
    consequence: c.status === 'published' ? `Khoá học đã xuất bản. Xoá chương "${ch.title}" có thể ảnh hưởng trực tiếp đến học viên đã đăng ký. Chỉ có thể xoá chương trống.` : `Chương "${ch.title}" sẽ bị xoá khỏi khoá học. Chỉ có thể xoá chương trống.`,
    reversible: 'Thao tác này không hoàn tác được.', confirmLabel: 'Xoá', danger: true,
  });
  if (!r.ok) return;
  const cur = c.chapters.find((x) => x.id === id);
  if (!cur) return;
  if (cur.lessons.length) { Codi.ui.toast('Không thể xoá chương còn bài học. Hãy xoá từng bài học đủ điều kiện trước, rồi xoá chương trống.', { type: 'danger' }); return; }
  c.chapters = c.chapters.filter((x) => x !== cur);
  contentChanged(c); persist(); Codi.ui.toast('Đã xoá chương.', { type: 'success' });
}

function addChapter(c) {
  c.chapters.push({ id: c.id + '-ch' + Date.now().toString(36), title: `Chương ${c.chapters.length + 1}`, lessons: [] });
  contentChanged(c); persist();
  Codi.ui.toast('Đã thêm chương mới.', { type: 'success' });
}
async function deleteCourse(c) {
  if (Codi.db().enrolments.some((e) => e.courseId === c.id)) return;
  const r = await Codi.ui.confirm({ title: 'Xoá vĩnh viễn khoá học?', body: `"${c.title}" và toàn bộ nội dung sẽ bị xoá.`, reversible: false, typeToConfirm: c.title, confirmLabel: 'Xoá khoá học', danger: true });
  if (!r.ok) return;
  Codi.set((st) => { st.db.courses = st.db.courses.filter((x) => x.id !== c.id); delete st.db.knowledgeMaps[c.id]; }, { render: false });
  Codi.ui.toast('Đã xoá khoá học.'); Codi.go('/teach/courses');
}

// Drag and drop (pointer users); keyboard users have the arrow buttons. Delegated like the mockup.
const clearDragMarks = () => document.querySelectorAll('.is-dragging, .is-drop-target').forEach((x) => x.classList.remove('is-dragging', 'is-drop-target'));
function dndHandlers(c) {
  return {
    onDragStart(e) {
      const el = e.target.closest && e.target.closest('[data-drag]'); if (!el) return;
      drag = { kind: el.dataset.drag, id: el.dataset.id };
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', el.dataset.id);
      el.classList.add('is-dragging');
    },
    onDragEnd() { clearDragMarks(); drag = null; },
    onDragOver(e) {
      if (!drag) return;
      const t = e.target.closest('[data-drop]'); if (!t) return;
      const ok = drag.kind === 'lesson' ? ['lesson', 'chapter-end', 'chapter'].includes(t.dataset.drop) : t.dataset.drop === 'chapter';
      if (!ok) return;
      e.preventDefault();
      document.querySelectorAll('.is-drop-target').forEach((x) => x.classList.remove('is-drop-target'));
      t.classList.add('is-drop-target');
    },
    onDrop(e) {
      if (!drag) return;
      const t = e.target.closest('[data-drop]'); if (!t) return;
      e.preventDefault();
      const d = drag; drag = null; clearDragMarks();
      if (d.kind === 'chapter' && t.dataset.drop === 'chapter' && t.dataset.id !== d.id) {
        const from = c.chapters.findIndex((x) => x.id === d.id); if (from < 0) return;
        const [moved] = c.chapters.splice(from, 1);
        c.chapters.splice(c.chapters.findIndex((x) => x.id === t.dataset.id), 0, moved);
      } else if (d.kind === 'lesson') {
        if (t.dataset.drop === 'lesson' && t.dataset.id === d.id) return;
        const f = findLesson(c, d.id); if (!f) return;
        f.ch.lessons.splice(f.i, 1);
        if (t.dataset.drop === 'lesson') { const g = findLesson(c, t.dataset.id); g.ch.lessons.splice(g.i, 0, f.l); }
        else { const ch = c.chapters.find((x) => x.id === t.dataset.id); ch.lessons.push(f.l); }
      } else return;
      contentChanged(c); persist(); Codi.ui.toast('Đã sắp xếp lại nội dung.');
    },
  };
}

function ContentTab({ c, query }) {
  useView();
  const ro = locked(c);
  // open reviewer flags of the last decided round, shown on the lesson they point at
  const rr = reviewRound(c);
  const openFlags = (l) => reviewFlagsFor(rr, l.id).filter((x) => x.status === 'open');
  const flagBadge = (l) => { const n = openFlags(l); return n.length ? <Link className={`badge ${n.some((x) => x.severity === 'must') ? 'badge-danger' : 'badge-warn'}`} to={`/teach/courses/${c.id}/publish`}><Icon name="flag" />{n.length} góp ý từ quản trị</Link> : null; };
  const aiPending = (l) => (l.quiz ? l.quiz.questions.filter((q) => q.aiGenerated && q.aiReviewed === false).length : 0);
  const hl = query && query.lesson;
  const dragAttrs = (kind, id) => (ro ? {} : { draggable: true, 'data-drag': kind, 'data-id': id });
  const startRename = (id) => { renaming = id; rerender(); };

  const lessonRow = (l, li, ch) => (
    <li key={l.id} className={`tc-lesson ${hl === l.id ? 'is-target' : ''}`} {...dragAttrs('lesson', l.id)} data-drop="lesson" data-id={l.id}>
      {!ro && <span className="tc-grip" aria-hidden="true"><Icon name="grip-vertical" className="icon-sm" /></span>}
      <span className="tc-type"><Icon name={TYPE_ICON[l.type] || 'book-open'} className="icon-sm" /></span>
      {renaming === l.id ? <RenameForm c={c} id={l.id} value={l.title} label="Tên bài học" /> : (
        <div className="od-fill stack-1"><span className="row small strong" style={{ gap: 8 }}>{l.title}{l.isFreePreview && <span className="badge badge-info">Học thử</span>}</span>
          <span className="row xsmall muted" style={{ gap: 8 }}>{TYPE_LABEL[l.type] || 'Bài đọc'} · Thời lượng: {Math.round(Number(l.durationMin) || 0)} phút{materialCount(l) ? ` · ${materialCount(l)} tài liệu` : ''}{codeBadge(l)}
          {l.quiz && <span className="badge badge-neutral">Quiz {l.quiz.questions.length} câu</span>}
          {l.assignment && <span className="badge badge-neutral">Bài tập{(l.assignment.rubric || []).length ? '' : ' · chưa có thang chấm'}</span>}
          {l.aiDraft && <span className="badge badge-neutral"><Icon name="sparkles" />AI soạn</span>}
          {aiPending(l) > 0 && <span className="badge badge-accent"><Icon name="sparkles" />{aiPending(l)} câu AI chưa duyệt</span>}
          {flagBadge(l)}</span></div>
      )}
      {renaming === l.id ? null : (
        <div className="tc-row-actions">
          {l.code ? <Link className="btn btn-ghost btn-sm" to={`/teach/courses/${c.id}/code/${l.id}`}><Icon name="code" className="icon-sm" /> Code</Link>
            : <button type="button" className="btn btn-ghost btn-sm" onClick={() => openLessonEditor(c.id, l.id)}><Icon name="file-text" className="icon-sm" /> Chi tiết</button>}
          <Link className="btn btn-ghost btn-sm" to={`/teach/courses/${c.id}/quiz/${l.id}`}><Icon name="clipboard-check" className="icon-sm" /> Quiz</Link>
          {ro ? null : <>
            {l.code || l.assignment ? null : <button type="button" className="btn btn-ghost btn-sm" onClick={() => openLessonEditor(c.id, l.id, { withAssignment: true })}>Thêm bài tập</button>}
            {l.code ? null : <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => aiImport(c.id, l.id)} aria-label={`Tạo nội dung cho ${l.title} bằng AI từ tài liệu`} title="Tạo bằng AI từ tài liệu"><Icon name="sparkles" className="icon-sm" /></button>}
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => startRename(l.id)} aria-label={`Đổi tên ${l.title}`} title="Đổi tên nhanh"><Icon name="pencil" className="icon-sm" /></button>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => move(c, 'lesson', l.id, -1)} disabled={li === 0} aria-label={`Chuyển ${l.title} lên`} title="Di chuyển lên"><Icon name="arrow-up" className="icon-sm" /></button>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => move(c, 'lesson', l.id, 1)} disabled={li === ch.lessons.length - 1} aria-label={`Chuyển ${l.title} xuống`} title="Di chuyển xuống"><Icon name="arrow-down" className="icon-sm" /></button>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeLesson(c, l.id)} aria-label={`Xoá ${l.title}`} title="Xoá bài học"><Icon name="trash" className="icon-sm" /></button>
          </>}
        </div>
      )}
    </li>
  );
  // Two structural actions only: a chapter, or a lesson (its type is chosen in the next step).
  const addBar = ro ? null : (
    <div className="row" style={{ gap: 8 }}>
      <button type="button" className="btn btn-secondary" onClick={() => addChapter(c)}><Icon name="layers" className="icon-sm" /> Thêm chương</button>
      {c.chapters.length > 0 && <button type="button" className="btn btn-primary" onClick={() => openAddLesson(c, c.chapters[0].id)}><Icon name="plus" className="icon-sm" /> Thêm bài học</button>}
    </div>
  );
  const dnd = dndHandlers(c);
  const enrolled = Codi.db().enrolments.filter((e) => e.courseId === c.id).length;
  return (
    <div className="stack-4" onDragStart={dnd.onDragStart} onDragEnd={dnd.onDragEnd} onDragOver={dnd.onDragOver} onDrop={dnd.onDrop}>
      <div className="card"><div className="card-body compact row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="stack-1 small muted"><p>Dùng nút mũi tên để sắp xếp thứ tự chương và bài học. Bấm &quot;Chi tiết&quot; để biên tập nội dung bài và tài liệu.{ro ? '' : ' Bạn cũng có thể kéo thả biểu tượng ⋮⋮ để chuyển bài sang chương khác.'}</p>
          <p>Bài kiểm tra đầu vào (Diagnostic Test): {c.entryTest
            ? <Link className="strong" to={`/teach/courses/${c.id}/quiz/entry`}>Đã có ({c.entryTest.questions.length} câu)</Link>
            : <Link className="strong text-danger" to={`/teach/courses/${c.id}/quiz/entry`}>Chưa có — Tạo bài kiểm tra đầu vào</Link>}</p></div>
        {addBar}</div></div>
      {!c.chapters.length && <div className="card"><Empty icon="layers" title="Khoá học chưa có nội dung" body="Bắt đầu bằng cách thêm chương đầu tiên, sau đó thêm các bài học lý thuyết, bài thực hành và câu hỏi trắc nghiệm." actions={ro ? null : <button type="button" className="btn btn-primary" onClick={() => addChapter(c)}><Icon name="plus" /> Thêm chương đầu tiên</button>} /></div>}
      {c.chapters.map((ch, ci) => (
        <section key={ch.id} className="card tc-chapter" {...dragAttrs('chapter', ch.id)} data-drop="chapter" data-id={ch.id}>
          <div className="card-header">
            <div className="row od-fill">{!ro && <span className="tc-grip" aria-hidden="true"><Icon name="grip-vertical" className="icon-sm" /></span>}
              {renaming === ch.id ? <RenameForm c={c} id={ch.id} value={ch.title} label="Tên chương" /> : <h2 className="tc-h">Chương {ci + 1}: {ch.title}</h2>}</div>
            {ro || renaming === ch.id ? null : (
              <div className="tc-row-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openAddLesson(c, ch.id)}><Icon name="plus" className="icon-sm" /> Bài học</button>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => startRename(ch.id)} aria-label="Đổi tên chương" title="Đổi tên chương"><Icon name="pencil" className="icon-sm" /></button>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => move(c, 'chapter', ch.id, -1)} disabled={ci === 0} aria-label="Chuyển chương lên" title="Di chuyển lên"><Icon name="arrow-up" className="icon-sm" /></button>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => move(c, 'chapter', ch.id, 1)} disabled={ci === c.chapters.length - 1} aria-label="Chuyển chương xuống" title="Di chuyển xuống"><Icon name="arrow-down" className="icon-sm" /></button>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeChapter(c, ch.id)} aria-label="Xoá chương" title="Xoá chương"><Icon name="trash" className="icon-sm" /></button></div>
            )}
          </div>
          <ol className="list tc-lessons" data-drop-zone={ch.id}>{ch.lessons.map((l, li) => lessonRow(l, li, ch))}
            {!ch.lessons.length && <li className="tc-empty-drop small muted" data-drop="chapter-end" data-id={ch.id}>Chương này chưa có bài học. {ro ? '' : 'Bấm “+ Bài học” ở trên để thêm.'}</li>}</ol>
        </section>
      ))}
      {!ro && (
        <section className="card tc-danger"><div className="card-body row-between">
          <div className="stack-1"><strong>Xoá khoá học</strong><span className="small muted">{enrolled ? `Khoá học có ${enrolled} học viên nên không thể xoá. Liên hệ quản trị viên nếu cần ẩn khoá học.` : 'Xoá vĩnh viễn khoá học và toàn bộ nội dung.'}</span></div>
          <button type="button" className="btn btn-danger-outline" disabled={!!enrolled} onClick={() => deleteCourse(c)}>Xoá khoá học</button>
        </div></section>
      )}
    </div>
  );
}

// ───────────────────────── Thông tin ─────────────────────────
let infoDraft = null;
/** Real handleSaveInfo + updateCourseInfo: title ≥ 5, summary ≥ 20, price a non-blank integer 0…2,147,483,647. */
export function validateInfo(d) {
  const err = {};
  if (d.title.trim().length < 5) err.title = 'Tên khoá học cần ít nhất 5 ký tự.';
  if (d.summary.trim().length < 20) err.summary = 'Mô tả cần ít nhất 20 ký tự.';
  const raw = String(d.proposedPrice).trim();
  const n = Number(raw);
  if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < 0) err.proposedPrice = 'Giá đề xuất phải là số nguyên không âm.';
  else if (n > PRICE_MAX) err.proposedPrice = 'Giá đề xuất phải là số nguyên không âm, không vượt quá 2.147.483.647 VND.';
  if (!categoryOptions(d.originalCategoryId).some((x) => x.id === d.categoryId)) err.categoryId = 'Chọn một danh mục hợp lệ.';
  if (!LEVELS.some(([k]) => k === d.level)) err.level = 'Chọn trình độ hợp lệ.';
  return err;
}
function InfoTab({ c }) {
  useView();
  const ro = locked(c);
  if (!infoDraft || infoDraft.id !== c.id) infoDraft = { id: c.id, title: c.title, summary: c.summary, categoryId: c.categoryId, originalCategoryId: c.categoryId, level: c.level, outcomes: (c.outcomes || []).join('\n'), requirements: (c.requirements || []).join('\n'), proposedPrice: c.proposedPrice === null || c.proposedPrice === undefined ? '' : String(c.proposedPrice), errors: {} };
  const d = infoDraft; const e = d.errors;
  const onInput = (ev) => {
    infoDraft[ev.target.name] = ev.target.value;
    if (infoDraft.errors[ev.target.name]) infoDraft.errors = { ...infoDraft.errors, [ev.target.name]: null };
    if (!guard.dirty) guard.dirty = { label: 'Thông tin khoá học', scope: '/teach/courses/' + c.id + '/info', reset: () => { infoDraft = null; } };
    rerender();
  };
  const save = (ev) => {
    ev.preventDefault();
    if (ro) return;
    const err = validateInfo(d);
    d.errors = err;
    if (Object.keys(err).length) { rerender(); return; }
    Object.assign(c, { title: d.title.trim(), summary: d.summary.trim(), categoryId: d.categoryId, level: d.level, outcomes: d.outcomes.split('\n').map((x) => x.trim()).filter(Boolean), requirements: d.requirements.split('\n').map((x) => x.trim()).filter(Boolean), proposedPrice: Number(String(d.proposedPrice).trim()) });
    infoDraft = null; guard.dirty = null;
    contentChanged(c); persist(); Codi.ui.toast('Đã lưu thông tin khoá học.', { type: 'success' });
  };
  return (
    <form className="card" onSubmit={save} noValidate data-dirty-scope>
      <div className="card-header"><h2 className="tc-h">Thông tin chi tiết khoá học</h2></div>
      <div className="card-body stack-4">
        <div className={`field ${e.title ? 'is-invalid' : ''}`}><label htmlFor="in-title">Tên khoá học</label><input id="in-title" name="title" value={d.title} onChange={onInput} disabled={ro} aria-invalid={!!e.title} /><FieldError>{e.title}</FieldError></div>
        <div className={`field ${e.summary ? 'is-invalid' : ''}`}><label htmlFor="in-sum">Mô tả ngắn</label><textarea id="in-sum" name="summary" rows={3} value={d.summary} onChange={onInput} disabled={ro} aria-invalid={!!e.summary} /><FieldError>{e.summary}</FieldError></div>
        <div className="grid-3">
          <div className={`field ${e.categoryId ? 'is-invalid' : ''}`}><label htmlFor="in-cat">Danh mục</label><select id="in-cat" name="categoryId" value={d.categoryId} onChange={onInput} disabled={ro}>{categoryOptions(d.originalCategoryId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><FieldError>{e.categoryId}</FieldError></div>
          <div className={`field ${e.level ? 'is-invalid' : ''}`}><label htmlFor="in-level">Trình độ</label><select id="in-level" name="level" value={d.level} onChange={onInput} disabled={ro}>{LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><FieldError>{e.level}</FieldError></div>
          <div className={`field ${e.proposedPrice ? 'is-invalid' : ''}`}><label htmlFor="in-price">Giá đề xuất (VND)</label><input id="in-price" name="proposedPrice" type="number" min="0" step="10000" inputMode="numeric" value={d.proposedPrice} onChange={onInput} disabled={ro} aria-invalid={!!e.proposedPrice} />
            <p className="field-help">Quản trị viên xác nhận giá cuối cùng khi duyệt. Nhập 0 cho khoá miễn phí.{c.status === 'published' ? ` Giá đang bán: ${fmt.vnd(c.price)}.` : ''}</p><FieldError>{e.proposedPrice}</FieldError></div>
        </div>
        <div className="field"><label htmlFor="in-out">Học viên sẽ học được gì? (Mỗi dòng một ý)</label><textarea id="in-out" name="outcomes" rows={4} value={d.outcomes} onChange={onInput} disabled={ro} /></div>
        <div className="field"><label htmlFor="in-req">Yêu cầu trước khi học (Mỗi dòng một ý)</label><textarea id="in-req" name="requirements" rows={3} value={d.requirements} onChange={onInput} disabled={ro} /></div>
        {!ro && guard.dirty && (
          <div className="row tc-savebar"><button className="btn btn-primary" type="submit"><Icon name="check" className="icon-sm" /> Lưu thay đổi</button><span className="small muted"><Icon name="alert-circle" className="icon-sm text-warn" /> Có thay đổi chưa lưu</span></div>
        )}
      </div>
    </form>
  );
}

// ───────────────────────── Xuất bản ─────────────────────────
/** Advisory notes that never gate submission (real publication-service advisory items). */
export function readinessAdvice(c) {
  const weak = ls(c).filter((l) => l.code && l.code.kind === 'challenge' && ((l.code.tests || []).length < 3 || !(l.code.tests || []).some((t) => t.hidden)));
  return weak.map((l) => ({ label: l.title, text: 'Bài code nên có ít nhất 3 test, trong đó có test ẩn cho trường hợp biên.', href: `/teach/courses/${c.id}/code/${l.id}` }));
}
export function readiness(c) {
  const m = kmapOf(c);
  const challenges = ls(c).filter((l) => l.code && l.code.kind === 'challenge');
  // real rule: tests exist and the reference solution was verified (solutionVerifiedAt); older rows use solutionCheck
  const verified = (code) => (code.tests || []).length > 0 && !!(code.solutionVerifiedAt || (code.solutionVerifiedAt === undefined && code.solutionCheck && code.solutionCheck.ok));
  const badCode = challenges.filter((l) => !verified(l.code));
  const codeItem = challenges.length ? [{ ok: !badCode.length, label: 'Bài code có test và lời giải chạy đạt', hint: badCode.length ? `Lời giải mẫu chưa chạy đạt tất cả test. (${badCode.map((l) => `"${l.title}"`).join(', ')})` : '', href: badCode.length ? `/teach/courses/${c.id}/code/${badCode[0].id}` : '' }] : [];
  // AI-generated questions must be reviewed by the lecturer before learners see them
  const unreviewed = (quiz) => (quiz ? quiz.questions.filter((q) => q.aiGenerated && q.aiReviewed === false).length : 0);
  const aiLessons = ls(c).filter((l) => unreviewed(l.quiz));
  const aiCount = aiLessons.reduce((s, l) => s + unreviewed(l.quiz), 0) + unreviewed(c.entryTest);
  const aiItem = aiCount ? [{ ok: false, label: 'Câu hỏi do AI tạo đã được duyệt', hint: `Còn ${aiCount} câu do AI tạo chưa duyệt.`, href: aiLessons.length ? `/teach/courses/${c.id}/quiz/${aiLessons[0].id}` : `/teach/courses/${c.id}/quiz/entry` }]
    : ls(c).some((l) => l.quiz && l.quiz.questions.some((q) => q.aiGenerated)) ? [{ ok: true, label: 'Câu hỏi do AI tạo đã được duyệt' }] : [];
  const assigns = ls(c).filter((l) => l.assignment);
  const noRubric = assigns.filter((l) => !(l.assignment.rubric || []).length);
  const rubricItem = assigns.length ? [{ ok: !noRubric.length, label: 'Bài tập có thang chấm', hint: `Cần thêm thang chấm: ${noRubric.map((l) => `"${l.title}"`).join(', ')}.`, href: noRubric.length ? `/teach/courses/${c.id}/content?lesson=${noRubric[0].id}` : '' }] : [];
  return codeItem.concat(aiItem, rubricItem, [
    { ok: (c.summary || '').trim().length >= 20, label: 'Mô tả khoá học', hint: 'Mô tả ít nhất 20 ký tự.', href: `/teach/courses/${c.id}/info` },
    { ok: ls(c).length >= 1, label: 'Ít nhất 1 bài học', hint: 'Thêm chương và bài học.', href: `/teach/courses/${c.id}/content` },
    { ok: c.proposedPrice !== null && c.proposedPrice !== undefined, label: 'Giá đề xuất', hint: 'Nhập giá đề xuất (quản trị viên xác nhận giá cuối).', href: `/teach/courses/${c.id}/info` },
    { ok: !!(c.entryTest && c.entryTest.questions.length >= ENTRY_MIN), label: `Bài kiểm tra đầu vào (≥ ${ENTRY_MIN} câu)`, hint: c.entryTest ? `Hiện có ${c.entryTest.questions.length} câu.` : 'Chưa có bài kiểm tra đầu vào.', href: `/teach/courses/${c.id}/quiz/entry` },
    { ok: m.status === 'confirmed', label: 'Bản đồ kiến thức đã xác nhận', hint: m.status === 'stale' ? 'Nội dung đã thay đổi sau khi xác nhận bản đồ.' : 'Xem lại và xác nhận bản đồ.', href: `/teach/courses/${c.id}/kmap` },
  ]);
}

const CRIT_TXT = { pass: ['badge-success', 'Đạt'], fix: ['badge-danger', 'Cần sửa'], na: ['badge-neutral', 'Không áp dụng'] };
const ROUND_STATUS = { in_review: ['badge-info', 'Đang duyệt'], changes_requested: ['badge-warn', 'Yêu cầu sửa'], approved: ['badge-success', 'Đã duyệt'], rejected: ['badge-danger', 'Từ chối'] };
const latestRound = (c) => (Codi.review && Codi.review.latest ? Codi.review.latest(c) : null);
/** Changes requested comes from the newest decided review round (the seed has no course-level outcome flag). */
const changesRequested = (c) => c.status === 'rejected' && (c.reviewOutcome === 'changes' || (reviewRound(c) || {}).status === 'changes_requested');

async function flagFixed(c, id) {
  const f = reviewRound(c)?.flags.find((x) => x.id === id); if (!f) return;
  const returned = (r) => c.status === 'rejected' && r && ['changes_requested', 'rejected'].includes(r.status);
  if (!returned(reviewRound(c))) { Codi.ui.toast('Chỉ có thể phản hồi góp ý của vòng mới nhất đã trả về để chỉnh sửa.', { type: 'danger' }); return; }
  const r = await promptReason({
    title: 'Đánh dấu góp ý đã sửa?',
    body: <p className="small"><strong>{f.target.label}</strong><br /><span className="muted">{f.comment}</span></p>,
    label: 'Bạn đã chỉnh sửa nội dung gì?', help: 'Ít nhất 5 ký tự để người duyệt nắm rõ nội dung đã sửa.', min: 5,
    error: 'Vui lòng mô tả bạn đã sửa gì (ít nhất 5 ký tự).', placeholder: 'Ví dụ: đã đổi đáp án đúng thành "Thêm use client" và cập nhật giải thích.',
    confirmLabel: 'Xác nhận đã sửa',
  });
  if (!r.ok || f.status !== 'open') return;
  Object.assign(f, { status: 'fixed', reply: r.reason, repliedAt: new Date().toISOString() });
  persist(); Codi.ui.toast('Đã đánh dấu đã sửa.', { type: 'success' });
}
function flagReopen(c, id) {
  const f = reviewRound(c)?.flags.find((x) => x.id === id); if (!f || f.status !== 'fixed' || c.status !== 'rejected') return;
  Object.assign(f, { status: 'open', reply: '' }); persist();
}

/** Result of the last decided review round: criterion verdicts + flags the lecturer works through. */
function ReviewBlock({ c }) {
  const R = Codi.review; const r = reviewRound(c);
  if (!r || !R) return null;
  const canMark = c.status === 'rejected';
  const open = r.flags.filter((f) => f.status === 'open');
  const order = { open: 0, fixed: 1, closed: 2 };
  const flags = r.flags.slice().sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || (a.severity === 'must' ? 0 : 1) - (b.severity === 'must' ? 0 : 1));
  const rs = ROUND_STATUS[r.status];
  return (
    <section className="card tc-review" aria-labelledby="tc-review-h">
      <div className="card-header"><div className="stack-1"><span className="row" style={{ gap: 8 }}><h2 className="tc-h" id="tc-review-h">Kết quả kiểm duyệt lần {r.round}</h2>{rs && <span className={`badge ${rs[0]}`}>{rs[1]}</span>}</span><span className="xsmall muted">{r.decidedAt ? fmt.datetime(r.decidedAt) : ''}{r.note ? ` · ${r.note}` : ''}</span></div>
        {open.length ? <span className="badge badge-warn">{open.length} góp ý cần xử lý</span> : r.flags.length ? <span className="badge badge-success">Đã xử lý mọi góp ý</span> : null}</div>
      <div className="card-body stack-4">
        <div className="stack-2"><strong className="small">Tiêu chí</strong>
          <ul className="rv-crit">{(R.CRITERIA || []).map((k) => {
            const v = r.criteria[k.id] || {}; const t = CRIT_TXT[v.status];
            return <li key={k.id} className="rv-crit-row"><div className="rv-crit-main"><span className="small strong">{k.label}</span>{v.note && <span className="xsmall">{v.note}</span>}</div>{t ? <span className={`badge ${t[0]}`}>{t[1]}</span> : <span className="badge badge-neutral">Chưa chấm</span>}</li>;
          })}</ul></div>
        {flags.length > 0 && (
          <div className="stack-2"><strong className="small">Góp ý chi tiết</strong>
            <ul className="rv-flags">{flags.map((f) => (
              <li key={f.id} className={`rv-flag ${f.status !== 'open' ? 'is-closed' : ''}`}>
                <div className="row-between"><span className="row" style={{ gap: 8, flexWrap: 'wrap' }}><span className={`badge ${f.severity === 'must' ? 'badge-danger' : 'badge-warn'}`}>{(R.SEVERITY || {})[f.severity] || f.severity}</span><span className="badge badge-neutral">{(R.FLAG_STATUS || {})[f.status] || f.status}</span>
                  {f.source === 'ai' && <span className="badge badge-accent"><Icon name="sparkles" />AI đề xuất</span>}{f.carried && <span className="badge badge-neutral">Vòng trước</span>}</span>
                  <span className="xsmall muted">{f.at ? fmt.datetime(f.at) : ''}</span></div>
                <span className="rv-flag-target small strong">{f.target.label}</span>
                <p className="small">{f.comment}</p>
                {f.reply && <p className="rv-reply small"><strong>Bạn đã phản hồi:</strong> {f.reply}</p>}
                <div className="row" style={{ gap: 8 }}>{R.targetHref && <Link className="btn btn-secondary btn-sm" to={R.targetHref(c, f.target)}><Icon name="external-link" className="icon-sm" /> Mở để sửa</Link>}
                  {!canMark ? null : f.status === 'open' ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => flagFixed(c, f.id)}><Icon name="check" className="icon-sm" /> Đánh dấu đã sửa</button>
                    : f.status === 'fixed' ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => flagReopen(c, f.id)}>Bỏ đánh dấu</button> : null}</div></li>
            ))}</ul></div>
        )}
      </div>
    </section>
  );
}

async function submitForReview(c) {
  if (!readiness(c).every((x) => x.ok)) return;
  const r = await Codi.ui.confirm({ title: c.status === 'rejected' ? 'Sửa và gửi lại?' : 'Gửi yêu cầu xuất bản?', body: `"${c.title}" sẽ chuyển sang Chờ duyệt.`, consequence: 'Trong lúc chờ duyệt, nội dung khoá học ở chế độ chỉ đọc. Quản trị viên sẽ kiểm tra nội dung và xác nhận giá bán hoặc gửi góp ý.', reversible: 'Sau khi có kết quả, bạn có thể chỉnh sửa như bình thường.', confirmLabel: c.status === 'rejected' ? 'Sửa và gửi lại' : 'Gửi yêu cầu' });
  if (!r.ok) return;
  const R = Codi.review;
  const prev = latestRound(c);
  c.status = 'pending'; c.submittedAt = new Date().toISOString(); c.rejectReason = null; c.reviewOutcome = null;
  // resubmission opens a new review round; open/fixed flags are carried over for the reviewer to verify
  if ((!prev || prev.status !== 'in_review') && R && R.startNextRound) R.startNextRound(c, prev);
  const fixed = prev ? prev.flags.filter((f) => f.status === 'fixed').length : 0;
  const admin = Codi.db().users.find((u) => u.role === 'admin');
  if (admin) Codi.notify(admin.id, { title: prev ? `Gửi lại sau góp ý (lần ${prev.round + 1})` : 'Yêu cầu xuất bản mới', body: `${c.title} — ${me().name}${fixed ? ` · đã sửa ${fixed} góp ý` : ''}`, link: '/admin/publication?id=' + c.id });
  persist(); Codi.ui.toast('Đã gửi yêu cầu xuất bản.', { type: 'success' });
}

function PublishTab({ c }) {
  const items = readiness(c); const allOk = items.every((x) => x.ok);
  const status = {
    draft: <Alert type="info" title="Bản nháp" body="Hoàn thành danh sách điều kiện bên dưới rồi gửi yêu cầu xuất bản để quản trị viên phê duyệt." />,
    pending: <Alert type="warn" title="Chờ duyệt" body="Đã gửi yêu cầu xuất bản. Trong thời gian này, nội dung khoá học ở chế độ chỉ đọc. Quản trị viên sẽ kiểm tra nội dung và xác nhận giá bán." />,
    rejected: changesRequested(c)
      ? <Alert type="warn" title="Quản trị viên yêu cầu sửa" body={<>{c.rejectReason ? <span>{c.rejectReason} </span> : null}<span>Sửa theo các góp ý chi tiết bên dưới, đánh dấu đã sửa rồi bấm &apos;Sửa và gửi lại&apos;.</span></>} />
      : <Alert type="danger" title="Khoá học bị từ chối" body={<>{c.rejectReason ? <span>{c.rejectReason} </span> : null}<span>Khoá học chưa đạt tiêu chuẩn. Bạn có thể sửa đổi nội dung rồi gửi lại thành vòng duyệt mới.</span></>} />,
    published: <Alert type="success" title="Đã xuất bản" body={`Đang bán với giá ${fmt.vnd(c.price)}`} />,
    hidden: <Alert type="warn" title="Khoá học đã ẩn" body={`Lý do ẩn: ${c.hideReason || 'Chưa nêu'}. Học viên đã mua vẫn tiếp tục học được; học viên mới không thể mua khoá học này.`} />,
  }[c.status];
  const canSubmit = ['draft', 'rejected'].includes(c.status);
  const missing = items.filter((x) => !x.ok).length;
  const rr = reviewRound(c);
  const openMust = !!rr && rr.flags.some((f) => f.status === 'open' && f.severity === 'must');
  return (
    <div className="stack-4">
      {status}
      <ReviewBlock c={c} />
      <section className="card"><div className="card-header"><h2 className="tc-h">Điều kiện xuất bản</h2><span className="small muted">{items.length - missing}/{items.length} đạt</span></div>
        <ul className="list">{items.map((x) => (
          <li key={x.label} className="list-row"><Icon name={x.ok ? 'check-circle' : 'alert-circle'} className={x.ok ? 'text-success' : 'text-warn'} />
            <div className="list-main"><strong className="small">{x.label}</strong><span className="xsmall muted">{x.ok ? 'Đã đạt' : x.hint}</span></div>
            {x.ok ? <span className="badge badge-success">Đạt</span> : x.href ? <Link className="btn btn-secondary btn-sm" to={x.href}>Sửa ngay</Link> : null}</li>
        ))}</ul></section>
      {readinessAdvice(c).length > 0 && <section className="card"><div className="card-header"><h2 className="tc-h">Gợi ý thêm</h2><span className="xsmall muted">Không bắt buộc để gửi duyệt</span></div>
        <ul className="list">{readinessAdvice(c).map((x) => <li key={x.href} className="list-row"><Icon name="info" className="text-info" /><div className="list-main"><strong className="small">{x.label}</strong><span className="xsmall muted">{x.text}</span></div><Link className="btn btn-ghost btn-sm" to={x.href}>Mở</Link></li>)}</ul></section>}
      {canSubmit && openMust && <Alert type="warn" title="Còn góp ý bắt buộc" body={'Khoá học còn góp ý "Bắt buộc sửa" chưa được xử lý. Vui lòng chỉnh sửa nội dung và đánh dấu đã sửa để đảm bảo khoá học được duyệt.'} />}
      {canSubmit && (
        <div className="row"><button type="button" className="btn btn-primary btn-lg" disabled={!allOk} onClick={() => submitForReview(c)}>{c.status === 'rejected' ? 'Sửa và gửi lại' : 'Gửi yêu cầu xuất bản'}</button>
          {!allOk && <span className="small muted">Hoàn thành {missing} điều kiện còn thiếu để gửi.</span>}</div>
      )}
    </div>
  );
}

export function CourseEditorPage({ params, query }) {
  useCodi();
  const c = Codi.course(params.courseId);
  if (!isMine(c)) return notMine();
  const tab = TABS.some(([k]) => k === params.tab) ? params.tab : 'content';
  const body = { content: <ContentTab c={c} query={query} />, info: <InfoTab c={c} />, kmap: <KmapTab c={c} />, publish: <PublishTab c={c} /> }[tab];
  return shell('/teach/courses', <><EditorHeader c={c} tab={tab} />{body}</>);
}
