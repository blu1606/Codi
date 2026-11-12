import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  embeddedFilePdf,
  launchPdf,
  objectStreamJsPdf,
  openActionJsPdf,
  safePdf,
  textPdf,
  uriLinkPdf,
  visibleInjectionPdf,
} from "../../scripts/demo-content/security-samples";
import { decodePdfNames, scanPdfActiveContent } from "./pdf-active-content";

const latin1 = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const stream = (dict: string, data: string) => `<< ${dict} /Length ${data.length} >>\nstream\n${data}\nendstream`;

describe("decodePdfNames", () => {
  it("decodes #xx escapes inside name tokens only", () => {
    expect(decodePdfNames("/S /J#61vaScript /J#53 (a#62)")).toBe("/S /JavaScript /JS (a#62)");
  });
});

describe("scanPdfActiveContent — blocked", () => {
  it("OpenAction that runs JavaScript", () => {
    const r = scanPdfActiveContent(openActionJsPdf());
    expect(r.blocked).toContain("tự chạy JavaScript khi mở tệp (OpenAction)");
    expect(r.blocked).toContain("có mã JavaScript");
  });

  it("JavaScript hidden in a compressed object stream behind #xx escapes", () => {
    const bytes = objectStreamJsPdf();
    const raw = Buffer.from(bytes).toString("latin1");
    expect(raw).not.toMatch(/JavaScript|\/JS\b/); // nothing to find without inflating
    expect(scanPdfActiveContent(bytes).blocked).toContain("có mã JavaScript");
  });

  it("/Launch, embedded files, XFA, RichMedia, SubmitForm, ImportData and GoToR / GoToE", () => {
    expect(scanPdfActiveContent(launchPdf()).blocked.join()).toMatch(/Launch/);
    expect(scanPdfActiveContent(embeddedFilePdf()).blocked.join()).toMatch(/EmbeddedFile/);
    for (const [catalog, reason] of [
      ["/AcroForm << /XFA 6 0 R >>", /XFA/],
      ["/Annots [<< /Subtype /RichMedia >>]", /RichMedia/],
      ["/AA << /O << /S /SubmitForm /F (https://x.example/) >> >>", /SubmitForm/],
      ["/AA << /O << /S /ImportData /F (data.fdf) >> >>", /ImportData/],
      ["/OpenAction << /S /GoToR /F (http://x.example/a.pdf) /D [0 /Fit] >>", /GoToR/],
      ["/OpenAction << /S /GoToE /T << /R /C /N (a) >> >>", /GoToR/],
    ] as const) {
      expect(scanPdfActiveContent(textPdf(["x"], { catalog })).blocked.join(), catalog).toMatch(reason);
    }
  });

  it("whitespace and comments between tokens do not hide a name", () => {
    const pdf = textPdf(["x"], { catalog: "/OpenAction 6 0 R", extra: ["<<\n/S %comment\n /JavaScript\r\n/JS\t(app.alert\\(1\\))>>"] });
    expect(scanPdfActiveContent(pdf).blocked).toContain("có mã JavaScript");
  });

  it("an object stream that cannot be inflated, uses another filter, or inflates past the cap", () => {
    const broken = textPdf(["x"], { extra: [stream("/Type /ObjStm /N 1 /First 4 /Filter /FlateDecode", "not zlib data")] });
    expect(scanPdfActiveContent(broken).blocked.join()).toMatch(/không kiểm tra được/);
    const other = textPdf(["x"], { extra: [stream("/Type /ObjStm /N 1 /First 4 /Filter [/ASCIIHexDecode /FlateDecode]", "00")] });
    expect(scanPdfActiveContent(other).blocked.join()).toMatch(/không kiểm tra được/);
    const bomb = Buffer.from(deflateSync(Buffer.alloc(12 * 1024 * 1024, 0x20))).toString("latin1");
    const big = textPdf(["x"], { extra: [stream("/Type /ObjStm /N 1 /First 4 /Filter /FlateDecode", bomb)] });
    expect(scanPdfActiveContent(big).blocked.join()).toMatch(/bom nén/);
  });
});

describe("scanPdfActiveContent — allowed", () => {
  it("plain documents, including one with visible injection text (handled by the injection scan)", () => {
    expect(scanPdfActiveContent(safePdf())).toEqual({ blocked: [], notes: [] });
    expect(scanPdfActiveContent(visibleInjectionPdf()).blocked).toEqual([]);
  });

  it("a plain /URI link is a note, not a block", () => {
    const r = scanPdfActiveContent(uriLinkPdf());
    expect(r.blocked).toEqual([]);
    expect(r.notes.join()).toMatch(/URI/);
  });

  it("an OpenAction that only sets the view is a note", () => {
    const r = scanPdfActiveContent(textPdf(["x"], { catalog: "/OpenAction [3 0 R /Fit]" }));
    expect(r.blocked).toEqual([]);
    expect(r.notes.join()).toMatch(/OpenAction/);
  });

  it("does not match look-alike names (/JSON, /JavaScriptX) or names inside compressed page content", () => {
    expect(scanPdfActiveContent(textPdf(["x"], { catalog: "/JSON 1 /JavaScriptX 2" })).blocked).toEqual([]);
    const packed = Buffer.from(deflateSync(Buffer.from("BT (/JS /JavaScript /Launch) Tj ET", "latin1"))).toString("latin1");
    const pdf = textPdf(["x"], { extra: [stream("/Filter /FlateDecode", packed)] });
    expect(scanPdfActiveContent(pdf).blocked).toEqual([]);
    expect(scanPdfActiveContent(latin1("%PDF-1.4\n%%EOF")).blocked).toEqual([]);
  });
});
