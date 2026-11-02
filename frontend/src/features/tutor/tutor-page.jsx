/**
 * The Tutor as a page, /ai (port of Codi develop's app/ai/page.tsx + components/ai-chat/ai-chat-page.tsx): the same
 * chats as the lesson's Tutor tab, with the whole history beside them.
 *
 * - Sidebar "Lịch sử đoạn chat": Tutor mark, "Đoạn chat mới" (general screens only; a lesson keeps one thread),
 *   search, the history grouped by day, the privacy note; resizable 200–400 px (drag, ←/→, double-click resets).
 *   Wide screens (≥ 900 px) show it beside the chat; narrow ones slide it over on demand.
 * - Bar: show history, "Mở đúng chỗ" (the chat's context), delete (with confirmation), "Thu về" (back to where the
 *   chat or the page came from).
 * - Address: ?c=<id> opens that chat and follows the open chat, so reload and back keep it; ?prompt= (catalogue,
 *   course page, search) is asked once in a new chat.
 * - Guests: no history ("Đăng nhập để lưu và xem lại lịch sử hỏi Tutor."), nothing stored.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Codi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import TutorThread from './tutor-thread';
import { ChatLoadError, HistoryList, HistorySearch, useConversation } from './tutor-chrome';
import { TIcon, TutorAvatar } from './tutor-ui';
import { useTutor } from './tutor-store';
import { KEEP_HISTORY, QUESTION_MAX } from './tutor-contract';

const SIDE = { min: 200, max: 400, initial: 260 };
const SIDE_KEY = 'codi:tutor-side';
const WIDE = '(min-width: 900px)';
const UUID = /^[0-9a-f-]{36}$/i;

export default function TutorPage({ query = {} }) {
  const ai = useTutor();
  const navigate = useNavigate();
  const { data, error, retry, setLesson } = useConversation(ai);
  const [search, setSearch] = useState('');
  const [width, setWidth] = useState(() => {
    try { const saved = Number(sessionStorage.getItem(SIDE_KEY)); return saved >= SIDE.min && saved <= SIDE.max ? saved : SIDE.initial; } catch { return SIDE.initial; }
  });
  const [sideOpen, setSideOpen] = useState(() => window.matchMedia(WIDE).matches);
  const resizing = useRef(null);
  const picked = useRef(false);
  const asked = useRef(false);
  const showButton = useRef(null);
  const asideRef = useRef(null);
  const initialChatId = query.c && UUID.test(query.c) ? query.c : null;
  const prompt = query.prompt ? String(query.prompt).trim().slice(0, QUESTION_MAX) : '';

  // /ai reached without a recorded origin (reload, typed address) still needs its conversation key.
  useEffect(() => { ai.ensureKey(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A question from another screen: asked once, in a new chat.
  useEffect(() => {
    if (asked.current || !prompt) return;
    asked.current = true;
    ai.startNew();
    ai.openWith({ ask: prompt });
  }, [prompt]); // eslint-disable-line react-hooks/exhaustive-deps

  // ?c=<id> opens that chat (from the lesson tab's "Mở toàn trang" or a link of the learner's own).
  useEffect(() => {
    if (picked.current || !initialChatId || ai.chats === null) return;
    picked.current = true;
    const chat = ai.chats.find((item) => item.id === initialChatId);
    if (chat) ai.select(chat);
    else if (initialChatId !== ai.active.id) Codi.ui.toast('Không tìm thấy đoạn chat này.');
  }, [initialChatId, ai.chats]); // eslint-disable-line react-hooks/exhaustive-deps
  // The address follows the open chat, so reload and back keep it.
  useEffect(() => {
    if (!picked.current && initialChatId) return;
    if (!ai.active.id) return;
    const target = ai.active.stored ? `/ai?c=${ai.active.id}` : '/ai';
    if (`${window.location.pathname}${window.location.search}` !== target) navigate(target, { replace: true });
  }, [ai.active, initialChatId, navigate]);

  const resize = (next) => {
    const value = Math.max(SIDE.min, Math.min(SIDE.max, Math.round(next)));
    setWidth(value);
    try { sessionStorage.setItem(SIDE_KEY, String(value)); } catch { /* not remembered */ }
  };
  const narrow = () => !window.matchMedia(WIDE).matches;
  const closeSide = () => { setSideOpen(false); requestAnimationFrame(() => { if (showButton.current) showButton.current.focus(); }); };
  // On narrow screens the history slides over the chat: focus moves into it.
  const openSide = () => {
    setSideOpen(true);
    if (narrow()) requestAnimationFrame(() => { const first = asideRef.current && asideRef.current.querySelector('button, a[href], input'); if (first) first.focus(); });
  };
  // Escape closes the slid-over history on narrow screens.
  useEffect(() => {
    if (!sideOpen) return undefined;
    const key = (e) => { if (e.key === 'Escape' && narrow()) closeSide(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [sideOpen]);

  const chat = (data && data.chat) || (ai.active.stored && ai.chats ? ai.chats.find((c) => c.id === ai.active.id) || null : null);
  const back = [chat && chat.contextHref, ai.page.href].find((href) => href && href !== '/ai') || Codi.homeFor(Codi.role());

  const remove = async () => {
    if (!chat) return;
    const r = await Codi.ui.confirm({
      title: 'Xoá đoạn chat này?',
      consequence: `Các câu hỏi và câu trả lời trong “${chat.title}” sẽ bị xoá khỏi lịch sử của bạn. Câu hỏi đã gửi giảng viên và số gợi ý đã dùng vẫn giữ.`,
      reversible: false,
      danger: true,
      confirmLabel: 'Xoá đoạn chat',
    });
    if (!r.ok) return;
    try {
      await api.del(`/api/ai/chats/${encodeURIComponent(chat.id)}`);
      ai.removeChat(chat.id);
      Codi.ui.toast('Đã xoá đoạn chat.');
    } catch {
      Codi.ui.toast('Chưa xoá được đoạn chat, hãy thử lại.', { type: 'danger' });
    }
  };

  const side = (
    <aside ref={asideRef} className={`tc-side ${sideOpen ? '' : 'is-hidden'}`.trim()} aria-label="Lịch sử đoạn chat" style={{ '--tc-side-w': `${width}px` }}>
      <div className="tc-side-head">
        <TutorAvatar />
        <span className="tc-side-name">Tutor</span>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Ẩn lịch sử" title="Ẩn lịch sử" onClick={closeSide}><TIcon name="panel-close" className="icon-sm" /></button>
      </div>
      <div className="tc-side-tools">
        {ai.page.kind === 'general' ? (
          <button type="button" className="tc-side-new" onClick={() => { ai.startNew(); if (narrow()) closeSide(); }}><TIcon name="square-pen" className="icon-sm" /> Đoạn chat mới</button>
        ) : null}
        {ai.signedIn ? <HistorySearch value={search} onChange={setSearch} /> : null}
      </div>
      <nav className="tc-side-list" aria-label="Các đoạn chat">
        {ai.signedIn ? (
          <HistoryList chats={ai.chats} activeId={ai.active.stored ? ai.active.id : null} search={search} dense
            onSelect={(c) => { ai.select(c); if (narrow()) closeSide(); }} />
        ) : (
          <p className="tc-history-note"><Link to="/login">Đăng nhập</Link> để lưu và xem lại lịch sử hỏi Tutor.</p>
        )}
      </nav>
      {ai.signedIn ? <p className="tc-side-foot"><Icon name="shield" className="icon-xs" /><span>{KEEP_HISTORY}</span></p> : null}
      <span role="separator" aria-orientation="vertical" aria-label="Kéo để đổi độ rộng lịch sử (← →, nhấp đúp về mặc định)"
        aria-valuemin={SIDE.min} aria-valuemax={SIDE.max} aria-valuenow={width} tabIndex={0} className="tc-grip"
        onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); resizing.current = { x: e.clientX, width }; }}
        onPointerMove={(e) => { if (resizing.current) resize(resizing.current.width + e.clientX - resizing.current.x); }}
        onPointerUp={() => { resizing.current = null; }}
        onDoubleClick={() => resize(SIDE.initial)}
        onKeyDown={(e) => { const step = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0; if (step) { e.preventDefault(); resize(width + step); } }} />
    </aside>
  );

  const bar = (
    <div className="tc-bar">
      {!sideOpen ? <button ref={showButton} type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Hiện lịch sử" title="Hiện lịch sử" onClick={openSide}><TIcon name="panel-open" className="icon-sm" /></button> : null}
      {data && data.messages.length ? <h1 className="sr-only">{chat ? chat.title : 'Đoạn chat mới'}</h1> : null}
      <span className="tc-bar-title" aria-hidden="true">{chat ? chat.title : ''}</span>
      {chat && chat.contextHref && chat.contextHref !== '/ai' ? <Link to={chat.contextHref} className="btn btn-ghost btn-sm" title={chat.contextLabel}><Icon name="external-link" className="icon-sm" /><span className="tc-bar-label">Mở đúng chỗ</span></Link> : null}
      {chat ? <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Xoá đoạn chat này" title="Xoá đoạn chat này" onClick={remove}><Icon name="trash" className="icon-sm" /></button> : null}
      <Link to={back} className="btn btn-ghost btn-icon btn-sm" aria-label="Thu về trang trước" title="Thu về trang trước"><TIcon name="chevrons-left" className="icon-sm" /></Link>
    </div>
  );

  return (
    <div className="tc-page" onPointerUp={() => { resizing.current = null; }}>
      {side}
      {sideOpen ? <button type="button" className="tc-scrim" aria-label="Đóng lịch sử" tabIndex={-1} onClick={closeSide} /> : null}
      {error ? (
        <section className="tc-main" aria-label="Đoạn chat">{bar}<h1 className="sr-only">Tutor</h1><ChatLoadError message={error} retry={retry} /></section>
      ) : !data ? (
        <section className="tc-main" aria-label="Đoạn chat">{bar}<h1 className="sr-only">Tutor</h1><p className="tc-center" role="status"><Icon name="loader" className="icon-sm tc-spin" /> Đang mở đoạn chat…</p></section>
      ) : (
        <TutorThread key={data.id} ai={ai} variant="page" chatId={data.id} initialMessages={data.messages} chat={data.chat} lesson={data.lesson}
          onLesson={setLesson} header={bar} />
      )}
    </div>
  );
}
