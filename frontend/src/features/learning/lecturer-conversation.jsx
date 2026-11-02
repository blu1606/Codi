/**
 * Learner side of a private conversation with the lecturer (real lib/lesson-qa-service.ts
 * getLearnerLessonConversation / postLearnerConversationReply, and the summary row in the tutor panel).
 *
 * Shows the learner's latest conversation for this lesson from db.conversations (shape kept: messages
 * [{ from:'learner'|'lecturer', text, at }], status 'open'|'resolved'). The learner may reply while it is open
 * (10-character minimum); a resolved conversation is read-only with the real message. Creating a conversation stays
 * in the AI tutor's "Hỏi riêng giảng viên" dialog (coding feature).
 */
import { useState } from 'react';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Icon } from '../../components/ui/primitives';
import { persistNow, uid } from './learning-store';

const MIN = 10;

export function learnerConversation(courseId, lessonId) {
  return (Codi.db().conversations || [])
    .filter((x) => x.courseId === courseId && x.lessonId === lessonId && x.learnerId === uid())
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
}

export function LecturerConversation({ courseId, lessonId }) {
  useCodi();
  const conv = learnerConversation(courseId, lessonId);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!conv) return null;
  const messages = conv.messages || [];
  const replied = messages.some((m) => m.from === 'lecturer');
  const resolved = conv.status === 'resolved';
  const status = resolved ? 'Đã giải quyết' : replied ? 'Đã có trả lời' : 'Đang chờ trả lời';
  const lecturer = Codi.user(conv.lecturerId) || { name: 'Giảng viên' };
  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    const t = text.trim();
    if (t.length < MIN) { setError('Câu hỏi cần ít nhất 10 ký tự để giảng viên hiểu rõ.'); return; }
    if (conv.status !== 'open') { setError('Cuộc trao đổi đã được giải quyết. Vui lòng liên hệ giảng viên nếu cần mở lại.'); return; }
    setBusy(true); setError(null);
    const msg = { from: 'learner', text: t, at: new Date().toISOString() };
    Codi.set(() => { conv.messages = [...messages, msg]; conv.updatedAt = msg.at; });
    if (conv.lecturerId) Codi.notify(conv.lecturerId, { title: 'Phản hồi mới từ học viên', body: t.slice(0, 120), link: '/teach/questions' });
    const ok = await persistNow();
    setBusy(false);
    if (!ok) {
      Codi.set(() => { conv.messages = conv.messages.filter((m) => m !== msg); });
      setError('Không thể gửi tin nhắn.');
      return;
    }
    setText(''); // the reply now shows in the thread
  };
  return (
    <section className="card ln-conv" aria-label="Câu hỏi riêng cho giảng viên">
      <button type="button" className="ln-conv-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={`ln-conv-dot ${replied || resolved ? 'is-done' : 'is-wait'}`} aria-hidden="true" />
        <span className="od-fill">Câu hỏi riêng cho giảng viên · {status}</span>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} className="icon-sm" />
      </button>
      {!open && (
        <p className="ln-conv-summary small muted">{[...messages].reverse().find((m) => m.from === 'lecturer')?.text || 'Bạn sẽ nhận thông báo khi giảng viên trả lời.'}</p>
      )}
      {open && (
        <div className="card-body stack-3">
          <p className="xsmall muted">Chỉ bạn và {lecturer.name} xem được cuộc trao đổi này.</p>
          <ol className="ln-conv-thread">{messages.map((m, i) => (
            <li key={i} className={m.from === 'lecturer' ? 'is-lecturer' : 'is-learner'}>
              <span className="xsmall row"><strong>{m.from === 'lecturer' ? lecturer.name : 'Bạn'}</strong>{m.from === 'lecturer' && <span className="badge badge-accent">Giảng viên</span>}<span className="muted">{Codi.fmt.relative(m.at)}</span></span>
              <p className="small ln-pre">{m.text}</p>
            </li>
          ))}</ol>
          {resolved ? (
            <Alert type="info" body="Cuộc trao đổi đã được giải quyết. Vui lòng liên hệ giảng viên nếu cần mở lại." />
          ) : (
            <form className={`field stack-2 ${error ? 'is-invalid' : ''}`} noValidate onSubmit={send}>
              <label htmlFor={`conv-${conv.id}`}>Trả lời giảng viên</label>
              <textarea id={`conv-${conv.id}`} rows={3} value={text} maxLength={5000} disabled={busy} onChange={(e) => setText(e.target.value)} />
              {error ? <p className="field-error" role="alert"><Icon name="alert-circle" className="icon-sm" /><span>{error}</span></p> : <span className="field-help">Ít nhất 10 ký tự.</span>}
              <div><button type="submit" className="btn btn-primary btn-sm" disabled={busy} aria-busy={busy || undefined}><Icon name="send" className="icon-sm" /> Gửi</button></div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
