/**
 * Role-aware app header — port of the real app's components/header.tsx, cart-nav-button.tsx, user-menu.tsx,
 * mode-toggle.tsx and notification-menu.tsx (see ./notification-menu.jsx). The focus-layout header lives in
 * src/components/layout/app-layout.jsx; this is the default one.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Codi, ROLE_LABEL, useCodi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import { openSignIn } from './auth';
import NotificationMenu from './notification-menu';
import { ShellIcon, UserAvatar } from './shell-ui';
import { THEME_OPTIONS } from './theme';
import { endSession } from './account-store';

export const NAV = {
  guest: [['/courses', 'Khoá học', /^\/(courses)/], ['/ai', 'AI', /^\/ai/]],
  learner: [['/courses', 'Khoá học', /^\/(courses|cart|checkout)/], ['/dashboard', 'Học tập của tôi', /^\/(dashboard|learn|progress)/], ['/ai', 'AI', /^\/ai/]],
  lecturer: [['/teach', 'Giảng dạy', /^\/teach/], ['/courses', 'Khoá học', /^\/courses/]],
  admin: [['/admin', 'Quản trị', /^\/admin/], ['/courses', 'Khoá học', /^\/courses/]],
};
const roleHomeLabel = (role) => (role === 'admin' ? 'Bảng quản trị' : role === 'lecturer' ? 'Khu vực giảng dạy' : 'Bàn làm việc');

function MobileNav() {
  useCodi();
  const role = Codi.role();
  const count = role === 'learner' ? Codi.cart().length : 0;
  return (
    <nav className="stack-1" aria-label="Điều hướng chính">
      {NAV[role].map(([href, label]) => <Link key={href} className="menu-item" to={href} data-close="">{label}</Link>)}
      {role === 'learner' && (
        <Link className="menu-item" to="/cart" data-close="" aria-label={`Giỏ hàng, ${count} khoá học`}>
          <Icon name="cart" /> <span className="od-fill">Giỏ hàng</span>{count ? <span className="count count-accent">{count}</span> : null}
        </Link>
      )}
      {role === 'guest'
        ? <Link className="menu-item" to="/login" data-close="">Đăng nhập</Link>
        : <><Link className="menu-item" to="/profile" data-close="">Hồ sơ cá nhân (Profile)</Link><Link className="menu-item" to="/settings" data-close="">Cài đặt (Setting)</Link></>}
    </nav>
  );
}
const openMobileNav = () => Codi.ui.sheet({ title: 'Menu Codi', body: () => <MobileNav /> });

/** "Giao diện" radio group (real ThemeMenuGroup). */
function ThemeGroup() {
  const [pref, setPref] = useState(() => (Codi.theme ? Codi.theme.get() : 'system'));
  const choose = (v) => { setPref(v); if (Codi.theme) Codi.theme.set(v); };
  return (
    <>
      <hr className="shell-sep" />
      <div className="shell-menu-label" id="theme-group-label">Giao diện</div>
      <div role="radiogroup" aria-labelledby="theme-group-label">
        {THEME_OPTIONS.map(([v, label, icon]) => (
          <button key={v} type="button" role="radio" aria-checked={pref === v} className="menu-item shell-radio-item" onClick={() => choose(v)}>
            <ShellIcon name={icon} /> <span className="od-fill">{label}</span>{pref === v && <Icon name="check" className="icon-sm" />}
          </button>
        ))}
      </div>
    </>
  );
}

