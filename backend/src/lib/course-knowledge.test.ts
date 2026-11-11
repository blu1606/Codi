import { describe, expect, it } from "vitest";
import { chunkText, normalize } from "./course-knowledge";

describe("chunkText", () => {
  it("returns nothing for blank text and one chunk for short text", () => {
    expect(chunkText("  \n ")).toEqual([]);
    expect(chunkText("Biến trong JavaScript")).toEqual(["Biến trong JavaScript"]);
  });

  it("cuts long text at line boundaries with overlap and loses no content", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `Dòng ${i}: ${"nội dung ".repeat(6)}`);
    const chunks = chunkText(lines.join("\n"), 400, 80);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 400)).toBe(true);
    for (const line of lines) expect(chunks.some((chunk) => chunk.includes(line.trim()))).toBe(true);
  });
});

describe("normalize", () => {
  it("scales to unit length so the dot product is the cosine", () => {
    const v = normalize([3, 4]);
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
    expect(normalize([0, 0])).toEqual([0, 0]);
  });
});
