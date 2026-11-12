// What the grading assistant reads besides the learner's typed answer: the assignment lesson's video transcripts and
// the closest course passages (courseContext), plus the learner's submitted file and link. Every file passes
// submission-file-safety before it is read, every link goes through safe-link-fetch, and anything that cannot be read
// becomes a source marked "skipped" with the reason, never an error. All of it is untrusted data for the prompt.
//
// Security scan step: every learner-controlled source gets a `security` verdict the lecturer sees (safe / blocked /
// suspicious). Files and links are judged while they are read (blocked ones are never read); `scanGradingInputs`
// then sanitises all extracted learner text and flags suspected prompt injection before anything reaches the model.
//
// Time budget: reading stops after GATHER_BUDGET_MS so a slow extra (OCR of a scanned PDF, a slow link or YouTube)
// is skipped with a warning instead of pushing the whole request past the reverse proxy's timeout. The model call
// (45 s) comes after, so the worst case stays near 90 s.
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { lessonMaterials } from "@codi-1/db/schema/course-content";
import { courseContext } from "@/lib/course-context";
import { clock, extractSource } from "@/lib/lesson-source-extraction";
import { LessonMediaError, type StoredUpload } from "@/lib/lesson-media";
import { lessonTranscript } from "@/lib/lesson-player-contract";
import { scanPromptInjection } from "@/lib/prompt-injection-scan";
import { fetchPublicText, LINK_TIMEOUT_MS } from "@/lib/safe-link-fetch";
import { inspectSubmissionFile, MAX_INSPECT_BYTES } from "@/lib/submission-file-safety";
import { youtubeId, youtubeTranscript } from "@/lib/youtube-transcript";

const TRANSCRIPT_BUDGET = 6_000;
const FILE_BUDGET = 12_000;
const LINK_BUDGET = 6_000;
const CONTEXT_QUERY_ANSWER_CHARS = 500;
const YOUTUBE_TIMEOUT_MS = 20_000;
/** Total time for reading lesson context, the file and the link, before the model call. */
export const GATHER_BUDGET_MS = 40_000;
const MIN_STEP_MS = 1_500;
const TMP_DIR = path.join(tmpdir(), "codi-grading");
export const ANSWER_SOURCE = "Bài làm (văn bản / code)";

export type GradingSource = {
  kind: "transcript" | "lesson" | "file" | "link";
  label: string;
  status: "read" | "skipped";
  detail?: string;
};
/** Result of the security scan for one learner-controlled source. */
export type SecurityCheck = {
  source: string;
  kind: "file" | "link" | "text";
  verdict: "safe" | "blocked" | "suspicious";
  reasons: string[];
  snippets: string[];
};
export type GradingMaterial = {
  lessonContext: { lesson: string; source: string; text: string }[];
  transcripts: { title: string; text: string }[];
  attachments: { kind: "file" | "link"; label: string; text: string }[];
  images: { label: string; mime: string; data: Uint8Array }[];
  sources: GradingSource[];
  warnings: string[];
  security: SecurityCheck[];
};
export type SubmissionFileReader = (key: string) => Promise<{ body: ReadableStream; size?: number }>;

export const emptyGradingMaterial = (): GradingMaterial =>
  ({ lessonContext: [], transcripts: [], attachments: [], images: [], sources: [], warnings: [], security: [] });

