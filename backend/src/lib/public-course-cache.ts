import { onRevalidate } from "next/cache";

// Short-lived cache for the public catalogue and course detail. Both answers are the same for every visitor, and the
// catalogue query validates each course's knowledge-map JSON in SQL, so under load they were a large share of the
// database work. Entries live TTL_MS; any revalidatePath/revalidateTag call (the lecturer and admin actions make one
// after changing a course) and clearPublicCourseCache() empty it at once.
const TTL_MS = 30_000;
// Course slugs come from the URL; the bound keeps a stream of made-up slugs from growing the map.
const MAX_ENTRIES = 500;

type Entry = { expires: number; value: Promise<unknown> };
const entries = new Map<string, Entry>();

/**
 * Returns the cached value for key, or loads it. Concurrent callers share one load. A failed load is not kept, and
 * keep(value) === false (e.g. "course not found") is returned without being cached.
 */
export function cachedPublic<T>(key: string, load: () => Promise<T>, keep: (value: T) => boolean = () => true): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;
  if (entries.size >= MAX_ENTRIES) entries.clear();
  const value = load();
  entries.set(key, { expires: now + TTL_MS, value });
  const drop = () => {
    if (entries.get(key)?.value === value) entries.delete(key);
  };
  value.then((v) => (keep(v) ? undefined : drop()), drop);
  return value;
}

export function clearPublicCourseCache(): void {
  entries.clear();
}

onRevalidate(clearPublicCourseCache);
