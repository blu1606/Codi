import { Link, Outlet, matchPath, useLocation } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { allRoutes } from '../../features';
import { Icon } from '../ui/primitives';
import { OverlayHost } from '../ui/overlay-host';
import Header from '../../features/shell/header';
import DevDrawer from '../../features/shell/dev-drawer';
import ThemeToggle from '../../features/shell/theme-toggle';

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
    <div className="app-header-inner">
      <Link className="logo" to="/"><span className="logo-mark">C</span>Codi</Link>
      <div className="header-actions">
        <ThemeToggle />
        <Link className="btn btn-ghost" to={typeof exit.href === 'function' ? exit.href() : exit.href}><Icon name="x" /> {exit.label}</Link>
      </div>
    </div>
  );
}

export default function AppLayout({ layout }) {
  useCodi();
  const route = useCurrentRoute();
  return (
    <>
      <a className="sr-only" href="#app-main">Bỏ qua đến nội dung chính</a>
      <header id="app-header" className="app-header">
        {layout === 'focus' ? <FocusHeader route={route} /> : <Header />}
      </header>
      <main id="app-main" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
      <OverlayHost />
      <DevDrawer />
    </>
  );
}
