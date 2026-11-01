/**
 * Personal path views (port of real components/learning-path/{path-summary,lesson-path,path-map,prerequisite-advice}.tsx).
 * Rows come from pathRows(); every state is named in text, so colour is never the only signal.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Icon, Mastery } from '../../components/ui/primitives';
import { Modal, Sheet } from '../../components/ui/overlay-host';
import {
  GOALS, STATUS, TYPE_ICON, TYPE_LABEL, conceptName, currentLessonId, lessonStatus, lockInfo, orderOf, reasonFor,
} from './learning-store';

const kindOf = (l) => (l.code ? (l.code.kind === 'tutorial' ? 'tutorial' : 'code') : l.type);
/** One row per lesson in path order (real CoursePathView.rows). */
export function pathRows(c, r) {
  const cur = currentLessonId(c, r);
  return orderOf(c, r).map((id) => {
    const l = Codi.lesson(c, id);
    if (!l) return null;
    const status = lessonStatus(c, r, l, cur);
    const lock = status === 'done' ? null : lockInfo(c, r, l);
    const ch = Codi.chapterOf(c, id);
    return {
      id, title: l.title, chapterTitle: ch ? ch.title : '', kind: kindOf(l), durationMin: l.durationMin, status,
      lock: lock ? { concept: lock.concept, lessonId: lock.lesson.id, lessonTitle: lock.lesson.title } : null,
      reason: reasonFor(c, r, id),
      mastery: l.conceptIds.map((k) => ({ id: k, name: conceptName(c, k), level: r.mastery[k] || 0 })),
    };
  }).filter(Boolean);
}
const lessonUrl = (c, id) => `/learn/${c.id}/${id}`;
const kindLabel = (row) => TYPE_LABEL[row.kind] || TYPE_LABEL.reading;
const kindIcon = (row) => TYPE_ICON[row.kind] || 'file-text';
const statusLabel = (st) => STATUS[st][0];

export function PrerequisiteAdvice({ c, advice }) {
  return (
    <p className="ln-advice small" role="note"><Icon name="info" className="icon-sm" />
      <span>Nên học {advice.concept} trước (bài <Link to={lessonUrl(c, advice.lessonId)}>{advice.lessonTitle}</Link>).</span></p>
  );
}

// ───────────────────────── "Vì sao lộ trình này" ─────────────────────────
export function PathSummary({ c, r, rows }) {
  const goal = GOALS.find((g) => g[0] === (r.goal && r.goal.goal));
  const skippable = rows.filter((x) => x.status === 'skippable').length;
  const done = rows.filter((x) => x.status === 'done').length;
  const facts = [
    goal && ['Mục tiêu', goal[1]],
    r.goal && r.goal.hours && ['Thời gian học', `${r.goal.hours} giờ/tuần`],
    r.diag.status === 'done' ? ['Kiểm tra đầu vào', 'Đã làm bài kiểm tra'] : r.diag.status === 'skipped' ? ['Kiểm tra đầu vào', 'Bỏ qua bài kiểm tra'] : null,
    ['Tiến độ', `${done}/${rows.length} bài đã học`],
    skippable && ['Có thể bỏ qua', `${skippable} bài vì bạn đã nắm vững các khái niệm liên quan`],
    r.highlight.length && ['Thay đổi gần đây', `${r.highlight.length} bài vừa được xếp lại cho bạn`],
  ].filter(Boolean);
  return (
    <section className="card"><div className="card-body stack-4">
      <h2 className="ln-h">Vì sao lộ trình này</h2>
      <dl className="ln-facts-grid">{facts.map(([k, v]) => <div key={k}><dt className="xsmall muted">{k}</dt><dd className="small strong">{v}</dd></div>)}</dl>
      {r.pathSource === 'ai' && c.aiRationale && <p className="small"><strong>Nhận xét của Codi: </strong>{c.aiRationale}</p>}
      <p className="small muted row ln-top"><Icon name="sparkles" className="icon-sm" /><span>{r.pathSource === 'ai'
        ? 'AI xếp theo kết quả của bạn, luôn tôn trọng bài học tiên quyết. Chọn "Vì sao?" ở mỗi bài để xem lý do.'
        : 'Đây là thứ tự mặc định của khoá học, chưa được cá nhân hoá theo kết quả của bạn.'}</span></p>
    </div></section>
  );
}

