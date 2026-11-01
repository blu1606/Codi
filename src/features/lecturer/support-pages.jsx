// S27 Q&A inbox (public lesson questions + private conversations escalated from the AI assistant) and S28 reviews.
// Rules and copy follow the real questions-inbox-client.tsx / questions/actions.ts and reviews-client.tsx:
// replies 5–5000 chars; a conversation resolves only while open and after a lecturer reply; resolved threads are
// locked until reopened; review replies 1–3000 chars; only visible reviews are listed.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Alert, Avatar, Empty, Icon, Stars } from '../../components/ui/primitives';
import { shell, me, byCourse, persist, FieldError, isVisibleReview } from './teach-api';

const { fmt } = Codi;
const NO_USER = { name: 'Học viên' };
const REPLY_MIN = 5; const REPLY_MAX = 5000; const REVIEW_MAX = 3000;

/** Real validateReplyBody: trimmed 5–5000 characters. */
export function replyProblem(text) {
  const t = String(text || '').trim();
  if (t.length < REPLY_MIN) return 'Câu trả lời cần ít nhất 5 ký tự.';
  if (t.length > REPLY_MAX) return 'Câu trả lời không được vượt quá 5000 ký tự.';
  return null;
}

function ReplyForm({ id, label, placeholder, help, onSend, extra }) {
  const [err, setErr] = useState(null);
  const [text, setText] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const p = replyProblem(text);
    if (p) { setErr(p); return; }
    const res = onSend(text.trim());
    if (res === false) { setErr('Không thể gửi câu trả lời.'); return; }
    setErr(null); setText('');
  };
  return (
    <form className="stack-3 tc-reply-form" onSubmit={submit} noValidate>
      <label className="field-label" htmlFor={id}>{label}</label>
      {err && <Alert type="danger" body={err} />}
      <textarea id={id} name="text" rows={4} value={text} placeholder={placeholder} maxLength={REPLY_MAX + 500} onChange={(e) => { setText(e.target.value); setErr(null); }} aria-invalid={!!err} />
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        {help ? <span className="xsmall muted">{help}</span> : <span />}
        <span className="row" style={{ gap: 8 }}>{extra}<button className="btn btn-primary" type="submit"><Icon name="send" className="icon-sm" /> Gửi trả lời</button></span>
      </div>
    </form>
  );
}

const lecturerReplied = (conv) => (conv.messages || []).some((m) => m.from === 'lecturer' || m.from === 'admin');
/** Real resolveConversation / reopenConversation guards. Returns an error message or null. */
export function conversationStatusProblem(conv, to) {
  if (to === 'resolved') {
    if (conv.status !== 'open') return 'Cuộc hội thoại không ở trạng thái mở.';
    if (!lecturerReplied(conv)) return 'Hãy trả lời học viên trước khi đánh dấu đã giải quyết.';
  } else if (conv.status !== 'resolved') return 'Chỉ có thể mở lại cuộc hội thoại đã giải quyết.';
  return null;
}
function setConversationStatus(id, to) {
  const conv = (Codi.db().conversations || []).find((x) => x.id === id); if (!conv) return;
  const p = conversationStatusProblem(conv, to);
  if (p) { Codi.ui.toast(p, { type: 'danger' }); return; }
  conv.status = to; conv.updatedAt = new Date().toISOString(); persist();
  Codi.ui.toast(to === 'resolved' ? 'Đã đánh dấu cuộc hội thoại đã giải quyết.' : 'Đã mở lại cuộc hội thoại.', { type: 'success' });
}
const roleLabel = (m) => (m.from === 'admin' ? 'Quản trị viên' : 'Giảng viên');

