import { describe, expect, it } from "vitest";
import { youtubeEmbedUrl, youtubeVideoId } from "./youtube";

describe("youtubeVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?list=x&v=a-b_c1234Z9", "a-b_c1234Z9"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=3", "dQw4w9WgXcQ"],
    ["https://WWW.YouTube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("accepts %s", (url, id) => {
    expect(youtubeVideoId(url)).toBe(id);
  });

  it.each([
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
    "https://evilyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://vimeo.com/dQw4w9WgXcQ",
    "https://example.com/video.mp4",
    "https://user@www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ",
    "/videos/intro.mp4",
    "not a url",
  ])("rejects other hosts and protocols: %s", (url) => {
    expect(youtubeVideoId(url)).toBeNull();
  });

  it.each([
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQX",
    "https://www.youtube.com/watch?v=dQw4w9WgX%3C",
    "https://www.youtube.com/watch",
    "https://youtu.be/",
    "https://youtu.be/dQw4w9WgXcQ/extra",
    "https://www.youtube.com/embed/",
    "https://www.youtube.com/embed/dQw4w9WgXc!",
    "https://www.youtube.com/watch/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/watch?v=dQw4w9WgXcQ",
  ])("rejects bad ids and paths: %s", (url) => {
    expect(youtubeVideoId(url)).toBeNull();
  });
});

describe("youtubeEmbedUrl", () => {
  it("builds a privacy-enhanced API-enabled URL with origin and start", () => {
    const url = new URL(
      youtubeEmbedUrl("dQw4w9WgXcQ", {
        origin: "https://codi.test",
        start: 42.9,
      }),
    );
    expect(url.origin).toBe("https://www.youtube-nocookie.com");
    expect(url.pathname).toBe("/embed/dQw4w9WgXcQ");
    expect(url.searchParams.get("enablejsapi")).toBe("1");
    expect(url.searchParams.get("origin")).toBe("https://codi.test");
    expect(url.searchParams.get("start")).toBe("42");
  });

  it("omits start at zero and rejects invalid ids", () => {
    expect(youtubeEmbedUrl("dQw4w9WgXcQ", { start: 0 })).not.toContain(
      "start=",
    );
    expect(() => youtubeEmbedUrl("bad")).toThrow();
  });
});
