import { describe, expect, it } from "vitest";
import { fileTypeOf, keyFromMediaUrl, LessonMediaError, magicMatches, mediaUrl } from "./lesson-media";

const KEY = "lesson-media/course-abc/0f8fad5b-d9cb-469f-a165-70867728950e.mp4";

describe("fileTypeOf", () => {
  it("maps lecture file extensions to a material type", () => {
    expect(fileTypeOf("Bài 1.MP4")).toMatchObject({ kind: "video", material: "video", ext: "mp4" });
    expect(fileTypeOf("slide.pptx")).toMatchObject({ kind: "pptx", material: "slide" });
    expect(fileTypeOf("notes.docx")).toMatchObject({ kind: "docx", material: "document" });
    expect(fileTypeOf("scan.pdf")).toMatchObject({ kind: "pdf", material: "pdf" });
  });
  it("refuses anything else", () => {
    expect(() => fileTypeOf("setup.exe")).toThrow(LessonMediaError);
    expect(() => fileTypeOf("noextension")).toThrow(LessonMediaError);
  });
});

describe("magicMatches", () => {
  const bytes = (s: string, offset = 0) => { const b = Buffer.alloc(16); b.write(s, offset, "latin1"); return b; };
  it("accepts files whose first bytes match the extension", () => {
    expect(magicMatches("pdf", "pdf", bytes("%PDF-1.7"))).toBe(true);
    expect(magicMatches("pptx", "pptx", bytes("PK\u0003\u0004"))).toBe(true);
    expect(magicMatches("video", "mp4", bytes("ftypisom", 4))).toBe(true);
    expect(magicMatches("video", "webm", Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toBe(true);
  });
  it("rejects a renamed file", () => {
    expect(magicMatches("pdf", "pdf", bytes("MZ\u0090"))).toBe(false);
    expect(magicMatches("video", "mp4", bytes("%PDF-1.7"))).toBe(false);
    expect(magicMatches("docx", "docx", bytes("%PDF-1.7"))).toBe(false);
  });
});

describe("keyFromMediaUrl", () => {
  it("reads back the key of a URL produced by mediaUrl", () => {
    expect(keyFromMediaUrl(mediaUrl(KEY))).toBe(KEY);
  });
  it("ignores external URLs and keys outside lesson-media/", () => {
    expect(keyFromMediaUrl("https://www.youtube.com/watch?v=abc")).toBeNull();
    expect(keyFromMediaUrl(`/api/lesson-media?key=${encodeURIComponent("avatars/u1.png")}`)).toBeNull();
    expect(keyFromMediaUrl(`/api/lesson-media?key=${encodeURIComponent("lesson-media/../secret.mp4")}`)).toBeNull();
  });
});
