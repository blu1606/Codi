// Timed transcript of a public YouTube lecture, for the course knowledge index.
//  1. Captions (manual or auto-generated) through YouTube's player API as the Android app requests them; the web
//     player's caption URLs need a proof-of-origin token and come back empty.
//  2. No captions, or YouTube refuses the server (datacenter IPs are sometimes asked to sign in): when a Google AI key
//     is set — whatever AI_PROVIDER is — Gemini watches the video by URL and writes the transcript. Downloading the
//     audio for Whisper is not an option: without a proof-of-origin token YouTube serves only the first ~300 KB.
import { generateText } from "ai";
import { ENV } from "@/env";
import { GeminiProvider } from "@/lib/ai/providers/gemini-provider";
import { clock } from "@/lib/lesson-source-extraction";

const LANGS = ["vi", "en"];
const ANDROID_CLIENT = { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34, hl: "vi" };

/** The video id of a youtube.com / youtu.be link, or null for any other URL. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, "");
    const id = host === "youtu.be" ? u.pathname.slice(1)
      : host === "youtube.com" ? u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null
      : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

type Track = { baseUrl: string; languageCode: string; kind?: string };
type Player = {
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Track[] } };
};
type Json3 = { events?: { tStartMs?: number; segs?: { utf8?: string }[] }[] };

function pickTrack(tracks: Track[]): Track | undefined {
  const rank = (t: Track) => {
    const lang = LANGS.indexOf(t.languageCode.split("-")[0]!);
    return (lang < 0 ? LANGS.length : lang) * 2 + (t.kind === "asr" ? 1 : 0);
  };
  return [...tracks].sort((a, b) => rank(a) - rank(b))[0];
}

async function player(id: string): Promise<Player | null> {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ context: { client: ANDROID_CLIENT }, videoId: id }),
    signal: AbortSignal.timeout(20_000),
  });
  return res.ok ? ((await res.json()) as Player) : null;
}

async function captions(data: Player): Promise<string | null> {
  const track = pickTrack(data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []);
  if (!track) return null;
  const res = await fetch(`${track.baseUrl.replace(/&fmt=[^&]*/, "")}&fmt=json3`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const body = await res.text();
  if (!body.trim()) return null;
  const lines = ((JSON.parse(body) as Json3).events ?? [])
    .map((e) => ({ at: (e.tStartMs ?? 0) / 1000, text: (e.segs ?? []).map((s) => s.utf8 ?? "").join("").replace(/\s+/g, " ").trim() }))
    .filter((l) => l.text);
  return lines.length ? lines.map((l) => `[${clock(l.at)}] ${l.text}`).join("\n") : null;
}

async function geminiTranscript(url: string): Promise<string | null> {
  if (!ENV.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  const { text } = await generateText({
    model: new GeminiProvider().getModel(),
    maxOutputTokens: 16_000,
    abortSignal: AbortSignal.timeout(300_000),
    messages: [{
      role: "user",
      content: [
        { type: "file", data: new URL(url), mediaType: "video/mp4" },
        {
          type: "text",
          text: "Chép lại lời giảng của video này bằng đúng ngôn ngữ người nói. Mỗi dòng bắt đầu bằng mốc thời gian [mm:ss]. "
            + "Ghi thêm nội dung chữ/code quan trọng xuất hiện trên màn hình trong ngoặc vuông. Chỉ trả về bản chép lời.",
        },
      ],
    }],
  });
  return text.trim() || null;
}

/** Transcript lines "[mm:ss] …", or null when neither captions nor Gemini could read the video. */
export async function youtubeTranscript(url: string): Promise<string | null> {
  const id = youtubeId(url);
  if (!id) return null;
  const data = await player(id).catch(() => null);
  const fromCaptions = data ? await captions(data).catch(() => null) : null;
  return fromCaptions ?? (await geminiTranscript(`https://www.youtube.com/watch?v=${id}`));
}
