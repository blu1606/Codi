// Lecture media the lecturer uploads (video, PDF, PPTX, DOCX): streamed to a temp file, checked by extension and
// magic bytes, stored in the R2 media bucket and served back through GET /api/lesson-media (Range requests, so
// videos can seek). The temp copy is kept for an hour so the AI import can read it without downloading it again.
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { ENV } from "@/env";
import { getR2Client, R2_BUCKET } from "@/lib/storage";

export class LessonMediaError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type MediaKind = "video" | "pdf" | "pptx" | "docx";
export type MaterialType = "video" | "pdf" | "slide" | "document";

type FileType = { kind: MediaKind; material: MaterialType; mime: string };
const FILE_TYPES: Record<string, FileType> = {
  mp4: { kind: "video", material: "video", mime: "video/mp4" },
  m4v: { kind: "video", material: "video", mime: "video/mp4" },
  mov: { kind: "video", material: "video", mime: "video/quicktime" },
  webm: { kind: "video", material: "video", mime: "video/webm" },
  mkv: { kind: "video", material: "video", mime: "video/x-matroska" },
  pdf: { kind: "pdf", material: "pdf", mime: "application/pdf" },
  pptx: { kind: "pptx", material: "slide", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  docx: { kind: "docx", material: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
};
export const MEDIA_EXTENSIONS = Object.keys(FILE_TYPES);
const MB = 1024 * 1024;
export const MAX_UPLOAD_BYTES: Record<MediaKind, number> = { video: 500 * MB, pdf: 50 * MB, pptx: 50 * MB, docx: 50 * MB };
// Keys this module writes; the serving route refuses anything else in the bucket (avatars keep their own route).
const KEY_RE = /^lesson-media\/[A-Za-z0-9_-]{1,80}\/[0-9a-f-]{36}\.([a-z0-9]{2,5})$/;

export function fileTypeOf(fileName: string): FileType & { ext: string } {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const type = FILE_TYPES[ext];
  if (!type) throw new LessonMediaError("Chỉ nhận video (MP4, MOV, WEBM, MKV), PDF, PPTX hoặc DOCX.", 415);
  return { ...type, ext };
}

/** True when the first bytes match the format the extension claims (a renamed file is refused). */
export function magicMatches(kind: MediaKind, ext: string, head: Buffer): boolean {
  if (kind === "pdf") return head.subarray(0, 5).toString("latin1") === "%PDF-";
  if (kind === "pptx" || kind === "docx") return head[0] === 0x50 && head[1] === 0x4b; // "PK" zip
  if (ext === "webm" || ext === "mkv") return head.readUInt32BE(0) === 0x1a45dfa3; // EBML
  return head.subarray(4, 8).toString("latin1") === "ftyp"; // MP4 / MOV / M4V
}

const TMP_ROOT = path.join(tmpdir(), "codi-lesson-media");
const TTL_MS = 60 * 60 * 1000;

export type StoredUpload = {
  id: string; userId: string; courseId: string; path: string; fileName: string; ext: string; kind: MediaKind;
  material: MaterialType; mime: string; size: number; durationSeconds: number | null; key: string | null; expiresAt: number;
};
const uploads = new Map<string, StoredUpload>();

async function sweep() {
  const now = Date.now();
  for (const [id, u] of uploads) {
    if (u.expiresAt < now) { uploads.delete(id); await rm(u.path, { force: true }).catch(() => {}); }
  }
  // Files left behind by a previous process.
  const names = await readdir(TMP_ROOT).catch(() => [] as string[]);
  for (const name of names) {
    const file = path.join(TMP_ROOT, name);
    const s = await stat(file).catch(() => null);
    if (s && now - s.mtimeMs > TTL_MS && ![...uploads.values()].some((u) => u.path === file)) await rm(file, { force: true, recursive: true }).catch(() => {});
  }
}
setInterval(() => { sweep().catch(() => {}); }, 10 * 60 * 1000).unref();

/** Streams the raw request body into a temp file, refusing it past maxBytes. */
async function receiveBody(request: Request, file: string, maxBytes: number): Promise<number> {
  if (!request.body) throw new LessonMediaError("Chưa có tệp nào được gửi lên.", 400);
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw tooLarge(maxBytes);
  let size = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _enc, done) {
      size += chunk.length;
      done(size > maxBytes ? tooLarge(maxBytes) : null, chunk);
    },
  });
  await mkdir(TMP_ROOT, { recursive: true });
  try {
    await pipeline(Readable.fromWeb(request.body as import("node:stream/web").ReadableStream), limit, createWriteStream(file));
  } catch (error) {
    await rm(file, { force: true });
    throw error instanceof LessonMediaError ? error : new LessonMediaError("Tải tệp lên bị gián đoạn. Vui lòng thử lại.", 400);
  }
  if (!size) { await rm(file, { force: true }); throw new LessonMediaError("Tệp rỗng.", 400); }
  return size;
}
const tooLarge = (max: number) => new LessonMediaError(`Tệp vượt quá ${Math.round(max / MB)}MB.`, 413);

