// Video citations for AI answers: the transcript lines a model may cite as "[mm:ss]", and the second a retrieved
// transcript chunk starts at, so a citation can seek the video there. Pure functions; callers load the cues.
import { clock } from "./classroom-contract";

export type Cue = { start: number; end?: number; text: string };

/** How every AI surface is told to cite the video. The learner UI turns a real "[mm:ss]" into a seek button. */
export const VIDEO_CITE_RULE =
  "Khi ý trả lời dựa vào lời giảng video, dẫn mốc thời gian đúng như trong transcript, dạng [mm:ss] (ví dụ [02:15]), đặt ngay sau ý đó. Chỉ dùng mốc có thật trong transcript, không tự bịa mốc.";

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const words = (s: string) => fold(s).match(/[\p{L}\p{N}]+/gu) ?? [];

export const cueLine = (c: Cue) => `[${clock(c.start)}] ${c.text}`;

/**
 * The transcript as "[mm:ss] line" rows within `max` characters: all of it when it fits, else the cues around the
 * ones that share the most words with `query` (two before, three after), kept in time order.
 */
export function relevantTranscript(cues: Cue[] | null, query: string, max = 5000) {
  if (!cues?.length) return "";
  const full = cues.map(cueLine).join("\n");
  if (full.length <= max) return full;
  const q = new Set(words(query).filter((w) => w.length >= 3));
  const scored = cues
    .map((c, i) => ({ i, score: words(c.text).filter((w) => q.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const keep = new Set<number>();
  let size = 0;
  for (const { i } of scored) {
    for (let k = Math.max(0, i - 2); k <= Math.min(cues.length - 1, i + 3); k++) {
      if (keep.has(k)) continue;
      const len = cueLine(cues[k]!).length + 1;
      if (size + len > max) break;
      keep.add(k);
      size += len;
    }
    if (size >= max * 0.9) break;
  }
  if (!keep.size) return full.slice(0, max);
  return [...keep].sort((a, b) => a - b).map((k) => cueLine(cues[k]!)).join("\n");
}

/**
 * The second at which a transcript chunk (as indexed for search) begins in the video, by finding its first words in
 * the cue text; null when the chunk does not come from these cues.
 */
export function chunkStartSeconds(chunk: string, cues: Cue[] | null): number | null {
  if (!cues?.length) return null;
  const target = words(chunk);
  if (target.length < 3) return null;
  const flat: { w: string; cue: number }[] = [];
  cues.forEach((c, i) => { for (const w of words(c.text)) flat.push({ w, cue: i }); });
  // Chunks overlap and may start mid-word, so try a few starting offsets and a shrinking probe.
  for (const skip of [0, 1, 2, 3]) {
    for (const len of [8, 5, 3]) {
      const probe = target.slice(skip, skip + len);
      if (probe.length < 3) continue;
      for (let i = 0; i + probe.length <= flat.length; i++) {
        if (probe.every((w, k) => flat[i + k]!.w === w)) return Math.floor(cues[flat[i]!.cue]!.start);
      }
    }
  }
  return null;
}