export function QuestionsPage({ query }) {
  useCodi();
  const view = query.view === 'conversations' ? 'conversations' : 'questions';
  const status = query.status === 'answered' ? 'answered' : 'unanswered';
  const allQuestions = byCourse(Codi.db().questions);
  const aiConversations = byCourse(Codi.db().conversations || []).filter((c) => c.fromAI);
  const counts = { unanswered: allQuestions.filter((x) => x.status === 'unanswered').length, answered: allQuestions.filter((x) => x.status === 'answered').length, ai: aiConversations.length };
  const questionList = allQuestions.filter((x) => x.status === status).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const conversationList = aiConversations.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const sel = view === 'conversations' ? conversationList.find((x) => x.id === query.id) || conversationList[0] : questionList.find((x) => x.id === query.id) || allQuestions.find((x) => x.id === query.id) || questionList[0];

  let detail;
  if (!sel) {
    detail = view === 'conversations'
      ? <div className="card"><Empty icon="message-circle" title="Không có cuộc hội thoại nào từ AI" body="Khi học viên chuyển tiếp câu hỏi từ AI trợ lý đến giảng viên, cuộc trò chuyện sẽ hiện ở đây." /></div>
      : <div className="card"><Empty icon="inbox" title={status === 'unanswered' ? 'Không còn câu hỏi chưa trả lời' : 'Chưa có câu hỏi đã trả lời'} body={status === 'unanswered' ? 'Bạn đã trả lời hết các câu hỏi của học viên.' : 'Các câu hỏi đã được phản hồi sẽ xuất hiện tại đây.'} /></div>;
  } else if (view === 'conversations') {
    const u = Codi.user(sel.learnerId) || NO_USER; const c = Codi.course(sel.courseId);
    const resolved = sel.status === 'resolved';
    const send = (text) => {
      const conv = (Codi.db().conversations || []).find((x) => x.id === sel.id); if (!conv) return false;
      if (conv.status === 'resolved') { Codi.ui.toast('Cuộc hội thoại đã được giải quyết. Vui lòng mở lại cuộc hội thoại để tiếp tục trao đổi.', { type: 'danger' }); return false; }
      conv.messages.push({ from: 'lecturer', userId: me().id, text, at: new Date().toISOString() });
      Codi.notify(conv.learnerId, { title: 'Có trả lời từ giảng viên', body: `${me().name} đã trả lời cuộc hội thoại của bạn.`, link: `/learn/${conv.courseId}${conv.lessonId ? '/' + conv.lessonId : ''}` });
      persist(false); Codi.ui.toast('Đã gửi câu trả lời và thông báo cho học viên.', { type: 'success' });
      return true;
    };
    detail = (
      <section className="card">
        <div className="card-header"><div className="stack-1" style={{ minWidth: 0 }}><span className="xsmall muted od-truncate">{c ? c.title : ''} › {sel.lessonId && c ? (Codi.lesson(c, sel.lessonId) || {}).title : 'Khóa học'}</span>
          <span className="row"><Avatar user={u} size="sm" /><span className="stack-1"><strong className="small">{u.name}</strong><span className="xsmall muted">{fmt.relative(sel.createdAt)}</span></span></span></div>
          <span className={`badge ${resolved ? 'badge-success' : 'badge-warn'}`}>{resolved ? 'Đã giải quyết' : 'Đang mở'}</span></div>
        <div className="card-body stack-4">
          {sel.aiContext && (
            <div className="panel stack-2"><span className="xsmall strong muted row" style={{ gap: 4 }}><Icon name="sparkles" className="icon-sm" /> Ngữ cảnh từ AI trợ lý</span>
              {sel.aiContext.summary && <p className="xsmall">{sel.aiContext.summary}</p>}
              {sel.aiContext.code && <pre className="tc-code mono xsmall">{sel.aiContext.code}</pre>}
              {sel.aiContext.failingTest && <p className="xsmall text-danger"><strong>Test không đạt: </strong>{sel.aiContext.failingTest}</p>}</div>
          )}
          <div className="stack-3"><strong className="xsmall muted">Tin nhắn trao đổi ({sel.messages.length})</strong>
            {sel.messages.map((m, i) => { const staff = m.from !== 'learner'; const mu = staff ? (Codi.user(m.userId) || (m.from === 'lecturer' ? Codi.user(sel.lecturerId) : null) || me()) : u; return (
              <div key={i} className={`tc-msg ${staff ? 'is-staff' : ''}`}><span className="row-between xsmall"><span className="row" style={{ gap: 6 }}><strong>{mu.name}</strong>{staff && <span className="badge badge-accent">{roleLabel(m)}</span>}</span><span className="muted">{fmt.relative(m.at)}</span></span><p className="small" style={{ whiteSpace: 'pre-line' }}>{m.text}</p></div>
            ); })}</div>
          {resolved ? (
            <div className="panel row-between" style={{ flexWrap: 'wrap', gap: 12 }}><span className="row small muted" style={{ gap: 6 }}><Icon name="check-circle" className="icon-sm text-success" /> Cuộc hội thoại này đã được đánh dấu giải quyết. Không thể gửi thêm tin nhắn trừ khi mở lại.</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConversationStatus(sel.id, 'open')}><Icon name="rotate-ccw" className="icon-sm" /> Mở lại cuộc hội thoại</button></div>
          ) : (
            <ReplyForm key={sel.id} id="private-reply" label={`Trả lời ${u.name}`} placeholder="Nhập câu trả lời riêng cho học viên..." onSend={send}
              extra={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setConversationStatus(sel.id, 'resolved')}><Icon name="check-circle" className="icon-sm" /> Đánh dấu đã giải quyết</button>} />
          )}
        </div>
      </section>
    );
  } else {
    const c = Codi.course(sel.courseId); const l = c && Codi.lesson(c, sel.lessonId); const u = Codi.user(sel.userId) || NO_USER;
    const send = (text) => {
      const qn = Codi.db().questions.find((x) => x.id === sel.id); if (!qn) return false;
      qn.replies.push({ userId: me().id, isLecturer: true, text, at: new Date().toISOString() }); qn.status = 'answered';
      Codi.notify(qn.userId, { title: 'Câu hỏi đã có trả lời', body: `${me().name} đã trả lời câu hỏi của bạn.`, link: `/learn/${qn.courseId}/${qn.lessonId}` });
      persist(false); Codi.ui.toast('Đã gửi câu trả lời công khai và thông báo cho học viên.', { type: 'success' });
      Codi.go('/teach/questions?status=answered&id=' + qn.id);
      return true;
    };
    detail = (
      <section className="card">
        <div className="card-header"><div className="stack-1" style={{ minWidth: 0 }}><span className="xsmall muted od-truncate">{c ? c.title : ''} › {l ? l.title : ''}</span>
          <span className="row"><Avatar user={u} size="sm" /><span className="stack-1"><strong className="small">{u.name}</strong><span className="xsmall muted">{fmt.relative(sel.createdAt)}</span></span></span></div>
          <span className={`badge ${sel.status === 'answered' ? 'badge-success' : 'badge-warn'}`}>{sel.status === 'answered' ? 'Đã trả lời' : 'Chưa trả lời'}</span></div>
        <div className="card-body stack-4">
          <p style={{ whiteSpace: 'pre-line' }}>{sel.text}</p>
          {sel.replies.length > 0 && <div className="stack-3"><strong className="xsmall muted">Phản hồi ({sel.replies.length})</strong>
            {sel.replies.map((r, i) => { const ru = Codi.user(r.userId) || { name: '' }; return (
              <div key={i} className={`tc-msg ${r.isLecturer ? 'is-staff' : ''}`}><span className="row-between xsmall"><span className="row" style={{ gap: 6 }}><strong>{ru.name}</strong>{r.isLecturer && <span className="badge badge-accent">Giảng viên</span>}</span><span className="muted">{fmt.relative(r.at)}</span></span><p className="small" style={{ whiteSpace: 'pre-line' }}>{r.text}</p></div>
            ); })}</div>}
          <ReplyForm key={sel.id} id="public-reply" label={`Trả lời ${u.name}`} placeholder="Nhập câu trả lời để giải đáp thắc mắc cho học viên..." help="Câu trả lời sẽ hiển thị công khai trong phần thảo luận của bài học này." onSend={send} />
        </div>
      </section>
    );
  }
  return shell('/teach/questions', <>
    <div className="page-header"><div><h1>Hỏi đáp</h1><p className="muted">{view === 'conversations' ? 'Cuộc hội thoại chuyển tiếp từ AI trợ lý.' : 'Câu hỏi của học viên theo từng bài học.'}</p></div></div>
    {view === 'questions' ? (
      <div className="tabs" role="tablist">{[['unanswered', 'Chưa trả lời'], ['answered', 'Đã trả lời']].map(([k, l]) => (
        <Link key={k} className="tab" role="tab" aria-selected={status === k} to={`/teach/questions?status=${k}&view=questions`}>{l} <span className={`count ${k === 'unanswered' && counts.unanswered ? 'count-accent' : ''}`}>{counts[k]}</span></Link>
      ))}</div>
    ) : <div className="tabs" role="tablist"><Link className="tab" role="tab" aria-selected="true" to="/teach/questions?view=conversations">Từ AI trợ lý <span className="count">{counts.ai}</span></Link></div>}
    <div className="segmented" role="group" aria-label="Nguồn câu hỏi" style={{ marginBottom: 16 }}>
      <button type="button" aria-pressed={view === 'questions'} onClick={() => Codi.go('/teach/questions?view=questions')}>Câu hỏi từ học viên ({counts.unanswered + counts.answered})</button>
      <button type="button" aria-pressed={view === 'conversations'} onClick={() => Codi.go('/teach/questions?view=conversations')}>Cuộc hội thoại AI ({counts.ai})</button></div>
    <div className="split-view tc-split"><div className="split-list">{view === 'conversations'
      ? (conversationList.length ? conversationList.map((x) => { const c = Codi.course(x.courseId); const u = Codi.user(x.learnerId) || NO_USER; return (
        <Link key={x.id} className="split-list-item" to={`/teach/questions?view=conversations&id=${x.id}`} aria-current={sel && sel.id === x.id ? 'true' : undefined}>
          <span className="row-between"><span className="xsmall muted od-truncate">{c ? c.title : ''}</span><span className={`badge ${x.status === 'resolved' ? 'badge-success' : 'badge-warn'}`}>{x.status === 'resolved' ? 'Đã giải quyết' : 'Đang mở'}</span></span>
          <span className="small strong od-clamp-2">{(x.aiContext && x.aiContext.summary) || 'Cuộc trao đổi riêng với giảng viên'}</span><span className="row-between xsmall muted"><span>{u.name}</span><span>{fmt.relative(x.createdAt)}</span></span></Link>
      ); }) : <p className="small muted" style={{ padding: 16 }}>Không có cuộc hội thoại.</p>)
      : (questionList.length ? questionList.map((x) => { const c = Codi.course(x.courseId); const l = c && Codi.lesson(c, x.lessonId); return (
        <Link key={x.id} className="split-list-item" to={`/teach/questions?status=${status}&id=${x.id}&view=questions`} aria-current={sel && sel.id === x.id ? 'true' : undefined}>
          <span className="xsmall muted od-truncate">{c ? c.title : ''} › {l ? l.title : ''}</span><span className="small strong od-clamp-2">{x.text}</span><span className="row-between xsmall muted"><span>{(Codi.user(x.userId) || NO_USER).name}</span><span>{fmt.relative(x.createdAt)}</span></span></Link>
      ); }) : <p className="small muted" style={{ padding: 16 }}>Không có câu hỏi.</p>)}</div>
      <div className="split-detail">{detail}</div></div>
  </>);
}