// ───────────────────────── list + detail ─────────────────────────
function StepDetail({ c, row, number }) {
  return (
    <div className="stack-4">
      <div className="stack-2">
        <p className="xsmall muted row ln-gap-2"><span>Bài {number}</span><span aria-hidden="true">·</span><span className="row ln-gap-1"><Icon name={kindIcon(row)} className="icon-sm" />{kindLabel(row)}</span><span aria-hidden="true">·</span><span>{Codi.fmt.duration(row.durationMin)}</span></p>
        <h3 className="ln-h">{row.title}</h3>
        <span className={`badge ${STATUS[row.status][1]}`} style={{ justifySelf: 'start' }}>{statusLabel(row.status)}</span>
      </div>
      <section className="stack-1"><h4 className="small strong">Vì sao bài này</h4><p className="small muted">{row.reason}</p></section>
      <section className="stack-1"><h4 className="small strong">Kiến thức nên học trước</h4>
        {row.status === 'done' ? <p className="small muted">Bạn đã hoàn thành bài này.</p>
          : row.lock ? <PrerequisiteAdvice c={c} advice={row.lock} />
            : <p className="small muted">Không có kiến thức tiên quyết nào cần xem lại.</p>}</section>
      {row.mastery.length > 0 && (
        <section className="stack-2"><h4 className="small strong">Mức thành thạo hiện tại</h4>
          <ul className="list stack-2">{row.mastery.map((k) => <li key={k.id} className="row-between small"><span>{k.name}</span><Mastery level={k.level} /></li>)}</ul></section>
      )}
      {row.status === 'skippable' && <p className="small muted">Codi đánh dấu bài này có thể bỏ qua. Bạn vẫn có thể mở bài.</p>}
      <Link className={`btn ${row.status === 'next' || row.status === 'active' ? 'btn-primary' : 'btn-secondary'} ln-block`} to={lessonUrl(c, row.id)}>
        {row.status === 'done' ? 'Xem lại bài' : row.status === 'next' || row.status === 'active' ? 'Học tiếp' : 'Mở bài học'}</Link>
    </div>
  );
}

function groupByChapter(rows) {
  const groups = [];
  rows.forEach((row, i) => {
    const last = groups[groups.length - 1];
    const step = { row, number: i + 1 };
    if (last && last.title === row.chapterTitle) last.steps.push(step); else groups.push({ title: row.chapterTitle, steps: [step] });
  });
  return groups;
}

