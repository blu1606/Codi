// The stored video transcript is read through lessonTranscript before it reaches the learner's reader.
import { describe, expect, it } from "vitest";
import { lessonTranscript } from "./lesson-player-contract";

describe("lessonTranscript", () => {
  it("returns null for a missing or non-array value", () => {
    expect(lessonTranscript(null)).toBeNull();
    expect(lessonTranscript(undefined)).toBeNull();
    expect(lessonTranscript({ start: 0, text: "x" })).toBeNull();
    expect(lessonTranscript([])).toBeNull();
  });

  it("keeps valid cues in time order and trims their text", () => {
    expect(lessonTranscript([
      { start: 12.5, end: 20, text: "  Biến   là   hộp chứa giá trị " },
      { start: 0, text: "Xin chào" },
    ])).toEqual([
      { start: 0, text: "Xin chào" },
      { start: 12.5, end: 20, text: "Biến là hộp chứa giá trị" },
    ]);
  });

  it("drops malformed cues and an end that does not follow the start", () => {
    expect(lessonTranscript([
      null,
      "text",
      { start: -1, text: "âm" },
      { start: Number.NaN, text: "nan" },
      { start: "3", text: "chuỗi" },
      { start: 4, text: "   " },
      { start: 5, text: 42 },
      { start: 6, end: 6, text: "kết thúc trùng" },
      { start: 7, end: 9, text: "hợp lệ" },
    ])).toEqual([
      { start: 6, text: "kết thúc trùng" },
      { start: 7, end: 9, text: "hợp lệ" },
    ]);
  });

  it("returns null when no cue is usable", () => {
    expect(lessonTranscript([{ start: -5, text: "x" }, { text: "y" }])).toBeNull();
  });
});
