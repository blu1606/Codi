import { describe, expect, it } from "vitest";
import { mergeWatched } from "./lesson-player-contract";
import { chunkStartSeconds, relevantTranscript } from "./video-citation";

const cues = [
  { start: 0, end: 5, text: "Xin chào các bạn, hôm nay ta học về biến." },
  { start: 5, end: 12, text: "Từ khoá let cho phép gán lại giá trị." },
  { start: 12, end: 20, text: "Còn const thì không gán lại được, nhưng object bên trong vẫn sửa được." },
  { start: 20, end: 30, text: "Cuối cùng là var, có phạm vi theo hàm và bị hoisting." },
];

describe("relevantTranscript", () => {
  it("returns every line with its [m:ss] mark when it fits", () => {
    expect(relevantTranscript(cues, "const", 5000)).toBe(
      "[0:00] Xin chào các bạn, hôm nay ta học về biến.\n[0:05] Từ khoá let cho phép gán lại giá trị.\n" +
        "[0:12] Còn const thì không gán lại được, nhưng object bên trong vẫn sửa được.\n[0:20] Cuối cùng là var, có phạm vi theo hàm và bị hoisting.",
    );
  });

  it("keeps the lines around the question's words when the transcript is long", () => {
    const long = Array.from({ length: 200 }, (_, i) => ({ start: i * 10, text: i === 150 ? "hoisting của var rất dễ nhầm" : `câu thường số ${i}` }));
    const out = relevantTranscript(long, "Hoisting là gì?", 400);
    expect(out).toContain("[25:00] hoisting của var rất dễ nhầm");
    expect(out.length).toBeLessThanOrEqual(400);
  });

  it("is empty without cues", () => {
    expect(relevantTranscript(null, "x")).toBe("");
  });
});

describe("chunkStartSeconds", () => {
  it("finds the cue a transcript chunk starts in, ignoring accents, case and a cut first word", () => {
    expect(chunkStartSeconds("ng const thì KHÔNG gán lại được, nhưng object bên trong", cues)).toBe(12);
    expect(chunkStartSeconds("Từ khoá let cho phép gán lại giá trị. Còn const", cues)).toBe(5);
  });

  it("is null for text that is not from this video", () => {
    expect(chunkStartSeconds("Promise giúp xử lý bất đồng bộ trong JavaScript", cues)).toBeNull();
    expect(chunkStartSeconds("ok", cues)).toBeNull();
  });
});

describe("mergeWatched", () => {
  it("joins overlapping and touching stretches and clamps them to the video", () => {
    expect(mergeWatched([[0, 10]], [[9.5, 20], [20.6, 30], [50, 70]], 60)).toEqual([[0, 30], [50, 60]]);
  });

  it("ignores malformed stored data and empty stretches", () => {
    expect(mergeWatched("bad", [[5, 5], [8, 3]], null)).toEqual([]);
    expect(mergeWatched([[1, "x"], [0, 4]], undefined, null)).toEqual([[0, 4]]);
  });
});