function PathList({ c, rows, currentId, highlight }) {
  const [picked, setPicked] = useState(null);
  const [sheet, setSheet] = useState(false);
  const selected = rows.find((x) => x.id === (picked || currentId)) || rows[0];
  const choose = (id) => { setPicked(id); if (!window.matchMedia('(min-width: 1024px)').matches) setSheet(true); };
  const detail = <StepDetail c={c} row={selected} number={rows.indexOf(selected) + 1} />;
  return (
    <div className="ln-path-grid">
      <section className="stack-6" aria-label="Các bài theo thứ tự lộ trình">{groupByChapter(rows).map((g) => (
        <div key={g.steps[0].row.id} className="stack-3">
          <div className="row-between"><h2 className="ln-h">{g.title}</h2><span className="small muted">{g.steps.filter((s) => s.row.status === 'done').length}/{g.steps.length} bài</span></div>
          <ol className="ln-steps">{g.steps.map(({ row, number }) => {
            const isCur = row.id === currentId;
            const isSel = row.id === selected.id;
            const isNew = highlight.includes(row.id);
            return (
              <li key={row.id} className="ln-step">
                <span className={`ln-step-mark ${row.status === 'done' ? 'is-done' : isCur ? 'is-current' : ''}`} aria-hidden="true">
                  {row.status === 'done' ? <Icon name="check-circle" className="icon-sm" /> : row.status === 'locked' ? <Icon name="info" className="icon-sm" /> : number}</span>
                <article className={`ln-step-card ${isSel ? 'is-selected' : ''} ${isNew && !isSel ? 'is-updated' : ''}`} aria-current={isCur ? 'step' : undefined}>
                  <div className="row-between ln-top">
                    <div className="stack-1 od-fill">
                      <p className="xsmall muted row ln-gap-3"><span className="row ln-gap-1"><Icon name={kindIcon(row)} className="icon-sm" />{kindLabel(row)}</span><span>{Codi.fmt.duration(row.durationMin)}</span></p>
                      <h3 className="ln-step-title"><Link to={lessonUrl(c, row.id)}>{row.title}</Link></h3>
                    </div>
                    <div className="row ln-gap-2 ln-wrap">{isCur && <span className="badge badge-accent">Bắt đầu ở đây</span>}<span className={`badge ${STATUS[row.status][1]}`}>{statusLabel(row.status)}</span></div>
                  </div>
                  {isNew && <span className="badge badge-info" style={{ justifySelf: 'start' }}>Mới cập nhật</span>}
                  {row.mastery.length > 0 && <ul className="ln-step-mastery">{row.mastery.map((k) => <li key={k.id}><span className="muted">{k.name}</span><Mastery level={k.level} /></li>)}</ul>}
                  {row.lock && row.status !== 'done' && <PrerequisiteAdvice c={c} advice={row.lock} />}
                  <div className="row ln-gap-2">
                    {isCur && <Link className="btn btn-primary btn-sm" to={lessonUrl(c, row.id)}>Học tiếp</Link>}
                    <button type="button" className="btn btn-ghost btn-sm" aria-pressed={isSel} onClick={() => choose(row.id)}>Vì sao?<span className="sr-only">: {row.title}</span></button>
                  </div>
                </article>
              </li>
            );
          })}</ol>
        </div>
      ))}</section>
      <aside className="ln-path-aside"><div className="card"><div className="card-body">{detail}</div></div></aside>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Chi tiết bài học">{detail}</Sheet>
    </div>
  );
}

// ───────────────────────── winding map ─────────────────────────
const NODE = 56; const ROW_H = 136; const HEAD_H = 56; const CH_GAP = 16; const MOVE_MS = 900;
const ZIGZAG = [50, 74, 50, 26];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const NODE_ICON = { done: 'check-circle', locked: 'lock', skippable: 'skip-forward' };
function layoutPath(rows) {
  const chapters = []; const placed = []; let top = 0;
  rows.forEach((row, i) => {
    const last = chapters[chapters.length - 1];
    if (!last || last.title !== row.chapterTitle) { if (last) top += CH_GAP; chapters.push({ title: row.chapterTitle, top, steps: [] }); top += HEAD_H; }
    const step = { row, number: i + 1, x: ZIGZAG[i % ZIGZAG.length], top };
    chapters[chapters.length - 1].steps.push(step); placed.push(step); top += ROW_H;
  });
  return { chapters, placed, height: top };
}

