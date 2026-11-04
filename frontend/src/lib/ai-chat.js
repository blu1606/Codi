/**
 * Client for Codi's shared Tutor turn, POST /api/ai/chat (lib/ai-chat-contract.ts). The reply is an AI SDK UI message
 * stream (server-sent events, one JSON chunk per `data:` line, ending with `data: [DONE]`); errors before the stream
 * starts are plain JSON ({ error, retryAfter? }) and are thrown as ApiError (status 429 = rate limited).
 *
 *   const result = await streamAiChat({ body, signal, onMessage: (assistantMessage) => … });
 *   result → { message, failed, errorText, aborted }
 *
 * `body` is the request the route validates: { id, context, message, history?, lesson?, trigger?, messageId? }.
 * onMessage receives a fresh UIMessage snapshot ({ id, role:'assistant', parts, metadata }) after every chunk:
 * text and reasoning parts ({ type, text, state:'streaming'|'done' }), step markers and tool parts
 * ({ type:'tool-<name>', toolCallId, state:'input-streaming'|'input-available'|'output-available'|'output-error',
 * input, output, errorText }) — the same shape GET /api/ai/chats/:id returns for stored messages.
 * An abort (signal) resolves with aborted: true and the partial message instead of throwing.
 */
import { ApiError } from './api';

const OFFLINE = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
const UNAVAILABLE = 'Tutor đang tạm nghỉ. Câu hỏi của bạn vẫn còn ở đây.';

/** Applies one stream chunk to the assistant message being built; returns the next snapshot (or the same one). */
function applyChunk(state, chunk) {
  const replace = (index, patch) => {
    const parts = state.message.parts.slice();
    parts[index] = { ...parts[index], ...patch };
    state.message = { ...state.message, parts };
  };
  const push = (part) => { state.message = { ...state.message, parts: [...state.message.parts, part] }; return state.message.parts.length - 1; };
  const merge = (meta) => { if (meta) state.message = { ...state.message, metadata: { ...state.message.metadata, ...meta } }; };
  switch (chunk.type) {
    case 'start':
      if (chunk.messageId) state.message = { ...state.message, id: chunk.messageId };
      merge(chunk.messageMetadata);
      break;
    case 'start-step': push({ type: 'step-start' }); break;
    case 'text-start': case 'reasoning-start': {
      const type = chunk.type === 'text-start' ? 'text' : 'reasoning';
      state.open[`${type}:${chunk.id}`] = push({ type, text: '', state: 'streaming' });
      break;
    }
    case 'text-delta': case 'reasoning-delta': {
      const type = chunk.type === 'text-delta' ? 'text' : 'reasoning';
      let index = state.open[`${type}:${chunk.id}`];
      if (index === undefined) index = state.open[`${type}:${chunk.id}`] = push({ type, text: '', state: 'streaming' });
      replace(index, { text: state.message.parts[index].text + (chunk.delta || '') });
      break;
    }
    case 'text-end': case 'reasoning-end': {
      const index = state.open[`${chunk.type === 'text-end' ? 'text' : 'reasoning'}:${chunk.id}`];
      if (index !== undefined) replace(index, { state: 'done' });
      break;
    }
    case 'tool-input-start':
      state.tools[chunk.toolCallId] = push({ type: `tool-${chunk.toolName}`, toolCallId: chunk.toolCallId, state: 'input-streaming', input: undefined });
      break;
    case 'tool-input-available': {
      const index = state.tools[chunk.toolCallId];
      if (index === undefined) state.tools[chunk.toolCallId] = push({ type: `tool-${chunk.toolName}`, toolCallId: chunk.toolCallId, state: 'input-available', input: chunk.input });
      else replace(index, { state: 'input-available', input: chunk.input });
      break;
    }
    case 'tool-input-error': case 'tool-output-error': {
      const index = state.tools[chunk.toolCallId];
      if (index !== undefined) replace(index, { state: 'output-error', errorText: chunk.errorText || null });
      break;
    }
    case 'tool-output-available': {
      const index = state.tools[chunk.toolCallId];
      if (index !== undefined) replace(index, { state: 'output-available', output: chunk.output });
      break;
    }
    case 'message-metadata': case 'finish': merge(chunk.messageMetadata); break;
    case 'error': state.failed = true; state.errorText = chunk.errorText || UNAVAILABLE; break;
    case 'abort': state.aborted = true; break;
    default: break; // tool-input-delta, finish-step, data parts: nothing to show
  }
}

export async function streamAiChat({ body, signal, onMessage }) {
  let res;
  try {
    res = await fetch('/api/ai/chat', {
      method: 'POST', credentials: 'include', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e && e.name === 'AbortError') return { message: null, failed: false, errorText: null, aborted: true };
    throw new ApiError(OFFLINE, 0, null);
  }
  const type = res.headers.get('content-type') || '';
  if (!res.ok || type.includes('application/json')) {
    const data = await res.json().catch(() => null);
    throw new ApiError((data && data.error) || UNAVAILABLE, res.status || 500, data);
  }

  const state = { message: { id: `local-${crypto.randomUUID()}`, role: 'assistant', parts: [], metadata: {} }, open: {}, tools: {}, failed: false, errorText: null, aborted: false };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        let changed = false;
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let chunk;
          try { chunk = JSON.parse(payload); } catch { continue; } // a malformed chunk is skipped; the saved chat stays authoritative
          const before = state.message;
          applyChunk(state, chunk);
          if (state.message !== before) changed = true;
        }
        if (changed && onMessage) onMessage(state.message);
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') state.aborted = true;
    else { state.failed = true; state.errorText = UNAVAILABLE; }
  }
  return { message: state.message, failed: state.failed, errorText: state.errorText, aborted: state.aborted };
}
