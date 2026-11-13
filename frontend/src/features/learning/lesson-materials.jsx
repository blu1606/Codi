/**
 * Lesson materials (port of real components/lesson-material-view.tsx + youtube-material.tsx + lib/youtube.ts).
 *
 * - YouTube URL: privacy-enhanced embed with the IFrame Player API; position saved on pause, every 10 s while
 *   playing, on end and when the page hides. Blocked API → "Không theo dõi được tiến độ video" (still watchable).
 * - Video without a URL: a simulated player (same 90% rule and saved position).
 * - PDF/slide: one page at a time with a pager (an uploaded PDF in the browser's viewer opened at that page, otherwise
 *   a simulated page; pdf.js is not bundled); every page must be seen to count as studied (real
 *   recordPdfPage), with the page text view and the "Mở PDF trong trình duyệt" escape hatch when a URL exists.
 * Progress writes are lesson commands ({type:'video'|'pdf-page'}) sent through `save`; a failed write shows
 * "Chưa lưu được tiến độ tài liệu" + "Thử lưu lại". The server decides "studied" (90% watched, every page seen).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Codi } from '../../lib/codi';
import { Alert, Icon } from '../../components/ui/primitives';
import { isStoredMedia } from '../lecturer/lesson-media-api';
import { coveredSeconds, createWatchTracker } from './video-watch';

// ───────────────────────── video bridge (transcript ↔ player) ─────────────────────────
/**
 * Link between the playing video and the transcript: the video attaches a player ({ seek(seconds), time() }) and
 * publishes its position while it plays; the transcript seeks through it and subscribes to the position. One bridge
 * per lesson pane; the video that is mounted owns it.
 */
export function createVideoBridge() {
  let player = null;
  let last = 0;
  const subs = new Set();
  return {
    attach(p) { player = p; return () => { if (player === p) player = null; }; },
    /** Seeks the attached video and plays it; false when no video is ready to seek. */
    seek(seconds) {
      if (!player) return false;
      try { return player.seek(seconds) !== false; } catch { return false; }
    },
    publish(seconds) {
      if (!Number.isFinite(seconds) || seconds === last) return;
      last = seconds;
      subs.forEach((fn) => fn(seconds));
    },
    currentTime() {
      if (player) { try { const t = player.time(); if (Number.isFinite(t)) return t; } catch { /* player gone */ } }
      return last;
    },
    /** Pauses / resumes the attached video (the AI classroom stops it at a checkpoint and resumes it after). */
    pause() { if (player && player.pause) { try { player.pause(); } catch { /* player gone */ } } },
    play() { if (player && player.play) { try { player.play(); } catch { /* player gone */ } } },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    /** Stretches the mounted video of material `id` has played but maybe not saved yet ([] otherwise). */
    watched(id) {
      if (!player || player.materialId !== id || !player.watched) return [];
      try { return player.watched(); } catch { return []; }
    },
    /** The material whose video is mounted, or null. */
    materialId() { return player ? player.materialId ?? null : null; },
  };
}

// "Đã xem thực tế N%": watched stretches only, so seeking ahead does not raise it.
function watchedNote(m, progress) {
  if (!(m.durationSeconds > 0) || !progress || !Array.isArray(progress.watched)) return '';
  const pct = Math.min(100, Math.round((coveredSeconds(progress.watched, m.durationSeconds) / m.durationSeconds) * 100));
  return ` Đã xem thực tế ${pct}% thời lượng.`;
}
const TIME_POLL_MS = 250;

