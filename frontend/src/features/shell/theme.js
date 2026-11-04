/**
 * Theme preference — port of the real app's next-themes setup (components/theme-provider.tsx, mode-toggle.tsx):
 * "Sáng" | "Tối" | "Theo hệ thống" (default system), chosen from the account menu and kept in localStorage.
 *
 * The runtime (src/lib/codi.js applyTheme) paints <html data-theme> from Codi.state.scenario.theme on every
 * Codi.set, so this module stores the *resolved* value ('light' | 'dark') there and the *preference* in its own
 * localStorage key. Installs Codi.theme = { get, set, resolved }.
 */
import { useEffect } from 'react';
import { Codi } from '../../lib/codi';

const KEY = 'codi-theme';
const PREFS = ['light', 'dark', 'system'];

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

function readPref() {
  try {
    const v = localStorage.getItem(KEY);
    return PREFS.includes(v) ? v : 'system';
  } catch {
    return 'system'; // storage blocked: follow the system for this tab
  }
}

function resolve(pref) {
  if (pref === 'system') { const m = media(); return m && m.matches ? 'dark' : 'light'; }
  return pref;
}

/** Writes the resolved theme into the runtime scenario so applyTheme keeps <html data-theme> in sync. */
function apply(pref) {
  const value = resolve(pref);
  if (Codi.state.scenario && Codi.state.scenario.theme === value) return;
  Codi.set((s) => { s.scenario = { ...s.scenario, theme: value }; });
}

function set(pref) {
  if (!PREFS.includes(pref)) return;
  try { localStorage.setItem(KEY, pref); } catch { /* keep the choice for this tab only */ }
  const before = Codi.state.scenario && Codi.state.scenario.theme;
  apply(pref);
  if (before === resolve(pref)) Codi.rerender(); // preference changed but the colours did not: refresh the radios
}

Object.assign(Codi, { theme: { get: readPref, set, resolved: () => resolve(readPref()) } });

/**
 * Keeps the theme in sync after the store loads, when the OS scheme changes (preference "system") and when
 * another tab changes the preference. Mount once in a component that is always rendered.
 */
export function useThemeSync() {
  useEffect(() => {
    apply(readPref());
    const m = media();
    const onScheme = () => { if (readPref() === 'system') apply('system'); };
    const onStorage = (e) => { if (e.key === KEY) apply(readPref()); };
    if (m && m.addEventListener) m.addEventListener('change', onScheme);
    window.addEventListener('storage', onStorage);
    return () => {
      if (m && m.removeEventListener) m.removeEventListener('change', onScheme);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
}

export const THEME_OPTIONS = [['light', 'Sáng', 'sun'], ['dark', 'Tối', 'moon'], ['system', 'Theo hệ thống', 'monitor']];
