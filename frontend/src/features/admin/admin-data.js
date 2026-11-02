/**
 * Backend access for the admin console. Lists come from GET /api/admin/* routes, everything else from the Codi
 * server actions (dashboard/admin, dashboard/admin/publication). After a write, notifyAdminChange() makes every
 * mounted admin loader re-fetch (the order drawer lives in an overlay, outside the page tree).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/use-api';
import { Codi } from '../../lib/codi';

export const adminAction = (name, ...args) => api.action('dashboard/admin', name, ...args);
export const pubAction = (name, ...args) => api.action('dashboard/admin/publication', name, ...args);

const listeners = new Set();
export const notifyAdminChange = () => listeners.forEach((fn) => fn());
function useOnAdminChange(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const l = () => ref.current();
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
}

/** useApi(url) that also re-fetches after any admin write. */
export function useAdminGet(url) {
  const res = useApi(url);
  useOnAdminChange(res.reload);
  return res;
}

/**
 * Calls a server action on mount and whenever its arguments change: { data, loading, error, reload }.
 * `name` null skips the call. Late replies of superseded calls are dropped.
 */
export function useAction(module, name, args = []) {
  const key = JSON.stringify(args);
  const [state, setState] = useState({ data: null, loading: !!name, error: null });
  const seq = useRef(0);
  const load = useCallback(async () => {
    const n = ++seq.current;
    if (!name) { setState({ data: null, loading: false, error: null }); return null; }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.action(module, name, ...JSON.parse(key));
      if (n === seq.current) setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      if (n === seq.current) setState((s) => ({ ...s, loading: false, error }));
      return null;
    }
  }, [module, name, key]);
  useEffect(() => { load(); return () => { seq.current += 1; }; }, [load]);
  useOnAdminChange(load);
  return { ...state, reload: load };
}

/** Runs a backend write; toasts the server's message on failure. Resolves the result, or null on failure. */
export async function attempt(fn, success) {
  try {
    const result = await fn();
    if (success) Codi.ui.toast(typeof success === 'function' ? success(result) : success, { type: 'success' });
    notifyAdminChange();
    return result ?? true;
  } catch (e) {
    Codi.ui.toast((e && e.message) || 'Lỗi máy chủ. Vui lòng thử lại.', { type: 'danger' });
    return null;
  }
}

/** Shell badge: open publication requests (refreshed with every admin write). */
export function usePendingCount() {
  const { data } = useAction('dashboard/admin/publication', 'getAdminPublicationQueue', ['pending']);
  return data && data.counts ? data.counts.pending : 0;
}

export const ROLE_TO_SERVER = { learner: 'LEARNER', lecturer: 'LECTURER', admin: 'ADMIN' };
export const ROLE_FROM_SERVER = { LEARNER: 'learner', LECTURER: 'lecturer', ADMIN: 'admin' };
export const LEVEL_LABEL = { Beginner: 'Cơ bản', Intermediate: 'Trung cấp', Advanced: 'Nâng cao' };
