// Safety checks for learner-submitted assignment files before anything reads them or sends them to a model.
// The extension and the file's own bytes (magic numbers) must agree on an allow-listed type; executables, scripts,
// macro-enabled Office files, encrypted PDFs, plain archives and zip bombs are refused with a reason the lecturer
// can read. Pure functions over bytes: no I/O here, so every case is unit-tested.
//
// `scanSubmissionSecurity` is the single security verdict for a file, used both when the learner uploads it
// (assessment-service refuses a blocked file) and again when the grading assistant reads it (inspectSubmissionFile).
import { strFromU8, unzipSync } from "fflate";
import { scanPdfActiveContent } from "./pdf-active-content";

/** Cap on what the grading assistant downloads and inspects (the upload cap is 20 MB as well). */
export const MAX_INSPECT_BYTES = 20 * 1024 * 1024;
/** Images are sent to the model as they are, so they get a smaller cap. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
// Zip guards for OOXML (docx / pptx are zip containers).
const ZIP_MAX_ENTRIES = 2_000;
const ZIP_MAX_TOTAL_UNCOMPRESSED = 100 * 1024 * 1024;
const ZIP_MAX_RATIO = 100;

export type SafeFileKind = "pdf" | "docx" | "pptx" | "text" | "image";
/** Security verdict for one file: blocked files are never read; suspicious ones are read with a warning. */
export type FileSecurity = { verdict: "safe" | "blocked" | "suspicious"; reasons: string[]; snippets: string[] };
export type FileInspection =
  | { ok: true; kind: SafeFileKind; ext: string; mime: string; security: FileSecurity }
  | { ok: false; reason: string; security?: FileSecurity };

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "json", "yml", "yaml", "xml", "html", "htm", "css", "scss",
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "java", "c", "h", "cpp", "hpp", "cc", "cs", "go", "rs", "rb",
  "php", "sql", "kt", "swift", "dart", "vue", "svelte", "ipynb",
]);
// Plain-text formats that never legitimately start with a shebang line.
const DOCUMENT_TEXT = new Set(["txt", "md", "markdown", "csv", "json", "yml", "yaml", "xml"]);
const IMAGE_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

/** Extensions that are never accepted as an assignment file: programs, installers, scripts and macro-enabled Office. */
export const BLOCKED_EXTENSIONS = new Set([
  "exe", "dll", "com", "scr", "msi", "msp", "msix", "appx", "bat", "cmd", "ps1", "psm1", "psd1", "vbs", "vbe", "wsf",
  "wsh", "hta", "cpl", "jar", "apk", "app", "dmg", "pkg", "deb", "rpm", "sh", "bash", "zsh", "csh", "ksh", "run", "bin",
  "elf", "so", "dylib", "lnk", "reg", "scf", "iso", "img", "vhd", "vhdx",
  "docm", "dotm", "xlsm", "xltm", "xlam", "pptm", "potm", "ppsm", "ppam",
]);

export const extensionOf = (name: string) => {
  const base = name.trim().toLowerCase().split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1) : "";
};

/** Upload-time name check: null when acceptable, else the reason. Double extensions like "bai.pdf.exe" end in exe. */
export function blockedUploadName(name: string): string | null {
  const ext = extensionOf(name);
  if (BLOCKED_EXTENSIONS.has(ext)) return `Không nhận tệp .${ext} (chương trình, kịch bản hoặc tài liệu có macro).`;
  return null;
}

const startsWith = (bytes: Uint8Array, sig: number[], at = 0) =>
  bytes.length >= at + sig.length && sig.every((b, i) => bytes[at + i] === b);

/** A native executable header (Windows PE "MZ", Linux ELF, macOS Mach-O / universal), whatever the extension. */
export function executableHeader(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x4d, 0x5a])) return "tệp chương trình Windows (MZ)";
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return "tệp chương trình Linux (ELF)";
  if ([[0xfe, 0xed, 0xfa, 0xce], [0xfe, 0xed, 0xfa, 0xcf], [0xce, 0xfa, 0xed, 0xfe], [0xcf, 0xfa, 0xed, 0xfe], [0xca, 0xfe, 0xba, 0xbe]]
    .some((sig) => startsWith(bytes, sig))) return "tệp chương trình macOS (Mach-O)";
  return null;
}

