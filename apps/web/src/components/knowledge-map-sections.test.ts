// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { KnowledgeMapView } from "@/lib/learning-path-contract";
import { ConceptDetails } from "./knowledge-map-sections";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;

async function renderLessons(lessons: KnowledgeMapView["nodes"][number]["lessons"]) {
  const node: KnowledgeMapView["nodes"][number] = {
    id: 1, name: "Chuỗi", probability: null, evidenceCount: 0,
    level: 0, locked: false, recommended: false, lessons,
  };
  const data: KnowledgeMapView = {
    courses: [{ id: "course / vi", title: "TypeScript" }],
    courseId: "course / vi", title: "TypeScript", confirmed: true,
    nodes: [node], edges: [],
  };
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(ConceptDetails, { data, node })));
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe("knowledge map lesson CTA (UI-LRN-25)", () => {
  it("shows the lesson title and a primary CTA with the encoded lesson destination", async () => {
    await renderLessons([{ id: "lesson / 1", title: "Bài Chuỗi", locked: false }]);
    const link = document.querySelector("a")!;
    expect(document.body.textContent).toContain("Bài Chuỗi");
    expect(document.body.textContent).toContain("Chưa học");
    expect(link.textContent).toContain("Học bài này");
    expect(link.getAttribute("aria-label")).toBe("Học bài này: Bài Chuỗi");
    expect(link.getAttribute("href")).toBe("/learn/course%20%2F%20vi/lesson%20%2F%201");
  });

  it("keeps advisory-locked lessons openable with the prerequisite hint", async () => {
    await renderLessons([{ id: "locked", title: "Bài Mảng", locked: true }]);
    expect(document.body.textContent).toContain("Bài Mảng");
    expect(document.body.textContent).toContain("Chưa đủ tiên quyết · nên học bài tiên quyết trước");
    expect(document.querySelector("a")?.getAttribute("href")).toBe("/learn/course%20%2F%20vi/locked");
  });

  it("offers navigation for every lesson and marks only the advisory-locked one", async () => {
    await renderLessons([
      { id: "locked", title: "Bài chưa đủ tiên quyết", locked: true },
      { id: "first", title: "Bài Chuỗi", locked: false },
      { id: "second", title: "Bài luyện Chuỗi", locked: false },
    ]);
    const links = [...document.querySelectorAll("a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/learn/course%20%2F%20vi/locked", "/learn/course%20%2F%20vi/first", "/learn/course%20%2F%20vi/second",
    ]);
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Học bài này: Bài chưa đủ tiên quyết", "Học bài này: Bài Chuỗi", "Học bài này: Bài luyện Chuỗi",
    ]);
    expect(document.body.textContent?.match(/Chưa đủ tiên quyết ·/g)).toHaveLength(1);
  });

  it("shows the empty lesson state without inventing a CTA destination", async () => {
    await renderLessons([]);
    expect(document.body.textContent).toContain("Chưa có bài được xuất bản cho khái niệm này.");
    expect(document.querySelector("a")).toBeNull();
  });
});
