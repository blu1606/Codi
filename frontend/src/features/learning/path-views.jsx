/**
 * Personal path views (port of real components/learning-path/{lesson-path,path-map,prerequisite-advice}.tsx),
 * redrawn for the transit-diagram path page: next departures, line alerts and the lesson table grouped by line.
 * Rows come from pathRows() in learning-store (CoursePathView.rows); every state is named in text, so colour is never the only signal.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Icon, Mastery } from '../../components/ui/primitives';
import { Modal } from '../../components/ui/overlay-host';
import { STATUS, TYPE_ICON, TYPE_LABEL } from './learning-store';

export const lessonUrl = (c, id) => `/learn/${c.id}/${id}`;
export const kindLabel = (row) => TYPE_LABEL[row.kind] || TYPE_LABEL.reading;
export const kindIcon = (row) => TYPE_ICON[row.kind] || 'file-text';
export const statusLabel = (st) => STATUS[st][0];
/** Status icon on the light page; a locked lesson shows the lock the diagram draws. */
export const statusIcon = (st) => (st === 'locked' ? 'lock' : STATUS[st][2]);
/** Six line colours; chapter n of the course always keeps slot ((n - 1) % 6) + 1. */
export const LINE_SLOTS = 6;

/**
 * Chapters as transit lines: course chapter order, stations in path order within each chapter.
 * number is the lesson's position in the whole path ("Bài n"); empty chapters are left out.
 */
export function buildLines(c, rows) {
  const number = new Map(rows.map((row, i) => [row.id, i + 1]));
  return c.chapters.map((ch, i) => {
    const ids = new Set(ch.lessons.map((l) => l.id));
    const stations = rows.filter((row) => ids.has(row.id)).map((row) => ({ row, number: number.get(row.id) }));
    return { id: ch.id, title: ch.title, no: i + 1, slot: (i % LINE_SLOTS) + 1, stations };
  }).filter((line) => line.stations.length);
}
export const lineDone = (line) => line.stations.filter((s) => s.row.status === 'done').length;

export function PrerequisiteAdvice({ c, advice }) {
  return (
    <p className="ln-advice small" role="note"><Icon name="info" className="icon-sm" />
      <span>Nên học {advice.concept} trước (bài <Link to={lessonUrl(c, advice.lessonId)}>{advice.lessonTitle}</Link>).</span></p>
  );
}

/** Lesson detail shown in the sheet (from a station, a departure or "Vì sao?"). */
export function StepDetail({ c, row, number, isCurrent }) {
  return (
    <div className="stack-4 pt-detail">
      <div className="stack-2">
        <p className="small muted pt-meta-row"><span>Bài {number}</span><span aria-hidden="true">·</span><span className="pt-meta-row"><Icon name={kindIcon(row)} className="icon-sm" />{kindLabel(row)}</span><span aria-hidden="true">·</span><span className="pt-mono">{Codi.fmt.duration(row.durationMin)}</span></p>
        <h3 className="pt-detail-title">{row.title}</h3>
        <p className="pt-meta-row">
          <span className={`badge ${STATUS[row.status][1]}`}><Icon name={statusIcon(row.status)} className="icon-sm" />{statusLabel(row.status)}</span>
          {isCurrent && <span className="badge badge-solid">Bạn đang ở đây</span>}
        </p>
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
      <Link className={`btn ${row.status === 'next' || row.status === 'active' ? 'btn-primary' : 'btn-secondary'} btn-block`} to={lessonUrl(c, row.id)}>
        {row.status === 'done' ? 'Xem lại bài' : row.status === 'next' || row.status === 'active' ? 'Học tiếp' : 'Mở bài học'}</Link>
    </div>
  );
}

const LineChip = ({ line }) => <span className={`pt-chip is-line-${line.slot}`} aria-hidden="true">{line.no}</span>;

// ───────────────────────── "Chuyến tiếp theo" ─────────────────────────
/** The next three open lessons in path order, required ones first (the same rule as currentLessonId). */
export function nextDepartures(rows, count = 3) {
  const open = rows.filter((row) => row.status !== 'done');
  return open.filter((row) => row.status !== 'skippable').concat(open.filter((row) => row.status === 'skippable')).slice(0, count);
}