const isZip = (b: Uint8Array) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]);
const isOleCompound = (b: Uint8Array) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const latin1 = (b: Uint8Array, from = 0, to = b.length) => Buffer.from(b.buffer, b.byteOffset + from, Math.max(0, Math.min(to, b.length) - from)).toString("latin1");

export type ZipEntry = { name: string; compressedSize: number; uncompressedSize: number; encrypted: boolean };

/**
 * Reads the zip central directory without decompressing anything. Throws on a malformed or ZIP64 archive (refused:
 * no legitimate assignment needs it, and its sizes would bypass the bomb guard).
 */
export function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: 22 bytes + up to 64 KB comment, searched from the end.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip: no end of central directory");
  const count = view.getUint16(eocd + 10, true);
  const size = view.getUint32(eocd + 12, true);
  const offset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw new Error("zip: zip64");
  if (offset + size > eocd) throw new Error("zip: central directory out of bounds");
  if (count > ZIP_MAX_ENTRIES) throw new Error("zip: too many entries");
  const entries: ZipEntry[] = [];
  let p = offset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > eocd || view.getUint32(p, true) !== 0x02014b50) throw new Error("zip: bad central directory entry");
    const flags = view.getUint16(p + 8, true);
    const compressedSize = view.getUint32(p + 20, true);
    const uncompressedSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw new Error("zip: zip64");
    if (p + 46 + nameLen > eocd) throw new Error("zip: name out of bounds");
    entries.push({ name: Buffer.from(bytes.subarray(p + 46, p + 46 + nameLen)).toString("utf8"), compressedSize, uncompressedSize, encrypted: (flags & 1) === 1 });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Security part of the OOXML guard (macros, ActiveX, zip bombs); null when nothing dangerous was found. */
export function ooxmlSecurityProblem(entries: ZipEntry[]): string | null {
  if (entries.some((e) => /(^|\/)vbaProject\.bin$/i.test(e.name) || /(^|\/)vbaData\.xml$/i.test(e.name))) return "tài liệu Office có chứa macro (VBA)";
  if (entries.some((e) => /(^|\/)activeX\//i.test(e.name))) return "tài liệu Office có chứa điều khiển ActiveX";
  const total = entries.reduce((sum, e) => sum + e.uncompressedSize, 0);
  const packed = entries.reduce((sum, e) => sum + e.compressedSize, 0);
  if (total > ZIP_MAX_TOTAL_UNCOMPRESSED) return "tệp Office giải nén ra quá lớn (nghi zip bomb)";
  if (entries.some((e) => e.uncompressedSize > 1024 * 1024 && e.uncompressedSize > e.compressedSize * ZIP_MAX_RATIO)
    || (packed > 0 && total > 1024 * 1024 && total > packed * ZIP_MAX_RATIO)) return "tỉ lệ nén bất thường (nghi zip bomb)";
  return null;
}

/** Bomb / macro / encryption guard for an OOXML container; null when it may be read. */
export function ooxmlProblem(entries: ZipEntry[], kind: "docx" | "pptx"): string | null {
  if (entries.some((e) => e.encrypted)) return "tệp Office có mật khẩu (mã hoá)";
  const security = ooxmlSecurityProblem(entries);
  if (security) return security;
  const names = new Set(entries.map((e) => e.name));
  if (!names.has("[Content_Types].xml")) return "không phải tệp Office hợp lệ";
  if (kind === "docx" && !names.has("word/document.xml")) return "nội dung không phải tài liệu Word (.docx)";
  if (kind === "pptx" && !names.has("ppt/presentation.xml")) return "nội dung không phải bản trình chiếu (.pptx)";
  return null;
}

const xmlText = (xml: string) => xml
  .replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n: string) => { const c = Number(n); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : " "; })
  .replace(/&amp;/g, "&");
/** Near-white: every channel at least 0xF0 (white text on the default white page). */
const nearWhite = (hex: string) => /^[0-9a-f]{6}$/i.test(hex) && [0, 2, 4].every((i) => parseInt(hex.slice(i, i + 2), 16) >= 0xf0);

