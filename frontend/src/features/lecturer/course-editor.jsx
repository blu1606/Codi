// S22 course editor: header + tabs Nội dung (curriculum tree, reorder, delete guards with undo) · Thông tin (real
// validation, unsaved guard) · Bản đồ kiến thức (kmap-tab.jsx) · Xuất bản (status banners, review round, readiness).
// Data and rules come from Codi's actions (dashboard/lecturer/courses/[courseId]/actions.ts, publish/actions.ts)
// through teach-data.js; the curriculum outline and course delete use /api/lecturer/courses/:courseId.
// Drag and drop reorders within a chapter or the chapter list (the backend moves one step at a time).
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { api } from '../../lib/api';
import { Alert, Empty, Icon, CourseStatus } from '../../components/ui/primitives';
import {
  shell, notMine, ls, locked, findLesson, guard,
  TYPE_ICON, TYPE_LABEL, LEVELS, levelLabel, categoryOptions, PRICE_MAX,
  FieldError, reviewRound, reviewFlagsFor, Loading, LoadError,
} from './teach-api';
import { rerender, useView } from './view-store';
import { act, forgetCourse, reloadCourse, reloadMine, useCourse, write } from './teach-data';
import { KmapTab } from './kmap-tab';
import { openLessonEditor, openAddLesson } from './lesson-editor';
import { AiAssist } from './course-ai-write';
import { aiImport } from './quiz-builder';
import { ReviewNotes, NoteCard, flagHref, useFlagFocus } from './review-notes';
import { INFO_FIELDS } from '../admin/publication-rules';

const { fmt } = Codi;
const toast = (msg, o) => Codi.ui.toast(msg, o);
const TABS = [['content', 'Nội dung'], ['info', 'Thông tin'], ['kmap', 'Bản đồ kiến thức'], ['publish', 'Xuất bản']];

// Review vocabulary shared with the admin publication screen.
const CRITERIA = [
  { id: 'info', label: 'Mô tả, đối tượng học viên và giá đề xuất' },
  { id: 'materials', label: 'Video, slide và tài liệu đầy đủ, xem được' },
  { id: 'quiz', label: 'Quiz đúng đáp án, giải thích rõ' },
  { id: 'entry', label: 'Bài kiểm tra đầu vào (≥ 5 câu)' },
  { id: 'code', label: 'Bài code có test và lời giải chạy đạt' },
  { id: 'assignment', label: 'Bài tập có yêu cầu rõ và thang chấm' },
  { id: 'rights', label: 'Bản quyền tài liệu, không có nội dung vi phạm' },
];
// Authoring steps in the order a course is prepared (Udemy: plan → create → publish). Each step maps to one tab;
// every tab stays reachable from the rail, and each step's state comes from the readiness checks.
const STEPS = [
  { key: 'info', label: 'Thông tin', hint: 'mô tả khoá học và giá đề xuất', labels: ['Mô tả khoá học', 'Giá đề xuất'] },
  { key: 'content', label: 'Nội dung', hint: 'chương, bài học, quiz và bài kiểm tra đầu vào', labels: null },
  { key: 'kmap', label: 'Bản đồ kiến thức', hint: 'phân tích và xác nhận bản đồ', labels: ['Bản đồ kiến thức đã xác nhận'] },
  { key: 'publish', label: 'Xuất bản', hint: 'gửi yêu cầu khi đủ điều kiện', labels: null },
];
/** Readiness checks from Codi's publication service (getPublicationData). */
export const readiness = (c) => c.readiness || [];
/** Per-step missing counts. Content takes every readiness check not owned by Thông tin or Bản đồ kiến thức. */
function stepMissing(c) {
  const items = readiness(c);
  const infoItems = items.filter((x) => STEPS[0].labels.includes(x.label));
  const kmapItems = items.filter((x) => STEPS[2].labels.includes(x.label));
  const contentItems = items.filter((x) => !infoItems.includes(x) && !kmapItems.includes(x));
  const open = (arr) => arr.filter((x) => !x.ok).length;
  const submitted = ['pending', 'published'].includes(c.status);
  const before = open(infoItems) + open(contentItems) + open(kmapItems);
  return {
    info: open(infoItems), content: open(contentItems), kmap: open(kmapItems),
    // Xuất bản is open until submitted: it waits on the earlier steps, or is itself one action when they are done
    publish: submitted ? 0 : (before || 1),
  };
}
function AuthoringRail({ c, tab }) {
  const missing = stepMissing(c);
  const next = STEPS.find((s) => missing[s.key] > 0);
  const nextStep = next && STEPS.findIndex((s) => s.key === next.key) + 1;
  const readyToSubmit = readiness(c).every((x) => x.ok) && ['draft', 'rejected'].includes(c.status);
  return (
    <nav className="authoring-rail" aria-label="Các bước soạn khoá học">
      <ol className="steps">{STEPS.map((s, i) => {
        const done = missing[s.key] === 0; const current = tab === s.key;
        const status = done ? 'Đã đủ'
          : s.key === 'publish' && readyToSubmit ? (c.status === 'rejected' ? 'Sẵn sàng gửi lại' : 'Sẵn sàng gửi')
            : s.key === 'publish' ? 'Chờ các bước trên'
              : `Còn ${missing[s.key]} việc`;
        return (
          <li key={s.key} className="step-item">
            <Link to={`/teach/courses/${c.id}/${s.key}`} className={`step-link ${done ? 'is-done' : ''} ${current ? 'is-current' : ''}`} aria-current={current ? 'step' : undefined}>
              <span className="step-num" aria-hidden="true">{done ? <Icon name="check" className="icon-sm" /> : i + 1}</span>
              <span className="step-text"><strong className="small">{s.label}</strong><span className="xsmall muted">{status}</span></span>
              {s.key === 'kmap' && ['stale', 'failed', 'ready'].includes(c.knowledgeMapStatus) && <span className="count count-accent" aria-label="cần xem lại">!</span>}
            </Link>
          </li>
        );
      })}</ol>
      <p className="small rail-next">{next
        ? <>Bước tiếp theo: <Link className="strong" to={`/teach/courses/${c.id}/${next.key}`}>{nextStep}. {next.label}</Link> — {next.hint}.</>
        : <>{['pending', 'published'].includes(c.status) ? 'Khoá học đã được gửi xuất bản.' : 'Đủ điều kiện. Bấm “Xuất bản” để gửi yêu cầu.'}</>}</p>
    </nav>
  );
}
function EditorHeader({ c, tab }) {
  const cat = c.category;
  return (
    <div className="stack-3" style={{ marginBottom: 16 }}>
      <Link className="small" to="/teach/courses"><Icon name="arrow-left" className="icon-sm" /> Khoá học của tôi</Link>
      <div className="row-between"><div className="stack-1"><div className="row" style={{ gap: 12, flexWrap: 'wrap' }}><h1>{c.title}</h1><CourseStatus status={c.status} /></div>
        <span className="xsmall muted">{c.chapters.length} chương · {ls(c).length} bài học{cat ? ` · ${cat}` : ''} · Trình độ: {levelLabel(c.level)} · {fmt.duration(c.durationMin)}</span></div>
        {c.status === 'published' && <Link className="btn btn-ghost btn-sm" to={`/courses/${c.slug}`}><Icon name="eye" className="icon-sm" /> Xem trang bán</Link>}</div>
      {locked(c) && <Alert type="warn" title="Đang chờ duyệt — nội dung chỉ đọc" body="Khoá học đang được ban quản trị kiểm duyệt. Bạn có thể xem lại nhưng không thể chỉnh sửa cho đến khi có kết quả duyệt." />}
      {c.status === 'published' && <Alert type="info" title="Khoá học đang bán" body="Các thay đổi nội dung sẽ áp dụng trực tiếp cho học viên. Sau khi sửa, bạn hãy cập nhật lại bản đồ kiến thức." />}
      <AuthoringRail c={c} tab={tab} />
    </div>
  );
}