export function Departures({ c, r, rows, lines, currentId, onOpen }) {
  const lineOf = new Map(lines.flatMap((line) => line.stations.map((s) => [s.row.id, line])));
  const next = nextDepartures(rows);
  const ai = r.pathSource === 'ai';
  return (
    <section className="pt-panel" aria-labelledby="pt-dep-h">
      <header className="pt-panel-head"><h2 id="pt-dep-h" className="pt-h2">Chuyến tiếp theo</h2></header>
      {next.length ? (
        <ol className="pt-dep">{next.map((row) => {
          const line = lineOf.get(row.id); const isCur = row.id === currentId; const number = rows.indexOf(row) + 1;
          return (
            <li key={row.id} className={`pt-dep-item ${isCur ? 'is-current' : ''}`}>
              {line ? <LineChip line={line} /> : <span aria-hidden="true" />}
              <p className="pt-dep-title">
                <button type="button" className="pt-link" aria-haspopup="dialog" onClick={() => onOpen(row.id)}><span className="sr-only">Bài {number}: </span>{row.title}</button>
              </p>
              <p className="pt-dep-min"><span className="pt-mono">{Math.round(row.durationMin || 0)}</span><span className="pt-dep-unit">phút</span></p>
              <p className="pt-dep-meta pt-meta-row small muted">
                <span>Bài {number}</span><span aria-hidden="true">·</span>
                <span className="pt-meta-row"><Icon name={kindIcon(row)} className="icon-sm" />{kindLabel(row)}</span>
                {line && <span className="pt-dep-chapter">Chương {line.no}: {row.chapterTitle}</span>}
                {isCur && <span className="pt-here">Bạn đang ở đây</span>}
                {row.status === 'skippable' && <span className="badge badge-neutral">Có thể bỏ qua</span>}
              </p>
              <p className="pt-dep-why small"><span>{row.reason}</span></p>
            </li>
          );
        })}</ol>
      ) : <p className="pt-empty small muted">Bạn đã học hết các bài trên lộ trình.</p>}
      <p className="pt-note xsmall muted"><Icon name="sparkles" className="icon-sm" /><span>{ai
        ? 'AI xếp theo kết quả của bạn, luôn tôn trọng bài học tiên quyết.'
        : 'Đây là thứ tự mặc định của khoá học, chưa được cá nhân hoá theo kết quả của bạn.'}</span></p>
    </section>
  );
}

// ───────────────────────── "Thông báo tuyến" ─────────────────────────
const LOCKED_SHOWN = 3;
/** moves: [{ id, by }] lessons that moved up since the path was last seen (by = steps, null when unknown). */
export function LineAlerts({ c, rows, lines, moves, onSeen, onOpen }) {
  const byId = new Map(rows.map((row, i) => [row.id, { row, number: i + 1 }]));
  const lineOf = new Map(lines.flatMap((line) => line.stations.map((s) => [s.row.id, line])));
  const moved = moves.map((m) => ({ ...m, ...byId.get(m.id) })).filter((m) => m.row);
  const locked = rows.filter((row) => row.status === 'locked' && row.lock);
  const extra = locked.length - LOCKED_SHOWN;
  const item = (row, number, body, kind, key) => {
    const line = lineOf.get(row.id);
    const tint = kind === 'moved' && line ? `is-line-${line.slot}` : '';
    return (
      <li key={key} className="pt-alert">
        <span className={`pt-alert-icon is-${kind} ${tint}`} aria-hidden="true"><Icon name={kind === 'moved' ? 'arrow-up' : 'lock'} className="icon-sm" /></span>
        <div className="pt-alert-body">
          <p className="pt-alert-title">{line && <LineChip line={line} />}
            <button type="button" className="pt-link" aria-haspopup="dialog" onClick={() => onOpen(row.id)}>Bài {number}: {row.title}</button></p>
          {body}
        </div>
      </li>
    );
  };
  return (
    <section className="pt-panel" aria-labelledby="pt-alert-h">
      <header className="pt-panel-head">
        <div className="pt-panel-title">
          <h2 id="pt-alert-h" className="pt-h2">Thông báo tuyến</h2>
          {(moved.length > 0 || locked.length > 0) && (
            <p className="pt-alert-count">
              {moved.length > 0 && <><span className="pt-mono">{moved.length}</span> đổi thứ tự</>}
              {moved.length > 0 && locked.length > 0 && ' · '}
              {locked.length > 0 && <><span className="pt-mono">{locked.length}</span> bài khóa</>}
            </p>
          )}
        </div>
        {moved.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={onSeen}>Đã xem</button>}
      </header>
      {moved.length || locked.length ? (
        <ul className="pt-alerts" aria-live="polite">
          {moved.map((m) => item(m.row, m.number, <p className="small pt-alert-text">{m.by ? `Đã đổi thứ tự · lên ${m.by} bậc` : 'Đã đổi thứ tự'}</p>, 'moved', 'm-' + m.id))}
          {locked.slice(0, LOCKED_SHOWN).map((row) => item(row, byId.get(row.id).number,
            <p className="small muted pt-alert-text">Chưa đủ tiên quyết · nên học {row.lock.concept} trước (bài <Link to={lessonUrl(c, row.lock.lessonId)}>{row.lock.lessonTitle}</Link>).</p>, 'locked', 'l-' + row.id))}
          {extra > 0 && <li className="pt-alert-more small muted">Còn {extra} bài chưa đủ tiên quyết khác trong bảng bên dưới.</li>}
        </ul>
      ) : <p className="pt-empty small muted">Không có thay đổi nào. Mọi bài trên lộ trình đều đã đủ tiên quyết.</p>}
    </section>
  );
}