// ───────────────────────── S28 reviews ─────────────────────────
function ReviewReplyForm({ handle, reviewId }) {
  const r = Codi.db().reviews.find((x) => x.id === reviewId);
  const [text, setText] = useState(r && r.reply ? r.reply.text : '');
  const [err, setErr] = useState(null);
  if (!r) return null;
  const u = Codi.user(r.userId) || NO_USER;
  const save = () => {
    const t = text.trim();
    if (!t) { setErr('Nhập nội dung phản hồi.'); return; }
    if (t.length > REVIEW_MAX) { setErr('Phản hồi không được vượt quá 3000 ký tự.'); return; }
    const cur = Codi.db().reviews.find((x) => x.id === reviewId);
    if (!cur) { setErr('Đánh giá không tồn tại.'); return; }
    cur.reply = { text: t, at: new Date().toISOString() };
    handle.close(); persist(); Codi.ui.toast('Đã đăng phản hồi công khai.', { type: 'success' });
  };
  return <>
    <div className="sheet-body"><div className="stack-4"><p className="small muted">Đánh giá từ {u.name}</p>
      <div className="panel stack-1"><span className="row small"><strong>{u.name}</strong><Stars n={r.stars} /></span><p className="small">{r.text || 'Không có nhận xét.'}</p></div>
      <div className={`field ${err ? 'is-invalid' : ''}`}><label htmlFor="rv-reply">Phản hồi công khai</label><textarea id="rv-reply" rows={5} value={text} placeholder="Cảm ơn học viên và giải đáp góp ý..." onChange={(e) => { setText(e.target.value); setErr(null); }} aria-invalid={!!err} />
        <span className="field-help row-between"><span>Ngắn gọn, cảm ơn và giải đáp góp ý (nếu có).</span><span className={text.trim().length > REVIEW_MAX ? 'text-danger' : ''}>{text.trim().length}/{REVIEW_MAX}</span></span><FieldError>{err}</FieldError></div></div></div>
    <div className="sheet-footer"><button type="button" className="btn btn-ghost" onClick={() => handle.close()}>Huỷ</button><button type="button" className="btn btn-primary" onClick={save}>Đăng phản hồi</button></div>
  </>;
}
const openReply = (r) => Codi.ui.sheet({ title: r.reply ? 'Sửa phản hồi' : 'Phản hồi đánh giá', raw: true, body: (h) => <ReviewReplyForm handle={h} reviewId={r.id} /> });
async function deleteReply(r) {
  const res = await Codi.ui.confirm({ title: 'Xoá phản hồi?', consequence: 'Phản hồi công khai sẽ bị gỡ khỏi trang khoá học. Đánh giá của học viên vẫn giữ nguyên.', reversible: 'Bạn có thể viết phản hồi mới bất cứ lúc nào.', confirmLabel: 'Xoá phản hồi', danger: true });
  if (!res.ok) return;
  const cur = Codi.db().reviews.find((x) => x.id === r.id);
  if (!cur) { Codi.ui.toast('Đánh giá không tồn tại.', { type: 'danger' }); return; }
  cur.reply = null; persist(); Codi.ui.toast('Đã xoá phản hồi.', { type: 'success' });
}

