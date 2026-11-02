/**
 * Lesson materials (port of real components/lesson-material-view.tsx + youtube-material.tsx + lib/youtube.ts).
 *
 * - YouTube URL: privacy-enhanced embed with the IFrame Player API; position saved on pause, every 10 s while
 *   playing, on end and when the page hides. Blocked API → "Không theo dõi được tiến độ video" (still watchable).
 * - Video without a URL: the prototype's simulated player (same 90% rule and saved position).
 * - PDF/slide: simulated pages (pdf.js is not bundled); every page must be seen to count as studied (real
 *   recordPdfPage), with the page text view and the "Mở PDF trong trình duyệt" escape hatch when a URL exists.
 * - Scenario materials = 'error' shows the real failure state with "Thử lại".
 * Progress writes go through persistNow(); a failed write shows "Chưa lưu được tiến độ tài liệu" + "Thử lưu lại".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Codi } from '../../lib/codi';
import { Alert, Icon } from '../../components/ui/primitives';
import { persistNow, rec, recordPdfPage, save, videoStudied } from './learning-store';

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

function YouTubeFrame({ videoId, title, startSeconds, onTracked, onUntracked, onLoaded, onPosition, onError }) {
  const frame = useRef(null);
  const cb = useRef({ onTracked, onUntracked, onPosition, onError });
  cb.current = { onTracked, onUntracked, onPosition, onError };
  // Origin and start are fixed for the life of this iframe; changing src would reload it.
  const [src] = useState(() => youtubeEmbedUrl(videoId, { origin: window.location.origin, start: startSeconds }));
  useEffect(() => {
    const el = frame.current;
    if (!el) return undefined;
    let cancelled = false; let player = null; let ready = false; let ended = false; let interval = null;
    const stopInterval = () => { if (interval) clearInterval(interval); interval = null; };
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
          onReady: () => { if (cancelled) return; ready = true; cb.current.onTracked(); },
          onStateChange: ({ data }) => {
            if (!ready) return;
            if (data === YT.PlayerState.PLAYING) { ended = false; if (!interval) interval = setInterval(savePos, 10000); }
            else if (data === YT.PlayerState.PAUSED) { stopInterval(); savePos(); }
            else if (data === YT.PlayerState.ENDED) {
              stopInterval(); ended = true;
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

// ───────────────────────── study marking ─────────────────────────
export function markStudied(courseId, lessonId, { toast = true } = {}) {
  const r = rec(courseId);
  if (r.studied.includes(lessonId)) return;
  r.studied.push(lessonId);
  save();
  if (toast) Codi.ui.toast('Đã đánh dấu học xong nội dung.', { type: 'success' });
}

function SaveWarning({ onRetry, busy }) {
  return (
    <Alert type="warn" title="Chưa lưu được tiến độ tài liệu" body="Bạn có thể tiếp tục học và thử lưu lại."
      actions={<button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} disabled={busy} aria-busy={busy || undefined}>Thử lưu lại</button>} />
  );
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pdfPageTotal = (m) => Math.max(1, Math.min(2000, Number(m.pages) || 8));

/**
 * Short progress readout for the selected material ("04:00/18:00", "PDF 3/12"), or null when there is nothing
 * reported yet. Video: the position the player last saved; PDF/slide: pages seen out of the total.
 */
export function materialProgress(r, l, m) {
  if (!r || !m) return null;
  if (m.type === 'video') {
    if (m.url) {
      const pos = r.videoPos[m.id];
      if (!Number.isFinite(pos)) return null;
      return m.durationSeconds > 0 ? `${clock(pos)}/${clock(m.durationSeconds)}` : clock(pos);
    }
    const pct = r.video[m.id];
    const total = m.durationSeconds || (l.durationMin || 0) * 60;
    if (!Number.isFinite(pct) || !total) return null;
    return `${clock((total * pct) / 100)}/${clock(total)}`;
  }
  if (m.type === 'pdf' || m.type === 'slide') {
    const total = pdfPageTotal(m);
    const prog = r.pdf[m.id];
    const seen = prog && prog.pageCount === total ? (prog.pages || []).length : 0;
    return `${m.type === 'slide' ? 'Slide' : 'PDF'} ${seen}/${total}`;
  }
  return null;
}