function UserMenu({ u, open, onToggle, onClose }) {
  const [signingOut, setSigningOut] = useState(false);
  const name = (u.name || '').trim() || 'Tài khoản';
  const firstName = name.split(/\s+/).slice(-1)[0];
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await Codi.wait(250);
      onClose();
      endSession();
    } catch {
      Codi.ui.toast('Không thể đăng xuất. Vui lòng thử lại.', { type: 'danger' });
    } finally {
      setSigningOut(false);
    }
  };
  const item = (to, icon, label) => <Link className="menu-item" to={to} onClick={onClose}><Icon name={icon} /> {label}</Link>;
  return (
    <div className="popover-anchor">
      <button type="button" className="btn btn-ghost header-icon-btn" onClick={onToggle} aria-expanded={open} aria-haspopup="menu" aria-label={`Mở menu tài khoản của ${name}`} title={name}>
        <UserAvatar user={u} size="sm" /><span className="desktop-only small od-truncate" style={{ maxWidth: 96 }} aria-hidden="true">{firstName}</span><Icon name="chevron-down" className="icon-sm desktop-only" />
      </button>
      {open && (
        <div className="popover shell-user-pop">
          <div className="menu-head"><strong className="od-truncate" style={{ display: 'block' }}>{name}</strong><span className="small muted od-truncate" style={{ display: 'block' }}>{u.email}</span><span className="badge badge-accent" style={{ marginTop: 8 }}>{ROLE_LABEL[u.role]}</span></div>
          {item(Codi.homeFor(u.role), 'layout-dashboard', roleHomeLabel(u.role))}
          {u.role === 'learner' && item('/progress', 'bar-chart', 'Tiến độ & kết quả')}
          {item('/profile', 'user', 'Hồ sơ cá nhân (Profile)')}
          {u.role === 'learner' && item('/profile?tab=nang-luc', 'github', 'Hồ sơ năng lực')}
          {item('/settings', 'settings', 'Cài đặt (Setting)')}
          <ThemeGroup />
          <hr className="shell-sep" />
          <button type="button" className="menu-item shell-danger-item" disabled={signingOut} onClick={signOut}><Icon name="log-out" /> Đăng xuất</button>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  useCodi();
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState(null); // 'user' | 'notif' | null
  const u = Codi.currentUser();
  const role = Codi.role();
  const path = Codi.path();

  // Navigation closes any open popover; outside click and Escape close it too.
  useEffect(() => { setOpenMenu(null); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!openMenu) return undefined;
    const onClick = (e) => { if (!e.target.closest('.popover-anchor')) setOpenMenu(null); };
    const onKey = (e) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  }, [openMenu]);

  const toggle = (m) => setOpenMenu((cur) => (cur === m ? null : m));
  const close = () => setOpenMenu(null);
  const cartCount = role === 'learner' ? Codi.cart().length : 0;

  return (
    <div className="app-header-inner">
      <button type="button" className="btn btn-ghost btn-icon mobile-only" onClick={openMobileNav} aria-label="Mở menu"><Icon name="menu" /></button>
      <Link className="logo" to={role === 'guest' ? '/' : Codi.homeFor(role)}><span className="logo-mark">C</span>Codi</Link>
      <nav className="main-nav" aria-label="Điều hướng chính">
        {NAV[role].map(([href, label, re]) => <Link key={href} to={href} aria-current={re.test(path) ? 'page' : undefined}>{label}</Link>)}
      </nav>
      <div className="header-actions">
        {role === 'learner' && (
          <Link className="btn btn-ghost btn-icon header-icon-btn" to="/cart" aria-label={`Giỏ hàng, ${cartCount} khoá học`}><Icon name="cart" />{cartCount ? <span className="count-dot" aria-hidden="true">{cartCount > 99 ? '99+' : cartCount}</span> : null}</Link>
        )}
        {u ? (
          <>
            <NotificationMenu open={openMenu === 'notif'} onToggle={() => toggle('notif')} onClose={close} />
            <UserMenu u={u} open={openMenu === 'user'} onToggle={() => toggle('user')} onClose={close} />
          </>
        ) : (
          <Link className="btn btn-primary" to="/login" onClick={(e) => { e.preventDefault(); openSignIn(null); }}>Đăng nhập</Link>
        )}
      </div>
    </div>
  );
}
