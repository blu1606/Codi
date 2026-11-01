/**
 * Overlays: toasts, modals, sheets (incl. docked side panels) and confirm dialogs.
 *
 * Imperative API (installed on Codi.ui, mirrors the mockup):
 *   Codi.ui.toast(msg, { type:'info'|'success'|'warn'|'danger', action:{ label, onClick }, duration })
 *   const h = Codi.ui.modal({ title, body, footer, size:'md'|'lg', dismissible, onClose })
 *   const h = Codi.ui.sheet({ title, body, footer, wide, docked, side:'left', onClose })
 *       body/footer: a ReactNode, or (handle) => ReactNode (re-evaluated on every store change, so it stays live).
 *       handle: { close(), update(patch) }
 *   const { ok, reason } = await Codi.ui.confirm({ title, body, consequence, reversible, confirmLabel, cancelLabel,
 *                                                 danger, requireReason, reasonLabel, reasonPlaceholder, typeToConfirm })
 *   Codi.ui.closeAll()   Codi.ui.copy(text, buttonEl)
 *
 * Declarative: <Modal open onClose title footer size>…</Modal>, <Sheet open onClose title footer wide docked side>…</Sheet>
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Icon, Alert, ALERT_ICON } from './primitives';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ───────────────────────── overlay stack store ─────────────────────────
let stack = []; // [{ id, kind, opts }]
let toasts = [];
let ver = 0;
const subs = new Set();
const bump = () => { ver += 1; subs.forEach((f) => f()); };
const useOverlayStore = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => ver);
let seq = 0;

function open(kind, opts) {
  const id = ++seq;
  const entry = { id, kind, opts: opts || {} };
  const handle = {
    close() {
      if (!stack.includes(entry)) return;
      stack = stack.filter((e) => e !== entry);
      bump();
      if (entry.opts.onClose) entry.opts.onClose();
    },
    update(patch) { entry.opts = { ...entry.opts, ...patch }; bump(); },
  };
  entry.handle = handle;
  stack = [...stack, entry];
  bump();
  return handle;
}

function toast(msg, opts = {}) {
  const id = ++seq;
  toasts = [...toasts, { id, msg, type: opts.type || 'info', action: opts.action }];
  bump();
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); bump(); }, opts.duration || (opts.action ? 7000 : 3500));
}
const dismissToast = (id) => { toasts = toasts.filter((t) => t.id !== id); bump(); };

function copy(text, btn) {
  const done = () => {
    if (!btn) return;
    const label = btn.querySelector('[data-copy-label]') || btn;
    const prev = label.textContent;
    label.textContent = 'Đã sao chép';
    btn.classList.add('is-copied');
    setTimeout(() => { label.textContent = prev; btn.classList.remove('is-copied'); }, 1600);
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(String(text)).then(done, done);
  else {
    const ta = document.createElement('textarea');
    ta.value = String(text); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove(); done();
  }
}

function ConfirmBody({ o, handle, resolve }) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const rev = o.reversible === undefined ? null : o.reversible === true ? 'Có thể hoàn tác sau.' : o.reversible === false ? 'Không thể hoàn tác.' : o.reversible;
  const ok = () => {
    if (o.requireReason && !reason.trim()) { setReasonError(true); return; }
    resolve({ ok: true, reason: reason.trim() });
    handle.close();
  };
  return (
    <>
      <div className="dialog-body">
        {o.body && <p>{o.body}</p>}
        {o.consequence && <Alert type={o.danger ? 'danger' : 'warn'} title="Điều gì sẽ xảy ra" body={o.consequence} />}
        {rev && <p className="small muted"><Icon name={o.reversible === false ? 'alert-circle' : 'rotate-ccw'} className="icon-sm" /> {rev}</p>}
        {o.requireReason && (
          <div className={`field ${reasonError ? 'is-invalid' : ''}`}>
            <label htmlFor="confirm-reason">{o.reasonLabel || 'Lý do'} <span className="req">*</span></label>
            <textarea id="confirm-reason" rows={3} placeholder={o.reasonPlaceholder || ''} value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(false); }} autoFocus />
            {reasonError && <p className="field-error"><Icon name="alert-circle" className="icon-sm" /><span>Vui lòng nhập lý do.</span></p>}
          </div>
        )}
        {o.typeToConfirm && (
          <div className="field">
            <label htmlFor="confirm-type">Nhập <code>{o.typeToConfirm}</code> để xác nhận</label>
            <input id="confirm-type" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        )}
      </div>
      <div className="dialog-footer">
        <button type="button" className="btn btn-secondary" onClick={() => handle.close()}>{o.cancelLabel || 'Huỷ'}</button>
        <button type="button" className={`btn ${o.danger ? 'btn-danger' : 'btn-primary'}`} disabled={o.typeToConfirm ? typed.trim() !== o.typeToConfirm : false} onClick={ok}>
          {o.confirmLabel || 'Xác nhận'}
        </button>
      </div>
    </>
  );
}

function confirm(o = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const h = open('modal', {
      title: o.title || 'Xác nhận',
      raw: true,
      body: (handle) => <ConfirmBody o={o} handle={handle} resolve={finish} />,
      onClose: () => finish({ ok: false }),
    });
    return h;
  });
}

Object.assign(Codi.ui, {
  toast,
  modal: (opts) => open('modal', opts),
  sheet: (opts) => open('sheet', opts),
  confirm,
  copy,
  closeAll() { [...stack].reverse().forEach((e) => e.handle.close()); },
});

// ───────────────────────── docked panel resize ─────────────────────────
const DOCK_KEY = 'codi-dock-width';
const DOCK_MIN = 320;
const dockMax = () => Math.max(DOCK_MIN, Math.min(720, Math.round(window.innerWidth * 0.5)));
function setDockWidth(w, save) {
  const v = Math.min(dockMax(), Math.max(DOCK_MIN, Math.round(w)));
  document.documentElement.style.setProperty('--dock-w', v + 'px');
  if (save) { try { localStorage.setItem(DOCK_KEY, String(v)); } catch { /* ignore */ } }
}
function DockResize({ panelRef }) {
  useEffect(() => {
    let saved = 0;
    try { saved = Number(localStorage.getItem(DOCK_KEY)); } catch { /* ignore */ }
    if (saved) setDockWidth(saved, false);
  }, []);
  const cur = () => (panelRef.current && panelRef.current.getBoundingClientRect().width) || 400;
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const h = e.currentTarget;
    h.setPointerCapture(e.pointerId);
    document.body.classList.add('is-dock-resizing');
    const move = (ev) => setDockWidth(window.innerWidth - ev.clientX, false);
    const up = () => {
      h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up);
      document.body.classList.remove('is-dock-resizing');
      setDockWidth(cur(), true);
    };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === 'ArrowLeft') setDockWidth(cur() + step, true);
    else if (e.key === 'ArrowRight') setDockWidth(cur() - step, true);
    else if (e.key === 'Home') { document.documentElement.style.removeProperty('--dock-w'); try { localStorage.removeItem(DOCK_KEY); } catch { /* ignore */ } }
    else return;
    e.preventDefault();
  };
  return (
    <div className="dock-resize" tabIndex={0} role="separator" aria-orientation="vertical" aria-label="Kéo hoặc dùng phím mũi tên để đổi độ rộng panel"
      title="Kéo để đổi độ rộng · Nhấp đúp để về mặc định" onPointerDown={onPointerDown} onKeyDown={onKeyDown}
      onDoubleClick={() => document.documentElement.style.removeProperty('--dock-w')} />
  );
}

