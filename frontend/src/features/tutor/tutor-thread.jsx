/**
 * The conversation with the Tutor, shared by the lesson's Tutor tab ('panel') and the full page /ai ('page'); port of
 * Codi develop's components/ai-chat/ai-chat-thread.tsx. STATE-MACHINES §13: idle → thinking → streaming → answered |
 * stopped | error | rate limited.
 *
 * - The context chips (task, code, failing test, run error, selection) are exactly what is sent; each can be removed
 *   and added back from "+". They exist only while the chat's lesson is the one on screen.
 * - Lesson chats: answer mode (Giải thích đơn giản / Gợi ý từng bước / Ôn lại khái niệm), the 3-step hint ladder on code
 *   lessons, line jumps, the ≤3-line suggestion and "Hỏi giảng viên" (private question, status row above the thread).
 * - General chats of a signed-in learner ask the S17 intake (goal, level, weekly hours) before the first question that
 *   needs it; the question waits and is sent after the last answer or skip.
 * - Guests: nothing is stored; the recent 12 turns travel with each question; no votes.
 * - A contextual request (selection toolbar, failing test, console error, ?prompt=) is taken from the store once, so a
 *   remount never sends it twice.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { Codi } from '../../lib/codi';
import { Alert, Icon } from '../../components/ui/primitives';
import TutorMessage from './tutor-message';
import { IntakeQuestion, IntakeSummary, useLearnerIntake } from './tutor-chrome';
import { openEscalate } from './tutor-escalate';
import { AiDisclaimer, Menu, TIcon } from './tutor-ui';
import { useTutorChat } from './use-tutor-chat';
import {
  CONTEXT_LIMITS, GUEST_TURNS, HINT_MAX, HINT_NAMES, INTAKE_FIELDS, MODES, MODE_LABELS, QUESTION_MAX, RATE_LIMITED,
  applyDiff, clip, lineRefs, messageText, missingIntake, short, starters as startersFor,
} from './tutor-contract';

const toChatContext = (page) => (page.kind === 'lesson'
  ? { kind: 'lesson', courseId: page.courseId, lessonId: page.lessonId }
  : { kind: 'general', label: page.label, href: page.href });

/** What went wrong with a turn: rate limited, rejected by the route (4xx) or unavailable. */
function turnError(error) {
  if (!error) return null;
  if (error.status === 429 || error.message === RATE_LIMITED) return { kind: 'limit', message: RATE_LIMITED, retryAfter: error.retryAfter };
  if (error.status && error.status < 500 && error.status !== 408) return { kind: 'rejected', message: error.message };
  return { kind: 'unavailable', message: 'Tutor đang tạm nghỉ. Câu hỏi của bạn vẫn còn ở đây.' };
}

