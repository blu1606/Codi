/**
 * Role-aware app header (one layout for every role, 64 px, sticky) — port of the real app's components/header.tsx,
 * cart-nav-button.tsx, user-menu.tsx and notification-menu.tsx (./notification-menu.jsx).
 *
 *  brand · primary nav (icon + label, aria-current on nested routes, live badges) · global search · cart ·
 *  notifications · theme · account menu (guests: Đăng nhập + Đăng ký).
 *  ≤ 1024 px the nav moves into a left drawer (focus-trapped <Sheet>, Esc closes) and search becomes an icon button.
 *
 * Nav items, counts and account links come from ./nav-config.js; search from ./global-search.jsx. The focus-layout
 * header lives in src/components/layout/app-layout.jsx and shares <BrandLink>.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Codi, ROLE_LABEL, useCodi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import { Sheet } from '../../components/ui/overlay-host';
import { openSignIn } from './auth';
import NotificationMenu from './notification-menu';
import ThemeToggle from './theme-toggle';
import { ShellIcon, UserAvatar } from './shell-ui';
import { THEME_OPTIONS } from './theme';
import { accountUser } from './account-store';
import BrandLink from './brand-link';
import { useCartCount } from '../commerce/commerce-api';
import { GlobalSearch, SearchTrigger, openSearch } from './global-search';
import { accountLinks, primaryNav } from './nav-config';
import { useAdminNavCounts } from '../admin/admin-data';
import { DevToggle } from './dev-drawer';

const badgeText = (n) => (n > 99 ? '99+' : String(n));
const isActive = (item, path) => item.match.test(path);

function NavBadge({ item }) {
  if (!item.count) return null;
  return <span className="hd-badge" aria-hidden="true">{badgeText(item.count)}</span>;
}
const navLabel = (item) => (item.count ? `${item.label}, ${item.count} ${item.countLabel}` : undefined);

/** "Giao diện" radio group (real ThemeMenuGroup), used in the account menu and the drawer. */
function ThemeGroup({ idSuffix = '' }) {
  useCodi();
  const pref = Codi.theme ? Codi.theme.get() : 'system';
  const labelId = `theme-group-label${idSuffix}`;
  return (
    <>
      <div className="shell-menu-label" id={labelId}>Giao diện</div>
      <div role="radiogroup" aria-labelledby={labelId}>
        {THEME_OPTIONS.map(([v, label, icon]) => (
          <button key={v} type="button" role="radio" aria-checked={pref === v} className="menu-item shell-radio-item" onClick={() => Codi.theme && Codi.theme.set(v)}>
            <ShellIcon name={icon} /> <span className="od-fill">{label}</span>{pref === v && <Icon name="check" className="icon-sm" />}
          </button>
        ))}
      </div>
    </>
  );
}

function useSignOut(onDone) {
  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (onDone) onDone();
      await Codi.signOut();
    } catch {
      Codi.ui.toast('Không thể đăng xuất. Vui lòng thử lại.', { type: 'danger' });
    } finally {
      setSigningOut(false);
    }
  };
  return [signingOut, signOut];
}

function UserMenu({ u, open, onToggle, onClose }) {
  const [signingOut, signOut] = useSignOut(onClose);
  const name = (u.name || '').trim() || 'Tài khoản';
  const firstName = name.split(/\s+/).slice(-1)[0];
  return (
    <div className="popover-anchor">
      <button type="button" className="btn btn-ghost header-icon-btn hd-user-btn" onClick={onToggle} aria-expanded={open} aria-haspopup="true" aria-label={`Mở menu tài khoản của ${name}`} title={name}>
        <UserAvatar user={u} size="sm" /><span className="hd-user-name od-truncate" aria-hidden="true">{firstName}</span><Icon name="chevron-down" className="icon-sm hd-user-chev" />
      </button>
      {open && (
        <div className="popover shell-user-pop">
          <div className="menu-head"><strong className="od-truncate" style={{ display: 'block' }}>{name}</strong><span className="small muted od-truncate" style={{ display: 'block' }}>{u.email}</span><span className="badge badge-accent" style={{ marginTop: 8 }}>{ROLE_LABEL[u.role]}</span></div>
          {accountLinks(u.role).map((l) => <Link key={l.href} className="menu-item" to={l.href} onClick={onClose}><ShellIcon name={l.icon} /> {l.label}</Link>)}
          <hr className="shell-sep" />
          <ThemeGroup />
          <hr className="shell-sep" />
          <button type="button" className="menu-item shell-danger-item" disabled={signingOut} onClick={signOut}><Icon name="log-out" /> Đăng xuất</button>
        </div>
      )}
    </div>
  );
}

function CartButton({ role }) {
  const cart = useCartCount();
  const count = role === 'learner' ? cart || 0 : 0;
  const label = `Giỏ hàng, ${count} khoá học`;
  const onClick = (e) => {
    if (role !== 'guest') return;
    e.preventDefault();
    Codi.requireAuth(() => Codi.go('/cart'), { reason: 'Đăng nhập để xem giỏ hàng của bạn.' });
  };
  return (
    <Link className="btn btn-ghost btn-icon header-icon-btn" to="/cart" onClick={onClick} aria-label={label} title="Giỏ hàng"
      aria-current={/^\/cart(\/|$)/.test(Codi.path()) ? 'page' : undefined}>
      <Icon name="cart" />{count ? <span className="count-dot" aria-hidden="true">{badgeText(count)}</span> : null}
    </Link>
  );
}

