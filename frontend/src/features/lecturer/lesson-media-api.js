/**
 * Lecture media client: upload a lesson file (video, PDF, PPTX, DOCX) with progress, let the AI read it, draft
 * a summary + quiz from it. Backend: /api/lecturer/courses/:courseId/{media, ai-source, ai-draft}.
 *
 *   const up = await uploadLessonFile(courseId, file, { onProgress, signal });
 *     → { upload: {id, fileName, kind, sizeKb, durationSeconds}, material: {type,title,url,fileSizeKb,durationSeconds} | null, storageError }
 *   const src = await readLessonSource(courseId, { uploadId } | { materialUrl, fileName }, { signal });
 *     → { sourceId, kind, fileName, pages, ocrPages, durationSec, frames, speech, chars, outline[], warnings[] }
 *   const { draft } = await draftLesson(courseId, { sourceId, quizCount, difficulty, lessonTitle }, { signal });
 *     → draft: { title, summary, outline[], questions[] }
 * Errors are ApiError (message from the server, status: 413 too large, 415 wrong type, 429 AI limit, …).
 */
import { api, ApiError } from '../../lib/api';

const base = (courseId) => `/api/lecturer/courses/${encodeURIComponent(courseId)}`;

export const ACCEPT = {
  video: '.mp4,.m4v,.mov,.webm,.mkv,video/mp4,video/quicktime,video/webm,video/x-matroska',
  pdf: '.pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation',
  any: '.pdf,.pptx,.docx,.mp4,.m4v,.mov,.webm,.mkv',
};
export const MAX_MB = { video: 500, doc: 50 };
const isVideoName = (name) => /\.(mp4|m4v|mov|webm|mkv)$/i.test(name || '');

/** Client-side check before sending (the server checks again, including the file's real format). */
export function checkFile(file, allowed) {
  if (!file) return 'Chưa chọn tệp.';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const ok = allowed === 'video' ? isVideoName(file.name) : allowed === 'pdf' ? ['pdf', 'pptx'].includes(ext) : ['pdf', 'pptx', 'docx', 'mp4', 'm4v', 'mov', 'webm', 'mkv'].includes(ext);
  if (!ok) return allowed === 'video' ? 'Chỉ nhận video MP4, MOV, WEBM hoặc MKV.' : allowed === 'pdf' ? 'Chỉ nhận PDF hoặc PPTX.' : 'Chỉ nhận PDF, PPTX, DOCX hoặc video.';
  const max = isVideoName(file.name) ? MAX_MB.video : MAX_MB.doc;
  if (file.size > max * 1024 * 1024) return `Tệp vượt quá ${max}MB.`;
  if (!file.size) return 'Tệp rỗng.';
  return null;
}

export function uploadLessonFile(courseId, file, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${base(courseId)}/media`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError((data && data.error) || (xhr.status === 413 ? 'Tệp quá lớn.' : 'Không tải được tệp lên. Vui lòng thử lại.'), xhr.status, data));
    };
    xhr.onerror = () => reject(new ApiError('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', 0, null));
    xhr.onabort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    if (signal) signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export const readLessonSource = (courseId, body, opts) => api.post(`${base(courseId)}/ai-source`, body, opts);
export const draftLesson = (courseId, body, opts) => api.post(`${base(courseId)}/ai-draft`, body, opts);

/** True for a material URL the AI can read (a file uploaded to Codi), false for YouTube / external links. */
export const isStoredMedia = (url) => /^\/api\/lesson-media\?key=lesson-media%2F/.test(url || '') || /\/lesson-media\/[^/]+\/[0-9a-f-]{36}\.\w+$/.test(url || '');

export const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const fmtSize = (kb) => (kb >= 1024 ? `${(kb / 1024).toFixed(1).replace('.', ',')} MB` : `${kb} KB`);