/** Why a DOCX run is invisible to a reader, or null. */
function hiddenRunReason(props: string): string | null {
  if (/<w:vanish(?![^>]*w:val="(?:false|0|off)")[^>]*\/>/.test(props)) return "chữ bị ẩn (w:vanish)";
  if (nearWhite(/<w:color\s[^>]*w:val="([0-9A-Fa-f]{6})"/.exec(props)?.[1] ?? "")) return "chữ màu trắng";
  if (Number(/<w:sz\s[^>]*w:val="(\d+)"/.exec(props)?.[1] ?? 99) <= 4) return "chữ cỡ rất nhỏ";
  return null;
}

/**
 * Text a reader of the document cannot see but a text extractor (and so the model) would: DOCX runs marked hidden
 * (w:vanish), coloured white or set at 2 pt or less, and PPTX shapes marked hidden or text at 3 pt or less. Call
 * only after the zip guard passed (sizes are bounded). Returns the hidden text and why it counts as hidden.
 */
export function ooxmlHiddenText(bytes: Uint8Array, kind: "docx" | "pptx"): { reasons: string[]; text: string } {
  const reasons = new Set<string>();
  const parts: string[] = [];
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => kind === "docx" ? /^word\/(document|header\d*|footer\d*)\.xml$/.test(f.name) : /^ppt\/slides\/slide\d+\.xml$/.test(f.name),
    });
  } catch {
    return { reasons: [], text: "" };
  }
  for (const data of Object.values(files)) {
    const xml = strFromU8(data);
    if (kind === "docx") {
      for (const run of xml.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)) {
        const why = hiddenRunReason(/<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run[1]!)?.[1] ?? "");
        if (!why) continue;
        const text = [...run[1]!.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((t) => xmlText(t[1]!)).join("");
        if (text.trim()) { reasons.add(why); parts.push(text); }
      }
    } else {
      for (const shape of xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
        const hidden = /<p:cNvPr[^>]*\shidden="(?:1|true)"/.test(shape[1]!);
        for (const run of shape[1]!.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)) {
          const tiny = Number(/<a:rPr[^>]*\ssz="(\d+)"/.exec(run[1]!)?.[1] ?? 9999) <= 300;
          if (!hidden && !tiny) continue;
          const text = xmlText(/<a:t>([\s\S]*?)<\/a:t>/.exec(run[1]!)?.[1] ?? "");
          if (text.trim()) { reasons.add(hidden ? "hình bị ẩn trên trang chiếu" : "chữ cỡ rất nhỏ"); parts.push(text); }
        }
      }
    }
  }
  return { reasons: [...reasons], text: parts.join(" ").replace(/\s+/g, " ").trim() };
}

const SAFE: FileSecurity = { verdict: "safe", reasons: [], snippets: [] };
const blockedVerdict = (...reasons: string[]): FileSecurity => ({ verdict: "blocked", reasons, snippets: [] });

/**
 * Security verdict for a submitted file. Blocked: programs (by name or header), PDFs with active content
 * (JavaScript, /Launch, embedded files, XFA, ...), Office files with macros / ActiveX or zip-bomb sizes.
 * Suspicious: Office documents with hidden text (a classic place to hide instructions for an AI grader). Format
 * problems that are not a security risk (wrong extension, encryption, unsupported type) are left to the reader.
 */
export function scanSubmissionSecurity(name: string, bytes: Uint8Array): FileSecurity {
  const ext = extensionOf(name);
  const blocked = blockedUploadName(name);
  if (blocked) return blockedVerdict(blocked.replace(/^Không nhận /, "không nhận ").replace(/\.$/, ""));
  const exe = executableHeader(bytes);
  if (exe) return blockedVerdict(`nội dung là ${exe} dù đuôi tệp là .${ext || "(không có)"}`);
  if (ext === "pdf" && latin1(bytes, 0, 1024).includes("%PDF-")) {
    const pdf = scanPdfActiveContent(bytes);
    if (pdf.blocked.length) return blockedVerdict(...pdf.blocked.map((r) => `PDF ${r}`));
    return { verdict: "safe", reasons: pdf.notes.map((r) => `PDF ${r}`), snippets: [] };
  }
  if ((ext === "docx" || ext === "pptx") && isZip(bytes)) {
    let entries: ZipEntry[];
    try {
      entries = listZipEntries(bytes);
    } catch {
      return SAFE; // malformed: the reader refuses it, which is not a security finding
    }
    const problem = ooxmlSecurityProblem(entries);
    if (problem) return blockedVerdict(problem);
    if (entries.some((e) => e.encrypted)) return SAFE;
    const hidden = ooxmlHiddenText(bytes, ext);
    if (hidden.text) {
      return { verdict: "suspicious", reasons: hidden.reasons.map((r) => `tài liệu có ${r}`), snippets: [hidden.text.slice(0, 160)] };
    }
  }
  return SAFE;
}

