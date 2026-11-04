/**
 * Notices a new deploy in a tab that stays open. The built index.html names one hashed entry script
 * (/assets/index-<hash>.js); a tab still running an older one would keep showing old pages, because in-app
 * navigation never reloads. The check re-reads "/" when the tab comes back into view and every few minutes; once the
 * entry script differs, the next route change is a full page load of that route, so no form or unsent input is lost
 * mid-page. The Vite dev server has no hashed entry, so nothing runs there.
 */
const ENTRY_RE = /\/assets\/index-[\w-]+\.js/;
const INTERVAL_MS = 5 * 60 * 1000;

const loaded = (() => {
  const s = typeof document !== 'undefined' && document.querySelector('script[type="module"][src*="/assets/index-"]');
  const m = s && ENTRY_RE.exec(s.getAttribute('src') || '');
  return m ? m[0] : null;
})();

let stale = false;
let checking = false;
let lastCheck = 0;

async function check() {
  if (!loaded || stale || checking || Date.now() - lastCheck < 30000) return;
  checking = true; lastCheck = Date.now();
  try {
    const res = await fetch('/', { cache: 'no-store', credentials: 'same-origin' });
    const m = res.ok ? ENTRY_RE.exec(await res.text()) : null;
    if (m && m[0] !== loaded) stale = true;
  } catch { /* offline or transient: try again later */ } finally { checking = false; }
}

/** Starts watching for a new release (call once at boot). */
export function watchRelease() {
  if (!loaded) return;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, INTERVAL_MS);
}

/** After a route change: reloads the (already updated) URL when a newer release is out. Returns true if it did. */
export function reloadIfStale() {
  if (!stale) { check(); return false; }
  window.location.reload();
  return true;
}
