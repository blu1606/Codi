// Transient lecturer view state (editor drafts, toggles) lives in module variables like the mockup.
// rerender() re-renders subscribed components without touching Codi.state (no sync to the server).
import { useSyncExternalStore } from 'react';

let version = 0;
const subs = new Set();

export function rerender() {
  version += 1;
  subs.forEach((f) => f());
}

export function useView() {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version);
}