// ───────────────────────── simulated video ─────────────────────────
function SimulatedVideo({ c, l, m, persist }) {
  const r = rec(c.id);
  const total = m.durationSeconds || (l.durationMin || 0) * 60;
  const [playing, setPlaying] = useState(false);
  const startPos = useRef(Math.round((total * (r.video[m.id] || 0)) / 100));
  const lastSaved = useRef(Date.now());
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => {
      const rr = rec(c.id);
      rr.video[m.id] = Math.min(100, (rr.video[m.id] || 0) + 4);
      const seconds = (total * rr.video[m.id]) / 100;
      const ended = rr.video[m.id] >= 100;
      if (videoStudied(seconds, total, ended) && !rr.studied.includes(l.id)) markStudied(c.id, l.id, { toast: false });
      save();
      if (ended) { setPlaying(false); persist(); return; }
      if (Date.now() - lastSaved.current >= 10000) { lastSaved.current = Date.now(); persist(); }
    }, 400);
    return () => clearInterval(t);
  }, [playing, c.id, l.id, m.id, total, persist]);
  // Leaving the lesson pauses and saves, like the real pagehide/unmount save.
  useEffect(() => () => { persist(); }, [persist]);
  const toggle = () => {
    if (playing) { setPlaying(false); persist(); return; }
    const rr = rec(c.id);
    if ((rr.video[m.id] || 0) >= 100) rr.video[m.id] = 0;
    lastSaved.current = Date.now();
    setPlaying(true);
  };
  const pct = r.video[m.id] || 0;
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
            <span className="ln-timecode">{mmss((total * pct) / 100)} / {mmss(total)}</span>
            <div className="ln-track" role="progressbar" aria-label="Tiến độ video" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><span style={{ width: pct + '%' }} /></div>
          </div>
        </div>
      </div>
      <p className="small muted">Vị trí xem được lưu tự động khi tạm dừng và mỗi 10 giây.{startPos.current > 0 ? ` Tiếp tục từ giây ${startPos.current}.` : ''}</p>
    </section>
  );
}

// ───────────────────────── YouTube material ─────────────────────────
function YouTubeMaterial({ c, l, m, videoId, persist, onFail }) {
  const r = rec(c.id);
  const [status, setStatus] = useState('loading');
  const [untracked, setUntracked] = useState(false);
  const saved = useRef(Math.floor(r.videoPos[m.id] || 0));
  const signature = useRef(null);
  useEffect(() => {
    if (status !== 'loading') return undefined;
    const t = setTimeout(() => onFail(), 30000);
    return () => clearTimeout(t);
  }, [status, onFail]);
  const onPosition = useCallback((position, ended, duration) => {
    if (!Number.isFinite(position)) return;
    const seconds = Math.max(0, Math.floor(position));
    const key = `${seconds}:${ended}`;
    if (signature.current === key || (signature.current === `${seconds}:true` && !ended)) return;
    signature.current = key;
    const rr = rec(c.id);
    const dur = Number.isFinite(duration) && duration > 0 ? duration : m.durationSeconds;
    rr.videoPos[m.id] = dur ? Math.min(seconds, dur) : seconds;
    if (videoStudied(rr.videoPos[m.id], dur, ended) && !rr.studied.includes(l.id)) markStudied(c.id, l.id, { toast: false });
    else save(); // re-render so the lesson bar's progress readout shows the reported position
    persist();
  }, [c.id, l.id, m.id, m.durationSeconds, persist]);
  return (
    <section className="stack-3" aria-label={m.title}>
      {status === 'loading' && <p className="row small muted" role="status"><Icon name="loader" className="icon-sm ln-spin" /> Đang tải video…</p>}
      <YouTubeFrame videoId={videoId} title={m.title} startSeconds={saved.current}
        onTracked={() => setStatus('ready')} onUntracked={() => { setUntracked(true); setStatus('ready'); }}
        onLoaded={() => setStatus((s) => (s === 'loading' ? 'ready' : s))} onPosition={onPosition} onError={onFail} />
      {untracked
        ? <Alert type="warn" title="Không theo dõi được tiến độ video" body="Video vẫn xem được nhưng vị trí xem sẽ không được lưu. Xem xong, hãy bấm “Đánh dấu đã học xong”." />
        : <p className="small muted">Vị trí xem được lưu tự động khi tạm dừng và mỗi 10 giây.{saved.current > 0 ? ` Tiếp tục từ giây ${saved.current}.` : ''}</p>}
    </section>
  );
}