// ───────────────────────── YouTube helpers (real lib/youtube.ts) ─────────────────────────
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const WATCH_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const EMBED_HOSTS = new Set([...WATCH_HOSTS, 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
export function youtubeVideoId(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  let id = null;
  if (host === 'youtu.be' && segments.length === 1) id = segments[0];
  else if (WATCH_HOSTS.has(host) && url.pathname === '/watch') id = url.searchParams.get('v');
  else if (EMBED_HOSTS.has(host) && segments.length === 2 && segments[0] === 'embed') id = segments[1];
  return id && VIDEO_ID.test(id) ? id : null;
}
function youtubeEmbedUrl(id, { origin, start } = {}) {
  const params = new URLSearchParams({ enablejsapi: '1', rel: '0', playsinline: '1' });
  if (origin) params.set('origin', origin);
  if (start && Number.isFinite(start) && start > 0) params.set('start', String(Math.floor(start)));
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}
const youtubeWatchUrl = (id) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

const API_SRC = 'https://www.youtube.com/iframe_api';
let api = null;
const apiReady = () => (window.YT && typeof window.YT.Player === 'function' && window.YT.PlayerState ? window.YT : null);
/** Loads the IFrame Player API once per page; a failed load can be retried. */
function loadYouTubeApi() {
  const ready = apiReady();
  if (ready) return Promise.resolve(ready);
  if (!api) {
    api = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      const fail = (error) => { clearTimeout(timer); api = null; reject(error); };
      const timer = setTimeout(() => fail(new Error('YouTube API timed out')), 15000);
      window.onYouTubeIframeAPIReady = () => {
        if (previous) previous();
        clearTimeout(timer);
        const ns = apiReady();
        if (ns) resolve(ns); else fail(new Error('YouTube API unavailable'));
      };
      const existing = document.querySelector(`script[src="${API_SRC}"]`);
      const script = existing || document.createElement('script');
      if (!existing) { script.src = API_SRC; script.async = true; document.head.append(script); }
      script.addEventListener('error', () => { script.remove(); fail(new Error('YouTube API blocked')); }, { once: true });
    });
  }
  return api;
}

function YouTubeFrame({ videoId, title, startSeconds, bridge, tracker, materialId, onTracked, onUntracked, onLoaded, onPosition, onError }) {
  const frame = useRef(null);
  const cb = useRef({ onTracked, onUntracked, onPosition, onError, bridge });
  cb.current = { onTracked, onUntracked, onPosition, onError, bridge };
  // Origin and start are fixed for the life of this iframe; changing src would reload it.
  const [src] = useState(() => youtubeEmbedUrl(videoId, { origin: window.location.origin, start: startSeconds }));
  useEffect(() => {
    const el = frame.current;
    if (!el) return undefined;
    let cancelled = false; let player = null; let ready = false; let ended = false; let interval = null;
    let poll = null; let detach = null;
    const stopInterval = () => { if (interval) clearInterval(interval); interval = null; };
    // The IFrame API has no time event: while playing, the position is read a few times a second for the transcript.
    const publish = () => {
      if (!player || !ready) return;
      const t = player.getCurrentTime();
      tracker.tick(t);
      const b = cb.current.bridge; if (b) b.publish(t);
    };
    const stopPoll = () => { if (poll) clearInterval(poll); poll = null; };
    const read = () => {
      if (!player || !ready) return null;
      const seconds = player.getCurrentTime();
      return Number.isFinite(seconds) ? { seconds, ended } : null;
    };
    const savePos = () => { const p = read(); if (p) cb.current.onPosition(p.seconds, p.ended, player.getDuration()); };
    const onHide = () => { if (document.visibilityState === 'hidden') savePos(); };
    window.addEventListener('pagehide', savePos);
    document.addEventListener('visibilitychange', onHide);
    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      player = new YT.Player(el, {
        events: {
          onReady: () => {
            if (cancelled) return;
            ready = true;
            const b = cb.current.bridge;
            if (b) {
              detach = b.attach({
                seek: (seconds) => { tracker.reset(); player.seekTo(seconds, true); player.playVideo(); b.publish(seconds); return true; },
                time: () => player.getCurrentTime(),
                pause: () => player.pauseVideo(),
                play: () => player.playVideo(),
                materialId,
                watched: () => tracker.ranges(),
              });
            }
            cb.current.onTracked();
          },
          onStateChange: ({ data }) => {
            if (!ready) return;
            if (data === YT.PlayerState.PLAYING) {
              ended = false;
              tracker.reset(); tracker.tick(player.getCurrentTime());
              if (!interval) interval = setInterval(savePos, 10000);
              if (!poll) poll = setInterval(publish, TIME_POLL_MS);
            } else if (data === YT.PlayerState.PAUSED) { stopInterval(); stopPoll(); publish(); tracker.reset(); savePos(); }
            else if (data === YT.PlayerState.BUFFERING) { publish(); tracker.reset(); }
            else if (data === YT.PlayerState.ENDED) {
              stopInterval(); stopPoll(); publish(); tracker.reset(); ended = true;
              const duration = player.getDuration();
              cb.current.onPosition(Math.max(player.getCurrentTime(), Number.isFinite(duration) ? duration : 0), true, duration);
            }
          },
          // 2 bad id, 5 HTML5 error, 100 removed/private, 101/150 embedding disabled.
          onError: () => { if (!cancelled) cb.current.onError(); },
        },
      });
    }).catch(() => { if (!cancelled) cb.current.onUntracked(); });
    return () => {
      cancelled = true;
      stopInterval();
      stopPoll();
      if (detach) detach();
      savePos();
      window.removeEventListener('pagehide', savePos);
      document.removeEventListener('visibilitychange', onHide);
      try { if (player) player.destroy(); } catch { /* iframe already detached */ }
    };
  }, []);
  return (
    <div className="ln-frame"><div className="ln-yt">
      <iframe ref={frame} src={src} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin" allowFullScreen onLoad={onLoaded} />
    </div></div>
  );
}

