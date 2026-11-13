/**
 * Video citations in AI answers. The lesson player provides VideoSeekContext ({ courseId, lessonId, maxSeconds,
 * seek(seconds, materialId?) }); inside it a "[mm:ss]" mark from the Tutor or the AI classroom becomes a button that
 * seeks the lesson video there, and a citation link to this lesson with ?m=…&t=… seeks in place instead of reloading.
 * Outside a lesson (the full Tutor page) the mark stays plain text and links open the lesson at that second.
 */
import { createContext, useContext } from 'react';
import { Icon } from '../../components/ui/primitives';
import { parseClock } from './video-watch';

export const VideoSeekContext = createContext(null);
export const useVideoSeek = () => useContext(VideoSeekContext);

/** "[mm:ss]" marks in a text (also "[m:ss]" and "[h:mm:ss]"), not followed by "(" (a Markdown link). */
export const TIMESTAMP = /\[((?:\d{1,2}:)?\d{1,3}:\d{2})\](?!\()/;

export function SeekChip({ label }) {
  const ctx = useVideoSeek();
  const seconds = parseClock(label);
  if (!ctx || seconds === null || seconds > ctx.maxSeconds) return <>{`[${label}]`}</>;
  return (
    <button type="button" className="vid-cite" onClick={() => ctx.seek(seconds)} title={`Tua video tới ${label}`} aria-label={`Tua video tới ${label}`}>
      <Icon name="play" className="icon-xs" /><span>{label}</span>
    </button>
  );
}

/** { seconds, materialId } when `href` points at a second of the open lesson's video, else null. */
export function seekTarget(href, ctx) {
  if (!ctx || !href) return null;
  let url;
  try { url = new URL(href, window.location.origin); } catch { return null; }
  const path = `/learn/${encodeURIComponent(ctx.courseId)}/${encodeURIComponent(ctx.lessonId)}`;
  const t = Number(url.searchParams.get('t'));
  if (url.pathname !== path || !url.searchParams.has('t') || !Number.isFinite(t) || t < 0) return null;
  const m = Number(url.searchParams.get('m'));
  return { seconds: t, materialId: Number.isInteger(m) && m > 0 ? m : null };
}