/** Mobile / narrow-screen drawer: search, the same nav items, cart, account and theme. */
function NavDrawer({ open, onClose, adminCounts }) {
  useCodi();
  const u = accountUser();
  const role = Codi.role();
  const path = Codi.path();
  const items = primaryNav(role, adminCounts);
  const [signingOut, signOut] = useSignOut(onClose);
  const cart = useCartCount();
  const cartCount = role === 'learner' ? cart || 0 : 0;
  const search = () => { onClose(); setTimeout(openSearch, 0); };
  return (
    <Sheet open={open} onClose={onClose} title="Menu Codi" side="left">
      <div className="hd-drawer">
        <button type="button" className="hd-search hd-search-block" onClick={search} aria-haspopup="dialog">
          <Icon name="search" className="icon-sm" /><span className="hd-search-text">Tìm khoá học, bài học, trang…</span>
        </button>
        <nav aria-label="Điều hướng chính (menu)" className="hd-drawer-nav">
          {items.map((it) => (
            <Link key={it.href} className="menu-item hd-drawer-link" to={it.href} data-close="" aria-current={isActive(it, path) ? 'page' : undefined} aria-label={navLabel(it)}>
              <Icon name={it.icon} /> <span className="od-fill">{it.label}</span><NavBadge item={it} />
            </Link>
          ))}
          {(role === 'learner' || role === 'guest') && (
            <Link className="menu-item hd-drawer-link" to="/cart" data-close="" aria-current={/^\/cart(\/|$)/.test(path) ? 'page' : undefined} aria-label={`Giỏ hàng, ${cartCount} khoá học`}
              onClick={(e) => { if (role === 'guest') { e.preventDefault(); onClose(); Codi.requireAuth(() => Codi.go('/cart'), { reason: 'Đăng nhập để xem giỏ hàng của bạn.' }); } }}>
              <Icon name="cart" /> <span className="od-fill">Giỏ hàng</span>{cartCount ? <span className="hd-badge" aria-hidden="true">{badgeText(cartCount)}</span> : null}
            </Link>
          )}
        </nav>
        <hr className="shell-sep" />
        {u ? (
          <div className="hd-drawer-account">
            <div className="hd-drawer-user"><UserAvatar user={u} size="sm" /><span className="od-fill" style={{ minWidth: 0 }}><strong className="od-truncate" style={{ display: 'block' }}>{u.name}</strong><span className="small muted od-truncate" style={{ display: 'block' }}>{u.email} · {ROLE_LABEL[u.role]}</span></span></div>
            {accountLinks(role).filter((l) => !items.some((it) => it.href === l.href)).map((l) => (
              <Link key={l.href} className="menu-item" to={l.href} data-close=""><ShellIcon name={l.icon} /> {l.label}</Link>
            ))}
          </div>
        ) : (
          <div className="hd-drawer-guest">
            <button type="button" className="btn btn-secondary" onClick={() => { onClose(); openSignIn(null); }}>Đăng nhập</button>
            <Link className="btn btn-primary" to="/register" data-close="">Đăng ký</Link>
          </div>
        )}
        <hr className="shell-sep" />
        <ThemeGroup idSuffix="-drawer" />
        {u && (
          <>
            <hr className="shell-sep" />
            <button type="button" className="menu-item shell-danger-item" disabled={signingOut} onClick={signOut}><Icon name="log-out" /> Đăng xuất</button>
          </>
        )}
      </div>
    </Sheet>
  );
}

export default function Header() {
  useCodi();
  const location = useLocation();
  const [openMenu, setOpenMenu] = useState(null); // 'user' | 'notif' | null
  const [drawer, setDrawer] = useState(false);
  const u = accountUser();
  const role = Codi.role();
  const path = Codi.path();
  const adminCounts = useAdminNavCounts(role === 'admin');
  const items = primaryNav(role, adminCounts);

  // Navigation closes any open popover or drawer; outside click and Escape close popovers too.
  useEffect(() => { setOpenMenu(null); setDrawer(false); }, [location.pathname, location.search]);
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

  return (
    <div className="app-header-inner hd">
      <button type="button" className="btn btn-ghost btn-icon header-icon-btn hd-burger" onClick={() => setDrawer(true)} aria-label="Mở menu" aria-haspopup="dialog" aria-expanded={drawer}><Icon name="menu" /></button>
      <BrandLink to={Codi.homeFor(role)} />
      <nav className="hd-nav" aria-label="Điều hướng chính">
        {items.map((it) => (
          <Link key={it.href} className="hd-nav-link" to={it.href} aria-current={isActive(it, path) ? 'page' : undefined} aria-label={navLabel(it)}>
            <Icon name={it.icon} className="hd-nav-icon" /><span>{it.label}</span><NavBadge item={it} />
          </Link>
        ))}
      </nav>
      <div className="hd-search-slot"><SearchTrigger /></div>
      <div className="header-actions hd-actions">
        <DevToggle />
        <span className="hd-search-compact"><SearchTrigger compact /></span>
        {(role === 'learner' || role === 'guest') && <CartButton role={role} />}
        {u && <NotificationMenu open={openMenu === 'notif'} onToggle={() => toggle('notif')} onClose={close} />}
        <span className="hd-theme"><ThemeToggle /></span>
        {u ? (
          <UserMenu u={u} open={openMenu === 'user'} onToggle={() => toggle('user')} onClose={close} />
        ) : (
          <>
            <Link className="btn btn-ghost hd-login" to="/login" onClick={(e) => { e.preventDefault(); openSignIn(null); }}>Đăng nhập</Link>
            <Link className="btn btn-primary hd-register" to="/register">Đăng ký</Link>
          </>
        )}
      </div>
      <NavDrawer open={drawer} onClose={() => setDrawer(false)} adminCounts={adminCounts} />
      <GlobalSearch />
    </div>
  );
}