// ───────────────────────── frame ─────────────────────────
let titleSeq = 0;
/** Dialog / sheet frame shared by the imperative stack and the declarative components. */
function OverlayFrame({ kind, opts, onClose, isTop }) {
  const panelRef = useRef(null);
  const [titleId] = useState(() => 'ov-' + ++titleSeq);
  const docked = kind === 'sheet' && !!opts.docked;
  const dismissible = opts.dismissible !== false;

  useEffect(() => {
    const prev = document.activeElement;
    const panel = panelRef.current;
    const first = panel && (panel.querySelector('[autofocus]') || panel.querySelector('.dialog-body ' + FOCUSABLE.split(', ').join(', .dialog-body ')) || panel.querySelector('.sheet-body ' + FOCUSABLE.split(', ').join(', .sheet-body ')) || panel.querySelector(FOCUSABLE));
    if (first) first.focus();
    if (docked) document.body.classList.add('has-docked-panel');
    return () => {
      if (docked) setTimeout(() => { if (!document.querySelector('.overlay-docked')) document.body.classList.remove('has-docked-panel'); }, 0);
      if (prev && prev.focus && document.contains(prev)) prev.focus();
    };
  }, [docked]);

  useEffect(() => {
    if (!isTop) return undefined;
    const onKey = (e) => {
      const panel = panelRef.current;
      if (!panel) return;
      const dockedWide = docked && window.matchMedia('(min-width: 1024px)').matches;
      if (e.key === 'Escape' && dismissible && (!dockedWide || panel.contains(document.activeElement))) { e.preventDefault(); onClose(); }
      if (e.key === 'Tab' && !dockedWide) {
        const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const first = items[0]; const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isTop, docked, dismissible, onClose]);

  const isSheet = kind === 'sheet';
  const rootCls = isSheet ? `overlay sheet-overlay${docked ? ' overlay-docked' : ''}${opts.side === 'left' ? ' sheet-left' : ''}` : 'overlay';
  const panelCls = isSheet ? `sheet ${opts.wide ? 'sheet-wide' : ''}` : `dialog ${opts.size === 'lg' ? 'dialog-lg' : ''}`;
  const render = (x) => (typeof x === 'function' ? x(opts.__handle) : x);
  // Clicking an element with data-close (or a link inside the panel) closes the overlay, like the mockup.
  const onClick = (e) => { if (e.target.closest('[data-close]')) onClose(); };

  return (
    <div className={rootCls} onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible) onClose(); }}>
      <div ref={panelRef} className={panelCls} role="dialog" aria-modal={docked ? 'false' : 'true'} aria-labelledby={opts.title ? titleId : undefined} onClick={onClick}>
        {docked && <DockResize panelRef={panelRef} />}
        {opts.title && (
          <div className={isSheet ? 'sheet-header' : 'dialog-header'}>
            <h2 id={titleId}>{opts.title}</h2>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Đóng"><Icon name="x" /></button>
          </div>
        )}
        {opts.raw ? render(opts.body) : (
          <>
            <div className={isSheet ? 'sheet-body' : 'dialog-body'}>{render(opts.body)}</div>
            {opts.footer && <div className={isSheet ? 'sheet-footer' : 'dialog-footer'}>{render(opts.footer)}</div>}
          </>
        )}
      </div>
    </div>
  );
}

