/**
 * The course as a transit diagram: each chapter is a line in its own colour, each lesson a station.
 * Wide screens get the whole network as SVG lines + HTML station buttons, one row per chapter, fitted to the frame
 * at 100% (zooming in scrolls it sideways);
 * below 1024px the current chapter's line is drawn as a vertical strip with a chapter switcher.
 * Station shape (filled, ring, outlined, dashed, lock) and text carry the status; colour only names the line.
 */
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Codi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import { ICON_PATHS } from '../../lib/icon-paths';
import { lineDone, statusLabel } from './path-views';

// Geometry at zoom 1 (CSS px). Labels are a fixed 15px; the smallest zoom keeps them ≥ 13px.
const SP_MIN = 112;       // closest station spacing (two same-side labels are 2·SP apart → 20px gap)
const SP_MAX = 248;       // widest spacing, used when the frame has room to spread the rows out
const LW = 204;           // label width
const SP_ONE_SIDE = LW + 20; // from this spacing every label fits below its line, which makes rows shorter
const LH = 64;            // label height: meta line + two title lines
const GAP = 24;           // line → label
const RUN_SHORT = 28;     // corridor run past the end station when no label sits on the corridor's side
const RUN_LONG = LW / 2 + 8; // corridor run that clears a label sitting on the corridor's side
const CHAMFER = 24;       // the corridor turns down through two 45° chamfers
const TAG_H = 32; const TAG_GAP = 12; const TAG_MIN = 240; const PAD = 24; const ROW_GAP = 16;
// Row geometry: row top → its line, and the row pitch, for labels on both sides or all below the line.
const ROW_BOTH = { lineY: TAG_H + TAG_GAP + LH + GAP, rowH: TAG_H + TAG_GAP + 2 * (LH + GAP) + ROW_GAP };
const ROW_BELOW = { lineY: TAG_H + TAG_GAP + GAP, rowH: TAG_H + TAG_GAP + 2 * GAP + LH + ROW_GAP };
const HIT = 44;
const FADE = 32;          // edge fade of a frame scrolled sideways (same value in path-transit.css)
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
/** "Bài n: title · trạng thái" (plus "Tiếp theo" on the current station). */
export const stationLabel = (row, number, currentId) => `Bài ${number}: ${row.title} · ${statusLabel(row.status)}${isCurrentStation(row, currentId) ? ' · Tiếp theo' : ''}`;

/** Columns, directions, label sides and corridor runs of each chapter row, plus the spacing that fits `avail`. */
function planRows(lines, oneSide, avail) {
  const flip = (side) => (side === 'above' ? 'below' : 'above');
  let col = 0; let dir = 1;
  const rows = lines.map((line, i) => {
    const n = line.stations.length;
    const first = oneSide || i > 0 ? 'below' : (n - 1) % 2 === 0 ? 'above' : 'below';
    const cols = line.stations.map((_, j) => col + dir * j);
    const sides = line.stations.map((_, j) => (oneSide || j % 2 === 0 ? first : flip(first)));
    const row = { cols, sides, dir, out: 0 };
    col = cols[n - 1]; dir = -dir;
    return row;
  });
  rows.forEach((row, i) => {
    if (i < rows.length - 1) row.out = (row.sides[row.sides.length - 1] === 'above' ? RUN_SHORT : RUN_LONG) + CHAMFER;
  });
  const allCols = rows.flatMap((row) => row.cols);
  const span = allCols.length ? Math.max(...allCols) - Math.min(...allCols) : 0;
  // Horizontal extent at spacing sp: labels and the outer edge of each corridor (stroke included).
  const extent = (sp) => {
    let lo = Infinity; let hi = -Infinity;
    rows.forEach((row) => {
      row.cols.forEach((c) => { lo = Math.min(lo, c * sp - LW / 2); hi = Math.max(hi, c * sp + LW / 2); });
      if (row.out) { const cx = row.cols[row.cols.length - 1] * sp + row.dir * (row.out + 6); lo = Math.min(lo, cx); hi = Math.max(hi, cx); }
    });
    return { lo, hi };
  };
  let sp = SP_MIN;
  if (avail > 0 && span > 0) {
    const base = extent(SP_MIN);
    // The extent grows at most `span` px per px of spacing, so this never overshoots the frame.
    sp = Math.min(SP_MAX, Math.max(SP_MIN, SP_MIN + (avail - (base.hi - base.lo + 2 * PAD)) / span));
  }
  return { rows, span, sp, extent, geo: oneSide ? ROW_BELOW : ROW_BOTH };
}

