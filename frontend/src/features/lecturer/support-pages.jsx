// S27 Q&A inbox (public lesson questions + private conversations escalated from the AI assistant) and S28 reviews,
// on Codi's questions/actions.ts and reviews/actions.ts: replies 5–5000 chars; a conversation resolves only while
// open and after a lecturer reply; resolved threads are locked until reopened; review replies 1–3000 chars; only
// visible reviews are listed. The backend sends the learner notifications.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRevealOnSelect } from './reveal-on-select';
import { Codi, useCodi } from '../../lib/codi';
import { api } from '../../lib/api';
import { Alert, Avatar, Empty, Icon, Stars } from '../../components/ui/primitives';
import { shell, FieldError, Loading, LoadError } from './teach-api';
import { act, reloadMine } from './teach-data';

const { fmt } = Codi;
const REPLY_MIN = 5; const REPLY_MAX = 5000; const REVIEW_MAX = 3000;
const person = (name, image) => ({ name: name || 'Học viên', image: image || null });

/** Real validateReplyBody: trimmed 5–5000 characters. */
export function replyProblem(text) {
  const t = String(text || '').trim();
  if (t.length < REPLY_MIN) return 'Câu trả lời cần ít nhất 5 ký tự.';
  if (t.length > REPLY_MAX) return 'Câu trả lời không được vượt quá 5000 ký tự.';
  return null;
}

