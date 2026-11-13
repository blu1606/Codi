import { describe, expect, it } from "vitest";
import { toCourseContext } from "./course-context";
import { replySources } from "./question-ai-reply";

const hit = (lessonId: string, content = "Nội dung") => ({
  lessonId, lessonTitle: `Bài ${lessonId}`, chapter: "Chương 1", sourceTitle: `Bài ${lessonId}`, content, score: 0.8,
  materialId: null as number | null, startSeconds: null as number | null,
});

describe("toCourseContext", () => {
  it("adds learner lesson links and clips passages to 600 characters", () => {
    const ctx = toCourseContext("course 1", { status: "ok", hits: [hit("l-1", "x".repeat(900))] });
    expect(ctx.status).toBe("ok");
    if (ctx.status !== "ok") return;
    expect(ctx.hits[0]!.href).toBe("/learn/course%201/l-1");
    expect(ctx.hits[0]!.content).toHaveLength(600);
    expect(ctx.hits[0]!.content.endsWith("…")).toBe(true);
  });

  it("tells an indexed course with nothing relevant from search being unavailable", () => {
    expect(toCourseContext("c", { status: "no_match" })).toEqual({ status: "no_match" });
    expect(toCourseContext("c", { status: "not_indexed" })).toEqual({ status: "unavailable", reason: "not_indexed" });
    expect(toCourseContext("c", { status: "not_configured" })).toEqual({ status: "unavailable", reason: "not_configured" });
    expect(toCourseContext("c", { status: "search_failed" })).toEqual({ status: "unavailable", reason: "search_failed" });
  });
});

describe("video passages", () => {
  it("links a transcript chunk to its second in the video", () => {
    const ctx = toCourseContext("c", { status: "ok", hits: [{ ...hit("l"), materialId: 7, startSeconds: 95 }] });
    if (ctx.status !== "ok") throw new Error("expected ok");
    expect(ctx.hits[0]!.href).toBe("/learn/c/l?m=7&t=95");
    expect(replySources(ctx.hits)).toEqual([{ title: "Bài l · 1:35", href: "/learn/c/l?m=7&t=95" }]);
  });

  it("keeps the plain lesson link when the second is unknown", () => {
    const ctx = toCourseContext("c", { status: "ok", hits: [{ ...hit("l"), materialId: 7, startSeconds: null }] });
    if (ctx.status !== "ok") throw new Error("expected ok");
    expect(ctx.hits[0]!.href).toBe("/learn/c/l");
  });
});

describe("replySources", () => {
  it("lists each lesson once, in retrieval order", () => {
    const ctx = toCourseContext("c", { status: "ok", hits: [hit("a"), hit("b"), hit("a")] });
    if (ctx.status !== "ok") throw new Error("expected ok");
    expect(replySources(ctx.hits)).toEqual([
      { title: "Bài a", href: "/learn/c/a" },
      { title: "Bài b", href: "/learn/c/b" },
    ]);
  });
});
