import { useEffect, useRef } from 'react';

// Last selection seen by any pane. Module scope survives a remount caused by moving between routes
// (for example /teach/grading to /teach/grading/:id), and resets on a full page load.
let lastSelected; // undefined until the first pane renders

/**
 * On narrow screens the split list stacks above its detail pane. After the lecturer picks an item, scroll the detail
 * into view so the reply or grading form is not hidden below the rest of the list. Desktop layout is unaffected.
 * A page load (no earlier pane rendered) does not scroll.
 */
export function useRevealOnSelect(selectedId) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = lastSelected;
    lastSelected = selectedId;
    if (previous === undefined || previous === selectedId || !selectedId || !ref.current) return;
    if (!window.matchMedia || !window.matchMedia('(max-width: 900px)').matches) return;
    // The app shell scrolls to the top on every route change in a parent effect that runs after this one,
    // so the reveal waits one tick to land after that reset.
    const timer = setTimeout(() => ref.current && ref.current.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
    return () => clearTimeout(timer);
  }, [selectedId]);
  return ref;
}
