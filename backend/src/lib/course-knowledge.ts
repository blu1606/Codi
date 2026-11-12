// Course knowledge store for the AI Tutor (RAG). The AI worker indexes one source per idle tick: a published lesson's
// text, one of its uploaded materials read the same way the AI lesson import reads them (PDF text + OCR, PPTX/DOCX
// text, video transcript), or a linked YouTube lecture's transcript. Text is chunked, embedded and stored as unit vectors in plain Postgres `real[]`, so search
// is a dot product in SQL scoped to one course — no pgvector needed at this size.
import { embed, embedMany, type EmbeddingModel } from "ai";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { courseKnowledgeChunks, courseKnowledgeSources } from "@codi-1/db/schema/course-knowledge";
import { ENV } from "@/env";
import { fetchStoredMaterial, keyFromMediaUrl, LessonMediaError } from "@/lib/lesson-media";
import { extractSource } from "@/lib/lesson-source-extraction";
import { youtubeId, youtubeTranscript } from "@/lib/youtube-transcript";

const DIMENSIONS = 768;
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;
const MAX_CHUNKS_PER_SOURCE = 300;
const INDEXER_USER = "system:course-knowledge";
// Part of every content hash: bump it when the way sources are read changes, so everything is indexed again.
const INDEX_VERSION = "2";

type Task = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
type EmbeddingConfig = {
  id: string;
  model: EmbeddingModel;
  options: (task: Task) => Record<string, Record<string, string | number>>;
};

/** The embedding model that matches AI_PROVIDER, or null when its API key is missing. */
export function embeddingConfig(): EmbeddingConfig | null {
  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  if (provider === "openai" && ENV.OPENAI_API_KEY) {
    return {
      id: `openai:text-embedding-3-small@${DIMENSIONS}`,
      model: openai.embedding("text-embedding-3-small"),
      options: () => ({ openai: { dimensions: DIMENSIONS } }),
    };
  }
  if (provider === "gemini" && ENV.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      id: `google:gemini-embedding-001@${DIMENSIONS}`,
      model: google.embedding("gemini-embedding-001"),
      options: (taskType) => ({ google: { outputDimensionality: DIMENSIONS, taskType } }),
    };
  }
  return null;
}

export function normalize(vector: number[]): number[] {
  const norm = Math.hypot(...vector);
  return norm ? vector.map((x) => x / norm) : vector;
}

