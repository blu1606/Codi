// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import LessonPlayer from "../app/learn/[courseId]/[lessonId]/lesson-player";
import {
  constrainPath,
  selectPath,
  type PathInput,
} from "./learning-path-contract";
import type { LessonPlayerView } from "./lesson-player-contract";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
const input: PathInput = {
  goal: "project",
  hours: 5,
  level: "new",
  concepts: [],
  edges: [],
  previous: [],
  lessons: ["first", "second"].map((id) => ({
    id,
    title: id,
    chapterId: "chapter",
    chapterTitle: "Cơ bản",
    durationSeconds: 5,
    skillIds: [],
    progress: "not_started",
    studied: false,
  })),
};
function state(): LessonPlayerView {
  return {
    lesson: {
      id: "first",
      title: "Chuỗi",
      chapterTitle: "TypeScript",
      description: null,
      body: "const greeting: string = 'Xin chào';",
      durationSeconds: 5,
    },
    materials: [],
    media: {},
    positionSeconds: 0,
    studied: false,
    completed: false,
    checklist: [
      { key: "study", label: "Học nội dung", done: false, note: "Chưa học" },
    ],
    path: {
      ...selectPath(input, constrainPath(input), "default"),
      course: { id: "owned", title: "TypeScript", slug: "typescript" },
      status: "ready",
      source: "default",
      goal: "project",
      hours: 5,
      goalEditing: false,
      diagnosticStatus: "skipped",
      showDiagnosticCard: false,
      pathId: 1,
      rationale: null,
      updating: false,
      highlights: [],
      update: null,
      review: null,
      recommendation: null,
    },
  };
}
async function render() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      createElement(LessonPlayer, { courseId: "owned", lessonId: "first" }),
    );
  });
}
const button = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (node) => node.textContent === label,
  )!;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lesson player", () => {
  it("explains the disabled completion action and renders actual reading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => Response.json(state())),
    );
    await render();
    expect(button("Hoàn thành bài học").disabled).toBe(true);
    expect(document.body.textContent).toContain("Còn thiếu: Học nội dung");
    expect(document.body.textContent).toContain("const greeting");
  });
  it("saves study before enabling completion and stays on the same lesson after success", async () => {
    const data = state();
    const fetcher = vi
      .fn()
      .mockImplementation(async (_url: string, options: RequestInit) => {
        const command = JSON.parse(options.body as string);
        if (command.type === "study") {
          data.studied = true;
          data.checklist[0]!.done = true;
        }
        if (command.type === "complete") {
          data.completed = true;
          data.path.currentLessonId = "second";
          data.path.done = 1;
          data.path.update = {
            afterLessonId: "first",
            message: "Thứ tự các bài còn lại giữ nguyên.",
            changes: [],
          };
        }
        return Response.json(data);
      });
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    await render();
    await act(async () => button("Đánh dấu đã học xong").click());
    expect(button("Hoàn thành bài học").disabled).toBe(false);
    await act(async () => button("Hoàn thành bài học").click());
    expect(document.body.textContent).toContain("Lộ trình đã được cập nhật");
    expect(
      document.querySelector('a[href="/learn/owned/second"]')?.textContent,
    ).toBeTruthy();
    expect(document.body.textContent).toContain("Bài tiếp theo");
    expect(
      fetcher.mock.calls.filter(
        ([, options]) => JSON.parse(options.body).type === "complete",
      ),
    ).toHaveLength(1);
    expect(document.querySelector("h1")?.textContent).toBe("Chuỗi");
  });
  it("renders a server failure with retry, retaining the reading and disabled checklist", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          ++calls === 1
            ? Response.json(state())
            : Response.json({ error: "Kết nối bị gián đoạn" }, { status: 503 }),
        ),
    );
    await render();
    await act(async () => button("Đánh dấu đã học xong").click());
    expect(document.body.textContent).toContain("Kết nối bị gián đoạn");
    expect(button("Thử lại")).toBeTruthy();
    expect(button("Hoàn thành bài học").disabled).toBe(true);
  });
  it("shows a course completion prompt with stars and an explicit next-course link", async () => {
    const data = state();
    data.completed = true;
    data.path.complete = true;
    data.path.currentLessonId = null;
    data.path.recommendation = { title: "React tiếp theo", slug: "react" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => Response.json(data)),
    );
    await render();
    expect(document.body.textContent).toContain(
      "Chúc mừng! Bạn đã hoàn thành khoá học",
    );
    expect(document.querySelectorAll('[aria-label$=" sao"]')).toHaveLength(5);
    expect(document.querySelector('a[href="/courses/react"]')).not.toBeNull();
  });
  it("restores video position and persists an ended event without awarding completion", async () => {
    const data = state();
    data.materials = [
      {
        id: 8,
        type: "video",
        title: "Video",
        url: "/fixture.mp4",
        durationSeconds: 5,
      },
    ];
    data.media = { "8": { seconds: 2 } };
    const fetcher = vi.fn().mockImplementation(async () => Response.json(data));
    vi.stubGlobal("fetch", fetcher);
    await render();
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "duration", { value: 5, configurable: true });
    await act(async () => video.dispatchEvent(new Event("loadedmetadata")));
    expect(video.currentTime).toBe(2);
    video.currentTime = 5;
    await act(async () => video.dispatchEvent(new Event("ended")));
    expect(
      fetcher.mock.calls.some(([, options]) => {
        const c = JSON.parse(options.body);
        return c.type === "video" && c.seconds === 5 && c.ended;
      }),
    ).toBe(true);
    expect(button("Hoàn thành bài học").disabled).toBe(true);
  });
  it("shows material load failure and an actual retry while leaving reading available", async () => {
    const data = state();
    data.materials = [
      {
        id: 8,
        type: "video",
        title: "Video",
        url: "/missing.mp4",
        durationSeconds: 5,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => Response.json(data)),
    );
    await render();
    await act(async () =>
      document.querySelector("video")!.dispatchEvent(new Event("error")),
    );
    expect(document.body.textContent).toContain("Chưa tải được tài liệu");
    expect(document.body.textContent).toContain("const greeting");
    await act(async () => button("Thử lại").click());
    expect(document.querySelector("video")).not.toBeNull();
  });
});

