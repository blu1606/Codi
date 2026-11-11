/**
 * The tabs under the lesson material in the reader's "Nội dung" part (layout of the reference reader's tool panel, in
 * Codi's colours and type): Transcript (a video with a transcript only) · Tóm tắt · Hỏi đáp · Đánh giá.
 *
 * - WAI-ARIA tabs: one tab stop (roving tabindex), ←/→ move and select, Home/End jump. Every panel stays mounted and
 *   is only hidden, so a Q&A draft or the transcript's scroll survive tab switches.
 * - The last tab picked is remembered per browser; a lesson without that tab opens on its default (Transcript when
 *   the video has one, otherwise Tóm tắt).
 * - Transcript: one button per cue (timestamp + text). A click seeks the video there and plays; the cue being played
 *   is highlighted and kept in view inside the list's own scroller, except for a few seconds after the learner
 *   scrolls the list themselves.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Codi } from '../../lib/codi';
import { Icon, Stars } from '../../components/ui/primitives';
import { openReview } from './learning-shared';

const TAB_KEY = 'codi-lesson-content-tab';
function readTab() {
  try { return localStorage.getItem(TAB_KEY); } catch { return null; }
}
function writeTab(id) {
  try { localStorage.setItem(TAB_KEY, id); } catch { /* storage blocked: lasts for this visit */ }
}

/**
 * tabs: [{ id, label, icon, count?, panel }] in display order; defaultId: the tab shown when the remembered one is
 * not offered here.
 */
