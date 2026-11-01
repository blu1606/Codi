/**
 * Avatar picker — port of the real app's components/profile/avatar-picker.tsx and lib/avatar-presets.ts.
 * Upload (PNG/JPEG/WebP/SVG, max 5 MB) opens a crop dialog (zoom 1–3, drag, arrow keys, pan buttons, "Căn giữa"),
 * output 512×512 JPEG. Cloudflare R2 is simulated: the result is a data URL that is saved into user.image when the
 * profile form is saved. Presets are the six Codi avatars, drawn inline (no DiceBear request).
 */
import { useEffect, useRef, useState } from 'react';
import { Codi } from '../../lib/codi';
import { Avatar, Icon } from '../../components/ui/primitives';
import { Modal } from '../../components/ui/overlay-host';
import { ShellIcon } from './shell-ui';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const OUTPUT = 512;

// Six preset bots (names and colours from the real PRESET_DEFAULT_AVATARS).
const bot = (bg, eyes, mouth, antenna) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/>`
  + `<rect x="14" y="18" width="36" height="30" rx="8" fill="#ffffff" fill-opacity="0.92"/>`
  + (antenna ? '<path d="M32 18v-7" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="9" r="3.5" fill="#ffffff"/>' : '<rect x="24" y="12" width="16" height="6" rx="3" fill="#ffffff" fill-opacity="0.92"/>')
  + eyes + mouth + '</svg>',
);
const DOTS = '<circle cx="25" cy="31" r="3.5" fill="#0f172a"/><circle cx="39" cy="31" r="3.5" fill="#0f172a"/>';
const VISOR = '<rect x="20" y="27" width="24" height="8" rx="4" fill="#0f172a"/>';
const SQUARES = '<rect x="21" y="27" width="7" height="7" rx="1.5" fill="#0f172a"/><rect x="36" y="27" width="7" height="7" rx="1.5" fill="#0f172a"/>';
const SMILE = '<path d="M25 40q7 5 14 0" stroke="#0f172a" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
const FLAT = '<path d="M26 41h12" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>';
const GRILL = '<path d="M25 40h14M28 38v4M32 38v4M36 38v4" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/>';
export const AVATAR_PRESETS = [
  { id: 'codi-bot', name: 'Codi Bot', url: bot('#0ea5e9', DOTS, SMILE, true) },
  { id: 'neon-coder', name: 'Cyber Hacker', url: bot('#6366f1', VISOR, FLAT, false) },
  { id: 'tech-wizard', name: 'Tech Wizard', url: bot('#10b981', DOTS, GRILL, true) },
  { id: 'pixel-ninja', name: 'Pixel Ninja', url: bot('#f59e0b', SQUARES, FLAT, false) },
  { id: 'algo-master', name: 'Algo Master', url: bot('#ec4899', SQUARES, SMILE, true) },
  { id: 'coffee-dev', name: 'Coffee Dev', url: bot('#8b5cf6', VISOR, SMILE, true) },
];

function CropDialog({ source, onClose, onDone }) {
  const frameRef = useRef(null);
  const drag = useRef({ active: false, x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => { const t = setTimeout(() => frameRef.current && frameRef.current.focus(), 50); return () => clearTimeout(t); }, []);

  const frame = () => (frameRef.current && frameRef.current.clientWidth) || 280;
  const clamp = (x, y, z = zoom) => {
    if (!natural.w || !natural.h) return { x, y };
    const f = frame(); const base = Math.max(f / natural.w, f / natural.h);
    const maxX = Math.max(0, (natural.w * base * z - f) / 2); const maxY = Math.max(0, (natural.h * base * z - f) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  };
  const move = (dx, dy) => setPos((p) => clamp(p.x + dx, p.y + dy));
  const onKey = (e) => {
    const step = e.shiftKey ? 25 : 10;
    const map = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [step, 0], ArrowRight: [-step, 0] };
    if (!map[e.key]) return;
    e.preventDefault(); move(...map[e.key]);
  };
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Không thể đọc ảnh')); img.src = source; });
      const f = frame();
      const scale = Math.max(f / img.naturalWidth, f / img.naturalHeight) * zoom;
      const k = OUTPUT / f;
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT; canvas.height = OUTPUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Không thể xử lý ảnh');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, OUTPUT, OUTPUT); // transparent PNG/SVG areas become white in JPEG
      ctx.drawImage(img, ((f - img.naturalWidth * scale) / 2 + pos.x) * k, ((f - img.naturalHeight * scale) / 2 + pos.y) * k, img.naturalWidth * scale * k, img.naturalHeight * scale * k);
      onDone(canvas.toDataURL('image/jpeg', 0.85));
    } catch (err) {
      Codi.ui.toast(err instanceof Error ? err.message : 'Không thể xử lý ảnh', { type: 'danger' });
      setBusy(false);
    }
  };

  const footer = (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose}>Huỷ bỏ</button>
      <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>{busy ? 'Đang xử lý…' : 'Dùng ảnh này'}</button>
    </>
  );
  return (
    <Modal open onClose={onClose} title="Chỉnh sửa hình ảnh" footer={footer}>
      <div ref={frameRef} className="shell-crop-frame" tabIndex={0} role="region" aria-label="Khung điều chỉnh vị trí ảnh. Dùng các phím mũi tên để dịch chuyển ảnh." onKeyDown={onKey}>
        <img src={source} alt="Xem trước ảnh đại diện" draggable={false}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          onPointerDown={(e) => { drag.current = { active: true, x: e.clientX - pos.x, y: e.clientY - pos.y }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (drag.current.active) setPos(clamp(e.clientX - drag.current.x, e.clientY - drag.current.y)); }}
          onPointerUp={() => { drag.current.active = false; }} onPointerCancel={() => { drag.current.active = false; }}
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})` }} />
        <span className="shell-crop-ring" aria-hidden="true" />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Icon name="minus" className="icon-sm" />
        <input className="od-fill" aria-label="Phóng to ảnh" type="range" min="1" max="3" step="0.01" value={zoom}
          onChange={(e) => { const z = Number(e.target.value); setZoom(z); setPos((p) => clamp(p.x, p.y, z)); }} />
        <Icon name="plus" className="icon-sm" /><ShellIcon name="zoom-in" className="icon-sm" />
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className="small muted">Dịch chuyển:</span>
        <button type="button" className="btn btn-secondary btn-icon btn-sm" aria-label="Dịch lên" onClick={() => move(0, 15)}><Icon name="arrow-up" className="icon-sm" /></button>
        <button type="button" className="btn btn-secondary btn-icon btn-sm" aria-label="Dịch xuống" onClick={() => move(0, -15)}><Icon name="arrow-down" className="icon-sm" /></button>
        <button type="button" className="btn btn-secondary btn-icon btn-sm" aria-label="Dịch sang trái" onClick={() => move(15, 0)}><Icon name="arrow-left" className="icon-sm" /></button>
        <button type="button" className="btn btn-secondary btn-icon btn-sm" aria-label="Dịch sang phải" onClick={() => move(-15, 0)}><Icon name="arrow-right" className="icon-sm" /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPos({ x: 0, y: 0 })}>Căn giữa</button>
      </div>
      <p className="xsmall muted">Kéo chuột hoặc chọn khung và dùng phím mũi tên (↑ ↓ ← →) để dịch ảnh</p>
    </Modal>
  );
}

