/**
 * Header theme control for every visitor (guests, all roles, and the focus-layout header): an icon button showing
 * the current preference (sun / moon / monitor) that opens a three-item menu "Sáng · Tối · Theo hệ thống".
 * Uses Codi.theme (./theme.js), so the choice is persisted and shared with the account menu and the dev drawer.
 *
 * Keyboard: Enter/Space/ArrowDown opens and focuses the checked item; ArrowUp/ArrowDown/Home/End move; Escape closes
 * and returns focus to the button; Tab or an outside click closes.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Codi, useCodi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import { ShellIcon } from './shell-ui';
import { THEME_OPTIONS } from './theme';

export default function ThemeToggle() {
  useCodi(); // Codi.theme.set re-renders subscribers, so the icon follows changes made elsewhere
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const btn = useRef(null);
  const items = useRef([]);
  const menuId = useId();
  const pref = Codi.theme ? Codi.theme.get() : 'system';
  const current = THEME_OPTIONS.find(([v]) => v === pref) || THEME_OPTIONS[2];

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    const i = Math.max(0, THEME_OPTIONS.findIndex(([v]) => v === pref));
    if (items.current[i]) items.current[i].focus();
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]); // focus only when the menu opens, not on every preference change while it is open

  const close = (refocus) => { setOpen(false); if (refocus && btn.current) btn.current.focus(); };
  const choose = (v) => {
    if (Codi.theme) Codi.theme.set(v);
    close(true);
  };
  const onMenuKey = (e) => {
    const list = items.current.filter(Boolean);
    const at = list.indexOf(document.activeElement);
    const move = (k) => { e.preventDefault(); list[(k + list.length) % list.length].focus(); };
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(list.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') setOpen(false);
  };
  const onButtonKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); }
  };

  return (
    <div className="shell-theme-anchor" ref={wrap}>
      <button ref={btn} type="button" className="btn btn-ghost btn-icon header-icon-btn shell-theme-btn"
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        aria-label={`Giao diện: ${current[1]}`} title={`Giao diện: ${current[1]}`}
        onClick={() => setOpen((o) => !o)} onKeyDown={onButtonKey}>
        <ShellIcon name={current[2]} />
      </button>
      {open && (
        <div className="popover shell-theme-pop" id={menuId} role="menu" aria-label="Giao diện" onKeyDown={onMenuKey}>
          {THEME_OPTIONS.map(([v, label, icon], i) => (
            <button key={v} ref={(el) => { items.current[i] = el; }} type="button" role="menuitemradio" aria-checked={pref === v}
              tabIndex={-1} className="menu-item shell-radio-item" onClick={() => choose(v)}>
              <ShellIcon name={icon} /> <span className="od-fill">{label}</span>{pref === v && <Icon name="check" className="icon-sm" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
