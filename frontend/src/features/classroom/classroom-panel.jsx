/**
 * AI classroom side window for a lesson video (ported from the DRE multi-agent classroom).
 *
 *   <ClassroomPanel courseId lessonId lessonTitle videoApi />
 *
 * Props
 * - courseId, lessonId: the lesson the learner is studying (same access rules as the lesson player).
 * - lessonTitle: shown in the header while the classroom loads.
 * - videoApi (optional): { currentTime(): number, pause(): void, play(): void, onTime(cb: (seconds) => void): unsubscribe }.
 *   When given, the panel pauses the video as playback crosses a checkpoint the learner has not finished, and
 *   "Tiếp tục xem video" resumes it. Without it the checkpoints are opened from the list.
 *
 * Flow at a checkpoint: Cô Lam asks → the learner answers → Bo challenges → the learner rebuts → Bo concedes, or
 * pushes back and Cô Lam gives hint 1 (then hint 2 and the closing) → Cô Lam closes with the key idea.
 * The "Trò chuyện" tab is the classroom chat: the learner picks who to ask (Cả lớp or one character).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../lib/use-api';
import { Alert, Empty, Icon } from '../../components/ui/primitives';
import { RichText } from './rich-text';
import { CLASSMATES, CLASSMATE_IDS, ClassmateAvatar } from './avatars';
import { classroomApi } from './classroom-api';
import { checkpointToPause } from './checkpoint-trigger';
import './classroom.css';

const clock = (s) => {
  const t = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const finished = (session) => !!session && (session.phase === 'closed' || session.phase === 'skipped');
const KIND_LABEL = { hint: 'Gợi ý', closing: 'Chốt kiến thức', challenge: 'Thách thức', concede: 'Nhận thua', pushback: 'Cãi lại' };
const RECIPIENTS = [{ id: 'all', name: 'Cả lớp', role: 'Ai hợp nhất sẽ trả lời' }, ...CLASSMATE_IDS.map((id) => ({ id, ...CLASSMATES[id] }))];

function Bubble({ m }) {
  if (m.agent === 'learner') {
    return (
      <li className="cr-msg is-learner">
        <div className="cr-bubble"><span className="cr-who">Bạn</span><p className="cr-text">{m.text}</p></div>
      </li>
    );
  }
  const meta = CLASSMATES[m.agent];
  if (!meta) return null;
  return (
    <li className={`cr-msg ${m.kind === 'closing' ? 'is-closing' : ''}`}>
      <ClassmateAvatar id={m.agent} size={32} />
      <div className="cr-bubble">
        <span className="cr-who">{meta.name}{KIND_LABEL[m.kind] && <span className="badge badge-neutral">{KIND_LABEL[m.kind]}</span>}</span>
        <RichText text={m.text} className="cr-text" />
      </div>
    </li>
  );
}

function Typing({ agent }) {
  const meta = CLASSMATES[agent];
  if (!meta) return null;
  return (
    <li className="cr-msg is-typing" aria-live="polite">
      <ClassmateAvatar id={agent} size={32} state="thinking" />
      <div className="cr-bubble"><span className="cr-who">{meta.name}</span><span className="cr-dots" aria-label={`${meta.name} đang trả lời`}><i /><i /><i /></span></div>
    </li>
  );
}

function ActionError({ error, onRetry, onDismiss }) {
  if (!error) return null;
  return (
    <Alert type="danger" title="Lớp học chưa trả lời được" body={error.message}
      actions={<>
        {onRetry && <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}><Icon name="refresh" className="icon-sm" /> Thử lại</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>Đóng</button>
      </>} />
  );
}

export function ClassroomPanel({ courseId, lessonId, lessonTitle, videoApi }) {
  const { data, loading, error, reload, setData } = useApi(courseId && lessonId ? classroomApi.url(courseId, lessonId) : null);
  const [tab, setTab] = useState('debate');
  const [activeId, setActiveId] = useState(null);

  const checkpoints = useMemo(() => (data && data.checkpoints) || [], [data]);
  const sessions = (data && data.sessions) || {};
  const setSession = useCallback((cpId, session) => setData((d) => (d ? { ...d, sessions: { ...d.sessions, [cpId]: session } } : d)), [setData]);

  // The newest data is read from refs inside the video subscription, so it is not re-subscribed on every turn.
  const dataRef = useRef(data);
  dataRef.current = data;
  const openRef = useRef(null);

  // Pause when playback crosses a checkpoint the learner has not answered or skipped. On a resume (the first tick
  // after the lesson opens) one already at or before the resume point was passed without an answer, so it is still
  // due; answered and skipped ones are stored on the server session and never stop the video again.
  useEffect(() => {
    if (!videoApi || typeof videoApi.onTime !== 'function') return undefined;
    let last = null;
    const unsubscribe = videoApi.onTime((t) => {
      const d = dataRef.current;
      if (!d) return;
      const prev = last;
      last = t;
      const hit = checkpointToPause(d.checkpoints, d.sessions, prev, t);
      if (!hit) return;
      try { videoApi.pause(); } catch { /* the player may already be paused */ }
      if (openRef.current) openRef.current(hit.id);
    });
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [videoApi]);

  const header = (
    <header className="cr-head">
      <div className="cr-head-text">
        <h2 className="cr-title">Lớp học AI</h2>
        <p className="cr-sub">{(data && data.lesson && data.lesson.title) || lessonTitle}</p>
      </div>
      <div className="cr-stack" role="img" aria-label="Cô Lam, Bo, Trí, Linh Chi, Minh Khang và Trợ giảng An">
        {CLASSMATE_IDS.map((id) => <ClassmateAvatar key={id} id={id} size={30} />)}
      </div>
    </header>
  );

  if (!data) {
    return (
      <section className="cr-panel" aria-label="Lớp học AI" aria-busy={loading || undefined}>
        {header}
        <div className="cr-body">
          {error
            ? <Alert type="danger" title="Không tải được lớp học" body={error.message}
                actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => reload()}><Icon name="refresh" className="icon-sm" /> Thử lại</button>} />
            : <div className="stack-2" role="status"><span className="sr-only">Đang tải lớp học…</span>
                <div className="skeleton skeleton-line" style={{ height: 44 }} /><div className="skeleton skeleton-line" style={{ height: 120 }} /></div>}
        </div>
      </section>
    );
  }

  const done = checkpoints.filter((c) => finished(sessions[c.id])).length;
  return (
    <section className="cr-panel" aria-label="Lớp học AI">
      {header}
      <div className="tabs cr-tabs" role="tablist" aria-label="Lớp học AI">
        <button type="button" role="tab" id="cr-tab-debate" aria-controls="cr-pane-debate" aria-selected={tab === 'debate'} className="tab" onClick={() => setTab('debate')}>
          <Icon name="flag" className="icon-sm" /> Điểm dừng{checkpoints.length ? <span className="badge badge-neutral">{done}/{checkpoints.length}</span> : null}
        </button>
        <button type="button" role="tab" id="cr-tab-chat" aria-controls="cr-pane-chat" aria-selected={tab === 'chat'} className="tab" onClick={() => setTab('chat')}>
          <Icon name="message-circle" className="icon-sm" /> Trò chuyện
        </button>
      </div>
      <div className="cr-body">
        <div role="tabpanel" id="cr-pane-debate" aria-labelledby="cr-tab-debate" hidden={tab !== 'debate'}>
          <DebatePane courseId={courseId} lessonId={lessonId} checkpoints={checkpoints} sessions={sessions} setSession={setSession}
            activeId={activeId} setActiveId={setActiveId} openRef={openRef} onReveal={() => setTab('debate')} videoApi={videoApi}
            reload={reload} onChat={() => setTab('chat')} />
        </div>
        <div role="tabpanel" id="cr-pane-chat" aria-labelledby="cr-tab-chat" hidden={tab !== 'chat'}>
          <ChatPane courseId={courseId} lessonId={lessonId} videoApi={videoApi} />
        </div>
      </div>
    </section>
  );
}