/** Loads one backend action result and refetches when `key` changes. */
function useAction(run, key) {
  const [st, setSt] = useState({ data: null, error: null });
  const load = useCallback(async () => {
    setSt((x) => ({ ...x, error: null }));
    try { setSt({ data: await run(), error: null }); } catch (error) { setSt((x) => ({ ...x, error })); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { ...st, reload: load };
}

/**
 * AI draft for a reply: POST /api/lecturer/courses/:courseId/questions/ai-reply. It only fills the reply box and lists
 * the lessons it used; nothing reaches the learner until the lecturer presses "Gửi trả lời".
 */
async function requestReplyDraft(draft) {
  try {
    const r = await api.post(`/api/lecturer/courses/${encodeURIComponent(draft.courseId)}/questions/ai-reply`, { kind: draft.kind, id: draft.id });
    if (r && r.status === 'ok' && typeof r.text === 'string') return { state: 'ok', text: r.text, sources: Array.isArray(r.sources) ? r.sources : [] };
    return { state: 'info', message: (r && r.message) || 'Không tìm thấy đoạn bài học liên quan. Hãy trả lời thủ công.' };
  } catch (e) {
    return { state: 'error', message: (e && e.message) || 'AI chưa gợi ý được. Bạn vẫn trả lời thủ công bình thường.' };
  }
}

function ReplyForm({ id, label, placeholder, help, onSend, extra, draft }) {
  const [err, setErr] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [ai, setAi] = useState({ state: 'idle', message: '', sources: [] });
  const suggest = async () => {
    if (ai.state === 'loading') return;
    if (text.trim()) {
      const ok = await Codi.ui.confirm({ title: 'Thay nội dung đang soạn?', body: 'Bản nháp AI sẽ thay nội dung bạn đã nhập trong ô trả lời.', confirmLabel: 'Thay bằng gợi ý' });
      if (!ok.ok) return;
    }
    setAi({ state: 'loading', message: '', sources: [] });
    const r = await requestReplyDraft(draft);
    if (r.state === 'ok') { setText(r.text); setErr(null); setAi({ state: 'ok', message: '', sources: r.sources }); return; }
    setAi({ state: r.state, message: r.message, sources: [] });
  };
  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    const p = replyProblem(text);
    if (p) { setErr(p); return; }
    setSending(true);
    const res = await onSend(text.trim());
    setSending(false);
    if (res !== true) { setErr(typeof res === 'string' ? res : 'Không thể gửi câu trả lời.'); return; }
    setErr(null); setText(''); setAi({ state: 'idle', message: '', sources: [] });
  };
  return (
    <form className="stack-3 tc-reply-form" onSubmit={submit} noValidate aria-busy={sending}>
      <label className="field-label" htmlFor={id}>{label}</label>
      {err && <Alert type="danger" body={err} />}
      {ai.state === 'loading' && (
        <div className="panel row" role="status" aria-live="polite" style={{ gap: 10 }}><span className="typing" aria-hidden="true"><i /><i /><i /></span>
          <span className="small">AI đang đọc nội dung khoá học để soạn bản nháp. Thường mất 5 đến 15 giây.</span></div>
      )}
      {ai.state === 'ok' && (
        <div className="panel stack-1" role="status"><span className="xsmall row" style={{ gap: 4 }}><Icon name="sparkles" className="icon-sm" /><strong>Bản nháp do AI soạn, chưa gửi.</strong> Đọc và sửa trước khi bấm &quot;Gửi trả lời&quot;.</span>
          {ai.sources.length > 0 && (
            <div className="xsmall stack-1"><span className="muted">Dựa trên các bài học đã xuất bản:</span>
              <ul className="ai-sources">{ai.sources.map((x) => <li key={x.href}><a href={x.href} target="_blank" rel="noopener noreferrer">{x.title}</a></li>)}</ul></div>
          )}</div>
      )}
      {ai.state === 'info' && <Alert type="info" title="Chưa có đoạn bài học phù hợp" body={ai.message} />}
      {ai.state === 'error' && <Alert type="danger" title="AI chưa soạn được bản nháp" body={ai.message} actions={<button type="button" className="btn btn-secondary btn-sm" onClick={suggest}><Icon name="refresh" className="icon-sm" /> Thử lại</button>} />}
      <textarea id={id} className="textarea" name="text" rows={4} value={text} placeholder={placeholder} maxLength={REPLY_MAX + 500} onChange={(e) => { setText(e.target.value); setErr(null); }} aria-invalid={!!err} />
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        {help ? <span className="xsmall muted">{help}</span> : <span />}
        <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>{extra}{draft && <button type="button" className="btn btn-ghost btn-sm" onClick={suggest} disabled={sending || ai.state === 'loading'} aria-busy={ai.state === 'loading'} title="AI soạn bản nháp từ nội dung khoá học; bạn xem lại rồi tự gửi"><Icon name={ai.state === 'loading' ? 'loader' : 'sparkles'} className="icon-sm" /> {ai.state === 'loading' ? 'AI đang soạn…' : 'Gợi ý bằng AI'}</button>}<button className="btn btn-primary" type="submit" disabled={sending}><Icon name="send" className="icon-sm" /> {sending ? 'Đang gửi...' : 'Gửi trả lời'}</button></span>
      </div>
    </form>
  );
}

/** Runs a { success, error } action; returns true or the error message. */
async function run(name, input) {
  try {
    const r = await act('questions', name, input);
    if (r && r.success === false) return r.error || 'Không thể thực hiện thao tác.';
    reloadMine();
    return true;
  } catch (e) {
    return (e && e.message) || 'Không thể thực hiện thao tác.';
  }
}

export function QuestionsPage({ query }) {
  useCodi();
  const detailRef = useRevealOnSelect(query.id || null);
  const view = query.view === 'conversations' ? 'conversations' : 'questions';
  const status = query.status === 'answered' ? 'answered' : 'unanswered';
  const id = query.id ? Number(query.id) : undefined;
  const q = useAction(() => act('questions', 'getLecturerQuestionsData', { view, status, ...(id ? { id } : {}) }), `${view}|${status}|${id || ''}`);
  const head = <div className="page-header"><div><h1>Hỏi đáp</h1><p className="muted">{view === 'conversations' ? 'Cuộc hội thoại chuyển tiếp từ AI trợ lý.' : 'Câu hỏi của học viên theo từng bài học.'}</p></div></div>;
  if (!q.data) return shell('/teach/questions', <>{head}{q.error ? <LoadError error={q.error} onRetry={q.reload} /> : <Loading rows={5} />}</>);

  const d = q.data;
  const counts = { unanswered: d.counts.unanswered, answered: d.counts.answered, ai: d.counts.aiConversations };
  const questionList = d.questions || [];
  const conversationList = d.conversations || [];
  const sel = view === 'conversations' ? d.selectedConversation : d.selectedQuestion;

  const setConversationStatus = async (to) => {
    if (to === 'resolved' && !(sel.messages || []).some((m) => m.isLecturer)) { Codi.ui.toast('Hãy trả lời học viên trước khi đánh dấu đã giải quyết.', { type: 'danger' }); return; }
    const r = await run(to === 'resolved' ? 'resolveConversation' : 'reopenConversation', { conversationId: sel.id });
    if (r !== true) { Codi.ui.toast(r, { type: 'danger' }); return; }
    Codi.ui.toast(to === 'resolved' ? 'Đã đánh dấu cuộc hội thoại đã giải quyết.' : 'Đã mở lại cuộc hội thoại.', { type: 'success' });
    q.reload();
  };

  let detail;
  if (!sel) {
    detail = view === 'conversations'
      ? <div className="card"><Empty icon="message-circle" title="Không có cuộc hội thoại nào từ AI" body="Khi học viên chuyển tiếp câu hỏi từ AI trợ lý đến giảng viên, cuộc trò chuyện sẽ hiện ở đây." /></div>
      : <div className="card"><Empty icon="inbox" title={status === 'unanswered' ? 'Không còn câu hỏi chưa trả lời' : 'Chưa có câu hỏi đã trả lời'} body={status === 'unanswered' ? 'Bạn đã trả lời hết các câu hỏi của học viên.' : 'Các câu hỏi đã được phản hồi sẽ xuất hiện tại đây.'} /></div>;
  } else if (view === 'conversations') {
    const u = person(sel.learnerName, sel.learnerAvatar);
    const resolved = sel.status === 'resolved';
    const send = async (text) => {
      if (resolved) return 'Cuộc hội thoại đã được giải quyết. Vui lòng mở lại cuộc hội thoại để tiếp tục trao đổi.';
      const r = await run('replyToPrivateConversation', { conversationId: sel.id, text });
      if (r === true) { Codi.ui.toast('Đã gửi câu trả lời và thông báo cho học viên.', { type: 'success' }); q.reload(); }
      return r;
    };
    const messages = sel.messages || [];
    detail = (
      <section className="card">
        <div className="card-header"><div className="stack-1" style={{ minWidth: 0 }}><span className="xsmall muted od-truncate">{sel.courseTitle || ''} › {sel.lessonTitle || 'Khoá học'}</span>
          <span className="row"><Avatar user={u} size="sm" /><span className="stack-1"><strong className="small">{u.name}</strong><span className="xsmall muted">{fmt.relative(sel.createdAt)}</span></span></span></div>
          <span className={`badge ${resolved ? 'badge-success' : 'badge-warn'}`}>{resolved ? 'Đã giải quyết' : 'Đang mở'}</span></div>
        <div className="card-body stack-4">
          {sel.aiContext && (
            <div className="panel stack-2"><span className="xsmall strong muted row" style={{ gap: 4 }}><Icon name="sparkles" className="icon-sm" /> Ngữ cảnh từ AI trợ lý</span>
              {sel.aiContext.summary && <p className="xsmall">{sel.aiContext.summary}</p>}
              {sel.aiContext.code && <pre className="tc-code mono xsmall">{sel.aiContext.code}</pre>}
              {sel.aiContext.failingTest && <p className="xsmall text-danger"><strong>Test không đạt: </strong>{sel.aiContext.failingTest}</p>}</div>
          )}
          <div className="stack-3"><strong className="xsmall muted">Tin nhắn trao đổi ({messages.length})</strong>
            {messages.map((m) => (
              <div key={m.id} className={`tc-msg ${m.isLecturer ? 'is-staff' : ''}`}><span className="row-between xsmall"><span className="row" style={{ gap: 6 }}><strong>{m.authorName || ''}</strong>{m.isLecturer && <span className="badge badge-accent">Giảng viên</span>}</span><span className="muted">{fmt.relative(m.createdAt)}</span></span><p className="small" style={{ whiteSpace: 'pre-line' }}>{m.body}</p></div>
            ))}</div>
          {resolved ? (
            <div className="panel row-between" style={{ flexWrap: 'wrap', gap: 12 }}><span className="row small muted" style={{ gap: 6 }}><Icon name="check-circle" className="icon-sm text-success" /> Cuộc hội thoại này đã được đánh dấu giải quyết. Không thể gửi thêm tin nhắn trừ khi mở lại.</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConversationStatus('open')}><Icon name="rotate-ccw" className="icon-sm" /> Mở lại cuộc hội thoại</button></div>
          ) : (
            <ReplyForm key={sel.id} id="private-reply" label={`Trả lời ${u.name}`} placeholder="Nhập câu trả lời riêng cho học viên..." onSend={send} draft={{ courseId: sel.courseId, kind: 'conversation', id: sel.id }}
              extra={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setConversationStatus('resolved')}><Icon name="check-circle" className="icon-sm" /> Đánh dấu đã giải quyết</button>} />
          )}
        </div>
      </section>
    );
  } else {
    const u = person(sel.authorName, sel.authorAvatar);
    const send = async (text) => {
      const r = await run('replyToPublicQuestion', { questionId: sel.id, text });
      if (r === true) { Codi.ui.toast('Đã gửi câu trả lời công khai và thông báo cho học viên.', { type: 'success' }); Codi.go('/teach/questions?status=answered&id=' + sel.id); }
      return r;
    };
    const replies = sel.replies || [];
    detail = (
      <section className="card">
        <div className="card-header"><div className="stack-1" style={{ minWidth: 0 }}><span className="xsmall muted od-truncate">{sel.courseTitle || ''} › {sel.lessonTitle || ''}</span>
          <span className="row"><Avatar user={u} size="sm" /><span className="stack-1"><strong className="small">{u.name}</strong><span className="xsmall muted">{fmt.relative(sel.createdAt)}</span></span></span></div>
          <span className={`badge ${sel.status === 'answered' ? 'badge-success' : 'badge-warn'}`}>{sel.status === 'answered' ? 'Đã trả lời' : 'Chưa trả lời'}</span></div>
        <div className="card-body stack-4">
          <p style={{ whiteSpace: 'pre-line' }}>{sel.body}</p>
          {replies.length > 0 && <div className="stack-3"><strong className="xsmall muted">Phản hồi ({replies.length})</strong>
            {replies.map((r) => (
              <div key={r.id} className={`tc-msg ${r.isLecturer ? 'is-staff' : ''}`}><span className="row-between xsmall"><span className="row" style={{ gap: 6 }}><strong>{r.authorName || ''}</strong>{r.isLecturer && <span className="badge badge-accent">Giảng viên</span>}</span><span className="muted">{fmt.relative(r.createdAt)}</span></span><p className="small" style={{ whiteSpace: 'pre-line' }}>{r.body}</p></div>
            ))}</div>}
          <ReplyForm key={sel.id} id="public-reply" label={`Trả lời ${u.name}`} placeholder="Nhập câu trả lời để giải đáp thắc mắc cho học viên..." help="Câu trả lời sẽ hiển thị công khai trong phần thảo luận của bài học này." onSend={send} draft={{ courseId: sel.courseId, kind: 'question', id: sel.id }} />
        </div>
      </section>
    );
  }
  return shell('/teach/questions', <>
    {head}
    {view === 'questions' ? (
      <div className="tabs" role="tablist">{[['unanswered', 'Chưa trả lời'], ['answered', 'Đã trả lời']].map(([k, l]) => (
        <Link key={k} className="tab" role="tab" aria-selected={status === k} to={`/teach/questions?status=${k}&view=questions`}>{l} <span className={`count ${k === 'unanswered' && counts.unanswered ? 'count-accent' : ''}`}>{counts[k]}</span></Link>
      ))}</div>
    ) : <div className="tabs" role="tablist"><Link className="tab" role="tab" aria-selected="true" to="/teach/questions?view=conversations">Từ AI trợ lý <span className="count">{counts.ai}</span></Link></div>}
    <div className="segmented" role="group" aria-label="Nguồn câu hỏi" style={{ marginBottom: 16 }}>
      <button type="button" aria-pressed={view === 'questions'} onClick={() => Codi.go('/teach/questions?view=questions')}>Câu hỏi từ học viên ({counts.unanswered + counts.answered})</button>
      <button type="button" aria-pressed={view === 'conversations'} onClick={() => Codi.go('/teach/questions?view=conversations')}>Cuộc hội thoại AI ({counts.ai})</button></div>
    <div className="split-view tc-split"><div className="split-list">{view === 'conversations'
      ? (conversationList.length ? conversationList.map((x) => (
        <Link key={x.id} className="split-list-item" to={`/teach/questions?view=conversations&id=${x.id}`} aria-current={sel && sel.id === x.id ? 'true' : undefined}>
          <span className="row-between"><span className="xsmall muted od-truncate">{x.courseTitle || ''}</span><span className={`badge ${x.status === 'resolved' ? 'badge-success' : 'badge-warn'}`}>{x.status === 'resolved' ? 'Đã giải quyết' : 'Đang mở'}</span></span>
          <span className="small strong od-clamp-2">{(x.aiContext && x.aiContext.summary) || 'Cuộc trao đổi riêng với giảng viên'}</span><span className="row-between xsmall muted"><span>{x.learnerName || 'Học viên'}</span><span>{fmt.relative(x.createdAt)}</span></span></Link>
      )) : <p className="small muted" style={{ padding: 16 }}>Không có cuộc hội thoại.</p>)
      : (questionList.length ? questionList.map((x) => (
        <Link key={x.id} className="split-list-item" to={`/teach/questions?status=${status}&id=${x.id}&view=questions`} aria-current={sel && sel.id === x.id ? 'true' : undefined}>
          <span className="xsmall muted od-truncate">{x.courseTitle || ''} › {x.lessonTitle || ''}</span><span className="small strong od-clamp-2">{x.body}</span><span className="row-between xsmall muted"><span>{x.authorName || 'Học viên'}</span><span>{fmt.relative(x.createdAt)}</span></span></Link>
      )) : <p className="small muted" style={{ padding: 16 }}>Không có câu hỏi.</p>)}</div>
      <div className="split-detail" ref={detailRef}>{detail}</div></div>
  </>);
}

