// Reads an uploaded lecture file into text the AI draft can use.
//  - PDF: the text layer (unpdf / PDF.js); pages without text (scans, slides exported as images) are rendered and
//    read with Tesseract OCR (Vietnamese + English), at most OCR_MAX_PAGES of them.
//  - PPTX / DOCX: the slide / paragraph text from the Office XML.
//  - Video: ffmpeg pulls a 16 kHz mono audio track for OpenAI Whisper (timed segments, likely-silence hallucinations
//    dropped) and a handful of evenly spaced key frames that the vision model sees next to the transcript.
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { unzipSync, strFromU8 } from "fflate";
import { ENV } from "@/env";
import { FFMPEG, LessonMediaError, probeDuration, run, type StoredUpload } from "@/lib/lesson-media";

export const OCR_MAX_PAGES = 12;
const OCR_MIN_CHARS = 40; // a page with less text than this is treated as an image
export const VIDEO_MAX_SECONDS = 2 * 60 * 60;
const WHISPER_MAX_BYTES = 24 * 1024 * 1024; // Whisper refuses files over 25 MB

export type ExtractedSource = {
  kind: StoredUpload["kind"];
  fileName: string;
  pages: number | null;
  ocrPages: number;
  durationSec: number | null;
  text: string;
  outline: string[];
  frames: { sec: number; jpeg: Buffer }[];
  speech: boolean;
  warnings: string[];
};

export const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const squash = (s: string) => s.replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
const firstLine = (s: string) => (s.split("\n").map((x) => x.trim()).find((x) => x.length > 2) || "").slice(0, 100);
const xmlText = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

// ───────────────────────── PDF ─────────────────────────
async function ocrImages(images: { page: number; png: Buffer }[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!images.length) return out;
  const { createWorker } = await import("tesseract.js");
  // Language data is downloaded once and cached outside the app directory.
  const worker = await createWorker(["vie", "eng"], 1, { cachePath: path.join(tmpdir(), "codi-tesseract") });
  try {
    for (const img of images) {
      const { data } = await worker.recognize(img.png);
      out.set(img.page, squash(data.text || ""));
    }
  } finally {
    await worker.terminate();
  }
  return out;
}

// unpdf's bundled serverless PDF.js has no JBIG2 / JPEG 2000 decoders, which scanned PDFs use, so the full
// pdfjs-dist build is used with its WebAssembly decoders.
const PDFJS_WASM_DIR = path.join(path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")), "wasm").replace(/\\/g, "/") + "/";
let pdfjsReady: Promise<void> | null = null;

async function extractPdf(file: string) {
  const { definePDFJSModule, extractText, getDocumentProxy, renderPageAsImage } = await import("unpdf");
  pdfjsReady ??= definePDFJSModule(() => import("pdfjs-dist/legacy/build/pdf.mjs"));
  await pdfjsReady;
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(await readFile(file)), { wasmUrl: PDFJS_WASM_DIR, verbosity: 0 });
  } catch (error) {
    console.error("[lesson-source] PDF open failed", error);
    throw new LessonMediaError("Không mở được tệp PDF (tệp hỏng hoặc có mật khẩu).", 422);
  }
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = text.map(squash);
  const empty = pages.map((t, i) => (t.length < OCR_MIN_CHARS ? i + 1 : 0)).filter(Boolean);
  const warnings: string[] = [];
  const toOcr = empty.slice(0, OCR_MAX_PAGES);
  if (empty.length > toOcr.length) warnings.push(`Có ${empty.length} trang dạng ảnh; AI chỉ nhận dạng chữ (OCR) ${toOcr.length} trang đầu.`);
  let ocrPages = 0;
  if (toOcr.length) {
    try {
      const images = [];
      for (const page of toOcr) {
        const png = await renderPageAsImage(pdf, page, { canvasImport: () => import("@napi-rs/canvas"), scale: 2 });
        images.push({ page, png: Buffer.from(png) });
      }
      const read = await ocrImages(images);
      for (const [page, t] of read) {
        if (t.length > (pages[page - 1] || "").length) { pages[page - 1] = t; ocrPages += 1; }
      }
    } catch (error) {
      console.error("[lesson-source] OCR failed", error);
      warnings.push("Chưa nhận dạng được chữ trên các trang dạng ảnh (OCR lỗi).");
    }
  }
  const body = pages.map((t, i) => (t ? `--- Trang ${i + 1} ---\n${t}` : "")).filter(Boolean).join("\n\n");
  return { pages: totalPages, ocrPages, text: body, outline: uniq(pages.map(firstLine)).slice(0, 12), warnings };
}