// ───────────────────────── Nội dung ─────────────────────────
let renaming = null; // id of chapter/lesson being renamed
let drag = null;

const codeBadge = (l) => {
  if (!l.code || l.code.kind !== 'challenge') return null;
  if (!l.code.tests) return <span className="badge badge-warn"><Icon name="alert-triangle" />Chưa có test</span>;
  return l.code.verified ? <span className="badge badge-success"><Icon name="check" />{l.code.tests} test · lời giải đạt</span> : <span className="badge badge-warn"><Icon name="alert-triangle" />Chưa chạy thử lời giải</span>;
};
const materialCount = (l) => (l.materials || []).length;

/**
 * One lesson's blockers, using the publication rules: an unverified code challenge and an assignment without a
 * rubric block submission; an open "must" review flag does too. Kind 'fix' means the lecturer must change content,
 * 'review' means a decision is still open.
 */
export function lessonIssues(c, l) {
  const issues = [];
  if (l.code && l.code.kind === 'challenge' && !l.code.verified) issues.push({ kind: 'fix', text: l.code.tests ? 'Lời giải chưa đạt test' : 'Chưa có test' });
  if (l.assignment && !l.assignment.rubricCount) issues.push({ kind: 'fix', text: 'Thiếu thang chấm' });
  const rr = reviewRound(c);
  const open = rr ? reviewFlagsFor(rr, l.id).filter((x) => x.status === 'open') : [];
  if (open.length) issues.push({ kind: open.some((x) => x.severity === 'must') ? 'fix' : 'review', text: `${open.length} góp ý từ quản trị` });
  return issues;
}

function RenameForm({ c, id, value, label }) {
  const submit = async (e) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('title') || '').trim();
    if (!name) return; // real: empty rename is a silent no-op
    const isChapter = c.chapters.some((x) => x.id === id);
    renaming = null; rerender();
    await write(c.id, () => act('course', isChapter ? 'renameChapter' : 'renameLesson', c.id, id, name), { toast, okMessage: isChapter ? 'Đã đổi tên chương.' : 'Đã đổi tên bài học.' });
  };
  return (
    <form className="input-group od-fill" onSubmit={submit}>
      <input className="input" name="title" defaultValue={value} aria-label={label} autoFocus onFocus={(e) => e.target.select()} />
      <button className="btn btn-primary btn-sm" type="submit">Lưu</button>
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => { renaming = null; rerender(); }}>Huỷ</button>
    </form>
  );
}

/** Moves a chapter or lesson `steps` places (negative = up) with the backend's one-step move actions. */
async function moveBy(c, kind, id, steps) {
  const dir = steps < 0 ? -1 : 1;
  await write(c.id, async () => {
    for (let i = 0; i < Math.abs(steps); i += 1) {
      const r = await act('course', kind === 'chapter' ? 'moveChapter' : 'moveLesson', c.id, id, dir);
      if (r && r.success === false) break;
    }
    return { success: true };
  }, { toast });
}
const move = (c, kind, id, dir) => moveBy(c, kind, id, dir);

