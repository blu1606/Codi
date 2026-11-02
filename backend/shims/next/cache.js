// next/cache: the backend renders no pages, so cache invalidation is a no-op.
export function revalidatePath() {}
export function revalidateTag() {}
export function updateTag() {}
export function refresh() {}
export function unstable_noStore() {}
export function unstable_cache(fn) { return fn; }
