const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const WATCH_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const EMBED_HOSTS = new Set([
  ...WATCH_HOSTS,
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/**
 * Extract the 11-character video id from an https YouTube URL
 * (`youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/embed/ID`).
 * Any other host, protocol, path shape or malformed id returns null.
 */
export function youtubeVideoId(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "youtu.be" && segments.length === 1) id = segments[0]!;
  else if (WATCH_HOSTS.has(host) && url.pathname === "/watch")
    id = url.searchParams.get("v");
  else if (
    EMBED_HOSTS.has(host) &&
    segments.length === 2 &&
    segments[0] === "embed"
  )
    id = segments[1]!;
  return id && VIDEO_ID.test(id) ? id : null;
}

/** Privacy-enhanced embed URL with the IFrame Player API enabled. */
export function youtubeEmbedUrl(
  id: string,
  { origin, start }: { origin?: string; start?: number } = {},
): string {
  if (!VIDEO_ID.test(id)) throw new Error("Invalid YouTube video id");
  const params = new URLSearchParams({
    enablejsapi: "1",
    rel: "0",
    playsinline: "1",
  });
  if (origin) params.set("origin", origin);
  if (start && Number.isFinite(start) && start > 0)
    params.set("start", String(Math.floor(start)));
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}
