/**
 * Reviewer comments in context for the lecturer. The admin anchors each flag to a place in the course
 * ({ targetType, lessonId, itemId }, see admin/publication-rules.js); the lecturer sees the same flag at that place
 * — a course-info field, a chapter, a lesson row, a material, the reading, a quiz question, the assignment — and
 * marks it fixed there (markFlagFixed / reopenFlag on dashboard/lecturer/courses/courseId/publish).
 * Flags come from the newest decided round (getPublicationData.round), read live through useCourse.
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import { reviewRound, promptReason, findLesson } from './teach-api';
import { act, write, useCourse } from './teach-data';
import { SEVERITY, FLAG_STATUS, anchorOf, placeAnchor } from '../admin/publication-rules';

const toast = (msg, o) => Codi.ui.toast(msg, o);
export const roundFlags = (c) => ((reviewRound(c) || {}).flags) || [];
const labelOf = (f) => (f.target && f.target.label) || f.targetLabel;

/** Where the lecturer fixes a flag: the editor screen that shows it in place (flag= scrolls to it there). */
export function flagHref(c, f) {
  const a = anchorOf(f);
  const base = `/teach/courses/${c.id}`;
  const flag = `flag=${f.id}`;
  if (a.type === 'course') return `${base}/info?${flag}`;
  if (a.type === 'chapter') return `${base}/content?${flag}`;
  if (a.type === 'entry' || a.entry) return `${base}/quiz/entry?${flag}`;
  if (a.type === 'question' || a.type === 'quiz') return `${base}/quiz/${a.lessonId}?${flag}`;
  const found = a.lessonId && findLesson(c, a.lessonId);
  // code lessons are edited on the code screen; their flags stay listed on the lesson row
  if (!found || found.l.code || a.type === 'code' || a.type === 'test') return `${base}/content?lesson=${a.lessonId || ''}&${flag}`;
  return `${base}/content?lesson=${a.lessonId}&edit=1&${flag}`;
}

export async function flagFixed(c, id) {
  const f = roundFlags(c).find((x) => x.id === id); if (!f) return;
  const r = reviewRound(c);
  if (!(c.status === 'rejected' && r && ['changes_requested', 'rejected'].includes(r.status))) { toast('Chỉ có thể phản hồi góp ý của vòng mới nhất đã trả về để chỉnh sửa.', { type: 'danger' }); return; }
  const res = await promptReason({
    title: 'Đánh dấu góp ý đã sửa?',
    body: <p className="small"><strong>{labelOf(f)}</strong><br /><span className="muted">{f.comment}</span></p>,
    label: 'Bạn đã chỉnh sửa nội dung gì?', help: 'Ít nhất 5 ký tự để người duyệt nắm rõ nội dung đã sửa.', min: 5,
    error: 'Vui lòng mô tả bạn đã sửa gì (ít nhất 5 ký tự).', placeholder: 'Ví dụ: đã đổi đáp án đúng thành "Thêm use client" và cập nhật giải thích.',
    confirmLabel: 'Xác nhận đã sửa',
  });
  if (!res.ok || f.status !== 'open') return;
  await write(c.id, () => act('publish', 'markFlagFixed', c.id, f.id, res.reason), { toast, okMessage: 'Đã đánh dấu đã sửa.' });
}
export async function flagReopen(c, id) {
  const f = roundFlags(c).find((x) => x.id === id); if (!f || f.status !== 'fixed' || c.status !== 'rejected') return;
  await write(c.id, () => act('publish', 'reopenFlag', c.id, f.id), { toast });
}

/** One reviewer comment with its status and the fix / undo action. */
export function NoteCard({ c, f, showTarget, link }) {
  const canMark = c.status === 'rejected';
  return (
    <li id={`tc-flag-${f.id}`} className={`rv-flag tc-remark ${f.status !== 'open' ? 'is-closed' : ''}`}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className={`badge ${f.severity === 'must' ? 'badge-danger' : 'badge-warn'}`}>{SEVERITY[f.severity] || f.severity}</span>
        <span className={`badge ${f.status === 'fixed' ? 'badge-accent' : f.status === 'closed' ? 'badge-success' : 'badge-neutral'}`}>{FLAG_STATUS[f.status] || f.status}</span>
        {f.source === 'ai' && <span className="badge badge-accent"><Icon name="sparkles" />AI đề xuất</span>}{f.carried && <span className="badge badge-neutral">Vòng trước</span>}</div>
      {showTarget && <span className="rv-flag-target small strong">{labelOf(f)}</span>}
      <p className="small">{f.comment}</p>
      {(f.reply || f.lecturerReply) && <p className="rv-reply small"><strong>Bạn đã phản hồi:</strong> {f.reply || f.lecturerReply}</p>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {link}
        {!canMark ? null : f.status === 'open'
          ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => flagFixed(c, f.id)}><Icon name="check" className="icon-sm" /> Đánh dấu đã sửa</button>
          : f.status === 'fixed' ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => flagReopen(c, f.id)}>Bỏ đánh dấu</button> : null}
      </div>
    </li>
  );
}

/**
 * The flags placed at one spot of the screen. match(anchor) picks them; known / questionIds relocate flags whose
 * item no longer exists (see placeAnchor). collapsible: a "N góp ý" toggle (lesson rows) instead of an open list.
 * links: a "Mở để sửa" link per note to the screen where its exact place is.
 */
export function ReviewNotes({ courseId, match, known, questionIds, collapsible, open, links, title }) {
  const { c } = useCourse(courseId);
  if (!c) return null;
  const flags = roundFlags(c).filter((f) => match(placeAnchor(f, known, questionIds)));
  if (!flags.length) return null;
  const pending = flags.filter((f) => f.status === 'open');
  const tone = pending.some((f) => f.severity === 'must') ? 'badge-danger' : pending.length ? 'badge-warn' : 'badge-success';
  const list = (
    <ul className="rv-flags tc-remarks-list">{flags.map((f) => (
      <NoteCard key={f.id} c={c} f={f} showTarget={!!links} link={links ? <Link className="btn btn-ghost btn-sm" to={flagHref(c, f)}><Icon name="external-link" className="icon-sm" /> Mở để sửa</Link> : null} />
    ))}</ul>
  );
  const head = <span className={`badge ${tone}`}><Icon name="flag" />{pending.length ? `${pending.length}/${flags.length} góp ý cần xử lý` : `${flags.length} góp ý đã xử lý`}</span>;
  if (collapsible) {
    return <details className="tc-remarks" open={open || undefined}><summary className="row" style={{ gap: 8 }}>{head}{title && <span className="xsmall muted">{title}</span>}<span className="sr-only"> — bấm để xem</span></summary>{list}</details>;
  }
  return <div className="tc-remarks is-inline" role="group" aria-label={title || 'Góp ý từ quản trị'}><div className="row" style={{ gap: 8 }}>{head}{title && <span className="xsmall muted">{title}</span>}</div>{list}</div>;
}

/** Scrolls to the note of ?flag=<id> once it is on screen (the lesson sheet and quiz load asynchronously). */
export function useFlagFocus(flagId) {
  useEffect(() => {
    if (!flagId) return undefined;
    let tries = 0; let timer;
    const look = () => {
      const el = document.getElementById(`tc-flag-${flagId}`);
      if (el) {
        const box = el.closest('details'); if (box) box.open = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('is-focus');
        timer = setTimeout(() => el.classList.remove('is-focus'), 1800);
        return;
      }
      if (++tries < 20) timer = setTimeout(look, 150);
    };
    timer = setTimeout(look, 100);
    return () => clearTimeout(timer);
  }, [flagId]);
}