/** Real restoreLesson with the snapshot deleteLesson returned. */
async function restoreLesson(courseId, snap) {
  await write(courseId, () => act('course', 'restoreLesson', courseId, snap), { toast, okMessage: `Đã khôi phục "${snap && snap.lesson ? snap.lesson.title : 'bài học'}"` });
}

async function removeLesson(c, id) {
  const f = findLesson(c, id); if (!f) return;
  const t = f.l.title;
  const r = await Codi.ui.confirm({
    title: 'Xoá bài học?',
    consequence: c.status === 'published' ? `Khoá học đang xuất bản. Xoá bài học "${t}" có thể làm gián đoạn tiến độ của học viên đã đăng ký.` : `Bài học "${t}" sẽ bị xoá khỏi chương này.`,
    reversible: 'Bạn có thể hoàn tác ngay sau khi xoá.', confirmLabel: 'Xoá', danger: true,
  });
  if (!r.ok) return;
  // the backend refuses lessons with learner work or links Undo could not restore, with the real message
  const res = await write(c.id, () => act('course', 'deleteLesson', c.id, id), { toast });
  if (res && res.success && res.deletedLesson) toast(`Đã xoá "${t}"`, { action: { label: 'Hoàn tác', onClick: () => restoreLesson(c.id, res.deletedLesson) } });
}

async function removeChapter(c, id) {
  const ch = c.chapters.find((x) => x.id === id); if (!ch) return;
  if (ch.lessons.length) { toast('Không thể xoá chương còn bài học. Hãy xoá từng bài học đủ điều kiện trước, rồi xoá chương trống.', { type: 'danger' }); return; }
  const r = await Codi.ui.confirm({
    title: 'Xoá chương?',
    consequence: c.status === 'published' ? `Khoá học đã xuất bản. Xoá chương "${ch.title}" có thể ảnh hưởng trực tiếp đến học viên đã đăng ký. Chỉ có thể xoá chương trống.` : `Chương "${ch.title}" sẽ bị xoá khỏi khoá học. Chỉ có thể xoá chương trống.`,
    reversible: 'Thao tác này không hoàn tác được.', confirmLabel: 'Xoá', danger: true,
  });
  if (!r.ok) return;
  await write(c.id, () => act('course', 'deleteChapter', c.id, id), { toast, okMessage: 'Đã xoá chương.' });
}

const addChapter = (c) => write(c.id, () => act('course', 'addChapter', c.id, `Chương ${c.chapters.length + 1}`), { toast, okMessage: 'Đã thêm chương mới.' });
async function deleteCourse(c) {
  if (c.enrolledCount) return;
  const r = await Codi.ui.confirm({ title: 'Xoá vĩnh viễn khoá học?', body: `"${c.title}" và toàn bộ nội dung sẽ bị xoá.`, reversible: false, typeToConfirm: c.title, confirmLabel: 'Xoá khoá học', danger: true });
  if (!r.ok) return;
  try {
    await api.del(`/api/lecturer/courses/${encodeURIComponent(c.id)}`);
    forgetCourse(c.id); reloadMine();
    toast('Đã xoá khoá học.'); Codi.go('/teach/courses');
  } catch (e) {
    toast(e.message || 'Không thể xoá khoá học.', { type: 'danger' });
  }
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
        const from = c.chapters.findIndex((x) => x.id === d.id); const to = c.chapters.findIndex((x) => x.id === t.dataset.id);
        if (from >= 0 && to >= 0) moveBy(c, 'chapter', d.id, to - from).then(() => toast('Đã sắp xếp lại nội dung.'));
      } else if (d.kind === 'lesson') {
        if (t.dataset.drop === 'lesson' && t.dataset.id === d.id) return;
        const f = findLesson(c, d.id); if (!f) return;
        const target = t.dataset.drop === 'lesson' ? findLesson(c, t.dataset.id) : null;
        const chId = target ? target.ch.id : t.dataset.id;
        if (chId !== f.ch.id) { toast('Chỉ sắp xếp được bài học trong cùng một chương. Hãy tạo bài mới ở chương đích.', { type: 'warn' }); return; }
        const to = target ? target.i : f.ch.lessons.length - 1;
        if (to !== f.i) moveBy(c, 'lesson', d.id, to - f.i).then(() => toast('Đã sắp xếp lại nội dung.'));
      }
    },
  };
}

/**
 * Rare row actions behind one labelled ⋯ control. Native <details> keeps it keyboard-operable without a menu
 * primitive; the panel closes itself after an action runs.
 */
function RowMenu({ label, items }) {
  const ref = useRef(null);
  const shown = items.filter(Boolean);
  return (
    <details className="tc-menu" ref={ref}>
      <summary className="btn btn-ghost btn-sm tc-menu-trigger" aria-label={label} title={label}><Icon name="more-horizontal" className="icon-sm" /><span className="sr-only">{label}</span></summary>
      <div className="tc-menu-panel" role="group">
        {shown.map((it) => (
          <button key={it.label} type="button" className={`tc-menu-item ${it.danger ? 'is-danger' : ''}`} disabled={it.disabled}
            onClick={() => { if (ref.current) ref.current.open = false; it.run(); }}>
            <Icon name={it.icon} className="icon-sm" /> {it.label}
          </button>
        ))}
      </div>
    </details>
  );
}

