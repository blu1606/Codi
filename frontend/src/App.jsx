import { Component, useEffect } from 'react';
import { Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Codi, bindRouter, useCodi } from './lib/codi';
import { reloadIfStale, watchRelease } from './lib/release-check';
import { allRoutes } from './features';
import AppLayout from './components/layout/app-layout';
import { NotFoundPage, ForbiddenPage, SignInRequiredPage } from './components/layout/guard-pages';
import { Alert } from './components/ui/primitives';

/** Keeps Codi.go / Codi.path / Codi.query in sync with react-router. */
function RouterBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  bindRouter(navigate, location);
  useEffect(() => { watchRelease(); }, []);
  // A tab opened before the latest deploy loads the new build on its next page change.
  useEffect(() => { reloadIfStale(); }, [location.pathname]);
  return null;
}

/** Shows a render error in place instead of a blank page (mockup: "Không thể hiển thị trang này"). */
class RouteErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (this.state.error) {
      return <div className="page page-narrow"><Alert type="danger" title="Không thể hiển thị trang này" body={String(this.state.error.message || this.state.error)} /></div>;
    }
    return this.props.children;
  }
}

/**
 * Wraps a feature route: role guard, document title, focus-on-navigate (mockup render()).
 * The element receives params and query as props too, so ported render(params, query) code maps directly.
 */
function RouteFrame({ route }) {
  useCodi();
  const params = useParams();
  const [search] = useSearchParams();
  const location = useLocation();
  const query = Object.fromEntries(search);
  const allowed = !route.role || (Array.isArray(route.role) ? route.role : [route.role]).includes(Codi.role());

  useEffect(() => {
    document.title = (route.title || 'Codi') + ' · Codi';
  }, [route.title]);
  useEffect(() => {
    window.scrollTo(0, 0);
    const h1 = document.querySelector('#app-main h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  }, [location.pathname]);

  if (!allowed) return Codi.role() === 'guest' ? <SignInRequiredPage /> : <ForbiddenPage />;
  const El = route.element;
  return (
    <RouteErrorBoundary resetKey={location.pathname}>
      {typeof El === 'function' ? <El params={params} query={query} /> : El}
    </RouteErrorBoundary>
  );
}

export default function App() {
  return (
    <>
      <RouterBridge />
      <Routes>
        {/* Focus layout: header shows only the logo and an exit link (lesson player, onboarding, checkout …) */}
        {['default', 'focus'].map((layout) => (
          <Route key={layout} element={<AppLayout layout={layout} />}>
            {allRoutes.filter((r) => (r.layout || 'default') === layout).map((r) => (
              <Route key={r.path} path={r.path} element={<RouteFrame route={r} />} handle={r} />
            ))}
          </Route>
        ))}
        <Route element={<AppLayout layout="default" />}>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