export function PathMap({ c, rows, currentId, animateFrom }) {
  const layout = layoutPath(rows);
  const center = (top) => top + NODE / 2;
  const byId = new Map(layout.placed.map((s) => [s.row.id, s]));
  const from = animateFrom ? byId.get(animateFrom) : null;
  const to = currentId ? byId.get(currentId) : null;
  const [phase, setPhase] = useState(() => (from && to && from !== to && !reducedMotion() ? 'start' : 'idle'));
  const [picked, setPicked] = useState(null);
  const [width, setWidth] = useState(0);
  const mapRef = useRef(null);
  const nodes = useRef(new Map());
  useEffect(() => {
    const el = mapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const t = currentId ? nodes.current.get(currentId) : null;
    if (t) t.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [currentId]);
  useEffect(() => {
    if (phase === 'start') { const f = requestAnimationFrame(() => setPhase('moving')); return () => cancelAnimationFrame(f); }
    if (phase === 'moving') { const t = setTimeout(() => setPhase('idle'), MOVE_MS); return () => clearTimeout(t); }
    return undefined;
  }, [phase]);
  if (!rows.length) return <p className="muted">Khoá học chưa có bài học được xuất bản.</p>;
  const caption = (row) => (row.id === currentId ? 'Bắt đầu ở đây' : statusLabel(row.status));
  const pickedRow = rows.find((x) => x.id === picked);
  const marker = phase === 'start' && from ? from : to;
  return (
    <div className="stack-6">
      <div ref={mapRef} className="ln-map" style={{ height: layout.height }}>
        {layout.chapters.map((ch) => (
          <div key={'h' + ch.top} className="ln-map-head" aria-hidden="true" style={{ top: ch.top, height: HEAD_H }}>
            <span className="strong od-truncate">{ch.title}</span><span className="small muted od-nowrap">{ch.steps.filter((s) => s.row.status === 'done').length}/{ch.steps.length} bài</span>
          </div>
        ))}
        {width > 0 && layout.chapters.flatMap((ch) => ch.steps.slice(1).map((step, i) => {
          const before = ch.steps[i];
          const dx = ((step.x - before.x) / 100) * width; const dy = center(step.top) - center(before.top);
          return <span key={step.row.id} aria-hidden="true" className={`ln-map-link ${before.row.status === 'done' ? 'is-done' : ''}`}
            style={{ left: (before.x / 100) * width, top: center(before.top) - 1.5, width: Math.hypot(dx, dy), transform: `rotate(${Math.atan2(dy, dx)}rad)` }} />;
        }))}
        <ol className="ln-map-nodes">{layout.placed.map((step) => {
          const { row } = step; const isCur = row.id === currentId;
          return (
            <li key={row.id} style={{ left: `${step.x}%`, top: step.top }}>
              <button type="button" ref={(el) => { if (el) nodes.current.set(row.id, el); else nodes.current.delete(row.id); }}
                aria-current={isCur ? 'step' : undefined} aria-haspopup="dialog" onClick={() => setPicked(row.id)} className="ln-map-btn">
                <span className={`ln-map-node is-${isCur && row.status !== 'done' ? 'current' : row.status}`}>{NODE_ICON[row.status] ? <Icon name={NODE_ICON[row.status]} /> : step.number}</span>
                <span className="ln-map-title od-clamp-2"><span className="sr-only">Bài {step.number}: </span>{row.title}</span>
                <span className={`ln-map-cap is-${row.status} ${isCur ? 'is-current' : ''}`}>{caption(row)}</span>
              </button>
            </li>
          );
        })}</ol>
        {phase !== 'idle' && marker && <span aria-hidden="true" className="ln-map-marker" style={{ left: `${marker.x}%`, top: center(marker.top), transitionDuration: `${MOVE_MS}ms` }} />}
      </div>
      <Modal open={!!pickedRow} onClose={() => setPicked(null)} title={pickedRow ? pickedRow.title : ''}>
        {pickedRow && (
          <div className="stack-4">
            <p className="small muted">{kindLabel(pickedRow)} · {Codi.fmt.duration(pickedRow.durationMin)} · {caption(pickedRow)}</p>
            <section className="stack-1"><h3 className="small strong">Vì sao?</h3><p className="small muted">{pickedRow.reason}</p></section>
            {pickedRow.lock && pickedRow.status !== 'done' && <PrerequisiteAdvice c={c} advice={pickedRow.lock} />}
            <Link className={`btn ${pickedRow.id === currentId || pickedRow.status === 'done' ? 'btn-primary' : 'btn-secondary'} ln-block`} to={lessonUrl(c, pickedRow.id)} onClick={() => setPicked(null)}>
              {pickedRow.status === 'done' ? 'Xem lại bài' : pickedRow.status === 'active' ? 'Tiếp tục' : 'Học'}</Link>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** "Danh sách / Bản đồ" toggle around the list and the map (real LessonPath). */
export function LessonPath({ c, r, rows }) {
  const [view, setView] = useState('list');
  if (!rows.length) return <p className="muted">Khoá học chưa có bài học được xuất bản.</p>;
  const currentId = currentLessonId(c, r);
  return (
    <div className="stack-4">
      <div className="ln-view-toggle" role="group" aria-label="Cách xem lộ trình">
        <div className="segmented">
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon name="list" className="icon-sm" /> Danh sách</button>
          <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}><Icon name="map" className="icon-sm" /> Bản đồ</button>
        </div>
      </div>
      {view === 'map' ? <PathMap c={c} rows={rows} currentId={currentId} /> : <PathList c={c} rows={rows} currentId={currentId} highlight={r.highlight} />}
    </div>
  );
}
