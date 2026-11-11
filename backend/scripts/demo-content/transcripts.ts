// Transcripts of the demo courses' YouTube lectures: the audio is downloaded with yt-dlp, re-encoded to small mono
// MP3 with ffmpeg and transcribed by OpenAI Whisper (verbose_json segments, Vietnamese). Audio and transcripts are
// cached per video id, so a re-run (or a run against another database) never pays for the same video twice.
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ENV } from "@/env";
import { FFMPEG } from "@/lib/lesson-media";
import { youtubeId } from "@/lib/youtube-transcript";

const run = promisify(execFile);
const WHISPER_MAX_BYTES = 25 * 1024 * 1024;
const WHISPER_USD_PER_MINUTE = 0.006;
// Whisper invents text over silence and music (same filter as the lesson import in lib/lesson-source-extraction.ts).
const SUBTITLE_CREDIT_RE = /subtitles?\s+by|amara\.org|ghiền mì gõ|hãy subscribe cho kênh|đăng ký kênh/i;
// Vocabulary hint: keeps code words in their English spelling inside the Vietnamese transcript.
const WHISPER_PROMPT =
  "Bài giảng lập trình JavaScript của F8 bằng tiếng Việt. Thuật ngữ: JavaScript, var, let, const, function, return, " +
  "scope, closure, array, map, filter, reduce, object, destructuring, spread, DOM, querySelector, innerHTML, textContent, " +
  "addEventListener, preventDefault, stopPropagation, Promise, resolve, reject, then, catch, async, await, fetch, JSON, API.";

export type Cue = { start: number; end: number; text: string };
type WhisperSegment = { start: number; end: number; text: string; no_speech_prob?: number; avg_logprob?: number };
type CachedTranscript = { videoId: string; model: string; language: string; audioSeconds: number; createdAt: string; cues: Cue[] };

export type TranscriptStats = { transcribed: number; cached: number; audioSeconds: number; estimatedUsd: number };

export function createTranscriber(cacheDir: string, log: (line: string) => void) {
  const audioDir = path.join(cacheDir, "audio");
  const textDir = path.join(cacheDir, "transcripts");
  const stats: TranscriptStats = { transcribed: 0, cached: 0, audioSeconds: 0, estimatedUsd: 0 };
  const pending = new Map<string, Promise<Cue[]>>();

  async function readCache(id: string): Promise<CachedTranscript | null> {
    try {
      const data = JSON.parse(await readFile(path.join(textDir, `${id}.json`), "utf8")) as CachedTranscript;
      return Array.isArray(data.cues) && data.cues.length ? data : null;
    } catch {
      return null;
    }
  }

  /** Small mono MP3 of the video's audio track (16 kHz, 32 kbps ≈ 14 MB per hour, under Whisper's 25 MB cap). */
  async function audioOf(id: string): Promise<string> {
    const target = path.join(audioDir, `${id}.mp3`);
    if (await stat(target).catch(() => null)) return target;
    await mkdir(audioDir, { recursive: true });
    const raw = path.join(audioDir, `${id}.source`);
    await run("yt-dlp", ["--no-playlist", "--quiet", "--no-warnings", "-f", "bestaudio[ext=m4a]/bestaudio", "-o", raw,
      `https://www.youtube.com/watch?v=${id}`], { timeout: 15 * 60_000, maxBuffer: 16 * 1024 * 1024 });
    try {
      await run(FFMPEG(), ["-y", "-loglevel", "error", "-i", raw, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "mp3", target],
        { timeout: 15 * 60_000, maxBuffer: 16 * 1024 * 1024 });
    } finally {
      await rm(raw, { force: true });
    }
    return target;
  }

  async function audioSeconds(file: string): Promise<number> {
    const { stderr } = await run(FFMPEG(), ["-hide_banner", "-i", file], { timeout: 60_000 }).catch((error: { stderr?: string }) => ({ stderr: error.stderr ?? "" }));
    const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
  }

  async function whisper(file: string): Promise<WhisperSegment[]> {
    if (!ENV.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set: transcripts need Whisper (or pass --skip-transcripts).");
    const audio = await readFile(file);
    if (audio.length > WHISPER_MAX_BYTES) throw new Error(`${path.basename(file)} is ${Math.round(audio.length / 1e6)} MB, over Whisper's 25 MB limit.`);
    for (let attempt = 1; ; attempt++) {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "audio.mp3");
      form.append("model", "whisper-1");
      form.append("language", "vi");
      form.append("prompt", WHISPER_PROMPT);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST", headers: { Authorization: `Bearer ${ENV.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(600_000),
      }).catch((error: unknown) => ({ ok: false, status: 0, text: async () => String(error) }) as const);
      if (res.ok) return ((await res.json()) as { segments?: WhisperSegment[] }).segments ?? [];
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      if (attempt >= 3 || (res.status >= 400 && res.status < 500 && res.status !== 429)) throw new Error(`Whisper ${res.status}: ${detail}`);
      log(`    Whisper ${res.status}, retrying (${attempt}/3)`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }

  async function produce(id: string): Promise<Cue[]> {
    const cached = await readCache(id);
    if (cached) {
      stats.cached++;
      return cached.cues;
    }
    const started = Date.now();
    const file = await audioOf(id);
    const seconds = await audioSeconds(file);
    const segments = await whisper(file);
    const cues = segments
      .filter((s) => !((s.no_speech_prob ?? 0) > 0.6 && (s.avg_logprob ?? 0) < -1))
      .map((s) => ({ start: round(s.start), end: round(s.end), text: (s.text || "").replace(/\s+/g, " ").trim() }))
      .filter((c) => c.text && !SUBTITLE_CREDIT_RE.test(c.text) && c.end > c.start);
    if (!cues.length) throw new Error(`Whisper returned no usable speech for ${id}.`);
    await mkdir(textDir, { recursive: true });
    const entry: CachedTranscript = { videoId: id, model: "whisper-1", language: "vi", audioSeconds: round(seconds), createdAt: new Date().toISOString(), cues };
    await writeFile(path.join(textDir, `${id}.json`), JSON.stringify(entry, null, 1));
    stats.transcribed++;
    stats.audioSeconds += seconds;
    stats.estimatedUsd = round((stats.audioSeconds / 60) * WHISPER_USD_PER_MINUTE);
    log(`    transcribed ${id}: ${Math.round(seconds / 60)} min audio, ${cues.length} cues, ${Math.round((Date.now() - started) / 1000)} s`);
    return cues;
  }

  return {
    stats,
    /** Cues of a YouTube URL from the cache, or downloaded and transcribed now; null for a non-YouTube URL. */
    async transcriptOf(url: string, { cacheOnly }: { cacheOnly: boolean }): Promise<Cue[] | null> {
      const id = youtubeId(url);
      if (!id) return null;
      if (cacheOnly) return (await readCache(id))?.cues ?? null;
      let job = pending.get(id);
      if (!job) {
        job = produce(id);
        pending.set(id, job);
      }
      return job;
    },
    async cachedIds(): Promise<string[]> {
      return (await readdir(textDir).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
    },
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