/** Splits text into ~CHUNK_SIZE pieces, preferring line then word boundaries, with a small overlap. */
export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const clean = text.replace(/\r/g, "").trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + size);
    if (end < clean.length) {
      const line = clean.lastIndexOf("\n", end);
      const space = clean.lastIndexOf(" ", end);
      if (line > start + size / 2) end = line;
      else if (space > start + size / 2) end = space;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

type Candidate = {
  source_key: string;
  course_id: string;
  lesson_id: string;
  material_id: number | null;
  title: string;
  lesson_title: string;
  url: string | null;
  hash: string;
};

/** The next published lesson or uploaded material whose index is missing, outdated, or failed over an hour ago. */
async function nextPendingSource(db: Database, modelId: string): Promise<Candidate | null> {
  const result = await db.execute(sql`
    with published as (
      select c.id as course_id, l.id as lesson_id, l.title, l.description, l.body
      from course_lessons l
      join course_chapters ch on ch.id = l.chapter_id
      join courses c on c.id = ch.course_id
      where c.status = 'published' and ch.is_published and l.is_published
    ), candidates as (
      select 'lesson:' || p.lesson_id as source_key, p.course_id, p.lesson_id, null::bigint as material_id,
        p.title, p.title as lesson_title, null::text as url, 0 as priority,
        md5(${modelId} || E'\n' || p.title || E'\n' || coalesce(p.description, '') || E'\n' || coalesce(p.body, '')) as hash
      from published p
      union all
      select 'material:' || m.id, p.course_id, p.lesson_id, m.id, m.title, p.title, m.url, 1,
        md5(${modelId} || E'\n' || m.url)
      from lesson_materials m
      join published p on p.lesson_id = m.lesson_id
      where m.type <> 'link'
    )
    select cand.source_key, cand.course_id, cand.lesson_id, cand.material_id, cand.title, cand.lesson_title, cand.url, cand.hash
    from candidates cand
    left join course_knowledge_sources ks on ks.source_key = cand.source_key
    where ks.source_key is null
      or ks.content_hash <> cand.hash
      or (ks.status = 'failed' and ks.indexed_at < now() - interval '1 hour')
    order by cand.priority, cand.source_key
    limit 1
  `);
  const row = result.rows[0] as Candidate | undefined;
  return row ? { ...row, material_id: row.material_id === null ? null : Number(row.material_id) } : null;
}

type SourceText = { text: string; status: "ready" } | { text: ""; status: "skipped"; reason: string };

async function readSource(db: Database, source: Candidate): Promise<SourceText> {
  if (!source.material_id) {
    const [lesson] = await db.execute(sql`
      select title, description, body from course_lessons where id = ${source.lesson_id}
    `).then((r) => r.rows as { title: string; description: string | null; body: string | null }[]);
    const text = [`# ${lesson?.title ?? source.title}`, lesson?.description, lesson?.body].filter(Boolean).join("\n\n");
    return { text, status: "ready" };
  }
  if (source.url && youtubeId(source.url)) {
    const transcript = await youtubeTranscript(source.url);
    // Failed (not skipped): YouTube may refuse the server for a while, so it is retried later.
    if (!transcript) throw new LessonMediaError("Chưa lấy được phụ đề hay lời giảng của video YouTube.", 502);
    return { text: transcript, status: "ready" };
  }
  if (!source.url || !keyFromMediaUrl(source.url)) {
    return { text: "", status: "skipped", reason: "Đường dẫn ngoài không đọc được nội dung." };
  }
  const upload = await fetchStoredMaterial(source.url, { userId: INDEXER_USER, courseId: source.course_id, fileName: source.title });
  const extracted = await extractSource(upload);
  if (!extracted.text.trim()) {
    return { text: "", status: "skipped", reason: extracted.warnings.join(" ") || "Tài liệu không có nội dung chữ." };
  }
  return { text: extracted.text, status: "ready" };
}

async function saveSource(
  db: Database,
  source: Candidate,
  modelId: string,
  state: { status: "ready" | "failed" | "skipped"; error?: string; chunks?: { content: string; embedding: number[] }[] },
) {
  const chunks = state.chunks ?? [];
  const row = {
    sourceKey: source.source_key,
    courseId: source.course_id,
    lessonId: source.lesson_id,
    materialId: source.material_id,
    title: source.material_id ? `${source.lesson_title} · ${source.title}` : source.title,
    contentHash: source.hash,
    embeddingModel: modelId,
    status: state.status,
    error: state.error ?? null,
    chunkCount: chunks.length,
    indexedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    await tx.insert(courseKnowledgeSources).values(row)
      .onConflictDoUpdate({ target: courseKnowledgeSources.sourceKey, set: row });
    await tx.delete(courseKnowledgeChunks).where(eq(courseKnowledgeChunks.sourceKey, source.source_key));
    if (chunks.length) {
      await tx.insert(courseKnowledgeChunks).values(chunks.map((chunk, position) => ({
        sourceKey: source.source_key,
        courseId: source.course_id,
        lessonId: source.lesson_id,
        position,
        content: chunk.content,
        embedding: chunk.embedding,
      })));
    }
  });
}

