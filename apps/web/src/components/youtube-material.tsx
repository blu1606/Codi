"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { youtubeEmbedUrl } from "@/lib/youtube";

// Minimal surface of the YouTube IFrame Player API that the player uses.
type YouTubePlayer = {
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
};
type YouTubeNamespace = {
  Player: new (
    element: HTMLIFrameElement,
    options: {
      events: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
};
declare global {
  interface Window {
    YT?: Partial<YouTubeNamespace>;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_SRC = "https://www.youtube.com/iframe_api";
const API_TIMEOUT_MS = 15_000;
let api: Promise<YouTubeNamespace> | null = null;

const loaded = () =>
  typeof window.YT?.Player === "function" && window.YT.PlayerState
    ? (window.YT as YouTubeNamespace)
    : null;

/** Load the IFrame Player API once per page; a failed load can be retried. */
export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  const ready = loaded();
  if (ready) return Promise.resolve(ready);
  api ??= new Promise<YouTubeNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const timer = window.setTimeout(
      () => fail(new Error("YouTube API timed out")),
      API_TIMEOUT_MS,
    );
    function fail(error: Error) {
      window.clearTimeout(timer);
      api = null;
      reject(error);
    }
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      window.clearTimeout(timer);
      const namespace = loaded();
      if (namespace) resolve(namespace);
      else fail(new Error("YouTube API unavailable"));
    };
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${API_SRC}"]`,
    );
    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.src = API_SRC;
      script.async = true;
      document.head.append(script);
    }
    script.addEventListener(
      "error",
      () => {
        script.remove();
        fail(new Error("YouTube API blocked"));
      },
      { once: true },
    );
  });
  return api;
}

export type VideoSnapshot = () => { seconds: number; ended: boolean } | null;

export default function YouTubeMaterial({
  videoId,
  title,
  startSeconds,
  snapshot,
  onTracked,
  onUntracked,
  onLoaded,
  onPosition,
  onError,
}: {
  videoId: string;
  title: string;
  startSeconds: number;
  /** Filled while the player API is attached so the parent can save on pagehide. */
  snapshot: MutableRefObject<VideoSnapshot | null>;
  onTracked: () => void;
  onUntracked: () => void;
  onLoaded: () => void;
  onPosition: (seconds: number, ended: boolean) => void;
  onError: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({ onTracked, onUntracked, onPosition, onError });
  useEffect(() => {
    callbacks.current = { onTracked, onUntracked, onPosition, onError };
  }, [onTracked, onUntracked, onPosition, onError]);
  // Origin and start are fixed for the life of this iframe; changing src would reload it.
  const [src] = useState(() =>
    youtubeEmbedUrl(videoId, {
      origin: typeof window === "undefined" ? undefined : window.location.origin,
      start: startSeconds,
    }),
  );

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let cancelled = false;
    let player: YouTubePlayer | null = null;
    // Player methods exist only after onReady.
    let ready = false;
    let ended = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    const stopInterval = () => {
      clearInterval(interval);
      interval = undefined;
    };
    const read = () => {
      if (!player || !ready) return null;
      const seconds = player.getCurrentTime();
      return Number.isFinite(seconds) ? { seconds, ended } : null;
    };
    const save = () => {
      const position = read();
      if (position) callbacks.current.onPosition(position.seconds, position.ended);
    };
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(element, {
          events: {
            onReady: () => {
              if (cancelled) return;
              ready = true;
              snapshot.current = read;
              callbacks.current.onTracked();
            },
            onStateChange: ({ data }) => {
              if (!ready) return;
              if (data === YT.PlayerState.PLAYING) {
                ended = false;
                interval ??= setInterval(save, 10_000);
              } else if (data === YT.PlayerState.PAUSED) {
                stopInterval();
                save();
              } else if (data === YT.PlayerState.ENDED) {
                stopInterval();
                ended = true;
                const duration = player!.getDuration();
                const current = player!.getCurrentTime();
                callbacks.current.onPosition(
                  Math.max(current, Number.isFinite(duration) ? duration : 0),
                  true,
                );
              }
            },
            // 2 bad id, 5 HTML5 error, 100 removed/private, 101/150 embedding disabled.
            onError: () => {
              if (!cancelled) callbacks.current.onError();
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) callbacks.current.onUntracked();
      });
    return () => {
      cancelled = true;
      stopInterval();
      save();
      snapshot.current = null;
      try {
        player?.destroy();
      } catch {
        // The iframe may already be detached; nothing left to clean up.
      }
    };
  }, [snapshot]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
      <iframe
        ref={frame}
        src={src}
        title={title}
        className="absolute inset-0 size-full border-0 focus-visible:outline-none"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        onLoad={onLoaded}
      />
    </div>
  );
}