/**
 * Positions every station. Each chapter is its own horizontal row; rows run alternately left→right and right→left,
 * so a row starts under the station where the previous one ended and the two are joined by a white transfer corridor
 * that steps out past the end, turns down through 45° chamfers and comes back in.
 * Station spacing spreads the rows to fill `avail` px (the frame width) between SP_MIN and SP_MAX. When that leaves
 * room for every label below its line, rows drop the upper label band. Otherwise labels alternate above/below within
 * a row; a row after the first starts with its label below, and a corridor runs short when the last label of the row
 * above sits above the line, long enough to clear that label when it does not.
 */
export function layoutNetwork(lines, currentId, avail = 0) {
  const below = planRows(lines, true, avail);
  const plan = avail > 0 && (below.span === 0 || below.sp >= SP_ONE_SIDE) ? below : planRows(lines, false, avail);
  const { rows, sp, geo } = plan;
  const { lo, hi } = rows.length ? plan.extent(sp) : { lo: 0, hi: -2 * PAD };
  const xOf = (c) => c * sp - lo + PAD;
  const width = hi - lo + 2 * PAD;
  const LINE_Y = geo.lineY;
  const placed = lines.map((line, i) => {
    const y = PAD + i * geo.rowH + LINE_Y;
    const { cols, sides } = rows[i];
    return { ...line, y, stations: line.stations.map((s, j) => ({ ...s, x: xOf(cols[j]), y, side: sides[j] })) };
  });
  const links = placed.slice(0, -1).map((line, i) => {
    const { dir, out } = rows[i];
    const a = line.stations[line.stations.length - 1];
    const b = placed[i + 1].stations[0];
    const run = out - CHAMFER;
    const pts = [[a.x, a.y], [a.x + dir * run, a.y], [a.x + dir * out, a.y + CHAMFER], [a.x + dir * out, b.y - CHAMFER], [a.x + dir * run, b.y], [b.x, b.y]];
    return { id: placed[i + 1].id, x: a.x + dir * out, dir, points: pts, travelled: a.row.status === 'done' && (b.row.status === 'done' || b.row.id === currentId) };
  });
  // Chapter tag over each row. Only the corridor arriving from the row above crosses the tag band, so the tag is
  // clipped on that side and may grow the other way to stay legible.
  placed.forEach((line, i) => {
    const xs = line.stations.map((s) => s.x);
    let x0 = Math.min(...xs) - LW / 2; let x1 = Math.max(...xs) + LW / 2;
    const inc = i > 0 ? links[i - 1] : null;
    if (inc && inc.dir > 0) x1 = Math.min(x1, inc.x - 16);
    if (inc && inc.dir < 0) x0 = Math.max(x0, inc.x + 16);
    const need = TAG_MIN - (x1 - x0);
    if (need > 0) {
      if (!inc || inc.dir > 0) x0 = Math.max(PAD, x0 - (inc ? need : need / 2));
      if (!inc || inc.dir < 0) x1 = Math.min(width - PAD, x1 + (inc ? need : need / 2));
    }
    line.tag = { x: x0, w: Math.max(x1 - x0, 0), y: line.y - LINE_Y };
  });
  return { lines: placed, links, width, height: placed.length ? 2 * PAD + placed.length * geo.rowH - ROW_GAP : 0 };
}

/**
 * Scroll offset near `target` that cuts the least label and tag text at the faded edges, keeping canvas point `keep`
 * (zoom-1 px) clearly inside the frame. Labels from different rows overlap in x, so a clean edge is not always
 * possible; this picks the least-cut position among those that put an edge on a text boundary.
 */