function SaveWarning({ onRetry, busy }) {
  return (
    <Alert type="warn" title="Chưa lưu được tiến độ tài liệu" body="Bạn có thể tiếp tục học và thử lưu lại."
      actions={<button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} disabled={busy} aria-busy={busy || undefined}>Thử lưu lại</button>} />
  );
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// The backend stores the page count with the progress; a PDF never opened here starts with the prototype's 8 pages.
const pdfPageTotal = (m, prog) => Math.max(1, Math.min(2000, Number(m.pages) || (prog && prog.pageCount) || 8));

/**
 * Short progress readout for the selected material ("04:00/18:00", "PDF 3/12"), or null when there is nothing
 * reported yet. media: LessonPlayerView.media ({[materialId]: {seconds?, pages?, pageCount?, lastPage?}}).
 */
export function materialProgress(media, m) {
  if (!m) return null;
  const p = (media || {})[m.id];
  if (m.type === 'video') {
    const pos = p && p.seconds;
    if (!Number.isFinite(pos)) return null;
    return m.durationSeconds > 0 ? `${clock(pos)}/${clock(m.durationSeconds)}` : clock(pos);
  }
  if (m.type === 'pdf' || m.type === 'slide') {
    const total = pdfPageTotal(m, p);
    const seen = p && p.pageCount === total ? (p.pages || []).length : 0;
    return `${m.type === 'slide' ? 'Slide' : 'PDF'} ${seen}/${total}`;
  }
  return null;
}

