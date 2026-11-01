/**
 * Real "Chưa thể tải hoặc cập nhật dữ liệu học tập" state, driven by the store's actual sync result
 * (syncStatus.error in src/lib/codi.js). The store does not emit when a background sync fails, so the flag is
 * re-read on a short interval. Retry resends everything (the store resets its diff after a failure).
 */
import { useCallback, useEffect, useState } from 'react';
import { Codi, syncStatus } from '../../lib/codi';

export function useSyncError() {
  const [error, setError] = useState(() => syncStatus.error);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setError(syncStatus.error), 1500);
    return () => clearInterval(t);
  }, []);
  const retry = useCallback(async () => {
    setRetrying(true);
    try { await Codi.flush(); } catch { /* syncStatus carries the failure */ }
    setRetrying(false);
    setError(syncStatus.error);
    Codi.rerender();
  }, []);
  return [error, retry, retrying];
}
