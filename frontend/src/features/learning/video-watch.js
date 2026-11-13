/**
 * Real watch time of a lesson video. Players report their position while playing; a step only counts when the
 * position moved forward no faster than playback could (2.5× the wall-clock time since the last report, + 1 s), so
 * dragging the seek bar ahead is never counted as watching. The stretches are saved with the video progress and the
 * lesson only reminds the learner ("bạn chưa xem đủ") before moving on; it never blocks completion.
 */
export const WATCH_RATIO = 0.9;
const MAX_RATE = 2.5;

/** Sorted union of [start, end] stretches; gaps under 1 s join. */
export function mergeRanges(list) {
  const sorted = (Array.isArray(list) ? list : [])
    .filter((r) => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[1] > r[0])
    .map(([a, b]) => [Math.max(0, a), b])
    .sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const prev = out[out.length - 1];
    if (prev && a <= prev[1] + 1) prev[1] = Math.max(prev[1], b);
    else out.push([a, b]);
  }
  return out;
}

export function coveredSeconds(ranges, duration) {
  const end = duration > 0 ? duration : Infinity;
  return mergeRanges(ranges).reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, end) - Math.min(a, end)), 0);
}

/** Tracks one player: tick(position) while playing, reset() on pause / seek / buffering, add(a, b) for a known stretch. */
export function createWatchTracker(initial) {
  let ranges = mergeRanges(initial);
  let last = null;
  let lastAt = 0;
  return {
    tick(position, now = Date.now()) {
      if (!Number.isFinite(position)) return;
      if (last !== null && position > last && position - last <= ((now - lastAt) / 1000) * MAX_RATE + 1) {
        ranges = mergeRanges([...ranges, [last, position]]);
      }
      last = position;
      lastAt = now;
    },
    add(a, b) { ranges = mergeRanges([...ranges, [a, b]]); },
    reset() { last = null; },
    ranges: () => ranges.map((r) => [Math.round(r[0] * 10) / 10, Math.round(r[1] * 10) / 10]),
  };
}

/**
 * The lesson's videos with their real watch percentage when none of them was watched for 90% of its length (the same
 * "one video is enough" rule the server uses for "studied"), else []: [{ id, title, percent }]. media is the lesson's
 * saved progress; live(id) may add the stretches a mounted player has not saved yet. Videos without a known length
 * are skipped (there is nothing to measure).
 */
export function watchShortfall(materials, media, live) {
  const all = (materials || [])
    .filter((m) => m.type === 'video' && m.durationSeconds > 0)
    .map((m) => {
      const saved = ((media || {})[m.id] || {}).watched || [];
      const extra = (live && live(m.id)) || [];
      const percent = Math.min(100, Math.round((coveredSeconds([...saved, ...extra], m.durationSeconds) / m.durationSeconds) * 100));
      return { id: m.id, title: m.title, percent };
    });
  return all.some((x) => x.percent >= WATCH_RATIO * 100) ? [] : all;
}

/** "[m:ss]", "[mm:ss]" or "[h:mm:ss]" → seconds, or null. */
export function parseClock(value) {
  const m = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/.exec(String(value || '').trim());
  if (!m || Number(m[3]) > 59) return null;
  return (Number(m[1] || 0) * 3600) + (Number(m[2]) * 60) + Number(m[3]);
}
