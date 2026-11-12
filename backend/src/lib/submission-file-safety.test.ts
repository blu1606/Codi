import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { blockedUploadName, executableHeader, inspectSubmissionFile, listZipEntries, ooxmlHiddenText, scanSubmissionSecurity } from "./submission-file-safety";
import {
  embeddedFilePdf, fakeExecutable, hiddenInjectionDocx, launchPdf, macroDocx, objectStreamJsPdf, openActionJsPdf, SAFE_JS, safeDocx, safePdf, uriLinkPdf,
} from "../../scripts/demo-content/security-samples";

const bytes = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const officeZip = (kind: "docx" | "pptx", extra: Record<string, Uint8Array> = {}) => zipSync({
  "[Content_Types].xml": strToU8("<Types/>"),
  ...(kind === "docx" ? { "word/document.xml": strToU8("<w:document><w:p><w:t>Bài làm</w:t></w:p></w:document>") }
    : { "ppt/presentation.xml": strToU8("<p:presentation/>") }),
  ...extra,
});
const reasonOf = (name: string, data: Uint8Array) => {
  const r = inspectSubmissionFile(name, data);
  return r.ok ? null : r.reason;
};

describe("inspectSubmissionFile — safe files pass", () => {
  it("accepts a real PDF, DOCX, PPTX, code and text file, PNG and JPEG", () => {
    expect(inspectSubmissionFile("bai-lam.pdf", bytes("%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"))).toMatchObject({ ok: true, kind: "pdf" });
    expect(inspectSubmissionFile("bai-lam.docx", officeZip("docx"))).toMatchObject({ ok: true, kind: "docx" });
    expect(inspectSubmissionFile("slide.pptx", officeZip("pptx"))).toMatchObject({ ok: true, kind: "pptx" });
    expect(inspectSubmissionFile("main.js", strToU8("#!/usr/bin/env node\nconsole.log('xin chào');\n"))).toMatchObject({ ok: true, kind: "text" });
    expect(inspectSubmissionFile("README.md", strToU8("# Bài tập\nGiải thích phạm vi biến."))).toMatchObject({ ok: true, kind: "text" });
    expect(inspectSubmissionFile("anh.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toMatchObject({ ok: true, kind: "image" });
    expect(inspectSubmissionFile("anh.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toMatchObject({ ok: true, kind: "image" });
  });
});

describe("inspectSubmissionFile — dangerous files are refused", () => {
  it("refuses a Windows executable renamed to .pdf, and ELF / Mach-O binaries", () => {
    expect(reasonOf("bai-lam.pdf", bytes("MZ\x90\x00\x03\x00\x00\x00This program cannot be run in DOS mode"))).toMatch(/MZ/);
    expect(reasonOf("main.js", new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]))).toMatch(/ELF/);
    expect(reasonOf("notes.txt", new Uint8Array([0xcf, 0xfa, 0xed, 0xfe, 7, 0]))).toMatch(/Mach-O/);
  });

  it("refuses executable and script extensions, double extensions and macro-enabled Office", () => {
    for (const name of ["setup.exe", "run.bat", "x.ps1", "install.sh", "bai.pdf.exe", "macro.docm", "slide.pptm"]) {
      expect(reasonOf(name, strToU8("hello"))).not.toBeNull();
      expect(blockedUploadName(name)).not.toBeNull();
    }
    expect(blockedUploadName("bai-lam.pdf")).toBeNull();
  });

  it("refuses a DOCX that carries a VBA macro project or ActiveX", () => {
    expect(reasonOf("bai.docx", officeZip("docx", { "word/vbaProject.bin": new Uint8Array([1, 2, 3]) }))).toMatch(/macro/);
    expect(reasonOf("bai.docx", officeZip("docx", { "word/activeX/activeX1.xml": strToU8("<x/>") }))).toMatch(/ActiveX/);
  });

  it("refuses an encrypted PDF and a password-protected (OLE) Office file", () => {
    expect(reasonOf("bai.pdf", bytes("%PDF-1.6\ntrailer<</Encrypt 5 0 R>>"))).toMatch(/mã hoá/);
    expect(reasonOf("bai.docx", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toMatch(/mật khẩu|cũ/);
  });

  it("refuses a zip bomb inside an Office container (compression ratio)", () => {
    const bomb = officeZip("docx", { "word/media/zeros.bin": new Uint8Array(4 * 1024 * 1024) });
    expect(reasonOf("bai.docx", bomb)).toMatch(/zip bomb/);
  });

  it("refuses mismatched content, plain archives, binaries named .txt and shebang scripts named .txt", () => {
    expect(reasonOf("bai.pdf", strToU8("not a pdf"))).toMatch(/không phải PDF/);
    expect(reasonOf("bai.docx", strToU8("plain text"))).toMatch(/không phải tệp Office/);
    expect(reasonOf("anh.png", new Uint8Array([0xff, 0xd8, 0xff]))).toMatch(/không phải ảnh/);
    expect(reasonOf("project.zip", zipSync({ "a.js": strToU8("1") }))).toMatch(/tệp nén/);
    expect(reasonOf("notes.txt", zipSync({ "a.js": strToU8("1") }))).toMatch(/tệp nén/);
    expect(reasonOf("notes.txt", new Uint8Array([0x61, 0x00, 0x62]))).toMatch(/không phải văn bản/);
    expect(reasonOf("notes.txt", strToU8("#!/bin/sh\nrm -rf /"))).toMatch(/kịch bản/);
    expect(reasonOf("data.xyz", strToU8("x"))).toMatch(/chưa được AI đọc/);
    expect(reasonOf("empty.txt", new Uint8Array())).toMatch(/trống/);
  });
});

describe("listZipEntries", () => {
  it("reads names and sizes from the central directory without decompressing", () => {
    const entries = listZipEntries(officeZip("docx"));
    expect(entries.map((e) => e.name).sort()).toEqual(["[Content_Types].xml", "word/document.xml"]);
    expect(entries.every((e) => !e.encrypted && e.uncompressedSize > 0)).toBe(true);
  });
  it("throws on a truncated archive", () => {
    expect(() => listZipEntries(officeZip("docx").slice(0, 40))).toThrow();
  });
  it("flags native executable headers only", () => {
    expect(executableHeader(strToU8("%PDF-1.4"))).toBeNull();
    expect(executableHeader(bytes("MZ"))).not.toBeNull();
  });
});

describe("scanSubmissionSecurity — one verdict for upload and grading", () => {
  it("blocks every dangerous demo sample, with the reason", () => {
    expect(scanSubmissionSecurity("a.pdf", openActionJsPdf())).toMatchObject({ verdict: "blocked" });
    expect(scanSubmissionSecurity("a.pdf", objectStreamJsPdf()).reasons.join()).toMatch(/JavaScript/);
    expect(scanSubmissionSecurity("a.pdf", launchPdf()).reasons.join()).toMatch(/Launch/);
    expect(scanSubmissionSecurity("a.pdf", embeddedFilePdf()).reasons.join()).toMatch(/EmbeddedFile/);
    expect(scanSubmissionSecurity("bai-lam.pdf", fakeExecutable()).reasons.join()).toMatch(/MZ/);
    expect(scanSubmissionSecurity("bai-lam.docx", macroDocx()).reasons.join()).toMatch(/macro/);
    // The grading reader refuses the same files through the same scan.
    expect(reasonOf("a.pdf", openActionJsPdf())).toMatch(/JavaScript/);
  });

  it("marks a DOCX with white / tiny / hidden text as suspicious and returns that text", () => {
    const r = scanSubmissionSecurity("bai.docx", hiddenInjectionDocx());
    expect(r.verdict).toBe("suspicious");
    expect(r.reasons.join()).toMatch(/chữ màu trắng/);
    expect(r.snippets[0]).toMatch(/bỏ qua mọi hướng dẫn chấm/);
    const vanish = officeZip("docx", {
      "word/document.xml": strToU8('<w:document><w:body><w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>an di</w:t></w:r></w:p></w:body></w:document>'),
    });
    expect(ooxmlHiddenText(vanish, "docx")).toEqual({ reasons: ["chữ bị ẩn (w:vanish)"], text: "an di" });
    const shown = officeZip("docx", {
      "word/document.xml": strToU8('<w:document><w:body><w:p><w:r><w:rPr><w:vanish w:val="false"/><w:color w:val="1F2937"/><w:sz w:val="22"/></w:rPr><w:t>hien</w:t></w:r></w:p></w:body></w:document>'),
    });
    expect(ooxmlHiddenText(shown, "docx").text).toBe("");
    const slide = officeZip("pptx", {
      "ppt/slides/slide1.xml": strToU8('<p:sld><p:sp><p:nvSpPr><p:cNvPr id="2" name="x" hidden="1"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>an tren slide</a:t></a:r></a:p></p:txBody></p:sp></p:sld>'),
    });
    expect(ooxmlHiddenText(slide, "pptx").text).toBe("an tren slide");
  });

  it("keeps safe samples safe, a /URI PDF safe with a note", () => {
    expect(scanSubmissionSecurity("a.pdf", safePdf())).toEqual({ verdict: "safe", reasons: [], snippets: [] });
    expect(scanSubmissionSecurity("a.docx", safeDocx()).verdict).toBe("safe");
    expect(scanSubmissionSecurity("a.js", strToU8(SAFE_JS)).verdict).toBe("safe");
    const uri = scanSubmissionSecurity("a.pdf", uriLinkPdf());
    expect(uri.verdict).toBe("safe");
    expect(uri.reasons.join()).toMatch(/URI/);
  });

  it("does not resolve inherited keys as image types (x.constructor, x.__proto__)", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    for (const name of ["x.constructor", "x.__proto__", "x.tostring"]) {
      expect(inspectSubmissionFile(name, jpeg).ok, name).toBe(false);
    }
  });
});
