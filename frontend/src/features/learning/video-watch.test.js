import { describe, expect, it } from "vitest";
import { coveredSeconds, createWatchTracker, mergeRanges, parseClock, watchShortfall } from "./video-watch";

describe("createWatchTracker", () => {
  it("counts normal playback, including 2x speed", () => {
    const t = createWatchTracker();
    t.tick(0, 0); t.tick(1, 1000); t.tick(3, 2000); t.tick(5, 3000);
    expect(t.ranges()).toEqual([[0, 5]]);
  });

  it("does not count a jump made by seeking ahead", () => {
    const t = createWatchTracker();
    t.tick(0, 0); t.tick(10, 10_000);
    t.tick(300, 10_250); // dragged the bar to 5:00
    t.tick(301, 11_250);
    expect(t.ranges()).toEqual([[0, 10], [300, 301]]);
    expect(coveredSeconds(t.ranges(), 600)).toBe(11);
  });

  it("does not count across a pause, even a long one", () => {
    const t = createWatchTracker([[0, 10]]);
    t.tick(10, 0); t.reset();
    t.tick(200, 120_000);
    expect(t.ranges()).toEqual([[0, 10]]);
  });
});

describe("watchShortfall", () => {
  const mats = [
    { id: 1, type: "video", title: "Video A", durationSeconds: 100 },
    { id: 2, type: "video", title: "Không rõ độ dài", durationSeconds: null },
    { id: 3, type: "pdf", title: "PDF", durationSeconds: 100 },
  ];

  it("lists videos watched under 90% and merges unsaved live stretches", () => {
    expect(watchShortfall(mats, { 1: { seconds: 100, watched: [[0, 30]] } })).toEqual([{ id: 1, title: "Video A", percent: 30 }]);
    expect(watchShortfall(mats, { 1: { watched: [[0, 50]] } }, () => [[50, 95]])).toEqual([]);
  });

  it("is satisfied when one of several videos was watched enough", () => {
    const two = [...mats, { id: 4, type: "video", title: "Video B", durationSeconds: 200 }];
    expect(watchShortfall(two, { 4: { watched: [[0, 190]] } })).toEqual([]);
    expect(watchShortfall(two, { 4: { watched: [[0, 20]] } })).toEqual([
      { id: 1, title: "Video A", percent: 0 }, { id: 4, title: "Video B", percent: 10 },
    ]);
  });
});

describe("helpers", () => {
  it("merges touching stretches", () => {
    expect(mergeRanges([[5, 10], [0, 4.5], [20, 30]])).toEqual([[0, 10], [20, 30]]);
  });

  it("parses clock marks", () => {
    expect(parseClock("2:15")).toBe(135);
    expect(parseClock("02:15")).toBe(135);
    expect(parseClock("1:02:03")).toBe(3723);
    expect(parseClock("2:75")).toBeNull();
    expect(parseClock("abc")).toBeNull();
  });
});