// ───────────────────────── S28 reviews ─────────────────────────
function ReviewReplyForm({ handle, review, onDone }) {
  const r = review;
  const [text, setText] = useState(r.lecturerReply || '');
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const u = person(r.learnerName, r.learnerAvatar);
  const save = async () => {
    const t = text.trim();
    if (!t) { setErr('Nhập nội dung phản hồi.'); return; }
    if (t.length > REVIEW_MAX) { setErr('Phản hồi không được vượt quá 3000 ký tự.'); return; }
    setSaving(true);
    let res;
    try { res = await act('reviews', 'replyToCourseReview', { reviewId: r.id, replyText: t }); } catch (e) { res = { success: false, error: e.message }; }
    setSaving(false);
    if (!res || !res.success) { setErr((res && res.error) || 'Không thể đăng phản hồi.'); return; }
    handle.close(); reloadMine(); onDone();
    Codi.ui.toast('Đã đăng phản hồi công khai.', { type: 'success' });
  };
  return <>
    <div className="sheet-body"><div className="stack-4"><p className="small muted">Đánh giá từ {u.name}</p>
      <div className="panel stack-1"><span className="row small"><strong>{u.name}</strong><Stars n={r.rating} /></span><p className="small">{r.text || 'Không có nhận xét.'}</p></div>
      <div className={`field ${err ? 'is-invalid' : ''}`}><label htmlFor="rv-reply">Phản hồi công khai</label><textarea id="rv-reply" rows={5} value={text} placeholder="Cảm ơn học viên và giải đáp góp ý..." onChange={(e) => { setText(e.target.value); setErr(null); }} aria-invalid={!!err} />
        <span className="field-help row-between"><span>Ngắn gọn, cảm ơn và giải đáp góp ý (nếu có).</span><span className={text.trim().length > REVIEW_MAX ? 'text-danger' : ''}>{text.trim().length}/{REVIEW_MAX}</span></span><FieldError>{err}</FieldError></div></div></div>
    <div className="sheet-footer"><button type="button" className="btn btn-ghost" onClick={() => handle.close()}>Huỷ</button><button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang đăng...' : 'Đăng phản hồi'}</button></div>
  </>;
}
const openReply = (r, onDone) => Codi.ui.sheet({ title: r.lecturerReply ? 'Sửa phản hồi' : 'Phản hồi đánh giá', raw: true, body: (h) => <ReviewReplyForm handle={h} review={r} onDone={onDone} /> });
async function deleteReply(r, onDone) {
  const res = await Codi.ui.confirm({ title: 'Xoá phản hồi?', consequence: 'Phản hồi công khai sẽ bị gỡ khỏi trang khoá học. Đánh giá của học viên vẫn giữ nguyên.', reversible: 'Bạn có thể viết phản hồi mới bất cứ lúc nào.', confirmLabel: 'Xoá phản hồi', danger: true });
  if (!res.ok) return;
  let out;
  try { out = await act('reviews', 'deleteCourseReviewReply', { reviewId: r.id }); } catch (e) { out = { success: false, error: e.message }; }
  if (!out || !out.success) { Codi.ui.toast((out && out.error) || 'Không thể xoá phản hồi.', { type: 'danger' }); return; }
  reloadMine(); onDone();
  Codi.ui.toast('Đã xoá phản hồi.', { type: 'success' });
}

