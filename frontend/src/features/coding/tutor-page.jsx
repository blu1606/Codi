/**
 * Full Tutor page /learn/:courseId/tutor (real app/learn/[courseId]/tutor): the learner's threads in this course on
 * the left, the selected lesson's thread on the right. Threads are per lesson, so "Đoạn chat mới" picks a lesson.
 * The page has no code editor, so answers are about the lesson only ("Mở đúng chỗ" opens the lesson itself).
 * Query: ?lesson=<lessonId> selects a thread; without it the newest thread opens.
 * Data: GET /api/learn/:courseId/tutor/threads (history) and GET /api/learn/:courseId/path (lessons to pick from).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Codi } from '../../lib/codi';
import { Icon, Alert, Empty } from '../../components/ui/primitives';
import { Sheet } from '../../components/ui/overlay-host';
import { TutorPanel, tutorInternals, useTutorVersion } from './tutor-api';

const { session, load, pageHref, stopAction } = tutorInternals;
const TITLE_MAX = 80;
const TIME_ZONE = 'Asia/Bangkok';
const DAY_MS = 86400000;

/** One-line title for a thread: its first question, whitespace collapsed and cut. */
const threadTitle = (q) => { const s = String(q || '').replace(/\s+/g, ' ').trim(); return s.length > TITLE_MAX ? `${s.slice(0, TITLE_MAX - 1)}…` : s; };
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
/** "Hôm nay", "Hôm qua", then one group per calendar month ("Tháng 10, 2026"), on the Bangkok calendar. */
function groupThreads(threads, at = new Date()) {
  const today = dayKey(at); const yesterday = dayKey(new Date(at.getTime() - DAY_MS));
  const groups = []; const byLabel = new Map();
  for (const t of threads) {
    const day = dayKey(new Date(t.lastAt));
    let label;
    if (day === today) label = 'Hôm nay';
    else if (day === yesterday) label = 'Hôm qua';
    else { const [y, m] = day.split('-'); label = `Tháng ${Number(m)}, ${y}`; }
    let g = byLabel.get(label);
    if (!g) { g = { label, threads: [] }; byLabel.set(label, g); groups.push(g); }
    g.threads.push(t);
  }
  return groups;
}