// ───────────────────────── simulated video (material without a URL) ─────────────────────────
function SimulatedVideo({ m, progress, lessonMin, save, bridge }) {
  const total = m.durationSeconds || (lessonMin || 0) * 60;
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(() => Math.min(total, (progress && progress.seconds) || 0));
  const posRef = useRef(pos);
  posRef.current = pos;
  const startPos = useRef(pos);
  const lastSaved = useRef(Date.now());
  const [tracker] = useState(() => createWatchTracker(progress && progress.watched));
  useEffect(() => { if (bridge) bridge.publish(pos); }, [bridge, pos]);
  useEffect(() => {
    if (!bridge) return undefined;
    return bridge.attach({
      materialId: m.id,
      watched: () => tracker.ranges(),
      seek: (seconds) => {
        const next = Math.max(0, Math.min(total, seconds));
        posRef.current = next; setPos(next);
        lastSaved.current = Date.now();
        if (next < total) setPlaying(true);
        return true;
      },
      time: () => posRef.current,
      pause: () => { setPlaying(false); },
      play: () => { if (posRef.current < total) { lastSaved.current = Date.now(); setPlaying(true); } },
    });
  }, [bridge, total, m.id, tracker]);
  const send = useCallback((ended) => save({ type: 'video', materialId: m.id, seconds: Math.floor(posRef.current), ended: !!ended, watched: tracker.ranges() }), [m.id, save, tracker]);
  useEffect(() => {
    if (!playing || !total) return undefined;
    const t = setInterval(() => {
      const next = Math.min(total, posRef.current + total * 0.04);
      tracker.add(posRef.current, next);
      posRef.current = next; setPos(next);
      if (next >= total) { setPlaying(false); send(true); return; }
      if (Date.now() - lastSaved.current >= 10000) { lastSaved.current = Date.now(); send(false); }
    }, 400);
    return () => clearInterval(t);
  }, [playing, total, send]);
  // Leaving the lesson pauses and saves, like the real pagehide/unmount save.
  useEffect(() => () => { if (posRef.current > 0) send(false); }, [send]);
  const toggle = () => {
    if (playing) { setPlaying(false); send(false); return; }
    if (posRef.current >= total) { posRef.current = 0; setPos(0); }
    lastSaved.current = Date.now();
    setPlaying(true);
  };
  const pct = total ? (pos / total) * 100 : 0;
  // No real video URL: a poster with the title, length and a clear play control (never an empty dark box).
  return (
    <section className="stack-3" aria-label={m.title}>
      <div className={`ln-frame ln-video ${playing ? 'is-playing' : ''}`.trim()}>
        <div className="ln-video-screen">
          <div className="ln-poster">
            <button type="button" className="ln-play" onClick={toggle} aria-label={playing ? 'Tạm dừng' : 'Phát video'}><Icon name={playing ? 'pause' : 'play'} className="icon-lg" /></button>
            <span className="ln-poster-title">{m.title}</span>
            <span className="ln-poster-meta">Video · {Codi.fmt.duration(Math.max(1, Math.round(total / 60)))}{pct > 0 && pct < 100 ? ` · đã xem ${Math.round(pct)}%` : pct >= 100 ? ' · đã xem hết' : ''}</span>
          </div>
          <div className="ln-video-bar">
            <span className="ln-timecode">{mmss(pos)} / {mmss(total)}</span>
            <div className="ln-track" role="progressbar" aria-label="Tiến độ video" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><span style={{ width: pct + '%' }} /></div>
          </div>
        </div>
      </div>
      <p className="small muted">Vị trí xem được lưu tự động khi tạm dừng và mỗi 10 giây.{startPos.current > 0 ? ` Tiếp tục từ giây ${Math.floor(startPos.current)}.` : ''}{watchedNote(m, progress)}</p>
    </section>
  );
}