/** Valid UTF-8 without NUL bytes: the file is text, not a binary renamed to .txt / .js. */
function looksLikeText(bytes: Uint8Array) {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decides whether a submitted file may be read. Extension and content must agree; anything else is refused with a
 * short Vietnamese reason that ends up in the lecturer's warnings.
 */
export function inspectSubmissionFile(name: string, bytes: Uint8Array): FileInspection {
  const ext = extensionOf(name);
  if (!bytes.length) return { ok: false, reason: "tệp trống" };
  if (bytes.length > MAX_INSPECT_BYTES) return { ok: false, reason: "tệp vượt quá 20 MB" };
  const security = scanSubmissionSecurity(name, bytes);
  if (security.verdict === "blocked") return { ok: false, reason: security.reasons.join("; "), security };
  const ok = (kind: SafeFileKind, mime: string): FileInspection => ({ ok: true, kind, ext, mime, security });

  if (ext === "pdf") {
    if (!latin1(bytes, 0, 1024).includes("%PDF-")) return { ok: false, reason: "đuôi .pdf nhưng nội dung không phải PDF" };
    if (/\/Encrypt\b/.test(latin1(bytes))) return { ok: false, reason: "PDF có mật khẩu hoặc bị mã hoá" };
    return ok("pdf", "application/pdf");
  }
  if (ext === "docx" || ext === "pptx") {
    if (isOleCompound(bytes)) return { ok: false, reason: "tệp Office có mật khẩu hoặc định dạng Office cũ" };
    if (!isZip(bytes)) return { ok: false, reason: `đuôi .${ext} nhưng nội dung không phải tệp Office` };
    let entries: ZipEntry[];
    try {
      entries = listZipEntries(bytes);
    } catch {
      return { ok: false, reason: "tệp Office hỏng hoặc cấu trúc nén không được hỗ trợ" };
    }
    const problem = ooxmlProblem(entries, ext);
    if (problem) return { ok: false, reason: problem };
    return ok(ext, ext === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  }
  // Object.hasOwn: "x.constructor" / "x.__proto__" must not match an inherited key of the lookup table.
  if (Object.hasOwn(IMAGE_MIME, ext)) {
    const png = startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpg = startsWith(bytes, [0xff, 0xd8, 0xff]);
    if (ext === "png" ? !png : !jpg) return { ok: false, reason: `đuôi .${ext} nhưng nội dung không phải ảnh ${ext.toUpperCase()}` };
    if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: "ảnh vượt quá 5 MB" };
    return ok("image", IMAGE_MIME[ext]!);
  }
  if (TEXT_EXTENSIONS.has(ext)) {
    if (isZip(bytes) || latin1(bytes, 0, 5) === "%PDF-") return { ok: false, reason: `đuôi .${ext} nhưng nội dung là tệp nén hoặc PDF` };
    if (bytes.length > MAX_TEXT_FILE_BYTES) return { ok: false, reason: "tệp văn bản vượt quá 2 MB" };
    if (!looksLikeText(bytes)) return { ok: false, reason: `đuôi .${ext} nhưng nội dung không phải văn bản` };
    if (DOCUMENT_TEXT.has(ext) && latin1(bytes, 0, 2) === "#!") return { ok: false, reason: `kịch bản thực thi đặt đuôi .${ext}` };
    return ok("text", "text/plain");
  }
  if (ext === "zip" || ext === "rar" || ext === "7z" || ext === "tar" || ext === "gz" || isZip(bytes)) {
    return { ok: false, reason: "tệp nén chưa được AI đọc; hãy tải về để chấm thủ công" };
  }
  return { ok: false, reason: ext ? `định dạng .${ext} chưa được AI đọc` : "tệp không có đuôi nên không xác định được định dạng" };
}