function ThreadList({ threads, activeId, onPick, onNew, onCollapse }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('vi');
    if (!threads || !needle) return threads;
    return threads.filter((t) => `${t.firstQuestion} ${t.lessonTitle}`.toLocaleLowerCase('vi').includes(needle));
  }, [threads, query]);
  const groups = shown ? groupThreads(shown) : [];
  return (
    <div className="tutor-threads">
      <div className="row-between">
        <h2 className="tutor-threads-title">Tutor</h2>
        {onCollapse ? <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Thu gọn danh sách đoạn chat" onClick={onCollapse}><Icon name="chevron-left" className="icon-sm" /></button> : null}
      </div>
      <button type="button" className="btn btn-secondary tutor-threads-new" onClick={onNew}><Icon name="plus" className="icon-sm" /> Đoạn chat mới</button>
      <label className="tutor-threads-search">
        <span className="sr-only">Tìm đoạn chat</span>
        <Icon name="search" className="icon-sm" />
        <input type="search" className="input" value={query} placeholder="Tìm đoạn chat" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <nav aria-label="Lịch sử đoạn chat" className="tutor-threads-nav">
        {threads === null ? <p className="small muted" role="status">Đang tải lịch sử…</p> : null}
        {threads && !threads.length ? <p className="small muted">Chưa có đoạn chat nào. Bấm “Đoạn chat mới” để hỏi về một bài học.</p> : null}
        {threads && threads.length > 0 && !groups.length ? <p className="small muted">Không có đoạn chat khớp “{query.trim()}”.</p> : null}
        {groups.map((g) => (
          <section key={g.label} className="tutor-threads-group">
            <h3 className="xsmall muted">{g.label}</h3>
            <ul>
              {g.threads.map((t) => (
                <li key={t.lessonId}>
                  <button type="button" className={`tutor-thread ${t.lessonId === activeId ? 'is-active' : ''}`.trim()} aria-current={t.lessonId === activeId ? 'true' : undefined} onClick={() => onPick(t.lessonId)}>
                    <span className="tutor-thread-q">{threadTitle(t.firstQuestion)}</span>
                    <span className="tutor-thread-l">{t.lessonTitle}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
    </div>
  );
}

function LessonPicker({ lessons, handle, onPick }) {
  return (
    <div className="stack-3">
      <p className="small muted">Mỗi bài có một đoạn chat riêng, giữ nguyên khi bạn quay lại.</p>
      {lessons.length ? (
        <ul className="tutor-picker">
          {lessons.map((l) => (
            <li key={l.id}>
              <button type="button" className="tutor-picker-item" onClick={() => { handle.close(); onPick(l.id); }}>
                <span>{l.title}</span>
                <span className="xsmall muted">{l.chapterTitle}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="small muted">Chưa tải được danh sách bài học. Vui lòng thử lại.</p>}
    </div>
  );
}

export default function TutorPage({ params, query }) {
  useTutorVersion();
  const navigate = useNavigate();
  const courseId = params.courseId;
  const [threads, setThreads] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const sessions = useRef({});

  // History (GET /tutor/threads) and the course's lessons in path order (GET /path).
  useEffect(() => {
    let live = true;
    setThreads(null); setLoadError(null);
    const base = `/api/learn/${encodeURIComponent(courseId)}`;
    Promise.all([api.get(`${base}/tutor/threads`), api.get(`${base}/path`).catch(() => null)])
      .then(([t, path]) => {
        if (!live) return;
        setThreads(t.threads || []);
        setLessons(path && Array.isArray(path.rows) ? path.rows.map((r) => ({ id: r.lessonId, title: r.title, chapterTitle: r.chapterTitle })) : []);
      })
      .catch((e) => { if (live) setLoadError(e); });
    return () => { live = false; };
  }, [courseId, attempt]);
  // Leaving the page stops any answer still streaming.
  useEffect(() => () => { Object.values(sessions.current).forEach((s) => stopAction(s)); }, []);

  const loading = threads === null && !loadError;
  const titleOf = (id) => {
    const l = lessons.find((x) => x.id === id); if (l) return l.title;
    const t = (threads || []).find((x) => x.lessonId === id); return t ? t.lessonTitle : null;
  };
  const chosen = query.lesson && titleOf(query.lesson) ? query.lesson : null;
  const activeId = chosen || (threads && threads[0] ? threads[0].lessonId : null);
  const activeTitle = activeId ? titleOf(activeId) : null;
  const p = activeId ? (sessions.current[activeId] || (sessions.current[activeId] = session(courseId, activeId, 'page'))) : null;
  useEffect(() => { if (p && !p.loaded && !p.loadError && !p.loadStarted) { p.loadStarted = true; load(p); } }, [p]);

  if (loadError && (loadError.status === 403 || loadError.status === 401)) return <div className="page page-narrow"><Alert type="danger" body={loadError.message || 'Bạn không có quyền học viên đang hoạt động.'} /></div>;
  if (loadError && loadError.status === 404) return <div className="page page-narrow"><Alert type="warn" title="Không tìm thấy khoá học" body="Khoá học này không tồn tại hoặc đã bị gỡ." /></div>;

  const pick = (lessonId) => { setListOpen(false); navigate(pageHref(courseId, lessonId), { replace: true }); };
  const openPicker = () => {
    setListOpen(false);
    Codi.ui.modal({ title: 'Chọn bài để hỏi Tutor', body: (handle) => <LessonPicker lessons={lessons} handle={handle} onPick={pick} /> });
  };
  const list = (onCollapse) => <ThreadList threads={threads} activeId={activeId} onPick={pick} onNew={openPicker} onCollapse={onCollapse} />;

  return (
    <div className="tutor-page">
      <aside className={`tutor-page-aside ${collapsed ? 'is-collapsed' : ''}`.trim()} aria-label="Lịch sử Tutor">
        {collapsed ? (
          <>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Mở danh sách đoạn chat" onClick={() => setCollapsed(false)}><Icon name="chevron-right" className="icon-sm" /></button>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Đoạn chat mới" onClick={openPicker}><Icon name="plus" className="icon-sm" /></button>
          </>
        ) : list(() => setCollapsed(true))}
      </aside>
      <div className="tutor-page-main">
        <header className="tutor-page-head">
          <button type="button" className="btn btn-ghost btn-icon btn-sm tutor-page-menu" aria-label="Danh sách đoạn chat" onClick={() => setListOpen(true)}><Icon name="menu" className="icon-sm" /></button>
          <div className="tutor-page-titles">
            <p className="xsmall muted">Tutor</p>
            <h1>{activeId ? (activeTitle || (p && p.view ? p.view.lessonTitle : '')) : 'Chọn một bài để bắt đầu'}</h1>
          </div>
          {activeId ? <Link className="btn btn-secondary btn-sm" to={`/learn/${encodeURIComponent(courseId)}/${encodeURIComponent(activeId)}`}>Mở đúng chỗ</Link> : null}
        </header>
        {loadError ? (
          <div className="tutor-page-alert">
            <Alert type="danger" title="Chưa tải được lịch sử Tutor" body={loadError.message || 'Không tải được lịch sử Tutor.'}
              actions={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setAttempt((n) => n + 1)}><Icon name="rotate-ccw" className="icon-sm" /> Thử lại</button>} />
          </div>
        ) : null}
        {p ? (
          <div className="tutor-page-scroll">
            <div className="tutor-page-col"><TutorPanel key={activeId} p={p} title={activeTitle} placeholder="Hỏi tiếp Tutor" onPickLesson={openPicker} /></div>
          </div>
        ) : (
          <div className="tutor-page-empty">
            {loading ? (
              <div className="tutor-page-col stack-3" aria-busy="true">
                <p className="row muted small" role="status"><Icon name="loader" className="icon-sm cp-spin" /> Đang tải lịch sử Tutor…</p>
                {[70, 90, 60, 80].map((w) => <div key={w} className="skeleton skeleton-line" style={{ width: `${w}%` }} />)}
              </div>
            ) : (
              <Empty icon="message-circle" title="Chưa có đoạn chat nào" body="Chọn một bài học để hỏi Tutor. Mỗi bài có một đoạn chat riêng."
                actions={<button type="button" className="btn btn-primary" onClick={openPicker}><Icon name="plus" className="icon-sm" /> Đoạn chat mới</button>} />
            )}
          </div>
        )}
      </div>
      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Tutor" side="left">
        <p className="xsmall muted">Lịch sử đoạn chat</p>
        {list(null)}
      </Sheet>
    </div>
  );
}
