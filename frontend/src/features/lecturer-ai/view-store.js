/**
 * Tiny re-render signal for module-level view state (the mockup's `let view = {...}` + rerender()).
 * The state itself lives in a module variable so it survives navigation; components subscribe with useStore().
 */
import { useSyncExternalStore } from 'react';

export function createViewStore() {
  let version = 0;
  const subs = new Set();
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  return {
    bump() { version += 1; subs.forEach((fn) => fn()); },
    useStore() { return useSyncExternalStore(subscribe, () => version); },
  };
}
