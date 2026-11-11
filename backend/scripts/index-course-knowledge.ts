// Indexes every pending course source for the AI Tutor now, instead of waiting for the AI worker's idle ticks.
//
//   npm run index:knowledge -w backend
//
// Safe to re-run: only lessons/materials whose content changed (or that failed over an hour ago) are processed.
// To force one source again, delete its row from course_knowledge_sources.
import { sql } from "drizzle-orm";
import { createDb } from "@codi-1/db";
import { ENV } from "../src/env";
import { embeddingConfig, indexNextKnowledgeSource } from "../src/lib/course-knowledge";

const db = createDb(ENV);
try {
  if (!embeddingConfig()) throw new Error(`No embedding API key for AI_PROVIDER=${ENV.AI_PROVIDER}.`);
  let processed = 0;
  while (await indexNextKnowledgeSource(db)) console.log(`Indexed source ${++processed}`);
  const summary = await db.execute(sql`
    select status, count(*)::int as sources, sum(chunk_count)::int as chunks
    from course_knowledge_sources group by status order by status
  `);
  console.table(summary.rows);
} catch (error) {
  console.error("Indexing failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
