/**
 * Around the thread (port of Codi develop's components/ai-chat/ai-chat-chrome.tsx and ai-chat-intake.tsx): the
 * history list grouped by day with search, the conversation loader, the load error, and the S17 intake (one question
 * at a time with a skip; "Codi đang hiểu về bạn" with removable answers and "Sửa").
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Codi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import { TIcon } from './tutor-ui';
import { INTAKE_FIELDS, INTAKE_QUESTIONS, groupChats, intakeLabels, matchesChat } from './tutor-contract';
import { tutorStore } from './tutor-store';

const DATE = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit' });
const TIME = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });

/** History grouped by day, with search; the lesson tab's history popover and the Tutor page's sidebar. */
export function HistoryList({ chats, activeId, onSelect, limit, search = '', dense = false }) {
  if (chats === null) return <p className="tc-history-note" role="status">Đang tải lịch sử…</p>;
  const shown = chats.filter((c) => matchesChat(c, search)).slice(0, limit);
  if (!shown.length) return <p className="tc-history-note">{search ? 'Không có đoạn chat nào khớp.' : 'Chưa có đoạn chat nào.'}</p>;
  return (
    <div className="tc-history">
      {groupChats(shown).map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3 className="tc-history-day">{group.label}</h3>
          <ul>
            {group.chats.map((chat) => {
              const at = new Date(chat.updatedAt);
              const when = group.label === 'Hôm nay' ? TIME.format(at) : DATE.format(at);
              const current = chat.id === activeId;
              return (
                <li key={chat.id}>
                  <button type="button" className={`tc-history-item ${dense ? 'is-dense' : ''}`.trim()} aria-current={current ? 'true' : undefined}
                    title={`${chat.contextLabel} · ${when}`} onClick={() => onSelect(chat)}>
                    {!dense ? <TIcon name={chat.kind === 'lesson' ? 'book-open' : 'compass'} className="icon-sm tc-history-icon" /> : null}
                    <span className="tc-history-text">
                      <span className="tc-history-title">{chat.title}</span>
                      {!dense ? <span className="tc-history-meta">{chat.contextLabel} · {when}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function HistorySearch({ value, onChange }) {
  return (
    <label className="tc-search">
      <Icon name="search" className="icon-sm" />
      <span className="sr-only">Tìm đoạn chat</span>
      <input type="search" value={value} placeholder="Tìm đoạn chat" onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function ChatLoadError({ message, retry }) {
  return (
    <div className="tc-center" role="alert">
      <Icon name="info" />
      <p>{message}</p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={retry}><Icon name="rotate-ccw" className="icon-sm" /> Thử lại</button>
    </div>
  );
}

/**
 * Loads what the active chat needs: its stored messages, or nothing for a new one; and the lesson meta (hint ladder,
 * lecturer, private conversation) for a lesson chat, or for a new chat opened on a lesson.
 * → { data: { id, chat, messages, lesson } | null, error, retry, setLesson }
 */
export function useConversation(ai) {
  const { active, page, signedIn } = ai;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const lessonKey = page.kind === 'lesson' ? `${page.courseId}/${page.lessonId}` : null;
  const loadedFor = `${lessonKey}|${signedIn}`;

  useEffect(() => {
    if (!active.id) return undefined;
    // A stored chat (or a draft that just got its first answer) keeps its live thread; nothing to reload.
    if (data && data.id === active.id && (active.stored || data.loadedFor === loadedFor)) return undefined;
    const controller = new AbortController();
    setError(null);
    (async () => {
      if (!active.stored) {
        let lesson = null;
        if (page.kind === 'lesson' && signedIn) {
          const q = new URLSearchParams({ courseId: page.courseId, lessonId: page.lessonId });
          lesson = await api.get(`/api/ai/lesson?${q}`, { signal: controller.signal }).catch((e) => { if (e && e.name === 'AbortError') throw e; return null; });
        }
        setData({ id: active.id, loadedFor, chat: null, messages: [], lesson });
        return;
      }
      try {
        const body = await api.get(`/api/ai/chats/${encodeURIComponent(active.id)}`, { signal: controller.signal });
        setData({ id: active.id, loadedFor, chat: body.chat, messages: body.messages || [], lesson: body.lesson || null });
      } catch (e) {
        if (e && (e.status === 404 || e.status === 401)) { tutorStore.removeChat(active.id); return; }
        throw e;
      }
    })().catch((e) => {
      if (!controller.signal.aborted && !(e && e.name === 'AbortError')) setError('Chưa tải được đoạn chat.');
    });
    return () => controller.abort();
  }, [active.id, active.stored, loadedFor, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    data: data && data.id === active.id ? data : null,
    error,
    retry: () => setAttempt((n) => n + 1),
    setLesson: (lesson) => setData((prev) => (prev ? { ...prev, lesson } : prev)),
  };
}

// ───────────────────────── S17 intake ─────────────────────────
/** The signed-in learner's intake answers, loaded once per mounted thread and saved one answer at a time. */
export function useLearnerIntake(enabled) {
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    api.get('/api/ai/intake').then((body) => { if (live && body) setDraft(body.draft || {}); }).catch(() => { /* the questions wait; the Tutor still answers */ });
    return () => { live = false; };
  }, [enabled]);
  const save = useCallback(async (patch) => {
    try {
      const body = await api.patch('/api/ai/intake', patch);
      setDraft(body.draft || {});
      return true;
    } catch {
      Codi.ui.toast('Chưa lưu được, hãy thử lại.', { type: 'danger' });
      return false;
    }
  }, []);
  return { draft, save };
}

/** One question at a time, with option chips and a skip; the counter shows how many are left. */
export function IntakeQuestion({ asking, busy, onAnswer, onSkip }) {
  const field = asking.fields[0];
  if (!field) return null;
  const question = INTAKE_QUESTIONS[field];
  return (
    <div className="tc-intake-q" role="group" aria-label={question.text}>
      <p className="tc-intake-head"><span>{question.text}</span><span className="tc-intake-count">{INTAKE_FIELDS.length - asking.fields.length + 1}/{INTAKE_FIELDS.length}</span></p>
      <div className="tc-intake-options">
        {question.options.map((o) => <button key={o.label} type="button" className="tc-pill" disabled={busy} onClick={() => onAnswer(o.value)}>{o.label}</button>)}
        <button type="button" className="tc-pill is-quiet" disabled={busy} onClick={onSkip}>Bỏ qua</button>
      </div>
    </div>
  );
}

/** "Codi đang hiểu về bạn": the known answers, each removable, and an edit that asks all three again. */
export function IntakeSummary({ draft, onClear, onEdit }) {
  const items = intakeLabels(draft);
  if (!items.length) return null;
  return (
    <div className="tc-intake-sum" role="group" aria-label="Codi đang hiểu về bạn">
      <span className="tc-intake-label">Codi đang hiểu về bạn</span>
      {items.map((item) => (
        <span key={item.field} className="tc-tag">
          {item.label}
          <button type="button" aria-label={`Bỏ “${item.label}”`} onClick={() => onClear(item.field)}><Icon name="x" className="icon-xs" /></button>
        </span>
      ))}
      <button type="button" className="tc-link" onClick={onEdit}>Sửa</button>
    </div>
  );
}
