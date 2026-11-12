// Active-content scan for learner-submitted PDFs: JavaScript, launch actions, embedded files, XFA forms and the like
// are refused before anything reads the file or sends it to a model. Pure function over bytes (no I/O).
//
// Obfuscation handled:
//  - name hex escapes (/J#61vaScript is /JavaScript): every name token is decoded before matching;
//  - whitespace and comments between tokens do not matter, because only whole name tokens are matched and a PDF
//    name cannot itself contain whitespace or "%" (a comment always ends the name);
//  - dictionaries hidden in compressed object streams (/Type /ObjStm /Filter /FlateDecode) are inflated with a hard
//    output cap and scanned as well. An object stream that cannot be inflated, or uses another filter, cannot be
//    checked and is refused rather than trusted.
// Node's zlib is used for inflating because `maxOutputLength` stops a deflate bomb before the memory is allocated.
import { constants, inflateSync } from "node:zlib";

/** Per object stream and total inflated bytes; a submission PDF never needs more. */
const MAX_STREAM_OUTPUT = 10 * 1024 * 1024;
const MAX_TOTAL_OUTPUT = 50 * 1024 * 1024;
const MAX_OBJECT_STREAMS = 200;
const DICT_LOOKBACK = 8_192;

export type PdfActiveContent = {
  /** Reasons the file must be refused (empty when it may be read). */
  blocked: string[];
  /** Harmless findings worth showing the lecturer (plain links, view actions). */
  notes: string[];
};

const DELIM = "[\\s/\\[\\]<>(){}%]";
const hasName = (text: string, name: string) => new RegExp(`/${name}(?=${DELIM}|$)`).test(text);

/** Decodes #xx escapes inside every name token so /J#61vaScript reads /JavaScript. */
export function decodePdfNames(text: string): string {
  return text.replace(/\/[^\s/[\]<>(){}%]+/g, (name) =>
    name.includes("#") ? name.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))) : name);
}

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");

/** Start of the balanced "<<" that closes at `end` (the index of the final ">>"), or -1. */
function dictStart(text: string, end: number): number {
  let depth = 0;
  for (let i = end; i >= Math.max(0, end - DICT_LOOKBACK); i--) {
    if (text.startsWith(">>", i)) { depth++; i--; continue; }
    if (text.startsWith("<<", i)) { depth--; if (depth === 0) return i; i--; }
  }
  return -1;
}

type Streams = { skeleton: string; texts: string[]; problems: string[] };

/**
 * Splits the file into what is scanned: the object skeleton (filtered stream bodies cut out: compressed or image
 * bytes would otherwise produce random "/JS" look-alikes) plus every compressed object stream, inflated with a cap.
 */
function readStreams(bytes: Uint8Array, text: string): Streams {
  const out: Streams = { skeleton: "", texts: [], problems: [] };
  const keyword = /stream(\r\n|\n|\r)/g;
  const cuts: [number, number][] = [];
  let total = 0;
  let inflatedCount = 0;
  for (let m = keyword.exec(text); m; m = keyword.exec(text)) {
    if (text.startsWith("end", m.index - 3)) continue;
    const close = text.lastIndexOf(">>", m.index);
    if (close < 0 || text.slice(close + 2, m.index).trim()) continue;
    const open = dictStart(text, close);
    if (open < 0) continue;
    const dict = decodePdfNames(text.slice(open, close + 2));
    const dataStart = m.index + m[0].length;
    const dataEnd = text.indexOf("endstream", dataStart);
    if (dataEnd < 0) { out.problems.push("luồng dữ liệu bị cắt cụt, không kiểm tra được"); break; }
    keyword.lastIndex = dataEnd + "endstream".length;
    const filter = /\/Filter\s*(\[[^\]]*\]|\/[^\s/[\]<>(){}%]+)/.exec(dict)?.[1] ?? "";
    const filters = filter.match(/\/[^\s/[\]<>(){}%]+/g) ?? [];
    if (!filters.length) continue; // unfiltered body is plain text: it stays in the skeleton and is scanned
    cuts.push([dataStart, dataEnd]);
    if (!/\/Type\s*\/ObjStm(?=[\s/[\]<>(){}%]|$)/.test(dict)) continue;
    if (filters.length !== 1 || filters[0] !== "/FlateDecode") {
      out.problems.push("luồng đối tượng mã hoá theo cách không kiểm tra được");
      continue;
    }
    if (++inflatedCount > MAX_OBJECT_STREAMS) { out.problems.push("quá nhiều luồng đối tượng nén"); break; }
    const budget = Math.min(MAX_STREAM_OUTPUT, MAX_TOTAL_OUTPUT - total);
    if (budget <= 0) { out.problems.push("nội dung nén giải ra quá lớn (nghi bom nén)"); break; }
    try {
      const inflated = inflateSync(bytes.subarray(dataStart, dataEnd), { maxOutputLength: budget, finishFlush: constants.Z_SYNC_FLUSH });
      total += inflated.byteLength;
      out.texts.push(inflated.toString("latin1"));
    } catch (error) {
      out.problems.push(error instanceof RangeError ? "nội dung nén giải ra quá lớn (nghi bom nén)" : "luồng đối tượng nén bị hỏng, không kiểm tra được");
    }
  }
  let at = 0;
  const parts: string[] = [];
  for (const [from, to] of cuts) { parts.push(text.slice(at, from)); at = to; }
  parts.push(text.slice(at));
  out.skeleton = parts.join(" ");
  return out;
}

const BLOCK_RULES: [string[], string][] = [
  [["JavaScript", "JS"], "có mã JavaScript"],
  [["Launch"], "có lệnh /Launch mở chương trình hoặc tệp khác"],
  [["EmbeddedFile", "EmbeddedFiles"], "có tệp nhúng bên trong (EmbeddedFile)"],
  [["RichMedia"], "có nội dung đa phương tiện chủ động (RichMedia/Flash)"],
  [["XFA"], "có biểu mẫu động XFA"],
  [["SubmitForm"], "có lệnh gửi dữ liệu biểu mẫu ra ngoài (SubmitForm)"],
  [["ImportData"], "có lệnh nạp dữ liệu từ tệp ngoài (ImportData)"],
  [["GoToR", "GoToE"], "có lệnh mở tài liệu khác từ xa (GoToR/GoToE)"],
];

/** Scans a PDF for active content. Callers have already checked the %PDF- header. */
export function scanPdfActiveContent(bytes: Uint8Array): PdfActiveContent {
  const raw = latin1(bytes);
  const streams = readStreams(bytes, raw);
  const text = [streams.skeleton, ...streams.texts].map(decodePdfNames).join("\n");
  const blocked: string[] = [];
  for (const [names, reason] of BLOCK_RULES) {
    if (names.some((n) => hasName(text, n))) blocked.push(reason);
  }
  const notes: string[] = [];
  const js = hasName(text, "JavaScript") || hasName(text, "JS");
  if (hasName(text, "OpenAction")) {
    if (js) blocked.unshift("tự chạy JavaScript khi mở tệp (OpenAction)");
    else notes.push("có hành động khi mở tệp (OpenAction, không chạy mã)");
  }
  if (hasName(text, "AA") && !js) notes.push("có hành động tự động (/AA, không chạy mã)");
  if (hasName(text, "URI")) notes.push("có liên kết web (/URI), được phép");
  blocked.push(...new Set(streams.problems));
  return { blocked, notes };
}
