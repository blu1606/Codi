import { Link, Outlet, matchPath, useLocation } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { allRoutes } from '../../features';
import { Icon } from '../ui/primitives';
import { OverlayHost } from '../ui/overlay-host';
import Header from '../../features/shell/header';
import DevDrawer, { DevToggle } from '../../features/shell/dev-drawer';
import ThemeToggle from '../../features/shell/theme-toggle';
import { useThemeSync } from '../../features/shell/theme';
import BrandLink from '../../features/shell/brand-link';

/** The route definition matching the current URL (static segments outrank params, like the mockup router). */
export function useCurrentRoute() {
  const { pathname } = useLocation();
  const hits = allRoutes.filter((r) => matchPath({ path: r.path, end: true }, pathname));
  const score = (p) => p.split('/').map((s) => (s.startsWith(':') ? '1' : '2')).join('');
  return hits.sort((a, b) => (score(b.path) > score(a.path) ? 1 : -1))[0] || null;
}

function FocusHeader({ route }) {
  const exit = (route && route.exit) || { href: Codi.homeFor(Codi.role()), label: 'Thoát' };
  return (
    <div className="app-header-inner hd hd-focus">
      <BrandLink to={Codi.homeFor(Codi.role())} />
      <div className="header-actions">
        <DevToggle />
        <ThemeToggle />
        <Link className="btn btn-ghost hd-exit" to={typeof exit.href === 'function' ? exit.href() : exit.href}><Icon name="x" /> {exit.label}</Link>
      </div>
    </div>
  );
}

export default function AppLayout({ layout }) {
  useCodi();
  useThemeSync(); // the layout wraps every route, so it hosts the theme listener
  const route = useCurrentRoute();
  return (
    <>
      <a className="sr-only" href="#app-main">Bỏ qua đến nội dung chính</a>
      {layout !== 'reader' && (
        <header id="app-header" className="app-header">
          {layout === 'focus' ? <FocusHeader route={route} /> : <Header />}
        </header>
      )}
      <main id="app-main" className={`app-main ${layout === 'reader' ? 'is-reader' : ''}`.trim()} tabIndex={-1}>
        <Outlet />
      </main>
      <OverlayHost />
      {Codi.demoTools && <DevDrawer />}
    </>
  );
}