// ───────────────────────── lesson table grouped by line ─────────────────────────
function LineTable({ c, line, currentId, highlight, onOpen, collapsible }) {
  const [open, setOpen] = useState(!collapsible);
  const done = lineDone(line); const total = line.stations.length;
  const headId = `pt-line-${line.no}`; const bodyId = `pt-line-body-${line.no}`;
  return (
    <section className={`pt-group is-line-${line.slot}`} aria-labelledby={headId}>
      <header className="pt-group-head">
        <h3 id={headId} className="pt-group-title"><LineChip line={line} /><span><span className="sr-only">Chương {line.no}: </span>{line.title}</span></h3>
        <span className={`pt-group-count small ${done === total ? 'text-success' : 'muted'}`}>
          {done === total && <Icon name="check-circle" className="icon-sm" />}<span className="pt-mono">{done}/{total}</span> bài</span>
        {collapsible && (
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
            {open ? 'Thu gọn' : 'Xem các bài'}<Icon name={open ? 'chevron-up' : 'chevron-down'} className="icon-sm" /></button>
        )}
      </header>
      <div id={bodyId} hidden={!open}>
        <table className="pt-table">
          <caption className="sr-only">Các bài của chương {line.title}</caption>
          <thead><tr>
            <th scope="col" className="pt-col-no">#</th><th scope="col">Bài học</th><th scope="col" className="pt-col-kind">Loại</th>
            <th scope="col" className="pt-col-min">Thời lượng</th><th scope="col" className="pt-col-status">Trạng thái</th><th scope="col" className="pt-col-why"><span className="sr-only">Giải thích</span></th>
          </tr></thead>
          <tbody>{line.stations.map(({ row, number }) => {
            const isCur = row.id === currentId;
            const isNew = highlight.includes(row.id);
            return (
              <tr key={row.id} className={`is-${row.status} ${isCur ? 'is-current' : ''}`} aria-current={isCur ? 'step' : undefined}>
                <td className="pt-col-no pt-mono">{number}</td>
                <td className="pt-col-title">
                  <Link to={lessonUrl(c, row.id)}><span className="sr-only">Bài {number}: </span>{row.title}</Link>
                  {(isCur || isNew) && <span className="pt-tags">{isCur && <span className="pt-here">Bạn đang ở đây</span>}{isNew && <span className="badge badge-info">Mới cập nhật</span>}</span>}
                </td>
                <td className="pt-col-kind"><span className="pt-meta-row"><Icon name={kindIcon(row)} className="icon-sm" />{kindLabel(row)}</span></td>
                <td className="pt-col-min pt-mono">{Codi.fmt.duration(row.durationMin)}</td>
                <td className="pt-col-status"><span className={`pt-status is-${row.status}`}><Icon name={statusIcon(row.status)} className="icon-sm" />{statusLabel(row.status)}</span></td>
                <td className="pt-col-why"><button type="button" className="btn btn-ghost btn-sm" aria-haspopup="dialog" onClick={() => onOpen(row.id)}>Vì sao?<span className="sr-only">: {row.title}</span></button></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

export function LessonTable({ c, r, lines, rows, currentId, highlight, onOpen }) {
  return (
    <section className="pt-lessons" aria-labelledby="pt-lessons-h">
      <header className="pt-lessons-head">
        <div className="stack-1">
          <h2 id="pt-lessons-h" className="pt-h2">Toàn bộ bài học</h2>
          <p className="small muted"><span className="pt-mono">{rows.length}</span> bài · <span className="pt-mono">{lines.length}</span> chương, xếp theo tuyến</p>
        </div>
        <Link className="btn btn-secondary btn-sm" to={`/insights/knowledge-map?course=${encodeURIComponent(c.id)}`}><Icon name="map" className="icon-sm" /> Bản đồ kiến thức</Link>
      </header>
      {r.pathSource === 'ai' && c.aiRationale && <p className="pt-rationale"><strong>Nhận xét của Codi: </strong>{c.aiRationale}</p>}
      {lines.map((line) => (
        <LineTable key={line.id} c={c} line={line} currentId={currentId} highlight={highlight} onOpen={onOpen}
          collapsible={lineDone(line) === line.stations.length && !line.stations.some((s) => s.row.id === currentId)} />
      ))}
    </section>
  );
}

// ───────────────────────── winding map (lesson player sidebar) ─────────────────────────
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
            <Link className={`btn ${pickedRow.id === currentId || pickedRow.status === 'done' ? 'btn-primary' : 'btn-secondary'} btn-block`} to={lessonUrl(c, pickedRow.id)} onClick={() => setPicked(null)}>
              {pickedRow.status === 'done' ? 'Xem lại bài' : pickedRow.status === 'active' ? 'Tiếp tục' : 'Học'}</Link>
          </div>
        )}
      </Modal>
    </div>
  );
}
