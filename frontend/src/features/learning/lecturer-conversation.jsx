/**
 * Learner side of a private conversation with the lecturer (real lib/lesson-qa-service.ts
 * getLearnerLessonConversation / postLearnerConversationReply, and the summary row in the tutor panel).
 * Data: GET/POST /api/learn/:courseId/lessons/:lessonId/conversations (loaded by the Hỏi đáp panel, passed in here).
 * The learner may reply while it is open (10-character minimum); a resolved conversation is read-only. Creating a
 * conversation stays in the AI tutor's "Hỏi riêng giảng viên" dialog (coding feature).
 */
import { useState } from 'react';
import { api } from '../../lib/api';
import { Codi } from '../../lib/codi';
import { Alert, Icon } from '../../components/ui/primitives';
import { errorText, lessonBase } from './learning-store';

const MIN = 10;

/** conv: LearnerConversationView | null; onReply(message) appends the stored reply. */
export function LecturerConversation({ courseId, lessonId, conv, onReply }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!conv) return null;
  const messages = conv.messages || [];
  const replied = messages.some((m) => m.isLecturer);
  const resolved = conv.status === 'resolved';
  const status = resolved ? 'Đã giải quyết' : replied ? 'Đã có trả lời' : 'Đang chờ trả lời';
  const lecturerName = conv.lecturerName || 'Giảng viên';
  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    const t = text.trim();
    if (t.length < MIN) { setError('Câu hỏi cần ít nhất 10 ký tự để giảng viên hiểu rõ.'); return; }
    if (resolved) { setError('Cuộc trao đổi đã được giải quyết. Vui lòng liên hệ giảng viên nếu cần mở lại.'); return; }
    setBusy(true); setError(null);
    try {
      const res = await api.post(`${lessonBase(courseId, lessonId)}/conversations`, { conversationId: conv.id, text: t });
      onReply(res.reply);
      setText(''); // the reply now shows in the thread
    } catch (err) {
      setError(errorText(err, 'Không thể gửi tin nhắn.'));
    } finally { setBusy(false); }
  };
  return (
    <section className="card ln-conv" aria-label="Câu hỏi riêng cho giảng viên">
      <button type="button" className="ln-conv-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={`ln-conv-dot ${replied || resolved ? 'is-done' : 'is-wait'}`} aria-hidden="true" />
        <span className="od-fill">Câu hỏi riêng cho giảng viên · {status}</span>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} className="icon-sm" />
      </button>
      {!open && (
        <p className="ln-conv-summary small muted">{[...messages].reverse().find((m) => m.isLecturer)?.text || 'Bạn sẽ nhận thông báo khi giảng viên trả lời.'}</p>
      )}
      {open && (
        <div className="card-body stack-3">
          <p className="xsmall muted">Chỉ bạn và {lecturerName} xem được cuộc trao đổi này.</p>
          <ol className="ln-conv-thread">{messages.map((m) => (
            <li key={m.id} className={m.isLecturer ? 'is-lecturer' : 'is-learner'}>
              <span className="xsmall row"><strong>{m.isLecturer ? lecturerName : 'Bạn'}</strong>{m.isLecturer && <span className="badge badge-accent">Giảng viên</span>}<span className="muted">{Codi.fmt.relative(m.at)}</span></span>
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