function ContentTab({ c, query }) {
  useView();
  const ro = locked(c);
  // open reviewer flags of the last decided round, shown on the lesson they point at
  const hl = query && query.lesson;
  const edit = query && query.edit === '1';
  const focusFlag = query && query.flag;
  // "Mở để sửa" on a lesson comment opens the lesson sheet where the comment sits
  useEffect(() => { if (hl && edit) openLessonEditor(c.id, hl, { flag: focusFlag }); }, [c.id, hl, edit, focusFlag]);
  useFlagFocus(edit ? null : focusFlag);
  const lessonNotes = (l) => <ReviewNotes courseId={c.id} collapsible open={hl === l.id} links match={(a) => a.lessonId === l.id} />;
  const dragAttrs = (kind, id) => (ro ? {} : { draggable: true, 'data-drag': kind, 'data-id': id });
  const startRename = (id) => { renaming = id; rerender(); };
  const chapterBlockers = (ch) => ch.lessons.filter((l) => lessonIssues(c, l).length).length;

  // Timetable row: fixed columns (number, lesson, type, minutes, checks, readiness, actions) read across the chapter.
  const lessonRow = (l, li, ch, ci) => {
    const issues = lessonIssues(c, l);
    const mark = issues[0];
    return (
    <li key={l.id} className={`tc-lesson ${hl === l.id ? 'is-target' : ''}`} {...dragAttrs('lesson', l.id)} data-drop="lesson" data-id={l.id}>
      <span className="tc-grip" aria-hidden="true">{ro ? null : <Icon name="grip-vertical" className="icon-sm" />}</span>
      <span className="tc-no mono" aria-hidden="true">{ci + 1}.{li + 1}</span>
      <div className="tc-lesson-main">
        {renaming === l.id ? <RenameForm c={c} id={l.id} value={l.title} label="Tên bài học" /> : (
          <div className="stack-1"><span className="row small strong" style={{ gap: 8, flexWrap: 'wrap' }}><span className="tc-type"><Icon name={TYPE_ICON[l.type] || 'book-open'} className="icon-sm" /></span>{l.title}{l.isFreePreview && <span className="badge badge-info">Học thử</span>}</span>
            <span className="row xsmall muted" style={{ gap: 8, flexWrap: 'wrap' }}>{materialCount(l) ? `${materialCount(l)} tài liệu` : ''}{codeBadge(l)}</span></div>
        )}
      </div>
      <span className="tc-cell tc-type-cell small">{TYPE_LABEL[l.type] || 'Bài đọc'}</span>
      <span className="tc-cell tc-dur small mono">{Math.round(Number(l.durationMin) || 0)} phút</span>
      <span className="tc-cell tc-checks">
        {l.quiz && <span className="badge badge-neutral">Quiz {l.quiz.count} câu</span>}
        {l.assignment && <span className="badge badge-neutral">Bài tập</span>}
        {!l.quiz && !l.assignment && !l.code && <span className="xsmall muted">—</span>}
      </span>
      <span className="tc-cell tc-mark">{mark
        ? <span className={`badge ${mark.kind === 'fix' ? 'badge-warn' : 'badge-info'}`}><Icon name={mark.kind === 'fix' ? 'alert-triangle' : 'info'} />{mark.text}{issues.length > 1 ? ` +${issues.length - 1}` : ''}</span>
        : <span className="tc-ok small"><Icon name="check" className="icon-sm" /> Đạt</span>}</span>
      {renaming === l.id ? null : (
        <div className="tc-row-actions">
          <div className="tc-row-links">
            {l.code ? <Link className="btn btn-ghost btn-sm" to={`/teach/courses/${c.id}/code/${l.id}`}><Icon name="code" className="icon-sm" /> Code</Link>
              : <button type="button" className="btn btn-ghost btn-sm" onClick={() => openLessonEditor(c.id, l.id)}><Icon name="file-text" className="icon-sm" /> Chi tiết</button>}
            <Link className="btn btn-ghost btn-sm" to={`/teach/courses/${c.id}/quiz/${l.id}`}><Icon name="clipboard-check" className="icon-sm" /> Quiz</Link>
          </div>
          {ro ? null : (
            <RowMenu label={`Thao tác khác với ${l.title}`} items={[
              l.code ? null : { icon: 'sparkles', label: 'Tạo bằng AI từ tài liệu', run: () => aiImport(c.id, l.id) },
              { icon: 'pencil', label: 'Đổi tên', run: () => startRename(l.id) },
              l.code || l.assignment ? null : { icon: 'clipboard-check', label: 'Thêm bài tập', run: () => openLessonEditor(c.id, l.id, { withAssignment: true }) },
              { icon: 'arrow-up', label: 'Chuyển lên', disabled: li === 0, run: () => move(c, 'lesson', l.id, -1) },
              { icon: 'arrow-down', label: 'Chuyển xuống', disabled: li === ch.lessons.length - 1, run: () => move(c, 'lesson', l.id, 1) },
              { icon: 'trash', label: 'Xoá bài học', danger: true, run: () => removeLesson(c, l.id) },
            ]} />
          )}
        </div>
      )}
      <div className="tc-lesson-notes">{lessonNotes(l)}</div>
    </li>
    );
  };
  // Two structural actions only: a chapter, or a lesson (its type is chosen in the next step).
  const addBar = ro ? null : (
    <div className="row" style={{ gap: 8 }}>
      <button type="button" className="btn btn-secondary" onClick={() => addChapter(c)}><Icon name="layers" className="icon-sm" /> Thêm chương</button>
      {c.chapters.length > 0 && <button type="button" className="btn btn-primary" onClick={() => openAddLesson(c, c.chapters[0].id)}><Icon name="plus" className="icon-sm" /> Thêm bài học</button>}
    </div>
  );
  const dnd = dndHandlers(c);
  const enrolled = c.enrolledCount;
  return (
    <div className="stack-4" onDragStart={dnd.onDragStart} onDragEnd={dnd.onDragEnd} onDragOver={dnd.onDragOver} onDrop={dnd.onDrop}>
      <div className="card"><div className="card-body compact row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="stack-1 small muted"><p>Dùng nút mũi tên để sắp xếp thứ tự chương và bài học. Bấm &quot;Chi tiết&quot; để biên tập nội dung bài và tài liệu.{ro ? '' : ' Bạn cũng có thể kéo thả biểu tượng ⋮⋮ để sắp xếp trong cùng chương.'}</p>
          <p>Bài kiểm tra đầu vào (Diagnostic Test): {c.entryTest
            ? <Link className="strong" to={`/teach/courses/${c.id}/quiz/entry`}>Đã có ({c.entryTest.count} câu)</Link>
            : <Link className="strong text-danger" to={`/teach/courses/${c.id}/quiz/entry`}>Chưa có — Tạo bài kiểm tra đầu vào</Link>}</p>
          <ReviewNotes courseId={c.id} collapsible links title="Bài kiểm tra đầu vào" match={(a) => a.type === 'entry' || !!a.entry} />
          <ReviewNotes courseId={c.id} collapsible links title="Thông tin khoá học" match={(a) => a.type === 'course'} /></div>
        {addBar}</div></div>
      {!c.chapters.length && <div className="card"><Empty icon="layers" title="Khoá học chưa có nội dung" body="Bắt đầu bằng cách thêm chương đầu tiên, sau đó thêm các bài học lý thuyết, bài thực hành và câu hỏi trắc nghiệm." actions={ro ? null : <button type="button" className="btn btn-primary" onClick={() => addChapter(c)}><Icon name="plus" /> Thêm chương đầu tiên</button>} /></div>}
      {c.chapters.length > 0 && <div className="tc-cols xsmall muted" aria-hidden="true"><span /><span>Số</span><span>Bài học</span><span>Loại</span><span>Thời lượng</span><span>Kiểm tra</span><span>Trạng thái</span><span>Thao tác</span></div>}
      {c.chapters.map((ch, ci) => (
        <section key={ch.id} className="card tc-chapter" {...dragAttrs('chapter', ch.id)} data-drop="chapter" data-id={ch.id}>
          <div className="card-header">
            <div className="row od-fill">{!ro && <span className="tc-grip" aria-hidden="true"><Icon name="grip-vertical" className="icon-sm" /></span>}
              {renaming === ch.id ? <RenameForm c={c} id={ch.id} value={ch.title} label="Tên chương" /> : (
                <div className="stack-1" style={{ minWidth: 0 }}><h2 className="tc-h">Chương {ci + 1}: {ch.title}</h2>
                  <ReviewNotes courseId={c.id} title="Góp ý cho chương này" match={(a) => a.type === 'chapter' && a.itemId === String(ch.id)} />
                  <span className="row xsmall muted" style={{ gap: 8 }}>{ch.lessons.length} bài học{chapterBlockers(ch) ? <span className="badge badge-warn"><Icon name="alert-triangle" />{chapterBlockers(ch)} bài cần sửa</span> : ch.lessons.length ? <span className="badge badge-success"><Icon name="check" />Đạt</span> : <span>Chưa có bài học</span>}</span></div>
              )}</div>
            {ro || renaming === ch.id ? null : (
              <div className="tc-row-actions tc-ch-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => openAddLesson(c, ch.id)}><Icon name="plus" className="icon-sm" /> Bài học</button>
                <RowMenu label={`Thao tác khác với chương ${ci + 1}`} items={[
                  { icon: 'pencil', label: 'Đổi tên chương', run: () => startRename(ch.id) },
                  { icon: 'arrow-up', label: 'Chuyển lên', disabled: ci === 0, run: () => move(c, 'chapter', ch.id, -1) },
                  { icon: 'arrow-down', label: 'Chuyển xuống', disabled: ci === c.chapters.length - 1, run: () => move(c, 'chapter', ch.id, 1) },
                  { icon: 'trash', label: 'Xoá chương', danger: true, run: () => removeChapter(c, ch.id) },
                ]} /></div>
            )}
          </div>
          <ol className="list tc-lessons" data-drop-zone={ch.id}>{ch.lessons.map((l, li) => lessonRow(l, li, ch, ci))}
            {!ch.lessons.length && <li className="tc-empty-drop small muted" data-drop="chapter-end" data-id={ch.id}>Chương này chưa có bài học. {ro ? '' : 'Bấm “+ Bài học” ở trên để thêm.'}</li>}</ol>
        </section>
      ))}
      {!ro && (
        <section className="card tc-danger"><div className="card-body row-between">
          <div className="stack-1"><strong>Xoá khoá học</strong><span className="small muted">{enrolled ? `Khoá học có ${enrolled} học viên nên không thể xoá. Liên hệ quản trị viên nếu cần ẩn khoá học.` : c.status === 'published' ? 'Khoá học đang bán không thể xoá. Liên hệ quản trị viên nếu cần ẩn khoá học.' : 'Xoá vĩnh viễn khoá học và toàn bộ nội dung.'}</span></div>
          <button type="button" className="btn btn-danger-outline" disabled={!!enrolled || c.status === 'published'} onClick={() => deleteCourse(c)}>Xoá khoá học</button>
        </div></section>
      )}
    </div>
  );
}

