import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * Loads a GET endpoint: const { data, loading, error, reload, setData } = useApi('/api/courses').
 * A null/empty url skips the request (e.g. until a param is known). The previous request is aborted when the url
 * changes or the component unmounts, so a late reply never overwrites newer data. reload() returns a promise.
 */
export function useApi(url) {
  const [state, setState] = useState({ data: null, loading: !!url, error: null });
  const ctrl = useRef(null);

  const load = useCallback(async () => {
    if (ctrl.current) ctrl.current.abort();
    if (!url) { setState({ data: null, loading: false, error: null }); return null; }
    const c = new AbortController();
    ctrl.current = c;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(url, { signal: c.signal });
      if (!c.signal.aborted) setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      if (c.signal.aborted || (error && error.name === 'AbortError')) return null;
      setState((s) => ({ ...s, loading: false, error }));
      return null;
    }
  }, [url]);

  useEffect(() => {
    load();
    return () => { if (ctrl.current) ctrl.current.abort(); };
  }, [load]);

  const setData = useCallback((next) => setState((s) => ({ ...s, data: typeof next === 'function' ? next(s.data) : next })), []);
  return { ...state, reload: load, setData };
}
