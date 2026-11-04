/**
 * Small pieces the Tutor views share: icons the shared set lacks, the Tutor mark, an accessible dropdown menu and a
 * popover (outside click and Escape close it, focus returns to its button), and the "Lưu ý khi dùng Trợ giảng AI" notes.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Codi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import { KEEP_HISTORY } from './tutor-contract';

// 1.75-stroke outline paths in the shared icon style, for glyphs lib/icon-paths.js does not carry.
const EXTRA = {
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  maximize: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/>',
  'square-pen': '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.4 2.6a2 2 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  'panel-close': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
  'panel-open': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/>',
  brain: '<path d="M12 5a3 3 0 0 0-5.9-.8A3 3 0 0 0 4 9a3 3 0 0 0 .5 5.5A3 3 0 0 0 9 19a3 3 0 0 0 3 2z"/><path d="M12 5a3 3 0 0 1 5.9-.8A3 3 0 0 1 20 9a3 3 0 0 1-.5 5.5A3 3 0 0 1 15 19a3 3 0 0 1-3 2"/><path d="M12 5v16"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  'chevrons-left': '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>',
  'arrow-up-send': '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
};
export function TIcon({ name, className = '' }) {
  if (!EXTRA[name]) return <Icon name={name} className={className} />;
  return (
    <svg className={`icon ${className}`.trim()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: EXTRA[name] }} />
  );
}

/** The Tutor's mark: a teal face with two eyes and an amber "online" dot. */
export function TutorAvatar({ size = 'md' }) {
  return <span className={`tc-avatar is-${size}`} aria-hidden="true"><span className="tc-avatar-eyes"><i /><i /></span><span className="tc-avatar-dot" /></span>;
}

/** Shared open/close behaviour: outside pointer and Escape close; closing returns focus to the trigger. */
function useDismiss(open, setOpen, root, trigger) {
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (root.current && !root.current.contains(e.target)) setOpen(false); };
    const key = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      if (trigger.current) trigger.current.focus();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key, true); };
  }, [open, setOpen, root, trigger]);
}

/**
 * Dropdown menu. items: [{ key, label, icon?, checked?, onSelect, disabled? }] (checked ⇒ menuitemradio).
 * renderTrigger(props) renders the button; props carry ref, aria and onClick. up/end place the list.
 */
export function Menu({ items, renderTrigger, up = false, end = false, label }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const list = useRef(null);
  const id = useId();
  useDismiss(open, setOpen, root, trigger);
  useEffect(() => {
    if (!open || !list.current) return;
    const first = list.current.querySelector('[role^="menuitem"]:not([disabled])');
    if (first) first.focus();
  }, [open]);
  const onKeyDown = (e) => {
    const all = [...list.current.querySelectorAll('[role^="menuitem"]:not([disabled])')];
    const at = all.indexOf(document.activeElement);
    const go = (n) => { e.preventDefault(); if (all.length) all[(n + all.length) % all.length].focus(); };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(all.length - 1);
    else if (e.key === 'Tab') setOpen(false);
  };
  const pick = (item) => { setOpen(false); if (trigger.current) trigger.current.focus(); item.onSelect(); };
  return (
    <div className="tc-menu" ref={root}>
      {renderTrigger({ ref: trigger, 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': open ? id : undefined, onClick: () => setOpen((v) => !v) })}
      {open ? (
        <div id={id} ref={list} role="menu" aria-label={label} className={`tc-menu-list ${up ? 'is-up' : ''} ${end ? 'is-end' : ''}`.trim()} onKeyDown={onKeyDown}>
          {items.map((item) => (
            <button key={item.key} type="button" role={item.checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={item.checked === undefined ? undefined : item.checked}
              tabIndex={-1} disabled={item.disabled} onClick={() => pick(item)}>
              {item.checked !== undefined ? <span className="tc-menu-check">{item.checked ? <Icon name="check" className="icon-sm" /> : null}</span> : item.icon ? <TIcon name={item.icon} className="icon-sm" /> : null}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Popover holding richer content (the history list). children: (close) => ReactNode. */
export function Popover({ renderTrigger, children, label, onOpen }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  useDismiss(open, setOpen, root, trigger);
  useEffect(() => { if (open && onOpen) onOpen(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { setOpen(false); if (trigger.current) trigger.current.focus(); };
  return (
    <div className="tc-menu" ref={root}>
      {renderTrigger({ ref: trigger, 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-controls': open ? id : undefined, onClick: () => setOpen((v) => !v), open })}
      {open ? <div id={id} role="dialog" aria-label={label} className="tc-popover">{children(close)}</div> : null}
    </div>
  );
}

/** "Lưu ý khi dùng Trợ giảng AI": one line under the composer, the full notes in a dialog. */
export function AiDisclaimer({ signedIn }) {
  const show = () => Codi.ui.modal({
    title: 'Lưu ý khi dùng Trợ giảng AI',
    body: (
      <div className="stack-3">
        <p className="muted">Tutor giúp bạn hiểu bài, không làm bài thay bạn.</p>
        <ul className="tc-notes">
          <li>Tutor trả lời theo tài liệu của Codi, kèm nguồn để mở lại đúng chỗ. Tutor có thể trả lời sai, hãy đối chiếu với bài học.</li>
          <li>Tutor không chấm điểm, không đổi điểm và không viết sẵn lời giải. Với bài code, Tutor chỉ gợi ý hướng làm.</li>
          <li>Tutor đọc bài đang mở và phần code, lỗi, test bạn thấy trong khung ngữ cảnh. Bạn bỏ bớt được từng phần.</li>
          <li>Đừng nhập thông tin cá nhân như số CCCD, số điện thoại, sức khoẻ hay tài khoản ngân hàng.</li>
          <li>{signedIn ? KEEP_HISTORY : 'Bạn chưa đăng nhập nên đoạn chat không được lưu. Đăng nhập để giữ lịch sử.'}</li>
        </ul>
      </div>
    ),
  });
  return <p className="tc-disclaimer"><button type="button" className="tc-link-quiet" onClick={show}>Lưu ý khi dùng Trợ giảng AI</button></p>;
}