/** Mount once near the root: renders the imperative overlay stack and toasts. */
export function OverlayHost() {
  useOverlayStore();
  useCodi(); // keep function bodies live with store changes
  return createPortal(
    <>
      {stack.map((e, i) => (
        <OverlayFrame key={e.id} kind={e.kind} opts={{ ...e.opts, __handle: e.handle }} onClose={e.handle.close} isTop={i === stack.length - 1} />
      ))}
      <div className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'danger' ? 'alert' : 'status'}>
            <Icon name={ALERT_ICON[t.type] || 'info'} />
            <span>{t.msg}</span>
            {t.action && (
              <span className="toast-actions">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { dismissToast(t.id); t.action.onClick(); }}>{t.action.label}</button>
              </span>
            )}
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
}

/** Declarative modal. */
export function Modal({ open: isOpen, onClose, title, footer, size, dismissible, children }) {
  if (!isOpen) return null;
  return createPortal(<OverlayFrame kind="modal" opts={{ title, footer, size, dismissible, body: children }} onClose={onClose} isTop />, document.body);
}

/** Declarative sheet. docked: side panel beside the page on ≥1024px (no backdrop). */
export function Sheet({ open: isOpen, onClose, title, footer, wide, docked, side, children }) {
  if (!isOpen) return null;
  return createPortal(<OverlayFrame kind="sheet" opts={{ title, footer, wide, docked, side, body: children }} onClose={onClose} isTop />, document.body);
}