function settleScroll(net, zoom, el, target, keep) {
  const cw = el.clientWidth;
  const max = Math.max(0, Math.round(net.width * zoom - cw));
  const clamp = (v) => Math.min(max, Math.max(0, Math.round(v)));
  // Rendered extents (zoomed canvas px) of the label and tag text: the real words, not the 204px label boxes.
  const sizer = el.firstElementChild;
  const base = sizer ? sizer.getBoundingClientRect().left : 0;
  const spans = Array.from(el.querySelectorAll('.pt-label > *, .pt-tag-no, .pt-tag-name'), (n) => {
    const r = n.getBoundingClientRect();
    return [r.left - base, r.right - base];
  }).filter(([a, b]) => b > a);
  const cutAt = (e) => spans.reduce((sum, [a, b]) => sum + (a < e && e < b ? Math.min(e - a, b - e) : 0), 0);
  const cost = (L) => (L > 0 ? cutAt(L + FADE / 2) : 0) + (L < max ? cutAt(L + cw - FADE / 2) : 0);
  const margin = FADE + HIT;
  // Stay near the asked-for position (a fifth of the frame at most) with the kept point well inside.
  const near = clamp(target);
  const fits = (L) => Math.abs(L - near) <= cw / 5 && (keep == null || (keep * zoom >= L + margin && keep * zoom <= L + cw - margin));
  const options = [clamp(target)];
  spans.forEach(([a, b]) => options.push(clamp(a - FADE - 4), clamp(b), clamp(b + FADE + 4 - cw), clamp(a - cw)));
  let best = options[0]; let bestCost = fits(best) ? cost(best) : Infinity;
  options.forEach((L) => {
    if (!fits(L)) return;
    const c = cost(L);
    if (c < bestCost - 0.5 || (Math.abs(c - bestCost) <= 0.5 && Math.abs(L - target) < Math.abs(best - target))) { best = L; bestCost = c; }
  });
  return best;
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
    ['done', 'Đã học'], ['current', 'Tiếp theo'], ['todo', 'Chưa học'], ['skippable', 'Có thể bỏ qua'], ['locked', 'Chưa đủ tiên quyết'], ['link', 'Chuyển chương'],
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

/** Edge fades only on the sides that hide more of the network. */
function markEdges(el) {
  const max = el.scrollWidth - el.clientWidth;
  el.style.setProperty('--pt-fade-l', el.scrollLeft > 1 ? `${FADE}px` : '0px');
  el.style.setProperty('--pt-fade-r', el.scrollLeft < max - 1 ? `${FADE}px` : '0px');
}

/** Whole network inside the navy frame: fits the frame at 100%, scrolls sideways only when zoomed beyond it. */
function NetworkMap({ lines, currentId, onOpen }) {
  const scroller = useRef(null);
  const [avail, setAvail] = useState(0);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const measure = () => setAvail(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const net = useMemo(() => layoutNetwork(lines, currentId, avail), [lines, currentId, avail]);
  const [zi, setZi] = useState(1);
  const zoom = ZOOMS[zi];
  const scrollable = avail > 0 && net.width * zoom > avail + 1;
  const buttons = useRef(new Map());
  const centre = useRef(null);
  const cur = net.lines.flatMap((l) => l.stations).find((s) => s.row.id === currentId);

  // Zoomed beyond the frame: open on the current station, after a zoom keep the same point in the middle.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !avail) return;
    if (!scrollable) { el.scrollLeft = 0; centre.current = null; markEdges(el); return; }
    const keep = centre.current ?? (cur ? cur.x : net.width / 2);
    el.scrollLeft = settleScroll(net, zoom, el, keep * zoom - el.clientWidth / 2, keep);
    markEdges(el);
  }, [zoom, avail, net.width, scrollable]); // eslint-disable-line react-hooks/exhaustive-deps
  const setZoom = (next) => {
    const el = scroller.current;
    centre.current = el && scrollable ? (el.scrollLeft + el.clientWidth / 2) / zoom : null;
    setZi(next);
  };
  const locate = () => {
    const el = scroller.current;
    if (el && cur && scrollable) {
      centre.current = null;
      el.scrollTo({ left: settleScroll(net, zoom, el, cur.x * zoom - el.clientWidth / 2, cur.x), behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
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
      <div className={`pt-scroll ${scrollable ? 'is-scrollable' : ''}`} ref={scroller} onScroll={scrollable ? (e) => markEdges(e.currentTarget) : undefined}>
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
                    {isCur ? <span className="pt-label-here">Tiếp theo</span>
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
                  {isCur ? <span className="pt-label-here">Tiếp theo</span> : <span className="pt-label-meta">Bài {s.number} · <span className="pt-mono">{Codi.fmt.duration(s.row.durationMin)}</span></span>}
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