// ───────────────────────── Thông tin ─────────────────────────
let infoDraft = null;
let infoSaving = false;
/** Real handleSaveInfo + updateCourseInfo: title ≥ 5, summary ≥ 20, price a non-blank integer 0…2,147,483,647. */
export function validateInfo(d) {
  const err = {};
  if (d.title.trim().length < 5) err.title = 'Tên khoá học cần ít nhất 5 ký tự.';
  if (d.summary.trim().length < 20) err.summary = 'Mô tả cần ít nhất 20 ký tự.';
  const raw = String(d.proposedPrice).trim();
  const n = Number(raw);
  if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < 0) err.proposedPrice = 'Giá đề xuất phải là số nguyên không âm.';
  else if (n > PRICE_MAX) err.proposedPrice = 'Giá đề xuất phải là số nguyên không âm, không vượt quá 2.147.483.647 VND.';
  if (!categoryOptions(d.originalCategory).includes(d.category)) err.category = 'Chọn một danh mục hợp lệ.';
  if (!LEVELS.some(([k]) => k === d.level)) err.level = 'Chọn trình độ hợp lệ.';
  return err;
}
function InfoTab({ c, query }) {
  useView();
  useFlagFocus(query && query.flag);
  const notes = (field) => <ReviewNotes courseId={c.id} title={field ? `Góp ý cho “${INFO_FIELDS[field]}”` : 'Góp ý chung cho khoá học'} match={(a) => a.type === 'course' && (a.itemId || null) === field} />;
  const ro = locked(c);
  if (!infoDraft || infoDraft.id !== c.id) infoDraft = { id: c.id, title: c.title, summary: c.summary, category: c.category, originalCategory: c.category, level: c.level, outcomes: (c.outcomes || []).join('\n'), requirements: (c.requirements || []).join('\n'), proposedPrice: c.proposedPrice === null || c.proposedPrice === undefined ? '' : String(c.proposedPrice), errors: {} };
  const d = infoDraft; const e = d.errors;
  const onInput = (ev) => {
    infoDraft[ev.target.name] = ev.target.value;
    if (infoDraft.errors[ev.target.name]) infoDraft.errors = { ...infoDraft.errors, [ev.target.name]: null };
    if (!guard.dirty) guard.dirty = { label: 'Thông tin khoá học', scope: '/teach/courses/' + c.id + '/info', reset: () => { infoDraft = null; } };
    rerender();
  };
  const save = async (ev) => {
    ev.preventDefault();
    if (ro || infoSaving) return;
    const err = validateInfo(d);
    d.errors = err;
    if (Object.keys(err).length) { rerender(); return; }
    infoSaving = true; rerender();
    const lines = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);
    const r = await write(c.id, () => act('course', 'updateCourseInfo', c.id, {
      title: d.title.trim(), summary: d.summary.trim(), category: d.category, level: d.level,
      learningOutcomes: lines(d.outcomes), requirements: lines(d.requirements), proposedPrice: Number(String(d.proposedPrice).trim()),
    }), { toast });
    infoSaving = false;
    if (r && r.success) { infoDraft = null; guard.dirty = null; toast('Đã lưu thông tin khoá học.', { type: 'success' }); }
    else if (r && r.errors) d.errors = { ...r.errors, proposedPrice: r.errors.price || r.errors.proposedPrice };
    rerender();
  };
  return (
    <form className="card" onSubmit={save} noValidate data-dirty-scope aria-busy={infoSaving}>
      <div className="card-header"><h2 className="tc-h">Thông tin chi tiết khoá học</h2></div>
      <div className="card-body stack-4">
        {notes(null)}
        <div className={`field ${e.title ? 'is-invalid' : ''}`}><label htmlFor="in-title">Tên khoá học</label><input id="in-title" name="title" value={d.title} onChange={onInput} disabled={ro} aria-invalid={!!e.title} /><FieldError>{e.title}</FieldError>{notes('title')}</div>
        <div className={`field ${e.summary ? 'is-invalid' : ''}`}><label htmlFor="in-sum">Mô tả ngắn</label><textarea id="in-sum" name="summary" rows={3} value={d.summary} onChange={onInput} disabled={ro} aria-invalid={!!e.summary} /><FieldError>{e.summary}</FieldError>{!ro && <AiAssist courseId={c.id} field="summary" value={d.summary} title={d.title} level={d.level} onApply={(v) => onInput({ target: { name: 'summary', value: v } })} />}{notes('summary')}</div>
        <div className="grid-3" style={{ alignItems: 'start' }}>
          <div className={`field ${e.category ? 'is-invalid' : ''}`}><label htmlFor="in-cat">Danh mục</label><select id="in-cat" name="category" value={d.category} onChange={onInput} disabled={ro}>{categoryOptions(d.originalCategory).map((x) => <option key={x} value={x}>{x}</option>)}</select><FieldError>{e.category}</FieldError></div>
          <div className={`field ${e.level ? 'is-invalid' : ''}`}><label htmlFor="in-level">Trình độ</label><select id="in-level" name="level" value={d.level} onChange={onInput} disabled={ro}>{LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><FieldError>{e.level}</FieldError></div>
          <div className={`field ${e.proposedPrice ? 'is-invalid' : ''}`}><label htmlFor="in-price">Giá đề xuất (VND)</label><input id="in-price" name="proposedPrice" type="number" min="0" step="10000" inputMode="numeric" value={d.proposedPrice} onChange={onInput} disabled={ro} aria-invalid={!!e.proposedPrice} />
            <p className="field-help">Quản trị viên xác nhận giá cuối cùng khi duyệt. Nhập 0 cho khoá miễn phí.{c.status === 'published' ? ` Giá đang bán: ${fmt.vnd(c.price)}.` : ''}</p><FieldError>{e.proposedPrice}</FieldError></div>
        </div>
        {notes('category')}{notes('price')}
        <div className="field"><label htmlFor="in-out">Học viên sẽ học được gì? (Mỗi dòng một ý)</label><textarea id="in-out" name="outcomes" rows={4} value={d.outcomes} onChange={onInput} disabled={ro} />{!ro && <AiAssist courseId={c.id} field="outcomes" value={d.outcomes} title={d.title} level={d.level} onApply={(v) => onInput({ target: { name: 'outcomes', value: v } })} />}{notes('outcomes')}</div>
        <div className="field"><label htmlFor="in-req">Yêu cầu trước khi học (Mỗi dòng một ý)</label><textarea id="in-req" name="requirements" rows={3} value={d.requirements} onChange={onInput} disabled={ro} />{!ro && <AiAssist courseId={c.id} field="requirements" value={d.requirements} title={d.title} level={d.level} onApply={(v) => onInput({ target: { name: 'requirements', value: v } })} />}{notes('requirements')}</div>
        {!ro && guard.dirty && (
          <div className="row tc-savebar"><button className="btn btn-primary" type="submit" disabled={infoSaving}>{infoSaving ? <><Icon name="loader" className="icon-sm" /> Đang lưu...</> : <><Icon name="check" className="icon-sm" /> Lưu thay đổi</>}</button><span className="small muted"><Icon name="alert-circle" className="icon-sm text-warn" /> Có thay đổi chưa lưu</span></div>
        )}
      </div>
    </form>
  );
}