function DebatePane({ courseId, lessonId, checkpoints, sessions, setSession, activeId, setActiveId, openRef, onReveal, videoApi, reload, onChat }) {
  const [busy, setBusy] = useState(null); // { agent } of the character expected to speak
  const [err, setErr] = useState(null); // { message, retry }
  const [choice, setChoice] = useState(null);
  const [draft, setDraft] = useState('');
  const threadEnd = useRef(null);

  const active = checkpoints.find((c) => c.id === activeId) || null;
  const session = active ? sessions[active.id] : null;

  const run = useCallback(async (agent, fn) => {
    setBusy({ agent });
    setErr(null);
    try {
      await fn();
    } catch (e) {
      if (e && e.status === 409) reload();
      setErr({ message: (e && e.message) || 'Vui lòng thử lại.', retry: e && e.status === 409 ? null : () => run(agent, fn) });
    } finally {
      setBusy(null);
    }
  }, [reload]);

  const start = useCallback((cpId) => run('colam', async () => {
    const res = await classroomApi.start(courseId, lessonId, cpId);
    setSession(cpId, res.session);
    setChoice(null);
    setDraft('');
  }), [run, courseId, lessonId, setSession]);

  const open = useCallback((cpId) => {
    setActiveId(cpId);
    onReveal();
    const s = sessions[cpId];
    if (!s) start(cpId);
  }, [sessions, setActiveId, onReveal, start]);
  openRef.current = open;

  const act = (agent, body) => run(agent, async () => {
    const res = await classroomApi.act(courseId, lessonId, session.id, { ...body, version: session.version });
    setSession(active.id, res.session);
    setDraft('');
    setChoice(null);
  });

  useEffect(() => {
    if (threadEnd.current && typeof threadEnd.current.scrollIntoView === 'function') threadEnd.current.scrollIntoView({ block: 'nearest' });
  }, [session && session.messages.length, busy]);

  if (!checkpoints.length) {
    return (
      <Empty icon="flag" title="Bài học này chưa có điểm dừng"
        body="Giảng viên chưa thiết lập câu hỏi dừng video cho bài này. Bạn vẫn có thể hỏi cả lớp trong mục Trò chuyện."
        actions={<button type="button" className="btn btn-secondary" onClick={onChat}><Icon name="message-circle" className="icon-sm" /> Trò chuyện với lớp</button>} />
    );
  }

  const phase = session ? session.phase : null;
  const closed = finished(session);
  const answerBody = active && active.options ? { action: 'answer', optionIndex: choice } : { action: 'answer', answer: draft.trim() };
  const canAnswer = active && (active.options ? choice !== null : draft.trim().length > 0);

  return (
    <div className="stack-3">
      <ol className="cr-stops" aria-label="Các điểm dừng của bài">
        {checkpoints.map((c, i) => {
          const s = sessions[c.id];
          const state = finished(s) ? 'Đã xong' : s ? 'Đang thảo luận' : 'Chưa làm';
          return (
            <li key={c.id}>
              <button type="button" className={`cr-stop ${c.id === activeId ? 'is-active' : ''}`} aria-current={c.id === activeId ? 'step' : undefined}
                onClick={() => open(c.id)} disabled={!!busy}>
                <Icon name={finished(s) ? 'check-circle' : s ? 'message-circle' : 'circle'} className="icon-sm" />
                <span className="cr-stop-label"><span className="strong">Điểm dừng {i + 1}</span> <span className="mono">{clock(c.timestampSeconds)}</span></span>
                <span className="cr-stop-state">{state}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {!active ? (
        <p className="small muted">{videoApi ? 'Video sẽ tự dừng ở mỗi điểm dừng để cả lớp cùng thảo luận. Bạn cũng có thể mở một điểm dừng ở trên.' : 'Chọn một điểm dừng để bắt đầu thảo luận.'}</p>
      ) : (
        <article className="cr-card" aria-labelledby="cr-question">
          <p className="cr-card-meta"><Icon name="clock" className="icon-sm" /> Dừng ở <span className="mono">{clock(active.timestampSeconds)}</span> · {active.concept}</p>
          <div id="cr-question"><RichText text={active.question} className="cr-question" /></div>

          <ul className="cr-thread" aria-live="polite">
            {(session ? session.messages : []).map((m) => <Bubble key={m.id} m={m} />)}
            {busy && <Typing agent={busy.agent} />}
            <li ref={threadEnd} aria-hidden="true" className="cr-end" />
          </ul>

          <ActionError error={err} onRetry={err && err.retry} onDismiss={() => setErr(null)} />

          {session && phase === 'question' && (
            <form className="stack-2" onSubmit={(e) => { e.preventDefault(); if (canAnswer && !busy) act('bo', answerBody); }}>
              {active.options ? (
                <div className="choice-list" role="radiogroup" aria-label="Chọn câu trả lời">
                  {active.options.map((o, i) => (
                    <button key={i} type="button" role="radio" aria-checked={choice === i} className="choice cr-choice" onClick={() => setChoice(i)} disabled={!!busy}>
                      <span className="cr-letter" aria-hidden="true">{String.fromCharCode(65 + i)}</span><RichText text={o} className="choice-body" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="field"><label htmlFor="cr-answer">Câu trả lời của bạn</label>
                  <textarea id="cr-answer" className="textarea" rows={3} maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!!busy} /></div>
              )}
              <div className="cr-actions">
                <button type="submit" className="btn btn-primary" disabled={!canAnswer || !!busy} aria-busy={busy ? true : undefined}><Icon name="send" className="icon-sm" /> Trả lời</button>
                <button type="button" className="btn btn-ghost" onClick={() => act('colam', { action: 'skip' })} disabled={!!busy}>Bỏ qua</button>
              </div>
            </form>
          )}

          {session && phase === 'debate' && (
            <form className="stack-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim() && !busy) act('bo', { action: 'rebut', text: draft.trim() }); }}>
              <div className="field"><label htmlFor="cr-rebut">Phản biện lại Bo</label>
                <textarea id="cr-rebut" className="textarea" rows={3} maxLength={1000} placeholder="Giải thích vì sao lập luận của Bo chưa đúng…"
                  value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!!busy} />
                <p className="field-help">Bo chỉ chịu thua khi bạn nêu đúng nguyên nhân. Cô Lam sẽ gợi ý nếu bạn bí.</p></div>
              <div className="cr-actions">
                <button type="submit" className="btn btn-primary" disabled={!draft.trim() || !!busy} aria-busy={busy ? true : undefined}><Icon name="send" className="icon-sm" /> Gửi phản biện</button>
                <button type="button" className="btn btn-ghost" onClick={() => act('colam', { action: 'skip' })} disabled={!!busy}>Bỏ qua</button>
              </div>
            </form>
          )}

          {closed && (
            <div className="cr-actions">
              {videoApi && <button type="button" className="btn btn-primary" onClick={() => { try { videoApi.play(); } catch { /* player not ready */ } }}><Icon name="play" className="icon-sm" /> Tiếp tục xem video</button>}
              <button type="button" className="btn btn-secondary" onClick={() => start(active.id)} disabled={!!busy}><Icon name="rotate-ccw" className="icon-sm" /> Làm lại</button>
            </div>
          )}
          {!session && !busy && !err && <button type="button" className="btn btn-primary" onClick={() => start(active.id)}>Bắt đầu thảo luận</button>}
        </article>
      )}
    </div>
  );
}

function ChatPane({ courseId, lessonId, videoApi }) {
  const [recipient, setRecipient] = useState('all');
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const end = useRef(null);
  const nextId = useRef(0);
  const uid = () => `m${(nextId.current += 1)}`;

  useEffect(() => {
    if (end.current && typeof end.current.scrollIntoView === 'function') end.current.scrollIntoView({ block: 'nearest' });
  }, [messages.length, busy]);

  const send = async (message, to, history) => {
    setBusy({ agent: to === 'all' ? 'colam' : to });
    setErr(null);
    try {
      let currentTime;
      try { currentTime = videoApi && typeof videoApi.currentTime === 'function' ? Number(videoApi.currentTime()) : undefined; } catch { currentTime = undefined; }
      const res = await classroomApi.chat(courseId, lessonId, {
        message, recipient: to, history,
        ...(Number.isFinite(currentTime) ? { currentTime: Math.max(0, currentTime) } : {}),
      });
      setMessages((list) => [...list, ...res.replies.map((r) => ({ id: uid(), agent: r.agent, text: r.text }))]);
    } catch (e) {
      setErr({ message: (e && e.message) || 'Vui lòng thử lại.', retry: () => send(message, to, history) });
    } finally {
      setBusy(null);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    const history = messages.slice(-12).map((m) => ({ agent: m.agent, text: m.text.slice(0, 1200) }));
    const to = RECIPIENTS.find((r) => r.id === recipient);
    setMessages((list) => [...list, { id: uid(), agent: 'learner', text: message, to: to ? to.name : 'Cả lớp' }]);
    setText('');
    send(message, recipient, history);
  };

  return (
    <div className="stack-3">
      <fieldset className="cr-recipients">
        <legend className="field-label">Gửi tới</legend>
        <div className="cr-recipient-row">
          {RECIPIENTS.map((r) => (
            <button key={r.id} type="button" className="cr-recipient" aria-pressed={recipient === r.id} onClick={() => setRecipient(r.id)} title={r.role}>
              {r.id === 'all' ? <span className="cr-all" aria-hidden="true"><Icon name="users" className="icon-sm" /></span> : <ClassmateAvatar id={r.id} size={28} />}
              <span>{r.name}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <ul className="cr-thread cr-chat" aria-live="polite" aria-label="Tin nhắn trong lớp">
        {messages.length === 0 && !busy && (
          <li className="cr-hint small muted">Hỏi cả lớp về bài học: "vì sao…" sẽ gặp Trí, "tóm tắt…" gặp Linh Chi, "cho ví dụ…" gặp Minh Khang, "gợi ý…" gặp Trợ giảng An.</li>
        )}
        {messages.map((m) => <Bubble key={m.id} m={m} />)}
        {busy && <Typing agent={busy.agent} />}
        <li ref={end} aria-hidden="true" className="cr-end" />
      </ul>

      <ActionError error={err} onRetry={err && err.retry} onDismiss={() => setErr(null)} />

      <form className="cr-composer" onSubmit={submit}>
        <label htmlFor="cr-chat-input" className="sr-only">Tin nhắn</label>
        <textarea id="cr-chat-input" className="textarea" rows={2} maxLength={800} value={text}
          placeholder={recipient === 'all' ? 'Nhắn cho cả lớp…' : `Nhắn riêng cho ${CLASSMATES[recipient].name}…`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e); }} />
        <button type="submit" className="btn btn-primary btn-icon" disabled={!text.trim() || !!busy} aria-label="Gửi tin nhắn"><Icon name="send" /></button>
      </form>
    </div>
  );
}

export default ClassroomPanel;