/** Indexes one pending source. Returns true when it did work, so the AI worker keeps going without waiting. */
export async function indexNextKnowledgeSource(db: Database): Promise<boolean> {
  const config = embeddingConfig();
  if (!config) return false;
  const source = await nextPendingSource(db, `${config.id}#${INDEX_VERSION}`);
  if (!source) return false;
  try {
    // The same file or video linked from another lesson is not read (OCR, Whisper, Gemini) or embedded twice.
    const [twin] = await db.select({ sourceKey: courseKnowledgeSources.sourceKey }).from(courseKnowledgeSources)
      .where(and(eq(courseKnowledgeSources.contentHash, source.hash), eq(courseKnowledgeSources.status, "ready"),
        ne(courseKnowledgeSources.sourceKey, source.source_key)))
      .limit(1);
    if (twin) {
      const chunks = await db.select({ content: courseKnowledgeChunks.content, embedding: courseKnowledgeChunks.embedding })
        .from(courseKnowledgeChunks).where(eq(courseKnowledgeChunks.sourceKey, twin.sourceKey))
        .orderBy(asc(courseKnowledgeChunks.position));
      await saveSource(db, source, config.id, { status: "ready", chunks });
      return true;
    }
    const read = await readSource(db, source);
    if (read.status === "skipped") {
      await saveSource(db, source, config.id, { status: "skipped", error: read.reason });
      return true;
    }
    const contents = chunkText(read.text).slice(0, MAX_CHUNKS_PER_SOURCE);
    const { embeddings } = await embedMany({
      model: config.model,
      // The lesson / material title gives each chunk its context; only the chunk text is stored.
      values: contents.map((content) => `${source.title}\n${content}`),
      providerOptions: config.options("RETRIEVAL_DOCUMENT"),
      maxParallelCalls: 2,
    });
    await saveSource(db, source, config.id, {
      status: "ready",
      chunks: contents.map((content, i) => ({ content, embedding: normalize(embeddings[i]!) })),
    });
  } catch (error) {
    // Provider errors can carry credentials or source text; keep only messages written for users.
    console.error(`[course-knowledge] indexing ${source.source_key} failed`);
    const message = error instanceof LessonMediaError ? error.message : "Không đọc hoặc nhúng được nội dung, sẽ thử lại sau.";
    await saveSource(db, source, config.id, { status: "failed", error: message });
  }
  return true;
}

export type KnowledgeHit = {
  lessonId: string;
  lessonTitle: string;
  chapter: string;
  sourceTitle: string;
  content: string;
  score: number;
};

/** Search result, or why it returned nothing so callers can tell "not indexed yet" from "nothing relevant". */
export type KnowledgeSearch =
  | { status: "ok"; hits: KnowledgeHit[] }
  | { status: "not_configured" | "not_indexed" | "search_failed" | "no_match" };

/**
 * The course chunks closest to `query`, from published lessons only. There is no similarity threshold, so an
 * indexed course returns its top `limit` chunks whatever their score; "no_match" means it has indexed sources
 * but none of them is in a published lesson (or none has chunks).
 */
export async function searchCourseKnowledge(db: Database, courseId: string, query: string, limit = 5): Promise<KnowledgeSearch> {
  const config = embeddingConfig();
  if (!config) return { status: "not_configured" };
  try {
    const { embedding } = await embed({ model: config.model, value: query, providerOptions: config.options("RETRIEVAL_QUERY") });
    const vector = `{${normalize(embedding).join(",")}}`;
    const result = await db.execute(sql`
      select k.lesson_id, l.title as lesson_title, ch.title as chapter, s.title as source_title, k.content,
        (select sum(a * b) from unnest(k.embedding, ${vector}::real[]) as t(a, b)) as score
      from course_knowledge_chunks k
      join course_knowledge_sources s on s.source_key = k.source_key
      join course_lessons l on l.id = k.lesson_id
      join course_chapters ch on ch.id = l.chapter_id
      where k.course_id = ${courseId} and s.embedding_model = ${config.id} and ch.is_published and l.is_published
      order by score desc
      limit ${limit}
    `);
    if (!result.rows.length) {
      const [indexed] = await db.select({ sourceKey: courseKnowledgeSources.sourceKey }).from(courseKnowledgeSources)
        .where(and(eq(courseKnowledgeSources.courseId, courseId), eq(courseKnowledgeSources.embeddingModel, config.id),
          eq(courseKnowledgeSources.status, "ready")))
        .limit(1);
      return { status: indexed ? "no_match" : "not_indexed" };
    }
    return {
      status: "ok",
      hits: (result.rows as Record<string, unknown>[]).map((row) => ({
        lessonId: String(row.lesson_id),
        lessonTitle: String(row.lesson_title),
        chapter: String(row.chapter),
        sourceTitle: String(row.source_title),
        content: String(row.content),
        score: Number(row.score),
      })),
    };
  } catch {
    console.error("[course-knowledge] search failed");
    return { status: "search_failed" };
  }
}
