// next/cache: the backend renders no pages, so there is no page cache to invalidate. A revalidation call still means
// "content changed", so it notifies the backend's own caches registered with onRevalidate().
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

export function onRevalidate(listener) {
  listeners.add(listener);
}
export function revalidatePath() { notify(); }
export function revalidateTag() { notify(); }
export function updateTag() { notify(); }
export function refresh() {}
export function unstable_noStore() {}
export function unstable_cache(fn) { return fn; }