async function readHead(file: string): Promise<Buffer> {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(16);
    await fh.read(buf, 0, 16, 0);
    return buf;
  } finally {
    await fh.close();
  }
}

export const FFMPEG = () => process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE = () => process.env.FFPROBE_PATH || "ffprobe";

/** Runs a binary and returns stdout; rejects with stderr on a non-zero exit. */
export function run(bin: string, args: string[], timeoutMs = 120_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = []; const err: Buffer[] = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => { if (err.length < 64) err.push(d); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${path.basename(bin)} exited with ${code}: ${Buffer.concat(err).toString().slice(-500)}`));
    });
  });
}

/** Media length in seconds (ffprobe), or null when ffprobe is missing or cannot read the file. */
export async function probeDuration(file: string): Promise<number | null> {
  try {
    const out = await run(FFPROBE(), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], 30_000);
    const sec = Number.parseFloat(out.toString().trim());
    return Number.isFinite(sec) && sec > 0 ? sec : null;
  } catch (error) {
    console.error("[lesson-media] ffprobe failed", error);
    return null;
  }
}

export function mediaUrl(key: string) {
  const publicUrl = ENV.R2_PUBLIC_URL;
  if (publicUrl && !publicUrl.includes(".r2.cloudflarestorage.com")) return `${publicUrl.replace(/\/$/, "")}/${key}`;
  return `/api/lesson-media?key=${encodeURIComponent(key)}`;
}

/** The R2 key behind a URL this module produced, or null for any other URL (YouTube, external links). */
export function keyFromMediaUrl(url: string): string | null {
  const raw = String(url || "").trim();
  let key: string | null = null;
  const local = /^\/api\/lesson-media\?key=([^&#]+)/.exec(raw);
  if (local) key = decodeURIComponent(local[1]!);
  const publicUrl = ENV.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!key && publicUrl && raw.startsWith(publicUrl + "/")) key = raw.slice(publicUrl.length + 1);
  return key && KEY_RE.test(key) ? key : null;
}

/**
 * Receives one upload for a course the caller owns: temp file + R2 object. A storage failure keeps the temp copy
 * (the AI import still works) and is reported as storageError instead of failing the upload.
 */
export async function receiveLessonUpload(request: Request, input: { userId: string; courseId: string; fileName: string }) {
  const fileName = path.basename(input.fileName || "").slice(0, 200);
  if (!fileName) throw new LessonMediaError("Thiếu tên tệp.", 400);
  const type = fileTypeOf(fileName);
  const id = randomUUID();
  const file = path.join(TMP_ROOT, `${id}.${type.ext}`);
  const size = await receiveBody(request, file, MAX_UPLOAD_BYTES[type.kind]);
  if (!magicMatches(type.kind, type.ext, await readHead(file))) {
    await rm(file, { force: true });
    throw new LessonMediaError(`Nội dung tệp không phải ${type.ext.toUpperCase()} hợp lệ.`, 415);
  }
  const durationSeconds = type.kind === "video" ? await probeDuration(file) : null;

  let key: string | null = `lesson-media/${input.courseId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || "course"}/${id}.${type.ext}`;
  let storageError: string | null = null;
  const client = getR2Client();
  if (!client) {
    key = null; storageError = "Kho lưu trữ tệp (R2) chưa được cấu hình nên tệp chưa đính kèm được vào bài; AI vẫn đọc được tệp.";
  } else {
    try {
      await client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: createReadStream(file), ContentLength: size, ContentType: type.mime }));
    } catch (error) {
      console.error("[lesson-media] R2 upload failed", error);
      key = null; storageError = "Chưa lưu được tệp lên kho lưu trữ nên chưa đính kèm được vào bài; AI vẫn đọc được tệp.";
    }
  }
  const upload: StoredUpload = { id, userId: input.userId, courseId: input.courseId, path: file, fileName, ext: type.ext, kind: type.kind,
    material: type.material, mime: type.mime, size, durationSeconds, key, expiresAt: Date.now() + TTL_MS };
  uploads.set(id, upload);
  return {
    upload: { id, fileName, kind: type.kind, sizeKb: Math.max(1, Math.round(size / 1024)), durationSeconds: durationSeconds ? Math.round(durationSeconds) : null },
    material: key ? { type: type.material, title: path.parse(fileName).name.slice(0, 200), url: mediaUrl(key),
      fileSizeKb: Math.max(1, Math.round(size / 1024)), durationSeconds: durationSeconds ? Math.round(durationSeconds) : undefined } : null,
    storageError,
  };
}

/** A previous upload of this user and course whose temp file still exists. */
export async function findUpload(id: string, userId: string, courseId: string): Promise<StoredUpload | null> {
  const u = uploads.get(id);
  if (!u || u.userId !== userId || u.courseId !== courseId || u.expiresAt < Date.now()) return null;
  if (!(await stat(u.path).catch(() => null))) { uploads.delete(id); return null; }
  return u;
}

/** Copies a stored lesson material (by its media URL) to a temp file so the AI import can read it. */
export async function fetchStoredMaterial(url: string, input: { userId: string; courseId: string; fileName?: string }): Promise<StoredUpload> {
  const key = keyFromMediaUrl(url);
  if (!key) throw new LessonMediaError("AI chỉ đọc được tệp đã tải lên Codi. Với video YouTube hoặc đường dẫn ngoài, hãy tải tệp gốc lên.", 400);
  if (!key.startsWith(`lesson-media/${input.courseId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80)}/`)) {
    throw new LessonMediaError("Tệp này không thuộc khoá học đang soạn.", 403);
  }
  const type = fileTypeOf(key);
  for (const u of uploads.values()) {
    if (u.key === key && u.courseId === input.courseId && (await stat(u.path).catch(() => null))) return u;
  }
  const client = getR2Client();
  if (!client) throw new LessonMediaError("Kho lưu trữ tệp (R2) chưa được cấu hình.", 503);
  const id = randomUUID();
  const file = path.join(TMP_ROOT, `${id}.${type.ext}`);
  await mkdir(TMP_ROOT, { recursive: true });
  try {
    const obj = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    if (!obj.Body) throw new Error("empty body");
    await pipeline(obj.Body as Readable, createWriteStream(file));
  } catch (error) {
    console.error("[lesson-media] R2 download failed", error);
    await rm(file, { force: true });
    throw new LessonMediaError("Không tải được tệp từ kho lưu trữ. Vui lòng thử lại.", 502);
  }
  const size = (await stat(file)).size;
  const upload: StoredUpload = { id, userId: input.userId, courseId: input.courseId, path: file, fileName: input.fileName || path.basename(key),
    ext: type.ext, kind: type.kind, material: type.material, mime: type.mime, size,
    durationSeconds: type.kind === "video" ? await probeDuration(file) : null, key, expiresAt: Date.now() + TTL_MS };
  uploads.set(id, upload);
  return upload;
}

/** GET /api/lesson-media?key=…: streams the object, honouring a single byte Range so video players can seek. */
export async function serveLessonMedia(request: Request): Promise<Response> {
  const key = new URL(request.url).searchParams.get("key") || "";
  const match = KEY_RE.exec(key);
  const type = match ? FILE_TYPES[match[1]!] : undefined;
  if (!match || !type) return new Response(JSON.stringify({ error: "Không tìm thấy." }), { status: 404, headers: { "Content-Type": "application/json" } });
  const client = getR2Client();
  if (!client) return new Response(JSON.stringify({ error: "Kho lưu trữ chưa được cấu hình." }), { status: 503, headers: { "Content-Type": "application/json" } });
  const range = request.headers.get("range");
  try {
    const obj = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key, ...(range && /^bytes=\d*-\d*$/.test(range) ? { Range: range } : {}) }));
    if (!obj.Body) return new Response(null, { status: 404 });
    const headers = new Headers({
      "Content-Type": type.mime,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `${type.kind === "video" || type.kind === "pdf" ? "inline" : "attachment"}; filename="${path.basename(key)}"`,
      "X-Content-Type-Options": "nosniff",
    });
    if (obj.ContentLength != null) headers.set("Content-Length", String(obj.ContentLength));
    if (obj.ContentRange) headers.set("Content-Range", obj.ContentRange);
    return new Response(obj.Body.transformToWebStream(), { status: obj.ContentRange ? 206 : 200, headers });
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === 404) return new Response(JSON.stringify({ error: "Không tìm thấy." }), { status: 404, headers: { "Content-Type": "application/json" } });
    if (status === 416) return new Response(null, { status: 416 });
    console.error("[lesson-media] serve failed", error);
    return new Response(JSON.stringify({ error: "Không tải được tệp." }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
}