export function LessonContentTabs({ tabs, defaultId, label = 'Nội dung bài học' }) {
  const uid = useId();
  const listRef = useRef(null);
  const [chosen, setChosen] = useState(readTab);
  const ids = tabs.map((t) => t.id);
  const active = ids.includes(chosen) ? chosen : ids.includes(defaultId) ? defaultId : ids[0];
  const tabId = (id) => `${uid}-tab-${id}`;
  const panelId = (id) => `${uid}-panel-${id}`;

  const select = useCallback((id) => { setChosen(id); writeTab(id); }, []);

  // Keep the selected tab visible in a strip that scrolls sideways (phones). The strip is scrolled directly:
  // scrollIntoView would also move the reader's column.
  useEffect(() => {
    const strip = listRef.current;
    const el = strip && strip.querySelector('[aria-selected="true"]');
    if (!el) return;
    const s = strip.getBoundingClientRect(); const b = el.getBoundingClientRect();
    if (b.left < s.left) strip.scrollLeft -= s.left - b.left + 8;
    else if (b.right > s.right) strip.scrollLeft += b.right - s.right + 8;
  }, [active]);

  const onKeyDown = (e) => {
    const i = ids.indexOf(active);
    const to = { ArrowRight: (i + 1) % ids.length, ArrowLeft: (i - 1 + ids.length) % ids.length, Home: 0, End: ids.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    select(ids[to]);
    const el = document.getElementById(tabId(ids[to]));
    if (el) el.focus();
  };

  return (
    <div className="ln-ctabs">
      <div className="ln-ctabs-list" role="tablist" aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button key={t.id} type="button" role="tab" id={tabId(t.id)} className="ln-ctab" aria-selected={on} aria-controls={panelId(t.id)}
              tabIndex={on ? 0 : -1} onClick={() => select(t.id)}>
              {t.icon && <Icon name={t.icon} className="icon-sm" />}
              <span>{t.label}</span>
              {t.count ? <span className="ln-ctab-count">{t.count}</span> : null}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={panelId(t.id)} aria-labelledby={tabId(t.id)} className="ln-ctabs-panel" hidden={t.id !== active}>
          {t.panel}
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── Transcript ─────────────────────────
/** "1:05" or "1:02:05" for a cue start in seconds. */
export function cueTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** Index of the cue playing at `seconds`, or -1. A cue without its own end runs until the next one starts. */
export function activeCueIndex(cues, seconds) {
  if (!Number.isFinite(seconds)) return -1;
  for (let i = 0; i < cues.length; i += 1) {
    const { start, end } = cues[i];
    const until = Number.isFinite(end) && end > start ? end : i + 1 < cues.length ? cues[i + 1].start : Infinity;
    if (start <= seconds && seconds < until) return i;
  }
  return -1;
}

const USER_SCROLL_PAUSE_MS = 4000;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/** cues: [{ start, end?, text }] sorted by start; bridge: createVideoBridge() of the video above. */
export function TranscriptPanel({ cues, bridge }) {
  const [current, setCurrent] = useState(() => activeCueIndex(cues, bridge.currentTime()));
  const scrollRef = useRef(null);
  const pausedUntil = useRef(0);

  useEffect(() => {
    const pick = (t) => { const i = activeCueIndex(cues, t); setCurrent((c) => (c === i ? c : i)); };
    pick(bridge.currentTime());
    return bridge.subscribe(pick);
  }, [cues, bridge]);

  // The learner scrolling the list (wheel, touch, scrollbar, keys) holds the follow for a few seconds.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const hold = () => { pausedUntil.current = Date.now() + USER_SCROLL_PAUSE_MS; };
    const onPointer = (e) => { if (e.target === el) hold(); };
    const onKey = (e) => { if (SCROLL_KEYS.has(e.key)) hold(); };
    el.addEventListener('wheel', hold, { passive: true });
    el.addEventListener('touchmove', hold, { passive: true });
    el.addEventListener('pointerdown', onPointer);
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', hold); el.removeEventListener('touchmove', hold);
      el.removeEventListener('pointerdown', onPointer); el.removeEventListener('keydown', onKey);
    };
  }, []);

  // Follow the playing cue inside the list's own scroller only (never the page), and only while it is on screen.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || current < 0 || !box.clientHeight || Date.now() < pausedUntil.current) return;
    const cue = box.querySelector(`[data-cue="${current}"]`);
    if (!cue) return;
    const c = cue.getBoundingClientRect(); const b = box.getBoundingClientRect();
    if (c.top < b.top) box.scrollTop -= b.top - c.top + 8;
    else if (c.bottom > b.bottom) box.scrollTop += c.bottom - b.bottom + 8;
  }, [current]);

  const seek = (i) => {
    pausedUntil.current = 0;
    setCurrent(i);
    if (!bridge.seek(cues[i].start)) Codi.ui.toast('Video chưa sẵn sàng để tua. Vui lòng thử lại sau giây lát.', { type: 'info' });
  };

  return (
    <div className="ln-tr-wrap">
      <p className="small muted">Bấm vào một dòng để tua video đến đoạn đó.</p>
      <div className="ln-tr-scroll" ref={scrollRef}>
        <ol className="ln-tr-list" aria-label="Transcript của video">
          {cues.map((cue, i) => (
            <li key={`${cue.start}-${i}`}>
              <button type="button" className="ln-tr" data-cue={i} aria-current={i === current ? 'true' : undefined} onClick={() => seek(i)}>
                <time dateTime={`PT${Math.floor(cue.start)}S`}>{cueTime(cue.start)}</time>
                <span className="ln-tr-text">{cue.text}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ───────────────────────── Đánh giá ─────────────────────────
const STAR_VALUES = [1, 2, 3, 4, 5];
/** review: CoursePathView.review ({ rating, text } | null); onSaved(pathView) after the dialog saves. */
export function ReviewPanel({ courseId, title, review, onSaved }) {
  const open = (stars) => openReview({ courseId, title, review, stars, onSaved });
  const text = review && review.text ? review.text.trim() : '';
  if (review) {
    return (
      <div className="ln-rv">
        <div className="ln-rv-head">
          <Stars n={review.rating} label={`Bạn đã đánh giá ${review.rating} trên 5 sao`} />
          <span className="strong">Bạn đã đánh giá {review.rating}/5</span>
        </div>
        {text ? <blockquote className="ln-rv-text ln-pre">{text}</blockquote> : <p className="small muted">Bạn chưa viết nhận xét cho khoá học này.</p>}
        <div><button type="button" className="btn btn-secondary" onClick={() => open()}><Icon name="pencil" className="icon-sm" /> Sửa đánh giá</button></div>
      </div>
    );
  }
  return (
    <div className="ln-rv">
      <div className="stack-1">
        <h2 className="ln-h">Bạn thấy khoá học thế nào?</h2>
        <p className="small muted">Đánh giá của bạn hiển thị trên trang khoá học, giúp giảng viên cải thiện bài giảng và giúp người học khác chọn khoá phù hợp. Bạn có thể sửa lại bất cứ lúc nào.</p>
      </div>
      <div className="star-input" role="group" aria-label="Chọn số sao để đánh giá">
        {STAR_VALUES.map((n) => <button key={n} type="button" onClick={() => open(n)} aria-label={`${n} sao`}><Icon name="star" /></button>)}
      </div>
      <div><button type="button" className="btn btn-primary" onClick={() => open()}><Icon name="star" className="icon-sm" /> Đánh giá khoá học</button></div>
    </div>
  );
}