// ───────────────────────── uploaded video (file stored on Codi) ─────────────────────────
/** Native player for a lecturer-uploaded video: resumes, saves on pause / end / every 10 s / leaving the lesson. */
function FileVideo({ m, progress, save, onFail, bridge }) {
  const ref = useRef(null);
  const start = useRef(Math.floor((progress && progress.seconds) || 0));
  const lastSaved = useRef(0);
  const [tracker] = useState(() => createWatchTracker(progress && progress.watched));
  useEffect(() => {
    if (!bridge) return undefined;
    return bridge.attach({
      materialId: m.id,
      watched: () => tracker.ranges(),
      seek: (seconds) => {
        const v = ref.current; if (!v) return false;
        tracker.reset();
        v.currentTime = seconds;
        const played = v.play();
        if (played && typeof played.catch === 'function') played.catch(() => { /* autoplay refused: the position is still set */ });
        bridge.publish(seconds);
        return true;
      },
      time: () => (ref.current ? ref.current.currentTime : 0),
      pause: () => { if (ref.current) ref.current.pause(); },
      play: () => {
        const v = ref.current; if (!v) return;
        const played = v.play();
        if (played && typeof played.catch === 'function') played.catch(() => { /* autoplay refused */ });
      },
    });
  }, [bridge, m.id, tracker]);
  const send = useCallback((ended) => {
    const v = ref.current; if (!v || !Number.isFinite(v.currentTime)) return;
    lastSaved.current = Date.now();
    save({ type: 'video', materialId: m.id, seconds: Math.floor(ended && Number.isFinite(v.duration) ? v.duration : v.currentTime), ended: !!ended, watched: tracker.ranges() });
  }, [m.id, save, tracker]);
  useEffect(() => () => { const v = ref.current; if (v && v.currentTime > 0 && !v.ended) send(false); }, [send]);
  return (
    <section className="stack-3" aria-label={m.title}>
      <div className="ln-frame">
        <video ref={ref} className="ln-file-video" src={m.url} controls preload="metadata" playsInline
          onLoadedMetadata={(e) => { const v = e.currentTarget; if (start.current > 0 && start.current < (v.duration || 0) - 2) v.currentTime = start.current; }}
          onPlay={(e) => { tracker.reset(); tracker.tick(e.currentTarget.currentTime); }}
          onPause={(e) => { tracker.tick(e.currentTarget.currentTime); tracker.reset(); if (!e.currentTarget.ended) send(false); }}
          onEnded={(e) => { tracker.tick(e.currentTarget.currentTime); tracker.reset(); send(true); }} onError={onFail}
          onWaiting={() => tracker.reset()} onSeeking={() => tracker.reset()}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (!v.paused && !v.seeking) tracker.tick(v.currentTime);
            if (bridge) bridge.publish(v.currentTime);
            if (Date.now() - lastSaved.current >= 10000) send(false);
          }}
          onSeeked={(e) => { tracker.reset(); if (bridge) bridge.publish(e.currentTarget.currentTime); }}>
          Trình duyệt không phát được video này.
        </video>
      </div>
      <p className="small muted">Vị trí xem được lưu tự động khi tạm dừng và mỗi 10 giây.{start.current > 0 ? ` Tiếp tục từ giây ${start.current}.` : ''}{watchedNote(m, progress)}</p>
    </section>
  );
}

// ───────────────────────── YouTube material ─────────────────────────
function YouTubeMaterial({ m, videoId, progress, save, onFail, bridge }) {
  const [status, setStatus] = useState('loading');
  const [untracked, setUntracked] = useState(false);
  const saved = useRef(Math.floor((progress && progress.seconds) || 0));
  const [tracker] = useState(() => createWatchTracker(progress && progress.watched));
  const signature = useRef(null);
  useEffect(() => {
    if (status !== 'loading') return undefined;
    const t = setTimeout(() => onFail(), 30000);
    return () => clearTimeout(t);
  }, [status, onFail]);
  const onPosition = useCallback((position, ended, duration) => {
    if (!Number.isFinite(position)) return;
    let seconds = Math.max(0, Math.floor(position));
    const dur = Number.isFinite(duration) && duration > 0 ? duration : m.durationSeconds;
    if (dur) seconds = Math.min(seconds, Math.floor(dur));
    const watched = tracker.ranges();
    const key = `${seconds}:${ended}:${JSON.stringify(watched)}`;
    if (signature.current === key || (signature.current && signature.current.startsWith(`${seconds}:true:`) && !ended)) return;
    signature.current = key;
    save({ type: 'video', materialId: m.id, seconds, ended: !!ended, watched });
  }, [m.id, m.durationSeconds, save, tracker]);
  return (
    <section className="stack-3" aria-label={m.title}>
      {status === 'loading' && <p className="row small muted" role="status"><Icon name="loader" className="icon-sm ln-spin" /> Đang tải video…</p>}
      <YouTubeFrame videoId={videoId} title={m.title} startSeconds={saved.current} bridge={bridge} tracker={tracker} materialId={m.id}
        onTracked={() => setStatus('ready')} onUntracked={() => { setUntracked(true); setStatus('ready'); }}
        onLoaded={() => setStatus((s) => (s === 'loading' ? 'ready' : s))} onPosition={onPosition} onError={onFail} />
      {untracked
        ? <Alert type="warn" title="Không theo dõi được tiến độ video" body="Video vẫn xem được nhưng vị trí xem sẽ không được lưu. Xem xong, hãy bấm “Đánh dấu đã học xong”." />
        : <p className="small muted">Vị trí xem được lưu tự động khi tạm dừng và mỗi 10 giây.{saved.current > 0 ? ` Tiếp tục từ giây ${saved.current}.` : ''}{watchedNote(m, progress)}</p>}
    </section>
  );
}