export function ReviewsPage({ query }) {
  useCodi();
  const filter = query.filter === 'unreplied' ? 'unreplied' : 'all';
  const q = useAction(() => act('reviews', 'getLecturerReviewsData', { filter }), filter);
  const head = <div className="page-header"><div><h1>Đánh giá</h1><p className="muted">Phản hồi của bạn hiển thị công khai dưới đánh giá trên trang khoá học.</p></div></div>;
  if (!q.data) return shell('/teach/reviews', <>{head}{q.error ? <LoadError error={q.error} onRetry={q.reload} /> : <Loading rows={4} />}</>);
  const d = q.data; const list = d.reviews || [];
  return shell('/teach/reviews', <>
    {head}
    <div className="segmented" role="group" aria-label="Lọc đánh giá" style={{ marginBottom: 16 }}>
      <button type="button" aria-pressed={filter === 'all'} onClick={() => Codi.go('/teach/reviews')}>Tất cả ({d.counts.all})</button>
      <button type="button" aria-pressed={filter === 'unreplied'} onClick={() => Codi.go('/teach/reviews?filter=unreplied')}>Chưa phản hồi ({d.counts.unreplied})</button></div>
    {list.length ? <ul className="list stack-3">{list.map((r) => { const u = person(r.learnerName, r.learnerAvatar); return (
      <li key={r.id} className="card"><div className="card-body stack-2">
        <div className="row" style={{ flexWrap: 'wrap' }}><Avatar user={u} size="sm" /><strong className="small">{u.name}</strong><span role="img" aria-label={`${r.rating} trên 5 sao`}><Stars n={r.rating} /></span><span className="xsmall muted">{fmt.date(r.createdAt)} · {r.courseTitle || ''}</span></div>
        {r.text ? <p>{r.text}</p> : <p className="small muted">Không có nhận xét, chỉ chấm sao.</p>}
        {r.lecturerReply ? (
          <div className="panel stack-1"><span className="row xsmall"><strong>Phản hồi của bạn</strong><span className="badge badge-success">Đã phản hồi</span><span className="muted">{r.repliedAt ? fmt.date(r.repliedAt) : ''}</span></span><p className="small">{r.lecturerReply}</p>
            <div className="row"><button type="button" className="btn btn-ghost btn-sm" onClick={() => openReply(r, q.reload)}>Sửa</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteReply(r, q.reload)}>Xoá phản hồi</button></div></div>
        ) : <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => openReply(r, q.reload)}><Icon name="message-circle" className="icon-sm" /> Phản hồi</button>}
      </div></li>
    ); })}</ul> : <div className="card"><Empty icon="star" title={filter === 'unreplied' ? 'Bạn đã phản hồi mọi đánh giá' : 'Chưa có đánh giá nào'} body={filter === 'unreplied' ? 'Không còn đánh giá nào đang chờ phản hồi từ bạn.' : 'Đánh giá từ học viên đã mua khoá học sẽ xuất hiện tại đây.'} /></div>}
  </>);
}
