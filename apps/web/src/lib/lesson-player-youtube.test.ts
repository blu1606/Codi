// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import LessonMaterialView from "@/components/lesson-material-view";
import LessonMarkdown from "@/components/lesson-markdown";
import type {
  LessonMaterial,
  LessonPlayerCommand,
} from "./lesson-player-contract";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// Keep the YouTube iframe and API script from making real network requests.
Object.assign(
  (window as unknown as { happyDOM: { settings: object } }).happyDOM.settings,
  {
    disableIframePageLoading: true,
    disableJavaScriptFileLoading: true,
    handleDisabledFileLoadingAsSuccess: true,
  },
);
let root: Root | undefined;

const material: LessonMaterial = {
  id: 7,
  type: "video",
  title: "Biến và kiểu dữ liệu",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  durationSeconds: 212,
};
const State = { ENDED: 0, PLAYING: 1, PAUSED: 2 };

type Events = {
  onReady?: () => void;
  onStateChange?: (event: { data: number }) => void;
  onError?: (event: { data: number }) => void;
};
function fakeApi() {
  const player = {
    time: 0,
    events: {} as Events,
    getCurrentTime: () => player.time,
    getDuration: () => 212,
    destroy: vi.fn(),
  };
  class Player {
    constructor(_element: HTMLIFrameElement, options: { events: Events }) {
      player.events = options.events;
      return player as unknown as Player;
    }
  }
  window.YT = { Player, PlayerState: State } as unknown as Window["YT"];
  return player;
}

async function mount(node: ReturnType<typeof createElement>) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
}
function renderVideo(save: (command: LessonPlayerCommand) => Promise<void>) {
  return mount(
    createElement(LessonMaterialView, {
      material,
      progress: { seconds: 30 },
      save,
    }),
  );
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  delete window.YT;
  delete window.onYouTubeIframeAPIReady;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("YouTube lesson material", () => {
  it("embeds the privacy-enhanced player resuming from saved seconds", async () => {
    fakeApi();
    await renderVideo(vi.fn().mockResolvedValue(undefined));
    const frame = document.querySelector("iframe")!;
    const src = new URL(frame.src);
    expect(src.origin).toBe("https://www.youtube-nocookie.com");
    expect(src.pathname).toBe("/embed/dQw4w9WgXcQ");
    expect(src.searchParams.get("enablejsapi")).toBe("1");
    expect(src.searchParams.get("origin")).toBe(window.location.origin);
    expect(src.searchParams.get("start")).toBe("30");
    expect(frame.title).toBe(material.title);
    expect(frame.getAttribute("allow")).toContain("encrypted-media");
    expect(document.querySelector("video")).toBeNull();
    expect(document.body.textContent).toContain("Tiếp tục từ giây 30.");
  });

  it("saves on pause, every 10 s while playing and on ended like the native player", async () => {
    vi.useFakeTimers();
    const player = fakeApi();
    const save = vi.fn().mockResolvedValue(undefined);
    await renderVideo(save);
    await act(async () => player.events.onReady?.());
    player.time = 31;
    await act(async () => player.events.onStateChange?.({ data: State.PLAYING }));
    player.time = 41.6;
    await act(async () => vi.advanceTimersByTime(10_000));
    player.time = 45.2;
    await act(async () => player.events.onStateChange?.({ data: State.PAUSED }));
    player.time = 211.9;
    await act(async () => player.events.onStateChange?.({ data: State.ENDED }));
    expect(save.mock.calls.map(([command]) => command)).toEqual([
      { type: "video", materialId: 7, seconds: 41, ended: false },
      { type: "video", materialId: 7, seconds: 45, ended: false },
      { type: "video", materialId: 7, seconds: 212, ended: true },
    ]);
  });

  it("saves the current position on pagehide once the API is attached", async () => {
    const player = fakeApi();
    const save = vi.fn().mockResolvedValue(undefined);
    await renderVideo(save);
    player.time = 99;
    window.dispatchEvent(new Event("pagehide"));
    expect(save).not.toHaveBeenCalled();
    await act(async () => player.events.onReady?.());
    window.dispatchEvent(new Event("pagehide"));
    expect(save).toHaveBeenCalledWith({
      type: "video",
      materialId: 7,
      seconds: 99,
      ended: false,
    });
  });

  it("falls back to a plain iframe with a warning when the API is blocked", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    await renderVideo(save);
    const script = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    )!;
    expect(script).not.toBeNull();
    await act(async () => script.dispatchEvent(new Event("error")));
    expect(document.querySelector("iframe")).not.toBeNull();
    expect(document.body.textContent).toContain(
      "Không theo dõi được tiến độ video",
    );
    window.dispatchEvent(new Event("pagehide"));
    expect(save).not.toHaveBeenCalled();
  });

  it("shows the retry state with a YouTube link when the video cannot be embedded", async () => {
    const player = fakeApi();
    await renderVideo(vi.fn().mockResolvedValue(undefined));
    await act(async () => player.events.onError?.({ data: 150 }));
    expect(document.body.textContent).toContain("Chưa tải được tài liệu");
    expect(
      document.querySelector<HTMLAnchorElement>(
        'a[href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"]',
      )?.rel,
    ).toBe("noopener noreferrer");
  });

  it("keeps the native player for non-YouTube video URLs", async () => {
    await mount(
      createElement(LessonMaterialView, {
        material: { ...material, url: "https://cdn.example.com/intro.mp4" },
        progress: undefined,
        save: vi.fn().mockResolvedValue(undefined),
      }),
    );
    expect(document.querySelector("video")).not.toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
  });
});

describe("lesson markdown body", () => {
  it("renders markdown, opens links in a new tab and drops raw HTML", async () => {
    await mount(
      createElement(
        LessonMarkdown,
        null,
        "## Biến\n\nDùng `let` khi giá trị thay đổi.\n\n- một\n- hai\n\n[MDN](https://developer.mozilla.org)\n\n<script>window.hacked = true</script><img src=x onerror=\"window.hacked = true\">",
      ),
    );
    expect(document.querySelector("h2")?.textContent).toBe("Biến");
    expect(document.querySelectorAll("li")).toHaveLength(2);
    const link = document.querySelector<HTMLAnchorElement>(
      'a[href^="https://developer.mozilla.org"]',
    )!;
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(document.querySelector("script, img")).toBeNull();
    expect(document.body.textContent).not.toContain("Image blocked");
    expect((window as { hacked?: boolean }).hacked).toBeUndefined();
  });

  it("keeps plain-text bodies readable", async () => {
    await mount(
      createElement(LessonMarkdown, null, "Dòng một\nDòng hai\n\nĐoạn mới"),
    );
    const paragraphs = document.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]!.textContent).toBe("Dòng một\nDòng hai");
  });
});
