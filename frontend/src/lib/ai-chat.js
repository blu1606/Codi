/**
 * Client for Codi's shared Tutor turn, POST /api/ai/chat (lib/ai-chat-contract.ts). The reply is an AI SDK UI message
 * stream (server-sent events, one JSON chunk per `data:` line, ending with `data: [DONE]`); errors before the stream
 * starts are plain JSON ({ error, retryAfter? }) and are thrown as ApiError.
 *
 *   const turn = await streamAiChat({ chatId, context, text, onText: (soFar) => … , signal });
 *   turn → { messageId, text, tools: { [toolName]: output[] }, failed, stopped }
 *
 * chatId is a UUID the client picks for a new chat and keeps for its follow-ups. context is
 * { kind: 'general', label, href } or { kind: 'lesson', courseId, lessonId }. Guests pass `history` (≤ 12 recent
 * turns as { role: 'user'|'assistant', text }); signed-in chats are stored on the server.
 */
import { ApiError } from './api';

const GUEST_TURNS = 12;
const newId = (prefix) => `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
export const newChatId = () => crypto.randomUUID();

/** A stored chat message (UIMessage) as plain text. */
export const messageText = (m) => ((m && m.parts) || []).map((p) => (p.type === 'text' ? p.text : '')).join('').trim();

/** Tool outputs of a stored or streamed message, by tool name (parts typed `tool-<name>` with state output-available). */
export function toolOutputs(m) {
  const out = {};
  for (const p of (m && m.parts) || []) {
    if (typeof p.type === 'string' && p.type.startsWith('tool-') && p.state === 'output-available') {
      const name = p.type.slice(5);
      (out[name] = out[name] || []).push({ toolCallId: p.toolCallId, output: p.output });
    }
  }
  return out;
}

export async function streamAiChat({ chatId, context, text, hint = false, history, lesson, signal, onText }) {
  const body = {
    id: chatId,
    context,
    message: { id: newId('user'), role: 'user', parts: [{ type: 'text', text }], ...(hint ? { metadata: { hint: true } } : {}) },
    ...(history && history.length
      ? { history: history.slice(-GUEST_TURNS).map((t) => ({ id: newId('turn'), role: t.role, parts: [{ type: 'text', text: t.text }] })) }
      : {}),
    ...(lesson ? { lesson } : {}),
  };
  let res;
  try {
    res = await fetch('/api/ai/chat', {
      method: 'POST', credentials: 'include', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new ApiError('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', 0, null);
  }
  const type = res.headers.get('content-type') || '';
  if (!res.ok || type.includes('application/json')) {
    const data = await res.json().catch(() => null);
    throw new ApiError((data && data.error) || 'Tutor đang tạm nghỉ. Câu hỏi của bạn vẫn còn ở đây.', res.status, data);
  }

  const turn = { messageId: null, text: '', tools: {}, failed: false, stopped: false, errorText: null };
  const toolNames = {};
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (chunk) => {
    switch (chunk.type) {
      case 'start': if (chunk.messageId) turn.messageId = chunk.messageId; break;
      case 'text-delta': turn.text += chunk.delta || ''; if (onText) onText(turn.text); break;
      case 'tool-input-start':
      case 'tool-input-available': toolNames[chunk.toolCallId] = chunk.toolName; break;
      case 'tool-output-available': {
        const name = toolNames[chunk.toolCallId];
        if (name) (turn.tools[name] = turn.tools[name] || []).push({ toolCallId: chunk.toolCallId, output: chunk.output });
        break;
      }
      case 'error': turn.failed = true; turn.errorText = chunk.errorText || null; break;
      case 'abort': turn.stopped = true; break;
      default: break;
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const event = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try { handle(JSON.parse(payload)); } catch { /* a malformed chunk is skipped; the saved chat stays authoritative */ }
      }
    }
  }
  turn.text = turn.text.trim();
  return turn;
}