export function ReviewsPage({ query }) {
  useCodi();
  const filter = query.filter === 'unreplied' ? 'unreplied' : 'all';
  const all = byCourse(Codi.db().reviews).filter(isVisibleReview).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const list = all.filter((r) => filter === 'all' || !r.reply);
  return shell('/teach/reviews', <>
    <div className="page-header"><div><h1>Đánh giá</h1><p className="muted">Phản hồi của bạn hiển thị công khai dưới đánh giá trên trang khoá học.</p></div></div>
    <div className="segmented" role="group" aria-label="Lọc đánh giá" style={{ marginBottom: 16 }}>
      <button type="button" aria-pressed={filter === 'all'} onClick={() => Codi.go('/teach/reviews')}>Tất cả ({all.length})</button>
      <button type="button" aria-pressed={filter === 'unreplied'} onClick={() => Codi.go('/teach/reviews?filter=unreplied')}>Chưa phản hồi ({all.filter((r) => !r.reply).length})</button></div>
    {list.length ? <ul className="list stack-3">{list.map((r) => { const u = Codi.user(r.userId) || NO_USER; const c = Codi.course(r.courseId); return (
      <li key={r.id} className="card"><div className="card-body stack-2">
        <div className="row" style={{ flexWrap: 'wrap' }}><Avatar user={u} size="sm" /><strong className="small">{u.name}</strong><span role="img" aria-label={`${r.stars} trên 5 sao`}><Stars n={r.stars} /></span><span className="xsmall muted">{fmt.date(r.createdAt)} · {c ? c.title : ''}</span></div>
        {r.text ? <p>{r.text}</p> : <p className="small muted">Không có nhận xét, chỉ chấm sao.</p>}
        {r.reply ? (
          <div className="panel stack-1"><span className="row xsmall"><strong>Phản hồi của bạn</strong><span className="badge badge-success">Đã phản hồi</span><span className="muted">{fmt.date(r.reply.at)}</span></span><p className="small">{r.reply.text}</p>
            <div className="row"><button type="button" className="btn btn-ghost btn-sm" onClick={() => openReply(r)}>Sửa</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteReply(r)}>Xoá phản hồi</button></div></div>
        ) : <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => openReply(r)}><Icon name="message-circle" className="icon-sm" /> Phản hồi</button>}
      </div></li>
    ); })}</ul> : <div className="card"><Empty icon="star" title={filter === 'unreplied' ? 'Bạn đã phản hồi mọi đánh giá' : 'Chưa có đánh giá nào'} body={filter === 'unreplied' ? 'Không còn đánh giá nào đang chờ phản hồi từ bạn.' : 'Đánh giá từ học viên đã mua khoá học sẽ xuất hiện tại đây.'} /></div>}
  </>);
}