// ───────────────────────── PPTX / DOCX ─────────────────────────
function unzip(buf: Buffer, filter: (name: string) => boolean) {
  try {
    return unzipSync(new Uint8Array(buf), { filter: (f) => filter(f.name) });
  } catch {
    throw new LessonMediaError("Không mở được tệp Office (tệp hỏng hoặc có mật khẩu).", 422);
  }
}

async function extractPptx(file: string) {
  const files = unzip(await readFile(file), (n) => /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(n));
  const num = (n: string) => Number(/(\d+)\.xml$/.exec(n)![1]);
  const slides = Object.keys(files).filter((n) => n.startsWith("ppt/slides/")).sort((a, b) => num(a) - num(b));
  const texts = slides.map((name) => {
    const paras = strFromU8(files[name]!).split("</a:p>").map((p) => xmlText([...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(""))).map((x) => x.trim()).filter(Boolean);
    const notesXml = files[`ppt/notesSlides/notesSlide${num(name)}.xml`];
    const notes = notesXml ? xmlText([...strFromU8(notesXml).matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" ")).trim() : "";
    return { title: paras[0] || "", body: paras.join("\n") + (notes ? `\nGhi chú của giảng viên: ${notes}` : "") };
  });
  return {
    pages: slides.length, ocrPages: 0,
    text: texts.map((t, i) => `--- Slide ${i + 1} ---\n${t.body}`).join("\n\n"),
    outline: uniq(texts.map((t) => t.title.slice(0, 100))).slice(0, 12),
    warnings: texts.some((t) => t.body.trim()) ? [] : ["Slide không có chữ (có thể toàn hình ảnh); AI không có gì để đọc."],
  };
}

async function extractDocx(file: string) {
  const files = unzip(await readFile(file), (n) => n === "word/document.xml");
  const xml = files["word/document.xml"] ? strFromU8(files["word/document.xml"]) : "";
  const paras = xml.split("</w:p>").map((p) => ({
    heading: /<w:pStyle w:val="(Heading|Title|u)\w*"/i.test(p),
    text: xmlText([...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("")).trim(),
  })).filter((p) => p.text);
  const headings = paras.filter((p) => p.heading).map((p) => p.text.slice(0, 100));
  return {
    pages: null, ocrPages: 0, text: paras.map((p) => (p.heading ? `## ${p.text}` : p.text)).join("\n"),
    outline: uniq(headings.length ? headings : paras.slice(0, 12).map((p) => p.text.slice(0, 100))).slice(0, 12), warnings: [],
  };
}

// ───────────────────────── video ─────────────────────────
// Whisper writes text over silence and music: a segment that is both likely silence and low-confidence is dropped.
const SUBTITLE_CREDIT_RE = /subtitles?\s+by|amara\.org|ghiền mì gõ|hãy subscribe cho kênh|đăng ký kênh/i;
type WhisperSegment = { start: number; end: number; text: string; no_speech_prob?: number; avg_logprob?: number };

async function transcribe(audio: Buffer): Promise<WhisperSegment[]> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${ENV.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw Object.assign(new Error(`Whisper ${res.status}: ${detail.slice(0, 300)}`), { status: res.status });
  }
  const data = (await res.json()) as { segments?: WhisperSegment[] };
  return (data.segments || []).filter((s) => !(
    (s.no_speech_prob ?? 0) > 0.6 && (s.avg_logprob ?? 0) < -1) && !SUBTITLE_CREDIT_RE.test(s.text || "") && (s.text || "").trim());
}

async function extractAudio(file: string): Promise<Buffer | null> {
  const out = path.join(tmpdir(), `codi-audio-${randomUUID()}.mp3`);
  try {
    for (const bitrate of ["48k", "24k"]) {
      await run(FFMPEG(), ["-y", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-b:a", bitrate, "-f", "mp3", out], 600_000);
      const buf = await readFile(out);
      if (buf.length <= WHISPER_MAX_BYTES) return buf;
    }
    return null;
  } catch (error) {
    // No audio track: ffmpeg fails with "does not contain any stream".
    if (!/does not contain any stream|Output file .* does not contain/i.test(String(error))) console.error("[lesson-source] audio extraction failed", error);
    return null;
  } finally {
    await rm(out, { force: true });
  }
}

async function extractFrames(file: string, duration: number) {
  const count = Math.max(4, Math.min(12, Math.round(duration / 45)));
  const frames: { sec: number; jpeg: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    const sec = Math.round(((i + 0.5) * duration) / count);
    try {
      const jpeg = await run(FFMPEG(), ["-ss", String(sec), "-i", file, "-frames:v", "1", "-vf", "scale=768:-2", "-q:v", "5", "-f", "image2", "-c:v", "mjpeg", "pipe:1"], 60_000);
      if (jpeg.length) frames.push({ sec, jpeg });
    } catch (error) {
      console.error("[lesson-source] frame extraction failed at", sec, error);
    }
  }
  return frames;
}

async function extractVideo(upload: StoredUpload) {
  const duration = upload.durationSeconds ?? (await probeDuration(upload.path));
  if (!duration) throw new LessonMediaError("Không đọc được video. Máy chủ cần ffmpeg, hoặc tệp video bị hỏng.", 422);
  if (duration > VIDEO_MAX_SECONDS) throw new LessonMediaError("AI chỉ xử lý video dài tối đa 2 giờ. Hãy chia video thành nhiều bài.", 422);
  const warnings: string[] = [];
  const frames = await extractFrames(upload.path, duration);
  let segments: WhisperSegment[] = [];
  if (!ENV.OPENAI_API_KEY) {
    warnings.push("Máy chủ chưa có OPENAI_API_KEY nên không chép lời (Whisper) được; AI chỉ dựa vào khung hình.");
  } else {
    const audio = await extractAudio(upload.path);
    if (!audio) warnings.push("Video không có âm thanh đọc được; AI chỉ dựa vào khung hình.");
    else {
      try {
        segments = await transcribe(audio);
      } catch (error) {
        console.error("[lesson-source] Whisper failed", error);
        const status = (error as { status?: number }).status;
        if (status === 429) throw new LessonMediaError("Dịch vụ chép lời đang quá tải. Đợi một lúc rồi thử lại.", 429);
        warnings.push("Chưa chép lời được video (Whisper lỗi); AI chỉ dựa vào khung hình.");
      }
    }
    if (audio && !segments.length && !warnings.length) warnings.push("Không nghe thấy lời giảng trong video; AI chỉ dựa vào khung hình.");
  }
  if (!frames.length && !segments.length) throw new LessonMediaError("Không lấy được khung hình hay lời giảng nào từ video.", 422);
  const lines = segments.map((s) => `[${clock(s.start)}] ${s.text.trim()}`);
  const step = Math.max(1, Math.ceil(lines.length / 8));
  return {
    pages: null, ocrPages: 0, durationSec: Math.round(duration), frames, speech: segments.length > 0,
    text: lines.join("\n"), outline: lines.filter((_, i) => i % step === 0).map((l) => l.slice(0, 110)).slice(0, 8), warnings,
  };
}

export async function extractSource(upload: StoredUpload): Promise<ExtractedSource> {
  const base = { kind: upload.kind, fileName: upload.fileName, durationSec: null, frames: [], speech: false };
  if (upload.kind === "video") return { ...base, ...(await extractVideo(upload)), kind: "video", fileName: upload.fileName };
  const doc = upload.kind === "pdf" ? await extractPdf(upload.path) : upload.kind === "pptx" ? await extractPptx(upload.path) : await extractDocx(upload.path);
  if (!doc.text.trim()) {
    throw new LessonMediaError(upload.kind === "pdf"
      ? "Không đọc được chữ trong tệp, kể cả bằng OCR. Hãy tải bản PDF rõ nét hơn hoặc tệp PPTX/DOCX."
      : "Tệp không có nội dung chữ để AI đọc.", 422);
  }
  return { ...base, ...doc };
}