// ───────────────────────── simulated PDF ─────────────────────────
const pageCaption = (page, total) => (page === 1 ? 'Mục tiêu bài học' : page === total ? 'Tóm tắt và bài tập về nhà' : 'Nội dung chính · phần ' + (page - 1));
function PdfMaterial({ c, l, m, persist }) {
  const total = pdfPageTotal(m);
  const r = rec(c.id);
  const prog = r.pdf[m.id];
  const page = Math.min(total, (prog && prog.lastPage) || 1);
  const seen = prog && prog.pageCount === total ? prog.pages || [] : [];
  const texts = Array.isArray(m.pageTexts) ? m.pageTexts : null;
  const view = useCallback((p) => {
    const rr = rec(c.id);
    const res = recordPdfPage(rr.pdf[m.id], p, total);
    rr.pdf[m.id] = res.progress;
    if (res.studied && !rr.studied.includes(l.id)) markStudied(c.id, l.id, { toast: false });
    else save();
    persist();
  }, [c.id, l.id, m.id, total, persist]);
  // Opening the material records the page on screen, like the real render of the current page.
  useEffect(() => { if (!seen.includes(page)) view(page); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const text = texts && texts[page - 1] ? texts[page - 1] : `${m.title}. ${pageCaption(page, total)}.`;
  return (
    <section className="stack-3" aria-label={m.title}>
      <div className="ln-media ln-pdf">
        <div className="ln-slide" role="img" aria-label={`${m.title}, trang ${page}`}><span className="xsmall muted">Trang {page}</span><strong>{m.title}</strong><span className="small muted">{pageCaption(page, total)}</span></div>
        <div className="row-between ln-pdf-nav">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => view(page - 1)} disabled={page <= 1}><Icon name="chevron-left" className="icon-sm" /> Trang trước</button>
          <span className="small strong">Trang {page}/{total}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => view(page + 1)} disabled={page >= total}>Trang sau <Icon name="chevron-right" className="icon-sm" /></button>
        </div>
      </div>
      <p className="small muted">Đã xem {seen.length}/{total} trang. Xem đủ các trang để đánh dấu học xong tự động.</p>
      <details className="ln-pdf-text"><summary className="small">Đọc nội dung trang dưới dạng văn bản</summary><p className="small">{text}</p></details>
      {m.url && <a className="small row" href={m.url} target="_blank" rel="noopener noreferrer">Mở PDF trong trình duyệt <Icon name="external-link" className="icon-sm" /></a>}
    </section>
  );
}

// ───────────────────────── one material ─────────────────────────
export function MaterialView({ c, l, m }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const persist = useCallback(async () => {
    const ok = await persistNow();
    setSaveError(!ok);
  }, []);
  const retrySave = async () => { setSaving(true); await persist(); setSaving(false); };
  const onFail = useCallback(() => setFailed(true), []);
  const scenarioError = Codi.state.scenario.materials === 'error';
  const videoId = m.type === 'video' && m.url ? youtubeVideoId(m.url) : null;
  // A URL that is neither YouTube nor a simulated material cannot be played here.
  const unplayable = m.type === 'video' && m.url && !videoId;

  if (scenarioError || failed || unplayable) {
    const retry = () => {
      setRetrying(true);
      // Prototype latency: the retry re-reads the forced scenario after a visible attempt.
      setTimeout(() => { setRetrying(false); setFailed(false); setAttempt((n) => n + 1); }, 900);
    };
    return (
      <Alert type="warn" title="Chưa tải được tài liệu" body="Vui lòng thử lại. Bạn có thể đọc phần tóm tắt bài học trong lúc chờ."
        actions={<>
          <button type="button" className="btn btn-secondary btn-sm" onClick={retry} disabled={retrying} aria-busy={retrying || undefined}><Icon name="refresh" className="icon-sm" /> Thử lại</button>
          {videoId && <a className="btn btn-ghost btn-sm" href={youtubeWatchUrl(videoId)} target="_blank" rel="noopener noreferrer">Mở video trên YouTube <Icon name="external-link" className="icon-sm" /></a>}
        </>} />
    );
  }
  let body = null;
  if (m.type === 'video') {
    body = videoId
      ? <YouTubeMaterial key={attempt} c={c} l={l} m={m} videoId={videoId} persist={persist} onFail={onFail} />
      : <SimulatedVideo key={attempt} c={c} l={l} m={m} persist={persist} />;
  } else if (m.type === 'pdf' || m.type === 'slide') {
    body = <PdfMaterial key={attempt} c={c} l={l} m={m} persist={persist} />;
  } else if (m.url) {
    body = (
      <div className="card"><div className="card-body stack-3"><h3 className="ln-h">{m.title}</h3>
        <a className="btn btn-secondary" style={{ width: 'fit-content' }} href={m.url} target="_blank" rel="noopener noreferrer">Mở tài liệu <Icon name="external-link" className="icon-sm" /></a></div></div>
    );
  }
  return <>{saveError && <SaveWarning onRetry={retrySave} busy={saving} />}{body}</>;
}