// ───────────────────────── Xuất bản ─────────────────────────
/** Advisory notes that never gate submission (real publication-service advisory items). */
export function readinessAdvice(c) {
  const weak = ls(c).filter((l) => l.code && l.code.kind === 'challenge' && (l.code.tests < 3 || !l.code.hiddenTests));
  return weak.map((l) => ({ label: l.title, text: 'Bài code nên có ít nhất 3 test, trong đó có test ẩn cho trường hợp biên.', href: `/teach/courses/${c.id}/code/${l.id}` }));
}

const CRIT_TXT = { pass: ['badge-success', 'Đạt'], fix: ['badge-danger', 'Cần sửa'], na: ['badge-neutral', 'Không áp dụng'] };
const ROUND_STATUS = { in_review: ['badge-info', 'Đang duyệt'], changes_requested: ['badge-warn', 'Yêu cầu sửa'], approved: ['badge-success', 'Đã duyệt'], rejected: ['badge-danger', 'Từ chối'] };
/** Changes requested comes from the newest decided review round. */
const changesRequested = (c) => c.status === 'rejected' && (c.reviewOutcome === 'changes' || (reviewRound(c) || {}).status === 'changes_requested');

/** Result of the last decided review round: criterion verdicts + flags the lecturer works through. */
function ReviewBlock({ c }) {
  const r = reviewRound(c);
  if (!r) return null;
  const all = r.flags || [];
  const open = all.filter((f) => f.status === 'open');
  const order = { open: 0, fixed: 1, closed: 2 };
  const flags = all.slice().sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || (a.severity === 'must' ? 0 : 1) - (b.severity === 'must' ? 0 : 1));
  const rs = ROUND_STATUS[r.status];
  const criteria = r.criteria || {};
  return (
    <section className="card tc-review" aria-labelledby="tc-review-h">
      <div className="card-header"><div className="stack-1"><span className="row" style={{ gap: 8 }}><h2 className="tc-h" id="tc-review-h">Kết quả kiểm duyệt lần {r.round}</h2>{rs && <span className={`badge ${rs[0]}`}>{rs[1]}</span>}</span><span className="xsmall muted">{r.reviewedAt ? fmt.datetime(r.reviewedAt) : ''}{r.reviewNote ? ` · ${r.reviewNote}` : ''}</span></div>
        {open.length ? <span className="badge badge-warn">{open.length} góp ý cần xử lý</span> : all.length ? <span className="badge badge-success">Đã xử lý mọi góp ý</span> : null}</div>
      <div className="card-body stack-4">
        <div className="stack-2"><strong className="small">Tiêu chí</strong>
          <ul className="rv-crit">{CRITERIA.map((k) => {
            const v = criteria[k.id] || {}; const t = CRIT_TXT[v.status];
            return <li key={k.id} className="rv-crit-row"><div className="rv-crit-main"><span className="small strong">{k.label}</span>{v.note && <span className="xsmall">{v.note}</span>}</div>{t ? <span className={`badge ${t[0]}`}>{t[1]}</span> : <span className="badge badge-neutral">Chưa chấm</span>}</li>;
          })}</ul></div>
        {flags.length > 0 && (
          <div className="stack-2"><strong className="small">Góp ý chi tiết</strong><span className="xsmall muted">Mỗi góp ý cũng hiện ngay tại chỗ cần sửa (thông tin, chương, bài học, câu hỏi). Bấm “Xem tại chỗ” để mở đúng vị trí.</span>
            <ul className="rv-flags">{flags.map((f) => (
              <NoteCard key={f.id} c={c} f={f} showTarget link={<Link className="btn btn-secondary btn-sm" to={flagHref(c, f)}><Icon name="map" className="icon-sm" /> Xem tại chỗ</Link>} />
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
  // the backend opens the review round, carries open flags over and notifies the admins
  await write(c.id, () => act('publish', 'submitCourseForPublication', c.id), { toast, okMessage: 'Đã gửi yêu cầu xuất bản.' });
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
  const rr = reviewRound(c);
  const openMust = !!rr && (rr.flags || []).some((f) => f.status === 'open' && f.severity === 'must');
  const infoLabels = STEPS[0].labels; const kmapLabels = STEPS[2].labels;
  const groups = [
    ['Thông tin', items.filter((x) => infoLabels.includes(x.label))],
    ['Nội dung', items.filter((x) => !infoLabels.includes(x.label) && !kmapLabels.includes(x.label))],
    ['Bản đồ kiến thức', items.filter((x) => kmapLabels.includes(x.label))],
  ];
  const blockers = items.filter((x) => !x.ok);
  const advice = readinessAdvice(c);
  return (
    <div className="stack-4">
      {status}
      <ReviewBlock c={c} />
      {/* Reader: what blocks submission, in the order to fix it. One filled primary, only when nothing blocks. */}
      {canSubmit && (
        <section className={`card tc-reader ${blockers.length ? 'is-blocked' : 'is-ready'}`} aria-labelledby="tc-reader-h">
          <div className="card-body stack-3">
            <div className="row-between tc-reader-head">
              <div className="stack-1"><h2 className="tc-h" id="tc-reader-h">{blockers.length ? `Còn ${blockers.length} việc chặn gửi duyệt` : 'Đủ điều kiện gửi duyệt'}</h2>
                <span className="small muted">{blockers.length ? `Đã đạt ${items.length - blockers.length}/${items.length} điều kiện. Xử lý lần lượt từ trên xuống.` : 'Mọi điều kiện bắt buộc đã đạt. Gửi để quản trị viên duyệt.'}</span></div>
              {allOk && <button type="button" className="btn btn-primary btn-lg" onClick={() => submitForReview(c)}>{c.status === 'rejected' ? 'Sửa và gửi lại' : 'Gửi yêu cầu xuất bản'}</button>}
            </div>
            {blockers.length > 0 && (
              <ul className="tc-blockers" aria-label="Việc còn lại trước khi gửi">{blockers.map((x) => (
                <li key={x.label} className="tc-blocker"><Icon name="alert-circle" className="icon-sm text-warn" />
                  <div className="list-main"><strong className="small">{x.label}</strong><span className="xsmall muted">{x.hint}</span></div>
                  {x.href && <Link className="btn btn-secondary btn-sm" to={x.href}>{x.action || 'Mở để sửa'}</Link>}</li>
              ))}</ul>
            )}
          </div>
        </section>
      )}
      <section className="card" aria-labelledby="tc-conditions-h"><div className="card-header"><h2 className="tc-h" id="tc-conditions-h">Điều kiện xuất bản</h2><span className="small muted">{items.length - blockers.length}/{items.length} đạt</span></div>
        <div className="card-body stack-4">{groups.filter(([, list]) => list.length).map(([name, list]) => (
          <div key={name} className="stack-2"><strong className="xsmall muted">{name} · {list.filter((x) => x.ok).length}/{list.length} đạt</strong>
            <ul className="list tc-conditions">{list.map((x) => (
              <li key={x.label} className="list-row"><Icon name={x.ok ? 'check-circle' : 'alert-circle'} className={x.ok ? 'text-success' : 'text-warn'} />
                <div className="list-main"><strong className="small">{x.label}</strong><span className="xsmall muted">{x.ok ? 'Đã đạt' : x.hint}</span></div>
                <span className={`badge ${x.ok ? 'badge-success' : 'badge-warn'}`}>{x.ok ? 'Đạt' : 'Chưa đạt'}</span></li>
            ))}</ul></div>
        ))}</div></section>
      {advice.length > 0 && <section className="card"><div className="card-header"><h2 className="tc-h">Gợi ý thêm</h2><span className="xsmall muted">Không bắt buộc để gửi duyệt</span></div>
        <ul className="list">{advice.map((x) => <li key={x.href} className="list-row"><Icon name="info" className="text-info" /><div className="list-main"><strong className="small">{x.label}</strong><span className="xsmall muted">{x.text}</span></div><Link className="btn btn-ghost btn-sm" to={x.href}>Mở</Link></li>)}</ul></section>}
      {canSubmit && openMust && <Alert type="warn" title="Còn góp ý bắt buộc" body={'Khoá học còn góp ý "Bắt buộc sửa" chưa được xử lý. Vui lòng chỉnh sửa nội dung và đánh dấu đã sửa để đảm bảo khoá học được duyệt.'} />}
    </div>
  );
}

/** Loading / not-found / error frame shared by the course-scoped lecturer screens. */
export function courseGate(state, retry) {
  if (state.c) return null;
  if (state.error) {
    const st = state.error.status;
    if (st === 403 || st === 404 || /Không tìm thấy/.test(state.error.message || '')) return notMine();
    return shell('/teach/courses', <LoadError error={state.error} onRetry={retry} />);
  }
  return shell('/teach/courses', <Loading rows={5} label="Đang tải khoá học…" />);
}

export function CourseEditorPage({ params, query }) {
  useCodi();
  const state = useCourse(params.courseId);
  const gate = courseGate(state, () => reloadCourse(params.courseId));
  if (gate) return gate;
  const c = state.c;
  const tab = TABS.some(([k]) => k === params.tab) ? params.tab : 'content';
  const body = { content: <ContentTab c={c} query={query} />, info: <InfoTab c={c} query={query} />, kmap: <KmapTab c={c} />, publish: <PublishTab c={c} /> }[tab];
  return shell('/teach/courses', <><EditorHeader c={c} tab={tab} />{body}</>);
}