// ───────────────────────── simulated PDF ─────────────────────────
const pageCaption = (page, total) => (page === 1 ? 'Mục tiêu bài học' : page === total ? 'Tóm tắt và bài tập về nhà' : 'Nội dung chính · phần ' + (page - 1));
/**
 * Page count of a PDF file: the largest /Count of its page tree. A PDF whose page tree sits in a compressed object
 * stream does not expose it; that returns null and the stored or default count is kept.
 */
async function readPdfPageCount(url) {
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const text = new TextDecoder('latin1').decode(await res.arrayBuffer());
    const counts = [...text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)].map((x) => Number(x[1] || x[2]));
    const n = counts.length ? Math.max(...counts) : 0;
    return n > 0 && n <= 2000 ? n : null;
  } catch { return null; }
}

/**
 * One viewer per PDF/slide. A real PDF file (fileUrl) shows the current page in the browser's viewer, opened at that
 * page and driven by the pager below; without a file the page is a placeholder card. Either way each page shown is
 * recorded, so seeing every page marks the material studied.
 */
function PdfMaterial({ m, progress, save, fileUrl }) {
  const needsCount = !!fileUrl && !Number(m.pages);
  // undefined: still reading the file; 0: unknown (stored or default count used); n: pages in the file
  const [fileTotal, setFileTotal] = useState(undefined);
  useEffect(() => {
    if (!needsCount) return undefined;
    let live = true;
    readPdfPageCount(fileUrl).then((n) => { if (live) setFileTotal(n || 0); });
    return () => { live = false; };
  }, [needsCount, fileUrl]);
  const total = fileTotal || pdfPageTotal(m, progress);
  const page = Math.min(total, (progress && progress.lastPage) || 1);
  const seen = progress && progress.pageCount === total ? progress.pages || [] : [];
  const view = useCallback((p) => save({ type: 'pdf-page', materialId: m.id, page: p, pages: total }), [m.id, total, save]);
  // Opening the material records the page on screen, like the real render of the current page. A file waits for its
  // page count, so the first record already carries the real total.
  const ready = !needsCount || fileTotal !== undefined;
  useEffect(() => { if (ready && !seen.includes(page)) view(page); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const text = `${m.title}. ${pageCaption(page, total)}.`;
  return (
    <section className="stack-3" aria-label={m.title}>
      <div className="ln-media ln-pdf">
        {fileUrl
          ? <iframe key={page} className={`ln-file-pdf ${m.type === 'slide' ? 'is-slide' : ''}`.trim()} src={`${fileUrl}#page=${page}&view=Fit&toolbar=0&navpanes=0`} title={`${m.title}, trang ${page}`} />
          : <div className="ln-slide" role="img" aria-label={`${m.title}, trang ${page}`}><span className="xsmall muted">Trang {page}</span><strong>{m.title}</strong><span className="small muted">{pageCaption(page, total)}</span></div>}
        <div className="row-between ln-pdf-nav">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => view(page - 1)} disabled={page <= 1}><Icon name="chevron-left" className="icon-sm" /> Trang trước</button>
          <span className="small strong">Trang {page}/{total}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => view(page + 1)} disabled={page >= total}>Trang sau <Icon name="chevron-right" className="icon-sm" /></button>
        </div>
      </div>
      <p className="small muted">Đã xem {seen.length}/{total} trang. Xem đủ các trang để đánh dấu học xong tự động.</p>
      {!fileUrl && <details className="ln-pdf-text"><summary className="small">Đọc nội dung trang dưới dạng văn bản</summary><p className="small">{text}</p></details>}
      {m.url && <a className="small row" href={m.url} target="_blank" rel="noopener noreferrer">Mở PDF trong trình duyệt <Icon name="external-link" className="icon-sm" /></a>}
    </section>
  );
}