export default function AvatarPicker({ current, userName, onSelected, disabled = false }) {
  const inputRef = useRef(null);
  const [source, setSource] = useState(null);
  const busy = disabled;

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || busy) return;
    if (file.size > MAX_BYTES) { Codi.ui.toast('Ảnh không được vượt quá 5MB', { type: 'danger' }); return; }
    if (!TYPES.includes(file.type)) { Codi.ui.toast('Định dạng file không được hỗ trợ. Vui lòng chọn file JPEG, PNG, WebP hoặc SVG.', { type: 'danger' }); return; }
    const reader = new FileReader();
    reader.onload = () => setSource(String(reader.result));
    reader.onerror = () => Codi.ui.toast('Không thể đọc ảnh', { type: 'danger' });
    reader.readAsDataURL(file);
  };

  return (
    <div className="stack-4">
      {source && <CropDialog source={source} onClose={() => setSource(null)} onDone={(url) => { setSource(null); onSelected(url); }} />}
      <div className="row" style={{ gap: 16 }}>
        <div className="shell-avatar-current">
          {current ? <img src={current} alt={userName || 'Ảnh đại diện'} /> : <Avatar user={{ name: userName }} size="lg" />}
          <button type="button" className="shell-avatar-camera" onClick={() => inputRef.current && inputRef.current.click()} disabled={busy} title="Đổi ảnh đại diện" aria-label="Đổi ảnh đại diện"><ShellIcon name="camera" className="icon-sm" /></button>
        </div>
        <div className="stack-2">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} disabled={busy} />
          <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current && inputRef.current.click()} disabled={busy}><Icon name="upload" className="icon-sm" /> Chọn ảnh</button></div>
          <p className="xsmall muted">Hỗ trợ PNG, JPG, WebP tối đa 5MB. Ảnh chỉ được lưu khi bấm Lưu thay đổi.</p>
        </div>
      </div>
      <div className="stack-2">
        <span className="small row" style={{ gap: 6 }}><Icon name="sparkles" className="icon-sm" /> Hoặc chọn từ bộ Avatar mặc định Codi:</span>
        <div className="shell-presets">
          {AVATAR_PRESETS.map((p) => {
            const on = current === p.url;
            return (
              <button key={p.id} type="button" className="shell-preset" onClick={() => !busy && onSelected(p.url)} disabled={busy} aria-pressed={on} title={p.name} aria-label={p.name}>
                <img src={p.url} alt="" />
                {on && <span className="shell-preset-check" aria-hidden="true"><Icon name="check" className="icon-sm" /></span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
