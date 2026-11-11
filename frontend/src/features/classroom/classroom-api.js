// Client of the AI classroom (learner) and the War Room council (lecturer). JSON calls go through api();
// the council run is a server-sent event stream read by readEventStream (one JSON object per `data:` line).
import { api, ApiError } from '../../lib/api';

const learnBase = (courseId, lessonId) => `/api/learn/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/classroom`;
const councilBase = (courseId, lessonId) => `/api/lecturer/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/council`;

export const classroomApi = {
  url: learnBase,
  start: (courseId, lessonId, checkpointId) => api.post(`${learnBase(courseId, lessonId)}/sessions`, { checkpointId }),
  act: (courseId, lessonId, sessionId, body) => api.post(`${learnBase(courseId, lessonId)}/sessions/${encodeURIComponent(sessionId)}`, body),
  chat: (courseId, lessonId, body) => api.post(`${learnBase(courseId, lessonId)}/chat`, body),
};

export const councilApi = {
  url: councilBase,
  run: (courseId, lessonId, runId) => api.get(`${councilBase(courseId, lessonId)}/${encodeURIComponent(runId)}`),
  apply: (courseId, lessonId, runId, checkpoints) => api.post(`${councilBase(courseId, lessonId)}/${encodeURIComponent(runId)}/apply`, checkpoints ? { checkpoints } : {}),
  clear: (courseId, lessonId) => api.del(councilBase(courseId, lessonId)),
  /** Starts a council run; onData receives each parsed event object. Resolves when the stream ends. */
  async stream(courseId, lessonId, { count, signal, onData }) {
    let res;
    try {
      res = await fetch(councilBase(courseId, lessonId), {
        method: 'POST', credentials: 'include', signal,
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' },
        body: JSON.stringify({ count }),
      });
    } catch (e) {
      if (e && e.name === 'AbortError') return { aborted: true };
      throw new ApiError('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', 0, null);
    }
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('text/event-stream')) {
      const data = await res.json().catch(() => null);
      throw new ApiError((data && data.error) || 'AI không khả dụng lúc này. Vui lòng thử lại sau ít phút.', res.status || 500, data);
    }
    return readEventStream(res, onData);
  },
};

/** Reads `data: <json>` events until `data: [DONE]` or the end of the body; comment lines (": ping") are skipped. */
export async function readEventStream(res, onData) {
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
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let data;
          try { data = JSON.parse(payload); } catch { continue; } // a malformed chunk is skipped; the saved run stays authoritative
          onData(data);
        }
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return { aborted: true };
    return { aborted: false, broken: true };
  }
  return { aborted: false };
}