// ───────────────────────── one material ─────────────────────────
/**
 * m: LessonMaterial {id, type, title, url, durationSeconds}; progress: media[m.id]; lessonMin: lesson length.
 * save(command) → Promise: sends a video / pdf-page command; a rejection shows the save warning.
 * bridge (optional, createVideoBridge()): a video attaches to it so a transcript can seek it and follow its position.
 */
export function MaterialView({ m, progress, lessonMin, save, bridge }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const last = useRef(null);
  const persist = useCallback(async (command) => {
    last.current = command;
    try { await save(command); setSaveError(false); } catch { setSaveError(true); }
  }, [save]);
  const retrySave = async () => { if (!last.current) return; setSaving(true); await persist(last.current); setSaving(false); };
  const onFail = useCallback(() => setFailed(true), []);
  const videoId = m.type === 'video' && m.url ? youtubeVideoId(m.url) : null;
  const stored = isStoredMedia(m.url);
  // A URL that is neither YouTube, a file uploaded to Codi nor a simulated material cannot be played here.
  const unplayable = m.type === 'video' && m.url && !videoId && !stored;

  if (failed || unplayable) {
    const retry = () => {
      setRetrying(true);
      setTimeout(() => { setRetrying(false); setFailed(false); setAttempt((n) => n + 1); }, 300);
    };
    return (
      <Alert type="warn" title="Chưa tải được tài liệu" body="Vui lòng thử lại. Bạn có thể đọc phần tóm tắt bài học trong lúc chờ."
        actions={<>
          {!unplayable && <button type="button" className="btn btn-secondary btn-sm" onClick={retry} disabled={retrying} aria-busy={retrying || undefined}><Icon name="refresh" className="icon-sm" /> Thử lại</button>}
          {videoId && <a className="btn btn-ghost btn-sm" href={youtubeWatchUrl(videoId)} target="_blank" rel="noopener noreferrer">Mở video trên YouTube <Icon name="external-link" className="icon-sm" /></a>}
          {unplayable && <a className="btn btn-ghost btn-sm" href={m.url} target="_blank" rel="noopener noreferrer">Mở tài liệu <Icon name="external-link" className="icon-sm" /></a>}
        </>} />
    );
  }
  let body = null;
  if (m.type === 'video') {
    body = videoId
      ? <YouTubeMaterial key={attempt} m={m} videoId={videoId} progress={progress} save={persist} onFail={onFail} bridge={bridge} />
      : stored ? <FileVideo key={attempt} m={m} progress={progress} save={persist} onFail={onFail} bridge={bridge} />
        : <SimulatedVideo key={attempt} m={m} progress={progress} lessonMin={lessonMin} save={persist} bridge={bridge} />;
  } else if ((m.type === 'pdf' || m.type === 'slide') && stored && /\.pdf$/i.test(decodeURIComponent(m.url))) {
    body = <PdfMaterial key={attempt} m={m} progress={progress} save={persist} fileUrl={m.url} />;
  } else if (m.type === 'pdf' || m.type === 'slide') {
    body = <PdfMaterial key={attempt} m={m} progress={progress} save={persist} />;
  } else if (m.url) {
    body = (
      <div className="card"><div className="card-body stack-3"><h3 className="ln-h">{m.title}</h3>
        <a className="btn btn-secondary" style={{ width: 'fit-content' }} href={m.url} target="_blank" rel="noopener noreferrer">Mở tài liệu <Icon name="external-link" className="icon-sm" /></a></div></div>
    );
  }
  return <>{saveError && <SaveWarning onRetry={retrySave} busy={saving} />}{body}</>;
}
