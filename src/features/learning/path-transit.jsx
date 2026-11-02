/**
 * The course as a transit diagram: each chapter is a line in its own colour, each lesson a station.
 * Wide screens get the whole network as SVG lines + HTML station buttons (scrolls inside its frame, zoomable);
 * below 1024px the current chapter's line is drawn as a vertical strip with a chapter switcher.
 * Station shape (filled, ring, outlined, dashed, lock) and text carry the status; colour only names the line.
 */
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Codi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import { ICON_PATHS } from '../../lib/icon-paths';
import { lineDone, statusLabel } from './path-views';

// Geometry at zoom 1 (CSS px). Labels are a fixed 15px; the smallest zoom keeps them ≥ 13px.
const SP = 112;           // station spacing on a line
const LW = 204;           // label width (two same-side labels are 2·SP apart → 20px gap)
const LH = 64;            // label height: meta line + two title lines
const GAP = 24;           // line → label
const DY = 88;            // level change; the bend is 45° so it also takes DY horizontally
const RUN_SHORT = 28;     // run before/after a bend when the label sits on the side away from it
const RUN_LONG = LW / 2 + 8; // run that keeps a label on the bend side clear of the diagonal
const TAG_H = 32; const TAG_GAP = 12; const PAD = 24;
const Y0 = PAD + TAG_H + TAG_GAP + LH + GAP;
const HEIGHT = Y0 + DY + GAP + LH + PAD;
const HIT = 44;
export const ZOOMS = [0.875, 1, 1.25, 1.5];

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True while the media query matches (re-renders on change). */
export function useMedia(query) {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const isCurrentStation = (row, currentId) => row.id === currentId && row.status !== 'done';
/** "Bài n: title · trạng thái" (plus "Bạn đang ở đây" on the current station). */
export const stationLabel = (row, number, currentId) => `Bài ${number}: ${row.title} · ${statusLabel(row.status)}${isCurrentStation(row, currentId) ? ' · Bạn đang ở đây' : ''}`;

/**
 * Positions every station. Labels alternate above/below along the whole network. Chapters sit on two levels joined
 * by 45° transfer links; a link bends towards the side free of labels (last label above → bend down), which keeps it
 * short. When that would leave the two levels, it bends the other way with long runs that clear the labels.
 */
export function layoutNetwork(lines, currentId) {
  const sideOf = (g) => (g % 2 === 0 ? 'above' : 'below');
  let g = 0;
  const ends = lines.map((line) => { g += line.stations.length; return sideOf(g - 1); });
  let level = ends.length > 1 && ends[0] === 'below' ? 1 : 0;
  let x = PAD + LW / 2; g = 0;
  const placed = []; const links = [];
  lines.forEach((line, li) => {
    const y = Y0 + level * DY;
    const stations = line.stations.map((s, j) => ({ ...s, x: x + j * SP, y, side: sideOf(g + j) }));
    g += stations.length;
    placed.push({ ...line, y, stations });
    if (li === lines.length - 1) return;
    const want = ends[li] === 'above' ? 1 : -1;
    const dir = level + want >= 0 && level + want <= 1 ? want : -want;
    const run = dir === want ? RUN_SHORT : RUN_LONG;
    const a = stations[stations.length - 1];
    level += dir;
    const by = Y0 + level * DY;
    x = a.x + 2 * run + DY;
    links.push({ id: lines[li + 1].id, from: a, points: [[a.x, a.y], [a.x + run, a.y], [a.x + run + DY, by], [x, by]] });
  });
  links.forEach((k, i) => {
    const b = placed[i + 1].stations[0];
    k.travelled = k.from.row.status === 'done' && (b.row.status === 'done' || b.row.id === currentId);
  });
  // Chapter tags share the top band; each spans its own stretch of the network so tags never overlap.
  placed.forEach((line, i) => {
    const first = line.stations[0]; const last = line.stations[line.stations.length - 1];
    const start = i === 0 ? first.x - LW / 2 : links[i - 1].points[2][0] + 8;
    const end = i === placed.length - 1 ? last.x + LW / 2 : links[i].points[1][0] + DY / 2;
    line.tag = { x: start, w: Math.max(end - start, 0), y: PAD };
  });
  const lastLine = placed[placed.length - 1];
  const width = lastLine ? lastLine.stations[lastLine.stations.length - 1].x + LW / 2 + PAD : 0;
  return { lines: placed, links, width, height: HEIGHT };
}

const poly = (pts) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`).join(' ');
/** Travelled = left a completed station towards a completed or the current one. */
function travelledPath(line, currentId) {
  return line.stations.slice(1).map((s, i) => {
    const a = line.stations[i];
    return a.row.status === 'done' && (s.row.status === 'done' || s.row.id === currentId) ? `M${a.x} ${a.y} L${s.x} ${s.y}` : '';
  }).join(' ');
}

function StationGlyph({ s, currentId }) {
  const { row, x, y } = s;
  if (isCurrentStation(row, currentId)) {
    return <g className="pt-st-current"><circle cx={x} cy={y} r={17} className="pt-st-halo" /><circle cx={x} cy={y} r={15} className="pt-st-ring" /><circle cx={x} cy={y} r={6} className="pt-st-core" /></g>;
  }
  if (row.status === 'locked') {
    return (
      <g className="pt-st-locked">
        <circle cx={x} cy={y} r={11} />
        <svg x={x - 7} y={y - 7} width={14} height={14} viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICON_PATHS.lock }} />
      </g>
    );
  }
  return <circle cx={x} cy={y} r={row.status === 'done' ? 8.5 : 8} className={`pt-st is-${row.status}`} />;
}

function NetworkLegend() {
  const items = [
    ['done', 'Đã học'], ['current', 'Bạn đang ở đây'], ['todo', 'Chưa học'], ['skippable', 'Có thể bỏ qua'], ['locked', 'Chưa đủ tiên quyết'], ['link', 'Chuyển chương'],
  ];
  return (
    <ul className="pt-legend" aria-label="Chú giải sơ đồ">{items.map(([k, label]) => (
      <li key={k}>
        <svg width="24" height="22" viewBox="-12 -11 24 22" aria-hidden="true" focusable="false">
          {k === 'link' ? <><path d="M-11 0 H11" className="pt-link-out" /><path d="M-11 0 H11" className="pt-link-in" /></>
            : k === 'current' ? <><circle r={9} className="pt-st-ring is-legend" /><circle r={3.5} className="pt-st-core is-legend" /></>
              : k === 'locked' ? <g className="pt-st-locked"><circle r={9} /><svg x={-6} y={-6} width={12} height={12} viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICON_PATHS.lock }} /></g>
                : <circle r={6.5} className={`pt-st is-${k} is-legend`} />}
        </svg>
        <span>{label}</span>
      </li>
    ))}</ul>
  );
}

/** Whole network, horizontally scrolling inside the navy frame. */
function NetworkMap({ lines, currentId, onOpen }) {
  const net = useMemo(() => layoutNetwork(lines, currentId), [lines, currentId]);
  const [zi, setZi] = useState(1);
  const zoom = ZOOMS[zi];
  const scroller = useRef(null);
  const buttons = useRef(new Map());
  const centre = useRef(null);
  const cur = net.lines.flatMap((l) => l.stations).find((s) => s.row.id === currentId);

  const scrollToCurrent = (smooth) => {
    const el = scroller.current;
    if (!el || !cur) return;
    el.scrollTo({ left: Math.max(0, cur.x * zoom - el.clientWidth / 2), behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
  };
  // Open on the current station; after a zoom keep the same point in the middle of the frame.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (centre.current == null) { scrollToCurrent(false); return; }
    el.scrollLeft = Math.max(0, centre.current * zoom - el.clientWidth / 2);
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  const setZoom = (next) => {
    const el = scroller.current;
    if (el) centre.current = (el.scrollLeft + el.clientWidth / 2) / zoom;
    setZi(next);
  };
  const locate = () => {
    scrollToCurrent(true);
    const b = cur && buttons.current.get(cur.row.id);
    if (b) b.focus({ preventScroll: true });
  };
  const intro = useRef(!reducedMotion());

  return (
    <>
      <div className="pt-frame-tools" role="group" aria-label="Điều khiển sơ đồ">
        <button type="button" className="pt-tool" onClick={() => setZoom(zi - 1)} disabled={zi === 0} aria-label="Thu nhỏ sơ đồ"><Icon name="minus" /></button>
        <span className="pt-zoom pt-mono" aria-live="polite"><span className="sr-only">Mức phóng: </span>{Math.round(zoom * 100)}%</span>
        <button type="button" className="pt-tool" onClick={() => setZoom(zi + 1)} disabled={zi === ZOOMS.length - 1} aria-label="Phóng to sơ đồ"><Icon name="plus" /></button>
        {cur && <button type="button" className="pt-tool is-text" onClick={locate}><Icon name="target" /> Về ga hiện tại</button>}
      </div>
      <div className="pt-scroll" ref={scroller}>
        <div className="pt-sizer" style={{ width: net.width * zoom, height: net.height * zoom }}>
          <div className="pt-canvas" style={{ width: net.width, height: net.height, transform: `scale(${zoom})` }}>
            <svg className="pt-svg" width={net.width} height={net.height} viewBox={`0 0 ${net.width} ${net.height}`} aria-hidden="true" focusable="false">
              {net.links.map((k) => (
                <g key={k.id} className={`pt-transfer ${k.travelled ? 'is-travelled' : ''}`}>
                  <path d={poly(k.points)} className="pt-link-out" /><path d={poly(k.points)} className="pt-link-in" />
                </g>
              ))}
              {net.lines.map((line) => (
                <path key={'u' + line.id} d={poly(line.stations.map((s) => [s.x, s.y]))} className={`pt-track is-line-${line.slot}`} />
              ))}
              {net.lines.map((line, i) => {
                const d = travelledPath(line, currentId);
                return d ? <path key={'t' + line.id} d={d} pathLength={1} className={`pt-travel is-line-${line.slot} ${intro.current ? 'is-intro' : ''}`} style={{ '--i': i }} /> : null;
              })}
              {net.lines.map((line) => line.stations.length === 1 && (
                <path key={'s' + line.id} d={`M${line.stations[0].x - 18} ${line.y} H${line.stations[0].x + 18}`} className={`pt-track is-solo is-line-${line.slot}`} />
              ))}
              {net.lines.map((line) => line.stations.map((s) => <StationGlyph key={s.row.id} s={s} currentId={currentId} />))}
            </svg>
            {net.lines.map((line) => (
              <p key={'tag' + line.id} className={`pt-tag is-line-${line.slot}`} style={{ left: line.tag.x, top: line.tag.y, width: line.tag.w }} title={`Chương ${line.no}: ${line.title}`}>
                <span className="pt-tag-no" aria-hidden="true">{line.no}</span>
                <span className="pt-tag-name">{line.title}</span>
                <span className="pt-tag-count pt-mono">{lineDone(line)}/{line.stations.length}</span>
              </p>
            ))}
            {net.lines.map((line) => line.stations.map((s) => {
              const isCur = isCurrentStation(s.row, currentId);
              return (
                <button key={s.row.id} type="button" ref={(el) => { if (el) buttons.current.set(s.row.id, el); else buttons.current.delete(s.row.id); }}
                  className={`pt-station is-${s.side} ${isCur ? 'is-current' : ''} is-${s.row.status}`}
                  style={{ left: s.x - HIT / 2, top: s.y - HIT / 2 }}
                  aria-label={stationLabel(s.row, s.number, currentId)} aria-current={isCur ? 'step' : undefined} aria-haspopup="dialog"
                  title={s.row.title} onClick={() => onOpen(s.row.id)}>
                  <span className="pt-label" aria-hidden="true">
                    {isCur ? <span className="pt-label-here">Bạn đang ở đây</span>
                      : <span className="pt-label-meta">Bài {s.number} · <span className="pt-mono">{Codi.fmt.duration(s.row.durationMin)}</span></span>}
                    <span className="pt-label-title">{s.row.title}</span>
                  </span>
                </button>
              );
            }))}
          </div>
        </div>
      </div>
    </>
  );
}

/** One chapter as a vertical strip (narrow screens), with a standard select to change chapter. */
function LineStrip({ lines, currentId, onOpen }) {
  const home = lines.find((l) => l.stations.some((s) => s.row.id === currentId)) || lines[0];
  const [pick, setPick] = useState(home.id);
  const idx = Math.max(0, lines.findIndex((l) => l.id === pick));
  const line = lines[idx];
  const next = lines[idx + 1];
  const st = line.stations;
  return (
    <div className="pt-strip-wrap">
      <div className="pt-strip-pick">
        <label htmlFor="pt-line-pick" className="pt-strip-pick-label">Chương đang xem</label>
        <select id="pt-line-pick" className="pt-select" value={line.id} onChange={(e) => setPick(e.target.value)}>
          {lines.map((l) => <option key={l.id} value={l.id}>Chương {l.no}: {l.title}</option>)}
        </select>
      </div>
      <ol className={`pt-strip is-line-${line.slot}`} aria-label={`Chương ${line.no}: ${line.title}`}>
        {st.map((s, i) => {
          const isCur = isCurrentStation(s.row, currentId);
          const inDone = i > 0 && st[i - 1].row.status === 'done' && (s.row.status === 'done' || isCur);
          const outDone = i < st.length - 1 && s.row.status === 'done' && (st[i + 1].row.status === 'done' || st[i + 1].row.id === currentId);
          const glyph = isCur ? 'current' : s.row.status === 'done' ? 'done' : s.row.status;
          return (
            <li key={s.row.id} className={`pt-strip-stop ${i === 0 ? 'is-first' : ''} ${i === st.length - 1 ? 'is-last' : ''} ${inDone ? 'in-done' : ''} ${outDone ? 'out-done' : ''}`}>
              <button type="button" className={`pt-strip-btn ${isCur ? 'is-current' : ''}`} aria-label={stationLabel(s.row, s.number, currentId)}
                aria-current={isCur ? 'step' : undefined} aria-haspopup="dialog" onClick={() => onOpen(s.row.id)}>
                <span className={`pt-strip-dot is-${glyph}`} aria-hidden="true">{glyph === 'locked' && <Icon name="lock" />}</span>
                <span className="pt-strip-text" aria-hidden="true">
                  {isCur ? <span className="pt-label-here">Bạn đang ở đây</span> : <span className="pt-label-meta">Bài {s.number} · <span className="pt-mono">{Codi.fmt.duration(s.row.durationMin)}</span></span>}
                  <span className="pt-strip-title">{s.row.title}</span>
                  <span className="pt-strip-status">{statusLabel(s.row.status)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {next && (
        <button type="button" className="pt-tool is-text pt-strip-next" onClick={() => setPick(next.id)}>
          <span>Chuyển sang chương {next.no}: {next.title}</span><Icon name="arrow-right" /></button>
      )}
    </div>
  );
}

/** The navy diagram frame. */
export function TransitFrame({ lines, rows, currentId, onOpen }) {
  const wide = useMedia('(min-width: 1024px)');
  return (
    <section className="pt-frame" aria-labelledby="pt-frame-h">
      <header className="pt-frame-head">
        <div className="pt-frame-title">
          <h2 id="pt-frame-h" className="pt-h2">Sơ đồ lộ trình</h2>
          <p className="pt-frame-sub"><span className="pt-mono">{lines.length}</span> chương · <span className="pt-mono">{rows.length}</span> bài · chọn một ga để xem chi tiết</p>
        </div>
      </header>
      {wide ? <NetworkMap lines={lines} currentId={currentId} onOpen={onOpen} />
        : <LineStrip lines={lines} currentId={currentId} onOpen={onOpen} />}
      <footer className="pt-frame-foot"><NetworkLegend /></footer>
    </section>
  );
}