export const clipTo = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}\n[…phần sau đã được lược bớt]` : text;

const TIMED_OUT = Symbol("timed out");
/** `work`, or TIMED_OUT once the deadline passes (the work is abandoned; its late result or error is ignored). */
export async function withinDeadline<T>(work: Promise<T>, deadline: number): Promise<T | typeof TIMED_OUT> {
  const left = deadline - Date.now();
  if (left <= 0) { work.catch(() => {}); return TIMED_OUT; }
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), left); });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
const overBudget = (budgetMs: number) => `hết thời gian đọc (giới hạn ${Math.round(budgetMs / 1000)} giây cho phần đọc thêm), AI chấm phần còn lại`;

/** Up to `max + 1` bytes of a stream (one more than allowed tells the caller it is too big). */
async function readUpTo(body: ReadableStream, max: number): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value as Uint8Array;
    chunks.push(chunk);
    size += chunk.byteLength;
    if (size > max) { await reader.cancel().catch(() => {}); break; }
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

async function lessonTranscripts(db: Database, lessonId: string, out: GradingMaterial) {
  const videos = await db.select({ title: lessonMaterials.title, transcript: lessonMaterials.transcript })
    .from(lessonMaterials).where(and(eq(lessonMaterials.lessonId, lessonId), eq(lessonMaterials.type, "video")))
    .orderBy(asc(lessonMaterials.position));
  let budget = TRANSCRIPT_BUDGET;
  for (const v of videos) {
    const cues = lessonTranscript(v.transcript);
    if (!cues) {
      out.sources.push({ kind: "transcript", label: v.title, status: "skipped", detail: "video chưa có transcript" });
      continue;
    }
    if (budget <= 0) {
      out.sources.push({ kind: "transcript", label: v.title, status: "skipped", detail: "đã đủ dung lượng transcript" });
      continue;
    }
    const text = clipTo(cues.map((c) => `[${clock(c.start)}] ${c.text}`).join("\n"), budget);
    budget -= text.length;
    out.transcripts.push({ title: v.title, text });
    out.sources.push({ kind: "transcript", label: v.title, status: "read" });
  }
}

async function lessonPassages(db: Database, courseId: string, query: string, out: GradingMaterial) {
  const context = await courseContext(db, courseId, query, { limit: 4 });
  if (context.status === "ok") {
    out.lessonContext = context.hits.map((hit) => ({ lesson: hit.lessonTitle, source: hit.sourceTitle, text: hit.content }));
    for (const hit of context.hits) out.sources.push({ kind: "lesson", label: hit.sourceTitle, status: "read" });
    return;
  }
  const detail = context.status === "no_match" ? "không có đoạn bài học liên quan"
    : context.reason === "not_indexed" ? "khoá học chưa được lập chỉ mục cho AI"
      : context.reason === "not_configured" ? "chưa cấu hình tìm kiếm nội dung" : "tìm kiếm nội dung lỗi";
  out.sources.push({ kind: "lesson", label: "Đoạn bài học liên quan", status: "skipped", detail });
}

async function extractDocument(name: string, kind: "pdf" | "docx" | "pptx", ext: string, mime: string, bytes: Uint8Array) {
  await mkdir(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, `${randomUUID()}.${ext}`);
  await writeFile(file, bytes);
  try {
    const upload: StoredUpload = {
      id: randomUUID(), userId: "system:grading", courseId: "", path: file, fileName: name, ext, kind,
      material: kind === "pdf" ? "pdf" : kind === "pptx" ? "slide" : "document", mime, size: bytes.byteLength,
      durationSeconds: null, key: null, expiresAt: Date.now() + 60_000,
    };
    return await extractSource(upload);
  } finally {
    await rm(file, { force: true }).catch(() => {});
  }
}

async function submittedFile(file: { key: string; name: string }, read: SubmissionFileReader, out: GradingMaterial, deadline: number, budgetMs: number) {
  const label = file.name;
  const skip = (detail: string) => {
    out.sources.push({ kind: "file", label, status: "skipped", detail });
    out.warnings.push(`Không đọc tệp "${label}": ${detail}.`);
  };
  if (!file.key.startsWith("assignments/")) return skip("tệp không nằm trong kho bài nộp");
  const loaded = await withinDeadline((async () => {
    const object = await read(file.key);
    if (object.size !== undefined && object.size > MAX_INSPECT_BYTES) {
      await object.body.cancel().catch(() => {});
      return "too-big" as const;
    }
    return readUpTo(object.body, MAX_INSPECT_BYTES);
  })().catch(() => null), deadline);
  if (loaded === TIMED_OUT) return skip(overBudget(budgetMs));
  if (loaded === "too-big") return skip("tệp vượt quá 20 MB");
  if (!loaded) return skip("chưa tải được tệp từ kho lưu trữ");
  const bytes = loaded;
  const verdict = inspectSubmissionFile(file.name, bytes);
  if (verdict.security) out.security.push({ source: label, kind: "file", ...verdict.security });
  if (!verdict.ok) return skip(verdict.reason);
  if (verdict.kind === "image") {
    out.images.push({ label, mime: verdict.mime, data: bytes });
    out.sources.push({ kind: "file", label, status: "read", detail: "ảnh" });
    return;
  }
  let text: string;
  if (verdict.kind === "text") text = new TextDecoder("utf-8").decode(bytes);
  else {
    if (deadline - Date.now() < MIN_STEP_MS) return skip(overBudget(budgetMs));
    const extracted = await withinDeadline(
      extractDocument(file.name, verdict.kind, verdict.ext, verdict.mime, bytes).then((r) => ({ ok: true as const, r }), (error: unknown) => ({ ok: false as const, error })),
      deadline,
    );
    if (extracted === TIMED_OUT) return skip(overBudget(budgetMs));
    if (!extracted.ok) {
      return skip(extracted.error instanceof LessonMediaError ? extracted.error.message.replace(/\.$/, "") : "không trích được nội dung");
    }
    text = extracted.r.text;
    for (const w of extracted.r.warnings) out.warnings.push(`Tệp "${label}": ${w}`);
  }
  if (!text.trim()) return skip("tệp không có nội dung chữ");
  out.attachments.push({ kind: "file", label, text: clipTo(text.trim(), FILE_BUDGET) });
  out.sources.push({ kind: "file", label, status: "read", detail: text.length > FILE_BUDGET ? "đã lược bớt phần cuối" : undefined });
}

async function submittedLink(link: string, out: GradingMaterial, deadline: number, budgetMs: number) {
  const skip = (detail: string) => {
    out.sources.push({ kind: "link", label: link, status: "skipped", detail });
    out.warnings.push(`Không đọc đường dẫn ${link}: ${detail}.`);
  };
  const left = deadline - Date.now();
  if (left < MIN_STEP_MS) return skip(overBudget(budgetMs));
  if (youtubeId(link)) {
    const transcript = await withinDeadline(youtubeTranscript(link).catch(() => null), Date.now() + Math.min(YOUTUBE_TIMEOUT_MS, left));
    if (transcript === TIMED_OUT || !transcript) return skip("chưa lấy được lời thoại của video YouTube");
    out.security.push({ source: link, kind: "link", verdict: "safe", reasons: [], snippets: [] });
    out.attachments.push({ kind: "link", label: link, text: clipTo(transcript, LINK_BUDGET) });
    out.sources.push({ kind: "link", label: link, status: "read", detail: "lời thoại video YouTube" });
    return;
  }
  const page = await fetchPublicText(link, { timeoutMs: Math.min(LINK_TIMEOUT_MS, left) });
  if (!page.ok) {
    if (page.blocked) out.security.push({ source: link, kind: "link", verdict: "blocked", reasons: [page.reason], snippets: [] });
    return skip(page.reason);
  }
  out.security.push({ source: link, kind: "link", verdict: "safe", reasons: [], snippets: [] });
  out.attachments.push({ kind: "link", label: link, text: clipTo(page.text, LINK_BUDGET) });
  out.sources.push({ kind: "link", label: link, status: "read", detail: page.finalUrl !== link ? `đọc từ ${page.finalUrl}` : undefined });
}

/** Everything the grading draft may read for one submission. Never throws for an unreadable source. */
export async function gatherGradingMaterial(db: Database, input: {
  courseId: string;
  lessonId: string | null;
  instructions: string | null;
  answerText: string;
  file: { key: string; name: string } | null;
  link: string | null;
  readFile: SubmissionFileReader;
  /** Overall reading budget; defaults to GATHER_BUDGET_MS. */
  budgetMs?: number;
}): Promise<GradingMaterial> {
  const budgetMs = input.budgetMs ?? GATHER_BUDGET_MS;
  const deadline = Date.now() + budgetMs;
  const out = emptyGradingMaterial();
  if (input.lessonId) {
    const lessonId = input.lessonId;
    const query = [input.instructions ?? "", input.answerText.slice(0, CONTEXT_QUERY_ANSWER_CHARS)].join("\n").trim();
    // Lesson context is written to its own object and merged only when it finished in time.
    const lesson = emptyGradingMaterial();
    const done = await withinDeadline(Promise.all([
      lessonTranscripts(db, lessonId, lesson).catch(() => { lesson.sources.push({ kind: "transcript", label: "Transcript bài học", status: "skipped", detail: "không đọc được" }); }),
      query
        ? lessonPassages(db, input.courseId, query, lesson).catch(() => { lesson.sources.push({ kind: "lesson", label: "Đoạn bài học liên quan", status: "skipped", detail: "tìm kiếm nội dung lỗi" }); })
        : Promise.resolve(),
    ]), deadline);
    if (done === TIMED_OUT) out.sources.push({ kind: "lesson", label: "Nội dung bài học", status: "skipped", detail: overBudget(budgetMs) });
    else {
      out.transcripts = lesson.transcripts;
      out.lessonContext = lesson.lessonContext;
      out.sources.push(...lesson.sources);
    }
  }
  if (input.file) await submittedFile(input.file, input.readFile, out, deadline, budgetMs);
  if (input.link?.trim()) await submittedLink(input.link.trim(), out, deadline, budgetMs);
  return out;
}

/** True when the material adds anything to the prompt (otherwise the request stays exactly as before). */
export const hasGradingMaterial = (m: GradingMaterial) =>
  m.lessonContext.length + m.transcripts.length + m.attachments.length + m.images.length > 0;

const VERDICT_RANK = { safe: 0, suspicious: 1, blocked: 2 } as const;

/**
 * The explicit security step before the model call: sanitises the typed answer and every extracted file / link
 * text (invisible and bidi characters removed) and flags suspected prompt injection. Returns the cleaned inputs,
 * the security list the lecturer sees (one entry per learner-controlled source) and the labels the prompt must
 * treat as suspect. Lesson content written by the lecturer is not scanned.
 */
export function scanGradingInputs(answerText: string, material?: GradingMaterial): {
  answerText: string;
  material?: GradingMaterial;
  security: SecurityCheck[];
  suspects: { source: string; reasons: string[] }[];
} {
  const security: SecurityCheck[] = (material?.security ?? []).map((s) => ({ ...s, reasons: [...s.reasons], snippets: [...s.snippets] }));
  const flag = (source: string, kind: SecurityCheck["kind"], reasons: string[], snippets: string[]) => {
    let entry = security.find((s) => s.source === source && s.kind === kind);
    if (!entry) { entry = { source, kind, verdict: "safe", reasons: [], snippets: [] }; security.push(entry); }
    if (reasons.length && VERDICT_RANK[entry.verdict] < VERDICT_RANK.suspicious) entry.verdict = "suspicious";
    for (const r of reasons) if (!entry.reasons.includes(r)) entry.reasons.push(r);
    for (const s of snippets) if (entry.snippets.length < 3 && !entry.snippets.includes(s)) entry.snippets.push(s);
  };
  let cleanAnswer = answerText;
  if (answerText.trim()) {
    const scan = scanPromptInjection(answerText);
    cleanAnswer = scan.text;
    flag(ANSWER_SOURCE, "text", scan.reasons, scan.snippets);
  }
  const cleanMaterial = material && {
    ...material,
    attachments: material.attachments.map((a) => {
      const scan = scanPromptInjection(a.text);
      flag(a.label, a.kind, scan.reasons, scan.snippets);
      return { ...a, text: scan.text };
    }),
  };
  const suspects = security.filter((s) => s.verdict === "suspicious").map((s) => ({ source: s.source, reasons: s.reasons }));
  return { answerText: cleanAnswer, material: cleanMaterial, security, suspects };
}