/** Seconds left before a rate-limited learner may ask again (counts down once a second). */
function useCountdown(seconds) {
  const [left, setLeft] = useState(seconds || 0);
  useEffect(() => {
    setLeft(seconds || 0);
    if (!seconds) return undefined;
    const started = Date.now();
    const t = setInterval(() => {
      const next = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(next);
      if (!next) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [seconds]);
  return left;
}

export default function TutorThread({ ai, variant, chatId, initialMessages, chat, lesson, onLesson, header }) {
  const { page, signedIn } = ai;
  const kind = chat ? chat.kind : page.kind;
  // Code chips and editor actions only apply while the chat's lesson is the one on screen.
  const here = !!lesson && page.kind === 'lesson' && page.lessonId === lesson.lessonId;
  const bridge = here ? ai.code : null;

  const [input, setInput] = useState('');
  const [mode, setMode] = useState('simple');
  const [ctx, setCtx] = useState({});
  const [removed, setRemoved] = useState(() => new Set());
  const [queued, setQueued] = useState(null);
  const [announce, setAnnounce] = useState('');
  const general = kind === 'general' && signedIn;
  const intake = useLearnerIntake(general);
  const [skipped, setSkipped] = useState([]);
  const [asking, setAsking] = useState(null);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const originals = useRef(new Map());
  const scroller = useRef(null);
  const stick = useRef(true);
  const textarea = useRef(null);

  // The context the learner sees as chips is exactly what is sent with the question.
  const failingAll = bridge ? bridge.failingTest(ctx.testId) : null;
  const runErrorAll = bridge ? bridge.runError() : null;
  const taskAll = bridge ? bridge.task() : null;
  const codeText = bridge ? bridge.getCode() : '';
  const failing = removed.has('test') ? null : failingAll;
  const runError = removed.has('err') ? null : runErrorAll;
  const task = removed.has('task') ? null : taskAll;
  const allChips = here ? [
    taskAll && { id: 'task', label: `Yêu cầu: ${short(taskAll.label)}` },
    bridge && { id: 'code', label: `Code bạn đang viết${codeText.length > CONTEXT_LIMITS.code ? ' · đã rút gọn' : ''}` },
    failingAll && { id: 'test', label: `Test chưa đạt: ${failingAll.name}` },
    runErrorAll && { id: 'err', label: `Lỗi: ${short(runErrorAll)}` },
    ctx.selection && { id: 'sel', label: `Đoạn đã chọn · ${ctx.selection.split('\n').length} dòng${ctx.selection.length > CONTEXT_LIMITS.selection ? ' · đã rút gọn' : ''}` },
  ].filter(Boolean) : [];
  const chips = allChips.filter((c) => !removed.has(c.id));
  const addable = allChips.filter((c) => removed.has(c.id));

  function attached() {
    const value = {};
    if (task) value.task = clip(task.text, CONTEXT_LIMITS.task);
    if (ctx.selection && !removed.has('sel')) value.selection = clip(ctx.selection, CONTEXT_LIMITS.selection);
    if (bridge && !removed.has('code')) value.code = clip(bridge.getCode(), CONTEXT_LIMITS.code);
    if (failing) {
      const cut = (text) => clip(text, CONTEXT_LIMITS.test);
      value.failingTest = { name: String(failing.name).slice(0, 200), input: failing.input == null ? null : cut(failing.input), expected: cut(failing.expected ?? ''), actual: failing.actual == null ? null : cut(failing.actual) };
    }
    if (runError) value.error = clip(runError, CONTEXT_LIMITS.error);
    return value;
  }

  // The request reads the latest screen context at send time.
  const latest = useRef(null);
  latest.current = { page, mode, attached, signedIn };
  const prepare = ({ id, messages, question, trigger }) => {
    const { page: at, mode: how, attached: read, signedIn: member } = latest.current;
    const index = messages.indexOf(question);
    return {
      id,
      context: toChatContext(at),
      message: { id: question.id, role: 'user', parts: question.parts.filter((p) => p.type === 'text').map((p) => ({ type: 'text', text: p.text })), ...(question.metadata && question.metadata.hint ? { metadata: { hint: true } } : {}) },
      // Guests have no stored history: the recent turns travel with the question.
      ...(member ? {} : {
        history: messages.slice(0, index).slice(-GUEST_TURNS).map((m) => ({ id: m.id, role: m.role, parts: [{ type: 'text', text: messageText(m) }] })).filter((m) => m.parts[0].text),
      }),
      ...(at.kind === 'lesson' ? { lesson: { mode: how, context: read() } } : {}),
      trigger,
      messageId: question.id,
    };
  };

  async function refreshLesson() {
    if (!lesson) return;
    const q = new URLSearchParams({ courseId: lesson.courseId, lessonId: lesson.lessonId });
    const meta = await api.get(`/api/ai/lesson?${q}`).catch(() => null);
    if (meta) onLesson(meta);
  }

  const { messages, sendMessage, status, stop, error, regenerate, setMessages, clearError } = useTutorChat({
    chatId,
    initialMessages,
    prepare,
    onFinish: ({ message, isAbort, isError }) => {
      if (isError) { setAnnounce('Tutor chưa trả lời được.'); return; }
      setAnnounce(isAbort ? 'Đã dừng câu trả lời.' : `Tutor đã trả lời: ${clip(messageText(message), 240)}`);
      if (signedIn) { ai.markStored(chatId); ai.refreshChats(); }
      if (message && message.metadata && message.metadata.hint && lesson) refreshLesson();
    },
  });
  const busy = status === 'submitted' || status === 'streaming';
  const failure = status === 'error' ? turnError(error) : null;
  const waitLeft = useCountdown(failure && failure.kind === 'limit' ? failure.retryAfter : 0);
  const last = messages[messages.length - 1];
  // A question saved before the page was left mid-turn, or whose answer failed: offer to ask again.
  const lastInitial = initialMessages[initialMessages.length - 1];
  const unanswered = status === 'ready' && last && last.role === 'user' && lastInitial && lastInitial.id === last.id;

  function send(question) {
    stick.current = true;
    setInput('');
    if (textarea.current) textarea.current.style.height = '';
    clearError();
    setAnnounce('Tutor đang tìm câu trả lời…');
    sendMessage({ text: question.slice(0, QUESTION_MAX) });
  }
  function ask(text) {
    const question = String(text || '').trim();
    if (!question || busy || intakeBusy) return;
    // Ask only what is missing, once; the question waits and is sent when the last answer or skip lands.
    const missing = general && intake.draft ? missingIntake(intake.draft, skipped) : [];
    if (missing.length) {
      setInput('');
      setAsking({ fields: missing, pending: question.slice(0, QUESTION_MAX) });
      return;
    }
    send(question);
  }
  async function answerIntake(value) {
    if (!asking || intakeBusy) return;
    const field = asking.fields[0];
    if (value !== null) {
      setIntakeBusy(true);
      const saved = await intake.save({ [field]: value });
      setIntakeBusy(false);
      if (!saved) return;
    } else setSkipped((list) => [...list, field]);
    const rest = asking.fields.slice(1);
    if (rest.length) { setAsking({ ...asking, fields: rest }); return; }
    setAsking(null);
    if (asking.pending) send(asking.pending);
  }
  function hint() {
    if (!lesson || busy) return;
    const level = lesson.hintLevel + 1;
    stick.current = true;
    clearError();
    setAnnounce('Tutor đang soạn gợi ý…');
    sendMessage({ text: `Cho mình gợi ý ${level}/${HINT_MAX} · ${HINT_NAMES[lesson.hintLevel]}`, metadata: { hint: level } });
  }

  // A contextual entry point adds context and may ask right away; taken once, so a remount never sends it again.
  useEffect(() => {
    if (!ai.request) return;
    const request = ai.takeRequest();
    if (!request) return;
    setCtx((prev) => ({ selection: request.selection ?? prev.selection, testId: request.testId ?? prev.testId }));
    setRemoved(new Set());
    if (request.ask) setQueued(request.ask);
    else window.setTimeout(() => { if (textarea.current) textarea.current.focus(); }, 50);
  }, [ai.request]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sent on the render after the new context is in state.
  useEffect(() => {
    if (!queued || busy) return;
    setQueued(null);
    ask(queued);
  }, [queued, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the answer while it streams, unless the learner scrolled up to read.
  useEffect(() => {
    const node = scroller.current;
    if (node && stick.current) node.scrollTop = node.scrollHeight;
  }, [messages, status]);

  async function patch(body) {
    try {
      await api.patch(`/api/ai/chats/${encodeURIComponent(chatId)}`, body);
      return true;
    } catch {
      Codi.ui.toast('Chưa lưu được, hãy thử lại.', { type: 'danger' });
      return false;
    }
  }
  const setMeta = (id, change) => setMessages((list) => list.map((m) => (m.id === id ? { ...m, metadata: { ...m.metadata, ...change(m.metadata || {}) } } : m)));
  async function vote(message, value) {
    const next = message.metadata && message.metadata.vote === value ? null : value;
    setMeta(message.id, () => ({ vote: next, voteReason: null }));
    await patch({ type: 'vote', messageId: message.id, vote: next });
  }
  async function reason(message, value) {
    setMeta(message.id, () => ({ voteReason: value }));
    if (await patch({ type: 'vote', messageId: message.id, vote: 'down', reason: value })) Codi.ui.toast('Cảm ơn, góp ý của bạn giúp Codi trả lời tốt hơn.');
  }
  function diffActions(message) {
    const setState = (toolCallId, state) => {
      setMeta(message.id, (meta) => ({ diffs: { ...meta.diffs, [toolCallId]: state } }));
      return patch({ type: 'diff', messageId: message.id, toolCallId, state });
    };
    const meta = message.metadata || {};
    return {
      codeOpen: !!bridge,
      state: (id) => (meta.diffs && meta.diffs[id]) || null,
      canUndo: (id) => originals.current.has(id),
      apply: (id, diff) => {
        if (!bridge) return;
        const original = bridge.getCode();
        bridge.setCode(applyDiff(original, diff));
        originals.current.set(id, original);
        setState(id, 'applied');
        Codi.ui.toast(`Đã thêm ${diff.add.length} dòng vào code. Bấm “Hoàn tác” nếu muốn bỏ.`, { type: 'success' });
      },
      undo: (id) => {
        const original = originals.current.get(id);
        if (!bridge || original === undefined) return;
        bridge.setCode(original);
        originals.current.delete(id);
        setState(id, null);
        Codi.ui.toast('Đã hoàn tác, code trở lại như trước.');
      },
      skip: (id) => setState(id, 'skipped'),
      rerun: () => { if (bridge) bridge.runTests(); },
    };
  }
  async function escalate(values) {
    if (!lesson) return;
    let meta;
    try {
      meta = await api.post('/api/ai/lesson', {
        courseId: lesson.courseId,
        lessonId: lesson.lessonId,
        chatId: chat || messages.length ? chatId : null,
        escalation: {
          text: values.text,
          withSummary: values.withSummary,
          ...(values.withCode && bridge ? { code: clip(bridge.getCode(), CONTEXT_LIMITS.code) } : {}),
          ...(values.withTest && failing ? { failingTest: String(failing.name).slice(0, 200) } : {}),
        },
      });
    } catch (e) {
      throw new Error((e && e.message) || 'Chưa gửi được câu hỏi cho giảng viên.');
    }
    onLesson(meta);
    Codi.ui.toast('Đã gửi câu hỏi cho giảng viên. Bạn sẽ nhận thông báo khi có trả lời.', { type: 'success' });
  }

  const canEscalate = kind === 'lesson' && !!lesson && signedIn;
  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user') || null;
  const openEscalateDialog = () => openEscalate({
    lecturerName: lesson ? lesson.lecturerName : null,
    defaultText: lastQuestion ? messageText(lastQuestion) : '',
    hasCode: !!bridge,
    failingTest: failing ? failing.name : null,
    send: escalate,
  });
  const escalateButton = canEscalate ? <button type="button" className="btn btn-ghost btn-sm" onClick={openEscalateDialog}><Icon name="message-circle" className="icon-sm" /> Hỏi giảng viên</button> : null;
  const starters = startersFor({ kind, isCode: lesson ? lesson.isCode : false, signedIn });
  const isCode = !!(lesson && lesson.isCode) && here;
  const level = lesson ? lesson.hintLevel : 0;
  const empty = !messages.length;
  const inputId = `tc-input-${variant}`;

  const plusItems = [
    ...addable.map((c) => ({ key: c.id, label: `Gửi kèm: ${c.label}`, icon: 'plus', onSelect: () => setRemoved((prev) => { const next = new Set(prev); next.delete(c.id); return next; }) })),
    ...(canEscalate ? [{ key: 'escalate', label: 'Hỏi riêng giảng viên', icon: 'message-circle', onSelect: openEscalateDialog }] : []),
  ];

  const composer = (
    <div className="tc-composer-wrap">
      {general && intake.draft ? (
        <IntakeSummary draft={intake.draft} onClear={(field) => intake.save({ [field]: null })}
          onEdit={() => { setSkipped([]); setAsking({ fields: [...INTAKE_FIELDS], pending: null }); }} />
      ) : null}
      {asking ? <IntakeQuestion asking={asking} busy={intakeBusy} onAnswer={answerIntake} onSkip={() => answerIntake(null)} /> : null}
      <form className="tc-composer" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        {chips.length ? (
          <ul className="tc-chips" aria-label="Ngữ cảnh gửi kèm câu hỏi">
            {chips.map((c) => (
              <li key={c.id} className="tc-chip">
                <span className="tc-chip-label">{c.label}</span>
                <button type="button" aria-label={`Bỏ “${c.label}” khỏi ngữ cảnh`} onClick={() => setRemoved((prev) => new Set(prev).add(c.id))}><Icon name="x" className="icon-xs" /></button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="tc-input-row">
          <Icon name="sparkles" className="icon-sm tc-input-mark" />
          <label className="sr-only" htmlFor={inputId}>Câu hỏi cho Tutor</label>
          <textarea ref={textarea} id={inputId} rows={1} value={input} maxLength={QUESTION_MAX} className="tc-input"
            placeholder={empty ? (kind === 'lesson' ? 'Hỏi Tutor về bài này…' : 'Hỏi Tutor về trang này…') : 'Hỏi tiếp Tutor'}
            onChange={(e) => {
              setInput(e.target.value);
              const node = e.target;
              node.style.height = 'auto';
              node.style.height = `${Math.min(node.scrollHeight, 176)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(input); }
            }} />
        </div>
        <div className="tc-tools">
          {plusItems.length ? (
            <Menu label="Thêm" items={plusItems} up renderTrigger={(props) => (
              <button type="button" {...props} className="tc-tool-icon" aria-label="Thêm ngữ cảnh hoặc hỏi giảng viên" title="Thêm"><Icon name="plus" className="icon-sm" /></button>
            )} />
          ) : null}
          {kind === 'lesson' ? (
            <Menu label="Cách trả lời" up items={MODES.map((m) => ({ key: m, label: MODE_LABELS[m], checked: mode === m, onSelect: () => setMode(m) }))} renderTrigger={(props) => (
              <button type="button" {...props} className="tc-tool" aria-label={`Cách trả lời: ${MODE_LABELS[mode]}`}>{MODE_LABELS[mode]}<Icon name="chevron-down" className="icon-xs" /></button>
            )} />
          ) : null}
          {isCode ? (level < HINT_MAX ? (
            <button type="button" className="tc-tool tc-hint" disabled={busy} onClick={hint} title={`Gợi ý ${level + 1}/${HINT_MAX} · ${HINT_NAMES[level]}`}>
              <Icon name="lightbulb" className="icon-sm" /><span className="tc-tool-text">Gợi ý {level + 1}/{HINT_MAX} · {HINT_NAMES[level]}</span>
            </button>
          ) : <span className="tc-tool-note" title="Cần thêm trợ giúp? Hỏi riêng giảng viên.">Đã dùng hết 3 gợi ý</span>) : null}
          <span className="tc-tools-gap" />
          {busy ? (
            <button type="button" className="tc-send is-stop" aria-label="Dừng câu trả lời" title="Dừng" onClick={stop}><TIcon name="stop" className="icon-sm" /></button>
          ) : (
            <button type="submit" className="tc-send" disabled={!input.trim()} aria-label="Gửi (Enter)" title="Gửi (Enter)"><TIcon name="arrow-up-send" className="icon-sm" /></button>
          )}
        </div>
      </form>
      <AiDisclaimer signedIn={signedIn} />
    </div>
  );

  const conversation = lesson && lesson.conversation && kind === 'lesson' ? <ConversationStatus c={lesson.conversation} /> : null;
  const thread = (
    <div className="tc-thread">
      {conversation}
      {messages.map((m, i) => (
        <TutorMessage key={m.id} message={m}
          streaming={busy && i === messages.length - 1 && m.role === 'assistant'}
          diff={kind === 'lesson' ? diffActions(m) : null}
          actions={{
            vote: signedIn ? (value) => vote(m, value) : null,
            reason: (value) => reason(m, value),
            escalate: escalateButton,
            lines: bridge ? lineRefs(messageText(m), codeText.split('\n').length) : [],
            onLine: (n) => { if (bridge) bridge.selectLine(n); },
          }} />
      ))}
      {status === 'submitted' ? (
        <p className="tc-thinking"><Icon name="loader" className="icon-sm tc-spin" />{kind === 'lesson' ? `Tutor đang đọc bài “${(lesson && lesson.lessonTitle) || page.label}”…` : 'Tutor đang tìm câu trả lời…'}</p>
      ) : null}
      {unanswered && !failure ? (
        <Alert type="info" title="Câu hỏi này chưa có câu trả lời"
          actions={<button type="button" className="btn btn-secondary btn-sm" onClick={regenerate}><Icon name="rotate-ccw" className="icon-sm" /> Hỏi lại</button>} />
      ) : null}
      {failure && failure.kind === 'limit' ? (
        <Alert type="warn" title={RATE_LIMITED}
          body={`${waitLeft ? `Thử lại sau ${waitLeft} giây` : 'Thử lại sau ít phút'}${canEscalate ? ', hoặc hỏi riêng giảng viên' : ''}.`}
          actions={(!waitLeft && failure.retryAfter) || escalateButton ? <>{!waitLeft && failure.retryAfter ? <button type="button" className="btn btn-secondary btn-sm" onClick={regenerate}><Icon name="rotate-ccw" className="icon-sm" /> Thử lại</button> : null}{escalateButton}</> : null} />
      ) : null}
      {failure && failure.kind !== 'limit' ? (
        <Alert type={failure.kind === 'rejected' ? 'warn' : 'danger'} title={failure.message}
          body={failure.kind === 'unavailable' ? 'Bạn vẫn học tiếp bình thường.' : null}
          actions={failure.kind === 'unavailable' || escalateButton ? <>{failure.kind === 'unavailable' ? <button type="button" className="btn btn-secondary btn-sm" onClick={regenerate}><Icon name="rotate-ccw" className="icon-sm" /> Thử lại</button> : null}{escalateButton}</> : null} />
      ) : null}
    </div>
  );

  const onScroll = () => {
    const node = scroller.current;
    if (node) stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
  };
  const live = <p className="sr-only" role="status" aria-live="polite">{announce}</p>;

  if (variant === 'page') {
    return (
      <section aria-label="Đoạn chat" className="tc-main">
        {header}
        {live}
        {empty ? (
          <div className="tc-start">
            <div className="tc-column tc-start-col">
              <h1 className="tc-start-title">Hôm nay bạn muốn hỏi gì?</h1>
              {composer}
              <ul className="tc-starters-row" aria-label="Gợi ý câu hỏi">
                {starters.map((text) => (
                  <li key={text}><button type="button" className="tc-pill" onClick={() => { setInput(text); if (textarea.current) textarea.current.focus(); }}>{text}</button></li>
                ))}
              </ul>
              <p className="tc-start-note">Tutor trả lời theo tài liệu của Codi, kèm nguồn để mở lại. Hỏi về một bài thì mở bài đó rồi chọn tab Tutor, Tutor sẽ biết bạn đang ở đâu.</p>
            </div>
          </div>
        ) : (
          <>
            <div ref={scroller} onScroll={onScroll} className="tc-scroll"><div className="tc-column">{thread}</div></div>
            <div className="tc-dock"><div className="tc-column">{composer}</div></div>
          </>
        )}
      </section>
    );
  }
  return (
    <>
      {header}
      {live}
      <div ref={scroller} onScroll={onScroll} className="tc-scroll is-panel">
        {empty && !busy ? (
          <div className="tc-starters">
            {conversation}
            <p className="tc-starters-label">Bạn có thể hỏi</p>
            <ul>
              {starters.map((text) => <li key={text}><button type="button" className="tc-starter" onClick={() => ask(text)}><span>{text}</span><Icon name="arrow-right" className="icon-sm" /></button></li>)}
            </ul>
          </div>
        ) : thread}
      </div>
      <div className="tc-dock is-panel">{composer}</div>
    </>
  );
}

/** "Đã hỏi giảng viên · Đang chờ / Giảng viên đã trả lời / Đã giải quyết", expandable to the last reply. */
function ConversationStatus({ c }) {
  const [open, setOpen] = useState(false);
  const done = c.replied || c.resolved;
  return (
    <div className="tc-conv">
      <button type="button" className="tc-conv-row" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name={done ? 'check-circle' : 'clock'} className={`icon-sm ${done ? 'tc-ok' : 'tc-warn'}`} />
        <span className="tc-conv-text">Đã hỏi giảng viên · {c.resolved ? 'Đã giải quyết' : c.replied ? 'Giảng viên đã trả lời' : 'Đang chờ'}</span>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} className="icon-sm" />
      </button>
      {open ? <p className="tc-conv-body">{c.lastReply || 'Bạn sẽ nhận thông báo khi giảng viên trả lời.'}</p> : null}
    </div>
  );
}