describe("media save regressions", () => {
  async function videoFixture() {
    const data = state();
    data.materials = [
      {
        id: 8,
        type: "video",
        title: "Video",
        url: "/fixture.mp4",
        durationSeconds: null,
      },
    ];
    const fetcher = vi
      .fn()
      .mockImplementation(async (_url: string, options?: RequestInit) => {
        if (!options?.body) return Response.json(data);
        const command = JSON.parse(options.body as string);
        if (command.type === "video")
          return Response.json({
            kind: "media-progress",
            media: { "8": { seconds: command.seconds } },
            positionSeconds: command.seconds,
            studied: command.ended,
            completed: false,
          });
        return Response.json(data);
      });
    vi.stubGlobal("fetch", fetcher);
    await render();
    const video = document.querySelector("video")!;
    Object.defineProperty(video, "duration", { value: 5, configurable: true });
    await act(async () => video.dispatchEvent(new Event("loadedmetadata")));
    return { video, fetcher };
  }
  it("saves once at ended and applies the compact acknowledgement to the study checklist", async () => {
    const { video, fetcher } = await videoFixture();
    video.currentTime = 5;
    await act(async () => {
      video.dispatchEvent(new Event("pause"));
      video.dispatchEvent(new Event("ended"));
    });
    expect(
      fetcher.mock.calls.filter(
        ([, options]) =>
          options?.body && JSON.parse(options.body as string).type === "video",
      ),
    ).toHaveLength(1);
    expect(button("Hoàn thành bài học").disabled).toBe(false);
    expect(document.querySelector("h1")?.textContent).toBe("Chuỗi");
  });
  it("keeps media errors beside the video, retries the save and handles non-JSON gateway failures", async () => {
    const { video, fetcher } = await videoFixture();
    fetcher.mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));
    video.currentTime = 2;
    await act(async () => video.dispatchEvent(new Event("pause")));
    expect(document.body.textContent).toContain(
      "Chưa lưu được tiến độ tài liệu",
    );
    expect(document.body.textContent).not.toContain(
      "Chưa thể tải hoặc lưu tiến độ",
    );
    expect(document.body.textContent).not.toContain("SyntaxError");
    expect(document.querySelector("video")).toBe(video);
    await act(async () => button("Thử lưu lại").click());
    expect(document.body.textContent).not.toContain(
      "Chưa lưu được tiến độ tài liệu",
    );
  });
  it("uses GET on focus without writing another open event", async () => {
    const { fetcher } = await videoFixture();
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(fetcher.mock.calls.at(-1)?.[1]?.method).not.toBe("POST");
    expect(
      fetcher.mock.calls.filter(
        ([, options]) =>
          options?.body && JSON.parse(options.body as string).type === "open",
      ),
    ).toHaveLength(1);
  });
});
