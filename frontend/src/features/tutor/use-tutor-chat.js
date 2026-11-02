/**
 * One conversation with the Tutor, the rebuild's counterpart of the AI SDK's useChat as Codi develop uses it
 * (STATE-MACHINES §13: idle → thinking → streaming → answered | stopped | error | rate limited).
 *
 *   const chat = useTutorChat({ chatId, initialMessages, prepare, onFinish });
 *   chat.messages (UIMessage[]), chat.status 'ready'|'submitted'|'streaming'|'error', chat.error { status, message, retryAfter }
 *   chat.sendMessage({ text, metadata }), chat.regenerate(), chat.stop(), chat.setMessages(fn), chat.clearError()
 *
 * prepare({ id, messages, question, trigger }) returns the POST /api/ai/chat body. onFinish({ message, isAbort,
 * isError }) runs once per turn. A stopped turn keeps what was shown ("Đã dừng câu trả lời."); a failed turn keeps the
 * question so "Thử lại" (regenerate) asks it again with the same message id. The dev scenario flag
 * Codi.state.scenario.aiAssistant forces 'thinking' (until "Dừng"), 'ratelimit' or 'error' without calling the model.
 */
import { useCallback, useRef, useState } from 'react';
import { Codi } from '../../lib/codi';
import { streamAiChat } from '../../lib/ai-chat';
import { RATE_LIMITED, STOPPED_TEXT, UNAVAILABLE } from './tutor-contract';

const THROTTLE_MS = 40;
const hasContent = (m) => !!m && m.parts.some((p) => (p.type === 'text' && p.text.trim()) || (p.type.startsWith('tool-') && p.state === 'output-available'));
const stoppedMessage = (m) => (hasContent(m)
  ? { ...m, metadata: { ...m.metadata, stopped: true } }
  : { id: (m && !m.id.startsWith('local-') && m.id) || `local-${crypto.randomUUID()}`, role: 'assistant', parts: [{ type: 'text', text: STOPPED_TEXT, state: 'done' }], metadata: { ...(m && m.metadata), stopped: true } });
const wait = (ms, signal) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

export function useTutorChat({ chatId, initialMessages, prepare, onFinish }) {
  const [messages, setState] = useState(initialMessages);
  const [status, setStatus] = useState('ready');
  const [error, setError] = useState(null);
  const current = useRef(messages);
  const ctrl = useRef(null);
  const handlers = useRef({ prepare, onFinish });
  handlers.current = { prepare, onFinish };

  const setMessages = useCallback((next) => {
    setState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      current.current = value;
      return value;
    });
  }, []);
  // Leaving the conversation (another chat, another screen) lets a running answer finish, so the server saves it whole.

  const run = useCallback(async (list, question, trigger) => {
    if (ctrl.current) ctrl.current.abort();
    const controller = new AbortController();
    ctrl.current = controller;
    setError(null);
    setStatus('submitted');
    const base = list.length;
    const show = (m) => setMessages((prev) => [...prev.slice(0, base), m]);
    const finish = (outcome) => { if (ctrl.current === controller) ctrl.current = null; if (handlers.current.onFinish) handlers.current.onFinish(outcome); };
    const fail = (status, message, retryAfter) => { setError({ status, message, retryAfter: retryAfter || null }); setStatus('error'); finish({ message: null, isAbort: false, isError: true }); };

    const flag = Codi.state.scenario && Codi.state.scenario.aiAssistant;
    if (flag === 'ratelimit') { fail(429, RATE_LIMITED, 60); return; }
    if (flag === 'thinking' || flag === 'error') {
      await wait(flag === 'error' ? 1200 : 3_600_000, controller.signal);
      if (controller.signal.aborted) { const m = stoppedMessage(null); show(m); setStatus('ready'); finish({ message: m, isAbort: true, isError: false }); }
      else fail(500, UNAVAILABLE);
      return;
    }

    let pending = null;
    let timer = null;
    const flush = () => {
      timer = null;
      if (!pending || controller.signal.aborted) return;
      const m = pending; pending = null;
      show(m);
      setStatus('streaming');
    };
    try {
      const body = handlers.current.prepare({ id: chatId, messages: list, question, trigger });
      const result = await streamAiChat({
        body, signal: controller.signal,
        onMessage: (m) => { pending = m; if (!timer) timer = setTimeout(flush, THROTTLE_MS); },
      });
      if (timer) clearTimeout(timer);
      if (result.aborted) {
        const m = stoppedMessage(result.message);
        show(m);
        setStatus('ready');
        finish({ message: m, isAbort: true, isError: false });
        return;
      }
      if (result.failed) {
        // What arrived before the failure stays readable; an empty answer is dropped so the question can be retried.
        setMessages((prev) => (hasContent(result.message) ? [...prev.slice(0, base), result.message] : prev.slice(0, base)));
        fail(500, result.errorText || UNAVAILABLE);
        return;
      }
      show(result.message);
      setStatus('ready');
      finish({ message: result.message, isAbort: false, isError: false });
    } catch (e) {
      if (timer) clearTimeout(timer);
      setMessages((prev) => prev.slice(0, base));
      fail(e && typeof e.status === 'number' ? e.status : 500, (e && e.message) || UNAVAILABLE, e && e.body && e.body.retryAfter);
    }
  }, [chatId, setMessages]);

  const sendMessage = useCallback(({ text, metadata }) => {
    const question = { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }], metadata: { ...(metadata || {}), createdAt: new Date().toISOString() } };
    const list = [...current.current, question];
    setMessages(list);
    run(list, question, 'submit-message');
  }, [run, setMessages]);

  const regenerate = useCallback(() => {
    const list = current.current;
    let index = list.length - 1;
    while (index >= 0 && list[index].role !== 'user') index -= 1;
    if (index < 0) return;
    const kept = list.slice(0, index + 1);
    setMessages(kept);
    run(kept, kept[index], 'regenerate-message');
  }, [run, setMessages]);

  const stop = useCallback(() => { if (ctrl.current) ctrl.current.abort(); }, []);
  const clearError = useCallback(() => { setError(null); setStatus((s) => (s === 'error' ? 'ready' : s)); }, []);

  return { messages, status, error, sendMessage, regenerate, stop, setMessages, clearError };
}
