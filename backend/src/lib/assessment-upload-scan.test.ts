import { describe, expect, it } from "vitest";
import { copyAndScanUpload } from "./assessment-service";

const stream = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(Buffer.from(text, "latin1")));
      c.close();
    },
  });

/** In-memory store whose upload key can be swapped by the "learner" between operations. */
function store(initial: Record<string, string>) {
  const objects = { ...initial };
  const reads: string[] = [];
  return {
    objects,
    reads,
    files: {
      async copy(source: string, key: string) {
        objects[key] = objects[source]!;
      },
      async get(key: string) {
        reads.push(key);
        return { body: stream(objects[key]!) };
      },
    },
  };
}

describe("copyAndScanUpload", () => {
  it("scans the immutable copy, not the mutable upload key", async () => {
    const s = store({ "assignment-uploads/u": "MZ\x90\x00 program" });
    const refused = await copyAndScanUpload(s.files, "assignment-uploads/u", "assignments/a", "etag", "bai-lam.pdf");
    // A swap of the upload key after the copy cannot hide what was copied.
    s.objects["assignment-uploads/u"] = "%PDF-1.4 benign";
    expect(refused).toMatch(/bị chặn vì lý do bảo mật.*MZ/);
    expect(s.reads).toEqual(["assignments/a"]);
  });

  it("refuses a PDF that runs JavaScript when opened, with the reason", async () => {
    const pdf = "%PDF-1.7\n1 0 obj << /Type /Catalog /OpenAction 2 0 R >> endobj\n2 0 obj << /S /JavaScript /JS (app.alert(1)) >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF";
    const s = store({ "assignment-uploads/u": pdf });
    expect(await copyAndScanUpload(s.files, "assignment-uploads/u", "assignments/p", "etag", "bao-cao.pdf")).toMatch(/JavaScript/);
  });

  it("accepts a plain document", async () => {
    const s = store({ "assignment-uploads/u": "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF" });
    await expect(copyAndScanUpload(s.files, "assignment-uploads/u", "assignments/b", "etag", "bao-cao.pdf")).resolves.toBeNull();
  });

  it("propagates a failed If-Match copy without reading anything", async () => {
    const s = store({});
    const files = { ...s.files, copy: async () => { throw new Error("PreconditionFailed"); } };
    await expect(copyAndScanUpload(files, "assignment-uploads/u", "assignments/c", "etag", "x.pdf")).rejects.toThrow("PreconditionFailed");
    expect(s.reads).toEqual([]);
  });
});
